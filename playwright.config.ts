import { defineConfig, devices } from "@playwright/test"

const PORT = 3000
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`

export default defineConfig({
  testDir: "./tests/e2e",
  // PRD §8: responsif mulai lebar 360 px
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      // Lebar 360 px = batas bawah perangkat yang harus didukung.
      name: "mobile-360",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 360, height: 740 },
      },
    },
  ],
  webServer: {
    command: "pnpm dev",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    env: { REGISTER_RATE_LIMIT: "1000", CONTACT_RATE_LIMIT: "1000", VITE_E2E: "1" },
    timeout: 120_000,
  },
})
