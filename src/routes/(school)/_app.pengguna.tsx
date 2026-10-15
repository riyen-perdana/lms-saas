// Daftar guru & siswa + reset sandi guru (US-02). Hanya admin sekolah.

import { createFileRoute, redirect } from "@tanstack/react-router"

import { PeoplePage } from "@/features/user-management/components/people-page"
import { getPinBoardFn } from "@/features/student-pin/server/student-pin"
import { listPeopleFn } from "@/features/user-management/server/people"

export const Route = createFileRoute("/(school)/_app/pengguna")({
  beforeLoad: ({ context }) => {
    if (context.role !== "school_admin") throw redirect({ to: "/beranda" })
  },
  loader: async () => {
    const [people, board] = await Promise.all([
      listPeopleFn({ data: {} }),
      getPinBoardFn(),
    ])
    return { people, board }
  },
  head: () => ({ meta: [{ title: "Pengguna — EduSaaS" }] }),
  component: PenggunaPage,
})

function PenggunaPage() {
  const data = Route.useLoaderData()
  return <PeoplePage initial={data.people} board={data.board} />
}
