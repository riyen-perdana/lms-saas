// @vitest-environment node
// Test integrasi Better Auth (gate F0: login di 2 subdomain tidak saling bocor).
//
// Memakai PostgreSQL lokal sungguhan lewat `auth.handler`, tanpa mock.

import { randomUUID } from "node:crypto"

import { afterAll, describe, expect, it } from "vitest"

import { prisma } from "@/db/client"
import { auth } from "@/lib/auth"
import { isUuidV7 } from "@/lib/uuid"

const suffix = randomUUID().slice(0, 8)
const email = `auth-${suffix}@sekolah.test`
const password = "sandi-uji-12345"

const HOST_A = "http://sekolah-a.localhost:3000"
const HOST_B = "http://sekolah-b.localhost:3000"

function post(origin: string, path: string, body: unknown, cookie?: string) {
  return auth.handler(
    new Request(`${origin}/api/auth${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin,
        ...(cookie ? { cookie } : {}),
      },
      body: JSON.stringify(body),
    })
  )
}

/** Ambil pasangan "nama=nilai" dari header Set-Cookie untuk dikirim balik. */
function cookieHeader(response: Response): string {
  return response.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ")
}

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email } })
  await prisma.$disconnect()
})

describe("Better Auth", () => {
  it("mendaftar dengan email + password dan menyimpan id UUID v7", async () => {
    const res = await post(HOST_A, "/sign-up/email", {
      email,
      password,
      name: "Guru Uji",
    })

    expect(res.status).toBe(200)

    const user = await prisma.user.findUniqueOrThrow({
      where: { email },
      include: { accounts: true },
    })

    expect(isUuidV7(user.id)).toBe(true)
    expect(user.accounts).toHaveLength(1)
    expect(user.accounts[0].providerId).toBe("credential")
    // Yang disimpan hash, bukan sandi asli.
    expect(user.accounts[0].password).not.toBe(password)
  })

  it("menolak login dengan sandi salah", async () => {
    const res = await post(HOST_A, "/sign-in/email", {
      email,
      password: "sandi-salah-99999",
    })

    expect(res.status).toBe(401)
    expect(res.headers.getSetCookie()).toHaveLength(0)
  })

  it("cookie sesi host-only: tanpa atribut Domain, tak berlaku antar subdomain", async () => {
    const a = await post(HOST_A, "/sign-in/email", { email, password })
    const b = await post(HOST_B, "/sign-in/email", { email, password })

    expect(a.status).toBe(200)
    expect(b.status).toBe(200)

    for (const res of [a, b]) {
      const cookies = res.headers.getSetCookie()
      expect(cookies.length).toBeGreaterThan(0)

      for (const cookie of cookies) {
        expect(cookie.toLowerCase()).not.toMatch(/;\s*domain=/)
      }
    }
  })

  it("sesi tercatat per login dan dapat dibaca lewat cookie", async () => {
    const login = await post(HOST_A, "/sign-in/email", { email, password })
    const cookie = cookieHeader(login)

    const session = await auth.api.getSession({
      headers: new Headers({ cookie, host: "sekolah-a.localhost:3000" }),
    })

    expect(session?.user.email).toBe(email)
    expect(isUuidV7(session?.session.id ?? "")).toBe(true)

    const tanpaCookie = await auth.api.getSession({ headers: new Headers({ host: "sekolah-a.localhost:3000" }) })
    expect(tanpaCookie).toBeNull()
  })

  it("menolak host di luar allowlist", async () => {
    const res = await post("http://jahat.example.com", "/sign-in/email", {
      email,
      password,
    }).catch((error: unknown) => error)

    // Bisa berupa respons error atau exception; yang penting bukan sukses.
    if (res instanceof Response) {
      expect(res.ok).toBe(false)
    } else {
      expect(res).toBeInstanceOf(Error)
    }
  })
})
