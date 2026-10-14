// @vitest-environment node
// Resolusi tenant butuh database sungguhan: seed harus sudah jalan (`pnpm db:seed`).

import { randomUUID } from "node:crypto"

import { beforeEach, describe, expect, it } from "vitest"

import { prisma } from "@/db/client"
import {
  clearTenantCache,
  resolveSchoolBySlug,
  resolveTenant,
} from "@/lib/tenant/resolve"

beforeEach(() => {
  clearTenantCache()
})

describe("resolveSchoolBySlug", () => {
  it("menemukan sekolah hasil seed", async () => {
    const school = await resolveSchoolBySlug("man3pku")

    expect(school?.slug).toBe("man3pku")
    expect(school?.name).toBe("MAN 3 Pekanbaru")
    expect(school?.level).toBe("MA")
    expect(school?.status).toBe("active")
  })

  it("mengembalikan null untuk slug yang tidak terdaftar", async () => {
    expect(await resolveSchoolBySlug("tidak-ada-sekolah-ini")).toBeNull()
  })
})

describe("resolveTenant", () => {
  it("menyertakan sekolah untuk subdomain sekolah", async () => {
    const tenant = await resolveTenant("man3pku.localhost:3000")

    expect(tenant.area).toBe("school")
    expect(tenant.school?.id).toBeTruthy()
  })

  it("area marketing dan platform tidak punya sekolah", async () => {
    expect(await resolveTenant("localhost:3000")).toEqual({
      area: "marketing",
      slug: null,
      school: null,
    })
    expect(await resolveTenant("app.localhost:3000")).toEqual({
      area: "platform",
      slug: null,
      school: null,
    })
  })

  it("subdomain sekolah yang tidak terdaftar tetap area school tanpa data", async () => {
    const tenant = await resolveTenant("hantu.localhost:3000")

    expect(tenant.area).toBe("school")
    expect(tenant.slug).toBe("hantu")
    expect(tenant.school).toBeNull()
  })

  it("dua subdomain sekolah tidak saling membaca sekolahnya", async () => {
    const [a, b] = await Promise.all([
      resolveTenant("man3pku.localhost:3000"),
      resolveTenant("sekolahdemo.localhost:3000"),
    ])

    expect(a.school?.slug).toBe("man3pku")
    expect(b.school?.slug).toBe("sekolahdemo")
    expect(a.school?.id).not.toBe(b.school?.id)
  })

  it("menyimpan hasil negatif di cache sampai dibersihkan", async () => {
    const slug = `uji-cache-${randomUUID().slice(0, 8)}`

    expect(await resolveSchoolBySlug(slug)).toBeNull()

    await prisma.school.create({
      data: { slug, name: "Sekolah Uji Cache", level: "SMA" },
    })

    try {
      expect(await resolveSchoolBySlug(slug)).toBeNull()

      clearTenantCache()

      expect((await resolveSchoolBySlug(slug))?.slug).toBe(slug)
    } finally {
      await prisma.school.delete({ where: { slug } })
    }
  })
})
