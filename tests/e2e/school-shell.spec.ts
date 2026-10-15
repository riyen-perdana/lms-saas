import "dotenv/config"

import { randomUUID } from "node:crypto"

import { PrismaPg } from "@prisma/adapter-pg"
import { hashPassword } from "better-auth/crypto"
import { expect, test, type Page } from "@playwright/test"

import { PrismaClient } from "../../src/generated/prisma/client.js"

// Shell sekolah: sidebar per peran, breadcrumb, penjaga setup, Keluar.

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

async function newSchool(
  testInfo: { project: { name: string } },
  setupDone = true
) {
  const tag = `${randomUUID().slice(0, 6)}${testInfo.project.name === "mobile-360" ? "m" : "d"}`
  const slug = `sh-${tag}`

  const school = await db.school.create({
    data: {
      slug,
      name: `SMA Shell ${tag}`,
      level: "SMA",
      status: "trial",
      setupCompletedAt: setupDone ? new Date() : null,
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
    return email
  }

  const adminEmail = await addUser("school_admin", "Admin Shell")
  const teacherEmail = await addUser("teacher", "Guru Shell")

  created.push({ schoolId: school.id, userIds })

  return {
    adminEmail,
    teacherEmail,
    origin: `http://${slug}.localhost:3000`,
  }
}

async function login(page: Page, origin: string, email: string) {
  await page.goto(`${origin}/login`)
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Kata sandi").fill(PASSWORD)
  await expect(page.getByRole("button", { name: "Masuk" })).toBeEnabled()
  await page.getByRole("button", { name: "Masuk" }).click()
  await expect(page).toHaveURL(/\/(beranda|setup)$/)
}

// Di layar 360 px sidebar menjadi sheet tertutup; buka dulu bila perlu.
async function openSidebarIfMobile(
  page: Page,
  testInfo: { project: { name: string } }
) {
  if (testInfo.project.name === "mobile-360") {
    await page.getByRole("button", { name: "Buka/tutup sidebar" }).click()
  }
}

test("admin melihat menu bergrup dan breadcrumb mengikuti halaman", async ({
  page,
}, testInfo) => {
  const school = await newSchool(testInfo)
  await login(page, school.origin, school.adminEmail)

  await openSidebarIfMobile(page, testInfo)
  for (const group of ["Utama", "Akademik", "Data", "Sistem"]) {
    await expect(page.getByText(group, { exact: true })).toBeVisible()
  }

  await page.getByRole("link", { name: "Audit", exact: true }).click()
  await expect(page).toHaveURL(/\/audit$/)
  const crumbs = page.locator('nav[aria-label="breadcrumb"]')
  await expect(crumbs).toContainText("Sistem")
  await expect(crumbs).toContainText("Audit")
})

test("guru hanya melihat Beranda dan tidak bisa membuka halaman admin", async ({
  page,
}, testInfo) => {
  const school = await newSchool(testInfo)
  await login(page, school.origin, school.teacherEmail)

  await openSidebarIfMobile(page, testInfo)
  await expect(page.locator('[data-slot="sidebar"]').getByRole("link", { name: "Beranda", exact: true })).toBeVisible()
  await expect(page.getByRole("link", { name: "Audit", exact: true })).toHaveCount(0)
  await expect(page.getByText("Akademik", { exact: true })).toHaveCount(0)

  await page.goto(`${school.origin}/audit`)
  await expect(page).toHaveURL(/\/beranda$/)
})

test("admin yang belum selesai setup diarahkan ke /setup dari halaman admin", async ({
  page,
}, testInfo) => {
  const school = await newSchool(testInfo, false)
  await login(page, school.origin, school.adminEmail)
  await expect(page).toHaveURL(/\/setup$/)

  await page.goto(`${school.origin}/audit`)
  await expect(page).toHaveURL(/\/setup$/)
})

test("Keluar dari menu akun mengembalikan ke login", async ({ page }, testInfo) => {
  const school = await newSchool(testInfo)
  await login(page, school.origin, school.adminEmail)

  // Tunggu transisi login -> beranda selesai; klik di tengah transisi bisa
  // terkunci pada frame lama ("element is outside of the viewport").
  await expect(page.getByRole("heading", { name: /SMA Shell/ })).toBeVisible()
  await page.waitForLoadState("networkidle")

  // Klik sebelum hydrate tidak berefek; ulangi sampai handler terpasang.
  await expect(async () => {
    const account = page.getByRole("button", { name: /Admin sekolah/ })
    if (!(await account.isVisible())) {
      await page.getByRole("button", { name: "Buka/tutup sidebar" }).click()
    }
    const keluar = page.getByRole("menuitem", { name: "Keluar" })
    // Jangan klik pemicu lagi bila menu sudah terbuka (akan menutupnya).
    if (!(await keluar.isVisible())) await account.click({ timeout: 3000 })
    await keluar.click({ timeout: 3000 })
    await expect(page).toHaveURL(/\/login$/, { timeout: 1500 })
  }).toPass({ timeout: 15_000 })
})
