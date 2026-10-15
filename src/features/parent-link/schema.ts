// Skema input tautan orang tua (OB-05).
//
// Sengaja tanpa transform yang tidak idempoten: diparse di klien lalu diparse
// lagi di server (docs/PROGRESS.md "Jebakan"). Normalisasi kode (huruf besar,
// tanda hubung) dikerjakan service, bukan skema.

import { z } from "zod"

export const codeSchema = z
  .string()
  .trim()
  .min(1, "Kode undangan wajib diisi")
  .max(32, "Kode undangan terlalu panjang")

/** Orang tua yang sudah login: cukup kode. */
export const joinExistingSchema = z.object({ code: codeSchema })

/** Orang tua baru: kode + data akun. Email diseragamkan huruf kecil. */
export const joinNewSchema = z.object({
  code: codeSchema,
  name: z
    .string()
    .trim()
    .min(2, "Nama minimal 2 karakter")
    .max(120, "Nama terlalu panjang"),
  email: z.email("Email tidak valid").trim().toLowerCase(),
  password: z
    .string()
    .min(8, "Kata sandi minimal 8 karakter")
    .max(128, "Kata sandi terlalu panjang"),
})

export const studentIdSchema = z.object({
  studentId: z.uuid("Siswa tidak valid"),
})
export const classroomIdSchema = z.object({
  classroomId: z.uuid("Rombel tidak valid"),
})
export const linkIdSchema = z.object({ linkId: z.uuid("Tautan tidak valid") })

export type JoinExistingInput = z.infer<typeof joinExistingSchema>
export type JoinNewInput = z.infer<typeof joinNewSchema>
