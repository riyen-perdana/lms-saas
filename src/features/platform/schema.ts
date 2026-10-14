import { z } from "zod"

export const SCHOOL_STATUSES = [
  "trial",
  "active",
  "grace",
  "readonly",
  "suspended",
] as const

export type SchoolStatus = (typeof SCHOOL_STATUSES)[number]

export const SCHOOL_STATUS_LABELS: Record<SchoolStatus, string> = {
  trial: "Uji coba",
  active: "Aktif",
  grace: "Masa tenggang",
  readonly: "Hanya baca",
  suspended: "Ditangguhkan",
}

export const BILLING_PERIODS = ["semester", "year"] as const

export const BILLING_PERIOD_LABELS: Record<
  (typeof BILLING_PERIODS)[number],
  string
> = {
  semester: "Per semester (6 bulan)",
  year: "Tahunan (12 bulan)",
}

export const PAGE_SIZE = 20

export const listSchoolsSchema = z.object({
  search: z.string().trim().max(100).optional(),
  status: z.enum(SCHOOL_STATUSES).optional(),
  page: z.number().int().min(1).default(1),
})

export type ListSchoolsInput = z.infer<typeof listSchoolsSchema>

export const schoolIdSchema = z.object({ schoolId: z.string().uuid() })

export const activatePlanSchema = z.object({
  schoolId: z.string().uuid(),
  planCode: z.string().trim().min(1).max(32),
  period: z.enum(BILLING_PERIODS),
})

export type ActivatePlanInput = z.infer<typeof activatePlanSchema>

export const suspendSchema = z.object({
  schoolId: z.string().uuid(),
  suspended: z.boolean(),
})

export type SuspendInput = z.infer<typeof suspendSchema>
