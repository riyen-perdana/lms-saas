// Wizard setup pertama (OB-01): profil & logo sekolah, status kelengkapan,
// dan penutupan wizard. Data master akademik ada di features/academic.

import { prisma } from "@/db/client"
import { tenantDb } from "@/db/tenant"
import type { SchoolLevel } from "@/generated/prisma/enums"
import { deleteFile, getFile, putFile, type StoredFile } from "@/lib/storage"
import { invalidateTenantCache } from "@/lib/tenant/resolve"

import { LOGO_MAX_BYTES, LOGO_TYPES, type ProfileInput } from "./schema"

export type SetupErrorCode = "INVALID" | "DUPLICATE" | "NOT_FOUND"

export class SetupError extends Error {
  constructor(
    readonly code: SetupErrorCode,
    message: string
  ) {
    super(message)
    this.name = "SetupError"
  }
}

export interface SetupState {
  name: string
  npsn: string | null
  level: SchoolLevel
  hasLogo: boolean
  completed: boolean
  yearCount: number
  /** Hanya SMK yang memakai jurusan. */
  usesMajors: boolean
  majorCount: number
  classroomCount: number
  subjectCount: number
}

async function loadSchool(schoolId: string) {
  const school = await prisma.school.findFirst({
    where: { id: schoolId, deletedAt: null },
  })
  if (!school) throw new SetupError("NOT_FOUND", "Sekolah tidak ditemukan.")
  return school
}

export async function getSetupState(schoolId: string): Promise<SetupState> {
  const school = await loadSchool(schoolId)

  const counts = await tenantDb(schoolId, async (db) => {
    const active = await db.semester.findFirst({ where: { isActive: true } })
    return {
      yearCount: await db.academicYear.count(),
      majorCount: await db.major.count({ where: { deletedAt: null } }),
      classroomCount: active
        ? await db.classroom.count({
            where: { semesterId: active.id, deletedAt: null },
          })
        : 0,
      subjectCount: await db.subject.count({ where: { deletedAt: null } }),
    }
  })

  return {
    name: school.name,
    npsn: school.npsn,
    level: school.level,
    hasLogo: school.logoUrl !== null,
    completed: school.setupCompletedAt !== null,
    usesMajors: school.level === "SMK",
    ...counts,
  }
}

/** Status penyelesaian setup, ringan: dipakai guard redirect di beranda. */
export async function isSetupCompleted(schoolId: string): Promise<boolean> {
  const school = await prisma.school.findFirst({
    where: { id: schoolId, deletedAt: null },
    select: { setupCompletedAt: true },
  })
  return school?.setupCompletedAt != null
}

export async function updateProfile(schoolId: string, input: ProfileInput) {
  const school = await loadSchool(schoolId)

  if (input.npsn) {
    const taken = await prisma.school.findFirst({
      where: { npsn: input.npsn, NOT: { id: schoolId } },
      select: { id: true },
    })
    if (taken) throw new SetupError("DUPLICATE", "NPSN sudah terdaftar di sekolah lain.")
  }

  try {
    await prisma.school.update({
      where: { id: schoolId },
      data: { name: input.name, npsn: input.npsn ?? null },
    })
    // Nama sekolah ikut tampil dari cache tenant; buang agar berlaku seketika.
    invalidateTenantCache(school.slug)
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") {
      throw new SetupError("DUPLICATE", "NPSN sudah terdaftar di sekolah lain.")
    }
    throw error
  }
}

export async function saveLogo(schoolId: string, file: StoredFile) {
  const ext = (LOGO_TYPES as Record<string, string | undefined>)[file.contentType]
  if (!ext) {
    throw new SetupError("INVALID", "Logo harus berformat PNG, JPG, atau WebP.")
  }
  if (file.body.length === 0 || file.body.length > LOGO_MAX_BYTES) {
    throw new SetupError("INVALID", "Ukuran logo maksimal 1 MB.")
  }

  const school = await loadSchool(schoolId)
  const key = await putFile(schoolId, ["logo", `logo.${ext}`], file)

  if (school.logoUrl && school.logoUrl !== key) {
    await deleteFile(schoolId, school.logoUrl)
  }
  await prisma.school.update({ where: { id: schoolId }, data: { logoUrl: key } })
}

export async function getLogo(schoolId: string): Promise<StoredFile | null> {
  const school = await prisma.school.findFirst({
    where: { id: schoolId, deletedAt: null },
    select: { logoUrl: true },
  })
  return school?.logoUrl ? getFile(schoolId, school.logoUrl) : null
}

export async function completeSetup(schoolId: string, now: Date = new Date()) {
  const school = await loadSchool(schoolId)
  if (school.setupCompletedAt) return

  const years = await tenantDb(schoolId, (db) => db.academicYear.count())
  if (years === 0) {
    throw new SetupError("INVALID", "Tambahkan tahun ajaran sebelum menyelesaikan setup.")
  }

  await prisma.school.update({
    where: { id: schoolId },
    data: { setupCompletedAt: now },
  })
}
