// @vitest-environment node
// Test integrasi login NIS + PIN: batas laju berlapis (hanya kegagalan),
// pesan galat seragam, isolasi sekolah.

import { randomUUID } from "node:crypto"

import { PrismaPg } from "@prisma/adapter-pg"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { prisma } from "@/db/client"
import { PrismaClient } from "@/generated/prisma/client"
import { consumeRateLimit } from "@/lib/rate-limit"

import {
  INVALID_LOGIN_MESSAGE,
  STUDENT_LOGIN_LIMITS,
  StudentLoginError,
  loginWithStudentPin,
} from "./login"
import { issueStudentPin } from "./service"

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
let aniPin: string
let budiPin: string
let ciciPin: string

async function createStudent(nis: string, name: string) {
  const user = await admin.user.create({
    data: {
      email: `${nis}-${randomUUID().slice(0, 6)}-${suffix}@sekolah.invalid`,
      name,
      emailVerified: true,
    },
  })
  const student = await admin.student.create({
    data: { schoolId, userId: user.id, nis },
  })
  await admin.membership.create({
    data: { schoolId, userId: user.id, role: "student", status: "active" },
  })
  return { id: student.id, userId: user.id }
}

async function expectLoginError(
  promise: Promise<unknown>,
  code: "INVALID" | "RATE_LIMITED"
) {
  const error = await promise.then(
    () => null,
    (reason: unknown) => reason
  )
  expect(error).toBeInstanceOf(StudentLoginError)
  expect((error as StudentLoginError).code).toBe(code)
  return error as StudentLoginError
}

beforeAll(async () => {
  const slug = `lp-${suffix}`
  const school = await admin.school.create({
    data: { slug, name: "SD Login Pin", level: "SD" },
  })
  schoolId = school.id
  host = `${slug}.localhost:3000`

  const ani = await createStudent("7001", "Ani")
  const budi = await createStudent("7002", "Budi")
  aniPin = (await issueStudentPin(schoolId, ACTOR, ani.id)).pin
  budiPin = (await issueStudentPin(schoolId, ACTOR, budi.id)).pin
  const cici = await createStudent("7003", "Cici")
  ciciPin = (await issueStudentPin(schoolId, ACTOR, cici.id)).pin
  const dedi = await createStudent("7004", "Dedi")
  await issueStudentPin(schoolId, ACTOR, dedi.id)
})

afterAll(async () => {
  await prisma.rateLimit.deleteMany({ where: { key: { contains: suffix } } })
  await prisma.rateLimit.deleteMany({ where: { key: { contains: schoolId } } })
  await admin.school.deleteMany({ where: { id: schoolId } })
  await admin.user.deleteMany({
    where: { email: { endsWith: `-${suffix}@sekolah.invalid` } },
  })
  await admin.$disconnect()
})

