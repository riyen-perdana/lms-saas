// @vitest-environment node
// Test integrasi layanan Super Admin + RLS subscriptions (PRD §5.2, §8).

import { randomUUID } from "node:crypto"

import { PrismaPg } from "@prisma/adapter-pg"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { prisma } from "@/db/client"
import { tenantDb } from "@/db/tenant"
import {
  PlatformError,
  activatePlan,
  getOverview,
  getSchool,
  isPlatformAdmin,
  listActivatablePlans,
  listSchools,
  setSuspended,
} from "@/features/platform/service"
import { PrismaClient } from "@/generated/prisma/client"
import { resolveSchoolBySlug } from "@/lib/tenant/resolve"

const adminUrl = process.env.DATABASE_URL
if (!adminUrl)
  throw new Error("DATABASE_URL belum diisi; test integrasi butuh .env")

const admin = new PrismaClient({
  adapter: new PrismaPg({ connectionString: adminUrl }),
})

const suffix = randomUUID().slice(0, 8)
const ACTOR = { userId: randomUUID(), role: "platform_admin" as const }
const NOW = new Date("2026-10-14T03:00:00Z")

let schoolAId: string
let schoolBId: string
let planTrialId: string
let planProId: string
let userId: string
const planProCode = `uji-pro-${suffix}`

beforeAll(async () => {
  const [a, b] = await Promise.all([
    admin.school.create({
      data: {
        slug: `plat-a-${suffix}`,
        name: `Alfa ${suffix}`,
        level: "SMA",
        status: "trial",
      },
    }),
    admin.school.create({
      data: {
        slug: `plat-b-${suffix}`,
        name: `Beta ${suffix}`,
        level: "SMK",
        status: "trial",
      },
    }),
  ])
  schoolAId = a.id
  schoolBId = b.id

  const trial = await admin.plan.create({
    data: {
      code: `uji-trial-${suffix}`,
      name: "Uji Trial",
      priceSemester: 0,
      priceYear: 0,
      maxStudents: 10,
      maxStorageGb: 1,
    },
  })
  const pro = await admin.plan.create({
    data: {
      code: planProCode,
      name: "Uji Pro",
      priceSemester: 1,
      priceYear: 2,
      maxStudents: 100,
      maxStorageGb: 10,
    },
  })
  planTrialId = trial.id
  planProId = pro.id

  for (const schoolId of [a.id, b.id]) {
    await admin.subscription.create({
      data: {
        schoolId,
        planId: trial.id,
        status: "trial",
        periodStart: NOW,
        periodEnd: new Date(NOW.getTime() + 3 * 24 * 3600 * 1000),
        trialEndsAt: new Date(NOW.getTime() + 3 * 24 * 3600 * 1000),
      },
    })
  }

  const user = await admin.user.create({
    data: { email: `plat-${suffix}@sekolah.test`, name: "Super" },
  })
  userId = user.id
  await admin.platformAdmin.create({ data: { userId: user.id } })
})

afterAll(async () => {
  await admin.school.deleteMany({
    where: { id: { in: [schoolAId, schoolBId] } },
  })
  await admin.plan.deleteMany({
    where: { id: { in: [planTrialId, planProId] } },
  })
  await admin.user.deleteMany({ where: { id: userId } })
  await admin.$disconnect()
  await prisma.$disconnect()
})

