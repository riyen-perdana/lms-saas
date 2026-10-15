import "dotenv/config"

import { randomUUID } from "node:crypto"
import { readFile } from "node:fs/promises"

import { PrismaPg } from "@prisma/adapter-pg"
import { hashPassword } from "better-auth/crypto"
import { expect, test, type Page } from "@playwright/test"

import { PrismaClient } from "../../src/generated/prisma/client.js"

// US-01: login siswa lewat NIS + PIN, PIN per siswa dan PIN massal.

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
  const slug = `sp-${tag}`
  const adminEmail = `sp-${tag}@sekolah.test`

  const school = await db.school.create({
    data: {
      slug,
      name: `SD Siswa PIN ${tag}`,
      level: "SD",
      status: "trial",
      setupCompletedAt: new Date(),
    },
  })
  const userIds: string[] = []
  created.push({ schoolId: school.id, userIds })

  const admin = await db.user.create({
    data: { email: adminEmail, name: "Admin Siswa PIN", emailVerified: true },
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
      grade: 1,
      name: "1-A",
    },
  })

  for (const [nis, name] of [
    ["5001", "Ani Lestari"],
    ["5002", "Budi Hartono"],
  ] as const) {
    const user = await db.user.create({
      data: {
        email: `${nis}-${tag}@sekolah.test`.toLowerCase(),
        name,
        emailVerified: true,
      },
    })
    userIds.push(user.id)
    const student = await db.student.create({
      data: { schoolId: school.id, userId: user.id, nis },
    })
    await db.membership.create({
      data: {
        schoolId: school.id,
        userId: user.id,
        role: "student",
        status: "active",
      },
    })
    await db.enrollment.create({
      data: {
        schoolId: school.id,
        classroomId: room.id,
        studentId: student.id,
      },
    })
  }

  return {
    schoolId: school.id,
    slug,
    adminEmail,
    origin: `http://${slug}.localhost:3000`,
  }
}

async function loginAdmin(page: Page, origin: string, email: string) {
  await page.goto(`${origin}/login`)
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Kata sandi").fill(PASSWORD)
  await expect(page.getByRole("button", { name: "Masuk" })).toBeEnabled()
  await page.getByRole("button", { name: "Masuk" }).click()
  await expect(page).toHaveURL(/\/beranda$/)
}

async function openStudentTab(page: Page) {
  // Tab hanya bekerja setelah hydrate; ulangi sampai form siswa tampil.
  await expect(async () => {
    await page.getByRole("tab", { name: "Siswa (NIS + PIN)" }).click()
    await expect(page.getByLabel("NIS")).toBeVisible({ timeout: 1000 })
  }).toPass()
}

async function fillAndSubmitStudent(page: Page, nis: string, pin: string) {
  await page.getByLabel("NIS").fill(nis)
  await page.getByLabel("PIN").fill(pin)
  await expect(page.getByRole("button", { name: "Masuk" })).toBeEnabled()
  await page.getByRole("button", { name: "Masuk" }).click()
}

test("admin membuat PIN, siswa login lewat tab Siswa, PIN salah ditolak, reset mengakhiri sesi dan PIN lama", async ({
  page,
  browser,
}, testInfo) => {
  const school = await newSchool(testInfo)
  await loginAdmin(page, school.origin, school.adminEmail)

  await page.goto(`${school.origin}/pengguna`)
  const main = page.getByRole("main")
  await expect(main.getByRole("heading", { name: "Pengguna" })).toBeVisible()

  const buat = main.getByRole("button", { name: "Buat PIN Ani Lestari" })
  await expect(buat).toBeEnabled()
  await buat.click()
  await main.getByRole("button", { name: "Ya, buat" }).click()
  await expect(main.getByTestId("new-pin")).toBeVisible()
  const pin = ((await main.getByTestId("new-pin").textContent()) ?? "").trim()
  expect(pin).toMatch(/^[1-9]\d{5}$/)

  // Siswa (konteks terpisah) login lewat tab Siswa.
  const siswa = await browser.newContext()
  const siswaPage = await siswa.newPage()
  await siswaPage.goto(`${school.origin}/login`)
  await openStudentTab(siswaPage)

  // PIN salah: pesan seragam.
  await fillAndSubmitStudent(
    siswaPage,
    "5001",
    pin === "111111" ? "222222" : "111111"
  )
  await expect(siswaPage.getByRole("alert")).toHaveText("NIS atau PIN salah.")

  // PIN benar.
  await fillAndSubmitStudent(siswaPage, "5001", pin)
  await expect(siswaPage).toHaveURL(/\/beranda$/)

  // Admin mereset PIN: sesi siswa berakhir dan PIN lama tidak berlaku.
  await main.getByRole("button", { name: "Reset PIN Ani Lestari" }).click()
  await main.getByRole("button", { name: "Ya, buat" }).click()
  await expect(main.getByTestId("new-pin")).toBeVisible()
  await expect(main.getByTestId("new-pin")).not.toHaveText(pin)
  const newPin = ((await main.getByTestId("new-pin").textContent()) ?? "").trim()
  expect(newPin).not.toBe(pin)

  await siswaPage.reload()
  await expect(siswaPage).toHaveURL(/\/login/)

  await openStudentTab(siswaPage)
  await fillAndSubmitStudent(siswaPage, "5001", pin)
  await expect(siswaPage.getByRole("alert")).toHaveText("NIS atau PIN salah.")
  await fillAndSubmitStudent(siswaPage, "5001", newPin)
  await expect(siswaPage).toHaveURL(/\/beranda$/)

  await siswa.close()
})

test("PIN massal per rombel: CSV berisi siswa yang belum punya PIN dan PIN-nya berlaku", async ({
  page,
  browser,
}, testInfo) => {
  const school = await newSchool(testInfo)
  await loginAdmin(page, school.origin, school.adminEmail)
  await page.goto(`${school.origin}/pengguna`)

  const main = page.getByRole("main")
  const bulk = main.getByRole("button", { name: "Buat PIN massal" })
  await expect(async () => {
    await main
      .getByLabel("Rombel", { exact: true })
      .selectOption({ label: "1-A (tingkat 1)" })
    await expect(bulk).toBeEnabled({ timeout: 1000 })
  }).toPass()
  const downloadPromise = page.waitForEvent("download")
  await bulk.click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe("pin-1-A.csv")
  const csv = await readFile((await download.path()), "utf8")
  const line = csv.split("\r\n").find((row) => row.startsWith("5002,"))
  expect(line).toBeTruthy()
  const pinBudi = line!.split(",").at(-1)!
  expect(pinBudi).toMatch(/^[1-9]\d{5}$/)
  await expect(main.getByRole("status")).toContainText("2 PIN dibuat")

  const siswa = await browser.newContext()
  const siswaPage = await siswa.newPage()
  await siswaPage.goto(`${school.origin}/login`)
  await openStudentTab(siswaPage)
  await fillAndSubmitStudent(siswaPage, "5002", pinBudi)
  await expect(siswaPage).toHaveURL(/\/beranda$/)
  await siswa.close()
})
