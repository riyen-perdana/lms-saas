// Tahun ajaran dan kenaikan kelas (OB-04). Hanya admin sekolah.

import { createFileRoute, redirect } from "@tanstack/react-router"

import { getAccess } from "@/features/auth/server/access"
import { RolloverPage } from "@/features/year-rollover/components/rollover-page"
import { getRolloverBoardFn } from "@/features/year-rollover/server/year-rollover"

export const Route = createFileRoute("/(school)/tahun-ajaran")({
  beforeLoad: async () => {
    const { area, access } = await getAccess()

    if (area !== "school") throw redirect({ to: "/" })
    if (access.status !== "ok") throw redirect({ to: "/login" })
    if (access.role !== "school_admin") throw redirect({ to: "/beranda" })
  },
  loader: async () => ({ years: await getRolloverBoardFn() }),
  head: () => ({ meta: [{ title: "Tahun ajaran — EduSaaS" }] }),
  component: TahunAjaranPage,
})

function TahunAjaranPage() {
  return <RolloverPage years={Route.useLoaderData().years} />
}
