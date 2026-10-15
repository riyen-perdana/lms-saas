// @vitest-environment node
// Test integrasi kenaikan kelas (OB-04) + isolasi antar sekolah.
//
// Fixture (guru/siswa/enrollment) dibuat lewat `admin` (DATABASE_URL,
// superuser) karena tabel users global; aturan bisnis diuji lewat service,
// yang selalu memakai DATABASE_APP_URL (role yang kena RLS).

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
import { createCourse, setHomeroomTeacher } from "@/features/teaching-assignment/service"

import { rolloverPreviewSchema, rolloverSchema } from "./schema"
import {
  getRolloverBoard,
  previewRollover,
  runRollover,
  suggestClassroomName,
} from "./service"

const adminUrl = process.env.DATABASE_URL
if (!adminUrl) throw new Error("DATABASE_URL belum diisi; test integrasi butuh .env")

const admin = new PrismaClient({ adapter: new PrismaPg({ connectionString: adminUrl }) })
const suffix = randomUUID().slice(0, 8)

const YEAR = {
  name: "2026/2027",
  ganjil: { startDate: "2026-07-13", endDate: "2026-12-19" },
  genap: { startDate: "2027-01-04", endDate: "2027-06-26" },
}
const NEXT_YEAR = {
  name: "2027/2028",
  ganjil: { startDate: "2027-07-12", endDate: "2027-12-18" },
  genap: { startDate: "2028-01-03", endDate: "2028-06-24" },
}

let schoolAId: string
let schoolBId: string

let ganjilId: string
let genapId: string
let nextGanjilId: string
let nextGenapId: string
let kelasX1: string
let kelasXI1: string
let kelasXII1: string
let kelasKosong: string
let siswa: string[] = []
let guruSatu: string
let mapelId: string

let schoolBGanjil: string
let schoolBGenap: string

async function createStudent(schoolId: string, nis: string): Promise<string> {
  const user = await admin.user.create({
    data: {
      email: `siswa-${nis}-${suffix}-${randomUUID().slice(0, 4)}@sekolah.test`,
      name: `Siswa ${nis}`,
      emailVerified: true,
    },
  })
  const student = await admin.student.create({ data: { schoolId, userId: user.id, nis } })
  return student.id
}

async function enroll(schoolId: string, classroomId: string, studentId: string) {
  await admin.enrollment.create({ data: { schoolId, classroomId, studentId } })
}

async function semesterIds(schoolId: string, yearName: string) {
  const rows = await tenantDb(schoolId, (db) =>
    db.semester.findMany({
      where: { academicYear: { name: yearName } },
      orderBy: { startDate: "asc" },
    })
  )
  return { ganjil: rows[0].id, genap: rows[1].id }
}

