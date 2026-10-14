// @vitest-environment node
// Test isolasi antar sekolah untuk akses keanggotaan (gate F0).

import { randomUUID } from "node:crypto"

import { PrismaPg } from "@prisma/adapter-pg"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { getSchoolAccess } from "@/features/auth/service"
import { PrismaClient } from "@/generated/prisma/client"

const adminUrl = process.env.DATABASE_URL
if (!adminUrl) throw new Error("DATABASE_URL belum diisi; test integrasi butuh .env")

const admin = new PrismaClient({
  adapter: new PrismaPg({ connectionString: adminUrl }),
})
const suffix = randomUUID().slice(0, 8)

let schoolAId: string
let schoolBId: string
let guruId: string
let nonaktifId: string

beforeAll(async () => {
  const a = await admin.school.create({
    data: { slug: `akses-a-${suffix}`, name: "Sekolah A", level: "SMA" },
  })
  const b = await admin.school.create({
    data: { slug: `akses-b-${suffix}`, name: "Sekolah B", level: "SMA" },
  })
  const guru = await admin.user.create({
    data: { email: `guru-${suffix}@sekolah.test`, name: "Guru" },
  })
  const nonaktif = await admin.user.create({
    data: { email: `nonaktif-${suffix}@sekolah.test`, name: "Nonaktif" },
  })
  schoolAId = a.id
  schoolBId = b.id
  guruId = guru.id
  nonaktifId = nonaktif.id

  await admin.membership.create({
    data: { schoolId: a.id, userId: guru.id, role: "teacher" },
  })
  await admin.membership.create({
    data: { schoolId: a.id, userId: nonaktif.id, role: "student", status: "inactive" },
  })
})

afterAll(async () => {
  await admin.school.deleteMany({ where: { id: { in: [schoolAId, schoolBId] } } })
  await admin.user.deleteMany({ where: { id: { in: [guruId, nonaktifId] } } })
  await admin.$disconnect()
})

describe("getSchoolAccess", () => {
  it("mengembalikan peran untuk anggota aktif", async () => {
    const access = await getSchoolAccess(schoolAId, guruId)
    expect(access?.role).toBe("teacher")
  })

  it("isolasi: anggota sekolah A tidak punya akses ke sekolah B", async () => {
    expect(await getSchoolAccess(schoolBId, guruId)).toBeNull()
  })

  it("menolak anggota nonaktif", async () => {
    expect(await getSchoolAccess(schoolAId, nonaktifId)).toBeNull()
  })

  it("menolak user yang tidak punya keanggotaan", async () => {
    expect(await getSchoolAccess(schoolAId, randomUUID())).toBeNull()
  })
})
