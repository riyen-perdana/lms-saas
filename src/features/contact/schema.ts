import { z } from "zod"

// Idempoten: dipakai klien lalu diparse ulang di server (lihat registration/schema).
export const contactSchema = z.object({
  name: z.string().trim().min(2, "Nama minimal 2 karakter").max(100, "Nama maksimal 100 karakter"),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(254, "Email terlalu panjang")
    .pipe(z.email("Format email tidak valid")),
  schoolName: z
    .string()
    .trim()
    .max(150, "Nama sekolah maksimal 150 karakter")
    .optional()
    .transform((value) => (value ? value : undefined)),
  message: z
    .string()
    .trim()
    .min(10, "Pesan minimal 10 karakter")
    .max(2000, "Pesan maksimal 2000 karakter"),
})

export type ContactInput = z.infer<typeof contactSchema>
