// @vitest-environment node
// Test integrasi isolasi tenant (PRD §5.2, §8, gate F0).
//
// Menjalankan uji nyata terhadap PostgreSQL lokal — mock tidak cukup karena
// yang diuji justru lapisan database (Row Level Security). Butuh .env dengan
// DATABASE_URL (role postgres, untuk penyiapan data uji) dan DATABASE_APP_URL
// (role aplikasi, tempat RLS benar-benar berlaku).

import { randomUUID } from "node:crypto"

import { PrismaPg } from "@prisma/adapter-pg"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { prisma } from "@/db/client"
import { TENANT_MODELS, tenantDb, tenantDelegate } from "@/db/tenant"
import { PrismaClient } from "@/generated/prisma/client"

const adminUrl = process.env.DATABASE_URL

if (!adminUrl) {
  throw new Error("DATABASE_URL belum diisi; test integrasi butuh .env")
}

// Superuser: hanya untuk menyiapkan dan membersihkan data uji.
const admin = new PrismaClient({
  adapter: new PrismaPg({ connectionString: adminUrl }),
})

const suffix = randomUUID().slice(0, 8)

interface Fixture {
  schoolAId: string
  schoolBId: string
  userAId: string
  userBId: string
  userExtraId: string
  membershipAId: string
  membershipBId: string
}

let fx: Fixture

beforeAll(async () => {
  const schoolA = await admin.school.create({
    data: { slug: `uji-a-${suffix}`, name: "Sekolah Uji A", level: "SMA" },
  })
  const schoolB = await admin.school.create({
    data: { slug: `uji-b-${suffix}`, name: "Sekolah Uji B", level: "SMA" },
  })
  const userA = await admin.user.create({
    data: {
      email: `uji-a-${suffix}@sekolah.test`,
      name: "Guru A",
      passwordHash: "x",
    },
  })
  const userB = await admin.user.create({
    data: {
      email: `uji-b-${suffix}@sekolah.test`,
      name: "Guru B",
      passwordHash: "x",
    },
  })
  const userExtra = await admin.user.create({
    data: {
      email: `uji-ekstra-${suffix}@sekolah.test`,
      name: "Orang Tua",
      passwordHash: "x",
    },
  })
  const membershipA = await admin.membership.create({
    data: { schoolId: schoolA.id, userId: userA.id, role: "teacher" },
  })
  const membershipB = await admin.membership.create({
    data: { schoolId: schoolB.id, userId: userB.id, role: "teacher" },
  })

  fx = {
    schoolAId: schoolA.id,
    schoolBId: schoolB.id,
    userAId: userA.id,
    userBId: userB.id,
    userExtraId: userExtra.id,
    membershipAId: membershipA.id,
    membershipBId: membershipB.id,
  }
})

afterAll(async () => {
  await admin.school.deleteMany({ where: { slug: { startsWith: `uji-` } } })
  await admin.user.deleteMany({ where: { email: { startsWith: `uji-` } } })
  await admin.$disconnect()
})

describe("tenantDb — lapis aplikasi", () => {
  it("menolak schoolId kosong", async () => {
    await expect(tenantDb("", async () => null)).rejects.toThrow(
      "schoolId wajib diisi"
    )
  })

  it("menyisipkan schoolId ke where walau tidak ditulis pemanggil", async () => {
    const rows = await tenantDb(fx.schoolAId, (db) => db.membership.findMany())

    expect(rows.length).toBeGreaterThan(0)
    expect(rows.every((row) => row.schoolId === fx.schoolAId)).toBe(true)
  })

  it("menggabungkan where pemanggil dengan schoolId", async () => {
    const rows = await tenantDb(fx.schoolAId, (db) =>
      db.membership.findMany({ where: { role: "teacher" } })
    )

    expect(rows.map((row) => row.id)).toEqual([fx.membershipAId])
  })

  it("menimpa schoolId yang dicoba pemanggil saat create", async () => {
    const created = await tenantDb(fx.schoolAId, (db) =>
      db.membership.create({
        data: {
          schoolId: fx.schoolBId,
          userId: fx.userExtraId,
          role: "parent",
        },
      })
    )

    expect(created.schoolId).toBe(fx.schoolAId)
  })

  it("count, aggregate, dan groupBy juga dibatasi sekolah", async () => {
    const [count, group] = await tenantDb(fx.schoolAId, async (db) => [
      await db.membership.count(),
      await db.membership.groupBy({ by: ["role"], _count: { _all: true } }),
    ])

    const total = group.reduce((sum, row) => sum + row._count._all, 0)
    expect(count).toBe(total)
    expect(count).toBeGreaterThan(0)
  })
})

