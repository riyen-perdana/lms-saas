// Baca & tulis berkas Excel untuk impor guru/siswa (OB-02).
// ---------------------------------------------------------------------------
// Semua pilihan kolom template ada di `schema.ts` (IMPORT_COLUMNS), jadi header,
// pemetaan sel, dan laporan error tidak bisa berbeda satu sama lain.
//
// Kesalahan tingkat berkas (format, sheet, judul kolom) dilempar sebagai
// PeopleImportError "INVALID". Kesalahan per baris TIDAK dilempar di sini:
// validateRow di service.ts yang menilainya supaya bisa dikumpulkan semua.

import { createRequire } from "node:module"
import type * as ExcelJSModule from "exceljs"
import type { ImportKind } from "@/generated/prisma/enums"

import { PeopleImportError } from "./errors"
import {
  IMPORT_COLUMNS,
  IMPORT_KEY_LABELS,
  IMPORT_KIND_LABELS,
  IMPORT_MAX_ROWS,
  IMPORT_MAX_UNCOMPRESSED_BYTES,
  IMPORT_SHEET_NAMES,
} from "./schema"

/**
 * exceljs hanya CommonJS dan `module.exports`-nya tidak bisa dibaca analisis
 * statis Vite, jadi impor named (`import { Workbook }`) gagal saat SSR
 * (dev server dan build). `createRequire` memuatnya lewat Node apa adanya;
 * tipe tetap diambil dari deklarasi paket. Modul ini hanya boleh dipakai di
 * server (route API dan worker), tidak pernah di bundel klien.
 */
const ExcelJS = createRequire(import.meta.url)("exceljs") as typeof ExcelJSModule

export interface RawImportRow {
  /** Nomor baris di Excel (baris judul = 1, jadi data mulai dari 2). */
  rowNumber: number
  values: Record<string, string>
}

/**
 * exceljs mendeklarasikan tipe Buffer-nya sendiri (ArrayBuffer, bukan
 * ArrayBufferLike). Semua pertukaran data masuk/keluar pustaka ini lewat
 * {@link asExcelJsBuffer} dan {@link fromExcelJsBuffer} supaya tidak ada
 * `as any` yang menyebar ke seluruh modul.
 */
export type ExcelJsBuffer = Parameters<ExcelJSModule.Workbook["xlsx"]["load"]>[0]

export function asExcelJsBuffer(body: Uint8Array): ExcelJsBuffer {
  return body as unknown as ExcelJsBuffer
}

export function fromExcelJsBuffer(data: unknown): Buffer {
  return Buffer.from(new Uint8Array(data as ArrayBuffer))
}

export interface ImportErrorRow {
  /** 0 berarti kesalahan pada berkas, bukan pada baris tertentu. */
  rowNumber: number
  column: string | null
  value: string | null
  message: string
}

/** Teks apa pun dari sebuah sel: angka, tanggal, rich text, hasil rumus. */
function cellText(value: ExcelJSModule.CellValue): string {
  if (value === null || value === undefined) return ""
  if (typeof value === "string") return value.trim()
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  if (value instanceof Date) return value.toISOString().slice(0, 10)

  if (typeof value === "object") {
    if ("richText" in value) {
      return value.richText.map((part) => part.text).join("").trim()
    }
    if ("text" in value && typeof value.text === "string") return value.text.trim()
    if ("result" in value) return cellText(value.result)
    // Sel berisi formula yang gagal (mis. #REF!): perlakukan sebagai kosong.
    if ("error" in value) return ""
  }

  return String(value).trim()
}

/** Samakan judul kolom: "Kode  Guru" dan "kode guru" dianggap sama. */
function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replaceAll(/\s+/g, " ")
}

// ---------------------------------------------------------------------------
// Template
// ---------------------------------------------------------------------------

const INSTRUCTIONS: Record<ImportKind, string[]> = {
  teachers: [
    "Cara memakai:",
    "1. Isi data mulai baris 2 pada sheet \"Guru\". Jangan mengubah judul kolom.",
    "2. Kode guru wajib dan unik di sekolah ini. Boleh kode internal, NIP, atau NUPTK.",
    "3. Email dipakai sebagai alamat masuk akun guru. Sistem mengirim tautan untuk mengatur kata sandi.",
    "4. Jangan menghapus baris di tengah data; baris kosong diabaikan.",
    "5. Setelah unggah, periksa jumlah baris gagal dan unduh laporan error bila ada.",
  ],
  students: [
    "Cara memakai:",
    "1. Isi data mulai baris 2 pada sheet \"Siswa\". Jangan mengubah judul kolom.",
    "2. NIS wajib dan unik di sekolah ini.",
    "3. NISN opsional, harus 10 digit angka.",
    "4. Rombel diisi dengan nama rombel pada semester aktif, misalnya \"X-1\". Kosongkan bila belum ditempatkan.",
    "5. Setelah unggah, periksa jumlah baris gagal dan unduh laporan error bila ada.",
  ],
}