beforeAll(async () => {
  const [a, b] = await Promise.all([
    admin.school.create({ data: { slug: `yr-a-${suffix}`, name: "SMA Uji A", level: "SMA" } }),
    admin.school.create({ data: { slug: `yr-b-${suffix}`, name: "SMA Uji B", level: "SMA" } }),
  ])
  schoolAId = a.id
  schoolBId = b.id

  await createAcademicYear(schoolAId, YEAR)
  await createAcademicYear(schoolAId, NEXT_YEAR)
  const current = await semesterIds(schoolAId, YEAR.name)
  const next = await semesterIds(schoolAId, NEXT_YEAR.name)
  ganjilId = current.ganjil
  genapId = current.genap
  nextGanjilId = next.ganjil
  nextGenapId = next.genap

  kelasX1 = (await createClassroom(schoolAId, { semesterId: ganjilId, grade: 10, name: "X-1" })).id
  kelasXI1 = (await createClassroom(schoolAId, { semesterId: ganjilId, grade: 11, name: "XI-1" })).id
  kelasXII1 = (await createClassroom(schoolAId, { semesterId: ganjilId, grade: 12, name: "XII-1" })).id
  kelasKosong = (await createClassroom(schoolAId, { semesterId: ganjilId, grade: 10, name: "X-2" })).id

  siswa = [
    await createStudent(schoolAId, "1001"),
    await createStudent(schoolAId, "1002"),
    await createStudent(schoolAId, "1003"),
    await createStudent(schoolAId, "1004"),
  ]
  await enroll(schoolAId, kelasX1, siswa[0])
  await enroll(schoolAId, kelasX1, siswa[1])
  await enroll(schoolAId, kelasXI1, siswa[2])
  await enroll(schoolAId, kelasXII1, siswa[3])

  // Guru + wali + kelas pembelajaran di semester sumber: tidak boleh ikut disalin.
  const user = await admin.user.create({
    data: { email: `guru-${suffix}@sekolah.test`, name: "Guru Satu", emailVerified: true },
  })
  guruSatu = (await admin.teacher.create({ data: { schoolId: schoolAId, userId: user.id, code: "G-1" } })).id
  mapelId = (await admin.subject.create({ data: { schoolId: schoolAId, code: "MTK", name: "Matematika" } })).id
  await setHomeroomTeacher(schoolAId, { classroomId: kelasX1, teacherId: guruSatu })
  await createCourse(schoolAId, {
    semesterId: ganjilId,
    classroomId: kelasX1,
    subjectId: mapelId,
    teacherId: guruSatu,
  })

  await createAcademicYear(schoolBId, YEAR)
  const activeB = (await getActiveSemester(schoolBId))!
  schoolBGanjil = activeB.id
  schoolBGenap = (await semesterIds(schoolBId, YEAR.name)).genap
  const kelasB = await createClassroom(schoolBId, { semesterId: schoolBGanjil, grade: 10, name: "X-1" })
  await enroll(schoolBId, kelasB.id, await createStudent(schoolBId, "2001"))
})

afterAll(async () => {
  await admin.school.deleteMany({ where: { id: { in: [schoolAId, schoolBId] } } })
  await admin.user.deleteMany({ where: { email: { contains: suffix } } })
  await admin.$disconnect()
})

function promote(overrides: Record<string, unknown> = {}) {
  return {
    sourceSemesterId: genapId,
    targetSemesterId: nextGanjilId,
    mode: "promote" as const,
    names: {},
    ...overrides,
  }
}

async function roomsOf(schoolId: string, semesterId: string) {
  return tenantDb(schoolId, (db) =>
    db.classroom.findMany({
      where: { semesterId, deletedAt: null },
      orderBy: [{ grade: "asc" }, { name: "asc" }],
      include: { enrollments: true },
    })
  )
}

// ---------------------------------------------------------------------------

describe("usulan nama rombel", () => {
  it("mengganti angka atau romawi tingkat di awal nama saja", () => {
    expect(suggestClassroomName("X-1", 10, 11)).toBe("XI-1")
    expect(suggestClassroomName("XI IPA 2", 11, 12)).toBe("XII IPA 2")
    expect(suggestClassroomName("7A", 7, 8)).toBe("8A")
    expect(suggestClassroomName("IX-3", 9, 10)).toBe("X-3")
  })

  it("tidak menebak bila awal nama bukan tingkatnya", () => {
    expect(suggestClassroomName("Unggulan", 10, 11)).toBe("Unggulan")
    expect(suggestClassroomName("XII-1", 11, 12)).toBe("XII-1")
    expect(suggestClassroomName("X-1", 10, 10)).toBe("X-1")
  })
})

describe("skema validasi", () => {
  it("idempoten dan menolak id bukan uuid", () => {
    const data = promote({ names: { [kelasXI1]: "  XII-1  " } })
    const once = rolloverSchema.parse(data)
    expect(rolloverSchema.parse(once)).toEqual(once)
    expect(rolloverPreviewSchema.safeParse({ ...data, sourceSemesterId: "x" }).success).toBe(false)
    expect(rolloverSchema.safeParse({ ...data, mode: "lain" }).success).toBe(false)
  })
})

