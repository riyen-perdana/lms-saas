import { afterAll, describe, expect, it } from "vitest"

import { prisma } from "@/db/client"
import { listPublicPlans, planPoints } from "@/features/pricing/service"

const code = `tmp-${Date.now()}`

afterAll(async () => {
  await prisma.plan.deleteMany({ where: { code } })
})

describe("planPoints", () => {
  it("menurunkan poin dari kuota dan fitur aktif saja", () => {
    const points = planPoints({
      maxStudents: 2000,
      maxStorageGb: 100,
      features: { cbt: true, parentReports: false, customDomain: true },
    })

    expect(points).toContain("Hingga 2.000 siswa")
    expect(points).toContain("Penyimpanan 100 GB")
    expect(points).toContain("Ujian CBT & analisis soal")
    expect(points).toContain("Domain kustom sekolah")
    expect(points).not.toContain("Laporan orang tua otomatis")
  })

  it("tahan terhadap features yang bukan objek", () => {
    expect(
      planPoints({ maxStudents: 10, maxStorageGb: 1, features: null })
    ).toHaveLength(3)
  })
})

describe("listPublicPlans", () => {
  it("tidak menampilkan trial dan paket terhapus, urut dari termurah", async () => {
    await prisma.plan.create({
      data: {
        code,
        name: "Terhapus",
        priceSemester: 1,
        priceYear: 1,
        maxStudents: 1,
        maxStorageGb: 1,
        deletedAt: new Date(),
      },
    })

    const plans = await listPublicPlans()
    const codes = plans.map((plan) => plan.code)

    expect(codes).not.toContain("trial")
    expect(codes).not.toContain(code)
    expect(plans.map((plan) => plan.priceSemester)).toEqual(
      [...plans.map((plan) => plan.priceSemester)].sort((a, b) => a - b)
    )
  })
})
