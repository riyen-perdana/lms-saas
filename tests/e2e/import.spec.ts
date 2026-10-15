import "dotenv/config"

import { randomUUID } from "node:crypto"
import { rm } from "node:fs/promises"
import { createRequire } from "node:module"

import type * as ExcelJSModule from "exceljs"
import { PrismaPg } from "@prisma/adapter-pg"
import { hashPassword } from "better-auth/crypto"
import { expect, test, type Page } from "@playwright/test"

import { PrismaClient } from "../../src/generated/prisma/client.js"

// OB-02: impor guru & siswa dari template Excel lewat UI.

// exceljs hanya CommonJS; impor named tidak bisa dipakai di ESM.
const ExcelJS = createRequire(import.meta.url)("exceljs") as typeof ExcelJSModule

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
})

const PASSWORD = "sandi-uji-12345"
const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

const created: { schoolId: string; userId: string }[] = []

test.afterAll(async () => {
  for (const { schoolId, userId } of created) {
    await db.school.deleteMany({ where: { id: schoolId } })
    await db.user.deleteMany({ where: { id: userId } })
    await rm(`.storage/schools/${schoolId}`, { recursive: true, force: true })
  }
  await db.$disconnect()
})

async function newSchool(testInfo: { project: { name: string } }) {
  const tag = `${randomUUID().slice(0, 6)}${testInfo.project.name === "mobile-360" ? "m" : "d"}`
  const slug = `imp-${tag}`
  const email = `imp-${tag}@sekolah.test`

  const school = await db.school.create({
    data: {
      slug,
      name: `SMA Impor ${tag}`,
      level: "SMA",
      status: "trial",
      setupCompletedAt: new Date(),
    },
  })
  const user = await db.user.create({
    data: { email, name: "Admin Impor", emailVerified: true },
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

  // Tahun ajaran + rombel aktif supaya kolom "Rombel" pada template bisa dipakai.
  const semester = await db.semester.create({
    data: {
      schoolId: school.id,
      academicYearId: (
        await db.academicYear.create({
          data: {
            schoolId: school.id,
            name: "2026/2027",
            startDate: new Date("2026-07-13T00:00:00Z"),
            endDate: new Date("2027-06-26T00:00:00Z"),
            isActive: true,
          },
        })
      ).id,
      name: "Ganjil",
      startDate: new Date("2026-07-13T00:00:00Z"),
      endDate: new Date("2026-12-19T00:00:00Z"),
      isActive: true,
    },
  })
  await db.classroom.create({
    data: { schoolId: school.id, semesterId: semester.id, grade: 10, name: "X-1" },
  })

  return { schoolId: school.id, slug, email, origin: `http://${slug}.localhost:3000` }
}

async function login(page: Page, origin: string, email: string) {
  await page.goto(`${origin}/login`)
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Kata sandi").fill(PASSWORD)
  await expect(page.getByRole("button", { name: "Masuk" })).toBeEnabled()
  await page.getByRole("button", { name: "Masuk" }).click()
  await expect(page).toHaveURL(/\/beranda$/)
}

interface StudentRow {
  nis: string
  nisn?: string
  name: string
  gender?: string
  classroom?: string
}

async function studentWorkbook(rows: StudentRow[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet("Siswa")
  sheet.addRow(["NIS", "NISN", "Nama", "Jenis kelamin", "Rombel"])
  for (const row of rows) {
    sheet.addRow([
      row.nis,
      row.nisn ?? "",
      row.name,
      row.gender ?? "",
      row.classroom ?? "",
    ])
  }
  const data = await workbook.xlsx.writeBuffer()
  return Buffer.from(new Uint8Array(data))
}

test("admin sekolah mengimpor siswa dari Excel dan mengunduh laporan error", async ({
  page,
}, testInfo) => {
  const school = await newSchool(testInfo)
  await login(page, school.origin, school.email)

  await page.getByRole("link", { name: "Impor guru dan siswa dari Excel" }).click()
  await expect(page).toHaveURL(/\/impor$/)
  await expect(page.getByRole("heading", { name: "Impor guru dan siswa" })).toBeVisible()

  // Template siswa bisa diunduh dan memang .xlsx.
  const unduhTemplate = page.waitForEvent("download")
  await page.getByRole("link", { name: /Unduh template siswa/ }).click()
  const template = await unduhTemplate
  expect(template.suggestedFilename()).toBe("template-impor-siswa.xlsx")

  // Berkas dengan satu baris tidak valid (rombel tidak ada).
  const file = await studentWorkbook([
    { nis: "3001", name: "Ananda Saputra", gender: "L", classroom: "X-1" },
    { nis: "3002", name: "Bela Lestari", gender: "P", classroom: "X-9" },
  ])

  await page.getByLabel("Berkas Excel").setInputFiles({
    name: "siswa.xlsx",
    mimeType: XLSX_MIME,
    buffer: file,
  })
  await expect(page.getByRole("button", { name: "Impor", exact: true })).toBeEnabled()
  await page.getByRole("button", { name: "Impor", exact: true }).click()

  // Worker pg-boss memproses berkas; tabel disegarkan otomatis.
  await expect(page.getByRole("cell", { name: "siswa.xlsx" })).toBeVisible()
  await expect
    .poll(
      async () => {
        const batches = await db.importBatch.findMany({
          where: { schoolId: school.schoolId },
          orderBy: { createdAt: "desc" },
          take: 1,
        })
        return batches.length > 0 ? batches[0].status : "belum ada"
      },
      { timeout: 30_000 }
    )
    .toBe("done")

  await expect(page.getByText("Selesai")).toBeVisible({ timeout: 15_000 })
  await expect(page.getByRole("cell", { name: "siswa.xlsx" })).toBeVisible()
  await expect(page.getByRole("link", { name: "Unduh laporan" })).toBeVisible()

  // Satu baris tersimpan dan satu enrollment ke rombel X-1 terbentuk.
  const { schoolId } = school
  expect(await db.student.count({ where: { schoolId } })).toBe(1)
  expect(await db.enrollment.count({ where: { schoolId } })).toBe(1)
  expect(await db.importError.count({ where: { schoolId } })).toBe(1)

  // Laporan error bisa diunduh dan tetap berformat .xlsx.
  const unduhLaporan = page.waitForEvent("download")
  await page.getByRole("link", { name: "Unduh laporan" }).click()
  const laporan = await unduhLaporan
  expect(laporan.suggestedFilename()).toMatch(/^laporan-error-siswa-\d{4}-\d{2}-\d{2}\.xlsx$/)

  // Email siswa memakai domain internal sekolah, tidak ke domain nyata.
  const siswa = await db.student.findFirstOrThrow({
    where: { schoolId },
    include: { user: true },
  })
  expect(siswa.user.email).toBe(`3001@${school.slug}.invalid`)
})

test("guru tidak bisa membuka halaman impor", async ({ page }, testInfo) => {
  const school = await newSchool(testInfo)
  await db.membership.updateMany({
    where: { userId: created[created.length - 1].userId },
    data: { role: "teacher" },
  })

  await login(page, school.origin, school.email)
  await page.goto(`${school.origin}/impor`)
  await expect(page).toHaveURL(/\/beranda$/)

  // Route unduhan template ikut terlindungi.
  const status = await page.evaluate(async (origin) => {
    const response = await fetch(`${origin}/api/impor-template?jenis=siswa`)
    return response.status
  }, school.origin)
  expect(status).toBe(403)
})