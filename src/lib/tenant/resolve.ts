// Penyelesaian slug subdomain -> record sekolah (PRD §5.2).
// ---------------------------------------------------------------------------
// Ini satu-satunya tempat memetakan subdomain ke schoolId. `schools` adalah
// model global, jadi memang dibaca lewat `prisma` biasa, bukan tenantDb().
//
// Hasil disimpan di cache memory singkat supaya tiap request tidak menembus
// database. Cache hanya berisi data sekolah yang memang sudah publik di
// subdomainnya, jadi tidak menjadi jalur kebocoran antar tenant.

import { prisma } from "@/db/client"
import type { $Enums } from "@/generated/prisma/client"

import { parseHost, type TenantArea } from "@/lib/tenant/host"

export interface TenantSchool {
  id: string
  slug: string
  name: string
  level: $Enums.SchoolLevel
  status: $Enums.SchoolStatus
  timezone: string
}

export interface ResolvedTenant {
  area: TenantArea
  slug: string | null
  school: TenantSchool | null
}

const CACHE_TTL_MS = 30_000

const cache = new Map<
  string,
  { expiresAt: number; value: TenantSchool | null }
>()

/** Dipakai test agar tidak bergantung pada cache request sebelumnya. */
export function clearTenantCache(): void {
  cache.clear()
}

/**
 * Membuang cache satu sekolah (atau semuanya) setelah statusnya berubah,
 * mis. penangguhan, agar berlaku seketika di proses ini. Pada deployment
 * multi-proses, proses lain baru melihatnya setelah TTL (30 detik).
 */
export function invalidateTenantCache(slug?: string): void {
  if (slug) cache.delete(slug)
  else cache.clear()
}

export async function resolveSchoolBySlug(
  slug: string
): Promise<TenantSchool | null> {
  const cached = cache.get(slug)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value
  }

  const school = await prisma.school.findFirst({
    where: { slug, deletedAt: null },
    select: {
      id: true,
      slug: true,
      name: true,
      level: true,
      status: true,
      timezone: true,
    },
  })

  cache.set(slug, { expiresAt: Date.now() + CACHE_TTL_MS, value: school })

  return school
}

export async function resolveTenant(
  host: string | null | undefined
): Promise<ResolvedTenant> {
  const { area, slug } = parseHost(host)

  if (area !== "school" || slug === null) {
    return { area, slug, school: null }
  }

  return { area, slug, school: await resolveSchoolBySlug(slug) }
}
