// Endpoint diagnostik resolusi tenant — dipakai saat development untuk
// memastikan subdomain diarahkan ke sekolah yang benar:
//   curl localhost:3000/api/tenant
//   curl man3pku.localhost:3000/api/tenant
//   curl app.localhost:3000/api/tenant

import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/api/tenant")({
  server: {
    handlers: {
      GET: async ({ context }) => {
        // Diagnostik development saja; di produksi tidak boleh membuka data tenant.
        if (process.env.NODE_ENV === "production") {
          return new Response("Tidak ditemukan", { status: 404 })
        }
        const { tenant } = context as { tenant: unknown }

        return Response.json(tenant)
      },
    },
  },
})
