// @vitest-environment node
// Matriks izin sekolah (US-03) terhadap database sungguhan: peran, status
// sekolah, keanggotaan sekolah lain, dan keanggotaan nonaktif/dihapus.

import { randomUUID } from "node:crypto"

import { PrismaPg } from "@prisma/adapter-pg"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { PrismaClient } from "@/generated/prisma/client"
import type { ResolvedTenant } from "@/lib/tenant/resolve"

import { authorizeSchoolRequest, type SchoolRole } from "./authorize"

const adminUrl = process.env.DATABASE_URL
if (!adminUrl)
  throw new Error("DATABASE_URL belum diisi; test integrasi butuh .env")

const admin = new PrismaClient({
  adapter: new PrismaPg({ connectionString: adminUrl }),
})
const suffix = randomUUID().slice(0, 8)

let schoolAId: string
let schoolBId: string
const users: Record<string, string> = {}

function tenantOf(
  id: string,
  status: "active" | "readonly" | "suspended" | "trial" = "active"
): ResolvedTenant {
  return {
    area: "school",
    slug: "uji",
    school: {
      id,
      slug: "uji",
      name: "Sekolah Uji",
      level: "SMA",
      status,
      timezone: "Asia/Jakarta",
    },
  }
}

async function addUser(
  label: string,
  schoolId: string | null,
  role: SchoolRole,
  extra: { status?: "active" | "inactive"; deletedAt?: Date } = {}
) {
  const user = await admin.user.create({
    data: {
      email: `${label}-${suffix}@sekolah.test`,
      name: label,
      emailVerified: true,
    },
  })
  users[label] = user.id
  if (schoolId) {
    await admin.membership.create({
      data: { schoolId, userId: user.id, role, ...extra },
    })
  }
}

beforeAll(async () => {
  const [a, b] = await Promise.all([
    admin.school.create({
      data: { slug: `az-a-${suffix}`, name: "SMA Izin A", level: "SMA" },
    }),
    admin.school.create({
      data: { slug: `az-b-${suffix}`, name: "SMA Izin B", level: "SMA" },
    }),
  ])
  schoolAId = a.id
  schoolBId = b.id

  await addUser("admin", schoolAId, "school_admin")
  await addUser("guru", schoolAId, "teacher")
  await addUser("siswa", schoolAId, "student")
  await addUser("ortu", schoolAId, "parent")
  await addUser("adminB", schoolBId, "school_admin")
  await addUser("tanpa", null, "school_admin")
  await addUser("nonaktif", schoolAId, "school_admin", { status: "inactive" })
  await addUser("dihapus", schoolAId, "school_admin", {
    deletedAt: new Date(),
  })
})

afterAll(async () => {
  await admin.school.deleteMany({ where: { id: { in: [schoolAId, schoolBId] } } })
  await admin.user.deleteMany({ where: { email: { contains: suffix } } })
  await admin.$disconnect()
})

const ADMIN_ONLY = { roles: ["school_admin"] as SchoolRole[] }

describe("authorizeSchoolRequest: peran", () => {
  it("admin sekolah lolos pada fungsi admin", async () => {
    const result = await authorizeSchoolRequest(
      tenantOf(schoolAId),
      users.admin,
      ADMIN_ONLY
    )
    expect(result).toEqual({
      ok: true,
      schoolId: schoolAId,
      userId: users.admin,
      role: "school_admin",
    })
  })

  it.each(["guru", "siswa", "ortu"])("%s ditolak 403 pada fungsi admin", async (who) => {
    const result = await authorizeSchoolRequest(
      tenantOf(schoolAId),
      users[who],
      ADMIN_ONLY
    )
    expect(result).toMatchObject({ ok: false, status: 403 })
  })

  it("anonim ditolak 401", async () => {
    expect(
      await authorizeSchoolRequest(tenantOf(schoolAId), null, ADMIN_ONLY)
    ).toMatchObject({ ok: false, status: 401 })
  })

  it("fungsi multi-peran menerima semua peran yang disebut saja", async () => {
    const options = { roles: ["teacher", "school_admin"] as SchoolRole[] }
    for (const who of ["admin", "guru"]) {
      expect(
        await authorizeSchoolRequest(tenantOf(schoolAId), users[who], options)
      ).toMatchObject({ ok: true })
    }
    expect(
      await authorizeSchoolRequest(tenantOf(schoolAId), users.siswa, options)
    ).toMatchObject({ ok: false, status: 403 })
  })

  it("orang tua lolos pada fungsi khusus orang tua", async () => {
    expect(
      await authorizeSchoolRequest(tenantOf(schoolAId), users.ortu, {
        roles: ["parent"],
      })
    ).toMatchObject({ ok: true, role: "parent" })
    expect(
      await authorizeSchoolRequest(tenantOf(schoolAId), users.admin, {
        roles: ["parent"],
      })
    ).toMatchObject({ ok: false, status: 403 })
  })
})

