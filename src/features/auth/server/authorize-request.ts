// Helper server-only untuk penjaga peran (US-03): mengambil host + sesi dari
// request lalu memanggil authorizeSchoolRequest. Dipakai middleware per peran
// (school-admin.ts, school-parent.ts) dan route API.
//
// Middleware HARUS dideklarasikan top-level (`createMiddleware().server()`),
// bukan dibuat di dalam fungsi pabrik: compiler TanStack hanya membuang kode
// server dari bundel klien untuk bentuk top-level.

import {
  authorizeSchoolRequest,
  denial,
  type AuthorizeOptions,
} from "@/features/auth/authorize"
import { auth } from "@/lib/auth"
import { resolveTenant } from "@/lib/tenant/resolve"

export async function authorizeHeaders(
  headers: Headers,
  options: AuthorizeOptions
) {
  const tenant = await resolveTenant(
    headers.get("x-forwarded-host") ?? headers.get("host") ?? ""
  )
  const session = await auth.api.getSession({ headers })
  const result = await authorizeSchoolRequest(
    tenant,
    session?.user.id ?? null,
    options
  )
  if (!result.ok) throw denial(result)
  return result
}

/** Untuk route API (penangan biasa, bukan server function). */
export async function requireSchoolRoleForRequest(
  request: Request,
  roles: AuthorizeOptions["roles"],
  options: Omit<AuthorizeOptions, "roles"> = {}
): Promise<{ schoolId: string; userId: string }> {
  const headers = new Headers(request.headers)
  if (!headers.get("host")) headers.set("host", new URL(request.url).host)
  const { schoolId, userId } = await authorizeHeaders(headers, {
    roles,
    ...options,
  })
  return { schoolId, userId }
}
