// Layout dashboard Super Admin (area platform: app.<domain>), gaya template SKPI:
// sidebar kiri + topbar breadcrumb.
// Penjaga akses ada di beforeLoad (UX: arahkan ke login) DAN di setiap server
// function lewat platformAdminMiddleware (keamanan sebenarnya).

import { useState } from "react"
import {
  Link,
  Outlet,
  createFileRoute,
  redirect,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router"
import {
  ChevronsUpDown,
  GraduationCap,
  LayoutGrid,
  LogOut,
  School,
} from "lucide-react"

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Separator } from "@/components/ui/separator"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar"
import { getAccess } from "@/features/auth/server/access"
import { signOut } from "@/lib/auth-client"
import { initials } from "@/lib/format"

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

const NAV_GROUPS = [
  {
    label: "Utama",
    items: [
      { to: "/platform", label: "Beranda", exact: true, icon: LayoutGrid },
    ],
  },
  {
    label: "Platform",
    items: [
      { to: "/platform/sekolah", label: "Sekolah", exact: false, icon: School },
    ],
  },
] as const

type NavEntry = (typeof NAV_GROUPS)[number]["items"][number]

// Item menu: menutup sheet sidebar mobile saat dipilih (SidebarProvider tetap
// hidup antar navigasi, jadi sheet tidak menutup sendiri).
function NavItem({ item, active }: { item: NavEntry; active: boolean }) {
  const { setOpenMobile } = useSidebar()
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        isActive={active}
        render={<Link to={item.to} />}
        onClick={() => setOpenMobile(false)}
      >
        <item.icon aria-hidden />
        <span>{item.label}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}

function PlatformLayout() {
  const { admin } = Route.useRouteContext()
  const navigate = useNavigate()
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const [leaving, setLeaving] = useState(false)

  const isActive = (to: string, exact: boolean) =>
    exact ? pathname === to : pathname === to || pathname.startsWith(`${to}/`)

  const inSchools = pathname.startsWith("/platform/sekolah")
  const isSchoolDetail = pathname.startsWith("/platform/sekolah/")

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
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader className="gap-0.5 px-4 pt-4 pb-2">
          <span className="flex items-center gap-2 text-ds-body font-semibold">
            <span className="flex size-6 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <GraduationCap className="size-3.5" aria-hidden />
            </span>
            EduSaaS
          </span>
          <span className="text-ds-meta text-muted-foreground">
            Panel Super Admin
          </span>
        </SidebarHeader>

        <SidebarContent>
          {NAV_GROUPS.map((group) => (
            <SidebarGroup key={group.label}>
              <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {group.items.map((item) => (
                    <NavItem
                      key={item.to}
                      item={item}
                      active={isActive(item.to, item.exact)}
                    />
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}
        </SidebarContent>

        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={<SidebarMenuButton size="lg" />}
                  disabled={leaving}
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-ds-meta font-medium">
                    {initials(admin.name)}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col text-left">
                    <span className="truncate text-ds-body font-medium">
                      {admin.name}
                    </span>
                    <span className="truncate text-ds-meta text-muted-foreground">
                      Super Administrator
                    </span>
                  </span>
                  <ChevronsUpDown className="ml-auto size-4" aria-hidden />
                </DropdownMenuTrigger>
                <DropdownMenuContent side="top" align="start">
                  <DropdownMenuItem onClick={onSignOut}>
                    <LogOut aria-hidden />
                    Keluar
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-4">
          <SidebarTrigger aria-label="Buka/tutup sidebar" />
          <Separator orientation="vertical" className="h-4" />
          <Breadcrumb>
            <BreadcrumbList>
              {isSchoolDetail ? (
                <>
                  <BreadcrumbItem>
                    <Link
                      to="/platform/sekolah"
                      className="text-muted-foreground hover:text-foreground"
                    >
                      Sekolah
                    </Link>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    <BreadcrumbPage>Detail</BreadcrumbPage>
                  </BreadcrumbItem>
                </>
              ) : (
                <BreadcrumbItem>
                  <BreadcrumbPage>{inSchools ? "Sekolah" : "Beranda"}</BreadcrumbPage>
                </BreadcrumbItem>
              )}
            </BreadcrumbList>
          </Breadcrumb>
        </header>
        <main className="flex flex-col gap-6 p-6">
          <Outlet />
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