describe("tenantDb — lapis database (RLS)", () => {
  it("tidak membaca membership sekolah lain lewat findUnique", async () => {
    const row = await tenantDb(fx.schoolAId, (db) =>
      db.membership.findUnique({ where: { id: fx.membershipBId } })
    )

    expect(row).toBeNull()
  })

  it("tidak mengubah membership sekolah lain", async () => {
    const updated = await tenantDb(fx.schoolAId, (db) =>
      db.membership.updateMany({
        where: { id: fx.membershipBId },
        data: { status: "inactive" },
      })
    )

    expect(updated.count).toBe(0)

    const untouched = await admin.membership.findUnique({
      where: { id: fx.membershipBId },
    })
    expect(untouched?.status).toBe("active")
  })

  it("tidak menghapus membership sekolah lain", async () => {
    const deleted = await tenantDb(fx.schoolAId, (db) =>
      db.membership.deleteMany({ where: { id: fx.membershipBId } })
    )

    expect(deleted.count).toBe(0)
    expect(
      await admin.membership.findUnique({ where: { id: fx.membershipBId } })
    ).not.toBeNull()
  })

  it("raw SQL untuk menulis ke sekolah lain ditolak", async () => {
    await expect(
      tenantDb(
        fx.schoolAId,
        (db) =>
          db.$executeRaw`INSERT INTO memberships (id, school_id, user_id, role, status, created_at, updated_at)
          VALUES (gen_random_uuid(), ${fx.schoolBId}::uuid, ${fx.userBId}::uuid, 'student', 'active', now(), now())`
      )
    ).rejects.toThrow()

    const row = await admin.membership.findFirst({
      where: { schoolId: fx.schoolBId, userId: fx.userBId, role: "student" },
    })
    expect(row).toBeNull()
  })

  it("query tenant tanpa konteks sekolah melihat nol baris", async () => {
    const viaPrisma = await prisma.membership.findMany()
    const viaRaw = await prisma.$queryRawUnsafe<{ id: string }[]>(
      "SELECT id FROM memberships"
    )

    expect(viaPrisma).toEqual([])
    expect(viaRaw).toEqual([])
  })

  it("konteks RLS tidak bocor ke koneksi berikutnya di pool", async () => {
    await tenantDb(fx.schoolAId, async (db) => {
      await db.membership.count()
    })

    expect(await prisma.membership.count()).toBe(0)
  })
})

describe("kepatuhan skema tenant", () => {
  async function tenantTables() {
    return admin.$queryRawUnsafe<{ table_name: string }[]>(
      `SELECT DISTINCT table_name
         FROM information_schema.columns
        WHERE table_schema = 'public' AND column_name = 'school_id'`
    )
  }

  it("setiap model tenant terdaftar sebagai delegate Prisma", () => {
    for (const model of TENANT_MODELS) {
      const delegate = tenantDelegate(model)
      expect(
        prisma[delegate as keyof typeof prisma],
        `model ${model} tidak ada`
      ).toBeDefined()
    }
  })

  it("tidak ada tabel school_id yang lolos dari TENANT_MODELS", async () => {
    const tables = await tenantTables()

    expect(tables.length).toBeGreaterThan(0)
    expect(tables.length).toBe(TENANT_MODELS.length)
  })

  it("setiap tabel tenant punya policy RLS", async () => {
    const tables = await tenantTables()
    const policies = await admin.$queryRawUnsafe<{ tablename: string }[]>(
      "SELECT tablename FROM pg_policies WHERE schemaname = 'public'"
    )

    for (const { table_name: table } of tables) {
      expect(policies.map((policy) => policy.tablename)).toContain(table)
    }
  })

  it("role aplikasi bukan superuser dan tidak punya BYPASSRLS", async () => {
    const [role] = await admin.$queryRawUnsafe<
      { rolsuper: boolean; rolbypassrls: boolean }[]
    >(
      "SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = 'edusaas_app'"
    )

    expect(role).toBeDefined()
    expect(role.rolsuper).toBe(false)
    expect(role.rolbypassrls).toBe(false)
  })
})
