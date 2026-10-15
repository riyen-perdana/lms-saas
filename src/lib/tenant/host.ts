// Pemetaan host -> tenant (PRD §5.2 "Resolusi tenant").
// ---------------------------------------------------------------------------
// Fungsi murni tanpa akses database, supaya aturannya mudah diuji:
//
//   localhost:3000 / www.edusaas.id / edusaas.id  -> marketing
//   app.localhost:3000 / app.edusaas.id           -> platform (Super Admin)
//   man3pku.localhost:3000 / man3pku.edusaas.id  -> school, slug "man3pku"
//   subdomain tak dikenal / terlarang              -> invalid (404)

export const RESERVED_SLUGS = ["www", "app", "api", "admin"] as const

export type TenantArea = "marketing" | "platform" | "school" | "invalid"

export interface HostTenant {
  area: TenantArea
  slug: string | null
}

const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/

const IPV4_PATTERN = /^\d{1,3}(?:\.\d{1,3}){3}$/

export function isReservedSlug(slug: string): boolean {
  return (RESERVED_SLUGS as readonly string[]).includes(slug)
}

/** Format slug subdomain yang boleh dipakai sekolah (LP-04). */
export function isValidSlug(slug: string): boolean {
  return SLUG_PATTERN.test(slug) && !isReservedSlug(slug)
}

export function parseHost(host: string | null | undefined): HostTenant {
  const cleaned = (host ?? "")
    .trim()
    .toLowerCase()
    .replace(/\.+$/, "")
    .replace(/:\d+$/, "")
    .replace(/\.+$/, "")

  if (!cleaned) {
    return { area: "invalid", slug: null }
  }

  if (IPV4_PATTERN.test(cleaned) || cleaned.includes("[")) {
    return { area: "marketing", slug: null }
  }

  const labels = cleaned.split(".")
  const isLocalDev = labels[labels.length - 1] === "localhost"

  if (labels.length < 2 || (!isLocalDev && labels.length < 3)) {
    return { area: "marketing", slug: null }
  }

  const subdomain = labels[0]

  if (subdomain === "app") {
    return { area: "platform", slug: null }
  }

  if (subdomain === "www") {
    return { area: "marketing", slug: null }
  }

  if (!SLUG_PATTERN.test(subdomain) || isReservedSlug(subdomain)) {
    return { area: "invalid", slug: null }
  }

  return { area: "school", slug: subdomain }
}

/**
 * URL dasar subdomain sekolah dari host request saat ini, mis.
 *   localhost:3000 + "man3pku"  -> http://man3pku.localhost:3000
 *   www.edusaas.id + "man3pku"  -> https://man3pku.edusaas.id
 * Dipakai setelah pendaftaran untuk mengarahkan admin ke subdomain barunya.
 */
export function schoolBaseUrl(
  host: string | null | undefined,
  slug: string
): string {
  const cleaned = (host ?? "").trim().toLowerCase()
  const hostname = cleaned.replace(/:\d+$/, "")
  const isLocalDev = hostname === "localhost" || hostname.endsWith(".localhost")
  const root = cleaned.replace(/^(www|app)\./, "")

  return `${isLocalDev ? "http" : "https"}://${slug}.${root}`
}

/** Host publik sebuah sekolah, dipakai untuk membangun tautan di email. */
export function schoolHost(slug: string): string {
  const domain = process.env.APP_DOMAIN
  return domain ? `${slug}.${domain}` : `${slug}.localhost:3000`
}
