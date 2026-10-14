// Konfigurasi Prisma CLI (Prisma 7).
//
// Prisma 7 tidak lagi membaca `.env` sendiri dan `datasource.url` tidak lagi
// ditulis di schema.prisma. `import "dotenv/config"` memuat .env dari root;
// pakai `process.env.DATABASE_URL` (bukan helper `env()`) supaya perintah yang
// tidak butuh koneksi — `prisma generate`, `prisma validate` — tetap jalan
// ketika DATABASE_URL belum diisi.

import "dotenv/config"
import { defineConfig } from "prisma/config"

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env.DATABASE_URL ?? "",
  },
})
