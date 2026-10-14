// Paket yang tampil di halaman harga (LP-03), dibaca dari tabel `plans`.
// Paket trial tidak ditampilkan sebagai paket; ia hanya ajakan "coba 30 hari".

import { prisma } from "@/db/client"
import { TRIAL_PLAN_CODE } from "@/features/subscription/trial"

export interface PublicPlan {
  code: string
  name: string
  priceSemester: number
  priceYear: number
  /** Poin ringkas untuk kartu harga, diturunkan dari kuota dan fitur paket. */
  points: string[]
}

const FEATURE_LABELS: Record<string, string> = {
  cbt: "Ujian CBT & analisis soal",
  parentReports: "Laporan orang tua otomatis",
  customDomain: "Domain kustom sekolah",
}

const number = new Intl.NumberFormat("id-ID")

export function planPoints(plan: {
  maxStudents: number
  maxStorageGb: number
  features: unknown
}): string[] {
  const features =
    plan.features && typeof plan.features === "object"
      ? (plan.features as Record<string, unknown>)
      : {}

  return [
    `Hingga ${number.format(plan.maxStudents)} siswa`,
    `Penyimpanan ${plan.maxStorageGb} GB`,
    "Kelas, materi, tugas, nilai",
    ...Object.entries(FEATURE_LABELS)
      .filter(([key]) => features[key] === true)
      .map(([, label]) => label),
  ]
}

export async function listPublicPlans(): Promise<PublicPlan[]> {
  const plans = await prisma.plan.findMany({
    where: { deletedAt: null, code: { not: TRIAL_PLAN_CODE } },
    orderBy: { priceSemester: "asc" },
  })

  return plans.map((plan) => ({
    code: plan.code,
    name: plan.name,
    priceSemester: plan.priceSemester,
    priceYear: plan.priceYear,
    points: planPoints(plan),
  }))
}
