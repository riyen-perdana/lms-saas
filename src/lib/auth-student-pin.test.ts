// @vitest-environment node
// Test integrasi endpoint Better Auth POST /sign-in/student-pin: sesi + cookie
// pada sukses, galat seragam pada gagal, dan sign-in/email tidak berlaku
// untuk siswa (tanpa akun credential).

import { randomUUID } from "node:crypto"

import { PrismaPg } from "@prisma/adapter-pg"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { prisma } from "@/db/client"
import { PrismaClient } from "@/generated/prisma/client"
import { issueStudentPin } from "@/features/student-pin/service"
import { auth } from "@/lib/auth"

// Fixture lewat `admin` (DATABASE_URL, superuser); `prisma` aplikasi (role
// biasa, kena RLS) hanya dipakai untuk tabel global rate_limits.
const adminUrl = process.env.DATABASE_URL
if (!adminUrl)
  throw new Error("DATABASE_URL belum diisi; test integrasi butuh .env")

const admin = new PrismaClient({
  adapter: new PrismaPg({ connectionString: adminUrl }),
})

const suffix = randomUUID().slice(0, 8)
const ACTOR = { userId: randomUUID(), role: "school_admin" as const }
const ip = (label: string) => `ip-${suffix}-${label}`

let schoolId: string
let host: string
let userId: string
let pin: string
let email: string

const headersFor = (label: string, extra: Record<string, string> = {}) =>
  new Headers({ host, "x-forwarded-for": ip(label), ...extra })

beforeAll(async () => {
  const slug = `ap-${suffix}`
  const school = await admin.school.create({
    data: { slug, name: "SD Endpoint Pin", level: "SD" },
  })
  schoolId = school.id
  host = `${slug}.localhost:3000`

  email = `8001-${suffix}@${slug}.invalid`
  const user = await admin.user.create({
    data: { email, name: "Siswa Endpoint", emailVerified: true },
  })
  userId = user.id
  const student = await admin.student.create({
    data: { schoolId, userId, nis: "8001" },
  })
  await admin.membership.create({
    data: { schoolId, userId, role: "student", status: "active" },
  })
  pin = (await issueStudentPin(schoolId, ACTOR, student.id)).pin
})

afterAll(async () => {
  await prisma.rateLimit.deleteMany({ where: { key: { contains: suffix } } })
  await prisma.rateLimit.deleteMany({ where: { key: { contains: schoolId } } })
  await admin.school.deleteMany({ where: { id: schoolId } })
  await admin.user.deleteMany({ where: { id: userId } })
  await admin.$disconnect()
  await prisma.$disconnect()
})

describe("POST /sign-in/student-pin", () => {
  it("PIN benar: 200, cookie sesi, dan sesi mengenali siswa itu", async () => {
    const response = await auth.api.signInStudentPin({
      body: { nis: "8001", pin },
      headers: headersFor("ok"),
      asResponse: true,
    })
    expect(response.status).toBe(200)

    const setCookie = response.headers.get("set-cookie") ?? ""
    expect(setCookie).toContain("session_token")
    const cookie = setCookie.split(";")[0]

    const session = await auth.api.getSession({
      headers: new Headers({ host, cookie }),
    })
    expect(session?.user.id).toBe(userId)
  })

  it("PIN salah: 401 dengan pesan seragam dan tanpa cookie", async () => {
    const response = await auth.api.signInStudentPin({
      body: { nis: "8001", pin: "100000" },
      headers: headersFor("bad"),
      asResponse: true,
    })
    expect(response.status).toBe(401)
    expect(response.headers.get("set-cookie") ?? "").not.toContain("session_token")
    expect(await response.text()).toContain("NIS atau PIN salah.")
  })

  it("terkunci: 429", async () => {
    const attacker = "lock"
    for (let i = 0; i < 5; i++) {
      await auth.api.signInStudentPin({
        body: { nis: "8001", pin: "100000" },
        headers: headersFor(attacker),
        asResponse: true,
      })
    }
    const response = await auth.api.signInStudentPin({
      body: { nis: "8001", pin },
      headers: headersFor(attacker),
      asResponse: true,
    })
    expect(response.status).toBe(429)
  })

  it("siswa tidak punya akun credential: sign-in email dengan PIN gagal", async () => {
    await expect(
      auth.api.signInEmail({
        body: { email, password: pin },
        headers: headersFor("email"),
      })
    ).rejects.toBeDefined()
  })
})
