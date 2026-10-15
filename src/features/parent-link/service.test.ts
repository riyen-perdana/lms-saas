// @vitest-environment node
// Test integrasi tautan orang tua (OB-05) + isolasi antar sekolah.
//
// Fixture (siswa, rombel, enrollment, user) dibuat lewat `admin` (DATABASE_URL,
// superuser); aturan bisnis diuji lewat service (DATABASE_APP_URL, kena RLS).

import { randomUUID } from "node:crypto"

import { PrismaPg } from "@prisma/adapter-pg"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { tenantDb } from "@/db/tenant"
import { PrismaClient } from "@/generated/prisma/client"

import {
  createAcademicYear,
  createClassroom,
  getActiveSemester,
} from "@/features/academic/service"

import { joinExistingSchema, joinNewSchema } from "./schema"
import {
  INVITE_TTL_DAYS,
  MAX_LINKS_PER_STUDENT,
  createInvite,
  createInvitesForClassroom,
  formatCode,
  hashCode,
  listChildren,
  listClassroomLinks,
  normalizeCode,
  redeemInvite,
  revokeLink,
} from "./service"

const adminUrl = process.env.DATABASE_URL
if (!adminUrl)
  throw new Error("DATABASE_URL belum diisi; test integrasi butuh .env")

const admin = new PrismaClient({
  adapter: new PrismaPg({ connectionString: adminUrl }),
})
const suffix = randomUUID().slice(0, 8)

const YEAR = {
  name: "2026/2027",
  ganjil: { startDate: "2026-07-13", endDate: "2026-12-19" },
  genap: { startDate: "2027-01-04", endDate: "2027-06-26" },
}

let schoolAId: string
let schoolBId: string
let kelasA: string
let kelasB: string
let ani: string
let budi: string
let citra: string
let doni: string
let siswaB: string

async function createStudent(
  schoolId: string,
  nis: string,
  name: string
): Promise<string> {
  const user = await admin.user.create({
    data: {
      email: `siswa-${nis}-${suffix}-${randomUUID().slice(0, 4)}@sekolah.test`,
      name,
      emailVerified: true,
    },
  })
  return (
    await admin.student.create({ data: { schoolId, userId: user.id, nis } })
  ).id
}

let counter = 0
function parentEmail(label = "ortu"): string {
  counter++
  return `${label}-${counter}-${suffix}@sekolah.test`
}

function newParent(
  overrides: Partial<{ name: string; email: string; password: string }> = {}
) {
  return {
    kind: "new" as const,
    name: "Orang Tua Uji",
    email: parentEmail(),
    password: "sandi-ortu-12345",
    ...overrides,
  }
}

async function linkRows(schoolId: string, studentId: string) {
  return admin.parentLink.findMany({ where: { schoolId, studentId } })
}

beforeAll(async () => {
  const [a, b] = await Promise.all([
    admin.school.create({
      data: { slug: `pl-a-${suffix}`, name: "SMA Uji A", level: "SMA" },
    }),
    admin.school.create({
      data: { slug: `pl-b-${suffix}`, name: "SMA Uji B", level: "SMA" },
    }),
  ])
  schoolAId = a.id
  schoolBId = b.id

  await createAcademicYear(schoolAId, YEAR)
  const semA = (await getActiveSemester(schoolAId))!
  kelasA = (
    await createClassroom(schoolAId, {
      semesterId: semA.id,
      grade: 10,
      name: "X-1",
    })
  ).id
  ani = await createStudent(schoolAId, "5001", "Ani Lestari")
  budi = await createStudent(schoolAId, "5002", "Budi Hartono")
  citra = await createStudent(schoolAId, "5003", "Citra Dewi")
  doni = await createStudent(schoolAId, "5004", "Doni Saputra")
  for (const studentId of [ani, budi, citra, doni]) {
    await admin.enrollment.create({
      data: { schoolId: schoolAId, classroomId: kelasA, studentId },
    })
  }

  await createAcademicYear(schoolBId, YEAR)
  const semB = (await getActiveSemester(schoolBId))!
  kelasB = (
    await createClassroom(schoolBId, {
      semesterId: semB.id,
      grade: 10,
      name: "X-1",
    })
  ).id
  siswaB = await createStudent(schoolBId, "6001", "Siswa Sekolah B")
  await admin.enrollment.create({
    data: { schoolId: schoolBId, classroomId: kelasB, studentId: siswaB },
  })
})

