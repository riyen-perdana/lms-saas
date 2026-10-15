// Penjaga akses admin sekolah untuk route API unduhan berkas (OB-02).
// ---------------------------------------------------------------------------
// Route API memakai penangan biasa (bukan server function), jadi middleware
// `schoolAdminMiddleware` tidak tersedia. Pemeriksaan di sini sengaja
// menyalin sarinya: tenant dari host, sekolah tidak ditangguhkan, sesi login,
// lalu peran school_admin. Host tetap satu-satunya sumber sekolah — parameter
// tidak pernah menentukan sekolah mana.

import { isSchoolBlocked } from "@/features/auth/policy"
import { getSchoolAccess } from "@/features/auth/service"
import { auth } from "@/lib/auth"
import { resolveTenant } from "@/lib/tenant/resolve"

export async function requireSchoolAdminForDownload(request: Request): Promise<{
  schoolId: string
}> {
  const host =
    request.headers.get("x-forwarded-host") ??
    request.headers.get("host") ??
    new URL(request.url).host

  const tenant = await resolveTenant(host)
  if (tenant.area !== "school" || !tenant.school) {
    throw new Response("Tidak ditemukan", { status: 404 })
  }
  if (isSchoolBlocked(tenant.school.status) || tenant.school.status === "readonly") {
    throw new Response("Sekolah tidak dapat diubah", { status: 403 })
  }

  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) throw new Response("Belum login", { status: 401 })

  const access = await getSchoolAccess(tenant.school.id, session.user.id)
  if (access?.role !== "school_admin") throw new Response("Tidak punya akses", { status: 403 })

  return { schoolId: tenant.school.id }
}