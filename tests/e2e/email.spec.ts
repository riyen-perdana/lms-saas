import "dotenv/config"

import { randomUUID } from "node:crypto"
import { existsSync, readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"

import { PrismaPg } from "@prisma/adapter-pg"
import { expect, test } from "@playwright/test"
import { hashPassword } from "better-auth/crypto"

import { PrismaClient } from "../../src/generated/prisma/client.js"

// US-02 (reset sandi, verifikasi email). Email dikirim lewat antrean pg-boss
// ke driver `console`, yang menulis ke .email-outbox/ — test membaca dari sana.

const OUTBOX = join(process.cwd(), ".email-outbox")
const OLD_PASSWORD = "sandi-lama-12345"
const NEW_PASSWORD = "sandi-baru-67890"

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
})

const slugs: string[] = []
const emails: string[] = []

test.afterAll(async () => {
  await db.school.deleteMany({ where: { slug: { in: slugs } } })
  await db.user.deleteMany({ where: { email: { in: emails } } })
  await db.$disconnect()
})

function emailFilesFor(to: string): string[] {
  if (!existsSync(OUTBOX)) return []
  const safe = to.replace(/[^a-z0-9@._-]/gi, "_")

  return readdirSync(OUTBOX)
    .filter((name) => name.endsWith(`-${safe}.json`))
    .sort()
}

