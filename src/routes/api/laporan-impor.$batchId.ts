// Unduh laporan error impor dalam format .xlsx (OB-02).
// Batch dicari lewat tenantDb(schoolId) sehingga batch sekolah lain tidak
// terlihat, walau sempat ditebak id-nya.

import { createFileRoute } from "@tanstack/react-router"

import { PeopleImportError, getImportErrorReport } from "@/features/people-import/service"
import { requireSchoolAdminForDownload } from "@/features/people-import/server/require-admin"
import { XLSX_CONTENT_TYPE } from "@/features/people-import/schema"

export const Route = createFileRoute("/api/laporan-impor/$batchId")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const { schoolId } = await requireSchoolAdminForDownload(request)

        let report
        try {
          report = await getImportErrorReport(schoolId, params.batchId)
        } catch (error) {
          if (error instanceof PeopleImportError) {
            return new Response("Tidak ditemukan", { status: 404 })
          }
          throw error
        }

        return new Response(new Uint8Array(report.body), {
          headers: {
            "content-type": XLSX_CONTENT_TYPE,
            "content-disposition": `attachment; filename="${report.fileName}"`,
            "cache-control": "no-store",
            "x-content-type-options": "nosniff",
          },
        })
      },
    },
  },
})