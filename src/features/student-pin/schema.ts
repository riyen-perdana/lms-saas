// Skema masukan PIN siswa (US-01). Dipakai klien lalu server, jadi harus
// idempoten (parse dua kali menghasilkan nilai yang sama).

import { z } from "zod"

export const PIN_LENGTH = 6

export const studentIdSchema = z.object({
  studentId: z.uuid("Siswa tidak valid"),
})

export const classroomIdSchema = z.object({
  classroomId: z.uuid("Rombel tidak valid"),
})

export const studentPinLoginSchema = z.object({
  nis: z.string().trim().min(1, "NIS wajib diisi").max(32, "NIS terlalu panjang"),
  pin: z.string().regex(/^\d{6}$/, "PIN terdiri dari 6 angka"),
})

export type StudentPinLoginInput = z.infer<typeof studentPinLoginSchema>
