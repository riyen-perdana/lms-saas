// Data master akademik (OB-01): tahun ajaran, semester, jurusan, rombel, mapel.
// Semua akses model tenant lewat tenantDb (AGENTS.md aturan 1).

import { prisma } from "@/db/client"
import { tenantDb } from "@/db/tenant"
import type { SchoolLevel } from "@/generated/prisma/enums"

import type {
  AcademicYearInput,
  ClassroomInput,
  MajorInput,
  SubjectInput,
} from "./schema"

export type AcademicErrorCode = "INVALID" | "DUPLICATE" | "NOT_FOUND"

export class AcademicError extends Error {
  constructor(
    readonly code: AcademicErrorCode,
    message: string
  ) {
    super(message)
    this.name = "AcademicError"
  }
}

/** Rentang tingkat (kelas) yang sah untuk tiap jenjang. */
export const GRADE_RANGES: Record<SchoolLevel, readonly [number, number]> = {
  SD: [1, 6],
  MI: [1, 6],
  SMP: [7, 9],
  MTS: [7, 9],
  SMA: [10, 12],
  MA: [10, 12],
  SMK: [10, 12],
}

const toDate = (value: string) => new Date(`${value}T00:00:00Z`)

async function getSchoolLevel(schoolId: string): Promise<SchoolLevel> {
  const school = await prisma.school.findFirst({
    where: { id: schoolId, deletedAt: null },
    select: { level: true },
  })
  if (!school) throw new AcademicError("NOT_FOUND", "Sekolah tidak ditemukan.")
  return school.level
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
// Tahun ajaran & semester
// ---------------------------------------------------------------------------

export async function createAcademicYear(schoolId: string, input: AcademicYearInput) {
  try {
    return await tenantDb(schoolId, async (db) => {
      const hasActive = (await db.academicYear.count({ where: { isActive: true } })) > 0

      const year = await db.academicYear.create({
        data: {
          name: input.name,
          startDate: toDate(input.ganjil.startDate),
          endDate: toDate(input.genap.endDate),
          isActive: !hasActive,
          schoolId,
        },
      })

      await db.semester.createMany({
        data: [
          { name: "Ganjil", period: input.ganjil, isActive: !hasActive },
          { name: "Genap", period: input.genap, isActive: false },
        ].map((s) => ({
          schoolId,
          academicYearId: year.id,
          name: s.name,
          startDate: toDate(s.period.startDate),
          endDate: toDate(s.period.endDate),
          isActive: s.isActive,
        })),
      })

      return year
    })
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AcademicError("DUPLICATE", `Tahun ajaran ${input.name} sudah ada.`)
    }
    throw error
  }
}

export function listAcademicYears(schoolId: string) {
  return tenantDb(schoolId, (db) =>
    db.academicYear.findMany({
      orderBy: { startDate: "desc" },
      include: { semesters: { orderBy: { startDate: "asc" } } },
    })
  )
}

/** Semester aktif beserta tahun ajarannya, atau null bila belum ada. */
export function getActiveSemester(schoolId: string) {
  return tenantDb(schoolId, (db) =>
    db.semester.findFirst({
      where: { isActive: true },
      include: { academicYear: true },
    })
  )
}

/** Jadikan satu semester aktif (dan tahun ajarannya); semester lain nonaktif. */
export async function activateSemester(schoolId: string, semesterId: string) {
  return tenantDb(schoolId, async (db) => {
    const semester = await db.semester.findFirst({ where: { id: semesterId } })
    if (!semester) throw new AcademicError("NOT_FOUND", "Semester tidak ditemukan.")

    await db.semester.updateMany({ where: { isActive: true }, data: { isActive: false } })
    await db.academicYear.updateMany({ where: { isActive: true }, data: { isActive: false } })
    await db.semester.updateMany({ where: { id: semesterId }, data: { isActive: true } })
    await db.academicYear.updateMany({
      where: { id: semester.academicYearId },
      data: { isActive: true },
    })

    return semesterId
  })
}

// ---------------------------------------------------------------------------
// Jurusan (khusus SMK)
// ---------------------------------------------------------------------------

