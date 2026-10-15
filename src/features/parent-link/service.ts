// Penautan orang tua <-> siswa lewat kode undangan (OB-05, PRD §6.2).
// ---------------------------------------------------------------------------
// Aturan penting:
//   - Kode 8 karakter acak (alfabet tanpa 0/O/1/I), hanya hash SHA-256 yang
//     disimpan; kode asli terlihat SEKALI saat dibuat. Kedaluwarsa 14 hari,
//     sekali pakai, bisa dicabut.
//   - Satu siswa paling banyak 5 baris aktif (tertaut + kode menunggu).
//   - Penukaran kode atomik: update bersyarat `parent_user_id IS NULL`, jadi
//     dua penukaran bersamaan hanya satu yang berhasil. Pembuatan akun +
//     membership + tautan dalam SATU transaksi tenantDb.
//   - Kode salah / kedaluwarsa / terpakai / dicabut / milik sekolah lain
//     semuanya memberi pesan yang sama (tidak membocorkan status kode).
//   - Orang tua hanya melihat anak yang tertaut dan belum dicabut.

import { createHash, randomInt, randomUUID } from "node:crypto"

import { hashPassword } from "better-auth/crypto"

import { tenantDb, type TenantDb } from "@/db/tenant"

export type ParentLinkErrorCode =
  | "NOT_FOUND"
  | "LIMIT"
  | "INVALID_CODE"
  | "EMAIL_TAKEN"
  | "ROLE_CONFLICT"
  | "ALREADY_LINKED"

export class ParentLinkError extends Error {
  constructor(
    readonly code: ParentLinkErrorCode,
    message: string
  ) {
    super(message)
    this.name = "ParentLinkError"
  }
}

export const INVALID_CODE_MESSAGE =
  "Kode tidak valid atau sudah tidak berlaku. Minta kode baru ke sekolah."

export const INVITE_TTL_DAYS = 14
export const MAX_LINKS_PER_STUDENT = 5
const CODE_LENGTH = 8
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
const BULK_TIMEOUT_MS = 60_000

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  )
}

// ---------------------------------------------------------------------------
// Kode
// ---------------------------------------------------------------------------

function generateCode(): string {
  let code = ""
  for (let i = 0; i < CODE_LENGTH; i++)
    code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]
  return code
}

