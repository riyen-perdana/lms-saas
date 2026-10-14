// SEO halaman marketing (LP-06): meta Open Graph/Twitter, sitemap, robots.

import { parseHost } from "@/lib/tenant/host"

/** Halaman publik marketing yang masuk sitemap. */
export const SITEMAP_PATHS = ["/", "/harga", "/daftar", "/kontak", "/privasi", "/syarat"]

/** Meta standar halaman publik: title, description, Open Graph, Twitter. */
export function seoMeta(input: { title: string; description: string }) {
  return [
    { title: input.title },
    { name: "description", content: input.description },
    { property: "og:title", content: input.title },
    { property: "og:description", content: input.description },
    { property: "og:type", content: "website" },
    { property: "og:site_name", content: "EduSaaS" },
    { property: "og:locale", content: "id_ID" },
    { name: "twitter:card", content: "summary" },
    { name: "twitter:title", content: input.title },
    { name: "twitter:description", content: input.description },
  ]
}

/** Halaman yang tidak boleh diindeks (login, reset sandi). */
export const NOINDEX_META = [{ name: "robots", content: "noindex" }]

/** Origin request, memperhitungkan proxy (x-forwarded-proto/host). */
export function requestOrigin(request: Request): string {
  const url = new URL(request.url)
  const proto = request.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "")
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? url.host

  return `${proto}://${host}`
}

/** Hanya host marketing yang boleh diindeks; sekolah dan platform tidak. */
export function isMarketingHost(host: string | null): boolean {
  return parseHost(host).area === "marketing"
}

export function buildSitemap(origin: string, paths: readonly string[] = SITEMAP_PATHS): string {
  const urls = paths
    .map((path) => `  <url><loc>${origin}${path === "/" ? "" : path}</loc></url>`)
    .join("\n")

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`
}

export function buildRobots(origin: string, indexable: boolean): string {
  if (!indexable) return "User-agent: *\nDisallow: /\n"

  return `User-agent: *\nDisallow: /api/\nDisallow: /login\nDisallow: /lupa-sandi\nDisallow: /atur-ulang-sandi\n\nSitemap: ${origin}/sitemap.xml\n`
}