describe("authorizeSchoolRequest: batas sekolah dan keanggotaan", () => {
  it("admin sekolah B tidak punya akses di sekolah A (dan sebaliknya)", async () => {
    expect(
      await authorizeSchoolRequest(tenantOf(schoolAId), users.adminB, ADMIN_ONLY)
    ).toMatchObject({ ok: false, status: 403 })
    expect(
      await authorizeSchoolRequest(tenantOf(schoolBId), users.admin, ADMIN_ONLY)
    ).toMatchObject({ ok: false, status: 403 })
    expect(
      await authorizeSchoolRequest(tenantOf(schoolBId), users.adminB, ADMIN_ONLY)
    ).toMatchObject({ ok: true, schoolId: schoolBId })
  })

  it.each(["tanpa", "nonaktif", "dihapus"])(
    "%s tidak punya keanggotaan aktif -> 403",
    async (who) => {
      expect(
        await authorizeSchoolRequest(tenantOf(schoolAId), users[who], ADMIN_ONLY)
      ).toMatchObject({ ok: false, status: 403 })
    }
  )
})

describe("authorizeSchoolRequest: host dan status sekolah", () => {
  it.each(["marketing", "platform", "invalid"] as const)(
    "host area %s ditolak 404",
    async (area) => {
      const tenant: ResolvedTenant = { area, slug: null, school: null }
      expect(
        await authorizeSchoolRequest(tenant, users.admin, ADMIN_ONLY)
      ).toMatchObject({ ok: false, status: 404 })
    }
  )

  it("host sekolah yang tidak ditemukan ditolak 404", async () => {
    const tenant: ResolvedTenant = { area: "school", slug: "x", school: null }
    expect(
      await authorizeSchoolRequest(tenant, users.admin, ADMIN_ONLY)
    ).toMatchObject({ ok: false, status: 404 })
  })

  it("sekolah suspended ditutup total, termasuk untuk fungsi baca", async () => {
    const tenant = tenantOf(schoolAId, "suspended")
    expect(
      await authorizeSchoolRequest(tenant, users.admin, ADMIN_ONLY)
    ).toMatchObject({ ok: false, status: 403 })
    expect(
      await authorizeSchoolRequest(tenant, users.admin, {
        ...ADMIN_ONLY,
        allowReadonly: true,
      })
    ).toMatchObject({ ok: false, status: 403 })
  })

  it("sekolah readonly: ditolak untuk fungsi tulis, boleh untuk fungsi baca", async () => {
    const tenant = tenantOf(schoolAId, "readonly")
    expect(
      await authorizeSchoolRequest(tenant, users.admin, ADMIN_ONLY)
    ).toMatchObject({ ok: false, status: 403 })
    expect(
      await authorizeSchoolRequest(tenant, users.admin, {
        ...ADMIN_ONLY,
        allowReadonly: true,
      })
    ).toMatchObject({ ok: true })
  })

  it("sekolah trial diperlakukan seperti aktif", async () => {
    expect(
      await authorizeSchoolRequest(
        tenantOf(schoolAId, "trial"),
        users.admin,
        ADMIN_ONLY
      )
    ).toMatchObject({ ok: true })
  })
})
