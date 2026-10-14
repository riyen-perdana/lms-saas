import { z } from "zod"

export const LOGO_MAX_BYTES = 1024 * 1024
export const LOGO_TYPES = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
} as const

export const profileSchema = z.object({
  name: z
    .string()
    .trim()
    .min(3, "Nama sekolah minimal 3 karakter")
    .max(191, "Nama sekolah terlalu panjang"),
  npsn: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value ? value : undefined))
    .pipe(z.string().regex(/^\d{8}$/, "NPSN harus 8 digit angka").optional()),
})

export type ProfileInput = z.infer<typeof profileSchema>
