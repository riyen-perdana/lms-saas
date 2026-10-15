// @vitest-environment node
// Test integrasi PIN siswa (US-01) + isolasi antar sekolah.
//
// Fixture dibuat lewat `admin` (DATABASE_URL, superuser); aturan bisnis diuji
// lewat service (DATABASE_APP_URL, kena RLS).

import { randomUUID } from "node:crypto"

import { PrismaPg } from "@prisma/adapter-pg"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { PrismaClient } from "@/generated/prisma/client"

import {
  createAcademicYear,
  createClassroom,
  getActiveSemester,
} from "@/features/academic/service"

import {
  StudentPinError,
  generatePin,
  issuePinsForClassroom,
  issueStudentPin,
  verifyStudentPin,
} from "./service"

const adminUrl = process.env.DATABASE_URL
if (!adminUrl)
  throw new Error("DATABASE_URL belum diisi; test integrasi butuh .env")

const admin = new PrismaClient({
  adapter: new PrismaPg({ connectionString: adminUrl }),
})
const suffix = randomUUID().slice(0, 8)
const ACTOR = { userId: randomUUID(), role: "school_admin" as const }

const YEAR = {
  name: "2026/2027",
  ganjil: { startDate: "2026-07-13", endDate: "2026-12-19" },
  genap: { startDate: "2027-01-04", endDate: "2027-06-26" },
}

let schoolAId: string
let schoolBId: string
let kelasA: string
let kelasB: string
let ani: { id: string; userId: string }
let budi: { id: string; userId: string }
let citraB: { id: string; userId: string }

async function createStudent(
  schoolId: string,
  nis: string,
  name: string,
  opts: { membership?: "active" | "inactive" | "none"; deleted?: boolean } = {}
) {
  const user = await admin.user.create({
    data: {
      email: `${nis}-${randomUUID().slice(0, 6)}-${suffix}@sekolah.invalid`,
      name,
      emailVerified: true,
    },
  })
  const student = await admin.student.create({
    data: {
      schoolId,
      userId: user.id,
      nis,
      deletedAt: opts.deleted ? new Date() : null,
    },
  })
  const membership = opts.membership ?? "active"
  if (membership !== "none") {
    await admin.membership.create({
      data: { schoolId, userId: user.id, role: "student", status: membership },
    })
  }
  return { id: student.id, userId: user.id }
}

async function enroll(schoolId: string, classroomId: string, studentId: string) {
  await admin.enrollment.create({ data: { schoolId, classroomId, studentId } })
}

beforeAll(async () => {
  const [a, b] = await Promise.all([
    admin.school.create({
      data: { slug: `sp-a-${suffix}`, name: "SD Uji A", level: "SD" },
    }),
    admin.school.create({
      data: { slug: `sp-b-${suffix}`, name: "SD Uji B", level: "SD" },
    }),
  ])
  schoolAId = a.id
  schoolBId = b.id

  await createAcademicYear(schoolAId, YEAR)
  const semA = (await getActiveSemester(schoolAId))!
  kelasA = (
    await createClassroom(schoolAId, { semesterId: semA.id, grade: 1, name: "1-A" })
  ).id
  await createAcademicYear(schoolBId, YEAR)
  const semB = (await getActiveSemester(schoolBId))!
  kelasB = (
    await createClassroom(schoolBId, { semesterId: semB.id, grade: 1, name: "1-A" })
  ).id

  ani = await createStudent(schoolAId, "6001", "Ani Lestari")
  budi = await createStudent(schoolAId, "6002", "Budi Hartono")
  // NIS yang sama dengan Ani, tetapi di sekolah lain.
  citraB = await createStudent(schoolBId, "6001", "Citra Dewi")
  await enroll(schoolAId, kelasA, ani.id)
  await enroll(schoolAId, kelasA, budi.id)
  await enroll(schoolBId, kelasB, citraB.id)
})

afterAll(async () => {
  await admin.school.deleteMany({ where: { id: { in: [schoolAId, schoolBId] } } })
  await admin.user.deleteMany({
    where: { email: { endsWith: `-${suffix}@sekolah.invalid` } },
  })
  await admin.$disconnect()
})

describe("generatePin", () => {
  it("6 digit, digit pertama bukan nol", () => {
    for (let i = 0; i < 200; i++) {
      expect(generatePin()).toMatch(/^[1-9]\d{5}$/)
    }
  })
})