export async function buildTemplate(kind: ImportKind): Promise<Buffer> {
  const columns = IMPORT_COLUMNS[kind]
  const workbook = new ExcelJS.Workbook()
  workbook.creator = "EduSaaS"

  const sheet = workbook.addWorksheet(IMPORT_SHEET_NAMES[kind])
  sheet.columns = columns.map((column) => ({ key: column.key, width: column.width }))
  sheet.addRow(Object.fromEntries(columns.map((column) => [column.key, column.header])))

  const header = sheet.getRow(1)
  header.font = { bold: true }
  // Baris judul dibekukan agar tetap terlihat saat menggulir 1.000 baris data.
  sheet.views = [{ state: "frozen", ySplit: 1 }]

  const guide = workbook.addWorksheet("Petunjuk")
  guide.columns = [{ width: 100 }]
  const title = guide.addRow([`Template impor ${IMPORT_KIND_LABELS[kind]}`])
  title.font = { bold: true }
  for (const line of INSTRUCTIONS[kind]) guide.addRow([line])
  guide.addRow([])
  guide.addRow(["Kolom pada sheet utama:"])
  for (const column of columns) {
    guide.addRow([`${column.header}${column.required ? " (wajib)" : " (opsional)"}`])
  }

  return writeWorkbook(workbook)
}

// ---------------------------------------------------------------------------
// Baca berkas unggahan
// ---------------------------------------------------------------------------

const EOCD_SIGNATURE = 0x06054b50
const CENTRAL_ENTRY_SIGNATURE = 0x02014b50
const MAX_ZIP_ENTRIES = 2_000

/**
 * Tolak zip bomb sebelum berkas dibuka: jumlahkan ukuran terdekompresi yang
 * tercantum di central directory zip. Pembaca zip exceljs menolak berkas yang
 * ukuran aslinya tidak cocok dengan angka ini, jadi angka palsu tidak lolos.
 */
export function assertSafeXlsx(body: Uint8Array): void {
  const invalid = () =>
    new PeopleImportError(
      "INVALID",
      "Berkas tidak bisa dibaca. Pastikan berkas .xlsx tidak rusak dan tidak sedang dibuka di Excel."
    )
  const view = new DataView(body.buffer, body.byteOffset, body.byteLength)

  // End Of Central Directory ada di ujung berkas (komentar zip maksimal 65.535 byte).
  let eocd = -1
  const lowest = Math.max(0, body.byteLength - 22 - 0xffff)
  for (let i = body.byteLength - 22; i >= lowest; i--) {
    if (view.getUint32(i, true) === EOCD_SIGNATURE) {
      eocd = i
      break
    }
  }
  if (eocd === -1) throw invalid()

  const entries = view.getUint16(eocd + 10, true)
  const directoryOffset = view.getUint32(eocd + 16, true)
  if (entries === 0xffff || directoryOffset === 0xffffffff) throw invalid() // zip64 tidak dipakai Excel biasa
  if (entries > MAX_ZIP_ENTRIES) {
    throw new PeopleImportError("INVALID", "Struktur berkas tidak wajar. Gunakan template yang diunduh dari halaman ini.")
  }

  let total = 0
  let offset = directoryOffset
  for (let n = 0; n < entries; n++) {
    if (offset + 46 > body.byteLength || view.getUint32(offset, true) !== CENTRAL_ENTRY_SIGNATURE) {
      throw invalid()
    }
    total += view.getUint32(offset + 24, true)
    if (total > IMPORT_MAX_UNCOMPRESSED_BYTES) {
      throw new PeopleImportError(
        "INVALID",
        "Isi berkas terlalu besar setelah dibuka. Pisahkan menjadi beberapa berkas yang lebih kecil."
      )
    }
    offset +=
      46 +
      view.getUint16(offset + 28, true) +
      view.getUint16(offset + 30, true) +
      view.getUint16(offset + 32, true)
  }
}

async function readWorkbook(body: Uint8Array): Promise<ExcelJSModule.Workbook> {
  assertSafeXlsx(body)
  try {
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(asExcelJsBuffer(body))
    return workbook
  } catch {
    throw new PeopleImportError(
      "INVALID",
      "Berkas tidak bisa dibaca. Pastikan berkas .xlsx tidak rusak dan tidak sedang dibuka di Excel."
    )
  }
}

/** Pemetaan indeks kolom berdasarkan judul di baris 1. */
function mapHeaders(
  kind: ImportKind,
  sheet: ExcelJSModule.Worksheet
): { indexes: Record<string, number>; missing: string[] } {
  const row = sheet.getRow(1)
  const byHeader = new Map<string, number>()
  row.eachCell({ includeEmpty: true }, (cell, col) => {
    const header = normalizeHeader(cellText(cell.value))
    if (header && !byHeader.has(header)) byHeader.set(header, col)
  })

  const columns = IMPORT_COLUMNS[kind]
  const indexes: Record<string, number> = {}
  const missing: string[] = []
  for (const column of columns) {
    const index = byHeader.get(normalizeHeader(column.header))
    if (index === undefined) {
      if (column.required) missing.push(column.header)
      continue
    }
    indexes[column.key] = index
  }

  return { indexes, missing }
}

