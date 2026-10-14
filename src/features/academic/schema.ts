import { z } from "zod"

export const SUBJECT_GROUPS = ["umum", "produktif", "muatan_lokal"] as const

export const SUBJECT_GROUP_LABELS: Record<(typeof SUBJECT_GROUPS)[number], string> = {
  umum: "Umum",
  produktif: "Produktif",
  muatan_lokal: "Muatan lokal",
}

/** Tanggal kalender "YYYY-MM-DD"; sengaja tetap string agar skema idempoten. */
export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Gunakan format tanggal yang benar")
  .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), "Tanggal tidak valid")

const periodSchema = z
  .object({ startDate: dateSchema, endDate: dateSchema })
  .refine((p) => p.startDate < p.endDate, {
    message: "Tanggal selesai harus setelah tanggal mulai",
    path: ["endDate"],
  })

export const academicYearSchema = z
  .object({
    name: z
      .string()
      .trim()
      .regex(/^\d{4}\/\d{4}$/, "Gunakan format 2026/2027"),
    ganjil: periodSchema,
    genap: periodSchema,
  })
  .refine((y) => y.ganjil.endDate < y.genap.startDate, {
    message: "Semester genap harus dimulai setelah semester ganjil berakhir",
    path: ["genap", "startDate"],
  })

export const majorSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, "Kode wajib diisi")
    .max(16, "Kode maksimal 16 karakter")
    .transform((value) => value.toUpperCase()),
  name: z.string().trim().min(2, "Nama minimal 2 karakter").max(120, "Nama terlalu panjang"),
})

export const classroomSchema = z.object({
  semesterId: z.uuid("Semester tidak valid"),
  grade: z.number().int("Tingkat harus bilangan bulat").min(1, "Tingkat 1–12").max(12, "Tingkat 1–12"),
  majorId: z.uuid("Jurusan tidak valid").optional(),
  name: z.string().trim().min(1, "Nama rombel wajib diisi").max(64, "Nama terlalu panjang"),
})

export const subjectSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, "Kode wajib diisi")
    .max(16, "Kode maksimal 16 karakter")
    .transform((value) => value.toUpperCase()),
  name: z.string().trim().min(2, "Nama minimal 2 karakter").max(120, "Nama terlalu panjang"),
  group: z.enum(SUBJECT_GROUPS).default("umum"),
})

export type AcademicYearInput = z.infer<typeof academicYearSchema>
export type MajorInput = z.infer<typeof majorSchema>
export type ClassroomInput = z.infer<typeof classroomSchema>
export type SubjectInput = z.infer<typeof subjectSchema>
