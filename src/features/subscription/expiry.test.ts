// @vitest-environment node
// Test integrasi kedaluwarsa langganan (job terjadwal).

import { randomUUID } from "node:crypto"

import { PrismaPg } from "@prisma/adapter-pg"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { prisma } from "@/db/client"
import { GRACE_DAYS, expireSubscriptions } from "@/features/subscription/expiry"
import { PrismaClient } from "@/generated/prisma/client"
import { addDaysUtc } from "@/lib/dates"
import { resolveSchoolBySlug } from "@/lib/tenant/resolve"

const adminUrl = process.env.DATABASE_URL
if (!adminUrl)
  throw new Error("DATABASE_URL belum diisi; test integrasi butuh .env")

const admin = new PrismaClient({
  adapter: new PrismaPg({ connectionString: adminUrl }),
})

const suffix = randomUUID().slice(0, 8)
const NOW = new Date("2026-10-14T03:00:00Z")

const ids: Record<string, string> = {}
let planId: string

async function makeSchool(
  key: string,
  status: "trial" | "active" | "grace" | "suspended",
  subscription: {
    status: "trial" | "active" | "expired"
    periodEnd: Date
  } | null
) {
  const school = await admin.school.create({
    data: {
      slug: `exp-${key}-${suffix}`,
      name: `Exp ${key}`,
      level: "SMA",
      status,
    },
  })
  ids[key] = school.id

  if (subscription) {
    await admin.subscription.create({
      data: {
        schoolId: school.id,
        planId,
        status: subscription.status,
        periodStart: addDaysUtc(subscription.periodEnd, -30),
        periodEnd: subscription.periodEnd,
      },
    })
  }
}

const statusOf = async (key: string) =>
  (await admin.school.findUniqueOrThrow({ where: { id: ids[key] } })).status

beforeAll(async () => {
  const plan = await admin.plan.create({
    data: {
      code: `uji-exp-${suffix}`,
      name: "Uji",
      priceSemester: 1,
      priceYear: 2,
      maxStudents: 1,
      maxStorageGb: 1,
    },
  })
  planId = plan.id

  await makeSchool("trialHabis", "trial", {
    status: "trial",
    periodEnd: addDaysUtc(NOW, -1),
  })
  await makeSchool("trialMasihBerlaku", "trial", {
    status: "trial",
    periodEnd: addDaysUtc(NOW, 5),
  })
  await makeSchool("berbayarHabis", "active", {
    status: "active",
    periodEnd: addDaysUtc(NOW, -1),
  })
  await makeSchool("berbayarMasihBerlaku", "active", {
    status: "active",
    periodEnd: addDaysUtc(NOW, 90),
  })
  await makeSchool("tenggangBelumHabis", "grace", {
    status: "expired",
    periodEnd: addDaysUtc(NOW, -(GRACE_DAYS - 2)),
  })
  await makeSchool("tenggangHabis", "grace", {
    status: "expired",
    periodEnd: addDaysUtc(NOW, -(GRACE_DAYS + 1)),
  })
  await makeSchool("ditangguhkan", "suspended", {
    status: "trial",
    periodEnd: addDaysUtc(NOW, -10),
  })
})

afterAll(async () => {
  await admin.school.deleteMany({ where: { id: { in: Object.values(ids) } } })
  await admin.plan.deleteMany({ where: { id: planId } })
  await admin.$disconnect()
  await prisma.$disconnect()
})

describe("expireSubscriptions", () => {
  it("memindahkan status sesuai aturan dan hanya menyentuh yang kedaluwarsa", async () => {
    // Isi cache tenant dulu untuk membuktikan invalidasi.
    await resolveSchoolBySlug(`exp-trialHabis-${suffix}`)

    const result = await expireSubscriptions(NOW)

    expect(result.trialsExpired).toBeGreaterThanOrEqual(2)
    expect(result.paidExpired).toBeGreaterThanOrEqual(1)
    expect(result.graceEnded).toBeGreaterThanOrEqual(1)

    expect(await statusOf("trialHabis")).toBe("readonly")
    expect(await statusOf("trialMasihBerlaku")).toBe("trial")
    expect(await statusOf("berbayarHabis")).toBe("grace")
    expect(await statusOf("berbayarMasihBerlaku")).toBe("active")
    expect(await statusOf("tenggangBelumHabis")).toBe("grace")
    expect(await statusOf("tenggangHabis")).toBe("readonly")
  })

  it("tidak mengubah sekolah yang ditangguhkan", async () => {
    expect(await statusOf("ditangguhkan")).toBe("suspended")
  })

  it("langganan yang habis ditandai expired, yang berlaku tetap", async () => {
    const habis = await admin.subscription.findFirstOrThrow({
      where: { schoolId: ids.trialHabis },
    })
    const berlaku = await admin.subscription.findFirstOrThrow({
      where: { schoolId: ids.trialMasihBerlaku },
    })

    expect(habis.status).toBe("expired")
    expect(berlaku.status).toBe("trial")
  })

  it("membuang cache tenant sehingga status baru langsung terlihat", async () => {
    expect(
      (await resolveSchoolBySlug(`exp-trialHabis-${suffix}`))?.status
    ).toBe("readonly")
  })

  it("idempoten: dijalankan ulang tidak mengubah apa pun lagi", async () => {
    const before = {
      trial: await statusOf("trialHabis"),
      paid: await statusOf("berbayarHabis"),
    }

    await expireSubscriptions(NOW)

    expect(await statusOf("trialHabis")).toBe(before.trial)
    expect(await statusOf("berbayarHabis")).toBe(before.paid)
  })
})
