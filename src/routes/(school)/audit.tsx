// Log audit (US-04): aksi sensitif di sekolah ini. Hanya admin sekolah.

import { createFileRoute, redirect } from "@tanstack/react-router"

import { AuditPage } from "@/features/audit/components/audit-page"
import { listAuditLogsFn } from "@/features/audit/server/audit"
import { getAccess } from "@/features/auth/server/access"

export const Route = createFileRoute("/(school)/audit")({
  beforeLoad: async () => {
    const { area, access } = await getAccess()

    if (area !== "school") throw redirect({ to: "/" })
    if (access.status !== "ok") throw redirect({ to: "/login" })
    if (access.role !== "school_admin") throw redirect({ to: "/beranda" })
  },
  loader: async () => ({ initial: await listAuditLogsFn({ data: {} }) }),
  head: () => ({ meta: [{ title: "Log audit — EduSaaS" }] }),
  component: AuditRoute,
})

function AuditRoute() {
  return <AuditPage initial={Route.useLoaderData().initial} />
}
