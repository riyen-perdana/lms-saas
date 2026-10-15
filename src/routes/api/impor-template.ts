// Unduh template Excel untuk impor guru/siswa (OB-02).
// Host menentukan sekolah; `jenis` hanya memilih kolom template.

import { createFileRoute } from "@tanstack/react-router"
import { z } from "zod"

import { buildTemplate } from "@/features/people-import/excel"
import { requireSchoolRoleForRequest } from "@/features/auth/server/authorize-request"
import { IMPORT_KIND_LABELS, XLSX_CONTENT_TYPE } from "@/features/people-import/schema"

const querySchema = z.object({ jenis: z.enum(["teachers", "students"]) })

export const Route = createFileRoute("/api/impor-template")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        await requireSchoolRoleForRequest(request, ["school_admin"])

        const parsed = querySchema.safeParse({
          jenis: new URL(request.url).searchParams.get("jenis"),
        })
        if (!parsed.success) return new Response("Jenis tidak valid", { status: 400 })

        const body = await buildTemplate(parsed.data.jenis)
        const fileName = `template-impor-${IMPORT_KIND_LABELS[parsed.data.jenis]}.xlsx`

        return new Response(new Uint8Array(body), {
          headers: {
            "content-type": XLSX_CONTENT_TYPE,
            "content-disposition": `attachment; filename="${fileName}"`,
            "cache-control": "no-store",
            "x-content-type-options": "nosniff",
          },
        })
      },
    },
  },
})