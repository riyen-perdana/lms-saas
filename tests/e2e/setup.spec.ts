import "dotenv/config"

import { randomUUID } from "node:crypto"
import { rm } from "node:fs/promises"

import { PrismaPg } from "@prisma/adapter-pg"
import { hashPassword } from "better-auth/crypto"
import { expect, test, type Page } from "@playwright/test"

import { PrismaClient } from "../../src/generated/prisma/client.js"

// OB-01: wizard setup pertama untuk admin sekolah baru.

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
})

const PASSWORD = "sandi-uji-12345"
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64"
)

const created: { schoolId: string; userId: string }[] = []

test.afterAll(async () => {
  for (const { schoolId, userId } of created) {
    await db.school.deleteMany({ where: { id: schoolId } })
    await db.user.deleteMany({ where: { id: userId } })
    await rm(`.storage/schools/${schoolId}`, { recursive: true, force: true })
  }
  await db.$disconnect()
})

async function newSchool(level: "SMA" | "SMK", testInfo: { project: { name: string } }) {
  const tag = `${randomUUID().slice(0, 6)}${testInfo.project.name === "mobile-360" ? "m" : "d"}`
  const slug = `setup-${tag}`
  const email = `setup-${tag}@sekolah.test`

  const school = await db.school.create({
    data: { slug, name: `Sekolah Setup ${tag}`, level, status: "trial" },
  })
  const user = await db.user.create({
    data: { email, name: "Admin Setup", emailVerified: true },
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
  created.push({ schoolId: school.id, userId: user.id })

  return { slug, email, name: school.name, origin: `http://${slug}.localhost:3000` }
}

async function login(page: Page, origin: string, email: string) {
  await page.goto(`${origin}/login`)
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Kata sandi").fill(PASSWORD)
  await expect(page.getByRole("button", { name: "Masuk" })).toBeEnabled()
  await page.getByRole("button", { name: "Masuk" }).click()
}

test("admin sekolah SMA menyelesaikan wizard lalu masuk beranda", async ({ page }, testInfo) => {
  const school = await newSchool("SMA", testInfo)
  await login(page, school.origin, school.email)

  // Sekolah baru diarahkan ke wizard, bukan beranda.
  await expect(page).toHaveURL(/\/setup$/)
  await expect(page.getByRole("heading", { name: `Setup ${school.name}` })).toBeVisible()

  // Langkah 1: profil + logo.
  await expect(page.getByRole("button", { name: "Simpan dan lanjut" })).toBeEnabled()
  await page.getByLabel("Nama sekolah").fill("SMA Negeri Wizard")
  await page.getByLabel("Logo sekolah (opsional)").setInputFiles({
    name: "logo.png",
    mimeType: "image/png",
    buffer: PNG,
  })
  await page.getByRole("button", { name: "Simpan dan lanjut" }).click()

  // Langkah 2: tahun ajaran dengan isian awal dari tanggal hari ini.
  await expect(page.getByRole("heading", { name: "Tahun ajaran", level: 2 })).toBeVisible()
  await expect(page.getByRole("button", { name: "Lanjut" })).toBeDisabled()
  await expect(page.getByRole("button", { name: "Simpan tahun ajaran" })).toBeEnabled()
  await page.getByRole("button", { name: "Simpan tahun ajaran" }).click()
  await expect(page.getByText(/\(aktif\)/)).toBeVisible()
  await page.getByRole("button", { name: "Lanjut" }).click()

  // Langkah 3: rombel.
  await expect(page.getByRole("heading", { name: "Rombel", level: 2 })).toBeVisible()
  await expect(page.getByLabel("Jurusan")).toHaveCount(0)
  await expect(page.getByRole("button", { name: "Tambah" })).toBeEnabled()
  await page.getByLabel("Nama rombel").fill("X-1")
  await page.getByRole("button", { name: "Tambah" }).click()
  await expect(page.getByText("X-1 (tingkat 10)")).toBeVisible()
  await page.getByRole("button", { name: "Lanjut" }).click()

  // Langkah 4: mapel, lalu selesai.
  await expect(page.getByRole("heading", { name: "Mata pelajaran", level: 2 })).toBeVisible()
  await expect(page.getByRole("button", { name: "Tambah" })).toBeEnabled()
  await page.getByLabel("Kode").fill("mtk")
  await page.getByLabel("Nama mapel").fill("Matematika")
  await page.getByRole("button", { name: "Tambah" }).click()
  await expect(page.getByText("MTK — Matematika (Umum)")).toBeVisible()
  await page.getByRole("button", { name: "Selesai" }).click()

  await expect(page).toHaveURL(/\/beranda$/)
  await expect(page.getByRole("heading", { name: "SMA Negeri Wizard" })).toBeVisible()

  // Wizard tidak bisa dibuka lagi, dan logo tersedia untuk host sekolah ini.
  await page.goto(`${school.origin}/setup`)
  await expect(page).toHaveURL(/\/beranda$/)
  const logoStatus = await page.evaluate(async () => (await fetch("/api/logo")).status)
  expect(logoStatus).toBe(200)
})

test("SMK memiliki langkah jurusan yang dipakai saat membuat rombel", async ({ page }, testInfo) => {
  const school = await newSchool("SMK", testInfo)
  await login(page, school.origin, school.email)
  await expect(page).toHaveURL(/\/setup$/)

  await page.getByRole("button", { name: "2. Tahun ajaran" }).click()
  await expect(page.getByRole("button", { name: "Simpan tahun ajaran" })).toBeEnabled()
  await page.getByRole("button", { name: "Simpan tahun ajaran" }).click()
  await expect(page.getByText(/\(aktif\)/)).toBeVisible()
  await page.getByRole("button", { name: "Lanjut" }).click()

  await expect(page.getByRole("heading", { name: "Jurusan", level: 2 })).toBeVisible()
  await expect(page.getByRole("button", { name: "Tambah" })).toBeEnabled()
  await page.getByLabel("Kode").fill("tkj")
  await page.getByLabel("Nama jurusan").fill("Teknik Komputer dan Jaringan")
  await page.getByRole("button", { name: "Tambah" }).click()
  await expect(page.getByText("TKJ — Teknik Komputer dan Jaringan")).toBeVisible()
  await page.getByRole("button", { name: "Lanjut" }).click()

  await expect(page.getByRole("heading", { name: "Rombel", level: 2 })).toBeVisible()
  await expect(page.getByRole("button", { name: "Tambah" })).toBeEnabled()
  await page.getByLabel("Nama rombel").fill("X TKJ 1")
  await page.getByLabel("Jurusan").selectOption({ label: "TKJ" })
  await page.getByRole("button", { name: "Tambah" }).click()
  await expect(page.getByText("X TKJ 1 (tingkat 10, TKJ)")).toBeVisible()
})

test("guru tidak bisa membuka wizard", async ({ page }, testInfo) => {
  const school = await newSchool("SMA", testInfo)
  const row = created[created.length - 1]
  await db.membership.updateMany({ where: { userId: row.userId }, data: { role: "teacher" } })

  await login(page, school.origin, school.email)
  // Guru tidak dialihkan ke wizard; admin-lah yang menyiapkan sekolah.
  await expect(page).toHaveURL(/\/beranda$/)
  await page.goto(`${school.origin}/setup`)
  await expect(page).toHaveURL(/\/beranda$/)
})
