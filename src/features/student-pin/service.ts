// PIN login siswa (US-01).
// ---------------------------------------------------------------------------
//   - `student_pins` model tenant -> selalu lewat tenantDb(schoolId).
//   - Hanya hash (scrypt, better-auth/crypto) yang disimpan; PIN asli hanya
//     dikembalikan sekali saat dibuat dan tidak pernah masuk log atau audit.
//   - Membuat ulang PIN menimpa yang lama dan mencabut semua sesi siswa itu.
//   - verifyStudentPin selalu menjalankan satu verifikasi hash (hash palsu bila
//     NIS tidak ada) supaya waktu respons tidak membedakan penyebab gagal.

import { randomInt } from "node:crypto"

import { hashPassword, verifyPassword } from "better-auth/crypto"

import { tenantDb, type TenantDb } from "@/db/tenant"
import { recordAudit, type AuditActor } from "@/features/audit/service"

const PIN_MIN = 100_000
const PIN_MAX = 1_000_000 // eksklusif -> 100000..999999
const BULK_TIMEOUT_MS = 120_000

export class StudentPinError extends Error {
  constructor(
    readonly code: "NOT_FOUND",
    message: string
  ) {
    super(message)
    this.name = "StudentPinError"
  }
}

export interface PinRow {
  studentId: string
  nis: string
  name: string
  pin: string
}

/** PIN 6 digit, digit pertama 1-9 (CSV/spreadsheet tidak membuang nol di depan). */
export function generatePin(): string {
  return String(randomInt(PIN_MIN, PIN_MAX))
}

/** Menyimpan PIN baru (upsert) dan mencabut sesi pengguna siswa. */
async function savePin(
  db: TenantDb,
  schoolId: string,
  student: { id: string; userId: string }
): Promise<string> {
  const pin = generatePin()
  const pinHash = await hashPassword(pin)

  await db.studentPin.upsert({
    where: { schoolId_studentId: { schoolId, studentId: student.id } },
    create: { schoolId, studentId: student.id, pinHash },
    update: { pinHash },
  })
  await db.session.deleteMany({ where: { userId: student.userId } })

  return pin
}

export function issueStudentPin(
  schoolId: string,
  actor: AuditActor,
  studentId: string
): Promise<{ pin: string }> {
  return tenantDb(schoolId, async (db) => {
    const student = await db.student.findFirst({
      where: { id: studentId, deletedAt: null },
      select: { id: true, nis: true, userId: true },
    })
    if (!student) throw new StudentPinError("NOT_FOUND", "Siswa tidak ditemukan.")

    const pin = await savePin(db, schoolId, student)
    await recordAudit(db, schoolId, actor, {
      action: "student.pin_issue",
      entity: "student",
      entityId: student.id,
      after: { nis: student.nis },
    })
    return { pin }
  })
}

/**
 * PIN untuk semua siswa rombel yang BELUM punya PIN. Yang sudah punya
 * dilewati (`skipped`); PIN-nya diganti per siswa lewat issueStudentPin.
 * Satu transaksi: gagal di tengah = tidak ada PIN yang berubah.
 */
export function issuePinsForClassroom(
  schoolId: string,
  actor: AuditActor,
  classroomId: string
): Promise<{ rows: PinRow[]; skipped: number }> {
  return tenantDb(
    schoolId,
    async (db) => {
      const classroom = await db.classroom.findFirst({
        where: { id: classroomId, deletedAt: null },
        select: { id: true, name: true },
      })
      if (!classroom) throw new StudentPinError("NOT_FOUND", "Rombel tidak ditemukan.")

      const enrollments = await db.enrollment.findMany({
        where: { classroomId, student: { deletedAt: null } },
        select: {
          student: {
            select: {
              id: true,
              nis: true,
              userId: true,
              user: { select: { name: true } },
            },
          },
        },
      })
      const students = enrollments
        .map((row) => row.student)
        .sort((a, b) => a.user.name.localeCompare(b.user.name, "id"))

      const rows: PinRow[] = []
      let skipped = 0
      for (const student of students) {
        const existing = await db.studentPin.findFirst({
          where: { studentId: student.id },
          select: { id: true },
        })
        if (existing) {
          skipped++
          continue
        }
        const pin = await savePin(db, schoolId, student)
        rows.push({
          studentId: student.id,
          nis: student.nis,
          name: student.user.name,
          pin,
        })
      }

      await recordAudit(db, schoolId, actor, {
        action: "student.pin_issue_bulk",
        entity: "classroom",
        entityId: classroom.id,
        after: { classroom: classroom.name, created: rows.length, skipped },
      })
      return { rows, skipped }
    },
    { timeout: BULK_TIMEOUT_MS }
  )
}

let dummyHash: Promise<string> | undefined
/** Hash tetap untuk menyamakan waktu verifikasi saat NIS tidak ada. */
function getDummyHash(): Promise<string> {
  dummyHash ??= hashPassword("100000")
  return dummyHash
}

/**
 * Memeriksa NIS + PIN di satu sekolah. Mengembalikan userId bila cocok dan
 * siswa aktif (tidak dihapus, membership `student` aktif); selain itu null.
 */
export async function verifyStudentPin(
  schoolId: string,
  nis: string,
  pin: string
): Promise<{ userId: string } | null> {
  const found = await tenantDb(schoolId, async (db) => {
    const student = await db.student.findFirst({
      where: { nis, deletedAt: null },
      select: { id: true, userId: true },
    })
    if (!student) return null

    const stored = await db.studentPin.findFirst({
      where: { studentId: student.id },
      select: { pinHash: true },
    })
    const membership = await db.membership.findFirst({
      where: {
        userId: student.userId,
        role: "student",
        status: "active",
        deletedAt: null,
      },
      select: { id: true },
    })
    return {
      userId: student.userId,
      pinHash: stored?.pinHash ?? null,
      active: membership !== null,
    }
  })

  const hash = found?.pinHash ?? (await getDummyHash())
  const matches = await verifyPassword({ hash, password: pin })

  if (found && found.pinHash && found.active && matches) {
    return { userId: found.userId }
  }
  return null
}
