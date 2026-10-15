// Penugasan guru (OB-03, PRD §6.2): kelas pembelajaran (rombel x mapel x guru)
// dan wali kelas per rombel.
// ---------------------------------------------------------------------------
// Aturan penting:
//   - Guru, mapel, rombel, dan semester yang dipakai WAJIB milik sekolah yang
//     sedang login dan belum dihapus. Semua pemeriksaan lewat tenantDb, jadi
//     id milik sekolah lain tidak terlihat (gagal tertutup) dan menghasilkan
//     NOT_FOUND, bukan bocor data.
//   - Satu rombel tidak boleh punya dua kelas pembelajaran untuk mapel yang
//     sama pada semester yang sama; rombel juga harus berada pada semester itu.
//   - Satu guru paling banyak menjadi wali kelas satu rombel per semester.
//     Aturan ini dijaga service (pesan ramah) DAN indeks unik parsial di
//     migrasi, sehingga tetap aman saat dua admin menekan tombol bersamaan.
//   - Semua pemeriksaan + penulisan dalam SATU transaksi tenantDb supaya tidak
//     ada penulisan setengah jadi.

import { tenantDb } from "@/db/tenant"
import { recordAudit, type AuditActor } from "@/features/audit/service"

import type { CourseInput, HomeroomInput } from "./schema"

export type TeachingErrorCode = "INVALID" | "DUPLICATE" | "NOT_FOUND"

export class TeachingError extends Error {
  constructor(
    readonly code: TeachingErrorCode,
    message: string
  ) {
    super(message)
    this.name = "TeachingError"
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  )
}

// ---------------------------------------------------------------------------
// Bentuk data untuk UI
// ---------------------------------------------------------------------------

export interface AssignmentTeacher {
  id: string
  code: string
  name: string
}

export interface AssignmentSubject {
  id: string
  code: string
  name: string
}

export interface AssignmentClassroom {
  id: string
  name: string
  grade: number
  majorCode: string | null
  homeroomTeacherId: string | null
}

export interface AssignmentCourse {
  id: string
  classroomId: string
  subjectId: string
  teacherId: string
}

export interface AssignmentSemester {
  id: string
  name: string
  academicYearName: string
}

/**
 * Semua yang dibutuhkan halaman /penugasan dalam satu snapshot: dibaca dalam
 * SATU transaksi tenantDb supaya semester, rombel, dan kelas pembelajaran
 * selalu berasal dari keadaan yang sama.
 */
export interface AssignmentBoard {
  semester: AssignmentSemester | null
  classrooms: AssignmentClassroom[]
  subjects: AssignmentSubject[]
  teachers: AssignmentTeacher[]
  courses: AssignmentCourse[]
}

// ---------------------------------------------------------------------------
// Pembacaan
// ---------------------------------------------------------------------------

export function getAssignmentBoard(schoolId: string): Promise<AssignmentBoard> {
  return tenantDb(schoolId, async (db) => {
    const semester = await db.semester.findFirst({
      where: { isActive: true },
      include: { academicYear: true },
    })

    if (!semester) {
      return { semester: null, classrooms: [], subjects: [], teachers: [], courses: [] }
    }

    // Sengaja berurutan, bukan Promise.all: Prisma menjalankan query dalam
    // transaksi satu per satu, dan adapter pg memperingatkan (deprecated) kalau
    // ada beberapa query yang dijalankan bersamaan.
    const classrooms = await db.classroom.findMany({
      where: { semesterId: semester.id, deletedAt: null },
      orderBy: [{ grade: "asc" }, { name: "asc" }],
      include: { major: { select: { code: true } } },
    })
    const subjects = await db.subject.findMany({
      where: { deletedAt: null },
      orderBy: { code: "asc" },
      select: { id: true, code: true, name: true },
    })
    const teachers = await db.teacher.findMany({
      where: { deletedAt: null },
      orderBy: { user: { name: "asc" } },
      select: { id: true, code: true, user: { select: { name: true } } },
    })
    const courses = await db.course.findMany({
      where: { semesterId: semester.id, deletedAt: null },
      orderBy: [{ classroomId: "asc" }, { subjectId: "asc" }],
      select: { id: true, classroomId: true, subjectId: true, teacherId: true },
    })

    return {
      semester: {
        id: semester.id,
        name: semester.name,
        academicYearName: semester.academicYear.name,
      },
      classrooms: classrooms.map((room) => ({
        id: room.id,
        name: room.name,
        grade: room.grade,
        majorCode: room.major?.code ?? null,
        homeroomTeacherId: room.homeroomTeacherId,
      })),
      subjects,
      teachers: teachers.map((teacher) => ({
        id: teacher.id,
        code: teacher.code,
        name: teacher.user.name,
      })),
      courses,
    }
  })
}

// ---------------------------------------------------------------------------
// Kelas pembelajaran
// ---------------------------------------------------------------------------