export async function createMajor(schoolId: string, input: MajorInput) {
  if ((await getSchoolLevel(schoolId)) !== "SMK") {
    throw new AcademicError("INVALID", "Jurusan hanya untuk sekolah berjenjang SMK.")
  }

  try {
    return await tenantDb(schoolId, (db) => db.major.create({ data: { ...input, schoolId } }))
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AcademicError("DUPLICATE", `Kode jurusan ${input.code} sudah dipakai.`)
    }
    throw error
  }
}

export function listMajors(schoolId: string) {
  return tenantDb(schoolId, (db) =>
    db.major.findMany({ where: { deletedAt: null }, orderBy: { code: "asc" } })
  )
}

export async function removeMajor(schoolId: string, majorId: string) {
  return tenantDb(schoolId, async (db) => {
    const inUse = await db.classroom.count({ where: { majorId, deletedAt: null } })
    if (inUse > 0) {
      throw new AcademicError("INVALID", "Jurusan masih dipakai oleh rombel.")
    }
    const { count } = await db.major.updateMany({
      where: { id: majorId, deletedAt: null },
      data: { deletedAt: new Date() },
    })
    if (count === 0) throw new AcademicError("NOT_FOUND", "Jurusan tidak ditemukan.")
  })
}

// ---------------------------------------------------------------------------
// Rombel
// ---------------------------------------------------------------------------

export async function createClassroom(schoolId: string, input: ClassroomInput) {
  const level = await getSchoolLevel(schoolId)
  const [min, max] = GRADE_RANGES[level]
  if (input.grade < min || input.grade > max) {
    throw new AcademicError(
      "INVALID",
      `Tingkat untuk ${level} harus antara ${min} dan ${max}.`
    )
  }

  return tenantDb(schoolId, async (db) => {
    if (!(await db.semester.findFirst({ where: { id: input.semesterId } }))) {
      throw new AcademicError("NOT_FOUND", "Semester tidak ditemukan.")
    }
    if (input.majorId) {
      if (!(await db.major.findFirst({ where: { id: input.majorId, deletedAt: null } }))) {
        throw new AcademicError("NOT_FOUND", "Jurusan tidak ditemukan.")
      }
    }
    const duplicate = await db.classroom.findFirst({
      where: {
        semesterId: input.semesterId,
        deletedAt: null,
        name: { equals: input.name, mode: "insensitive" },
      },
    })
    if (duplicate) {
      throw new AcademicError("DUPLICATE", `Rombel ${input.name} sudah ada di semester ini.`)
    }

    return db.classroom.create({ data: { ...input, schoolId } })
  })
}

export function listClassrooms(schoolId: string, semesterId: string) {
  return tenantDb(schoolId, (db) =>
    db.classroom.findMany({
      where: { semesterId, deletedAt: null },
      orderBy: [{ grade: "asc" }, { name: "asc" }],
      include: { major: true },
    })
  )
}

export async function removeClassroom(schoolId: string, classroomId: string) {
  return tenantDb(schoolId, async (db) => {
    const { count } = await db.classroom.updateMany({
      where: { id: classroomId, deletedAt: null },
      data: { deletedAt: new Date() },
    })
    if (count === 0) throw new AcademicError("NOT_FOUND", "Rombel tidak ditemukan.")
  })
}

// ---------------------------------------------------------------------------
// Mata pelajaran
// ---------------------------------------------------------------------------

export async function createSubject(schoolId: string, input: SubjectInput) {
  try {
    return await tenantDb(schoolId, (db) => db.subject.create({ data: { ...input, schoolId } }))
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AcademicError("DUPLICATE", `Kode mapel ${input.code} sudah dipakai.`)
    }
    throw error
  }
}

export function listSubjects(schoolId: string) {
  return tenantDb(schoolId, (db) =>
    db.subject.findMany({ where: { deletedAt: null }, orderBy: { code: "asc" } })
  )
}

export async function removeSubject(schoolId: string, subjectId: string) {
  return tenantDb(schoolId, async (db) => {
    const { count } = await db.subject.updateMany({
      where: { id: subjectId, deletedAt: null },
      data: { deletedAt: new Date() },
    })
    if (count === 0) throw new AcademicError("NOT_FOUND", "Mapel tidak ditemukan.")
  })
}
