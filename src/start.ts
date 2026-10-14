// Entry Start: middleware global (PRD §5.2 "Resolusi tenant").
// ---------------------------------------------------------------------------
// Tiap request — halaman maupun server function — lebih dulu dipecah jadi
// area (marketing / platform / school) dan, untuk subdomain sekolah, cari
// schoolId. Hasilnya ditaruh di `context` sehingga route, server function,
// dan service layer bisa membacanya tanpa mengulangi parsing header.

import {
  createCsrfMiddleware,
  createMiddleware,
  createStart,
} from "@tanstack/react-start"

import { ensureJobsStarted } from "@/lib/jobs"
import { resolveTenant } from "@/lib/tenant/resolve"

export const tenantMiddleware = createMiddleware({ type: "request" }).server(
  async ({ request, next }) => {
    const host =
      request.headers.get("x-forwarded-host") ??
      request.headers.get("host") ??
      new URL(request.url).host

    // Memulai antrean job (email, kedaluwarsa langganan) sekali per proses.
    ensureJobsStarted()

    const tenant = await resolveTenant(host)

    return next({ context: { tenant } })
  }
)

// Server function adalah RPC same-origin; tolak permintaan lintas situs.
const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn",
})

export const startInstance = createStart(() => ({
  requestMiddleware: [csrfMiddleware, tenantMiddleware],
}))
