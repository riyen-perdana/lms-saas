// Impor guru & siswa dari berkas Excel (OB-02, PRD §6.2).
// ---------------------------------------------------------------------------
// Berkas ini adalah satu-satunya sumber kebenaran untuk bentuk template: header
// kolom dipakai buat membuat template, buat memetakan sel Excel, dan buat
// menulis laporan error. Tidak ada daftar kolom yang ditulis ulang di tempat lain.
//
// Skema baris sengaja idempoten (hanya trim + normalisasi huruf besar/kecil)
// supaya bisa diparse di klien lalu diparse lagi di server tanpa berubah.

import { z } from "zod"

import type { ImportKind } from "@/generated/prisma/enums"

export const IMPORT_MAX_BYTES = 5 * 1024 * 1024
export const IMPORT_MAX_ROWS = 5_000
/** Batas isi berkas setelah dekompresi: .xlsx adalah zip, jadi 5 MB terkompresi bisa membengkak jauh lebih besar. */
export const IMPORT_MAX_UNCOMPRESSED_BYTES = 50 * 1024 * 1024
export const XLSX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
export const XLSX_EXTENSION = ".xlsx"

export interface ImportColumn {
  /** Nama field di skema Zod. */
  key: string
  /** Header persis seperti di template. */
  header: string
  required: boolean
  width: number
}

export const IMPORT_COLUMNS: Record<ImportKind, readonly ImportColumn[]> = {
  teachers: [
    { key: "code", header: "Kode guru", required: true, width: 18 },
    { key: "name", header: "Nama", required: true, width: 30 },
    { key: "email", header: "Email", required: true, width: 30 },
    { key: "nip", header: "NIP", required: false, width: 18 },
    { key: "nuptk", header: "NUPTK", required: false, width: 18 },
    { key: "gender", header: "Jenis kelamin", required: false, width: 16 },
    { key: "phone", header: "Telepon", required: false, width: 18 },
  ],
  students: [
    { key: "nis", header: "NIS", required: true, width: 18 },
    { key: "nisn", header: "NISN", required: false, width: 16 },
    { key: "name", header: "Nama", required: true, width: 30 },
    { key: "gender", header: "Jenis kelamin", required: false, width: 16 },
    { key: "classroom", header: "Rombel", required: false, width: 18 },
  ],
}

export const IMPORT_KIND_LABELS: Record<ImportKind, string> = {
  teachers: "guru",
  students: "siswa",
}

/** Nama sheet template; berkas unggahan harus memakai nama yang sama. */
export const IMPORT_SHEET_NAMES: Record<ImportKind, string> = {
  teachers: "Guru",
  students: "Siswa",
}

// ---------------------------------------------------------------------------
// Skema baris
// ---------------------------------------------------------------------------

/** Kolom opsional: string kosong di Excel berarti "tidak diisi". */
function optionalText(max: number, label: string) {
  return z
    .string()
    .trim()
    .max(max, `${label} terlalu panjang (maksimum ${max} karakter)`)
    .transform((value) => (value === "" ? undefined : value))
    .optional()
}

const nameSchema = z
  .string()
  .trim()
  .min(2, "Nama wajib diisi (minimal 2 karakter)")
  .max(191, "Nama terlalu panjang (maksimum 191 karakter)")

const genderSchema = z
  .string()
  .trim()
  .toUpperCase()
  .optional()
  .refine((value) => value === undefined || value === "" || value === "L" || value === "P", {
    message: "Jenis kelamin harus L atau P",
  })
  .transform((value) => (value === "" ? undefined : value))
  .pipe(z.enum(["L", "P"]).optional())

export const teacherRowSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, "Kode guru wajib diisi")
    .max(32, "Kode guru terlalu panjang (maksimum 32 karakter)"),
  name: nameSchema,
  email: z
    .string()
    .trim()
    .max(254, "Email terlalu panjang (maksimum 254 karakter)")
    .pipe(z.email("Email tidak valid"))
    .transform((value) => value.toLowerCase()),
  nip: optionalText(18, "NIP"),
  nuptk: optionalText(32, "NUPTK"),
  gender: genderSchema,
  phone: optionalText(20, "Telepon"),
})

export const studentRowSchema = z.object({
  nis: z
    .string()
    .trim()
    .min(1, "NIS wajib diisi")
    .max(32, "NIS terlalu panjang (maksimum 32 karakter)"),
  nisn: optionalText(12, "NISN").refine(
    (value) => value === undefined || /^\d{10}$/.test(value),
    "NISN harus 10 digit angka"
  ),
  name: nameSchema,
  gender: genderSchema,
  classroom: optionalText(64, "Rombel"),
})

export const IMPORT_ROW_SCHEMAS = {
  teachers: teacherRowSchema,
  students: studentRowSchema,
} as const

export type TeacherRowInput = z.infer<typeof teacherRowSchema>
export type StudentRowInput = z.infer<typeof studentRowSchema>
export type ImportRowInput = TeacherRowInput | StudentRowInput

/** Kolom yang dipakai pesan duplikat, mis. "NIS 10021 sudah dipakai". */
export const IMPORT_KEY_LABELS: Record<ImportKind, string> = {
  teachers: "Kode guru",
  students: "NIS",
}

export type ImportKindInput = ImportKind