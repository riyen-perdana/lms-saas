import "dotenv/config"

import { randomUUID } from "node:crypto"

import { PrismaPg } from "@prisma/adapter-pg"
import { hashPassword } from "better-auth/crypto"
import { expect, test, type Page } from "@playwright/test"

import { PrismaClient } from "../../src/generated/prisma/client.js"

// Dashboard Super Admin (F1). Butuh data seed (`pnpm db:seed`):
// superadmin@edusaas.id (platform admin) dan admin@man3pku.sch.id (bukan).

const PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "ubah-sandi-ini-123"
const SUPER_ADMIN = "superadmin@edusaas.id"
const SCHOOL_ADMIN = "admin@man3pku.sch.id"
const APP = "http://app.localhost:3000"

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
})

const fixtureSlugs: string[] = []

test.afterAll(async () => {
  await db.school.deleteMany({ where: { slug: { in: fixtureSlugs } } })
  await db.$disconnect()
})

async function login(page: Page, email: string) {
  await page.goto(`${APP}/login`)
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Kata sandi").fill(PASSWORD)
  await page.getByRole("button", { name: "Masuk" }).click()
}

test("tanpa login, /platform diarahkan ke halaman login", async ({ page }) => {
  await page.goto(`${APP}/platform`)

  await expect(page).toHaveURL(/app\.localhost:3000\/login/)
})

test("admin sekolah ditolak masuk dashboard platform", async ({ page }) => {
  await login(page, SCHOOL_ADMIN)

  await expect(page.getByRole("alert")).toHaveText(
    "Akun ini bukan Super Admin."
  )
  await page.goto(`${APP}/platform/sekolah`)
  await expect(page).toHaveURL(/\/login/)
})

test("host sekolah tidak bisa membuka dashboard platform", async ({ page }) => {
  await page.goto("http://man3pku.localhost:3000/platform")

  await expect(page).not.toHaveURL(/\/platform/)
})

test("Super Admin melihat ringkasan dan daftar sekolah", async ({ page }) => {
  await login(page, SUPER_ADMIN)

  await expect(page).toHaveURL(/\/platform$/)
  await expect(page.getByRole("heading", { name: "Ringkasan" })).toBeVisible()
  await expect(page.getByText("Total sekolah")).toBeVisible()

  await page.getByRole("link", { name: "Sekolah", exact: true }).click()
  await expect(page).toHaveURL(/\/platform\/sekolah/)
  await expect(
    page.getByRole("link", { name: "MAN 3 Pekanbaru" })
  ).toBeVisible()

  // Pencarian menyaring daftar.
  await page
    .getByRole("textbox", { name: "Cari sekolah" })
    .fill("Demo Nusantara")
  await page.getByRole("button", { name: "Terapkan" }).click()
  await expect(
    page.getByRole("link", { name: "SMA Demo Nusantara" })
  ).toBeVisible()
  await expect(page.getByRole("link", { name: "MAN 3 Pekanbaru" })).toHaveCount(
    0
  )
})

