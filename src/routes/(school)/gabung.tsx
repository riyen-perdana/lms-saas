// Halaman publik penukaran kode undangan orang tua (OB-05).

import { createFileRoute, redirect } from "@tanstack/react-router"

import { getAccess } from "@/features/auth/server/access"
import { JoinPage } from "@/features/parent-link/components/join-page"

export const Route = createFileRoute("/(school)/gabung")({
  beforeLoad: async () => {
    const { area, schoolName, access } = await getAccess()

    if (area !== "school") throw redirect({ to: "/" })
    return { schoolName: schoolName ?? "Sekolah", access }
  },
  head: () => ({ meta: [{ title: "Tautkan akun orang tua — EduSaaS" }] }),
  component: GabungPage,
})

function GabungPage() {
  const { schoolName, access } = Route.useRouteContext()
  return <JoinPage schoolName={schoolName} access={access} />
}
