import { expect, test } from "@playwright/test"

// LP-03: harga dibaca dari tabel `plans` hasil seed (Standar & Pro).

test("halaman harga menampilkan paket dari database dan toggle periode", async ({
  page,
}) => {
  await page.goto("/harga")

  await expect(page.getByRole("heading", { name: "Standar" })).toBeVisible()
  await expect(page.getByRole("heading", { name: "Pro" })).toBeVisible()
  await expect(page.getByRole("heading", { name: "Enterprise" })).toBeVisible()
  await expect(page.getByRole("heading", { name: "Uji Coba" })).toHaveCount(0)

  await expect(page.getByText(/Rp\s?750\.000/)).toBeVisible()

  // Klik sebelum hydrate diabaikan; ulangi sampai toggle bereaksi.
  await expect(async () => {
    await page.getByRole("button", { name: "Tahunan" }).click()
    await expect(page.getByText(/Rp\s?1\.350\.000/)).toBeVisible({
      timeout: 1000,
    })
  }).toPass()
  await expect(page.getByText("Hemat 10% dibanding dua semester.").first()).toBeVisible()

  await expect(
    page.getByRole("link", { name: "Bicara dengan tim" })
  ).toHaveAttribute("href", "/kontak")
  await expect(
    page.getByRole("link", { name: "Mulai trial" }).first()
  ).toHaveAttribute("href", "/daftar")
})

test("beranda juga memuat harga dari database", async ({ page }) => {
  await page.goto("/")
  await expect(page.locator("#harga").getByText(/Rp\s?750\.000/)).toBeVisible()
})
