// @vitest-environment node
// Test integrasi penugasan guru (OB-03) + isolasi antar sekolah (PRD §5.2, §7).
//
// Fixture dibuat lewat `admin` (DATABASE_URL, superuser) karena tabel `users`
// global dan tabel tenant tidak punya jalan create di luar modul asalnya
// (guru hanya bisa dibuat lewat impor OB-02). Pengujian aturan bisnis sendiri
// lewat service, yang selalu memakai DATABASE_APP_URL (role yang kena RLS).

import { randomUUID } from "node:crypto"

import { PrismaPg } from "@prisma/adapter-pg"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { tenantDb } from "@/db/tenant"
import { PrismaClient } from "@/generated/prisma/client"

import {
  createAcademicYear,
  createClassroom,
  createSubject,
  getActiveSemester,
} from "@/features/academic/service"

import { courseSchema, homeroomSchema } from "./schema"
import {
  TeachingError,
  clearHomeroomTeacher,
  createCourse,
  getAssignmentBoard,
  removeCourse,
  setHomeroomTeacher,
} from "./service"

const adminUrl = process.env.DATABASE_URL
if (!adminUrl) throw new Error("DATABASE_URL belum diisi; test integrasi butuh .env")

const admin = new PrismaClient({ adapter: new PrismaPg({ connectionString: adminUrl }) })
const suffix = randomUUID().slice(0, 8)
const ACTOR = { userId: randomUUID(), role: "school_admin" as const }

const YEAR = {
  name: "2026/2027",
  ganjil: { startDate: "2026-07-13", endDate: "2026-12-19" },
  genap: { startDate: "2027-01-04", endDate: "2027-06-26" },
}

let schoolAId: string
let schoolBId: string

// Sekolah A
let ganjilId: string
let genapId: string
let kelasX1: string
let kelasX2: string
let kelasGenapX1: string
let mapelMtk: string
let mapelBindo: string
let guruSatu: string
let guruDua: string
let guruTiga: string

// Sekolah B
let kelasBX1: string
let mapelBMtk: string
let guruB: string

async function createTeacher(schoolId: string, code: string, name: string): Promise<string> {
  // Email global harus unik walau kode guru sama di sekolah berbeda.
  const email = `guru-${code}-${suffix}-${randomUUID().slice(0, 4)}@sekolah.test`
  const user = await admin.user.create({
    data: { email, name, emailVerified: true },
  })
  const teacher = await admin.teacher.create({
    data: { schoolId, userId: user.id, code },
  })
  return teacher.id
}

beforeAll(async () => {
  const [a, b] = await Promise.all([
    admin.school.create({ data: { slug: `ta-a-${suffix}`, name: "SMA Uji A", level: "SMA" } }),
    admin.school.create({ data: { slug: `ta-b-${suffix}`, name: "SMA Uji B", level: "SMA" } }),
  ])
  schoolAId = a.id
  schoolBId = b.id

  await createAcademicYear(schoolAId, YEAR)
  const active = (await getActiveSemester(schoolAId))!
  ganjilId = active.id
  genapId = (
    await tenantDb(schoolAId, (db) =>
      db.semester.findFirstOrThrow({ where: { name: "Genap" } })
    )
  ).id

  kelasX1 = (await createClassroom(schoolAId, { semesterId: ganjilId, grade: 10, name: "X-1" })).id
  kelasX2 = (await createClassroom(schoolAId, { semesterId: ganjilId, grade: 11, name: "XI-1" })).id
  kelasGenapX1 = (
    await createClassroom(schoolAId, { semesterId: genapId, grade: 10, name: "X-1" })
  ).id

  mapelMtk = (await createSubject(schoolAId, { code: "MTK", name: "Matematika", group: "umum" })).id
  mapelBindo = (
    await createSubject(schoolAId, { code: "BIN", name: "Bahasa Indonesia", group: "umum" })
  ).id

  guruSatu = await createTeacher(schoolAId, "G-001", "Hendra Wijaya")
  guruDua = await createTeacher(schoolAId, "G-002", "Siti Aminah")
  guruTiga = await createTeacher(schoolAId, "G-003", "Budi Santoso")

  await createAcademicYear(schoolBId, YEAR)
  const activeB = (await getActiveSemester(schoolBId))!
  kelasBX1 = (await createClassroom(schoolBId, { semesterId: activeB.id, grade: 10, name: "X-1" })).id
  mapelBMtk = (await createSubject(schoolBId, { code: "MTK", name: "Matematika", group: "umum" })).id
  guruB = await createTeacher(schoolBId, "G-001", "Guru Sekolah B")
})

