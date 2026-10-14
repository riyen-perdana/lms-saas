import { expect, test } from "@playwright/test"

// Smoke test untuk memastikan konfigurasi Playwright + `pnpm dev` berfungsi.
// Diperbarui bersama halaman pertama yang Finished (landing page ada di F1).

test("halaman utama merespons 200", async ({ page }) => {
  const response = await page.goto("/")
  expect(response?.status()).toBe(200)
})
