// Impor guru & siswa dari berkas Excel (OB-02, PRD §6.2).
// ---------------------------------------------------------------------------
// Aturan penting:
//   - Berkas dibaca dan ditulis di worker pg-boss (runImportBatch), bukan di
//     request, supaya 1.000 siswa tidak memblokir halaman (PRD: < 2 menit).
//   - Semua kesalahan dikumpulkan per baris; proses tidak berhenti di baris
//     pertama yang salah.
//   - Baris duplikat (dalam berkas atau terhadap database) DITOLAK, bukan
//     menimpa data lama; impor diulang setelah koreksi tetap aman.
//   - `users` dan `accounts` tabel global (tanpa RLS) -> ditulis lewat
//     `prisma`. `teachers`, `students`, `enrollments`, `memberships`,
//     `import_batches`, `import_errors` model tenant -> wajib lewat
//     tenantDb(schoolId) (AGENTS.md aturan 1).

import { hashPassword } from "better-auth/crypto"
import { randomBytes } from "node:crypto"

import { prisma } from "@/db/client"
import { tenantDb, type TenantDb } from "@/db/tenant"
import type { Gender, ImportKind } from "@/generated/prisma/enums"
import { auth } from "@/lib/auth"
import { enqueueImportBatch } from "@/lib/jobs"
import { deleteFile, getFile, putFile, schoolKey } from "@/lib/storage"
import { uuidv7 } from "@/lib/uuid"

import {
  buildErrorReport,
  duplicateMessage,
  parseImportWorkbook,
  type ErrorReport,
  type ImportErrorRow,
  type RawImportRow,
} from "./excel"
import { PeopleImportError } from "./errors"
import {
  IMPORT_COLUMNS,
  IMPORT_MAX_BYTES,
  IMPORT_ROW_SCHEMAS,
  IMPORT_SHEET_NAMES,
  XLSX_CONTENT_TYPE,
  XLSX_EXTENSION,
  type ImportKindInput,
} from "./schema"

export { PeopleImportError }
export type { ErrorReport }

/** Potongan baris per transaksi: cukup kecil untuk RLS + timeout, cukup besar untuk 1.000 baris. */
const CHUNK_SIZE = 500

/** Batas transaksi penulisan batch: 5.000 baris + hash sudah dihitung sebelumnya. */
const WRITE_TIMEOUT_MS = 120_000

export interface ImportUploadInput {
  kind: ImportKindInput
  fileName: string
  body: Buffer
  contentType?: string
}

export interface ImportBatchSummary {
  id: string
  kind: ImportKind
  status: "queued" | "processing" | "done" | "failed"
  fileName: string
  totalRows: number
  importedRows: number
  failedRows: number
  errorMessage: string | null
  createdAt: Date
  finishedAt: Date | null
}

// ---------------------------------------------------------------------------
// Mulai impor
// ---------------------------------------------------------------------------

function assertUpload(input: ImportUploadInput): void {
  if (input.body.length === 0) {
    throw new PeopleImportError("INVALID", "Berkas kosong.")
  }
  if (input.body.length > IMPORT_MAX_BYTES) {
    throw new PeopleImportError(
      "INVALID",
      "Ukuran berkas maksimal 5 MB. Pisahkan menjadi beberapa berkas bila perlu."
    )
  }

  const byType = input.contentType === XLSX_CONTENT_TYPE
  const byName = input.fileName.toLowerCase().endsWith(XLSX_EXTENSION)
  if (!byType && !byName) {
    throw new PeopleImportError(
      "INVALID",
      "Berkas harus berformat .xlsx. Berkas .xls (Excel 97-2003) belum didukung."
    )
  }
}

function safeFileName(name: string): string {
  const base = name.replace(/[\\/]/g, " ").trim() || "impor.xlsx"
  return base.slice(0, 191)
}

function sourceKey(batchId: string): string[] {
  return ["imports", batchId, `source${XLSX_EXTENSION}`]
}

/** Kunci lengkap berkas sumber; `getFile`/`deleteFile` memakai kunci, bukan segmen. */
function sourceStorageKey(schoolId: string, batchId: string): string {
  return schoolKey(schoolId, ...sourceKey(batchId))
}

/**
 * Simpan berkas, buat batch berstatus `queued`, lalu antrekan ke worker.
 * Mengembalikan id batch supaya UI bisa menautkan laporan error.
 */
