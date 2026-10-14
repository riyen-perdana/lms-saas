import { z } from "zod"

import { isValidSlug } from "@/lib/tenant/host"

export const SCHOOL_LEVELS = ["SD", "MI", "SMP", "MTS", "SMA", "MA", "SMK"] as const

export const SCHOOL_LEVEL_LABELS: Record<(typeof SCHOOL_LEVELS)[number], string> = {
  SD: "SD",
  MI: "MI",
  SMP: "SMP",
  MTS: "MTs",
  SMA: "SMA",
  MA: "MA",
  SMK: "SMK",
}

export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "Subdomain minimal 3 karakter")
  .max(40, "Subdomain maksimal 40 karakter")
  .refine(
    (slug) => isValidSlug(slug),
    "Gunakan huruf kecil, angka, dan tanda hubung (tidak di awal/akhir), dan bukan kata terlarang seperti www, app, api, admin"
  )

export const registerSchoolSchema = z.object({
  schoolName: z
    .string()
    .trim()
    .min(3, "Nama sekolah minimal 3 karakter")
    .max(191, "Nama sekolah terlalu panjang"),
  npsn: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value ? value : undefined))
    .pipe(
      z
        .string()
        .regex(/^\d{8}$/, "NPSN harus 8 digit angka")
        .optional()
    ),
  level: z.enum(SCHOOL_LEVELS, { error: "Pilih jenjang sekolah" }),
  slug: slugSchema,
  adminName: z
    .string()
    .trim()
    .min(3, "Nama admin minimal 3 karakter")
    .max(191, "Nama admin terlalu panjang"),
  adminEmail: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, "Email wajib diisi")
    .email("Format email tidak valid")
    .max(320),
  password: z
    .string()
    .min(8, "Kata sandi minimal 8 karakter")
    .max(128, "Kata sandi maksimal 128 karakter"),
})

export type RegisterSchoolInput = z.infer<typeof registerSchoolSchema>
