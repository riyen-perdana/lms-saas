import { describe, expect, it } from "vitest"

import {
  buildRobots,
  buildSitemap,
  isMarketingHost,
  requestOrigin,
  seoMeta,
} from "@/lib/seo"

describe("buildSitemap", () => {
  it("memuat URL absolut dan beranda tanpa garis miring ganda", () => {
    const xml = buildSitemap("https://edusaas.id", ["/", "/harga"])
    expect(xml).toContain("<loc>https://edusaas.id</loc>")
    expect(xml).toContain("<loc>https://edusaas.id/harga</loc>")
  })
})

describe("buildRobots", () => {
  it("host marketing: izinkan, larang area privat, tunjuk sitemap", () => {
    const txt = buildRobots("https://edusaas.id", true)
    expect(txt).toContain("Disallow: /login")
    expect(txt).toContain("Sitemap: https://edusaas.id/sitemap.xml")
  })

  it("host lain: larang semuanya", () => {
    expect(buildRobots("https://x.edusaas.id", false)).toBe(
      "User-agent: *\nDisallow: /\n"
    )
  })
})

describe("isMarketingHost", () => {
  it("hanya host marketing", () => {
    expect(isMarketingHost("localhost:3000")).toBe(true)
    expect(isMarketingHost("man3pku.localhost:3000")).toBe(false)
    expect(isMarketingHost("app.localhost:3000")).toBe(false)
  })
})

describe("requestOrigin", () => {
  it("memakai header proxy bila ada", () => {
    const request = new Request("http://internal:3000/x", {
      headers: { "x-forwarded-proto": "https", "x-forwarded-host": "edusaas.id" },
    })
    expect(requestOrigin(request)).toBe("https://edusaas.id")
  })
})

describe("seoMeta", () => {
  it("menyertakan Open Graph dan deskripsi", () => {
    const meta = seoMeta({ title: "T", description: "D" })
    expect(meta).toContainEqual({ property: "og:title", content: "T" })
    expect(meta).toContainEqual({ name: "description", content: "D" })
  })
})