export async function startImport(
  schoolId: string,
  adminUserId: string,
  input: ImportUploadInput
): Promise<{ batchId: string }> {
  assertUpload(input)

  const batchId = uuidv7()
  const fileName = safeFileName(input.fileName)

  await putFile(schoolId, sourceKey(batchId), {
    body: input.body,
    contentType: XLSX_CONTENT_TYPE,
  })

  try {
    await tenantDb(schoolId, (db) =>
      db.importBatch.create({
        data: {
          id: batchId,
          schoolId,
          kind: input.kind,
          status: "queued",
          fileName,
          createdBy: adminUserId,
        },
      })
    )
  } catch (error) {
    await deleteFile(schoolId, sourceStorageKey(schoolId, batchId))
    throw error
  }

  await enqueueImportBatch(schoolId, batchId)
  return { batchId }
}

// ---------------------------------------------------------------------------
// Worker
// ---------------------------------------------------------------------------

/**
 * Satu baris yang lolos validasi. `profile` adalah hasil parse skema baris
 * (field guru atau siswa, sesuai jenis) ditambah id yang diisi saat penyimpanan.
 */
interface CandidateRow {
  rowNumber: number
  userId: string
  profile: {
    name: string
    // Guru
    code?: string
    email?: string
    nip?: string
    nuptk?: string
    phone?: string
    // Siswa
    nis?: string
    nisn?: string
    gender?: Gender | null
    classroom?: string
    classroomId?: string
    studentId?: string
  }
  email: string
  name: string
  classroomName?: string
}

function validateRow(kind: ImportKind, row: RawImportRow): string[] {
  const schema = IMPORT_ROW_SCHEMAS[kind]
  const result = schema.safeParse(row.values)
  if (result.success) return []
  return result.error.issues.map((issue) => issue.message)
}

function columnNameFor(kind: ImportKind, key: string): string {
  return IMPORT_COLUMNS[kind].find((column) => column.key === key)?.header ?? key
}

/** Email siswa tidak pernah dikirim; pakai domain `.invalid` (RFC 2606) yang tidak bisa dirutekan. */
function studentEmail(slug: string, nis: string): string {
  return `${nis}@${slug}.invalid`
}

function schoolHost(slug: string): string {
  const domain = process.env.APP_DOMAIN
  return domain ? `${slug}.${domain}` : `${slug}.localhost:3000`
}

async function hashInBatches(passwords: string[]): Promise<string[]> {
  // scrypt sengaja memakai threadpool Node (default 4), jadi parallelisme
  // dibatasi 8 agar tidak memblokir event loop worker.
  const hashes: string[] = new Array(passwords.length)
  let cursor = 0

  await Promise.all(
    Array.from({ length: Math.min(8, passwords.length) }, async () => {
      for (;;) {
        const index = cursor++
        if (index >= passwords.length) return
        hashes[index] = await hashPassword(passwords[index])
      }
    })
  )

  return hashes
}

function randomPassword(): string {
  return randomBytes(12).toString("base64url")
}

export interface RunImportResult {
  status: "done" | "failed"
  totalRows: number
  importedRows: number
  failedRows: number
}

/**
 * Isi satu batch. Dipanggil worker pg-boss; di test dipanggil langsung.
 * Aman dipanggil dua kali untuk batch yang sama: batch yang sudah selesai
 * tidak dikerjakan lagi.
 */
