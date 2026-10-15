// Layout area sekolah: penjaga akses terpusat + shell (sidebar/topbar).
// Penjaga di sini hanya untuk UX (arahkan ke login/setup); keamanan sebenarnya
// ada di middleware setiap server function (features/auth/server).

import { Outlet, createFileRoute, redirect } from "@tanstack/react-router"

import { SchoolShell } from "@/components/dashboard/school-shell"
import { getAccess } from "@/features/auth/server/access"

export const Route = createFileRoute("/(school)/_app")({
  beforeLoad: async () => {
    const { area, schoolName, access } = await getAccess()

    if (area !== "school") throw redirect({ to: "/" })
    if (access.status !== "ok") throw redirect({ to: "/login" })
    if (access.setupPending) throw redirect({ to: "/setup" })

    return {
      schoolName: schoolName ?? "Sekolah",
      user: access.user,
      role: access.role,
    }
  },
  component: SchoolLayout,
})

function SchoolLayout() {
  const { schoolName, user, role } = Route.useRouteContext()

  return (
    <SchoolShell schoolName={schoolName} user={user} role={role}>
      <Outlet />
    </SchoolShell>
  )
}
