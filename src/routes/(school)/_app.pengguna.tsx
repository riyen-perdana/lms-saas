// Daftar guru & siswa + reset sandi guru (US-02). Hanya admin sekolah.

import { createFileRoute, redirect } from "@tanstack/react-router"

import { PeoplePage } from "@/features/user-management/components/people-page"
import { listPeopleFn } from "@/features/user-management/server/people"

export const Route = createFileRoute("/(school)/_app/pengguna")({
  beforeLoad: ({ context }) => {
    if (context.role !== "school_admin") throw redirect({ to: "/beranda" })
  },
  loader: async () => ({ people: await listPeopleFn({ data: {} }) }),
  head: () => ({ meta: [{ title: "Pengguna — EduSaaS" }] }),
  component: PenggunaPage,
})

function PenggunaPage() {
  return <PeoplePage initial={Route.useLoaderData().people} />
}
