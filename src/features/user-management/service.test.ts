// @vitest-environment node
// Test integrasi manajemen pengguna (US-02) + isolasi antar sekolah.
//
// Fixture dibuat lewat `admin` (DATABASE_URL, superuser); aturan bisnis diuji
// lewat service (DATABASE_APP_URL, kena RLS).

import { randomUUID } from "node:crypto"

import { PrismaPg } from "@prisma/adapter-pg"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import { PrismaClient } from "@/generated/prisma/client"
import { clearMemoryOutbox, getMemoryOutbox } from "@/lib/email"

import {
  UserManagementError,
  listPeople,
  requestTeacherPasswordReset,
} from "./service"

const adminUrl = process.env.DATABASE_URL
if (!adminUrl)
  throw new Error("DATABASE_URL belum diisi; test integrasi butuh .env")

const admin = new PrismaClient({
  adapter: new PrismaPg({ connectionString: adminUrl }),
})
const suffix = randomUUID().slice(0, 8)

let schoolAId: string
let schoolBId: string
let slugA: string
let actor: { userId: string; role: "school_admin" }
let guruA: string
let guruAEmail: string
let guruB: string
let guruHapus: string

async function createTeacher(
  schoolId: string,
  code: string,
  name: string,
  opts: { deleted?: boolean } = {}
) {
  // Better Auth mencari email dalam huruf kecil, jadi fixture juga huruf kecil.
  const email = `guru-${code.toLowerCase()}-${suffix}@sekolah.test`
  const user = await admin.user.create({
    data: { email, name, emailVerified: true },
  })
  const teacher = await admin.teacher.create({
    data: {
      schoolId,
      userId: user.id,
      code,
      deletedAt: opts.deleted ? new Date() : null,
    },
  })
  return { id: teacher.id, email }
}

async function createStudent(schoolId: string, nis: string, name: string) {
  const user = await admin.user.create({
    data: {
      email: `${nis}-${suffix}@sekolah.invalid`,
      name,
      emailVerified: true,
    },
  })
  return (await admin.student.create({ data: { schoolId, userId: user.id, nis } }))
    .id
}

