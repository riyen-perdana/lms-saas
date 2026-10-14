// @vitest-environment node
// Test integrasi data master akademik + isolasi antar sekolah (PRD §5.2, §7).

import { randomUUID } from "node:crypto"

import { PrismaPg } from "@prisma/adapter-pg"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { tenantDb } from "@/db/tenant"
import { PrismaClient } from "@/generated/prisma/client"

import {
  AcademicError,
  activateSemester,
  createAcademicYear,
  createClassroom,
  createMajor,
  createSubject,
  getActiveSemester,
  listAcademicYears,
  listClassrooms,
  listMajors,
  listSubjects,
  removeClassroom,
  removeMajor,
  removeSubject,
} from "./service"
import { academicYearSchema, classroomSchema, majorSchema, subjectSchema } from "./schema"

const adminUrl = process.env.DATABASE_URL
if (!adminUrl) throw new Error("DATABASE_URL belum diisi; test integrasi butuh .env")

const admin = new PrismaClient({ adapter: new PrismaPg({ connectionString: adminUrl }) })
const suffix = randomUUID().slice(0, 8)

let smaId: string
let smkId: string

const YEAR = {
  name: "2026/2027",
  ganjil: { startDate: "2026-07-13", endDate: "2026-12-19" },
  genap: { startDate: "2027-01-04", endDate: "2027-06-26" },
}

beforeAll(async () => {
  const [sma, smk] = await Promise.all([
    admin.school.create({ data: { slug: `aka-a-${suffix}`, name: "SMA Uji", level: "SMA" } }),
    admin.school.create({ data: { slug: `aka-b-${suffix}`, name: "SMK Uji", level: "SMK" } }),
  ])
  smaId = sma.id
  smkId = smk.id
})

afterAll(async () => {
  await admin.school.deleteMany({ where: { id: { in: [smaId, smkId] } } })
  await admin.$disconnect()
})

describe("skema validasi", () => {
  it("tahun ajaran: format nama dan urutan tanggal", () => {
    expect(academicYearSchema.safeParse(YEAR).success).toBe(true)
    expect(academicYearSchema.safeParse({ ...YEAR, name: "2026" }).success).toBe(false)
    expect(
      academicYearSchema.safeParse({
        ...YEAR,
        genap: { startDate: "2026-12-01", endDate: "2027-06-26" },
      }).success
    ).toBe(false)
    expect(
      academicYearSchema.safeParse({
        ...YEAR,
        ganjil: { startDate: "2026-12-19", endDate: "2026-07-13" },
      }).success
    ).toBe(false)
  })

  it("kode jurusan dan mapel dinormalkan ke huruf besar", () => {
    expect(majorSchema.parse({ code: " tkj ", name: "Teknik Komputer" }).code).toBe("TKJ")
    expect(subjectSchema.parse({ code: "mtk", name: "Matematika" }).group).toBe("umum")
  })

  it("rombel: tingkat 1–12 dan idempoten", () => {
    const input = { semesterId: randomUUID(), grade: 10, name: "X-1" }
    const once = classroomSchema.parse(input)
    expect(classroomSchema.parse(once)).toEqual(once)
    expect(classroomSchema.safeParse({ ...input, grade: 13 }).success).toBe(false)
  })
})

describe("tahun ajaran & semester", () => {
  it("tahun pertama otomatis aktif dengan semester ganjil aktif", async () => {
    await createAcademicYear(smaId, YEAR)

    const active = await getActiveSemester(smaId)
    expect(active?.name).toBe("Ganjil")
    expect(active?.academicYear.name).toBe("2026/2027")

    const [year] = await listAcademicYears(smaId)
    expect(year.isActive).toBe(true)
    expect(year.semesters.map((s) => s.name)).toEqual(["Ganjil", "Genap"])
  })

  it("tahun kedua tidak aktif otomatis; nama ganda ditolak", async () => {
    await createAcademicYear(smaId, {
      name: "2027/2028",
      ganjil: { startDate: "2027-07-12", endDate: "2027-12-18" },
      genap: { startDate: "2028-01-03", endDate: "2028-06-24" },
    })
    const years = await listAcademicYears(smaId)
    expect(years.filter((y) => y.isActive)).toHaveLength(1)

    await expect(createAcademicYear(smaId, YEAR)).rejects.toMatchObject({
      code: "DUPLICATE",
    })
  })

  it("mengaktifkan semester memindahkan status aktif (tepat satu)", async () => {
    const years = await listAcademicYears(smaId)
    const target = years.find((y) => y.name === "2027/2028")!.semesters[1]

    await activateSemester(smaId, target.id)

    const after = await listAcademicYears(smaId)
    const activeSemesters = after.flatMap((y) => y.semesters).filter((s) => s.isActive)
    expect(activeSemesters.map((s) => s.id)).toEqual([target.id])
    expect(after.filter((y) => y.isActive).map((y) => y.name)).toEqual(["2027/2028"])
  })

  it("semester yang tidak ada ditolak", async () => {
    await expect(activateSemester(smaId, randomUUID())).rejects.toMatchObject({
      code: "NOT_FOUND",
    })
  })
})

