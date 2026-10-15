import "dotenv/config"

import { randomUUID } from "node:crypto"

import { PrismaPg } from "@prisma/adapter-pg"
import { hashPassword } from "better-auth/crypto"
import { expect, test, type Page } from "@playwright/test"

import { PrismaClient } from "../../src/generated/prisma/client.js"

// US-04: halaman log audit untuk admin sekolah. Baris log dibuat lewat DB
// (pencatatan nyata per aksi diuji di service.test.ts tiap modul).

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
})

const PASSWORD = "sandi-uji-12345"

const created: { schoolId: string; userIds: string[] }[] = []

test.afterAll(async () => {
  for (const { schoolId, userIds } of created) {
    await db.school.deleteMany({ where: { id: schoolId } })
    await db.user.deleteMany({ where: { id: { in: userIds } } })
  }
  await db.$disconnect()
})

async function newSchool(testInfo: { project: { name: string } }) {
  const tag = `${randomUUID().slice(0, 6)}${testInfo.project.name === "mobile-360" ? "m" : "d"}`
  const slug = `au-${tag}`

  const school = await db.school.create({
    data: {
      slug,
      name: `SMA Audit ${tag}`,
      level: "SMA",
      status: "trial",
      setupCompletedAt: new Date(),
    },
  })
  const userIds: string[] = []

  async function addUser(role: "school_admin" | "teacher", name: string) {
    const email = `${role}-${tag}@sekolah.test`
    const user = await db.user.create({
      data: { email, name, emailVerified: true },
    })
    userIds.push(user.id)
    await db.account.create({
      data: {
        userId: user.id,
        providerId: "credential",
        accountId: user.id,
        password: await hashPassword(PASSWORD),
      },
    })
    await db.membership.create({
      data: { schoolId: school.id, userId: user.id, role },
    })
    return { id: user.id, email }
  }

  const admin = await addUser("school_admin", "Admin Audit")
  const teacher = await addUser("teacher", "Guru Audit")

  created.push({ schoolId: school.id, userIds })

  return {
    schoolId: school.id,
    adminId: admin.id,
    adminEmail: admin.email,
    teacherEmail: teacher.email,
    origin: `http://${slug}.localhost:3000`,
  }
}

async function login(page: Page, origin: string, email: string) {
  await page.goto(`${origin}/login`)
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Kata sandi").fill(PASSWORD)
  await expect(page.getByRole("button", { name: "Masuk" })).toBeEnabled()
  await page.getByRole("button", { name: "Masuk" }).click()
  await expect(page).toHaveURL(/\/beranda$/)
}

test("admin melihat log audit, memfilter, dan memuat halaman berikutnya", async ({
  page,
}, testInfo) => {
  const school = await newSchool(testInfo)

  await db.auditLog.create({
    data: {
      schoolId: school.schoolId,
      actorUserId: school.adminId,
      actorName: "Super Admin Uji",
      actorRole: "platform_admin",
      action: "subscription.activate",
      entity: "school",
      before: { status: "trial" },
      after: { status: "active", planCode: "pro" },
    },
  })
  await db.auditLog.createMany({
    data: Array.from({ length: 52 }, (_, i) => ({
      schoolId: school.schoolId,
      actorUserId: school.adminId,
      actorName: "Admin Audit",
      actorRole: "school_admin",
      action: "rollover.run",
      entity: "semester",
      entityId: `s-${i}`,
    })),
  })

  await login(page, school.origin, school.adminEmail)
  await page.getByRole("link", { name: "Log audit" }).click()
  await expect(page).toHaveURL(/\/audit$/)
  await expect(page.getByRole("heading", { name: "Log audit" })).toBeVisible()

  // 50 baris pertama; tombol muat lebih banyak menambah sisanya (53 total).
  const items = page.getByRole("listitem")
  await expect(items).toHaveCount(50)
  const more = page.getByRole("button", { name: "Muat lebih banyak" })
  await expect(more).toBeEnabled()
  await more.click()
  await expect(items).toHaveCount(53)
  await expect(more).toBeHidden()

  // Filter jenis aksi.
  await page
    .getByLabel("Jenis aksi")
    .selectOption({ label: "Aktivasi paket langganan" })
  await expect(items).toHaveCount(1)
  await expect(page.getByText("Super Admin Uji · Super Admin")).toBeVisible()
  await page.getByText("Rincian").click()
  await expect(page.getByText('"planCode": "pro"')).toBeVisible()
})

test("guru tidak bisa membuka log audit", async ({ page }, testInfo) => {
  const school = await newSchool(testInfo)
  await login(page, school.origin, school.teacherEmail)

  await expect(page.getByRole("link", { name: "Log audit" })).toHaveCount(0)
  await page.goto(`${school.origin}/audit`)
  await expect(page).toHaveURL(/\/beranda$/)
})