export async function runImportBatch(
  schoolId: string,
  batchId: string,
  now: Date = new Date()
): Promise<RunImportResult> {
  const batch = await tenantDb(schoolId, (db) =>
    db.importBatch.findFirst({ where: { id: batchId } })
  )
  if (!batch) throw new PeopleImportError("NOT_FOUND", "Batch impor tidak ditemukan.")
  if (batch.status === "done" || batch.status === "failed") {
    return {
      status: batch.status,
      totalRows: batch.totalRows,
      importedRows: batch.importedRows,
      failedRows: batch.failedRows,
    }
  }

  await tenantDb(schoolId, (db) =>
    db.importBatch.update({
      where: { id: batchId },
      data: { status: "processing", startedAt: batch.startedAt ?? now },
    })
  )

  const fail = async (message: string): Promise<RunImportResult> => {
    await tenantDb(schoolId, (db) =>
      db.importBatch.update({
        where: { id: batchId },
        data: { status: "failed", errorMessage: message.slice(0, 500), finishedAt: now },
      })
    )
    console.error(`[import] batch ${batchId} gagal:`, message)
    return { status: "failed", totalRows: 0, importedRows: 0, failedRows: 0 }
  }

  const source = await getFile(schoolId, sourceStorageKey(schoolId, batchId))
  if (!source) {
    return fail("Berkas sumber tidak ditemukan. Unggah ulang berkas Excel.")
  }

  const kind = batch.kind
  const school = await prisma.school.findFirst({
    where: { id: schoolId, deletedAt: null },
    select: { slug: true },
  })
  if (!school) return fail("Sekolah tidak ditemukan.")

  let rawRows: RawImportRow[]
  try {
    rawRows = await parseImportWorkbook(kind, source.body)
  } catch (error) {
    const message =
      error instanceof PeopleImportError ? error.message : "Berkas tidak bisa diproses."
    return fail(message)
  }

  const errors: ImportErrorRow[] = []
  const candidates: CandidateRow[] = []
  const seen = new Map<string, number>()
  const seenEmails = new Map<string, number>()

  for (const row of rawRows) {
    const messages = validateRow(kind, row)
    if (messages.length > 0) {
      for (const message of messages) {
        errors.push({
          rowNumber: row.rowNumber,
          column: null,
          value: truncate(row.values.name, 191),
          message,
        })
      }
      continue
    }

    const data = IMPORT_ROW_SCHEMAS[kind].parse(row.values) as CandidateRow["profile"]
    const key = kind === "teachers" ? String(data.code) : String(data.nis)
    const keyLower = key.toLowerCase()
    const previous = seen.get(keyLower)

    if (previous !== undefined) {
      errors.push({
        rowNumber: row.rowNumber,
        column: columnNameFor(kind, kind === "teachers" ? "code" : "nis"),
        value: truncate(key, 191),
        message: `${duplicateMessage(kind, key)} Baris ${previous} juga memakai nilai ini.`,
      })
      continue
    }
    if (kind === "teachers") {
      const emailLower = String(data.email).toLowerCase()
      const sameEmail = seenEmails.get(emailLower)
      if (sameEmail !== undefined) {
        errors.push({
          rowNumber: row.rowNumber,
          column: "Email",
          value: truncate(String(data.email), 191),
          message: `Email ini juga dipakai di baris ${sameEmail}. Setiap guru harus punya email sendiri.`,
        })
        continue
      }
      seenEmails.set(emailLower, row.rowNumber)
    }
    seen.set(keyLower, row.rowNumber)

    candidates.push({
      rowNumber: row.rowNumber,
      userId: uuidv7(now),
      name: String(data.name),
      email:
        kind === "teachers"
          ? String(data.email)
          : studentEmail(school.slug, String(data.nis)),
      profile: data,
      classroomName:
        kind === "students" && data.classroom ? String(data.classroom) : undefined,
    })
  }

  // Duplikat terhadap database sekolah ini.
  const existingKeys = await existingKeysInSchool(schoolId, kind)
  const usable = candidates.filter((candidate) => {
    const value = keyOf(kind, candidate)
    if (!existingKeys.has(value)) return true
    errors.push({
      rowNumber: candidate.rowNumber,
      column: columnNameFor(kind, kind === "teachers" ? "code" : "nis"),
      value: truncate(value, 191),
      message: duplicateMessage(kind, value),
    })
    return false
  })

  // Email guru harus unik global; email siswa sudah unik per (sekolah, NIS).
  if (kind === "teachers") {
    const taken = await takenTeacherEmails(usable.map((c) => c.email))
    for (let i = usable.length - 1; i >= 0; i--) {
      const candidate = usable[i]
      if (!taken.has(candidate.email.toLowerCase())) continue
      errors.push({
        rowNumber: candidate.rowNumber,
        column: "Email",
        value: candidate.email,
        message: "Email ini sudah terdaftar pada pengguna lain. Gunakan email lain.",
      })
      usable.splice(i, 1)
    }
  }

  // Rombel harus ada pada semester aktif.
  const classrooms =
    kind === "students" ? await activeClassroomNames(schoolId) : new Map<string, string>()
  const withClassroom = usable.filter((candidate) => {
    if (!candidate.classroomName) return true
    const classroomId = classrooms.get(candidate.classroomName.toLowerCase())
    if (classroomId) {
      candidate.profile.classroomId = classroomId
      return true
    }
    errors.push({
      rowNumber: candidate.rowNumber,
      column: "Rombel",
      value: truncate(candidate.classroomName, 191),
      message: classrooms.size
        ? `Rombel "${candidate.classroomName}" tidak ada pada semester aktif.`
        : `Rombel "${candidate.classroomName}" tidak bisa ditambahkan karena sekolah belum punya semester aktif.`,
    })
    return false
  })

  // Hash sandi (lambat) dikerjakan di luar transaksi.
  const hashes =
    kind === "teachers" && withClassroom.length > 0
      ? await hashInBatches(withClassroom.map(() => randomPassword()))
      : []

  // Semua penulisan batch (users, akun, profil, membership, laporan error, dan
  // status `done`) dalam SATU transaksi: gagal di tengah tidak meninggalkan
  // akun yatim yang kemudian memblokir email pada impor ulang, dan batch tidak
  // pernah `done` tanpa datanya.
  try {
    await tenantDb(
      schoolId,
      async (db) => {
        await writeRows(db, schoolId, kind, withClassroom, hashes)
        await saveErrors(db, schoolId, batchId, errors)
        await db.importBatch.update({
          where: { id: batchId },
          data: {
            status: "done",
            totalRows: rawRows.length,
            importedRows: withClassroom.length,
            failedRows: rawRows.length - withClassroom.length,
            finishedAt: now,
          },
        })
      },
      { timeout: WRITE_TIMEOUT_MS }
    )
  } catch (error) {
    return fail(`Penyimpanan gagal: ${(error as Error).message.slice(0, 300)}`)
  }

  // Sumber sudah tidak diperlukan dan berisi data pribadi (UU PDP §7).
  await deleteFile(schoolId, sourceStorageKey(schoolId, batchId))

  if (kind === "teachers" && withClassroom.length > 0) {
    await inviteTeachersToSetPassword(school.slug, withClassroom)
  }

  return {
    status: "done",
    totalRows: rawRows.length,
    importedRows: withClassroom.length,
    failedRows: rawRows.length - withClassroom.length,
  }
}

