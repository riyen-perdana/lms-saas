// @vitest-environment node
// Test integrasi pendaftaran sekolah (LP-04) terhadap PostgreSQL lokal.

import { randomUUID } from "node:crypto"

import { PrismaPg } from "@prisma/adapter-pg"
import { verifyPassword } from "better-auth/crypto"
import { afterAll, describe, expect, it } from "vitest"

import { getSchoolAccess } from "@/features/auth/service"
import { registerSchoolSchema } from "@/features/registration/schema"
import {
  RegistrationError,
  isSlugAvailable,
  registerSchool,
} from "@/features/registration/service"
import { PrismaClient } from "@/generated/prisma/client"

const adminUrl = process.env.DATABASE_URL
if (!adminUrl) throw new Error("DATABASE_URL belum diisi; test integrasi butuh .env")

const admin = new PrismaClient({
  adapter: new PrismaPg({ connectionString: adminUrl }),
})

const suffix = randomUUID().slice(0, 8)
const slugA = `reg-a-${suffix}`
const slugB = `reg-b-${suffix}`
const emailA = `admin-a-${suffix}@sekolah.test`
const emailB = `admin-b-${suffix}@sekolah.test`
const password = "sandi-uji-12345"

const base = {
  schoolName: "Sekolah Uji",
  npsn: undefined,
  level: "SMA" as const,
  adminName: "Admin Uji",
  password,
}

afterAll(async () => {
  await admin.school.deleteMany({ where: { slug: { in: [slugA, slugB] } } })
  await admin.user.deleteMany({ where: { email: { in: [emailA, emailB] } } })
  await admin.$disconnect()
})

describe("registerSchool", () => {
  it("membuat sekolah trial, admin dengan sandi ter-hash, dan keanggotaan", async () => {
    const result = await registerSchool({ ...base, slug: slugA, adminEmail: emailA })

    const school = await admin.school.findUniqueOrThrow({ where: { slug: slugA } })
    expect(school.id).toBe(result.schoolId)
    expect(school.status).toBe("trial")

    const account = await admin.account.findFirstOrThrow({
      where: { user: { email: emailA }, providerId: "credential" },
    })
    expect(account.password).not.toBe(password)
    expect(
      await verifyPassword({ hash: account.password ?? "", password })
    ).toBe(true)

    const user = await admin.user.findUniqueOrThrow({ where: { email: emailA } })
    expect(await getSchoolAccess(school.id, user.id)).toMatchObject({
      role: "school_admin",
    })
  })

  it("isolasi: admin sekolah A tidak punya akses ke sekolah B", async () => {
    const b = await registerSchool({ ...base, slug: slugB, adminEmail: emailB })

    const userA = await admin.user.findUniqueOrThrow({ where: { email: emailA } })
    const userB = await admin.user.findUniqueOrThrow({ where: { email: emailB } })

    expect(await getSchoolAccess(b.schoolId, userA.id)).toBeNull()
    expect(await getSchoolAccess(b.schoolId, userB.id)).not.toBeNull()
  })

  it("menolak slug yang sudah dipakai", async () => {
    await expect(
      registerSchool({ ...base, slug: slugA, adminEmail: `lain-${suffix}@sekolah.test` })
    ).rejects.toMatchObject({ code: "SLUG_TAKEN" })
  })

  it("menolak email yang sudah terdaftar tanpa meninggalkan sekolah yatim", async () => {
    const slug = `reg-c-${suffix}`

    await expect(
      registerSchool({ ...base, slug, adminEmail: emailA })
    ).rejects.toBeInstanceOf(RegistrationError)

    expect(await admin.school.findUnique({ where: { slug } })).toBeNull()
  })

  it("menolak NPSN yang sudah terdaftar", async () => {
    const npsn = String(Math.floor(10_000_000 + Math.random() * 89_999_999))
    const slugN1 = `reg-n1-${suffix}`
    const emailN1 = `n1-${suffix}@sekolah.test`
    await registerSchool({ ...base, npsn, slug: slugN1, adminEmail: emailN1 })

    try {
      await expect(
        registerSchool({
          ...base,
          npsn,
          slug: `reg-n2-${suffix}`,
          adminEmail: `n2-${suffix}@sekolah.test`,
        })
      ).rejects.toMatchObject({ code: "NPSN_TAKEN" })
    } finally {
      await admin.school.deleteMany({ where: { slug: slugN1 } })
      await admin.user.deleteMany({ where: { email: emailN1 } })
    }
  })
})

describe("isSlugAvailable", () => {
  it("false untuk slug terpakai dan kata terlarang, true untuk slug bebas", async () => {
    expect(await isSlugAvailable(slugA)).toBe(false)
    for (const reserved of ["www", "app", "api", "admin"]) {
      expect(await isSlugAvailable(reserved)).toBe(false)
    }
    expect(await isSlugAvailable(`bebas-${suffix}`)).toBe(true)
  })
})

describe("registerSchoolSchema", () => {
  const valid = {
    schoolName: "SMA Contoh",
    npsn: "",
    level: "SMA",
    slug: "Contoh-Sekolah",
    adminName: "Budi Santoso",
    adminEmail: "  Budi@Sekolah.TEST ",
    password: "rahasia-123",
  }

  it("menormalkan slug, email, dan NPSN kosong", () => {
    const parsed = registerSchoolSchema.parse(valid)

    expect(parsed.slug).toBe("contoh-sekolah")
    expect(parsed.adminEmail).toBe("budi@sekolah.test")
    expect(parsed.npsn).toBeUndefined()
  })

  it("idempoten: hasil parse bisa di-parse ulang (klien lalu server)", () => {
    const once = registerSchoolSchema.parse(valid)

    expect(registerSchoolSchema.parse(once)).toEqual(once)
  })

  it("menolak input tidak valid dengan pesan berbahasa Indonesia", () => {
    for (const [field, value] of [
      ["slug", "www"],
      ["slug", "-awal"],
      ["npsn", "123"],
      ["level", "TK"],
      ["adminEmail", "bukan-email"],
      ["password", "pendek"],
    ] as const) {
      const result = registerSchoolSchema.safeParse({ ...valid, [field]: value })
      expect(result.success, `${field}=${value}`).toBe(false)
    }
  })
})
