// Data contoh — EduSaaS
// ---------------------------------------------------------------------------
// Isi: paket langganan, 2 sekolah tenant, dan user admin. Jalankan dengan
// `pnpm db:seed`. Idempoten (upsert pada kunci unik), jadi aman diulang.
//
// Sandi dev: admin tiap sekolah dibuat dengan kredensial (hash Better Auth di
// `accounts`) dan keanggotaan `school_admin`, supaya login lokal bisa dicoba.
// Seed MENOLAK berjalan dengan sandi bawaan di produksi. Super Admin platform
// (superadmin@edusaas.id) juga dibuat dengan kredensial dan baris platform_admins,
// dan tiap sekolah contoh diberi langganan awal.

import "dotenv/config"
import { PrismaPg } from "@prisma/adapter-pg"
import { hashPassword } from "better-auth/crypto"

import { PrismaClient } from "../src/generated/prisma/client.js"

const DEV_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "ubah-sandi-ini-123"

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

  if (process.env.NODE_ENV === "production" && !process.env.SEED_ADMIN_PASSWORD) {
    throw new Error("Di produksi SEED_ADMIN_PASSWORD wajib diisi.")
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

      const schoolRow = await prisma.school.findUniqueOrThrow({
        where: { slug: school.slug },
      })
      const admin = await prisma.user.upsert({
        where: { email: school.admin.email },
        create: {
          email: school.admin.email,
          name: school.admin.name,
          emailVerified: true,
        },
        update: { name: school.admin.name, emailVerified: true },
      })
      // Kredensial hanya dibuat sekali; seed ulang tidak menimpa sandi yang sudah diganti.
      const hasCredential = await prisma.account.findFirst({
        where: { userId: admin.id, providerId: "credential" },
      })
      if (!hasCredential) {
        await prisma.account.create({
          data: {
            userId: admin.id,
            providerId: "credential",
            accountId: admin.id,
            password: await hashPassword(DEV_PASSWORD),
          },
        })
      }
      await prisma.membership.upsert({
        where: {
          schoolId_userId: { schoolId: schoolRow.id, userId: admin.id },
        },
        create: {
          schoolId: schoolRow.id,
          userId: admin.id,
          role: "school_admin",
        },
        update: { role: "school_admin", status: "active", deletedAt: null },
      })
      console.log(`  user   ${school.admin.email} siap`)

      // Langganan contoh, hanya bila sekolah belum punya (aman diulang).
      const hasSubscription = await prisma.subscription.findFirst({
        where: { schoolId: schoolRow.id },
        select: { id: true },
      })
      if (!hasSubscription) {
        const isActive = school.status === "active"
        const plan = await prisma.plan.findUniqueOrThrow({
          where: { code: isActive ? "standard" : "trial" },
        })
        const now = new Date()
        const periodEnd = new Date(now)
        if (isActive) periodEnd.setUTCFullYear(periodEnd.getUTCFullYear() + 1)
        else periodEnd.setUTCDate(periodEnd.getUTCDate() + 30)

        await prisma.subscription.create({
          data: {
            schoolId: schoolRow.id,
            planId: plan.id,
            status: isActive ? "active" : "trial",
            periodStart: now,
            periodEnd,
            trialEndsAt: isActive ? null : periodEnd,
          },
        })
        console.log(`  langganan ${school.slug} (${plan.code}) siap`)
      }
    }

    const superAdmin = await prisma.user.upsert({
      where: { email: PLATFORM_ADMIN.email },
      create: {
        email: PLATFORM_ADMIN.email,
        name: PLATFORM_ADMIN.name,
        emailVerified: true,
      },
      update: { name: PLATFORM_ADMIN.name, emailVerified: true },
    })
    const superHasCredential = await prisma.account.findFirst({
      where: { userId: superAdmin.id, providerId: "credential" },
    })
    if (!superHasCredential) {
      await prisma.account.create({
        data: {
          userId: superAdmin.id,
          providerId: "credential",
          accountId: superAdmin.id,
          password: await hashPassword(DEV_PASSWORD),
        },
      })
    }
    await prisma.platformAdmin.upsert({
      where: { userId: superAdmin.id },
      create: { userId: superAdmin.id },
      update: {},
    })
    console.log(`  user   ${PLATFORM_ADMIN.email} siap`)

    console.log("\nSeed selesai.")
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