export async function createCourse(schoolId: string, input: CourseInput) {
  try {
    return await tenantDb(schoolId, async (db) => {
      const semester = await db.semester.findFirst({
        where: { id: input.semesterId },
      })
      if (!semester) throw new TeachingError("NOT_FOUND", "Semester tidak ditemukan.")

      const classroom = await db.classroom.findFirst({
        where: { id: input.classroomId, deletedAt: null },
      })
      if (!classroom) throw new TeachingError("NOT_FOUND", "Rombel tidak ditemukan.")
      if (classroom.semesterId !== semester.id) {
        throw new TeachingError(
          "INVALID",
          `Rombel ${classroom.name} berada pada semester lain. Pilih rombel semester ${semester.name}.`
        )
      }

      const subject = await db.subject.findFirst({
        where: { id: input.subjectId, deletedAt: null },
      })
      if (!subject) throw new TeachingError("NOT_FOUND", "Mata pelajaran tidak ditemukan.")

      const teacher = await db.teacher.findFirst({
        where: { id: input.teacherId, deletedAt: null },
      })
      if (!teacher) throw new TeachingError("NOT_FOUND", "Guru tidak ditemukan.")

      const duplicate = await db.course.findFirst({
        where: {
          classroomId: classroom.id,
          subjectId: subject.id,
          semesterId: semester.id,
          deletedAt: null,
        },
      })
      if (duplicate) {
        throw new TeachingError(
          "DUPLICATE",
          `Mapel ${subject.name} sudah punya kelas pembelajaran di rombel ${classroom.name} pada semester ini.`
        )
      }

      return db.course.create({
        data: {
          schoolId,
          classroomId: classroom.id,
          subjectId: subject.id,
          teacherId: teacher.id,
          semesterId: semester.id,
        },
      })
    })
  } catch (error) {
    // Jaring pengaman bila dua admin menekan tombol hampir bersamaan: indeks
    // unik parsial yang menolak, bukan pesan error database ke pengguna.
    if (isUniqueViolation(error)) {
      throw new TeachingError(
        "DUPLICATE",
        "Kelas pembelajaran untuk rombel dan mapel itu sudah ada pada semester ini."
      )
    }
    throw error
  }
}

export async function removeCourse(
  schoolId: string,
  actor: AuditActor,
  courseId: string
) {
  return tenantDb(schoolId, async (db) => {
    const course = await db.course.findFirst({
      where: { id: courseId, deletedAt: null },
      select: { classroomId: true, subjectId: true, teacherId: true },
    })
    if (!course) throw new TeachingError("NOT_FOUND", "Kelas pembelajaran tidak ditemukan.")

    const { count } = await db.course.updateMany({
      where: { id: courseId, deletedAt: null },
      data: { deletedAt: new Date() },
    })
    if (count === 0) throw new TeachingError("NOT_FOUND", "Kelas pembelajaran tidak ditemukan.")

    await recordAudit(db, schoolId, actor, {
      action: "course.remove",
      entity: "course",
      entityId: courseId,
      before: course,
    })
  })
}

// ---------------------------------------------------------------------------
// Wali kelas
// ---------------------------------------------------------------------------

export async function setHomeroomTeacher(schoolId: string, input: HomeroomInput) {
  try {
    return await tenantDb(schoolId, async (db) => {
      const classroom = await db.classroom.findFirst({
        where: { id: input.classroomId, deletedAt: null },
      })
      if (!classroom) throw new TeachingError("NOT_FOUND", "Rombel tidak ditemukan.")

      const teacher = await db.teacher.findFirst({
        where: { id: input.teacherId, deletedAt: null },
      })
      if (!teacher) throw new TeachingError("NOT_FOUND", "Guru tidak ditemukan.")

      if (classroom.homeroomTeacherId === teacher.id) {
        return classroom.id
      }

      // Satu guru satu rombel per semester.
      const elsewhere = await db.classroom.findFirst({
        where: {
          homeroomTeacherId: teacher.id,
          semesterId: classroom.semesterId,
          id: { not: classroom.id },
          deletedAt: null,
        },
        include: { major: { select: { code: true } } },
      })
      if (elsewhere) {
        throw new TeachingError(
          "INVALID",
          elsewhere.major
            ? `Guru ini sudah menjadi wali kelas rombel ${elsewhere.name} (${elsewhere.major.code}) pada semester ini.`
            : `Guru ini sudah menjadi wali kelas rombel ${elsewhere.name} pada semester ini.`
        )
      }

      await db.classroom.update({
        where: { id: classroom.id },
        data: { homeroomTeacherId: teacher.id },
      })
      return classroom.id
    })
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new TeachingError(
        "INVALID",
        "Guru ini sudah menjadi wali kelas rombel lain pada semester ini."
      )
    }
    throw error
  }
}

/** Cabut wali kelas. Rombel tanpa wali bukan kondisi salah, jadi idempoten. */
export async function clearHomeroomTeacher(
  schoolId: string,
  actor: AuditActor,
  classroomId: string
) {
  return tenantDb(schoolId, async (db) => {
    const classroom = await db.classroom.findFirst({
      where: { id: classroomId, deletedAt: null },
    })
    if (!classroom) throw new TeachingError("NOT_FOUND", "Rombel tidak ditemukan.")

    if (classroom.homeroomTeacherId === null) return classroom.id

    await db.classroom.update({
      where: { id: classroom.id },
      data: { homeroomTeacherId: null },
    })
    await recordAudit(db, schoolId, actor, {
      action: "homeroom.clear",
      entity: "classroom",
      entityId: classroom.id,
      before: { homeroomTeacherId: classroom.homeroomTeacherId },
    })
    return classroom.id
  })
}