afterAll(async () => {
  await admin.school.deleteMany({ where: { id: { in: [schoolAId, schoolBId] } } })
  // User global tidak ikut terhapus bersama sekolah; hapus sisa fixture.
  await admin.user.deleteMany({ where: { email: { contains: suffix } } })
  await admin.$disconnect()
})

function input(overrides: Partial<Parameters<typeof createCourse>[1]> = {}) {
  return {
    semesterId: ganjilId,
    classroomId: kelasX1,
    subjectId: mapelMtk,
    teacherId: guruSatu,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------

function listCourses(schoolId: string, semesterId: string, classroomId?: string) {
  return tenantDb(schoolId, (db) =>
    db.course.findMany({
      where: { semesterId, deletedAt: null, ...(classroomId ? { classroomId } : {}) },
      select: { id: true, classroomId: true, subjectId: true, teacherId: true },
    })
  )
}

async function listHomerooms(schoolId: string, semesterId: string) {
  const rooms = await tenantDb(schoolId, (db) =>
    db.classroom.findMany({
      where: { semesterId, deletedAt: null, homeroomTeacherId: { not: null } },
      select: { id: true, homeroomTeacherId: true },
    })
  )
  return rooms.map((r) => ({ classroomId: r.id, teacherId: r.homeroomTeacherId }))
}

describe("skema validasi", () => {
  it("kelas pembelajaran idempoten dan menolak id bukan uuid", () => {
    const data = {
      semesterId: randomUUID(),
      classroomId: randomUUID(),
      subjectId: randomUUID(),
      teacherId: randomUUID(),
    }
    const once = courseSchema.parse(data)
    expect(courseSchema.parse(once)).toEqual(once)
    expect(courseSchema.safeParse({ ...data, teacherId: "bukan-uuid" }).success).toBe(false)
  })

  it("penetapan wali kelas idempoten", () => {
    const data = { classroomId: randomUUID(), teacherId: randomUUID() }
    const once = homeroomSchema.parse(data)
    expect(homeroomSchema.parse(once)).toEqual(once)
    expect(homeroomSchema.safeParse({ ...data, classroomId: "" }).success).toBe(false)
  })
})

describe("papan penugasan", () => {
  it("memuat guru terurut nama lengkap (dari users) dan kode guru", async () => {
    const board = await getAssignmentBoard(schoolAId)
    expect(board.teachers.map((t) => t.name)).toEqual([
      "Budi Santoso",
      "Hendra Wijaya",
      "Siti Aminah",
    ])
    expect(board.teachers.map((t) => t.code)).toEqual(["G-003", "G-001", "G-002"])
  })

  it("papan penugasan memuat semester aktif, rombel, mapel, guru, dan kelas", async () => {
    const board = await getAssignmentBoard(schoolAId)
    expect(board.semester).toMatchObject({ id: ganjilId, name: "Ganjil" })
    expect(board.classrooms.map((c) => c.name)).toEqual(["X-1", "XI-1"])
    expect(board.subjects.map((s) => s.code)).toEqual(["BIN", "MTK"])
    expect(board.teachers).toHaveLength(3)
    expect(board.courses).toHaveLength(0)
    expect(board.classrooms.every((c) => c.homeroomTeacherId === null)).toBe(true)
  })

  it("sekolah tanpa semester aktif memberi papan kosong, bukan error", async () => {
    const sekolah = await admin.school.create({
      data: { slug: `ta-kosong-${suffix}`, name: "SMA Kosong", level: "SMA" },
    })
    try {
      const board = await getAssignmentBoard(sekolah.id)
      expect(board.semester).toBeNull()
      expect(board.courses).toHaveLength(0)
    } finally {
      await admin.school.delete({ where: { id: sekolah.id } })
    }
  })
})

describe("kelas pembelajaran", () => {
  it("membuat kelas pembelajaran rombel x mapel x guru", async () => {
    const course = await createCourse(schoolAId, input())
    expect(course).toMatchObject({
      classroomId: kelasX1,
      subjectId: mapelMtk,
      teacherId: guruSatu,
      semesterId: ganjilId,
    })

    const rows = await listCourses(schoolAId, ganjilId)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      classroomId: kelasX1,
      subjectId: mapelMtk,
      teacherId: guruSatu,
    })

    // Papan penugasan memuat id yang sama; UI yang menyusun nama untuk tampilan.
    const board = await getAssignmentBoard(schoolAId)
    expect(board.courses.map((c) => c.id)).toEqual([course.id])
    const row = board.courses[0]
    expect(board.classrooms.find((c) => c.id === row.classroomId)).toMatchObject({
      name: "X-1",
      grade: 10,
    })
    expect(board.subjects.find((s) => s.id === row.subjectId)?.code).toBe("MTK")
    expect(board.teachers.find((t) => t.id === row.teacherId)).toMatchObject({
      code: "G-001",
      name: "Hendra Wijaya",
    })
  })

  it("mapel sama boleh diampu di rombel lain, dan guru boleh mengampu banyak mapel", async () => {
    await createCourse(schoolAId, input({ classroomId: kelasX2 }))
    await createCourse(schoolAId, input({ subjectId: mapelBindo }))

    expect(await listCourses(schoolAId, ganjilId)).toHaveLength(3)
    expect(await listCourses(schoolAId, ganjilId, kelasX1)).toHaveLength(2)
    expect(await listCourses(schoolAId, genapId)).toHaveLength(0)
  })

  it("menolak rombel, mapel, atau guru yang tidak ada", async () => {
    await expect(createCourse(schoolAId, input({ classroomId: randomUUID() }))).rejects.toMatchObject(
      { code: "NOT_FOUND" }
    )
    await expect(createCourse(schoolAId, input({ subjectId: randomUUID() }))).rejects.toMatchObject({
      code: "NOT_FOUND",
    })
    await expect(createCourse(schoolAId, input({ teacherId: randomUUID() }))).rejects.toMatchObject({
      code: "NOT_FOUND",
    })
    await expect(createCourse(schoolAId, input({ semesterId: randomUUID() }))).rejects.toMatchObject({
      code: "NOT_FOUND",
    })
  })

  it("menolak mapel, rombel, dan guru yang sudah dihapus", async () => {
    const mapel = await createSubject(schoolAId, {
      code: "HAP",
      name: "Mapel Dihapus",
      group: "umum",
    })
    const guru = await createTeacher(schoolAId, "G-999", "Guru Dihapus")
    const rombel = await createClassroom(schoolAId, {
      semesterId: ganjilId,
      grade: 12,
      name: "XII-1",
    })

    await tenantDb(schoolAId, async (db) => {
      await db.subject.update({ where: { id: mapel.id }, data: { deletedAt: new Date() } })
      await db.teacher.update({ where: { id: guru }, data: { deletedAt: new Date() } })
      await db.classroom.update({ where: { id: rombel.id }, data: { deletedAt: new Date() } })
    })

    await expect(createCourse(schoolAId, input({ subjectId: mapel.id }))).rejects.toMatchObject({
      code: "NOT_FOUND",
    })
    await expect(createCourse(schoolAId, input({ teacherId: guru }))).rejects.toMatchObject({
      code: "NOT_FOUND",
    })
    await expect(createCourse(schoolAId, input({ classroomId: rombel.id }))).rejects.toMatchObject({
      code: "NOT_FOUND",
    })
  })

  it("menolak rombel yang berada pada semester lain", async () => {
    await expect(createCourse(schoolAId, input({ classroomId: kelasGenapX1 }))).rejects.toMatchObject(
      { code: "INVALID" }
    )
    await expect(createCourse(schoolAId, input({ semesterId: genapId }))).rejects.toMatchObject({
      code: "INVALID",
    })
  })

  it("menolak mapel yang sudah punya kelas pembelajaran di rombel yang sama", async () => {
    const error = await createCourse(schoolAId, input()).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(TeachingError)
    expect((error as TeachingError).code).toBe("DUPLICATE")
    expect(await listCourses(schoolAId, ganjilId, kelasX1)).toHaveLength(2)
  })

  it("hapus: kelas pembelajaran hilang dari daftar dan boleh dibuat ulang", async () => {
    const course = await createCourse(schoolAId, input({ classroomId: kelasX2, subjectId: mapelBindo }))

    await removeCourse(schoolAId, ACTOR, course.id)
    expect(await listCourses(schoolAId, ganjilId)).toHaveLength(3)

    // Soft delete: indeks unik parsial tidak lagi menolak mapel yang sama.
    const ulang = await createCourse(schoolAId, input({ classroomId: kelasX2, subjectId: mapelBindo }))
    expect(ulang.id).not.toBe(course.id)

    await removeCourse(schoolAId, ACTOR, ulang.id)
  })

  it("menghapus yang sudah dihapus ditolak NOT_FOUND", async () => {
    const course = await createCourse(schoolAId, input({ classroomId: kelasX2, subjectId: mapelBindo }))
    await removeCourse(schoolAId, ACTOR, course.id)
    const logs = await admin.auditLog.findMany({
      where: { schoolId: schoolAId, action: "course.remove", entityId: course.id },
    })
    expect(logs).toHaveLength(1)
    expect(logs[0].actorUserId).toBe(ACTOR.userId)
    await expect(removeCourse(schoolAId, ACTOR, course.id)).rejects.toMatchObject({ code: "NOT_FOUND" })
    await expect(removeCourse(schoolAId, ACTOR, randomUUID())).rejects.toMatchObject({
      code: "NOT_FOUND",
    })
  })
})

