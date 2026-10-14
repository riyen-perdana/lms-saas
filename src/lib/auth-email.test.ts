// @vitest-environment node
// Test integrasi alur email Better Auth: reset sandi dan verifikasi email (US-02).

import { randomUUID } from "node:crypto"

import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { prisma } from "@/db/client"
import { auth } from "@/lib/auth"
import { clearMemoryOutbox, getMemoryOutbox } from "@/lib/email"

const suffix = randomUUID().slice(0, 8)
const email = `email-${suffix}@sekolah.test`
const oldPassword = "sandi-lama-12345"
const newPassword = "sandi-baru-67890"
const headers = () => new Headers({ host: "sekolah-a.localhost:3000" })
const redirectTo = "http://sekolah-a.localhost:3000/atur-ulang-sandi"

/** Email dikirim tanpa di-await (anti-enumerasi), jadi tunggu sampai tiba. */
async function waitForEmail(to: string) {
  for (let i = 0; i < 50; i++) {
    const found = getMemoryOutbox().find((message) => message.to === to)
    if (found) return found
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  throw new Error(`Email untuk ${to} tidak tiba`)
}

beforeEach(() => clearMemoryOutbox())

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email } })
  await prisma.$disconnect()
})

describe("verifikasi email", () => {
  it("mengirim tautan, lalu menandai email terverifikasi", async () => {
    await auth.api.signUpEmail({
      body: { email, password: oldPassword, name: "Guru Email" },
      headers: headers(),
    })
    clearMemoryOutbox()

    await auth.api.sendVerificationEmail({
      body: { email, callbackURL: redirectTo },
      headers: headers(),
    })
    const message = await waitForEmail(email)

    expect(message.subject).toContain("Verifikasi")
    const url = new URL(/https?:\/\/\S+/.exec(message.text)?.[0] ?? "")
    const token = url.searchParams.get("token")
    expect(token).toBeTruthy()

    await auth.api.verifyEmail({
      query: { token: token ?? "" },
      headers: headers(),
    })

    const user = await prisma.user.findUniqueOrThrow({ where: { email } })
    expect(user.emailVerified).toBe(true)
  })
})

describe("reset sandi", () => {
  it("email untuk akun yang tidak ada tidak dikirim dan tidak error (anti-enumerasi)", async () => {
    const result = await auth.api.requestPasswordReset({
      body: { email: `tidak-ada-${suffix}@sekolah.test`, redirectTo },
      headers: headers(),
    })

    expect(result.status).toBe(true)
    await new Promise((resolve) => setTimeout(resolve, 150))
    expect(getMemoryOutbox()).toHaveLength(0)
  })

  it("mengganti sandi lewat tautan, mencabut sesi lama, dan sandi lama tak berlaku", async () => {
    const login = await auth.api.signInEmail({
      body: { email, password: oldPassword },
      headers: headers(),
    })
    expect(login.token).toBeTruthy()

    await auth.api.requestPasswordReset({
      body: { email, redirectTo },
      headers: headers(),
    })
    const message = await waitForEmail(email)

    expect(message.subject).toContain("Atur ulang")
    const link = /https?:\/\/\S+/.exec(message.text)?.[0] ?? ""
    const token = /\/reset-password\/([^/?]+)/.exec(link)?.[1]
    expect(token).toBeTruthy()

    await auth.api.resetPassword({
      body: { newPassword, token: token ?? "" },
      headers: headers(),
    })

    // Sesi sebelum reset sudah dicabut.
    const sessions = await prisma.session.findMany({
      where: { user: { email } },
    })
    expect(sessions).toHaveLength(0)

    await expect(
      auth.api.signInEmail({
        body: { email, password: oldPassword },
        headers: headers(),
      })
    ).rejects.toThrow()
    const fresh = await auth.api.signInEmail({
      body: { email, password: newPassword },
      headers: headers(),
    })
    expect(fresh.token).toBeTruthy()
  })

  it("token reset hanya bisa dipakai sekali", async () => {
    await auth.api.requestPasswordReset({
      body: { email, redirectTo },
      headers: headers(),
    })
    const message = await waitForEmail(email)
    const token = /\/reset-password\/([^/?]+)/.exec(message.text)?.[1] ?? ""

    await auth.api.resetPassword({
      body: { newPassword: "sandi-ketiga-11111", token },
      headers: headers(),
    })

    await expect(
      auth.api.resetPassword({
        body: { newPassword: "sandi-keempat-22222", token },
        headers: headers(),
      })
    ).rejects.toThrow()
  })
})