test("Super Admin mengaktifkan paket lalu menangguhkan sekolah", async ({
  page,
}, testInfo) => {
  const suffix = `${randomUUID().slice(0, 6)}${testInfo.project.name === "mobile-360" ? "m" : "d"}`
  const slug = `plat-${suffix}`
  fixtureSlugs.push(slug)

  const school = await db.school.create({
    data: {
      slug,
      name: `Sekolah Fixture ${suffix}`,
      level: "SMA",
      status: "trial",
      setupCompletedAt: new Date(),
    },
  })
  const trial = await db.plan.findUniqueOrThrow({ where: { code: "trial" } })
  const periodEnd = new Date(Date.now() + 5 * 24 * 3600 * 1000)
  await db.subscription.create({
    data: {
      schoolId: school.id,
      planId: trial.id,
      status: "trial",
      periodStart: new Date(),
      periodEnd,
      trialEndsAt: periodEnd,
    },
  })

  await login(page, SUPER_ADMIN)
  await expect(page).toHaveURL(/\/platform$/)
  await page.goto(`${APP}/platform/sekolah/${school.id}`)
  await expect(page.getByRole("heading", { name: school.name })).toBeVisible()
  await expect(page.getByText("Uji coba").first()).toBeVisible()

  // Klik sebelum hydrate tidak berefek; ulangi sampai handler terpasang.
  await expect(async () => {
    await page.getByLabel("Paket").selectOption("standard")
    await page.getByLabel("Periode").selectOption("year")
    await page.getByRole("button", { name: "Aktifkan paket" }).click()
    await expect(page.getByRole("status")).toHaveText(
      "Paket berhasil diaktifkan.",
      {
        timeout: 1500,
      }
    )
  }).toPass({ timeout: 15_000 })

  const updated = await db.school.findUniqueOrThrow({
    where: { id: school.id },
  })
  expect(updated.status).toBe("active")

  page.once("dialog", (dialog) => void dialog.accept())
  await page.getByRole("button", { name: "Tangguhkan sekolah" }).click()
  await expect(page.getByRole("status")).toHaveText("Sekolah ditangguhkan.")
  expect(
    (await db.school.findUniqueOrThrow({ where: { id: school.id } })).status
  ).toBe("suspended")

  await page.getByRole("button", { name: "Aktifkan kembali" }).click()
  await expect(page.getByRole("status")).toHaveText(
    "Sekolah diaktifkan kembali."
  )
  expect(
    (await db.school.findUniqueOrThrow({ where: { id: school.id } })).status
  ).toBe("active")
})

test("admin sekolah yang sudah login terlempar saat sekolahnya ditangguhkan", async ({
  browser,
}, testInfo) => {
  const suffix = `${randomUUID().slice(0, 6)}${testInfo.project.name === "mobile-360" ? "m" : "d"}`
  const slug = `susp-${suffix}`
  const email = `susp-${suffix}@sekolah.test`
  fixtureSlugs.push(slug)

  const school = await db.school.create({
    data: {
      slug,
      name: `Sekolah Susp ${suffix}`,
      level: "SMA",
      status: "active",
      setupCompletedAt: new Date(),
    },
  })
  const user = await db.user.create({
    data: { email, name: "Admin Susp", emailVerified: true },
  })
  await db.account.create({
    data: {
      userId: user.id,
      providerId: "credential",
      accountId: user.id,
      password: await hashPassword(PASSWORD),
    },
  })
  await db.membership.create({
    data: { schoolId: school.id, userId: user.id, role: "school_admin" },
  })

  const adminCtx = await browser.newContext()
  const superCtx = await browser.newContext()
  try {
    // Admin sekolah login dan masuk beranda.
    const adminPage = await adminCtx.newPage()
    const schoolOrigin = `http://${slug}.localhost:3000`
    await adminPage.goto(`${schoolOrigin}/login`)
    await adminPage.getByLabel("Email").fill(email)
    await adminPage.getByLabel("Kata sandi").fill(PASSWORD)
    await adminPage.getByRole("button", { name: "Masuk" }).click()
    await expect(adminPage).toHaveURL(/\/beranda$/)

    // Super Admin menangguhkan sekolah itu lewat dashboard.
    const superPage = await superCtx.newPage()
    await login(superPage, SUPER_ADMIN)
    await expect(superPage).toHaveURL(/\/platform$/)
    await superPage.goto(`${APP}/platform/sekolah/${school.id}`)
    superPage.once("dialog", (dialog) => void dialog.accept())
    await expect(async () => {
      await superPage
        .getByRole("button", { name: "Tangguhkan sekolah" })
        .click()
      await expect(superPage.getByRole("status")).toHaveText(
        "Sekolah ditangguhkan.",
        { timeout: 1500 }
      )
    }).toPass({ timeout: 15_000 })

    // Sesi lama tidak lagi berlaku: diarahkan ke login dengan pemberitahuan.
    await adminPage.goto(`${schoolOrigin}/beranda`)
    await expect(adminPage).toHaveURL(/\/login$/)
    await expect(adminPage.getByRole("alert")).toContainText(
      "Sekolah ini sedang ditangguhkan"
    )
  } finally {
    await adminCtx.close()
    await superCtx.close()
    await db.user.deleteMany({ where: { email } })
  }
})