describe("wali kelas", () => {
  it("menetapkan wali kelas rombel", async () => {
    await setHomeroomTeacher(schoolAId, { classroomId: kelasX1, teacherId: guruSatu })

    const room = await tenantDb(schoolAId, (db) =>
      db.classroom.findFirstOrThrow({ where: { id: kelasX1 } })
    )
    expect(room.homeroomTeacherId).toBe(guruSatu)
    expect(await listHomerooms(schoolAId, ganjilId)).toEqual([
      { classroomId: kelasX1, teacherId: guruSatu },
    ])
  })

  it("menetapkan wali yang sama lagi tidak error", async () => {
    await expect(
      setHomeroomTeacher(schoolAId, { classroomId: kelasX1, teacherId: guruSatu })
    ).resolves.toBe(kelasX1)
  })

  it("mengganti wali kelas rombel", async () => {
    await setHomeroomTeacher(schoolAId, { classroomId: kelasX1, teacherId: guruDua })

    const room = await tenantDb(schoolAId, (db) =>
      db.classroom.findFirstOrThrow({ where: { id: kelasX1 } })
    )
    expect(room.homeroomTeacherId).toBe(guruDua)
  })

  it("satu guru tidak boleh wali dua rombel pada semester yang sama", async () => {
    await expect(
      setHomeroomTeacher(schoolAId, { classroomId: kelasX2, teacherId: guruDua })
    ).rejects.toMatchObject({ code: "INVALID" })

    const room = await tenantDb(schoolAId, (db) =>
      db.classroom.findFirstOrThrow({ where: { id: kelasX2 } })
    )
    // Penolakan tidak meninggalkan perubahan setengah jadi.
    expect(room.homeroomTeacherId).toBeNull()
  })

  it("guru yang sama boleh wali rombel pada semester lain", async () => {
    await expect(
      setHomeroomTeacher(schoolAId, { classroomId: kelasGenapX1, teacherId: guruDua })
    ).resolves.toBe(kelasGenapX1)

    expect(await listHomerooms(schoolAId, genapId)).toEqual([
      { classroomId: kelasGenapX1, teacherId: guruDua },
    ])
  })

  it("cabut wali kelas, dan mengabut lagi tidak error", async () => {
    await clearHomeroomTeacher(schoolAId, ACTOR, kelasX1)
    await expect(clearHomeroomTeacher(schoolAId, ACTOR, kelasX1)).resolves.toBe(kelasX1)
    // Hanya pencabutan yang benar-benar mengubah data yang dicatat.
    expect(
      await admin.auditLog.count({
        where: { schoolId: schoolAId, action: "homeroom.clear", entityId: kelasX1 },
      })
    ).toBe(1)

    const room = await tenantDb(schoolAId, (db) =>
      db.classroom.findFirstOrThrow({ where: { id: kelasX1 } })
    )
    expect(room.homeroomTeacherId).toBeNull()
    expect(await listHomerooms(schoolAId, ganjilId)).toHaveLength(0)

    await clearHomeroomTeacher(schoolAId, ACTOR, kelasGenapX1)
  })

  it("menolak rombel atau guru yang tidak ada", async () => {
    await expect(
      setHomeroomTeacher(schoolAId, { classroomId: randomUUID(), teacherId: guruTiga })
    ).rejects.toMatchObject({ code: "NOT_FOUND" })
    await expect(
      setHomeroomTeacher(schoolAId, { classroomId: kelasX1, teacherId: randomUUID() })
    ).rejects.toMatchObject({ code: "NOT_FOUND" })
    await expect(clearHomeroomTeacher(schoolAId, ACTOR, randomUUID())).rejects.toMatchObject({
      code: "NOT_FOUND",
    })
  })
})

