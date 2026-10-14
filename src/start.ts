// Entry Start: middleware global (PRD §5.2 "Resolusi tenant").
// ---------------------------------------------------------------------------
// Tiap request — halaman maupun server function — lebih dulu dipecah jadi
// area (marketing / platform / school) dan, untuk subdomain sekolah, cari
// schoolId. Hasilnya ditaruh di `context` sehingga route, server function,
// dan service layer bisa membacanya tanpa mengulangi parsing header.

import { createMiddleware, createStart } from "@tanstack/react-start"

import { resolveTenant } from "@/lib/tenant/resolve"

export const tenantMiddleware = createMiddleware({ type: "request" }).server(
  async ({ request, next }) => {
    const host =
      request.headers.get("x-forwarded-host") ??
      request.headers.get("host") ??
      new URL(request.url).host

    const tenant = await resolveTenant(host)

    return next({ context: { tenant } })
  }
)

export const startInstance = createStart(() => ({
  requestMiddleware: [tenantMiddleware],
}))
