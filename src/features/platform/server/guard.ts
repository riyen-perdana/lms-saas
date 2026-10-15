// Penjaga akses Super Admin untuk server function (US-03: permission dicek di
// server, bukan hanya disembunyikan di UI). Dipasang sebagai middleware pada
// SETIAP server function platform.

import { createMiddleware } from "@tanstack/react-start"
import { getRequestHeaders } from "@tanstack/react-start/server"

import { isPlatformAdmin } from "@/features/platform/service"
import { auth } from "@/lib/auth"
import { parseHost } from "@/lib/tenant/host"

export const platformAdminMiddleware = createMiddleware({
  type: "function",
}).server(async ({ next }) => {
  const headers = getRequestHeaders()

  // Dashboard hanya hidup di host app.<domain>; di host lain selalu ditolak.
  const { area } = parseHost(
    headers.get("x-forwarded-host") ?? headers.get("host")
  )
  if (area !== "platform") {
    throw new Response("Tidak ditemukan", { status: 404 })
  }

  const session = await auth.api.getSession({ headers })
  if (!session) {
    throw new Response("Belum login", { status: 401 })
  }

  if (!(await isPlatformAdmin(session.user.id))) {
    throw new Response("Tidak punya akses", { status: 403 })
  }

  return next({
    context: {
      adminUserId: session.user.id,
      actor: { userId: session.user.id, role: "platform_admin" as const },
    },
  })
})
