// Kenaikan kelas / pergantian semester (OB-04, PRD §6.2).
// ---------------------------------------------------------------------------
// Rombel melekat pada semester dan `enrollments` menghubungkan siswa ke rombel,
// jadi "pindahkan siswa" = membuat rombel di semester tujuan lalu enrollment
// baru. Rombel dan enrollment lama TIDAK disentuh: itulah arsipnya (rombel di
// semester yang tidak aktif tetap bisa dibaca).
//
// Aturan:
//   - Semester sumber dan tujuan milik sekolah ini, berbeda, tujuan lebih akhir.
//   - Semester tujuan harus belum punya rombel; menjalankan dua kali ditolak.
//   - Wali kelas dan kelas pembelajaran TIDAK disalin (mapel dan guru berbeda
//     per tingkat); admin menetapkannya ulang di /penugasan.
//   - Mode `promote`: tingkat + 1; rombel di tingkat tertinggi jenjang tidak
//     punya tujuan, siswanya dihitung lulus (tanpa enrollment baru).
//   - Semua penulisan dalam SATU transaksi tenantDb; semester tujuan tidak
//     otomatis aktif.

import { prisma } from "@/db/client"
import { tenantDb, type TenantDb } from "@/db/tenant"
import { GRADE_RANGES } from "@/features/academic/schema"
import { recordAudit, type AuditActor } from "@/features/audit/service"

import type { RolloverInput, RolloverPreviewInput } from "./schema"

export type RolloverErrorCode = "INVALID" | "DUPLICATE" | "NOT_FOUND"

export class RolloverError extends Error {
  constructor(
    readonly code: RolloverErrorCode,
    message: string
  ) {
    super(message)
    this.name = "RolloverError"
  }
}

const WRITE_TIMEOUT_MS = 60_000

const ROMAN: Record<number, string> = {
  1: "I",
  2: "II",
  3: "III",
  4: "IV",
  5: "V",
  6: "VI",
  7: "VII",
  8: "VIII",
  9: "IX",
  10: "X",
  11: "XI",
  12: "XII",
}

/**
 * Usulan nama rombel tujuan: hanya mengganti angka/romawi tingkat di AWAL nama
 * ("X-1" -> "XI-1", "7A" -> "8A"). Bila tidak cocok, nama dibiarkan sama; admin
 * yang menyuntingnya di pratinjau.
 */
export function suggestClassroomName(name: string, fromGrade: number, toGrade: number): string {
  if (fromGrade === toGrade) return name

  const roman = ROMAN[fromGrade]
  if (roman && new RegExp(`^${roman}(?![A-Za-z])`, "i").test(name)) {
    return (ROMAN[toGrade] ?? String(toGrade)) + name.slice(roman.length)
  }
  const digits = String(fromGrade)
  if (new RegExp(`^${digits}(?!\\d)`).test(name)) {
    return String(toGrade) + name.slice(digits.length)
  }
  return name
}

// ---------------------------------------------------------------------------
// Bentuk data untuk UI
// ---------------------------------------------------------------------------

export interface RolloverSemester {
  id: string
  name: string
  isActive: boolean
  startDate: Date
  endDate: Date
  classroomCount: number
}

export interface RolloverYear {
  id: string
  name: string
  isActive: boolean
  semesters: RolloverSemester[]
}

export interface RolloverPreviewRow {
  classroomId: string
  name: string
  grade: number
  majorCode: string | null
  studentCount: number
  /** null = tingkat tertinggi jenjang: siswa lulus, tidak ada rombel tujuan. */
  targetGrade: number | null
  suggestedName: string | null
}

export interface RolloverPreview {
  rows: RolloverPreviewRow[]
  /** Alasan operasi tidak bisa dijalankan; null bila siap. */
  blocked: string | null
}

export interface RolloverResult {
  classroomsCreated: number
  studentsMoved: number
  graduated: number
}

// ---------------------------------------------------------------------------
// Pembacaan
// ---------------------------------------------------------------------------

/** Semua tahun ajaran + jumlah rombel per semester, dalam satu snapshot. */
export function getRolloverBoard(schoolId: string): Promise<RolloverYear[]> {
  return tenantDb(schoolId, async (db) => {
    const years = await db.academicYear.findMany({
      orderBy: { startDate: "desc" },
      include: { semesters: { orderBy: { startDate: "asc" } } },
    })
    const counts = await db.classroom.groupBy({
      by: ["semesterId"],
      where: { deletedAt: null },
      _count: { _all: true },
    })
    const countOf = new Map(counts.map((row) => [row.semesterId, row._count._all]))

    return years.map((year) => ({
      id: year.id,
      name: year.name,
      isActive: year.isActive,
      semesters: year.semesters.map((semester) => ({
        id: semester.id,
        name: semester.name,
        isActive: semester.isActive,
        startDate: semester.startDate,
        endDate: semester.endDate,
        classroomCount: countOf.get(semester.id) ?? 0,
      })),
    }))
  })
}

async function schoolGradeRange(schoolId: string): Promise<readonly [number, number]> {
  const school = await prisma.school.findFirst({
    where: { id: schoolId, deletedAt: null },
    select: { level: true },
  })
  if (!school) throw new RolloverError("NOT_FOUND", "Sekolah tidak ditemukan.")
  return GRADE_RANGES[school.level]
}