describe("papan semester", () => {
  it("memuat tahun ajaran, semester, dan jumlah rombel", async () => {
    const years = await getRolloverBoard(schoolAId)
    expect(years.map((y) => y.name)).toEqual(["2027/2028", "2026/2027"])
    const ganjil = years[1].semesters.find((s) => s.id === ganjilId)!
    expect(ganjil.classroomCount).toBe(4)
    expect(years[0].semesters.every((s) => s.classroomCount === 0)).toBe(true)
  })
})

describe("pratinjau", () => {
  it("naik tingkat: usulan tingkat dan nama, tingkat tertinggi lulus", async () => {
    const { rows, blocked } = await previewRollover(schoolAId, promote({ sourceSemesterId: ganjilId }))
    expect(blocked).toBeNull()
    const byName = Object.fromEntries(rows.map((r) => [r.name, r]))
    expect(byName["X-1"]).toMatchObject({ studentCount: 2, targetGrade: 11, suggestedName: "XI-1" })
    expect(byName["X-2"]).toMatchObject({ studentCount: 0, targetGrade: 11 })
    expect(byName["XI-1"]).toMatchObject({ studentCount: 1, targetGrade: 12 })
    expect(byName["XII-1"]).toMatchObject({ studentCount: 1, targetGrade: null, suggestedName: null })
  })

  it("tingkat tetap: tingkat dan nama sama", async () => {
    const { rows } = await previewRollover(
      schoolAId,
      promote({ sourceSemesterId: ganjilId, targetSemesterId: genapId, mode: "same" })
    )
    expect(rows.find((r) => r.name === "XII-1")).toMatchObject({ targetGrade: 12, suggestedName: "XII-1" })
  })

  it("diblokir bila sumber kosong atau tujuan tidak setelah sumber", async () => {
    expect((await previewRollover(schoolAId, promote())).blocked).toMatch(/belum punya rombel/)
    expect(
      (await previewRollover(schoolAId, promote({ sourceSemesterId: genapId, targetSemesterId: ganjilId })))
        .blocked
    ).toMatch(/setelah semester sumber/)
  })

  it("menolak semester yang sama atau tidak ada", async () => {
    await expect(
      previewRollover(schoolAId, promote({ targetSemesterId: genapId }))
    ).rejects.toMatchObject({ code: "INVALID" })
    await expect(
      previewRollover(schoolAId, promote({ targetSemesterId: randomUUID() }))
    ).rejects.toMatchObject({ code: "NOT_FOUND" })
  })
})

