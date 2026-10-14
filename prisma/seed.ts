// Data contoh — EduSaaS
// ---------------------------------------------------------------------------
// Isi: paket langganan, 2 sekolah tenant, dan user admin. Jalankan dengan
// `pnpm db:seed`. Idempoten (upsert pada kunci unik), jadi aman diulang.
//
// PENTING: `passwordHash` di sini adalah placeholder, bukan hash sungguhan.
// Better Auth dan tabel `memberships` menyusul di F0 bagian 2; hash asli akan
// dibuat oleh Better Auth saat login pertama.

import "dotenv/config"
import { PrismaPg } from "@prisma/adapter-pg"

import { PrismaClient } from "../src/generated/prisma/client.js"

const PLACEHOLDER_PASSWORD_HASH = "SEBELUM-BETTER-AUTH"

const PLANS = [
  {
    code: "trial",
    name: "Uji Coba",
    priceSemester: 0,
    priceYear: 0,
    maxStudents: 50,
    maxStorageGb: 1,
    features: {
      cbt: true,
      parentReports: false,
      customDomain: false,
    },
  },
  {
    code: "standard",
    name: "Standar",
    priceSemester: 750_000,
    priceYear: 1_350_000,
    maxStudents: 500,
    maxStorageGb: 20,
    features: {
      cbt: true,
      parentReports: true,
      customDomain: false,
    },
  },
  {
    code: "pro",
    name: "Pro",
    priceSemester: 1_500_000,
    priceYear: 2_700_000,
    maxStudents: 2_000,
    maxStorageGb: 100,
    features: {
      cbt: true,
      parentReports: true,
      customDomain: true,
    },
  },
] as const

const SCHOOLS = [
  {
    slug: "man3pku",
    npsn: "20567289",
    name: "MAN 3 Pekanbaru",
    level: "MA",
    status: "active",
    timezone: "Asia/Jakarta",
    admin: {
      email: "admin@man3pku.sch.id",
      name: "Admin MAN 3 Pekanbaru",
    },
  },
  {
    slug: "sekolahdemo",
    npsn: "20887766",
    name: "SMA Demo Nusantara",
    level: "SMA",
    status: "trial",
    timezone: "Asia/Jakarta",
    admin: {
      email: "admin@sekolahdemo.sch.id",
      name: "Admin SMA Demo Nusantara",
    },
  },
] as const

const PLATFORM_ADMIN = {
  email: "superadmin@edusaas.id",
  name: "Super Admin EduSaaS",
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL belum diisi. Salin .env.example ke .env lalu sesuaikan nilainya."
    )
  }

  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
  const prisma = new PrismaClient({ adapter })

  try {
    for (const plan of PLANS) {
      await prisma.plan.upsert({
        where: { code: plan.code },
        create: { ...plan, features: { ...plan.features } },
        update: {
          name: plan.name,
          priceSemester: plan.priceSemester,
          priceYear: plan.priceYear,
          maxStudents: plan.maxStudents,
          maxStorageGb: plan.maxStorageGb,
          features: { ...plan.features },
        },
      })
      console.log(`  paket  ${plan.code} siap`)
    }

    for (const school of SCHOOLS) {
      await prisma.school.upsert({
        where: { slug: school.slug },
        create: {
          slug: school.slug,
          npsn: school.npsn,
          name: school.name,
          level: school.level,
          status: school.status,
          timezone: school.timezone,
        },
        update: {
          name: school.name,
          level: school.level,
          status: school.status,
          timezone: school.timezone,
        },
      })
      console.log(`  sekolah ${school.slug} siap`)

      await prisma.user.upsert({
        where: { email: school.admin.email },
        create: {
          email: school.admin.email,
          name: school.admin.name,
          passwordHash: PLACEHOLDER_PASSWORD_HASH,
          emailVerified: true,
        },
        update: { name: school.admin.name, emailVerified: true },
      })
      console.log(`  user   ${school.admin.email} siap`)
    }

    await prisma.user.upsert({
      where: { email: PLATFORM_ADMIN.email },
      create: {
        email: PLATFORM_ADMIN.email,
        name: PLATFORM_ADMIN.name,
        passwordHash: PLACEHOLDER_PASSWORD_HASH,
        emailVerified: true,
      },
      update: { name: PLATFORM_ADMIN.name, emailVerified: true },
    })
    console.log(`  user   ${PLATFORM_ADMIN.email} siap`)

    console.log("\nSeed selesai.")
    console.log(
      "Belum ada subscriptions/memberships — paket diaktifkan manual oleh Super Admin (AGENTS.md aturan 10)."
    )
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