/** Email dikirim lewat antrean tanpa di-await, jadi tunggu sampai tiba. */
async function waitForEmail(to: string) {
  for (let i = 0; i < 50; i++) {
    const found = getMemoryOutbox().find((message) => message.to === to)
    if (found) return found
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  throw new Error(`Email untuk ${to} tidak tiba`)
}

beforeAll(async () => {
  slugA = `um-a-${suffix}`
  const [a, b] = await Promise.all([
    admin.school.create({
      data: { slug: slugA, name: "SMA Uji A", level: "SMA" },
    }),
    admin.school.create({
      data: { slug: `um-b-${suffix}`, name: "SMA Uji B", level: "SMA" },
    }),
  ])
  schoolAId = a.id
  schoolBId = b.id

  const adminUser = await admin.user.create({
    data: {
      email: `admin-${suffix}@sekolah.test`,
      name: "Admin Uji",
      emailVerified: true,
    },
  })
  actor = { userId: adminUser.id, role: "school_admin" }

  const gA = await createTeacher(schoolAId, "GRU-A1", "Ani Guru")
  guruA = gA.id
  guruAEmail = gA.email
  await createTeacher(schoolAId, "GRU-A2", "Budi Guru")
  guruHapus = (
    await createTeacher(schoolAId, "GRU-A3", "Citra Dihapus", { deleted: true })
  ).id
  const dinaId = await createStudent(schoolAId, "7001", "Dina Siswa")
  await admin.studentPin.create({
    data: { schoolId: schoolAId, studentId: dinaId, pinHash: "x" },
  })
  await createStudent(schoolAId, "7003", "Gina Tanpa Pin")
  guruB = (await createTeacher(schoolBId, "GRU-B1", "Eko Sekolah B")).id
  await createStudent(schoolBId, "7002", "Fani Sekolah B")
})

beforeEach(() => clearMemoryOutbox())

afterAll(async () => {
  await admin.school.deleteMany({ where: { id: { in: [schoolAId, schoolBId] } } })
  await admin.user.deleteMany({
    where: {
      OR: [
        { email: { endsWith: `-${suffix}@sekolah.test` } },
        { email: { endsWith: `-${suffix}@sekolah.invalid` } },
      ],
    },
  })
  await admin.$disconnect()
})

describe("listPeople", () => {
  it("hanya berisi guru dan siswa sekolah itu (isolasi), tanpa yang dihapus", async () => {
    const { rows, truncated } = await listPeople(schoolAId)
    expect(rows.map((row) => row.name)).toEqual([
      "Ani Guru",
      "Budi Guru",
      "Dina Siswa",
      "Gina Tanpa Pin",
    ])
    expect(truncated).toBe(false)
  })

  it("siswa memakai NIS sebagai pengenal dan tanpa email (email palsu disembunyikan)", async () => {
    const { rows } = await listPeople(schoolAId, { role: "student" })
    expect(rows).toEqual([
      expect.objectContaining({
        role: "student",
        identifier: "7001",
        email: null,
      }),
      expect.objectContaining({
        role: "student",
        identifier: "7003",
        email: null,
      }),
    ])
  })

  it("siswa yang sudah punya PIN bertanda hasPin; siswa tanpa PIN dan guru tidak", async () => {
    const { rows } = await listPeople(schoolAId)
    const byName = Object.fromEntries(rows.map((row) => [row.name, row.hasPin]))
    expect(byName["Dina Siswa"]).toBe(true)
    expect(byName["Gina Tanpa Pin"]).toBe(false)
    expect(byName["Ani Guru"]).toBe(false)
  })

  it("guru memakai kode sebagai pengenal dan menampilkan email", async () => {
    const { rows } = await listPeople(schoolAId, { role: "teacher" })
    expect(rows[0]).toEqual(
      expect.objectContaining({
        role: "teacher",
        identifier: "GRU-A1",
        email: guruAEmail,
      })
    )
  })

  it("mencari berdasarkan nama atau kode, tanpa peduli huruf besar/kecil", async () => {
    const byName = await listPeople(schoolAId, { q: "budi" })
    expect(byName.rows.map((row) => row.name)).toEqual(["Budi Guru"])

    const byCode = await listPeople(schoolAId, { q: "gru-a1" })
    expect(byCode.rows.map((row) => row.name)).toEqual(["Ani Guru"])

    const byNis = await listPeople(schoolAId, { q: "7001" })
    expect(byNis.rows.map((row) => row.name)).toEqual(["Dina Siswa"])
  })

  it("pencarian tidak menembus sekolah lain", async () => {
    const { rows } = await listPeople(schoolAId, { q: "Sekolah B" })
    expect(rows).toEqual([])
  })
})

describe("requestTeacherPasswordReset", () => {
  it("mengirim email tautan ke host sekolah dan mencatat audit tanpa data sensitif", async () => {
    await requestTeacherPasswordReset(schoolAId, actor, guruA)

    const message = await waitForEmail(guruAEmail)
    expect(message.subject).toContain("Atur ulang")
    expect(message.text).toContain(`${slugA}.localhost:3000`)

    const logs = await admin.auditLog.findMany({
      where: { schoolId: schoolAId, action: "user.password_reset" },
    })
    expect(logs).toHaveLength(1)
    expect(logs[0]).toMatchObject({
      actorUserId: actor.userId,
      entity: "teacher",
      entityId: guruA,
    })
    expect(JSON.stringify(logs[0])).not.toContain(guruAEmail)
    expect(JSON.stringify(logs[0])).not.toContain("reset-password")
  })

  it("guru sekolah lain -> NOT_FOUND, tanpa email dan tanpa audit", async () => {
    await expect(
      requestTeacherPasswordReset(schoolAId, actor, guruB)
    ).rejects.toMatchObject({ code: "NOT_FOUND" })

    await new Promise((resolve) => setTimeout(resolve, 150))
    expect(getMemoryOutbox()).toHaveLength(0)
    expect(
      await admin.auditLog.count({
        where: { schoolId: schoolAId, entityId: guruB },
      })
    ).toBe(0)
  })

  it("id tidak dikenal dan guru yang sudah dihapus -> NOT_FOUND", async () => {
    await expect(
      requestTeacherPasswordReset(schoolAId, actor, randomUUID())
    ).rejects.toBeInstanceOf(UserManagementError)
    await expect(
      requestTeacherPasswordReset(schoolAId, actor, guruHapus)
    ).rejects.toMatchObject({ code: "NOT_FOUND" })
  })
})