export function formatCode(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4)}`
}

/** Huruf besar tanpa spasi/tanda hubung; null bila bentuknya tidak mungkin sebuah kode. */
export function normalizeCode(input: string): string | null {
  const code = input.toUpperCase().replace(/[\s-]/g, "")
  if (code.length !== CODE_LENGTH) return null
  for (const char of code) if (!CODE_ALPHABET.includes(char)) return null
  return code
}

export function hashCode(schoolId: string, code: string): string {
  return createHash("sha256").update(`${schoolId}:${code}`).digest("hex")
}

function expiryFrom(now: Date): Date {
  return new Date(now.getTime() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000)
}

// ---------------------------------------------------------------------------
// Bentuk data untuk UI
// ---------------------------------------------------------------------------

export interface InviteCreated {
  /** Kode terformat XXXX-XXXX; hanya tersedia saat ini. */
  code: string
  expiresAt: Date
}

export interface BulkInviteRow extends InviteCreated {
  studentId: string
  nis: string
  name: string
}

export interface StudentLinks {
  studentId: string
  nis: string
  name: string
  linked: {
    linkId: string
    parentName: string
    parentEmail: string
    linkedAt: Date
  }[]
  pending: { linkId: string; createdAt: Date; expiresAt: Date }[]
}

export interface Child {
  studentId: string
  name: string
  classroomName: string | null
}

// ---------------------------------------------------------------------------
// Pembuatan kode (admin)
// ---------------------------------------------------------------------------

async function activeCount(
  db: TenantDb,
  studentId: string,
  now: Date
): Promise<number> {
  return db.parentLink.count({
    where: {
      studentId,
      revokedAt: null,
      OR: [{ parentUserId: { not: null } }, { codeExpiresAt: { gt: now } }],
    },
  })
}

async function issueInvite(
  db: TenantDb,
  schoolId: string,
  studentId: string,
  now: Date
): Promise<InviteCreated> {
  if ((await activeCount(db, studentId, now)) >= MAX_LINKS_PER_STUDENT) {
    throw new ParentLinkError(
      "LIMIT",
      `Siswa ini sudah punya ${MAX_LINKS_PER_STUDENT} orang tua atau kode aktif. Cabut salah satunya dulu.`
    )
  }

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateCode()
    const codeHash = hashCode(schoolId, code)
    if (
      await db.parentLink.findFirst({
        where: { codeHash },
        select: { id: true },
      })
    )
      continue

    const expiresAt = expiryFrom(now)
    await db.parentLink.create({
      data: { schoolId, studentId, codeHash, codeExpiresAt: expiresAt },
    })
    return { code: formatCode(code), expiresAt }
  }
  throw new Error("Gagal membuat kode unik")
}

async function requireStudent(db: TenantDb, studentId: string) {
  const student = await db.student.findFirst({
    where: { id: studentId, deletedAt: null },
    include: { user: { select: { name: true } } },
  })
  if (!student) throw new ParentLinkError("NOT_FOUND", "Siswa tidak ditemukan.")
  return student
}

export function createInvite(
  schoolId: string,
  studentId: string,
  now: Date = new Date()
): Promise<InviteCreated> {
  return tenantDb(schoolId, async (db) => {
    await requireStudent(db, studentId)
    return issueInvite(db, schoolId, studentId, now)
  })
}

/**
 * Kode untuk semua siswa satu rombel yang BELUM punya orang tua tertaut atau
 * kode menunggu. Yang sudah punya dilewati (kodenya tidak bisa ditampilkan
 * ulang). Satu transaksi: gagal di tengah = tidak ada kode yang dibuat.
 */
export function createInvitesForClassroom(
  schoolId: string,
  classroomId: string,
  now: Date = new Date()
): Promise<{ rows: BulkInviteRow[]; skipped: number }> {
  return tenantDb(
    schoolId,
    async (db) => {
      const classroom = await db.classroom.findFirst({
        where: { id: classroomId, deletedAt: null },
      })
      if (!classroom)
        throw new ParentLinkError("NOT_FOUND", "Rombel tidak ditemukan.")

      const enrollments = await db.enrollment.findMany({
        where: { classroomId, student: { deletedAt: null } },
        include: { student: { include: { user: { select: { name: true } } } } },
      })
      const students = enrollments
        .map((row) => row.student)
        .sort((a, b) => a.user.name.localeCompare(b.user.name, "id"))

      const rows: BulkInviteRow[] = []
      let skipped = 0
      for (const student of students) {
        if ((await activeCount(db, student.id, now)) > 0) {
          skipped++
          continue
        }
        const invite = await issueInvite(db, schoolId, student.id, now)
        rows.push({
          ...invite,
          studentId: student.id,
          nis: student.nis,
          name: student.user.name,
        })
      }
      return { rows, skipped }
    },
    { timeout: BULK_TIMEOUT_MS }
  )
}

export function revokeLink(
  schoolId: string,
  linkId: string,
  now: Date = new Date()
) {
  return tenantDb(schoolId, async (db) => {
    const { count } = await db.parentLink.updateMany({
      where: { id: linkId, revokedAt: null },
      data: { revokedAt: now },
    })
    if (count === 0)
      throw new ParentLinkError(
        "NOT_FOUND",
        "Tautan atau kode tidak ditemukan."
      )
  })
}

export function listClassroomLinks(
  schoolId: string,
  classroomId: string,
  now: Date = new Date()
): Promise<StudentLinks[]> {
  return tenantDb(schoolId, async (db) => {
    const classroom = await db.classroom.findFirst({
      where: { id: classroomId, deletedAt: null },
    })
    if (!classroom)
      throw new ParentLinkError("NOT_FOUND", "Rombel tidak ditemukan.")

    const enrollments = await db.enrollment.findMany({
      where: { classroomId, student: { deletedAt: null } },
      select: { studentId: true },
    })
    const studentIds = enrollments.map((row) => row.studentId)

    const students = await db.student.findMany({
      where: { id: { in: studentIds } },
      include: { user: { select: { name: true } } },
    })
    const links = await db.parentLink.findMany({
      where: { studentId: { in: studentIds }, revokedAt: null },
      include: { parentUser: { select: { name: true, email: true } } },
      orderBy: { createdAt: "asc" },
    })

    return students
      .map((student) => {
        const own = links.filter((link) => link.studentId === student.id)
        return {
          studentId: student.id,
          nis: student.nis,
          name: student.user.name,
          linked: own.flatMap((link) =>
            link.parentUser && link.linkedAt
              ? [
                  {
                    linkId: link.id,
                    parentName: link.parentUser.name,
                    parentEmail: link.parentUser.email,
                    linkedAt: link.linkedAt,
                  },
                ]
              : []
          ),
          pending: own
            .filter(
              (link) => link.parentUserId === null && link.codeExpiresAt > now
            )
            .map((link) => ({
              linkId: link.id,
              createdAt: link.createdAt,
              expiresAt: link.codeExpiresAt,
            })),
        }
      })
      .sort((a, b) => a.name.localeCompare(b.name, "id"))
  })
}

// ---------------------------------------------------------------------------
// Penukaran kode (orang tua)
// ---------------------------------------------------------------------------

export type JoinIdentity =
  | { kind: "existing"; userId: string }
  | { kind: "new"; name: string; email: string; password: string }

export async function redeemInvite(
  schoolId: string,
  rawCode: string,
  identity: JoinIdentity,
  now: Date = new Date()
): Promise<{ userId: string; studentName: string }> {
  const code = normalizeCode(rawCode)
  if (!code) throw new ParentLinkError("INVALID_CODE", INVALID_CODE_MESSAGE)
  const codeHash = hashCode(schoolId, code)

  // Hash sandi di luar transaksi (mahal), supaya transaksi tetap singkat.
  const passwordHash =
    identity.kind === "new" ? await hashPassword(identity.password) : null

  try {
    return await tenantDb(schoolId, async (db) => {
      const link = await db.parentLink.findFirst({
        where: {
          codeHash,
          parentUserId: null,
          revokedAt: null,
          codeExpiresAt: { gt: now },
          student: { deletedAt: null },
        },
        include: { student: { include: { user: { select: { name: true } } } } },
      })
      if (!link) throw new ParentLinkError("INVALID_CODE", INVALID_CODE_MESSAGE)

      let userId: string
      if (identity.kind === "new") {
        if (
          await db.user.findUnique({
            where: { email: identity.email },
            select: { id: true },
          })
        ) {
          throw new ParentLinkError(
            "EMAIL_TAKEN",
            "Email sudah terdaftar. Masuk dulu, lalu masukkan kode."
          )
        }
        userId = randomUUID()
        await db.user.create({
          data: { id: userId, email: identity.email, name: identity.name },
        })
        await db.account.create({
          data: {
            userId,
            providerId: "credential",
            accountId: userId,
            password: passwordHash,
          },
        })
      } else {
        userId = identity.userId
      }

      const membership = await db.membership.findFirst({ where: { userId } })
      if (membership) {
        if (
          membership.role !== "parent" ||
          membership.status !== "active" ||
          membership.deletedAt
        ) {
          throw new ParentLinkError(
            "ROLE_CONFLICT",
            "Akun ini sudah terdaftar dengan peran lain di sekolah ini. Gunakan email lain untuk akun orang tua."
          )
        }
      } else {
        await db.membership.create({
          data: { schoolId, userId, role: "parent" },
        })
      }

      const { count } = await db.parentLink.updateMany({
        where: { id: link.id, parentUserId: null, revokedAt: null },
        data: { parentUserId: userId, linkedAt: now },
      })
      if (count === 0)
        throw new ParentLinkError("INVALID_CODE", INVALID_CODE_MESSAGE)

      return { userId, studentName: link.student.user.name }
    })
  } catch (error) {
    if (isUniqueViolation(error)) {
      // Indeks unik parsial (orang tua sama, siswa sama) atau email kembar
      // pada pendaftaran bersamaan.
      if (identity.kind === "new") {
        throw new ParentLinkError(
          "EMAIL_TAKEN",
          "Email sudah terdaftar. Masuk dulu, lalu masukkan kode."
        )
      }
      throw new ParentLinkError(
        "ALREADY_LINKED",
        "Anak ini sudah tertaut ke akun Anda."
      )
    }
    throw error
  }
}

// ---------------------------------------------------------------------------
// Anak yang tertaut (orang tua)
// ---------------------------------------------------------------------------

export function listChildren(
  schoolId: string,
  parentUserId: string
): Promise<Child[]> {
  return tenantDb(schoolId, async (db) => {
    const links = await db.parentLink.findMany({
      where: { parentUserId, revokedAt: null, student: { deletedAt: null } },
      include: { student: { include: { user: { select: { name: true } } } } },
      orderBy: { linkedAt: "asc" },
    })
    const studentIds = links.map((link) => link.studentId)
    const enrollments = await db.enrollment.findMany({
      where: {
        studentId: { in: studentIds },
        classroom: { semester: { isActive: true }, deletedAt: null },
      },
      include: { classroom: { select: { name: true } } },
    })

    return links.map((link) => ({
      studentId: link.studentId,
      name: link.student.user.name,
      classroomName:
        enrollments.find((row) => row.studentId === link.studentId)?.classroom
          .name ?? null,
    }))
  })
}
