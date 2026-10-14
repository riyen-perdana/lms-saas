// Konfigurasi Vitest.
//
// Sengaja dipisah dari vite.config.ts: plugin tanstackStart() aparelhos SSR
// milik TanStack Start dan tidak boleh ikut termuat saat test berjalan.
//
// PR: https://tanstack.com/start/latest/docs/framework/react/quick-start

import viteReact from "@vitejs/plugin-react"
import { defineConfig } from "vitest/config"

export default defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [viteReact()],
  test: {
    globals: false,
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.{ts,tsx}", "tests/**/*.test.{ts,tsx}"],
    exclude: [
      "node_modules/**",
      "dist/**",
      // E2E ditangani Playwright (pnpm test:e2e)
      "tests/e2e/**",
      // Kode hasil prisma generate
      "src/generated/**",
    ],
    coverage: {
      provider: "v8",
      // PRD §8: coverage service layer minimal 70%
      include: ["src/features/**/service.ts"],
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 70,
        statements: 70,
      },
    },
  },
})
