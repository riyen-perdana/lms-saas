import "dotenv/config"

import { randomUUID } from "node:crypto"
import { readFile } from "node:fs/promises"

import { PrismaPg } from "@prisma/adapter-pg"
import { hashPassword } from "better-auth/crypto"
import { expect, test, type Page } from "@playwright/test"

import { PrismaClient } from "../../src/generated/prisma/client.js"

// OB-05: tautan orang tua <-> siswa lewat kode undangan.

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
})

const PASSWORD = "sandi-uji-12345"

const created: { schoolId: string; userIds: string[] }[] = []
const parentEmails: string[] = []

test.afterAll(async () => {
  for (const { schoolId, userIds } of created) {
    await db.school.deleteMany({ where: { id: schoolId } })
    await db.user.deleteMany({ where: { id: { in: userIds } } })
  }
  await db.user.deleteMany({ where: { email: { in: parentEmails } } })
  await db.$disconnect()
})

async function newSchool(testInfo: { project: { name: string } }) {
  const tag = `${randomUUID().slice(0, 6)}${testInfo.project.name === "mobile-360" ? "m" : "d"}`
  const slug = `op-${tag}`
  const email = `op-${tag}@sekolah.test`

  const school = await db.school.create({
    data: {
      slug,
      name: `SMA Orang Tua ${tag}`,
      level: "SMA",
      status: "trial",
      setupCompletedAt: new Date(),
    },
  })
  const userIds: string[] = []

  const admin = await db.user.create({
    data: { email, name: "Admin Orang Tua", emailVerified: true },
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

  const year = await db.academicYear.create({
    data: {
      schoolId: school.id,
      name: "2026/2027",
      startDate: new Date("2026-07-13T00:00:00Z"),
      endDate: new Date("2027-06-26T00:00:00Z"),
      isActive: true,
    },
  })
  const semester = await db.semester.create({
    data: {
      schoolId: school.id,
      academicYearId: year.id,
      name: "Ganjil",
      startDate: new Date("2026-07-13T00:00:00Z"),
      endDate: new Date("2026-12-19T00:00:00Z"),
      isActive: true,
    },
  })
  const room = await db.classroom.create({
    data: {
      schoolId: school.id,
      semesterId: semester.id,
      grade: 10,
      name: "X-1",
    },
  })

  for (const [nis, name] of [
    ["4001", "Ani Lestari"],
    ["4002", "Budi Hartono"],
  ] as const) {
    const user = await db.user.create({
      data: {
        email: `siswa-${nis}-${tag}@sekolah.test`,
        name,
        emailVerified: true,
      },
    })
    userIds.push(user.id)
    const student = await db.student.create({
      data: { schoolId: school.id, userId: user.id, nis },
    })
    await db.enrollment.create({
      data: {
        schoolId: school.id,
        classroomId: room.id,
        studentId: student.id,
      },
    })
  }

  created.push({ schoolId: school.id, userIds })

  return {
    schoolId: school.id,
    slug,
    email,
    tag,
    origin: `http://${slug}.localhost:3000`,
  }
}

async function login(
  page: Page,
  origin: string,
  email: string,
  password = PASSWORD
) {
  await page.goto(`${origin}/login`)
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Kata sandi").fill(password)
  await expect(page.getByRole("button", { name: "Masuk" })).toBeEnabled()
  await page.getByRole("button", { name: "Masuk" }).click()
  await expect(page).toHaveURL(/\/beranda$/)
}

test("admin membuat kode, orang tua mendaftar dan melihat anaknya, kode tidak bisa dipakai ulang", async ({
  page,
  browser,
}, testInfo) => {
  const school = await newSchool(testInfo)
  await login(page, school.origin, school.email)

  await page
    .getByRole("link", { name: "Tautan orang tua dan kode undangan" })
    .click()
  await expect(page).toHaveURL(/\/orang-tua$/)
  await expect(
    page.getByRole("heading", { name: "Tautan orang tua" })
  ).toBeVisible()

  await page
    .getByLabel("Rombel", { exact: true })
    .selectOption({ label: "X-1 (tingkat 10)" })
  const buatAni = page.getByRole("button", {
    name: "Buat kode untuk Ani Lestari",
  })
  await expect(buatAni).toBeEnabled()
  await buatAni.click()
  const kode = (await page.getByTestId("new-code").textContent())?.trim() ?? ""
  expect(kode).toMatch(/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/)
  await expect(page.getByText("Kode menunggu dipakai")).toBeVisible()

  // Hanya hash yang tersimpan.
  const rows = await db.parentLink.findMany({
    where: { schoolId: school.schoolId },
  })
  expect(rows).toHaveLength(1)
  expect(JSON.stringify(rows)).not.toContain(kode.replace("-", ""))

  // Orang tua (browser terpisah) mendaftar dengan kode.
  const viewport = page.viewportSize() ?? undefined
  const parentContext = await browser.newContext({ viewport })
  const parent = await parentContext.newPage()
  const parentEmail = `ortu-${school.tag}@sekolah.test`
  parentEmails.push(parentEmail)

  await parent.goto(`${school.origin}/gabung`)
  const daftar = parent.getByRole("button", { name: "Daftar dan tautkan" })
  await expect(daftar).toBeEnabled()
  await parent.getByLabel("Kode undangan").fill(kode.toLowerCase())
  await parent.getByLabel("Nama lengkap").fill("Ibu Ani")
  await parent.getByLabel("Email").fill(parentEmail)
  await parent.getByLabel("Kata sandi").fill("sandi-ortu-12345")
  await daftar.click()
  await expect(parent.getByRole("status")).toContainText(
    "tertaut ke Ani Lestari"
  )

  await parent.getByRole("link", { name: "Masuk" }).click()
  await expect(parent).toHaveURL(/\/login$/)
  await login(parent, school.origin, parentEmail, "sandi-ortu-12345")
  await expect(parent.getByRole("heading", { name: "Anak Anda" })).toBeVisible()
  await expect(parent.getByText("Ani Lestari")).toBeVisible()
  await expect(parent.getByText("Rombel X-1")).toBeVisible()
  await expect(parent.getByText("Budi Hartono")).toHaveCount(0)
  // Orang tua tidak melihat menu admin dan ditolak di halaman admin.
  await expect(
    parent.getByRole("link", { name: "Tautan orang tua dan kode undangan" })
  ).toHaveCount(0)
  await parent.goto(`${school.origin}/orang-tua`)
  await expect(parent).toHaveURL(/\/beranda$/)

  // Kode yang sama tidak bisa dipakai lagi.
  const otherContext = await browser.newContext({ viewport })
  const other = await otherContext.newPage()
  await other.goto(`${school.origin}/gabung`)
  await expect(
    other.getByRole("button", { name: "Daftar dan tautkan" })
  ).toBeEnabled()
  await other.getByLabel("Kode undangan").fill(kode)
  await other.getByLabel("Nama lengkap").fill("Pengguna Kedua")
  await other.getByLabel("Email").fill(`kedua-${school.tag}@sekolah.test`)
  await other.getByLabel("Kata sandi").fill("sandi-ortu-12345")
  await other.getByRole("button", { name: "Daftar dan tautkan" }).click()
  await expect(other.getByRole("alert")).toContainText(
    "tidak valid atau sudah tidak berlaku"
  )
  expect(
    await db.user.count({
      where: { email: `kedua-${school.tag}@sekolah.test` },
    })
  ).toBe(0)
  await otherContext.close()

  // Admin melihat tautan, membuat kode massal (CSV), lalu mencabut tautan.
  await page.reload()
  // Pilihan rombel baru bekerja setelah hydrate; ulangi sampai daftar termuat.
  await expect(async () => {
    await page
      .getByLabel("Rombel", { exact: true })
      .selectOption({ label: "X-1 (tingkat 10)" })
    await expect(page.getByText("Orang tua: Ibu Ani")).toBeVisible({
      timeout: 1000,
    })
  }).toPass()

  const bulk = page.getByRole("button", { name: "Buat kode untuk semua siswa" })
  await expect(bulk).toBeEnabled()
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    bulk.click(),
  ])
  expect(download.suggestedFilename()).toBe("kode-undangan-X-1.csv")
  const csv = await readFile(await download.path(), "utf-8")
  expect(csv).toContain("4002,Budi Hartono,")
  expect(csv).not.toContain("Ani Lestari")
  await expect(page.getByRole("status")).toContainText(
    "1 kode dibuat, 1 siswa dilewati"
  )

  await page.getByRole("button", { name: "Cabut tautan Ibu Ani" }).click()
  await expect(page.getByText("Orang tua: Ibu Ani")).toHaveCount(0)

  await parent.reload()
  await expect(parent.getByText("Belum ada anak yang tertaut.")).toBeVisible()
  await parentContext.close()
})

test("guru tidak bisa membuka halaman tautan orang tua", async ({
  page,
}, testInfo) => {
  const school = await newSchool(testInfo)
  await db.membership.updateMany({
    where: { userId: created[created.length - 1].userIds[0] },
    data: { role: "teacher" },
  })

  await login(page, school.origin, school.email)
  await page.goto(`${school.origin}/orang-tua`)
  await expect(page).toHaveURL(/\/beranda$/)
})