function truncate(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value
}

function keyOf(kind: ImportKind, candidate: CandidateRow): string {
  return String(kind === "teachers" ? candidate.profile.code : candidate.profile.nis)
}

async function existingKeysInSchool(
  schoolId: string,
  kind: ImportKind
): Promise<Set<string>> {
  return tenantDb(schoolId, async (db) => {
    if (kind === "teachers") {
      const rows = await db.teacher.findMany({
        where: { deletedAt: null },
        select: { code: true },
      })
      return new Set(rows.map((row) => row.code.toLowerCase()))
    }

    const rows = await db.student.findMany({
      where: { deletedAt: null },
      select: { nis: true },
    })
    return new Set(rows.map((row) => row.nis.toLowerCase()))
  })
}

async function takenTeacherEmails(emails: string[]): Promise<Set<string>> {
  if (emails.length === 0) return new Set()
  const users = await prisma.user.findMany({
    where: { OR: emails.map((email) => ({ email: { equals: email, mode: "insensitive" } })) },
    select: { email: true },
  })
  return new Set(users.map((user) => user.email.toLowerCase()))
}

async function activeClassroomNames(schoolId: string): Promise<Map<string, string>> {
  return tenantDb(schoolId, async (db) => {
    const semester = await db.semester.findFirst({ where: { isActive: true } })
    if (!semester) return new Map<string, string>()
    const classrooms = await db.classroom.findMany({
      where: { semesterId: semester.id, deletedAt: null },
      select: { id: true, name: true },
    })
    return new Map(classrooms.map((room) => [room.name.toLowerCase(), room.id]))
  })
}

async function writeRows(
  db: TenantDb,
  schoolId: string,
  kind: ImportKind,
  candidates: CandidateRow[],
  hashes: string[]
): Promise<void> {
  if (candidates.length === 0) return

  for (let start = 0; start < candidates.length; start += CHUNK_SIZE) {
    const chunk = candidates.slice(start, start + CHUNK_SIZE)

    // Tabel global: users + akun kredensial guru (siswa login lewat NIS + PIN).
    await db.user.createMany({
      data: chunk.map((candidate) => ({
        id: candidate.userId,
        email: candidate.email,
        name: candidate.name,
      })),
    })

    if (kind === "teachers") {
      await db.account.createMany({
        data: chunk.map((candidate, i) => ({
          userId: candidate.userId,
          providerId: "credential",
          accountId: candidate.userId,
          // Sandi awal acak yang tidak pernah dibagikan; satu-satunya jalan masuk
          // adalah tautan "atur sandi" yang dikirim ke email guru.
          password: hashes[start + i],
        })),
      })
    }

    if (kind === "teachers") {
      await db.teacher.createMany({
        data: chunk.map((candidate) => ({
          id: uuidv7(),
          schoolId,
          userId: candidate.userId,
          code: candidate.profile.code ?? "",
          nip: candidate.profile.nip ?? null,
          nuptk: candidate.profile.nuptk ?? null,
          gender: candidate.profile.gender ?? null,
          phone: candidate.profile.phone ?? null,
        })),
      })
    } else {
      await db.student.createMany({
        data: chunk.map((candidate) => {
          // Id dibuat di sini juga supaya enrollment pada potongan yang sama
          // langsung tahu siswa mana yang dimaksud.
          const studentId = uuidv7()
          candidate.profile.studentId = studentId
          return {
            id: studentId,
            schoolId,
            userId: candidate.userId,
            nis: candidate.profile.nis ?? "",
            nisn: candidate.profile.nisn ?? null,
            gender: candidate.profile.gender ?? null,
          }
        }),
      })

      const enrollments = chunk.filter((candidate) => candidate.profile.classroomId)
      if (enrollments.length > 0) {
        await db.enrollment.createMany({
          data: enrollments.map((candidate) => ({
            id: uuidv7(),
            schoolId,
            studentId: candidate.profile.studentId ?? "",
            classroomId: candidate.profile.classroomId ?? "",
          })),
        })
      }
    }

    await db.membership.createMany({
      data: chunk.map((candidate) => ({
        schoolId,
        userId: candidate.userId,
        role: kind === "teachers" ? ("teacher" as const) : ("student" as const),
      })),
      skipDuplicates: true,
    })
  }
}