describe("menjalankan kenaikan", () => {
  it("menolak nama tujuan kembar tanpa menulis apa pun", async () => {
    await expect(
      runRollover(
        schoolAId,
        promote({
          sourceSemesterId: ganjilId,
          names: { [kelasX1]: "XI-1", [kelasKosong]: "xi-1" },
        })
      )
    ).rejects.toMatchObject({ code: "DUPLICATE" })
    expect(await roomsOf(schoolAId, nextGanjilId)).toHaveLength(0)
  })

  it("naik tingkat: rombel dan siswa pindah, yang tertinggi lulus", async () => {
    const result = await runRollover(
      schoolAId,
      promote({ sourceSemesterId: ganjilId, names: { [kelasXI1]: "XII Unggulan" } })
    )
    expect(result).toEqual({ classroomsCreated: 3, studentsMoved: 3, graduated: 1 })

    const rooms = await roomsOf(schoolAId, nextGanjilId)
    expect(rooms.map((r) => [r.name, r.grade, r.enrollments.length])).toEqual([
      ["XI-1", 11, 2],
      ["XI-2", 11, 0],
      ["XII Unggulan", 12, 1],
    ])
    // Wali kelas dan kelas pembelajaran tidak ikut disalin.
    expect(rooms.every((r) => r.homeroomTeacherId === null)).toBe(true)
    const courses = await tenantDb(schoolAId, (db) =>
      db.course.count({ where: { semesterId: nextGanjilId } })
    )
    expect(courses).toBe(0)
  })

  it("rombel dan enrollment lama tetap utuh (arsip)", async () => {
    const old = await roomsOf(schoolAId, ganjilId)
    expect(old.map((r) => [r.name, r.enrollments.length])).toEqual([
      ["X-1", 2],
      ["X-2", 0],
      ["XI-1", 1],
      ["XII-1", 1],
    ])
    expect(old.find((r) => r.name === "X-1")!.homeroomTeacherId).toBe(guruSatu)
  })

  it("menjalankan lagi untuk semester tujuan yang sama ditolak", async () => {
    await expect(
      runRollover(schoolAId, promote({ sourceSemesterId: ganjilId }))
    ).rejects.toMatchObject({ code: "INVALID", message: expect.stringContaining("sudah punya") })
    expect(await roomsOf(schoolAId, nextGanjilId)).toHaveLength(3)
  })

  it("tingkat tetap menyalin jurusan dan tidak meluluskan siapa pun", async () => {
    // Jurusan hanya dibuat via service untuk SMK; fixture ini sengaja langsung.
    const major = await admin.major.create({
      data: { schoolId: schoolAId, code: "TKJ", name: "Teknik Komputer" },
    })
    const room = await createClassroom(schoolAId, {
      semesterId: nextGanjilId,
      grade: 12,
      majorId: major.id,
      name: "XII TKJ",
    })
    const student = await createStudent(schoolAId, "1005")
    await enroll(schoolAId, room.id, student)

    const result = await runRollover(
      schoolAId,
      promote({ sourceSemesterId: nextGanjilId, targetSemesterId: nextGenapId, mode: "same" })
    )
    expect(result.graduated).toBe(0)
    const genap = await roomsOf(schoolAId, nextGenapId)
    const tkj = genap.find((r) => r.name === "XII TKJ")!
    expect(tkj.majorId).toBe(major.id)
    expect(tkj.enrollments).toHaveLength(1)
  })

  it("siswa yang sudah dihapus tidak ikut dipindahkan", async () => {
    const status = await tenantDb(schoolAId, (db) =>
      db.student.updateMany({ where: { id: siswa[0] }, data: { deletedAt: new Date() } })
    )
    expect(status.count).toBe(1)
    const { rows } = await previewRollover(
      schoolAId,
      promote({ sourceSemesterId: ganjilId, targetSemesterId: genapId, mode: "same" })
    )
    expect(rows.find((r) => r.name === "X-1")!.studentCount).toBe(1)
  })
})

describe("isolasi antar sekolah", () => {
  it("sekolah B tidak bisa memakai semester sekolah A", async () => {
    await expect(
      previewRollover(schoolBId, {
        sourceSemesterId: ganjilId,
        targetSemesterId: schoolBGenap,
        mode: "same",
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" })
    await expect(
      runRollover(schoolBId, {
        sourceSemesterId: schoolBGanjil,
        targetSemesterId: nextGenapId,
        mode: "same",
        names: {},
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" })
  })

  it("papan sekolah B tidak memuat data sekolah A, dan kenaikan B tidak mengubah A", async () => {
    const before = await roomsOf(schoolAId, genapId)
    const board = await getRolloverBoard(schoolBId)
    expect(board).toHaveLength(1)
    expect(board[0].semesters.reduce((n, s) => n + s.classroomCount, 0)).toBe(1)

    const result = await runRollover(schoolBId, {
      sourceSemesterId: schoolBGanjil,
      targetSemesterId: schoolBGenap,
      mode: "same",
      names: {},
    })
    expect(result).toMatchObject({ classroomsCreated: 1, studentsMoved: 1 })
    expect(await roomsOf(schoolAId, genapId)).toHaveLength(before.length)
  })
})