afterAll(async () => {
  await admin.school.deleteMany({
    where: { id: { in: [schoolAId, schoolBId] } },
  })
  await admin.user.deleteMany({ where: { email: { contains: suffix } } })
  await admin.$disconnect()
})

// ---------------------------------------------------------------------------

describe("kode dan skema", () => {
  it("menormalkan kode: huruf besar, tanpa spasi dan tanda hubung", () => {
    expect(normalizeCode("abcd-2345")).toBe("ABCD2345")
    expect(normalizeCode(" ABCD 2345 ")).toBe("ABCD2345")
    expect(formatCode("ABCD2345")).toBe("ABCD-2345")
  })

  it("menolak kode yang bentuknya mustahil (panjang atau huruf terlarang)", () => {
    expect(normalizeCode("ABC")).toBeNull()
    expect(normalizeCode("ABCD-234O")).toBeNull() // O tidak ada di alfabet
    expect(normalizeCode("ABCD-2341")).toBeNull() // 1 tidak ada di alfabet
  })

  it("hash bergantung pada sekolah", () => {
    expect(hashCode(schoolAId, "ABCD2345")).toHaveLength(64)
    expect(hashCode(schoolAId, "ABCD2345")).not.toBe(
      hashCode(schoolBId, "ABCD2345")
    )
  })

  it("skema idempoten dan menolak data tidak valid", () => {
    const once = joinNewSchema.parse({
      code: " ABCD-2345 ",
      name: " Ibu Ani ",
      email: "Ibu@Contoh.ID",
      password: "sandi12345",
    })
    expect(once.email).toBe("ibu@contoh.id")
    expect(joinNewSchema.parse(once)).toEqual(once)
    expect(joinExistingSchema.safeParse({ code: "" }).success).toBe(false)
    expect(
      joinNewSchema.safeParse({ ...once, password: "pendek" }).success
    ).toBe(false)
    expect(
      joinNewSchema.safeParse({ ...once, email: "bukan-email" }).success
    ).toBe(false)
  })
})

describe("membuat kode", () => {
  it("kode berformat XXXX-XXXX, hanya hash yang tersimpan, kedaluwarsa sesuai aturan", async () => {
    const now = new Date("2026-10-15T00:00:00Z")
    const invite = await createInvite(schoolAId, ani, now)

    expect(invite.code).toMatch(/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/)
    expect(invite.expiresAt.getTime()).toBe(
      now.getTime() + INVITE_TTL_DAYS * 86_400_000
    )

    const rows = await linkRows(schoolAId, ani)
    expect(rows).toHaveLength(1)
    expect(rows[0].codeHash).toBe(
      hashCode(schoolAId, normalizeCode(invite.code)!)
    )
    expect(JSON.stringify(rows)).not.toContain(normalizeCode(invite.code)!)
    expect(rows[0].parentUserId).toBeNull()

    await revokeLink(schoolAId, rows[0].id)
  })

  it("menolak siswa yang tidak ada atau milik sekolah lain", async () => {
    await expect(createInvite(schoolAId, randomUUID())).rejects.toMatchObject({
      code: "NOT_FOUND",
    })
    await expect(createInvite(schoolAId, siswaB)).rejects.toMatchObject({
      code: "NOT_FOUND",
    })
  })

  it("membatasi jumlah tautan dan kode aktif per siswa", async () => {
    const ids: string[] = []
    for (let i = 0; i < MAX_LINKS_PER_STUDENT; i++) {
      await createInvite(schoolAId, doni)
    }
    await expect(createInvite(schoolAId, doni)).rejects.toMatchObject({
      code: "LIMIT",
    })

    // Kode yang kedaluwarsa tidak dihitung.
    const later = new Date(Date.now() + (INVITE_TTL_DAYS + 1) * 86_400_000)
    await expect(createInvite(schoolAId, doni, later)).resolves.toBeDefined()

    for (const row of await linkRows(schoolAId, doni))
      if (!row.revokedAt) ids.push(row.id)
    for (const id of ids) await revokeLink(schoolAId, id)
  })

  it("massal per rombel: hanya siswa tanpa tautan/kode, sisanya dilewati", async () => {
    await createInvite(schoolAId, ani) // Ani sudah punya kode menunggu
    const result = await createInvitesForClassroom(schoolAId, kelasA)

    expect(result.skipped).toBe(1)
    expect(result.rows.map((r) => r.name)).toEqual([
      "Budi Hartono",
      "Citra Dewi",
      "Doni Saputra",
    ])
    expect(result.rows[0]).toMatchObject({ nis: "5002" })
    expect(new Set(result.rows.map((r) => r.code)).size).toBe(3)

    // Dijalankan lagi: semua sudah punya kode, tidak ada yang dibuat.
    const again = await createInvitesForClassroom(schoolAId, kelasA)
    expect(again.rows).toHaveLength(0)
    expect(again.skipped).toBe(4)

    for (const studentId of [ani, budi, citra, doni]) {
      for (const row of await linkRows(schoolAId, studentId)) {
        if (!row.revokedAt) await revokeLink(schoolAId, row.id)
      }
    }
  })

  it("massal menolak rombel yang tidak ada atau milik sekolah lain", async () => {
    await expect(
      createInvitesForClassroom(schoolAId, randomUUID())
    ).rejects.toMatchObject({ code: "NOT_FOUND" })
    await expect(
      createInvitesForClassroom(schoolAId, kelasB)
    ).rejects.toMatchObject({ code: "NOT_FOUND" })
  })
})