describe("loginWithStudentPin", () => {
  it("PIN benar mengembalikan userId", async () => {
    const result = await loginWithStudentPin({
      host,
      ip: ip("ok"),
      nis: "7001",
      pin: aniPin,
    })
    expect(result.userId).toBeTruthy()
  })

  it("semua sebab gagal memberi pesan yang sama", async () => {
    const messages = new Set<string>()
    const attempts = [
      { host, nis: "7001", pin: "100000" }, // PIN salah
      { host, nis: "9999", pin: aniPin }, // NIS tidak ada
      { host: "localhost:3000", nis: "7001", pin: aniPin }, // bukan host sekolah
      { host: `tidak-ada-${suffix}.localhost:3000`, nis: "7001", pin: aniPin },
    ]
    for (const [index, attempt] of attempts.entries()) {
      const error = await expectLoginError(
        loginWithStudentPin({ ...attempt, ip: ip(`msg${index}`) }),
        "INVALID"
      )
      messages.add(error.message)
    }
    expect([...messages]).toEqual([INVALID_LOGIN_MESSAGE])
  })

  it("setelah 5 kegagalan NIS+IP, PIN benar pun ditolak; IP lain tetap bisa masuk", async () => {
    const attacker = ip("brute")
    for (let i = 0; i < STUDENT_LOGIN_LIMITS.perNisIp.limit; i++) {
      await expectLoginError(
        loginWithStudentPin({ host, ip: attacker, nis: "7002", pin: "100000" }),
        "INVALID"
      )
    }
    const locked = await expectLoginError(
      loginWithStudentPin({ host, ip: attacker, nis: "7002", pin: budiPin }),
      "RATE_LIMITED"
    )
    expect(locked.retryAfterSeconds).toBeGreaterThan(0)

    // Siswa lain dari IP yang sama tidak terkunci oleh batas NIS+IP.
    const other = await loginWithStudentPin({
      host,
      ip: attacker,
      nis: "7001",
      pin: aniPin,
    })
    expect(other.userId).toBeTruthy()

    // Pemilik akun dari IP lain tetap bisa masuk.
    const owner = await loginWithStudentPin({
      host,
      ip: ip("owner"),
      nis: "7002",
      pin: budiPin,
    })
    expect(owner.userId).toBeTruthy()
  })

  it("login berhasil tidak menambah hitungan", async () => {
    const same = ip("repeat")
    for (let i = 0; i < STUDENT_LOGIN_LIMITS.perNisIp.limit + 3; i++) {
      await loginWithStudentPin({ host, ip: same, nis: "7001", pin: aniPin })
    }
  })

  it("batas per IP: 60 kegagalan di berbagai NIS mengunci IP itu", async () => {
    const noisy = ip("noisy")
    for (let i = 0; i < STUDENT_LOGIN_LIMITS.perIp.limit; i++) {
      await consumeRateLimit(STUDENT_LOGIN_LIMITS.perIp, noisy)
    }
    await expectLoginError(
      loginWithStudentPin({ host, ip: noisy, nis: "7001", pin: aniPin }),
      "RATE_LIMITED"
    )
  })

  it("batas per NIS: 20 kegagalan dari berbagai IP mengunci NIS itu untuk semua IP", async () => {
    for (let i = 0; i < STUDENT_LOGIN_LIMITS.perNis.limit; i++) {
      await consumeRateLimit(STUDENT_LOGIN_LIMITS.perNis, `${schoolId}:7003`)
    }
    await expectLoginError(
      loginWithStudentPin({
        host,
        ip: ip("fresh"),
        nis: "7003",
        pin: ciciPin,
      }),
      "RATE_LIMITED"
    )
  })

  it("30 percobaan salah paralel: tepat 5 diverifikasi, 25 ditolak batas laju", async () => {
    const parallelIp = ip("parallel")
    const results = await Promise.allSettled(
      Array.from({ length: 30 }, () =>
        loginWithStudentPin({
          host,
          ip: parallelIp,
          nis: "7004",
          pin: "100000",
        })
      )
    )
    const codes = results.map((result) => {
      expect(result.status).toBe("rejected")
      const reason = (result as PromiseRejectedResult).reason
      expect(reason).toBeInstanceOf(StudentLoginError)
      return (reason as StudentLoginError).code
    })
    expect(codes.filter((code) => code === "INVALID")).toHaveLength(
      STUDENT_LOGIN_LIMITS.perNisIp.limit
    )
    expect(codes.filter((code) => code === "RATE_LIMITED")).toHaveLength(
      30 - STUDENT_LOGIN_LIMITS.perNisIp.limit
    )

    // Permintaan yang ditolak dikembalikan, jadi hitungan berhenti di batas.
    const row = await prisma.rateLimit.findUniqueOrThrow({
      where: {
        key: `${STUDENT_LOGIN_LIMITS.perNisIp.bucket}:${schoolId}:7004:${parallelIp}`,
      },
    })
    expect(row.count).toBe(STUDENT_LOGIN_LIMITS.perNisIp.limit)
  })
})
