import { expect, test } from "@playwright/test"

// LP-02: halaman fitur dengan tiga modul dan label "Segera hadir".

test("halaman fitur menampilkan tiga modul dan CTA", async ({ page, request }) => {
  await page.goto("/fitur")

  await expect(page.getByRole("heading", { level: 1, name: "Fitur EduSaaS" })).toBeVisible()
  for (const id of ["kelas", "cbt", "laporan"]) {
    await expect(page.locator(`section#${id}`)).toBeVisible()
  }
  await expect(page.getByText("Segera hadir").first()).toBeVisible()
  await expect(
    page.getByRole("link", { name: "Coba gratis 30 hari" })
  ).toHaveAttribute("href", "/daftar")

  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
    "content",
    "Fitur — EduSaaS"
  )
  expect(await (await request.get("/sitemap.xml")).text()).toContain("/fitur</loc>")
})

test("tautan Fitur di header membuka halaman fitur", async ({ page }) => {
  test.skip(
    (page.viewportSize()?.width ?? 0) < 768,
    "Navigasi header disembunyikan di layar kecil"
  )
  await page.goto("/")
  await page.getByRole("navigation", { name: "Utama" }).getByRole("link", { name: "Fitur" }).click()
  await expect(page).toHaveURL(/\/fitur$/)
})
