// @vitest-environment node
// Test integrasi log audit (US-04) + isolasi antar sekolah + append-only.
//
// Fixture lewat `admin` (DATABASE_URL, superuser); service diuji lewat
// DATABASE_APP_URL (role edusaas_app, kena RLS dan pencabutan hak).

import { randomUUID } from "node:crypto"

import { PrismaPg } from "@prisma/adapter-pg"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { platformDb } from "@/db/platform"
import { prisma } from "@/db/client"
import { tenantDb } from "@/db/tenant"
import { PrismaClient } from "@/generated/prisma/client"

import { AUDIT_PAGE_SIZE, listAuditSchema } from "./schema"
import { listAuditLogs, recordAudit } from "./service"

const adminUrl = process.env.DATABASE_URL
if (!adminUrl)
  throw new Error("DATABASE_URL belum diisi; test integrasi butuh .env")

const admin = new PrismaClient({
  adapter: new PrismaPg({ connectionString: adminUrl }),
})
const suffix = randomUUID().slice(0, 8)

let schoolAId: string
let schoolBId: string
let userId: string
let actor: { userId: string; role: "school_admin" }

beforeAll(async () => {
  const [a, b] = await Promise.all([
    admin.school.create({
      data: { slug: `au-a-${suffix}`, name: "SMA Audit A", level: "SMA" },
    }),
    admin.school.create({
      data: { slug: `au-b-${suffix}`, name: "SMA Audit B", level: "SMA" },
    }),
  ])
  schoolAId = a.id
  schoolBId = b.id

  const user = await admin.user.create({
    data: {
      email: `admin-${suffix}@sekolah.test`,
      name: "Admin Audit",
      emailVerified: true,
    },
  })
  userId = user.id
  actor = { userId, role: "school_admin" }
})

afterAll(async () => {
  await admin.school.deleteMany({ where: { id: { in: [schoolAId, schoolBId] } } })
  await admin.user.deleteMany({ where: { email: { contains: suffix } } })
  await admin.$disconnect()
})

describe("recordAudit", () => {
  it("mencatat aksi dengan nama pelaku dan data sebelum/sesudah", async () => {
    await tenantDb(schoolAId, (db) =>
      recordAudit(db, schoolAId, actor, {
        action: "homeroom.clear",
        entity: "classroom",
        entityId: "kelas-1",
        before: { homeroomTeacherId: "guru-1" },
      })
    )

    const { rows } = await listAuditLogs(schoolAId, { action: "homeroom.clear" })
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      actorName: "Admin Audit",
      actorRole: "school_admin",
      entity: "classroom",
      entityId: "kelas-1",
      after: null,
    })
    expect(JSON.parse(rows[0].before ?? "null")).toEqual({
      homeroomTeacherId: "guru-1",
    })
  })

  it("ikut dibatalkan bila transaksi aksinya gagal", async () => {
    await expect(
      tenantDb(schoolAId, async (db) => {
        await recordAudit(db, schoolAId, actor, {
          action: "course.remove",
          entity: "course",
        })
        throw new Error("aksi gagal")
      })
    ).rejects.toThrow("aksi gagal")

    const { rows } = await listAuditLogs(schoolAId, { action: "course.remove" })
    expect(rows).toHaveLength(0)
  })

  it("pelaku tak dikenal tetap tercatat", async () => {
    await tenantDb(schoolAId, (db) =>
      recordAudit(db, schoolAId, { userId: randomUUID(), role: "school_admin" }, {
        action: "import.start",
        entity: "import_batch",
      })
    )
    const { rows } = await listAuditLogs(schoolAId, { action: "import.start" })
    expect(rows[0].actorName).toBe("Tidak diketahui")
  })

  it("aksi Super Admin (platformDb) masuk ke log sekolah yang dituju", async () => {
    await platformDb((db) =>
      recordAudit(
        db,
        schoolBId,
        { userId, role: "platform_admin" },
        {
          action: "school.suspend",
          entity: "school",
          entityId: schoolBId,
          before: { status: "active" },
          after: { status: "suspended" },
        }
      )
    )

    const { rows } = await listAuditLogs(schoolBId, { action: "school.suspend" })
    expect(rows).toHaveLength(1)
    expect(rows[0].actorRole).toBe("platform_admin")
  })
})

describe("listAuditLogs", () => {
  it("terbaru dulu, dipaginasi 50 baris dengan kursor", async () => {
    await tenantDb(schoolAId, async (db) => {
      for (let i = 0; i < AUDIT_PAGE_SIZE + 5; i++) {
        await recordAudit(db, schoolAId, actor, {
          action: "rollover.run",
          entity: "semester",
          entityId: `s-${i}`,
        })
      }
    })

    const first = await listAuditLogs(schoolAId, { action: "rollover.run" })
    expect(first.rows).toHaveLength(AUDIT_PAGE_SIZE)
    expect(first.nextCursor).not.toBeNull()
    expect(first.rows[0].entityId).toBe(`s-${AUDIT_PAGE_SIZE + 4}`)

    const second = await listAuditLogs(schoolAId, {
      action: "rollover.run",
      cursor: first.nextCursor ?? undefined,
    })
    expect(second.rows).toHaveLength(5)
    expect(second.nextCursor).toBeNull()
    expect(second.rows.at(-1)?.entityId).toBe("s-0")
  })

  it("filter aksi hanya mengembalikan aksi itu", async () => {
    const { rows } = await listAuditLogs(schoolAId, { action: "homeroom.clear" })
    expect(rows.every((row) => row.action === "homeroom.clear")).toBe(true)
  })

  it("skema menolak aksi di luar daftar dan kursor bukan uuid", () => {
    expect(listAuditSchema.safeParse({ action: "hapus.semua" }).success).toBe(false)
    expect(listAuditSchema.safeParse({ cursor: "abc" }).success).toBe(false)
  })
})

describe("isolasi dan append-only", () => {
  it("sekolah lain tidak melihat log sekolah ini", async () => {
    const a = await listAuditLogs(schoolAId, { action: "school.suspend" })
    expect(a.rows).toHaveLength(0)

    const b = await listAuditLogs(schoolBId)
    expect(b.rows.every((row) => row.action === "school.suspend")).toBe(true)
  })

  it("tidak bisa menulis log untuk sekolah lain lewat tenantDb", async () => {
    await expect(
      tenantDb(schoolAId, (db) =>
        recordAudit(db, schoolBId, actor, {
          action: "course.remove",
          entity: "course",
        })
      )
    ).resolves.toBeUndefined()

    // schoolId ditimpa extension -> tercatat di sekolah A, bukan B.
    expect(
      (await listAuditLogs(schoolBId, { action: "course.remove" })).rows
    ).toHaveLength(0)
    expect(
      (await listAuditLogs(schoolAId, { action: "course.remove" })).rows
    ).toHaveLength(1)
  })

  it("tanpa konteks sekolah, log tidak terlihat", async () => {
    expect(await prisma.auditLog.count()).toBe(0)
  })

  it("aplikasi tidak boleh mengubah atau menghapus log", async () => {
    await expect(
      tenantDb(schoolAId, (db) =>
        db.auditLog.updateMany({ data: { action: "dipalsukan" } })
      )
    ).rejects.toThrow()
    await expect(
      tenantDb(schoolAId, (db) => db.auditLog.deleteMany({}))
    ).rejects.toThrow()
  })
})
