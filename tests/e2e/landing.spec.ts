import { expect, test } from "@playwright/test"

// LP-01: beranda landing di host marketing (localhost).

test("beranda tampil dengan tema marketing dan bahasa Indonesia", async ({ page }) => {
  await page.goto("/")

  await expect(page.locator("html")).toHaveAttribute("data-theme", "marketing")
  await expect(page.locator("html")).toHaveAttribute("lang", "id")
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Satu platform belajar untuk seluruh sekolah Anda.",
    })
  ).toBeVisible()
  await expect(
    page.getByRole("link", { name: "Coba gratis 30 hari" }).first()
  ).toBeVisible()
})

test("tidak ada scroll horizontal", async ({ page }) => {
  await page.goto("/")
  await page.getByRole("heading", { level: 1 }).waitFor()

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth
  )
  expect(overflow).toBe(false)
})

test("toggle periode harga dan FAQ dapat dipakai", async ({ page }) => {
  await page.goto("/")

  const tahunan = page.getByRole("button", { name: "Tahunan" })
  // Klik sebelum hydrate tidak berefek; ulangi sampai handler React terpasang.
  await expect(async () => {
    await tahunan.click()
    await expect(tahunan).toHaveAttribute("aria-pressed", "true", { timeout: 500 })
  }).toPass()

  await page.getByText("Apakah sekolah perlu memasang server?").click()
  await expect(page.getByText("EduSaaS berjalan di cloud.")).toBeVisible()
})

test("subdomain sekolah diarahkan ke login, bukan landing", async ({ page }) => {
  await page.goto("http://man3pku.localhost:3000/")

  await expect(page).toHaveURL(/man3pku\.localhost:3000\/login/)
})