describe("menukar kode", () => {
  it("akun baru: user, membership parent, dan tautan terbentuk; anak terlihat", async () => {
    const { code } = await createInvite(schoolAId, ani)
    const identity = newParent({ name: "Ibu Ani" })
    const result = await redeemInvite(schoolAId, code, identity)

    expect(result.studentName).toBe("Ani Lestari")
    const membership = await admin.membership.findFirstOrThrow({
      where: { schoolId: schoolAId, userId: result.userId },
    })
    expect(membership.role).toBe("parent")
    const account = await admin.account.findFirstOrThrow({
      where: { userId: result.userId },
    })
    expect(account.password).toBeTruthy()
    expect(account.password).not.toBe(identity.password)

    expect(await listChildren(schoolAId, result.userId)).toEqual([
      { studentId: ani, name: "Ani Lestari", classroomName: "X-1" },
    ])
  })

  it("kode sekali pakai: penukaran kedua ditolak dengan pesan umum", async () => {
    const { code } = await createInvite(schoolAId, budi)
    await redeemInvite(schoolAId, code, newParent())

    const error = await redeemInvite(schoolAId, code, newParent()).catch(
      (e: unknown) => e
    )
    expect(error).toMatchObject({ code: "INVALID_CODE" })
    expect((error as Error).message).toContain(
      "tidak valid atau sudah tidak berlaku"
    )
  })

  it("kode ditulis huruf kecil dan tanpa tanda hubung tetap diterima", async () => {
    const { code } = await createInvite(schoolAId, citra)
    const loose = code.toLowerCase().replace("-", " ")
    await expect(
      redeemInvite(schoolAId, loose, newParent())
    ).resolves.toBeDefined()
  })

  it("kode salah, kedaluwarsa, dan dicabut memberi pesan yang sama", async () => {
    const wrong = await redeemInvite(schoolAId, "ZZZZ-ZZZZ", newParent()).catch(
      (e: unknown) => e
    )
    const malformed = await redeemInvite(schoolAId, "x", newParent()).catch(
      (e: unknown) => e
    )

    const expired = await createInvite(
      schoolAId,
      doni,
      new Date("2020-01-01T00:00:00Z")
    )
    const expiredError = await redeemInvite(
      schoolAId,
      expired.code,
      newParent()
    ).catch((e: unknown) => e)

    const revoked = await createInvite(schoolAId, doni)
    const row = (await linkRows(schoolAId, doni)).find(
      (r) => r.codeHash === hashCode(schoolAId, normalizeCode(revoked.code)!)
    )!
    await revokeLink(schoolAId, row.id)
    const revokedError = await redeemInvite(
      schoolAId,
      revoked.code,
      newParent()
    ).catch((e: unknown) => e)

    for (const error of [wrong, malformed, expiredError, revokedError]) {
      expect(error).toMatchObject({ code: "INVALID_CODE" })
    }
    const messages = new Set(
      [wrong, malformed, expiredError, revokedError].map(
        (e) => (e as Error).message
      )
    )
    expect(messages.size).toBe(1)
  })

  it("penukaran gagal tidak membuat akun setengah jadi", async () => {
    const email = parentEmail("gagal")
    await redeemInvite(schoolAId, "ZZZZ-ZZZZ", newParent({ email })).catch(
      () => undefined
    )
    expect(await admin.user.count({ where: { email } })).toBe(0)
  })

  it("email yang sudah terdaftar ditolak, dan kodenya tetap bisa dipakai", async () => {
    const { code } = await createInvite(schoolAId, doni)
    const email = parentEmail("dobel")
    await redeemInvite(
      schoolAId,
      (await createInvite(schoolAId, doni)).code,
      newParent({ email })
    )

    await expect(
      redeemInvite(schoolAId, code, newParent({ email }))
    ).rejects.toMatchObject({
      code: "EMAIL_TAKEN",
    })
    await expect(
      redeemInvite(schoolAId, code, newParent())
    ).resolves.toBeDefined()
  })

  it("akun yang sudah ada menautkan anak kedua, dan anak sama dua kali ditolak", async () => {
    const first = await redeemInvite(
      schoolAId,
      (await createInvite(schoolAId, ani)).code,
      newParent()
    )
    const existing = { kind: "existing" as const, userId: first.userId }

    const second = await createInvite(schoolAId, budi)
    await redeemInvite(schoolAId, second.code, existing)
    expect(
      (await listChildren(schoolAId, first.userId)).map((c) => c.name).sort()
    ).toEqual(["Ani Lestari", "Budi Hartono"])

    // Kode lain untuk anak yang sama: ditolak, dan kodenya tidak hangus.
    const duplicate = await createInvite(schoolAId, ani)
    await expect(
      redeemInvite(schoolAId, duplicate.code, existing)
    ).rejects.toMatchObject({
      code: "ALREADY_LINKED",
    })
    const pending = (await linkRows(schoolAId, ani)).find(
      (r) => r.codeHash === hashCode(schoolAId, normalizeCode(duplicate.code)!)
    )!
    expect(pending.parentUserId).toBeNull()
  })

  it("akun dengan peran lain di sekolah yang sama ditolak", async () => {
    const user = await admin.user.create({
      data: {
        email: parentEmail("guru"),
        name: "Guru Uji",
        emailVerified: true,
      },
    })
    await admin.membership.create({
      data: { schoolId: schoolAId, userId: user.id, role: "teacher" },
    })

    const { code } = await createInvite(schoolAId, citra)
    await expect(
      redeemInvite(schoolAId, code, { kind: "existing", userId: user.id })
    ).rejects.toMatchObject({ code: "ROLE_CONFLICT" })
  })

  it("dua penukaran bersamaan untuk satu kode: tepat satu yang berhasil", async () => {
    const student = await createStudent(schoolAId, "5100", "Eka Putra")
    await admin.enrollment.create({
      data: { schoolId: schoolAId, classroomId: kelasA, studentId: student },
    })
    const { code } = await createInvite(schoolAId, student)

    const results = await Promise.allSettled([
      redeemInvite(schoolAId, code, newParent()),
      redeemInvite(schoolAId, code, newParent()),
      redeemInvite(schoolAId, code, newParent()),
    ])
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1)
    for (const r of results) {
      if (r.status === "rejected")
        expect(r.reason).toMatchObject({ code: "INVALID_CODE" })
    }
    const linked = (await linkRows(schoolAId, student)).filter(
      (r) => r.parentUserId
    )
    expect(linked).toHaveLength(1)
  })

  it("kode siswa yang sudah dihapus tidak berlaku", async () => {
    const student = await createStudent(schoolAId, "5200", "Fajar Nugroho")
    const { code } = await createInvite(schoolAId, student)
    await admin.student.update({
      where: { id: student },
      data: { deletedAt: new Date() },
    })

    await expect(
      redeemInvite(schoolAId, code, newParent())
    ).rejects.toMatchObject({
      code: "INVALID_CODE",
    })
  })
})