describe("RLS subscriptions", () => {
  it("tanpa konteks sekolah/platform: nol baris (gagal tertutup)", async () => {
    const rows = await prisma.subscription.findMany({
      where: { schoolId: { in: [schoolAId, schoolBId] } },
    })

    expect(rows).toHaveLength(0)
  })

  it("isolasi: tenantDb sekolah A hanya melihat langganan sekolah A", async () => {
    const rows = await tenantDb(schoolAId, (db) =>
      db.subscription.findMany({ where: { schoolId: schoolBId } })
    )

    expect(rows.every((row) => row.schoolId === schoolAId)).toBe(true)
  })

  it("sekolah A tidak bisa menulis langganan untuk sekolah B", async () => {
    await expect(
      prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT set_config('app.current_school_id', ${schoolAId}, true)`
        return tx.subscription.create({
          data: {
            schoolId: schoolBId,
            planId: planProId,
            status: "active",
            periodStart: NOW,
            periodEnd: NOW,
          },
        })
      })
    ).rejects.toThrow()
  })
})

describe("isPlatformAdmin", () => {
  it("true hanya untuk user di tabel platform_admins", async () => {
    expect(await isPlatformAdmin(userId)).toBe(true)
    expect(await isPlatformAdmin(randomUUID())).toBe(false)
  })
})

describe("listSchools & getSchool", () => {
  it("mencari berdasarkan nama dan menyertakan paket berlaku", async () => {
    const result = await listSchools({ search: `Alfa ${suffix}`, page: 1 })

    expect(result.total).toBe(1)
    expect(result.items[0]).toMatchObject({
      id: schoolAId,
      status: "trial",
      subscription: { status: "trial", planCode: `uji-trial-${suffix}` },
    })
  })

  it("memfilter berdasarkan status", async () => {
    const result = await listSchools({
      search: suffix,
      status: "suspended",
      page: 1,
    })

    expect(result.total).toBe(0)
  })

  it("getSchool menolak id yang tidak ada", async () => {
    await expect(getSchool(randomUUID())).rejects.toMatchObject({
      code: "SCHOOL_NOT_FOUND",
    })
  })
})

describe("getOverview", () => {
  it("menghitung status dan trial yang segera berakhir", async () => {
    const overview = await getOverview(NOW)

    expect(overview.byStatus.trial).toBeGreaterThanOrEqual(2)
    const ids = overview.expiringTrials.map((row) => row.schoolId)
    expect(ids).toContain(schoolAId)
    expect(ids).toContain(schoolBId)
  })
})

describe("activatePlan", () => {
  it("membatalkan trial, membuat langganan aktif 6 bulan, dan mengaktifkan sekolah", async () => {
    await activatePlan(ACTOR, 
      { schoolId: schoolAId, planCode: planProCode, period: "semester" },
      NOW
    )

    const school = await getSchool(schoolAId)
    expect(school.status).toBe("active")
    expect(school.subscription).toMatchObject({
      status: "active",
      planCode: planProCode,
    })
    expect(school.subscription?.periodEnd.toISOString()).toBe(
      "2027-04-14T03:00:00.000Z"
    )

    const all = await admin.subscription.findMany({
      where: { schoolId: schoolAId },
    })
    expect(all.map((row) => row.status).sort()).toEqual(["active", "canceled"])

    const logs = await admin.auditLog.findMany({
      where: { schoolId: schoolAId, action: "subscription.activate" },
    })
    expect(logs).toHaveLength(1)
    expect(logs[0]).toMatchObject({
      actorRole: "platform_admin",
      before: { status: "trial" },
      after: { status: "active", planCode: planProCode, period: "semester" },
    })
  })

  it("tidak mengubah sekolah lain", async () => {
    const other = await getSchool(schoolBId)

    expect(other.status).toBe("trial")
    expect(other.subscription?.status).toBe("trial")
  })

  it("periode tahunan menghasilkan 12 bulan", async () => {
    await activatePlan(ACTOR, 
      { schoolId: schoolBId, planCode: planProCode, period: "year" },
      NOW
    )

    const school = await getSchool(schoolBId)
    expect(school.subscription?.periodEnd.toISOString()).toBe(
      "2027-10-14T03:00:00.000Z"
    )
  })

  it("menolak paket trial, paket tak dikenal, dan sekolah tak dikenal", async () => {
    const base = { schoolId: schoolAId, period: "semester" as const }

    await expect(
      activatePlan(ACTOR, { ...base, planCode: "trial" })
    ).rejects.toMatchObject({
      code: "TRIAL_PLAN_NOT_ACTIVATABLE",
    })
    await expect(
      activatePlan(ACTOR, { ...base, planCode: "tidak-ada" })
    ).rejects.toBeInstanceOf(PlatformError)
    await expect(
      activatePlan(ACTOR, { ...base, schoolId: randomUUID(), planCode: planProCode })
    ).rejects.toMatchObject({ code: "SCHOOL_NOT_FOUND" })
  })
})

describe("setSuspended", () => {
  it("menangguhkan lalu mengembalikan sesuai langganan yang berlaku", async () => {
    expect(await setSuspended(ACTOR, schoolAId, true)).toBe("suspended")
    expect((await getSchool(schoolAId)).status).toBe("suspended")
    expect(
      await admin.auditLog.count({
        where: { schoolId: schoolAId, action: "school.suspend" },
      })
    ).toBeGreaterThanOrEqual(1)

    // Langganan aktif sekolah A berlaku sampai 2027-04 (NOW + 6 bulan), jadi
    // pengecekan "belum habis" memakai tanggal NOW.
    expect(await setSuspended(ACTOR, schoolAId, false, NOW)).toBe("active")
  })

  it("menjadi readonly bila langganan sudah habis", async () => {
    await setSuspended(ACTOR, schoolAId, true)

    const farFuture = new Date("2030-01-01T00:00:00Z")
    expect(await setSuspended(ACTOR, schoolAId, false, farFuture)).toBe("readonly")
  })

  it("menolak sekolah yang tidak ada", async () => {
    await expect(setSuspended(ACTOR, randomUUID(), true)).rejects.toMatchObject({
      code: "SCHOOL_NOT_FOUND",
    })
  })
})

describe("cache tenant", () => {
  it("penangguhan dan aktivasi kembali langsung terlihat oleh resolver tenant", async () => {
    const slug = `plat-b-${suffix}`

    // Isi cache lebih dulu: tanpa invalidasi, status lama bertahan 30 detik.
    expect((await resolveSchoolBySlug(slug))?.status).not.toBe("suspended")

    await setSuspended(ACTOR, schoolBId, true)
    expect((await resolveSchoolBySlug(slug))?.status).toBe("suspended")

    await setSuspended(ACTOR, schoolBId, false, NOW)
    expect((await resolveSchoolBySlug(slug))?.status).not.toBe("suspended")
  })
})

describe("listActivatablePlans", () => {
  it("tidak menyertakan paket trial", async () => {
    const plans = await listActivatablePlans()

    expect(plans.map((plan) => plan.code)).not.toContain("trial")
    expect(plans.map((plan) => plan.code)).toContain(planProCode)
  })
})
