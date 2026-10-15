// Log audit (US-04): aksi sensitif di sekolah ini. Hanya admin sekolah.

import { createFileRoute, redirect } from "@tanstack/react-router"

import { AuditPage } from "@/features/audit/components/audit-page"
import { listAuditLogsFn } from "@/features/audit/server/audit"

export const Route = createFileRoute("/(school)/_app/audit")({
  beforeLoad: ({ context }) => {
    if (context.role !== "school_admin") throw redirect({ to: "/beranda" })
  },
  loader: async () => ({ initial: await listAuditLogsFn({ data: {} }) }),
  head: () => ({ meta: [{ title: "Log audit — EduSaaS" }] }),
  component: AuditRoute,
})

function AuditRoute() {
  return <AuditPage initial={Route.useLoaderData().initial} />
}
