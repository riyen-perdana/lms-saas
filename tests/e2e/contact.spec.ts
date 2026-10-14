import "dotenv/config"

import { randomUUID } from "node:crypto"

import { PrismaPg } from "@prisma/adapter-pg"
import { expect, test } from "@playwright/test"

import { PrismaClient } from "../../src/generated/prisma/client.js"

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
})
const emails: string[] = []

test.afterAll(async () => {
  await db.contactRequest.deleteMany({ where: { email: { in: emails } } })
  await db.$disconnect()
})

test("form kontak menolak input salah lalu menyimpan pesan yang valid", async ({
  page,
}) => {
  const email = `kontak-${randomUUID().slice(0, 8)}@sekolah.test`
  emails.push(email)

  await page.goto("/kontak")
  await expect(page.getByRole("button", { name: "Kirim pesan" })).toBeEnabled()

  await page.getByRole("button", { name: "Kirim pesan" }).click()
  await expect(page.getByText("Nama minimal 2 karakter")).toBeVisible()
  await expect(page.getByText("Pesan minimal 10 karakter")).toBeVisible()

  await page.getByLabel("Nama", { exact: true }).fill("Bu Rina")
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Nama sekolah (opsional)").fill("SMA Uji")
  await page.getByLabel("Pesan").fill("Kami ingin jadwal demo untuk 300 siswa.")
  await page.getByRole("button", { name: "Kirim pesan" }).click()

  await expect(page.getByRole("status")).toContainText("Terima kasih")
  const saved = await db.contactRequest.findFirstOrThrow({ where: { email } })
  expect(saved.schoolName).toBe("SMA Uji")
})

for (const [path, heading] of [
  ["/privasi", "Kebijakan privasi"],
  ["/syarat", "Syarat & ketentuan"],
] as const) {
  test(`${path} tampil`, async ({ page }) => {
    await page.goto(path)
    await expect(
      page.getByRole("heading", { level: 1, name: heading })
    ).toBeVisible()
  })
}
