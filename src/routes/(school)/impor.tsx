// Impor guru & siswa dari template Excel (OB-02). Hanya admin sekolah.
// Halaman ini menampilkan riwayat impor; pemrosesan berkas berjalan di worker.

import { createFileRoute, redirect } from "@tanstack/react-router"

import { getAccess } from "@/features/auth/server/access"
import { ImportPage } from "@/features/people-import/components/import-page"
import { listImportBatchesFn } from "@/features/people-import/server/import"

export const Route = createFileRoute("/(school)/impor")({
  beforeLoad: async () => {
    const { area, access } = await getAccess()

    if (area !== "school") throw redirect({ to: "/" })
    if (access.status !== "ok") throw redirect({ to: "/login" })
    if (access.role !== "school_admin") throw redirect({ to: "/beranda" })
  },
  loader: async () => ({ batches: await listImportBatchesFn() }),
  head: () => ({ meta: [{ title: "Impor data — EduSaaS" }] }),
  component: ImporPage,
})

function ImporPage() {
  return <ImportPage batches={Route.useLoaderData().batches} />
}