export async function parseImportWorkbook(
  kind: ImportKind,
  body: Uint8Array
): Promise<RawImportRow[]> {
  const workbook = await readWorkbook(body)
  const sheet = workbook.getWorksheet(IMPORT_SHEET_NAMES[kind])

  if (!sheet) {
    throw new PeopleImportError(
      "INVALID",
      `Sheet "${IMPORT_SHEET_NAMES[kind]}" tidak ditemukan. Gunakan template yang diunduh dari halaman ini.`
    )
  }

  const { indexes, missing } = mapHeaders(kind, sheet)
  if (missing.length > 0) {
    throw new PeopleImportError(
      "INVALID",
      `Judul kolom tidak sesuai template. Kolom wajib yang hilang: ${missing.join(", ")}.`
    )
  }

  const columns = IMPORT_COLUMNS[kind]
  const rows: RawImportRow[] = []
  const rowCount = sheet.rowCount

  for (let rowNumber = 2; rowNumber <= rowCount; rowNumber++) {
    const row = sheet.getRow(rowNumber)
    const values: Record<string, string> = {}

    for (const column of columns) {
      const index = indexes[column.key]
      values[column.key] = cellText(row.getCell(index).value)
    }

    // Baris kosong (ada sisa format/rumus tapi tidak ada teks) diabaikan.
    if (Object.values(values).every((value) => value === "")) continue

    if (rows.length >= IMPORT_MAX_ROWS) {
      throw new PeopleImportError(
        "INVALID",
        `Jumlah baris melebihi batas ${IMPORT_MAX_ROWS.toLocaleString("id-ID")} baris.`
      )
    }
    rows.push({ rowNumber, values })
  }

  if (rows.length === 0) {
    throw new PeopleImportError(
      "INVALID",
      "Tidak ada baris data. Isi data mulai baris 2 pada sheet utama."
    )
  }

  return rows
}

// ---------------------------------------------------------------------------
// Laporan error
// ---------------------------------------------------------------------------

function writeWorkbook(workbook: ExcelJSModule.Workbook): Promise<Buffer> {
  return workbook.xlsx.writeBuffer().then(fromExcelJsBuffer)
}

export interface ErrorReportInput {
  kind: ImportKind
  fileName: string
  finishedAt: Date | null
  totalRows: number
  importedRows: number
  errors: ImportErrorRow[]
}

export interface ErrorReport {
  fileName: string
  body: Buffer
}

const REPORT_SHEET = "Laporan"
const SUMMARY_SHEET = "Ringkasan"

export function buildErrorReport(input: ErrorReportInput): Promise<ErrorReport> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = "EduSaaS"

  const summary = workbook.addWorksheet(SUMMARY_SHEET)
  summary.columns = [{ width: 24 }, { width: 60 }]
  const title = summary.addRow([`Laporan error impor ${IMPORT_KIND_LABELS[input.kind]}`])
  title.font = { bold: true }
  summary.addRow(["Berkas", input.fileName])
  summary.addRow([
    "Waktu selesai",
    input.finishedAt ? input.finishedAt.toISOString() : "-",
  ])
  summary.addRow(["Total baris", input.totalRows])
  summary.addRow(["Berhasil diimpor", input.importedRows])
  summary.addRow(["Gagal", input.totalRows - input.importedRows])
  summary.addRow([])
  summary.addRow([
    "Perbaiki berkas sesuai laporan pada sheet Laporan, lalu unggah ulang. Baris yang sudah berhasil tidak perlu diimpor dua kali."
  ])

  const sheet = workbook.addWorksheet(REPORT_SHEET)
  sheet.columns = [
    { header: "Baris", key: "row", width: 10 },
    { header: "Kolom", key: "column", width: 20 },
    { header: "Nilai", key: "value", width: 28 },
    { header: "Pesan", key: "message", width: 70 },
  ]
  sheet.getRow(1).font = { bold: true }
  sheet.views = [{ state: "frozen", ySplit: 1 }]

  const rows = [...input.errors].sort((a, b) => a.rowNumber - b.rowNumber)
  for (const error of rows) {
    sheet.addRow({
      row: error.rowNumber === 0 ? "berkas" : error.rowNumber,
      column: error.column ?? "-",
      value: error.value ?? "-",
      message: error.message,
    })
  }

  const stamp = (input.finishedAt ?? new Date()).toISOString().slice(0, 10)
  return writeWorkbook(workbook).then((body) => ({
    fileName: `laporan-error-${IMPORT_KIND_LABELS[input.kind]}-${stamp}.xlsx`,
    body,
  }))
}

/** Pesan duplikat yang dipakai service saat menyimpan baris yang sudah ada. */
export function duplicateMessage(kind: ImportKind, value: string): string {
  return `${IMPORT_KEY_LABELS[kind]} ${value} sudah dipakai di sekolah ini.`
}