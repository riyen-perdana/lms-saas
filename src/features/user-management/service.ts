// Manajemen pengguna oleh admin sekolah (US-02).
// ---------------------------------------------------------------------------
//   - `teachers`/`students` model tenant -> selalu lewat tenantDb(schoolId).
//     `users` dan `schools.slug` tabel global -> `prisma`.
//   - Reset sandi guru = email tautan "atur sandi" (Better Auth), alur yang
//     sama dengan impor OB-02. Admin tidak pernah melihat sandi.
//   - Audit dicatat di DALAM transaksi; email dikirim setelah commit.
//   - Siswa login lewat NIS + PIN (US-01); reset PIN dikerjakan di sana.

import { prisma } from "@/db/client"
import { tenantDb } from "@/db/tenant"
import { recordAudit, type AuditActor } from "@/features/audit/service"
import { auth } from "@/lib/auth"
import { schoolHost } from "@/lib/tenant/host"

import {
  PEOPLE_LIMIT,
  listPeopleSchema,
  type ListPeopleInput,
} from "./schema"

export type UserManagementErrorCode = "NOT_FOUND" | "EMAIL_FAILED"

export class UserManagementError extends Error {
  constructor(
    readonly code: UserManagementErrorCode,
    message: string
  ) {
    super(message)
    this.name = "UserManagementError"
  }
}

export interface PersonRow {
  id: string
  role: "teacher" | "student"
  name: string
  /** Kode guru atau NIS. */
  identifier: string
  /** Email nyata; null untuk siswa (emailnya palsu `.invalid`). */
  email: string | null
}

export interface PeopleList {
  rows: PersonRow[]
  /** True bila ada lebih dari PEOPLE_LIMIT hasil; persempit pencarian. */
  truncated: boolean
}

export async function listPeople(
  schoolId: string,
  input: ListPeopleInput = {}
): Promise<PeopleList> {
  const { role, q } = listPeopleSchema.parse(input)
  const take = PEOPLE_LIMIT + 1
  const like = { contains: q, mode: "insensitive" as const }

  const rows = await tenantDb(schoolId, async (db) => {
    const teachers =
      role === "student"
        ? []
        : await db.teacher.findMany({
            where: {
              deletedAt: null,
              ...(q
                ? {
                    OR: [
                      { code: like },
                      { user: { name: like } },
                      { user: { email: like } },
                    ],
                  }
                : {}),
            },
            orderBy: { user: { name: "asc" } },
            take,
            select: {
              id: true,
              code: true,
              user: { select: { name: true, email: true } },
            },
          })

    const students =
      role === "teacher"
        ? []
        : await db.student.findMany({
            where: {
              deletedAt: null,
              ...(q ? { OR: [{ nis: like }, { user: { name: like } }] } : {}),
            },
            orderBy: { user: { name: "asc" } },
            take,
            select: { id: true, nis: true, user: { select: { name: true } } },
          })

    return [
      ...teachers.map(
        (teacher): PersonRow => ({
          id: teacher.id,
          role: "teacher",
          name: teacher.user.name,
          identifier: teacher.code,
          email: teacher.user.email,
        })
      ),
      ...students.map(
        (student): PersonRow => ({
          id: student.id,
          role: "student",
          name: student.user.name,
          identifier: student.nis,
          email: null,
        })
      ),
    ]
  })

  rows.sort((a, b) => a.name.localeCompare(b.name, "id"))
  return {
    rows: rows.slice(0, PEOPLE_LIMIT),
    truncated: rows.length > PEOPLE_LIMIT,
  }
}

const NOT_FOUND_MESSAGE = "Guru tidak ditemukan."

/**
 * Mengirim email tautan atur sandi ke seorang guru. Guru sekolah lain, id
 * tak dikenal, dan guru yang sudah dihapus semuanya NOT_FOUND (tidak
 * membocorkan keberadaan lintas sekolah).
 */
export async function requestTeacherPasswordReset(
  schoolId: string,
  actor: AuditActor,
  teacherId: string
): Promise<void> {
  const email = await tenantDb(schoolId, async (db) => {
    const teacher = await db.teacher.findFirst({
      where: { id: teacherId, deletedAt: null },
      select: { code: true, user: { select: { email: true } } },
    })
    if (!teacher) throw new UserManagementError("NOT_FOUND", NOT_FOUND_MESSAGE)

    await recordAudit(db, schoolId, actor, {
      action: "user.password_reset",
      entity: "teacher",
      entityId: teacherId,
      after: { code: teacher.code },
    })
    return teacher.user.email
  })

  const school = await prisma.school.findFirst({
    where: { id: schoolId, deletedAt: null },
    select: { slug: true },
  })
  if (!school) throw new UserManagementError("NOT_FOUND", NOT_FOUND_MESSAGE)

  const protocol = process.env.NODE_ENV === "production" ? "https" : "http"
  const host = schoolHost(school.slug)

  try {
    await auth.api.requestPasswordReset({
      body: { email, redirectTo: `${protocol}://${host}/atur-ulang-sandi` },
      headers: new Headers({ host }),
    })
  } catch (error) {
    console.error("[user-management] email reset sandi guru gagal:", error)
    throw new UserManagementError(
      "EMAIL_FAILED",
      "Email gagal dikirim, coba lagi."
    )
  }
}
