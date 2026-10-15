import "dotenv/config"

import { randomUUID } from "node:crypto"

import { PrismaPg } from "@prisma/adapter-pg"
import { hashPassword } from "better-auth/crypto"
import { expect, test, type Page } from "@playwright/test"

import { PrismaClient } from "../../src/generated/prisma/client.js"

// OB-03: penugasan guru (kelas pembelajaran) dan wali kelas lewat UI.

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
  const slug = `ta-${tag}`
  const email = `ta-${tag}@sekolah.test`

  const school = await db.school.create({
    data: {
      slug,
      name: `SMA Penugasan ${tag}`,
      level: "SMA",
      status: "trial",
      setupCompletedAt: new Date(),
    },
  })
  const userIds: string[] = []

  const admin = await db.user.create({
    data: { email, name: "Admin Penugasan", emailVerified: true },
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

  // Tahun ajaran + semester aktif supaya papan penugasan terisi.
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

  await db.classroom.createMany({
    data: [
      { schoolId: school.id, semesterId: semester.id, grade: 10, name: "X-1" },
      { schoolId: school.id, semesterId: semester.id, grade: 11, name: "XI-1" },
    ],
  })

  await db.subject.createMany({
    data: [
      { schoolId: school.id, code: "MTK", name: "Matematika" },
      { schoolId: school.id, code: "BIN", name: "Bahasa Indonesia" },
    ],
  })

  for (const [code, name] of [
    ["G-001", "Hendra Wijaya"],
    ["G-002", "Siti Aminah"],
    ["G-003", "Budi Santoso"],
  ] as const) {
    const teacher = await db.user.create({
      data: { email: `guru-${code}-${tag}@sekolah.test`, name, emailVerified: true },
    })
    userIds.push(teacher.id)
    await db.teacher.create({ data: { schoolId: school.id, userId: teacher.id, code } })
    await db.membership.create({
      data: { schoolId: school.id, userId: teacher.id, role: "teacher" },
    })
  }

  created.push({ schoolId: school.id, userIds })

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

test("admin sekolah menugaskan guru, wali kelas, dan menghapus kelas pembelajaran", async ({
  page,
}, testInfo) => {
  const school = await newSchool(testInfo)
  await login(page, school.origin, school.email)

  await page.getByRole("link", { name: "Penugasan guru dan wali kelas" }).click()
  await expect(page).toHaveURL(/\/penugasan$/)
  await expect(page.getByRole("heading", { name: "Penugasan guru" })).toBeVisible()
  await expect(page.getByText(/semester Ganjil 2026\/2027/)).toBeVisible()
  await expect(page.getByText("Belum ada kelas pembelajaran untuk semester ini.")).toBeVisible()

  // Tambah kelas pembelajaran: rombel X-1 + Matematika + Hendra Wijaya.
  const tambah = page.getByRole("button", { name: "Tambah" })
  await expect(tambah).toBeEnabled()
  await page.getByLabel("Rombel", { exact: true }).selectOption({ label: "X-1 (tingkat 10)" })
  await page.getByLabel("Mata pelajaran").selectOption({ label: "MTK — Matematika" })
  await page.getByLabel("Guru pengampu").selectOption({ label: "Hendra Wijaya (G-001)" })
  await tambah.click()

  await expect(page.getByRole("cell", { name: "Matematika" })).toBeVisible()
  await expect(page.getByRole("cell", { name: "Hendra Wijaya" })).toBeVisible()
  expect(await db.course.count({ where: { schoolId: school.schoolId } })).toBe(1)

  // Mapel yang sama pada rombel yang sama ditolak, dengan pesan yang jelas.
  await page.getByLabel("Rombel", { exact: true }).selectOption({ label: "X-1 (tingkat 10)" })
  await page.getByLabel("Mata pelajaran").selectOption({ label: "MTK — Matematika" })
  await page.getByLabel("Guru pengampu").selectOption({ label: "Siti Aminah (G-002)" })
  await tambah.click()
  await expect(page.getByRole("alert").first()).toContainText("sudah punya kelas pembelajaran")
  expect(await db.course.count({ where: { schoolId: school.schoolId } })).toBe(1)

  // Kelas kedua pada rombel lain boleh.
  await page.getByLabel("Rombel", { exact: true }).selectOption({ label: "XI-1 (tingkat 11)" })
  await page.getByLabel("Mata pelajaran").selectOption({ label: "BIN — Bahasa Indonesia" })
  await page.getByLabel("Guru pengampu").selectOption({ label: "Siti Aminah (G-002)" })
  await tambah.click()
  await expect(page.getByText("Menampilkan 2 dari 2 kelas pembelajaran.")).toBeVisible()

  // Filter per rombel.
  await page.getByLabel("Tampilkan rombel").selectOption({ label: "X-1" })
  await expect(page.getByText("Menampilkan 1 dari 2 kelas pembelajaran.")).toBeVisible()
  await expect(page.getByRole("cell", { name: "Matematika" })).toBeVisible()
  await expect(page.getByRole("cell", { name: "Bahasa Indonesia" })).toHaveCount(0)
  await page.getByLabel("Tampilkan rombel").selectOption({ label: "Semua rombel" })

  // Wali kelas per rombel.
  await expect(page.getByText("Belum ada wali kelas").first()).toBeVisible()
  await page.getByLabel("Wali kelas X-1 (tingkat 10)").selectOption({ label: "Budi Santoso (G-003)" })
  await expect(page.getByText("Wali: Budi Santoso")).toBeVisible()

  const room = await db.classroom.findFirstOrThrow({
    where: { schoolId: school.schoolId, name: "X-1" },
  })
  const wali = await db.teacher.findFirstOrThrow({
    where: { schoolId: school.schoolId, code: "G-003" },
  })
  expect(room.homeroomTeacherId).toBe(wali.id)

  // Guru yang sama tidak boleh menjadi wali rombel lain pada semester yang sama.
  await page.getByLabel("Wali kelas XI-1 (tingkat 11)").selectOption({ label: "Budi Santoso (G-003)" })
  await expect(page.getByRole("alert").last()).toContainText("sudah menjadi wali kelas")
  const roomLain = await db.classroom.findFirstOrThrow({
    where: { schoolId: school.schoolId, name: "XI-1" },
  })
  expect(roomLain.homeroomTeacherId).toBeNull()

  // Cabut wali kelas.
  await page.getByLabel("Wali kelas X-1 (tingkat 10)").selectOption({ label: "Tanpa wali kelas" })
  await expect(page.getByText("Wali: Budi Santoso")).toHaveCount(0)

  // Hapus kelas pembelajaran.
  await page.getByRole("button", { name: "Hapus" }).first().click()
  await expect(page.getByText("Menampilkan 1 dari 1 kelas pembelajaran.")).toBeVisible()
  expect(await db.course.count({ where: { schoolId: school.schoolId, deletedAt: null } })).toBe(1)
})

test("guru tidak bisa membuka halaman penugasan", async ({ page }, testInfo) => {
  const school = await newSchool(testInfo)
  await db.membership.updateMany({
    where: { userId: created[created.length - 1].userIds[0] },
    data: { role: "teacher" },
  })

  await login(page, school.origin, school.email)
  await page.goto(`${school.origin}/penugasan`)
  await expect(page).toHaveURL(/\/beranda$/)
})