describe("jurusan", () => {
  it("hanya untuk SMK", async () => {
    await expect(createMajor(smaId, { code: "TKJ", name: "Teknik Jaringan" })).rejects.toMatchObject({
      code: "INVALID",
    })
  })

  it("SMK: tambah, daftar, kode ganda ditolak, hapus lalu kode bisa dipakai lagi", async () => {
    const major = await createMajor(smkId, { code: "TKJ", name: "Teknik Komputer dan Jaringan" })
    expect((await listMajors(smkId)).map((m) => m.code)).toEqual(["TKJ"])

    await expect(
      createMajor(smkId, { code: "tkj", name: "Duplikat" })
    ).rejects.toMatchObject({ code: "DUPLICATE" })

    await removeMajor(smkId, major.id)
    expect(await listMajors(smkId)).toHaveLength(0)
    await expect(createMajor(smkId, { code: "TKJ", name: "Baru" })).resolves.toBeDefined()
  })
})

describe("rombel", () => {
  it("tingkat harus sesuai jenjang", async () => {
    const semester = (await getActiveSemester(smaId))!
    await expect(
      createClassroom(smaId, { semesterId: semester.id, grade: 5, name: "V-A" })
    ).rejects.toMatchObject({ code: "INVALID" })
  })

  it("tambah, daftar terurut, nama ganda per semester ditolak, hapus", async () => {
    const semester = (await getActiveSemester(smaId))!
    const x2 = await createClassroom(smaId, { semesterId: semester.id, grade: 10, name: "X-2" })
    await createClassroom(smaId, { semesterId: semester.id, grade: 10, name: "X-1" })
    await createClassroom(smaId, { semesterId: semester.id, grade: 11, name: "XI-1" })

    const rows = await listClassrooms(smaId, semester.id)
    expect(rows.map((r) => r.name)).toEqual(["X-1", "X-2", "XI-1"])

    await expect(
      createClassroom(smaId, { semesterId: semester.id, grade: 10, name: "x-2" })
    ).rejects.toMatchObject({ code: "DUPLICATE" })

    await removeClassroom(smaId, x2.id)
    expect((await listClassrooms(smaId, semester.id)).map((r) => r.name)).toEqual(["X-1", "XI-1"])
    await expect(removeClassroom(smaId, x2.id)).rejects.toMatchObject({ code: "NOT_FOUND" })
  })

  it("jurusan yang masih dipakai rombel tidak bisa dihapus", async () => {
    await createAcademicYear(smkId, YEAR)
    const semester = (await getActiveSemester(smkId))!
    const [major] = await listMajors(smkId)

    await createClassroom(smkId, { semesterId: semester.id, grade: 10, majorId: major.id, name: "X TKJ 1" })
    await expect(removeMajor(smkId, major.id)).rejects.toMatchObject({ code: "INVALID" })
  })
})

describe("mapel", () => {
  it("tambah, kode ganda ditolak, hapus", async () => {
    const subject = await createSubject(smaId, { code: "MTK", name: "Matematika", group: "umum" })
    await expect(
      createSubject(smaId, { code: "mtk", name: "Lain", group: "umum" })
    ).rejects.toMatchObject({ code: "DUPLICATE" })
    expect((await listSubjects(smaId)).map((s) => s.code)).toEqual(["MTK"])

    await removeSubject(smaId, subject.id)
    expect(await listSubjects(smaId)).toHaveLength(0)
    await expect(removeSubject(smaId, subject.id)).rejects.toBeInstanceOf(AcademicError)
  })
})

describe("isolasi antar sekolah", () => {
  it("sekolah lain tidak melihat data master sekolah ini", async () => {
    await createSubject(smaId, { code: "BIN", name: "Bahasa Indonesia", group: "umum" })

    expect((await listSubjects(smkId)).map((s) => s.code)).not.toContain("BIN")
    expect((await listAcademicYears(smkId)).map((y) => y.id)).not.toContain(
      (await listAcademicYears(smaId))[0].id
    )
  })

  it("tidak bisa memakai semester sekolah lain untuk membuat rombel", async () => {
    const foreign = (await getActiveSemester(smaId))!
    await expect(
      createClassroom(smkId, { semesterId: foreign.id, grade: 10, name: "X Asing" })
    ).rejects.toMatchObject({ code: "NOT_FOUND" })
  })

  it("tidak bisa menghapus atau mengaktifkan data sekolah lain", async () => {
    const [subject] = await listSubjects(smaId)
    await expect(removeSubject(smkId, subject.id)).rejects.toMatchObject({ code: "NOT_FOUND" })

    const foreign = (await getActiveSemester(smaId))!
    await expect(activateSemester(smkId, foreign.id)).rejects.toMatchObject({ code: "NOT_FOUND" })
  })

  it("RLS: tanpa konteks tenant, tabel tidak terlihat sama sekali", async () => {
    const { prisma } = await import("@/db/client")
    expect(await prisma.subject.count()).toBe(0)
    expect(await prisma.academicYear.count()).toBe(0)
    expect(await prisma.classroom.count()).toBe(0)
  })

  it("RLS: sekolah lain tidak bisa menyisipkan baris atas nama sekolah ini", async () => {
    await expect(
      tenantDb(smkId, (db) =>
        db.$executeRaw`INSERT INTO subjects (id, school_id, code, name, "group", updated_at)
                       VALUES (gen_random_uuid(), ${smaId}::uuid, 'X', 'Curang', 'umum', now())`
      )
    ).rejects.toThrow()
  })
})
