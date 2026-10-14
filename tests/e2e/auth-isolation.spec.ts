import { expect, test, type Page } from "@playwright/test"

// Gate F0: "login di 2 subdomain berbeda tidak saling bocor".
// Butuh data seed (`pnpm db:seed`): admin@man3pku.sch.id hanya anggota
// man3pku, bukan sekolahdemo.

const PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "ubah-sandi-ini-123"
const ADMIN_MAN3 = "admin@man3pku.sch.id"
const MAN3 = "http://man3pku.localhost:3000"
const DEMO = "http://sekolahdemo.localhost:3000"

async function login(page: Page, origin: string, email: string, password: string) {
  await page.goto(`${origin}/login`)
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Kata sandi").fill(password)
  await page.getByRole("button", { name: "Masuk" }).click()
}

test("anggota sekolah berhasil login di subdomain sekolahnya", async ({ page }) => {
  await login(page, MAN3, ADMIN_MAN3, PASSWORD)

  await expect(page).toHaveURL(/man3pku\.localhost:3000\/beranda$/)
  await expect(page.getByRole("heading", { name: "MAN 3 Pekanbaru" })).toBeVisible()
})

test("sandi salah menampilkan pesan error", async ({ page }) => {
  await login(page, MAN3, ADMIN_MAN3, "sandi-salah-99999")

  await expect(page.getByRole("alert")).toHaveText("Email atau kata sandi salah.")
  await expect(page).toHaveURL(/\/login/)
})

test("akun sekolah lain ditolak di subdomain yang bukan miliknya", async ({ page }) => {
  await login(page, DEMO, ADMIN_MAN3, PASSWORD)

  await expect(page.getByRole("alert")).toHaveText(
    "Akun ini tidak terdaftar di sekolah ini."
  )
  await expect(page).toHaveURL(/\/login/)
})

test("sesi di satu subdomain tidak terbawa ke subdomain lain", async ({ page }) => {
  await login(page, MAN3, ADMIN_MAN3, PASSWORD)
  await expect(page).toHaveURL(/man3pku\.localhost:3000\/beranda$/)
  await expect(page.getByRole("heading", { name: "MAN 3 Pekanbaru" })).toBeVisible()

  // Subdomain lain tidak punya cookie sesi: form login tetap tampil.
  await page.goto(`${DEMO}/login`)
  await expect(page).toHaveURL(/sekolahdemo\.localhost:3000\/login/)
  await expect(page.getByRole("button", { name: "Masuk" })).toBeVisible()

  const cookies = await page.context().cookies(DEMO)
  expect(cookies.filter((c) => c.name.includes("session_token"))).toHaveLength(0)
})

test("admin sekolah yang sudah login membuka / lalu mendarat di beranda (tanpa loop)", async ({ page }) => {
  await login(page, MAN3, ADMIN_MAN3, PASSWORD)
  await expect(page).toHaveURL(/\/beranda$/)

  await page.goto(`${MAN3}/`)
  await expect(page).toHaveURL(/\/beranda$/)

  // Keluar mengembalikan ke login, dan beranda tidak bisa dibuka lagi.
  // Klik sebelum hydrate tidak berefek; ulangi sampai handler terpasang.
  await expect(async () => {
    await page.getByRole("button", { name: "Keluar" }).click()
    await expect(page).toHaveURL(/\/login$/, { timeout: 1500 })
  }).toPass({ timeout: 15_000 })
  await page.goto(`${MAN3}/beranda`)
  await expect(page).toHaveURL(/\/login$/)
})
