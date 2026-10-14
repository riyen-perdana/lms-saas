// Logo sekolah untuk host yang sedang dibuka (publik, tanpa login): dipakai
// wizard setup dan halaman sekolah. Sekolah ditentukan dari host, bukan dari
// parameter, sehingga tidak bisa dipakai membaca logo sekolah lain.

import { createFileRoute } from "@tanstack/react-router"

import { getLogo } from "@/features/school-setup/service"

export const Route = createFileRoute("/api/logo")({
  server: {
    handlers: {
      GET: async ({ context }) => {
        const { tenant } = context as {
          tenant: { area: string; school: { id: string } | null }
        }
        if (tenant.area !== "school" || !tenant.school) {
          return new Response("Tidak ditemukan", { status: 404 })
        }

        const logo = await getLogo(tenant.school.id)
        if (!logo) return new Response("Tidak ditemukan", { status: 404 })

        return new Response(new Uint8Array(logo.body), {
          headers: {
            "content-type": logo.contentType,
            "cache-control": "public, max-age=300",
            "x-content-type-options": "nosniff",
          },
        })
      },
    },
  },
})