function targetGradeOf(
  mode: RolloverPreviewInput["mode"],
  grade: number,
  maxGrade: number
): number | null {
  if (mode === "same") return grade
  return grade >= maxGrade ? null : grade + 1
}

async function loadPlan(db: TenantDb, input: RolloverPreviewInput, maxGrade: number) {
  if (input.sourceSemesterId === input.targetSemesterId) {
    throw new RolloverError("INVALID", "Semester sumber dan tujuan tidak boleh sama.")
  }
  const source = await db.semester.findFirst({ where: { id: input.sourceSemesterId } })
  if (!source) throw new RolloverError("NOT_FOUND", "Semester sumber tidak ditemukan.")
  const target = await db.semester.findFirst({ where: { id: input.targetSemesterId } })
  if (!target) throw new RolloverError("NOT_FOUND", "Semester tujuan tidak ditemukan.")

  let blocked: string | null = null
  if (target.startDate <= source.startDate) {
    blocked = "Semester tujuan harus berada setelah semester sumber."
  }
  const existing = await db.classroom.count({
    where: { semesterId: target.id, deletedAt: null },
  })
  if (!blocked && existing > 0) {
    blocked = `Semester ${target.name} sudah punya ${existing} rombel. Kenaikan hanya untuk semester yang masih kosong.`
  }

  const classrooms = await db.classroom.findMany({
    where: { semesterId: source.id, deletedAt: null },
    orderBy: [{ grade: "asc" }, { name: "asc" }],
    include: {
      major: { select: { code: true } },
      enrollments: {
        where: { student: { deletedAt: null } },
        select: { studentId: true },
      },
    },
  })
  if (!blocked && classrooms.length === 0) {
    blocked = `Semester ${source.name} belum punya rombel yang bisa dinaikkan.`
  }

  const rows: RolloverPreviewRow[] = classrooms.map((room) => {
    const targetGrade = targetGradeOf(input.mode, room.grade, maxGrade)
    return {
      classroomId: room.id,
      name: room.name,
      grade: room.grade,
      majorCode: room.major?.code ?? null,
      studentCount: room.enrollments.length,
      targetGrade,
      suggestedName:
        targetGrade === null ? null : suggestClassroomName(room.name, room.grade, targetGrade),
    }
  })

  return { target, classrooms, rows, blocked }
}

export async function previewRollover(
  schoolId: string,
  input: RolloverPreviewInput
): Promise<RolloverPreview> {
  const [, maxGrade] = await schoolGradeRange(schoolId)
  return tenantDb(schoolId, async (db) => {
    const { rows, blocked } = await loadPlan(db, input, maxGrade)
    return { rows, blocked }
  })
}

// ---------------------------------------------------------------------------
// Eksekusi
// ---------------------------------------------------------------------------

export async function runRollover(
  schoolId: string,
  actor: AuditActor,
  input: RolloverInput
): Promise<RolloverResult> {
  const [, maxGrade] = await schoolGradeRange(schoolId)

  return tenantDb(
    schoolId,
    async (db) => {
      // Dua admin yang menjalankan bersamaan: yang kedua menunggu, lalu melihat
      // semester tujuan sudah berisi dan ditolak (bukan membuat rombel ganda).
      await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.targetSemesterId}))`

      const { target, classrooms, rows, blocked } = await loadPlan(db, input, maxGrade)
      if (blocked) throw new RolloverError("INVALID", blocked)

      // Nama tujuan: hasil suntingan admin, atau usulan; unik tanpa beda huruf.
      const plan = classrooms.flatMap((room, index) => {
        const row = rows[index]
        if (row.targetGrade === null) return []
        const edited = input.names[room.id] as string | undefined
        const name = (edited ?? row.suggestedName ?? room.name).trim()
        return [{ room, grade: row.targetGrade, name }]
      })

      const seen = new Set<string>()
      for (const item of plan) {
        const key = item.name.toLowerCase()
        if (seen.has(key)) {
          throw new RolloverError(
            "DUPLICATE",
            `Nama rombel tujuan ${item.name} dipakai lebih dari sekali.`
          )
        }
        seen.add(key)
      }

      let studentsMoved = 0
      for (const item of plan) {
        const created = await db.classroom.create({
          data: {
            schoolId,
            semesterId: target.id,
            grade: item.grade,
            majorId: item.room.majorId,
            name: item.name,
          },
        })
        const studentIds = [...new Set(item.room.enrollments.map((e) => e.studentId))]
        if (studentIds.length > 0) {
          await db.enrollment.createMany({
            data: studentIds.map((studentId) => ({
              schoolId,
              classroomId: created.id,
              studentId,
            })),
          })
        }
        studentsMoved += studentIds.length
      }

      const graduated = rows
        .filter((row) => row.targetGrade === null)
        .reduce((sum, row) => sum + row.studentCount, 0)

      const result = { classroomsCreated: plan.length, studentsMoved, graduated }
      await recordAudit(db, schoolId, actor, {
        action: "rollover.run",
        entity: "semester",
        entityId: input.targetSemesterId,
        before: { sourceSemesterId: input.sourceSemesterId, mode: input.mode },
        after: result,
      })
      return result
    },
    { timeout: WRITE_TIMEOUT_MS }
  )
}
