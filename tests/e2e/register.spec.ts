import "dotenv/config"

import { randomUUID } from "node:crypto"

import { PrismaPg } from "@prisma/adapter-pg"
import { expect, test } from "@playwright/test"

import { PrismaClient } from "../../src/generated/prisma/client.js"

// Gate F1: "Sekolah baru terdaftar dan bisa login di subdomainnya".
// LP-04: slug terpakai / kata terlarang ditolak.

const admin = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
})

const created: { slug: string; email: string }[] = []

test.afterAll(async () => {
  for (const { slug, email } of created) {
    await admin.school.deleteMany({ where: { slug } })
    await admin.user.deleteMany({ where: { email } })
  }
  await admin.$disconnect()
})

test("sekolah baru terdaftar lalu admin bisa login di subdomainnya", async ({ page }, testInfo) => {
  const id = `${randomUUID().slice(0, 6)}${testInfo.project.name === "mobile-360" ? "m" : "d"}`
  const slug = `uji-${id}`
  const email = `admin-${id}@sekolah.test`
  const password = "sandi-uji-12345"
  created.push({ slug, email })

  await page.goto("/daftar")
  await page.getByLabel("Nama sekolah").fill("SMA Uji Pendaftaran")
  await page.getByLabel("Jenjang").selectOption("SMA")
  await page.getByLabel("Subdomain sekolah").fill(slug)
  await expect(page.getByText(`Tersedia: ${slug}.`)).toBeVisible()
  await page.getByLabel("Nama admin").fill("Admin Uji")
  await page.getByLabel("Email admin").fill(email)
  await page.getByLabel("Kata sandi").fill(password)
  await page.getByRole("button", { name: "Daftar & mulai trial" }).click()

  await expect(
    page.getByRole("heading", { name: "Sekolah Anda sudah terdaftar." })
  ).toBeVisible()
  await page.getByRole("link", { name: "Masuk ke sekolah" }).click()

  await expect(page).toHaveURL(new RegExp(`${slug}\\.localhost:3000/login`))
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Kata sandi").fill(password)
  await page.getByRole("button", { name: "Masuk" }).click()

  await expect(page).toHaveURL(
    new RegExp(`${slug}\\.localhost:3000/beranda$`)
  )
  await expect(
    page.getByRole("heading", { name: "SMA Uji Pendaftaran" })
  ).toBeVisible()
})

test("subdomain yang sudah dipakai ditolak dan tombol daftar nonaktif", async ({ page }) => {
  await page.goto("/daftar")
  await page.getByLabel("Subdomain sekolah").fill("man3pku")

  await expect(
    page.getByRole("alert").filter({ hasText: "Subdomain sudah dipakai" })
  ).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Daftar & mulai trial" })
  ).toBeDisabled()
})

test("kata terlarang pada subdomain ditolak", async ({ page }) => {
  await page.goto("/daftar")
  await page.getByLabel("Subdomain sekolah").fill("admin")

  await expect(
    page.getByRole("alert").filter({ hasText: "kata terlarang" })
  ).toBeVisible()
})

test("form kosong menampilkan pesan error berbahasa Indonesia", async ({ page }) => {
  await page.goto("/daftar")
  const submit = page.getByRole("button", { name: "Daftar & mulai trial" })
  await expect(submit).toBeEnabled()
  await submit.click()

  await expect(page.getByText("Nama sekolah minimal 3 karakter")).toBeVisible()
  await expect(page.getByText("Kata sandi minimal 8 karakter")).toBeVisible()
})