describe("issueStudentPin + verifyStudentPin", () => {
  it("membuat PIN yang bisa diverifikasi; hash tersimpan, bukan teks", async () => {
    const { pin } = await issueStudentPin(schoolAId, ACTOR, ani.id)
    expect(pin).toMatch(/^[1-9]\d{5}$/)

    const row = await admin.studentPin.findFirstOrThrow({
      where: { schoolId: schoolAId, studentId: ani.id },
    })
    expect(row.pinHash).not.toContain(pin)
    expect(row.pinHash).not.toBe(pin)

    expect(await verifyStudentPin(schoolAId, "6001", pin)).toEqual({
      userId: ani.userId,
    })
    expect(await verifyStudentPin(schoolAId, "6001", "000000")).toBeNull()
  })

  it("membuat ulang mengganti PIN lama dan mencabut sesi siswa itu saja", async () => {
    const first = await issueStudentPin(schoolAId, ACTOR, ani.id)
    const expiresAt = new Date(Date.now() + 3_600_000)
    await admin.session.create({
      data: { userId: ani.userId, token: `tok-ani-${suffix}`, expiresAt },
    })
    await admin.session.create({
      data: { userId: budi.userId, token: `tok-budi-${suffix}`, expiresAt },
    })

    const second = await issueStudentPin(schoolAId, ACTOR, ani.id)

    expect(await verifyStudentPin(schoolAId, "6001", second.pin)).not.toBeNull()
    if (first.pin !== second.pin) {
      expect(await verifyStudentPin(schoolAId, "6001", first.pin)).toBeNull()
    }
    expect(await admin.session.count({ where: { userId: ani.userId } })).toBe(0)
    expect(await admin.session.count({ where: { userId: budi.userId } })).toBe(1)
  })

  it("mencatat audit tanpa PIN", async () => {
    const { pin } = await issueStudentPin(schoolAId, ACTOR, budi.id)
    const logs = await admin.auditLog.findMany({
      where: { schoolId: schoolAId, action: "student.pin_issue", entityId: budi.id },
    })
    expect(logs.length).toBeGreaterThan(0)
    expect(JSON.stringify(logs)).not.toContain(pin)
    expect(logs[0]).toMatchObject({ entity: "student", actorUserId: ACTOR.userId })
  })

  it("isolasi: siswa sekolah lain NOT_FOUND; NIS sama di dua sekolah tidak tertukar", async () => {
    await expect(
      issueStudentPin(schoolAId, ACTOR, citraB.id)
    ).rejects.toBeInstanceOf(StudentPinError)
    await expect(
      issueStudentPin(schoolAId, ACTOR, randomUUID())
    ).rejects.toMatchObject({ code: "NOT_FOUND" })

    const { pin } = await issueStudentPin(schoolBId, ACTOR, citraB.id)
    expect(await verifyStudentPin(schoolBId, "6001", pin)).toEqual({
      userId: citraB.userId,
    })
    // NIS "6001" di sekolah A adalah Ani; PIN Citra tidak berlaku di sana.
    expect(await verifyStudentPin(schoolAId, "6001", pin)).toBeNull()
  })

  it("NIS tidak dikenal, belum punya PIN, membership tidak aktif, atau siswa dihapus -> null", async () => {
    expect(await verifyStudentPin(schoolAId, "9999", "123456")).toBeNull()

    const tanpaPin = await createStudent(schoolAId, "6101", "Tanpa Pin")
    expect(await verifyStudentPin(schoolAId, "6101", "123456")).toBeNull()

    const nonaktif = await createStudent(schoolAId, "6102", "Nonaktif", {
      membership: "inactive",
    })
    const pinNonaktif = (await issueStudentPin(schoolAId, ACTOR, nonaktif.id)).pin
    expect(await verifyStudentPin(schoolAId, "6102", pinNonaktif)).toBeNull()

    const dihapus = await createStudent(schoolAId, "6103", "Dihapus")
    const pinDihapus = (await issueStudentPin(schoolAId, ACTOR, dihapus.id)).pin
    await admin.student.update({
      where: { id: dihapus.id },
      data: { deletedAt: new Date() },
    })
    expect(await verifyStudentPin(schoolAId, "6103", pinDihapus)).toBeNull()
    expect(tanpaPin.id).toBeTruthy()
  })
})

describe("issuePinsForClassroom", () => {
  it("membuat PIN untuk siswa rombel yang belum punya, melewati yang sudah punya, satu audit tanpa PIN", async () => {
    // Ani dan Budi diberi PIN dulu (test ini tidak boleh bergantung pada urutan
    // test lain); Dina dan Eko adalah siswa baru tanpa PIN.
    await issueStudentPin(schoolAId, ACTOR, ani.id)
    await issueStudentPin(schoolAId, ACTOR, budi.id)
    const dina = await createStudent(schoolAId, "6201", "Dina Aulia")
    const eko = await createStudent(schoolAId, "6202", "Eko Prasetyo")
    await enroll(schoolAId, kelasA, dina.id)
    await enroll(schoolAId, kelasA, eko.id)

    const result = await issuePinsForClassroom(schoolAId, ACTOR, kelasA)

    expect(result.rows.map((row) => row.nis)).toEqual(["6201", "6202"])
    expect(result.rows.map((row) => row.name)).toEqual([
      "Dina Aulia",
      "Eko Prasetyo",
    ])
    expect(result.skipped).toBe(2)
    for (const row of result.rows) {
      expect(row.pin).toMatch(/^[1-9]\d{5}$/)
      expect(await verifyStudentPin(schoolAId, row.nis, row.pin)).not.toBeNull()
    }

    const logs = await admin.auditLog.findMany({
      where: {
        schoolId: schoolAId,
        action: "student.pin_issue_bulk",
        entityId: kelasA,
      },
    })
    expect(logs).toHaveLength(1)
    expect(JSON.stringify(logs)).not.toContain(result.rows[0].pin)
  })

  it("rombel sekolah lain atau tidak dikenal -> NOT_FOUND", async () => {
    await expect(
      issuePinsForClassroom(schoolAId, ACTOR, kelasB)
    ).rejects.toMatchObject({ code: "NOT_FOUND" })
    await expect(
      issuePinsForClassroom(schoolAId, ACTOR, randomUUID())
    ).rejects.toMatchObject({ code: "NOT_FOUND" })
  })
})
