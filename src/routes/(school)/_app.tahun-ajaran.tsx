// Tahun ajaran dan kenaikan kelas (OB-04). Hanya admin sekolah.

import { createFileRoute, redirect } from "@tanstack/react-router"

import { RolloverPage } from "@/features/year-rollover/components/rollover-page"
import { getRolloverBoardFn } from "@/features/year-rollover/server/year-rollover"

export const Route = createFileRoute("/(school)/_app/tahun-ajaran")({
  beforeLoad: ({ context }) => {
    if (context.role !== "school_admin") throw redirect({ to: "/beranda" })
  },
  loader: async () => ({ years: await getRolloverBoardFn() }),
  head: () => ({ meta: [{ title: "Tahun ajaran — EduSaaS" }] }),
  component: TahunAjaranPage,
})

function TahunAjaranPage() {
  return <RolloverPage years={Route.useLoaderData().years} />
}