// ---------------------------------------------------------------------------
// Isolasi antar sekolah
// ---------------------------------------------------------------------------

describe("isolasi antar sekolah", () => {
  it("sekolah B tidak melihat kelas pembelajaran sekolah A", async () => {
    // Rombel & mapel baru supaya tidak bentrok dengan kelas pembelajaran lain.
    const kelasX3 = (
      await createClassroom(schoolAId, { semesterId: ganjilId, grade: 12, name: "X-3" })
    ).id
    const mapelFisika = (
      await createSubject(schoolAId, { code: "FIS", name: "Fisika", group: "umum" })
    ).id
    await createCourse(schoolAId, input({ classroomId: kelasX3, subjectId: mapelFisika }))

    expect(await listCourses(schoolBId, ganjilId)).toHaveLength(0)
    const boardB = await getAssignmentBoard(schoolBId)
    expect(boardB.courses).toHaveLength(0)
    expect(boardB.classrooms.every((c) => c.id !== kelasX1)).toBe(true)
  })

  it("sekolah B tidak bisa memakai mapel, rombel, atau guru sekolah A", async () => {
    await expect(
      createCourse(schoolBId, {
        semesterId: (await getActiveSemester(schoolBId))!.id,
        classroomId: kelasBX1,
        subjectId: mapelMtk,
        teacherId: guruB,
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" })

    await expect(
      createCourse(schoolBId, {
        semesterId: (await getActiveSemester(schoolBId))!.id,
        classroomId: kelasX1,
        subjectId: mapelBMtk,
        teacherId: guruB,
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" })

    await expect(
      createCourse(schoolBId, {
        semesterId: (await getActiveSemester(schoolBId))!.id,
        classroomId: kelasBX1,
        subjectId: mapelBMtk,
        teacherId: guruSatu,
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" })
  })

  it("sekolah B tidak bisa menghapus kelas pembelajaran sekolah A", async () => {
    const [course] = await listCourses(schoolAId, ganjilId)
    const sebelum = await listCourses(schoolAId, ganjilId)

    await expect(removeCourse(schoolBId, ACTOR, course.id)).rejects.toMatchObject({ code: "NOT_FOUND" })
    expect(await listCourses(schoolAId, ganjilId)).toHaveLength(sebelum.length)
  })

  it("sekolah B tidak bisa mengubah wali kelas sekolah A", async () => {
    await setHomeroomTeacher(schoolAId, { classroomId: kelasX1, teacherId: guruTiga })
    await expect(
      setHomeroomTeacher(schoolBId, { classroomId: kelasX1, teacherId: guruB })
    ).rejects.toMatchObject({ code: "NOT_FOUND" })
    await expect(clearHomeroomTeacher(schoolBId, ACTOR, kelasX1)).rejects.toMatchObject({
      code: "NOT_FOUND",
    })

    const room = await tenantDb(schoolAId, (db) =>
      db.classroom.findFirstOrThrow({ where: { id: kelasX1 } })
    )
    expect(room.homeroomTeacherId).toBe(guruTiga)

    await clearHomeroomTeacher(schoolAId, ACTOR, kelasX1)
  })

  it("RLS: tanpa konteks tenant, tabel courses tidak terlihat sama sekali", async () => {
    const { prisma } = await import("@/db/client")
    expect(await prisma.course.count()).toBe(0)
  })

  it("RLS: sekolah lain tidak bisa menyisipkan baris atas nama sekolah ini", async () => {
    await expect(
      tenantDb(schoolBId, (db) =>
        db.$executeRaw`INSERT INTO courses (id, school_id, classroom_id, subject_id, teacher_id, semester_id, updated_at)
                       VALUES (gen_random_uuid(), ${schoolAId}::uuid, ${kelasX1}::uuid, ${mapelMtk}::uuid, ${guruSatu}::uuid, ${ganjilId}::uuid, now())`
      )
    ).rejects.toThrow()
  })
})

// ---------------------------------------------------------------------------
// Aturan yang dijamin indeks unik di migrasi
// ---------------------------------------------------------------------------

describe("indeks unik di database", () => {
  it("menolak dua kelas pembelajaran dengan rombel, mapel, dan semester yang sama", async () => {
    await tenantDb(schoolAId, (db) =>
      db.$executeRaw`INSERT INTO courses (id, school_id, classroom_id, subject_id, teacher_id, semester_id, updated_at)
                     VALUES (gen_random_uuid(), ${schoolAId}::uuid, ${kelasX1}::uuid, ${mapelMtk}::uuid, ${guruSatu}::uuid, ${ganjilId}::uuid, now())`
    ).then(
      () => expect.fail("indeks unik seharusnya menolak baris kembar"),
      () => undefined
    )
  })

  it("menolak wali kelas yang sama untuk dua rombel pada semester yang sama", async () => {
    await tenantDb(schoolAId, (db) =>
      db.$executeRaw`UPDATE classrooms SET homeroom_teacher_id = ${guruTiga}::uuid, updated_at = now()
                     WHERE id = ${kelasX1}::uuid`
    )

    await expect(
      tenantDb(schoolAId, (db) =>
        db.$executeRaw`UPDATE classrooms SET homeroom_teacher_id = ${guruTiga}::uuid, updated_at = now()
                       WHERE id = ${kelasX2}::uuid`
      )
    ).rejects.toThrow()

    await tenantDb(schoolAId, (db) =>
      db.classroom.update({ where: { id: kelasX1 }, data: { homeroomTeacherId: null } })
    )
  })
})