async function saveErrors(
  db: TenantDb,
  schoolId: string,
  batchId: string,
  errors: ImportErrorRow[]
): Promise<void> {
  if (errors.length === 0) return

  for (let start = 0; start < errors.length; start += CHUNK_SIZE) {
    const chunk = errors.slice(start, start + CHUNK_SIZE)
    await db.importError.createMany({
      data: chunk.map((error) => ({
        schoolId,
        batchId,
        rowNumber: error.rowNumber,
        column: error.column,
        value: error.value,
        message: error.message.slice(0, 300),
      })),
    })
  }
}

/**
 * Guru diberi tautan atur sandi lewat email (US-02). Kegagalan email tidak
 * membatalkan impor; guru tetap bisa memakai "Lupa sandi" di halaman login.
 */
async function inviteTeachersToSetPassword(
  slug: string,
  teachers: CandidateRow[]
): Promise<void> {
  const protocol = process.env.NODE_ENV === "production" ? "https" : "http"
  const host = schoolHost(slug)
  const redirectTo = `${protocol}://${host}/atur-ulang-sandi`

  for (const teacher of teachers) {
    try {
      await auth.api.requestPasswordReset({
        body: { email: teacher.email, redirectTo },
        headers: new Headers({ host }),
      })
    } catch (error) {
      console.error("[import] email atur sandi guru gagal:", error)
    }
  }
}

// ---------------------------------------------------------------------------
// Pembacaan hasil
// ---------------------------------------------------------------------------

export function listImportBatches(
  schoolId: string,
  limit = 20
): Promise<ImportBatchSummary[]> {
  return tenantDb(schoolId, async (db) => {
    const batches = await db.importBatch.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
    })
    return batches.map((batch) => ({
      id: batch.id,
      kind: batch.kind,
      status: batch.status,
      fileName: batch.fileName,
      totalRows: batch.totalRows,
      importedRows: batch.importedRows,
      failedRows: batch.failedRows,
      errorMessage: batch.errorMessage,
      createdAt: batch.createdAt,
      finishedAt: batch.finishedAt,
    }))
  })
}

export async function getImportErrorReport(
  schoolId: string,
  batchId: string
): Promise<ErrorReport> {
  // tenantDb otomatis membatasi school_id, jadi batch sekolah lain tidak
  // terlihat di sini (gagal tertutup).
  const batch = await tenantDb(schoolId, (db) =>
    db.importBatch.findFirst({
      where: { id: batchId },
      include: { errors: { orderBy: { rowNumber: "asc" } } },
    })
  )
  if (!batch) throw new PeopleImportError("NOT_FOUND", "Data impor tidak ditemukan.")

  return buildErrorReport({
    kind: batch.kind,
    fileName: batch.fileName,
    finishedAt: batch.finishedAt,
    totalRows: batch.totalRows,
    importedRows: batch.importedRows,
    errors: batch.errors.map((error) => ({
      rowNumber: error.rowNumber,
      column: error.column,
      value: error.value,
      message: error.message,
    })),
  })
}

/** Nama sheet template, dipakai halaman UI untuk menjelaskan format berkas. */
export function templateSheetName(kind: ImportKind): string {
  return IMPORT_SHEET_NAMES[kind]
}