// Penjaga akses admin sekolah untuk server function (US-03: permission dicek
// di server). Dipasang sebagai middleware pada SETIAP server function yang
// mengubah data master sekolah.

import { createMiddleware } from "@tanstack/react-start"
import { getRequestHeaders } from "@tanstack/react-start/server"

import { isSchoolBlocked } from "@/features/auth/policy"
import { getSchoolAccess } from "@/features/auth/service"
import { auth } from "@/lib/auth"
import { resolveTenant } from "@/lib/tenant/resolve"

export const schoolAdminMiddleware = createMiddleware({
  type: "function",
}).server(async ({ next }) => {
  const headers = getRequestHeaders()
  const tenant = await resolveTenant(
    headers.get("x-forwarded-host") ?? headers.get("host") ?? ""
  )

  if (tenant.area !== "school" || !tenant.school) {
    throw new Response("Tidak ditemukan", { status: 404 })
  }
  // Sekolah ditangguhkan ditutup total; mode hanya-baca tidak boleh menulis.
  if (isSchoolBlocked(tenant.school.status) || tenant.school.status === "readonly") {
    throw new Response("Sekolah tidak dapat diubah", { status: 403 })
  }

  const session = await auth.api.getSession({ headers })
  if (!session) throw new Response("Belum login", { status: 401 })

  const access = await getSchoolAccess(tenant.school.id, session.user.id)
  if (access?.role !== "school_admin") {
    throw new Response("Tidak punya akses", { status: 403 })
  }

  return next({
    context: {
      schoolId: tenant.school.id,
      adminUserId: session.user.id,
      actor: { userId: session.user.id, role: "school_admin" as const },
    },
  })
})
