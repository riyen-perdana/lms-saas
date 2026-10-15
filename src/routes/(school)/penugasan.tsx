// Penugasan guru (OB-03): kelas pembelajaran (rombel x mapel x guru) dan wali
// kelas per rombel. Hanya admin sekolah.

import { createFileRoute, redirect } from "@tanstack/react-router"

import { getAccess } from "@/features/auth/server/access"
import { AssignmentPage } from "@/features/teaching-assignment/components/assignment-page"
import { getAssignmentBoardFn } from "@/features/teaching-assignment/server/teaching-assignment"

export const Route = createFileRoute("/(school)/penugasan")({
  beforeLoad: async () => {
    const { area, access } = await getAccess()

    if (area !== "school") throw redirect({ to: "/" })
    if (access.status !== "ok") throw redirect({ to: "/login" })
    if (access.role !== "school_admin") throw redirect({ to: "/beranda" })
  },
  loader: async () => ({ board: await getAssignmentBoardFn() }),
  head: () => ({ meta: [{ title: "Penugasan guru — EduSaaS" }] }),
  component: PenugasanPage,
})

function PenugasanPage() {
  return <AssignmentPage board={Route.useLoaderData().board} />
}