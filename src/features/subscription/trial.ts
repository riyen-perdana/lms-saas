// Langganan trial sekolah baru (LP-04, PRD §4: trial 30 hari fitur lengkap).

import type { TenantDb } from "@/db/tenant"
import { addDaysUtc } from "@/lib/dates"

export const TRIAL_DAYS = 30
export const TRIAL_PLAN_CODE = "trial"

export class TrialPlanMissingError extends Error {
  constructor() {
    super(
      `Paket "${TRIAL_PLAN_CODE}" belum ada. Jalankan \`pnpm db:seed\` untuk membuat paket.`
    )
    this.name = "TrialPlanMissingError"
  }
}

/**
 * Membuat langganan trial untuk sekolah. Dipanggil di dalam tenantDb(schoolId)
 * agar satu transaksi dengan pembuatan keanggotaan.
 */
export async function createTrialSubscription(
  db: TenantDb,
  schoolId: string,
  now: Date = new Date()
) {
  const plan = await db.plan.findUnique({
    where: { code: TRIAL_PLAN_CODE },
    select: { id: true },
  })
  if (!plan) throw new TrialPlanMissingError()

  const trialEndsAt = addDaysUtc(now, TRIAL_DAYS)

  return db.subscription.create({
    data: {
      schoolId,
      planId: plan.id,
      status: "trial",
      periodStart: now,
      periodEnd: trialEndsAt,
      trialEndsAt,
    },
  })
}
