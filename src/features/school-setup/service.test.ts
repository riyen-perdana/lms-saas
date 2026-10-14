// @vitest-environment node
// Test integrasi wizard setup (OB-01): profil, logo, status, penutupan.

import { randomUUID } from "node:crypto"

import { PrismaPg } from "@prisma/adapter-pg"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { createAcademicYear, createSubject } from "@/features/academic/service"
import { PrismaClient } from "@/generated/prisma/client"
import { clearMemoryStorage } from "@/lib/storage"

import { profileSchema } from "./schema"
import {
  SetupError,
  completeSetup,
  getLogo,
  getSetupState,
  isSetupCompleted,
  saveLogo,
  updateProfile,
} from "./service"

const adminUrl = process.env.DATABASE_URL
if (!adminUrl) throw new Error("DATABASE_URL belum diisi; test integrasi butuh .env")

const admin = new PrismaClient({ adapter: new PrismaPg({ connectionString: adminUrl }) })
const suffix = randomUUID().slice(0, 8)
const npsnA = String(Math.floor(10_000_000 + Math.random() * 89_999_999))
let npsnB = String(Math.floor(10_000_000 + Math.random() * 89_999_999))
if (npsnB === npsnA) npsnB = "99999999"

let aId: string
let bId: string
const png = { body: Buffer.from([137, 80, 78, 71]), contentType: "image/png" }

const YEAR = {
  name: "2026/2027",
  ganjil: { startDate: "2026-07-13", endDate: "2026-12-19" },
  genap: { startDate: "2027-01-04", endDate: "2027-06-26" },
}

beforeAll(async () => {
  process.env.STORAGE_DRIVER = "memory"
  clearMemoryStorage()
  const [a, b] = await Promise.all([
    admin.school.create({ data: { slug: `set-a-${suffix}`, name: "Sekolah A", level: "SMA", npsn: npsnA } }),
    admin.school.create({ data: { slug: `set-b-${suffix}`, name: "Sekolah B", level: "SMK" } }),
  ])
  aId = a.id
  bId = b.id
})

afterAll(async () => {
  delete process.env.STORAGE_DRIVER
  await admin.school.deleteMany({ where: { id: { in: [aId, bId] } } })
  await admin.$disconnect()
})

describe("skema profil", () => {
  it("NPSN opsional tetapi harus 8 digit", () => {
    expect(profileSchema.parse({ name: "SMA Uji", npsn: "" }).npsn).toBeUndefined()
    expect(profileSchema.safeParse({ name: "SMA Uji", npsn: "123" }).success).toBe(false)
    expect(profileSchema.safeParse({ name: "SM" }).success).toBe(false)
  })
})

describe("profil", () => {
  it("memperbarui nama dan NPSN", async () => {
    await updateProfile(aId, { name: "SMA Negeri Uji", npsn: npsnA })
    const state = await getSetupState(aId)
    expect(state.name).toBe("SMA Negeri Uji")
    expect(state.npsn).toBe(npsnA)
  })

  it("NPSN milik sekolah lain ditolak", async () => {
    await expect(updateProfile(bId, { name: "Sekolah B", npsn: npsnA })).rejects.toMatchObject({
      code: "DUPLICATE",
    })
    await expect(updateProfile(bId, { name: "Sekolah B", npsn: npsnB })).resolves.toBeUndefined()
  })
})

describe("logo", () => {
  it("menyimpan dan membaca logo; format dan ukuran divalidasi", async () => {
    await saveLogo(aId, png)
    expect((await getSetupState(aId)).hasLogo).toBe(true)
    expect(await getLogo(aId)).toEqual(png)

    await expect(saveLogo(aId, { body: Buffer.from("x"), contentType: "image/gif" })).rejects.toMatchObject({
      code: "INVALID",
    })
    await expect(
      saveLogo(aId, { body: Buffer.alloc(1024 * 1024 + 1), contentType: "image/png" })
    ).rejects.toMatchObject({ code: "INVALID" })
  })

  it("mengganti format menghapus file lama", async () => {
    const jpg = { body: Buffer.from([255, 216, 255]), contentType: "image/jpeg" }
    await saveLogo(aId, jpg)
    expect(await getLogo(aId)).toEqual(jpg)
  })

  it("isolasi: logo sekolah lain tidak ikut terbaca", async () => {
    expect(await getLogo(bId)).toBeNull()
  })
})

describe("penyelesaian setup", () => {
  it("sekolah baru belum selesai; ditolak tanpa tahun ajaran", async () => {
    expect(await isSetupCompleted(aId)).toBe(false)
    await expect(completeSetup(aId)).rejects.toBeInstanceOf(SetupError)
  })

  it("state mencerminkan data yang sudah diisi, lalu selesai", async () => {
    await createAcademicYear(aId, YEAR)
    await createSubject(aId, { code: "MTK", name: "Matematika", group: "umum" })

    const state = await getSetupState(aId)
    expect(state).toMatchObject({
      yearCount: 1,
      subjectCount: 1,
      majorCount: 0,
      classroomCount: 0,
      usesMajors: false,
    })

    await completeSetup(aId)
    expect(await isSetupCompleted(aId)).toBe(true)
    await expect(completeSetup(aId)).resolves.toBeUndefined()
  })

  it("isolasi: setup sekolah A tidak mengubah status sekolah B", async () => {
    expect(await isSetupCompleted(bId)).toBe(false)
    expect((await getSetupState(bId)).yearCount).toBe(0)
    expect((await getSetupState(bId)).usesMajors).toBe(true)
  })
})