describe("daftar dan pencabutan", () => {
  it("daftar rombel memuat orang tua tertaut dan kode menunggu, tanpa kode asli", async () => {
    const student = await createStudent(schoolAId, "5300", "Gita Permata")
    const room = (await getActiveSemester(schoolAId))!
    const kelas = (
      await createClassroom(schoolAId, {
        semesterId: room.id,
        grade: 10,
        name: "X-9",
      })
    ).id
    await admin.enrollment.create({
      data: { schoolId: schoolAId, classroomId: kelas, studentId: student },
    })

    const a = await createInvite(schoolAId, student)
    await redeemInvite(
      schoolAId,
      a.code,
      newParent({ name: "Ayah Gita", email: parentEmail("ayah") })
    )
    await createInvite(schoolAId, student)

    const [row] = await listClassroomLinks(schoolAId, kelas)
    expect(row).toMatchObject({ nis: "5300", name: "Gita Permata" })
    expect(row.linked).toHaveLength(1)
    expect(row.linked[0].parentName).toBe("Ayah Gita")
    expect(row.pending).toHaveLength(1)
    expect(JSON.stringify(row)).not.toContain(normalizeCode(a.code)!)
  })

  it("mencabut tautan: anak hilang dari orang tua, dan hanya sekali", async () => {
    const student = await createStudent(schoolAId, "5400", "Hana Safitri")
    await admin.enrollment.create({
      data: { schoolId: schoolAId, classroomId: kelasA, studentId: student },
    })
    const { userId } = await redeemInvite(
      schoolAId,
      (await createInvite(schoolAId, student)).code,
      newParent()
    )
    const link = (await linkRows(schoolAId, student)).find(
      (r) => r.parentUserId === userId
    )!

    await revokeLink(schoolAId, link.id)
    expect(await listChildren(schoolAId, userId)).toEqual([])
    await expect(revokeLink(schoolAId, link.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    })
    await expect(revokeLink(schoolAId, randomUUID())).rejects.toMatchObject({
      code: "NOT_FOUND",
    })
  })

  it("orang tua hanya melihat anaknya sendiri", async () => {
    const one = await redeemInvite(
      schoolAId,
      (await createInvite(schoolAId, budi)).code,
      newParent()
    )
    const two = await redeemInvite(
      schoolAId,
      (await createInvite(schoolAId, citra)).code,
      newParent()
    )

    expect(
      (await listChildren(schoolAId, one.userId)).map((c) => c.studentId)
    ).toContain(budi)
    expect(
      (await listChildren(schoolAId, one.userId)).map((c) => c.studentId)
    ).not.toContain(citra)
    expect(
      (await listChildren(schoolAId, two.userId)).map((c) => c.studentId)
    ).not.toContain(budi)
  })
})

