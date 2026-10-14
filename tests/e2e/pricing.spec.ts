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

test("SEO: sitemap, robots, dan meta Open Graph", async ({ page, request }) => {
  const sitemap = await request.get("/sitemap.xml")
  expect(sitemap.headers()["content-type"]).toContain("xml")
  const xml = await sitemap.text()
  expect(xml).toContain("/harga</loc>")
  expect(xml).toContain("/kontak</loc>")

  const robots = await (await request.get("/robots.txt")).text()
  expect(robots).toContain("Sitemap: http://localhost:3000/sitemap.xml")

  // Subdomain sekolah tidak boleh diindeks.
  // Node tidak me-resolve *.localhost, jadi host sekolah dikirim lewat header.
  const headers = { host: "man3pku.localhost:3000" }
  const school = await request.get("/robots.txt", { headers })
  expect(await school.text()).toContain("Disallow: /\n")
  expect((await request.get("/sitemap.xml", { headers })).status()).toBe(404)

  await page.goto("/harga")
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
    "content",
    "Harga — EduSaaS"
  )

  await page.goto("/login")
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    "noindex"
  )
})
