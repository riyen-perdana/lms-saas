// Keputusan izin tingkat sekolah (US-03): satu-satunya tempat yang memutuskan
// "boleh atau tidak" untuk server function, route API, dan middleware.
// ---------------------------------------------------------------------------
// Fungsi murni terhadap input yang sudah diambil (tenant dari host, id user
// dari sesi), sehingga bisa diuji tanpa HTTP. Pengambilan host dan sesi ada di
// server/school-role.ts.
//
// Aturan:
//   - Host harus host sekolah (bukan landing atau platform).
//   - Sekolah `suspended` ditutup total; `readonly` hanya boleh membaca.
//   - Wajib login dan punya keanggotaan aktif di sekolah ITU dengan salah satu
//     peran yang diizinkan. Peran di sekolah lain tidak berlaku.

import { isSchoolBlocked } from "@/features/auth/policy"
import { getSchoolAccess } from "@/features/auth/service"
import type { $Enums } from "@/generated/prisma/client"
import type { ResolvedTenant } from "@/lib/tenant/resolve"

export type SchoolRole = $Enums.MembershipRole

export interface AuthorizeOptions {
  roles: readonly SchoolRole[]
  /** Izinkan sekolah mode hanya-baca (untuk fungsi yang tidak menulis). */
  allowReadonly?: boolean
}

export type AuthorizeResult =
  | { ok: true; schoolId: string; userId: string; role: SchoolRole }
  | { ok: false; status: 401 | 403 | 404; message: string }

export async function authorizeSchoolRequest(
  tenant: ResolvedTenant,
  userId: string | null,
  options: AuthorizeOptions
): Promise<AuthorizeResult> {
  if (tenant.area !== "school" || !tenant.school) {
    return { ok: false, status: 404, message: "Tidak ditemukan" }
  }
  const { school } = tenant

  if (isSchoolBlocked(school.status)) {
    return { ok: false, status: 403, message: "Sekolah tidak dapat diakses" }
  }
  if (school.status === "readonly" && !options.allowReadonly) {
    return { ok: false, status: 403, message: "Sekolah tidak dapat diubah" }
  }

  if (!userId) return { ok: false, status: 401, message: "Belum login" }

  const access = await getSchoolAccess(school.id, userId)
  if (!access || !options.roles.includes(access.role)) {
    return { ok: false, status: 403, message: "Tidak punya akses" }
  }

  return { ok: true, schoolId: school.id, userId, role: access.role }
}

/** Ubah keputusan menolak menjadi Response untuk dilempar handler/middleware. */
export function denial(
  result: Extract<AuthorizeResult, { ok: false }>
): Response {
  return new Response(result.message, { status: result.status })
}
