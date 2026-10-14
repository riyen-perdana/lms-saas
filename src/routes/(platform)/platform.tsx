// Layout dashboard Super Admin (area platform: app.<domain>).
// Penjaga akses ada di beforeLoad (UX: arahkan ke login) DAN di setiap server
// function lewat platformAdminMiddleware (keamanan sebenarnya).

import { useState } from "react"
import {
  Link,
  Outlet,
  createFileRoute,
  redirect,
  useNavigate,
} from "@tanstack/react-router"

import { Button } from "@/components/ui/button"
import { getAccess } from "@/features/auth/server/access"
import { signOut } from "@/lib/auth-client"
import { cn } from "@/lib/utils"

export const Route = createFileRoute("/(platform)/platform")({
  beforeLoad: async () => {
    const { area, access } = await getAccess()

    if (area !== "platform") throw redirect({ to: "/" })
    if (access.status !== "ok") throw redirect({ to: "/login" })

    return { admin: access.user }
  },
  head: () => ({ meta: [{ title: "Super Admin — EduSaaS" }] }),
  component: PlatformLayout,
})

const NAV = [
  { to: "/platform", label: "Ringkasan", exact: true },
  { to: "/platform/sekolah", label: "Sekolah", exact: false },
] as const

function PlatformLayout() {
  const { admin } = Route.useRouteContext()
  const navigate = useNavigate()
  const [leaving, setLeaving] = useState(false)

  async function onSignOut() {
    setLeaving(true)
    try {
      await signOut()
      await navigate({ to: "/login" })
    } finally {
      setLeaving(false)
    }
  }

  return (
    <div className="min-h-svh bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4">
          <div className="flex items-center gap-6">
            <span className="text-ds-body font-semibold whitespace-nowrap">
              EduSaaS
              <span className="hidden sm:inline"> · Super Admin</span>
            </span>
            <nav aria-label="Utama" className="flex items-center gap-1">
              {NAV.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  activeOptions={{ exact: item.exact }}
                  className="rounded-md px-2.5 py-1.5 text-ds-body text-muted-foreground transition-colors hover:text-foreground"
                  activeProps={{
                    className: cn("bg-muted font-medium text-foreground"),
                  }}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-ds-meta text-muted-foreground sm:inline">
              {admin.email}
            </span>
            <Button
              variant="outline"
              className="rounded-md"
              onClick={onSignOut}
              disabled={leaving}
            >
              Keluar
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8">
        <Outlet />
      </main>
    </div>
  )
}
