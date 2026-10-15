import "dotenv/config"

import { randomUUID } from "node:crypto"
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

import { PrismaPg } from "@prisma/adapter-pg"
import { hashPassword } from "better-auth/crypto"
import { expect, test, type Page } from "@playwright/test"

import { PrismaClient } from "../../src/generated/prisma/client.js"

// US-02: admin mereset sandi guru dari /pengguna (email tautan atur sandi).

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
})

const PASSWORD = "sandi-uji-12345"
const OUTBOX = join(process.cwd(), ".email-outbox")

const created: { schoolId: string; userIds: string[] }[] = []

test.afterAll(async () => {
  for (const { schoolId, userIds } of created) {
    await db.school.deleteMany({ where: { id: schoolId } })
    await db.user.deleteMany({ where: { id: { in: userIds } } })
  }
  await db.$disconnect()
})

function emailFilesFor(to: string): string[] {
  if (!existsSync(OUTBOX)) return []
  const safe = to.replace(/[^a-z0-9@._-]/gi, "_")
  return readdirSync(OUTBOX)
    .filter((name) => name.endsWith(`-${safe}.json`))
    .sort()
}

async function waitForEmail(to: string) {
  const deadline = Date.now() + 25_000
  while (Date.now() < deadline) {
    const files = emailFilesFor(to)
    if (files.length > 0) {
      return JSON.parse(
        readFileSync(join(OUTBOX, files[files.length - 1]), "utf8")
      ) as { subject: string; text: string }
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error(`Email untuk ${to} tidak tiba dalam 25 detik`)
}

async function newSchool(testInfo: { project: { name: string } }) {
  const tag = `${randomUUID().slice(0, 6)}${testInfo.project.name === "mobile-360" ? "m" : "d"}`
  const slug = `um-${tag}`
  const email = `um-${tag}@sekolah.test`
  const teacherEmail = `guru-${tag}@sekolah.test`

  const school = await db.school.create({
    data: {
      slug,
      name: `SMA Pengguna ${tag}`,
      level: "SMA",
      status: "trial",
      setupCompletedAt: new Date(),
    },
  })
  const userIds: string[] = []
  created.push({ schoolId: school.id, userIds })

  const admin = await db.user.create({
    data: { email, name: "Admin Pengguna", emailVerified: true },
  })
  userIds.push(admin.id)
  await db.account.create({
    data: {
      userId: admin.id,
      providerId: "credential",
      accountId: admin.id,
      password: await hashPassword(PASSWORD),
    },
  })
  await db.membership.create({
    data: { schoolId: school.id, userId: admin.id, role: "school_admin" },
  })

  const teacherUser = await db.user.create({
    data: { email: teacherEmail, name: "Guru Uji", emailVerified: true },
  })
  userIds.push(teacherUser.id)
  await db.account.create({
    data: {
      userId: teacherUser.id,
      providerId: "credential",
      accountId: teacherUser.id,
      password: await hashPassword(PASSWORD),
    },
  })
  await db.membership.create({
    data: { schoolId: school.id, userId: teacherUser.id, role: "teacher" },
  })
  await db.teacher.create({
    data: { schoolId: school.id, userId: teacherUser.id, code: "GRU-E2E" },
  })

  const studentUser = await db.user.create({
    data: {
      email: `siswa-9001-${tag}@sekolah.test`,
      name: "Siswa Uji",
      emailVerified: true,
    },
  })
  userIds.push(studentUser.id)
  await db.student.create({
    data: { schoolId: school.id, userId: studentUser.id, nis: "9001" },
  })

  return {
    schoolId: school.id,
    slug,
    email,
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
  await expect(page).toHaveURL(/\/beranda$/)
}

test("admin mereset sandi guru dari /pengguna, siswa tidak bisa direset", async ({
  page,
}, testInfo) => {
  const school = await newSchool(testInfo)
  await login(page, school.origin, school.email)

  await page.goto(`${school.origin}/pengguna`)
  await expect(page).toHaveURL(/\/pengguna$/)
  const main = page.getByRole("main")
  await expect(main.getByRole("heading", { name: "Pengguna" })).toBeVisible()

  // Siswa tampil dengan tombol PIN, tanpa tombol reset sandi guru.
  const siswa = main.getByRole("row", { name: /Siswa Uji/ })
  await expect(siswa).toBeVisible()
  await expect(siswa.getByRole("button")).toHaveCount(1)
  await expect(
    siswa.getByRole("button", { name: "Buat PIN Siswa Uji" })
  ).toBeVisible()
  await expect(
    siswa.getByRole("button", { name: /Reset sandi/ })
  ).toHaveCount(0)

  // Cari guru, reset, konfirmasi.
  await expect(main.getByRole("button", { name: "Cari", exact: true })).toBeEnabled()
  await main.getByLabel("Cari", { exact: true }).fill("GRU-E2E")
  await main.getByRole("button", { name: "Cari", exact: true }).click()
  await expect(main.getByRole("row", { name: /Guru Uji/ })).toBeVisible()
  await expect(main.getByRole("row", { name: /Siswa Uji/ })).toHaveCount(0)

  const reset = main.getByRole("button", { name: "Reset sandi Guru Uji" })
  await expect(reset).toBeEnabled()
  await reset.click()
  await main.getByRole("button", { name: "Ya, kirim" }).click()
  await expect(main.getByRole("status")).toContainText(
    "Tautan atur sandi dikirim"
  )

  const message = await waitForEmail(school.teacherEmail)
  expect(message.subject).toContain("Atur ulang")
  expect(message.text).toContain(`${school.slug}.localhost:3000`)

  // Tercatat di log audit.
  await page.goto(`${school.origin}/audit`)
  await expect(
    page
      .getByRole("main")
      .getByRole("listitem")
      .filter({ hasText: "Permintaan reset sandi pengguna" })
      .first()
  ).toBeVisible()
})
