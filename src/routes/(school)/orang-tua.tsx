// Tautan orang tua (OB-05): kode undangan per siswa. Hanya admin sekolah.

import { createFileRoute, redirect } from "@tanstack/react-router"

import { getAccess } from "@/features/auth/server/access"
import { ParentLinksPage } from "@/features/parent-link/components/parent-links-page"
import { getParentBoardFn } from "@/features/parent-link/server/parent-link"

export const Route = createFileRoute("/(school)/orang-tua")({
  beforeLoad: async () => {
    const { area, access } = await getAccess()

    if (area !== "school") throw redirect({ to: "/" })
    if (access.status !== "ok") throw redirect({ to: "/login" })
    if (access.role !== "school_admin") throw redirect({ to: "/beranda" })
  },
  loader: async () => ({ board: await getParentBoardFn() }),
  head: () => ({ meta: [{ title: "Tautan orang tua — EduSaaS" }] }),
  component: OrangTuaPage,
})

function OrangTuaPage() {
  return <ParentLinksPage board={Route.useLoaderData().board} />
}