describe("isolasi antar sekolah", () => {
  it("kode sekolah A tidak berlaku di sekolah B, dan sebaliknya", async () => {
    const student = await createStudent(schoolAId, "5500", "Indra Wijaya")
    const a = await createInvite(schoolAId, student)
    const b = await createInvite(schoolBId, siswaB)

    await expect(
      redeemInvite(schoolBId, a.code, newParent())
    ).rejects.toMatchObject({ code: "INVALID_CODE" })
    await expect(
      redeemInvite(schoolAId, b.code, newParent())
    ).rejects.toMatchObject({ code: "INVALID_CODE" })
    // Kode tetap utuh setelah dicoba di sekolah yang salah.
    await expect(
      redeemInvite(schoolAId, a.code, newParent())
    ).resolves.toBeDefined()
  })

  it("sekolah B tidak bisa mencabut atau melihat tautan sekolah A", async () => {
    await createInvite(schoolAId, ani)
    const link = (await linkRows(schoolAId, ani)).find(
      (r) => r.revokedAt === null
    )!
    await expect(revokeLink(schoolBId, link.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    })
    await expect(listClassroomLinks(schoolBId, kelasA)).rejects.toMatchObject({
      code: "NOT_FOUND",
    })
    expect(
      (await linkRows(schoolAId, ani)).find((r) => r.id === link.id)!.revokedAt
    ).toBeNull()
  })

  it("orang tua sekolah A tidak melihat anak apa pun di sekolah B", async () => {
    const parent = await redeemInvite(
      schoolAId,
      (await createInvite(schoolAId, ani)).code,
      newParent()
    )
    expect(await listChildren(schoolBId, parent.userId)).toEqual([])
  })

  it("RLS: tanpa konteks tenant, parent_links tidak terlihat sama sekali", async () => {
    const { prisma } = await import("@/db/client")
    expect(await prisma.parentLink.count()).toBe(0)
  })

  it("RLS: sekolah lain tidak bisa menyisipkan baris atas nama sekolah ini", async () => {
    await expect(
      tenantDb(
        schoolBId,
        (db) =>
          db.$executeRaw`INSERT INTO parent_links (id, school_id, student_id, code_hash, code_expires_at, updated_at)
                       VALUES (gen_random_uuid(), ${schoolAId}::uuid, ${ani}::uuid, 'x', now(), now())`
      )
    ).rejects.toThrow()
  })
})
