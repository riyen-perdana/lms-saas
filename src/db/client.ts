// PrismaClient tunggal untuk seluruh aplikasi (AGENTS.md aturan 1).
// ---------------------------------------------------------------------------
// Sambungan memakai `DATABASE_APP_URL` (role non-superuser), bukan
// `DATABASE_URL` (role postgres milik Prisma CLI). Alasannya: PostgreSQL
// selalu membiarkan superuser melewati Row Level Security, jadi policy RLS
// hanya benar-benar menahan kebocoran data antar sekolah bila query aplikasi
// memakai role biasa.
//
// Jangan pernah memakai client ini untuk model tenant — pakai tenantDb()
// dari src/db/tenant.ts. Client ini hanya untuk model global (schools, plans,
// users) dan operasi lintas tabel di luar satu transaksi tenant.

import { PrismaPg } from "@prisma/adapter-pg"

import { PrismaClient } from "@/generated/prisma/client"

function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_APP_URL

  if (!connectionString) {
    throw new Error(
      "DATABASE_APP_URL belum diisi. Salin .env.example ke .env lalu jalankan `pnpm db:migrate`."
    )
  }

  return new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  })
}

const globalForPrisma = globalThis as unknown as {
  __edusaasPrisma?: PrismaClient
}

// Vite SSR memuat ulang modul saat hot reload; tanpa ini setiap reload
// membuka koneksi pool baru sampai PostgreSQL kehabisan koneksi.
export const prisma =
  globalForPrisma.__edusaasPrisma ??
  (globalForPrisma.__edusaasPrisma = createPrismaClient())
