// Pendaftaran sekolah baru (LP-04): sekolah berstatus trial + akun admin +
// keanggotaan school_admin. `schools`, `users`, dan `accounts` bersifat global
// sehingga dibuat lewat `prisma`; `memberships` adalah model tenant dan
// dibuat lewat tenantDb(schoolId) (AGENTS.md aturan 1).

import { hashPassword } from "better-auth/crypto"

import { prisma } from "@/db/client"
import { tenantDb } from "@/db/tenant"
import type { RegisterSchoolInput } from "@/features/registration/schema"
import { createTrialSubscription } from "@/features/subscription/trial"
import { isValidSlug } from "@/lib/tenant/host"
import { uuidv7 } from "@/lib/uuid"

export type RegistrationErrorCode = "SLUG_TAKEN" | "NPSN_TAKEN" | "EMAIL_TAKEN"

const MESSAGES: Record<RegistrationErrorCode, string> = {
  SLUG_TAKEN: "Subdomain sudah dipakai sekolah lain.",
  NPSN_TAKEN: "NPSN ini sudah terdaftar.",
  EMAIL_TAKEN:
    "Email ini sudah terdaftar. Gunakan email lain untuk admin sekolah.",
}

export class RegistrationError extends Error {
  constructor(readonly code: RegistrationErrorCode) {
    super(MESSAGES[code])
    this.name = "RegistrationError"
  }
}

/** Slug valid (format + kata terlarang) dan belum dipakai sekolah mana pun. */
export async function isSlugAvailable(slug: string): Promise<boolean> {
  if (!isValidSlug(slug)) return false

  // Sengaja tanpa filter deletedAt: slug sekolah yang dihapus tetap terkunci
  // karena kolom `slug` unik di tingkat database.
  const existing = await prisma.school.findUnique({
    where: { slug },
    select: { id: true },
  })

  return existing === null
}

export async function registerSchool(
  input: RegisterSchoolInput
): Promise<{ schoolId: string; slug: string }> {
  if (!(await isSlugAvailable(input.slug))) {
    throw new RegistrationError("SLUG_TAKEN")
  }

  if (input.npsn) {
    const npsn = await prisma.school.findUnique({
      where: { npsn: input.npsn },
      select: { id: true },
    })
    if (npsn) throw new RegistrationError("NPSN_TAKEN")
  }

  const emailTaken = await prisma.user.findUnique({
    where: { email: input.adminEmail },
    select: { id: true },
  })
  if (emailTaken) throw new RegistrationError("EMAIL_TAKEN")

  const schoolId = uuidv7()
  const userId = uuidv7()
  const passwordHash = await hashPassword(input.password)

  try {
    await prisma.$transaction([
      prisma.school.create({
        data: {
          id: schoolId,
          slug: input.slug,
          npsn: input.npsn,
          name: input.schoolName,
          level: input.level,
          status: "trial",
        },
      }),
      prisma.user.create({
        data: { id: userId, email: input.adminEmail, name: input.adminName },
      }),
      prisma.account.create({
        data: {
          userId,
          providerId: "credential",
          accountId: userId,
          password: passwordHash,
        },
      }),
    ])

    await tenantDb(schoolId, async (db) => {
      await db.membership.create({
        data: { schoolId, userId, role: "school_admin" },
      })
      await createTrialSubscription(db, schoolId)
    })
  } catch (error) {
    // Pendaftaran dua tahap (global lalu tenant) tidak satu transaksi: bila
    // tahap membership gagal, hapus sekolah dan user agar tidak yatim.
    await prisma.school.deleteMany({ where: { id: schoolId } })
    await prisma.user.deleteMany({ where: { id: userId } })

    if (isUniqueViolation(error)) throw mapUniqueViolation(error)
    throw error
  }

  return { schoolId, slug: input.slug }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  )
}

/** Balapan antar pendaftar: cek awal lolos tapi unique constraint menolak. */
function mapUniqueViolation(error: unknown): RegistrationError {
  const target = JSON.stringify(
    (error as { meta?: unknown }).meta ?? ""
  ).toLowerCase()

  if (target.includes("email")) return new RegistrationError("EMAIL_TAKEN")
  if (target.includes("npsn")) return new RegistrationError("NPSN_TAKEN")
  return new RegistrationError("SLUG_TAKEN")
}
