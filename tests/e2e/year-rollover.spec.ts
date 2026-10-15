import "dotenv/config"

import { randomUUID } from "node:crypto"

import { PrismaPg } from "@prisma/adapter-pg"
import { hashPassword } from "better-auth/crypto"
import { expect, test, type Page } from "@playwright/test"

import { PrismaClient } from "../../src/generated/prisma/client.js"

// OB-04: kenaikan kelas dan pergantian tahun ajaran lewat UI.

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
  const slug = `yr-${tag}`
  const email = `yr-${tag}@sekolah.test`

  const school = await db.school.create({
    data: {
      slug,
      name: `SMA Kenaikan ${tag}`,
      level: "SMA",
      status: "trial",
      setupCompletedAt: new Date(),
    },
  })
  const userIds: string[] = []

  const admin = await db.user.create({
    data: { email, name: "Admin Kenaikan", emailVerified: true },
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
  const ganjil = await db.semester.create({
    data: {
      schoolId: school.id,
      academicYearId: year.id,
      name: "Ganjil",
      startDate: new Date("2026-07-13T00:00:00Z"),
      endDate: new Date("2026-12-19T00:00:00Z"),
      isActive: true,
    },
  })
  await db.semester.create({
    data: {
      schoolId: school.id,
      academicYearId: year.id,
      name: "Genap",
      startDate: new Date("2027-01-04T00:00:00Z"),
      endDate: new Date("2027-06-26T00:00:00Z"),
      isActive: false,
    },
  })

  const x1 = await db.classroom.create({
    data: { schoolId: school.id, semesterId: ganjil.id, grade: 10, name: "X-1" },
  })
  const xii1 = await db.classroom.create({
    data: { schoolId: school.id, semesterId: ganjil.id, grade: 12, name: "XII-1" },
  })

  for (const [nis, classroomId] of [
    ["3001", x1.id],
    ["3002", x1.id],
    ["3003", xii1.id],
  ] as const) {
    const user = await db.user.create({
      data: { email: `siswa-${nis}-${tag}@sekolah.test`, name: `Siswa ${nis}`, emailVerified: true },
    })
    userIds.push(user.id)
    const student = await db.student.create({ data: { schoolId: school.id, userId: user.id, nis } })
    await db.enrollment.create({ data: { schoolId: school.id, classroomId, studentId: student.id } })
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

async function semesterRooms(schoolId: string, yearName: string, semesterName: string) {
  return db.classroom.findMany({
    where: { schoolId, semester: { name: semesterName, academicYear: { name: yearName } } },
    orderBy: { name: "asc" },
    include: { _count: { select: { enrollments: true } } },
  })
}

test("admin menambah tahun ajaran lalu menaikkan rombel dan siswa", async ({ page }, testInfo) => {
  const school = await newSchool(testInfo)
  await login(page, school.origin, school.email)

  await page.getByRole("link", { name: "Tahun ajaran dan kenaikan kelas" }).click()
  await expect(page).toHaveURL(/\/tahun-ajaran$/)
  await expect(page.getByRole("heading", { name: "Tahun ajaran dan kenaikan kelas" })).toBeVisible()

  // Tambah tahun ajaran berikutnya (isian awal = tahun setelah yang terakhir).
  const simpan = page.getByRole("button", { name: "Simpan tahun ajaran" })
  await expect(simpan).toBeEnabled()
  await simpan.click()
  await expect(page.getByRole("cell", { name: "Ganjil 2027/2028", exact: true })).toBeVisible()

  // Langkah 1: Ganjil -> Genap, tingkat tetap.
  const preview = page.getByRole("button", { name: "Lihat pratinjau" })
  await expect(preview).toBeEnabled()
  await page.getByLabel("Semester tujuan").selectOption({ label: "Genap 2026/2027" })
  await expect(page.getByLabel("Mode")).toHaveValue("same")
  await preview.click()
  await expect(page.getByRole("cell", { name: "X-1 (tingkat 10)" })).toBeVisible()
  await expect(page.getByLabel("Nama rombel tujuan untuk XII-1")).toHaveValue("XII-1")
  await page.getByRole("button", { name: "Jalankan kenaikan" }).click()
  await expect(page.getByRole("status")).toContainText("2 rombel dibuat, 3 siswa dipindahkan")

  const genap = await semesterRooms(school.schoolId, "2026/2027", "Genap")
  expect(genap.map((r) => [r.name, r._count.enrollments])).toEqual([
    ["X-1", 2],
    ["XII-1", 1],
  ])

  // Langkah 2: Genap -> tahun ajaran baru, naik tingkat; XII lulus.
  await page.getByLabel("Semester sumber").selectOption({ label: "Genap 2026/2027" })
  await page.getByLabel("Semester tujuan").selectOption({ label: "Ganjil 2027/2028" })
  await expect(page.getByLabel("Mode")).toHaveValue("promote")
  await page.getByRole("button", { name: "Lihat pratinjau" }).click()
  await expect(page.getByLabel("Nama rombel tujuan untuk X-1")).toHaveValue("XI-1")
  await expect(page.getByText("Lulus (tidak ada rombel tujuan)")).toBeVisible()
  await page.getByLabel("Nama rombel tujuan untuk X-1").fill("XI Unggulan")
  await page.getByRole("button", { name: "Jalankan kenaikan" }).click()
  await expect(page.getByRole("status")).toContainText(
    "1 rombel dibuat, 2 siswa dipindahkan, 1 siswa lulus"
  )

  const baru = await semesterRooms(school.schoolId, "2027/2028", "Ganjil")
  expect(baru.map((r) => [r.name, r.grade, r._count.enrollments])).toEqual([["XI Unggulan", 11, 2]])
  // Arsip tetap utuh.
  expect(await semesterRooms(school.schoolId, "2026/2027", "Ganjil")).toHaveLength(2)

  // Menjalankan lagi ke semester yang sudah berisi ditolak di pratinjau.
  await page.getByRole("button", { name: "Lihat pratinjau" }).click()
  await expect(page.getByRole("alert").first()).toContainText("sudah punya 1 rombel")
  await expect(page.getByRole("button", { name: "Jalankan kenaikan" })).toBeDisabled()

  // Aktifkan semester baru.
  await page.getByRole("button", { name: "Aktifkan Ganjil 2027/2028" }).click()
  await expect(page.getByRole("button", { name: "Aktifkan Ganjil 2027/2028" })).toHaveCount(0)
  const aktif = await db.semester.findFirstOrThrow({
    where: { schoolId: school.schoolId, isActive: true },
    include: { academicYear: true },
  })
  expect(`${aktif.name} ${aktif.academicYear.name}`).toBe("Ganjil 2027/2028")
})

test("guru tidak bisa membuka halaman tahun ajaran", async ({ page }, testInfo) => {
  const school = await newSchool(testInfo)
  await db.membership.updateMany({
    where: { userId: created[created.length - 1].userIds[0] },
    data: { role: "teacher" },
  })

  await login(page, school.origin, school.email)
  await page.goto(`${school.origin}/tahun-ajaran`)
  await expect(page).toHaveURL(/\/beranda$/)
})