/** Menunggu email tiba (melewati antrean), lalu mengembalikan email terbaru. */
async function waitForEmail(to: string, after = 0) {
  const deadline = Date.now() + 25_000
  while (Date.now() < deadline) {
    const files = emailFilesFor(to)
    if (files.length > after) {
      const latest = files[files.length - 1]
      return JSON.parse(readFileSync(join(OUTBOX, latest), "utf8")) as {
        subject: string
        text: string
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error(`Email untuk ${to} tidak tiba dalam 25 detik`)
}

function linkIn(text: string): string {
  const url = /https?:\/\/\S+/.exec(text)?.[0]
  if (!url) throw new Error("Tidak ada tautan di email")
  return url
}

async function makeSchoolWithAdmin(tag: string) {
  const slug = `eml-${tag}`
  const email = `eml-${tag}@sekolah.test`
  slugs.push(slug)
  emails.push(email)

  const school = await db.school.create({
    data: {
      slug,
      name: `Sekolah Email ${tag}`,
      level: "SMA",
      status: "active",
      setupCompletedAt: new Date(),
    },
  })
  const user = await db.user.create({
    data: { email, name: "Admin Email", emailVerified: true },
  })
  await db.account.create({
    data: {
      userId: user.id,
      providerId: "credential",
      accountId: user.id,
      password: await hashPassword(OLD_PASSWORD),
    },
  })
  await db.membership.create({
    data: { schoolId: school.id, userId: user.id, role: "school_admin" },
  })

  return { slug, email, origin: `http://${slug}.localhost:3000` }
}

function newTag(project: string) {
  return `${randomUUID().slice(0, 6)}${project === "mobile-360" ? "m" : "d"}`
}

test("lupa sandi: tautan di email mengganti sandi dan login dengan sandi baru", async ({
  page,
}, testInfo) => {
  const { email, origin } = await makeSchoolWithAdmin(
    newTag(testInfo.project.name)
  )

  await page.goto(`${origin}/login`)
  await page.getByRole("link", { name: "Lupa kata sandi?" }).click()
  await expect(page).toHaveURL(/\/lupa-sandi$/)

  await page.getByLabel("Email").fill(email)
  await expect(page.getByRole("button", { name: "Kirim tautan" })).toBeEnabled()
  await page.getByRole("button", { name: "Kirim tautan" }).click()
  await expect(page.getByRole("status")).toContainText(
    "Jika email tersebut terdaftar"
  )

  const message = await waitForEmail(email)
  expect(message.subject).toContain("Atur ulang")

  await page.goto(linkIn(message.text))
  await expect(page).toHaveURL(/\/atur-ulang-sandi\?token=/)
  await page.getByLabel("Kata sandi baru", { exact: true }).fill(NEW_PASSWORD)
  await page.getByLabel("Ulangi kata sandi baru").fill(NEW_PASSWORD)
  await expect(
    page.getByRole("button", { name: "Simpan kata sandi" })
  ).toBeEnabled()
  await page.getByRole("button", { name: "Simpan kata sandi" }).click()
  await expect(page.getByRole("status")).toContainText(
    "Kata sandi Anda sudah diganti"
  )

  // Sandi lama ditolak, sandi baru diterima.
  await page.goto(`${origin}/login`)
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Kata sandi").fill(OLD_PASSWORD)
  await expect(page.getByRole("button", { name: "Masuk" })).toBeEnabled()
  await page.getByRole("button", { name: "Masuk" }).click()
  await expect(page.getByRole("alert")).toHaveText(
    "Email atau kata sandi salah."
  )

  await page.getByLabel("Kata sandi").fill(NEW_PASSWORD)
  await page.getByRole("button", { name: "Masuk" }).click()
  await expect(page).toHaveURL(/\/beranda$/)
})

test("lupa sandi: email tak terdaftar mendapat pesan sama dan tidak ada email terkirim", async ({
  page,
}, testInfo) => {
  const { origin } = await makeSchoolWithAdmin(newTag(testInfo.project.name))
  const ghost = `hantu-${randomUUID().slice(0, 8)}@sekolah.test`

  await page.goto(`${origin}/lupa-sandi`)
  await page.getByLabel("Email").fill(ghost)
  await expect(page.getByRole("button", { name: "Kirim tautan" })).toBeEnabled()
  await page.getByRole("button", { name: "Kirim tautan" }).click()
  await expect(page.getByRole("status")).toContainText(
    "Jika email tersebut terdaftar"
  )

  await new Promise((resolve) => setTimeout(resolve, 4000))
  expect(emailFilesFor(ghost)).toHaveLength(0)
})

test("tautan reset tidak valid ditolak dengan pesan jelas", async ({
  page,
}) => {
  await page.goto("http://localhost:3000/atur-ulang-sandi?error=INVALID_TOKEN")

  await expect(page.getByRole("alert")).toContainText("sudah kedaluwarsa")
  await expect(
    page.getByRole("link", { name: "Minta tautan baru" })
  ).toBeVisible()
})

test("pendaftaran sekolah mengirim email verifikasi yang berfungsi", async ({
  page,
}, testInfo) => {
  const tag = newTag(testInfo.project.name)
  const slug = `ver-${tag}`
  const email = `ver-${tag}@sekolah.test`
  slugs.push(slug)
  emails.push(email)

  await page.goto("/daftar")
  await page.getByLabel("Nama sekolah").fill("SMA Uji Verifikasi")
  await page.getByLabel("Jenjang").selectOption("SMA")
  await page.getByLabel("Subdomain sekolah").fill(slug)
  await expect(page.getByText(`Tersedia: ${slug}.`)).toBeVisible()
  await page.getByLabel("Nama admin").fill("Admin Verifikasi")
  await page.getByLabel("Email admin").fill(email)
  await page.getByLabel("Kata sandi").fill(OLD_PASSWORD)
  await page.getByRole("button", { name: "Daftar & mulai trial" }).click()
  await expect(
    page.getByRole("heading", { name: "Sekolah Anda sudah terdaftar." })
  ).toBeVisible()

  const message = await waitForEmail(email)
  expect(message.subject).toContain("Verifikasi")
  expect(
    (await db.user.findUniqueOrThrow({ where: { email } })).emailVerified
  ).toBe(false)

  // Membuka tautan memverifikasi email lalu mengarahkan ke login sekolah.
  await page.goto(linkIn(message.text))
  await expect(page).toHaveURL(new RegExp(`${slug}\\.localhost:3000/login`))
  expect(
    (await db.user.findUniqueOrThrow({ where: { email } })).emailVerified
  ).toBe(true)
})
