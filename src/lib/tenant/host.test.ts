import { describe, expect, it } from "vitest"

import { isValidSlug, parseHost } from "@/lib/tenant/host"

describe("parseHost", () => {
  it("menandai apex dan www sebagai marketing", () => {
    expect(parseHost("edusaas.id")).toEqual({ area: "marketing", slug: null })
    expect(parseHost("www.edusaas.id")).toEqual({
      area: "marketing",
      slug: null,
    })
    expect(parseHost("localhost:3000")).toEqual({
      area: "marketing",
      slug: null,
    })
    expect(parseHost("127.0.0.1:3000")).toEqual({
      area: "marketing",
      slug: null,
    })
    expect(parseHost("[::1]:3000")).toEqual({ area: "marketing", slug: null })
  })

  it("menandai app sebagai platform", () => {
    expect(parseHost("app.edusaas.id")).toEqual({
      area: "platform",
      slug: null,
    })
    expect(parseHost("app.localhost:3000")).toEqual({
      area: "platform",
      slug: null,
    })
  })

  it("mengambil slug sekolah dari subdomain", () => {
    expect(parseHost("man3pku.edusaas.id")).toEqual({
      area: "school",
      slug: "man3pku",
    })
    expect(parseHost("man3pku.localhost:3000")).toEqual({
      area: "school",
      slug: "man3pku",
    })
  })

  it("menormalkan huruf besar, spasi, port, dan titik akhir", () => {
    expect(parseHost("  MAN3PKU.Localhost:3000. ")).toEqual({
      area: "school",
      slug: "man3pku",
    })
  })

  it("menolak slug terlarang dan format tidak valid", () => {
    expect(parseHost("api.edusaas.id")).toEqual({ area: "invalid", slug: null })
    expect(parseHost("admin.edusaas.id")).toEqual({
      area: "invalid",
      slug: null,
    })
    expect(parseHost("-salah-.edusaas.id")).toEqual({
      area: "invalid",
      slug: null,
    })
  })

  it("menolak host kosong", () => {
    expect(parseHost(null)).toEqual({ area: "invalid", slug: null })
    expect(parseHost("")).toEqual({ area: "invalid", slug: null })
  })
})

describe("isValidSlug", () => {
  it("menerima slug yang wajar", () => {
    expect(isValidSlug("man3pku")).toBe(true)
    expect(isValidSlug("smpn-1-bandung")).toBe(true)
    expect(isValidSlug("a1")).toBe(true)
  })

  it("menolak kata terlarang dan format buruk", () => {
    expect(isValidSlug("www")).toBe(false)
    expect(isValidSlug("app")).toBe(false)
    expect(isValidSlug("api")).toBe(false)
    expect(isValidSlug("admin")).toBe(false)
    expect(isValidSlug("-depan")).toBe(false)
    expect(isValidSlug("belakang-")).toBe(false)
    expect(isValidSlug("ada spasi")).toBe(false)
    expect(isValidSlug("")).toBe(false)
  })

  it("menolak slug lebih dari 63 karakter", () => {
    expect(isValidSlug("a".repeat(63))).toBe(true)
    expect(isValidSlug("a".repeat(64))).toBe(false)
  })
})
