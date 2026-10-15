// Penugasan guru (OB-03): kelas pembelajaran (rombel x mapel x guru) dan wali
// kelas per rombel. Hanya admin sekolah.

import { createFileRoute, redirect } from "@tanstack/react-router"

import { AssignmentPage } from "@/features/teaching-assignment/components/assignment-page"
import { getAssignmentBoardFn } from "@/features/teaching-assignment/server/teaching-assignment"

export const Route = createFileRoute("/(school)/_app/penugasan")({
  beforeLoad: ({ context }) => {
    if (context.role !== "school_admin") throw redirect({ to: "/beranda" })
  },
  loader: async () => ({ board: await getAssignmentBoardFn() }),
  head: () => ({ meta: [{ title: "Penugasan guru — EduSaaS" }] }),
  component: PenugasanPage,
})

function PenugasanPage() {
  return <AssignmentPage board={Route.useLoaderData().board} />
}