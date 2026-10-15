// Kerangka halaman sekolah (gaya template SKPI): sidebar kiri bergrup + topbar
// breadcrumb. Meniru PlatformLayout di routes/(platform)/platform.tsx.

import { Fragment, useState, type ReactNode } from "react"
import {
  Link,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router"
import { ChevronsUpDown, LogOut, School } from "lucide-react"

import {
  ROLE_LABELS,
  breadcrumbFor,
  navForRole,
} from "@/components/dashboard/school-nav"
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
} from "@/components/ui/sidebar"
import { signOut } from "@/lib/auth-client"
import { initials } from "@/lib/format"

export function SchoolShell({
  schoolName,
  user,
  role,
  children,
}: {
  schoolName: string
  user: { name: string }
  role: string
  children: ReactNode
}) {
  const navigate = useNavigate()
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const [leaving, setLeaving] = useState(false)

  const crumbs = breadcrumbFor(pathname)

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
            <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <School className="size-3.5" aria-hidden />
            </span>
            <span className="truncate">{schoolName}</span>
          </span>
          <span className="text-ds-meta text-muted-foreground">
            Platform pembelajaran
          </span>
        </SidebarHeader>

        <SidebarContent>
          {navForRole(role).map((group) => (
            <SidebarGroup key={group.label}>
              <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {group.items.map((item) => (
                    <SidebarMenuItem key={item.to}>
                      <SidebarMenuButton
                        isActive={
                          pathname === item.to ||
                          pathname.startsWith(`${item.to}/`)
                        }
                        render={<Link to={item.to} />}
                      >
                        <item.icon aria-hidden />
                        <span>{item.label}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
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
                    {initials(user.name)}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col text-left">
                    <span className="truncate text-ds-body font-medium">
                      {user.name}
                    </span>
                    <span className="truncate text-ds-meta text-muted-foreground">
                      {ROLE_LABELS[role] ?? role}
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
              {crumbs.map((crumb, index) => (
                <Fragment key={crumb}>
                  {index > 0 ? <BreadcrumbSeparator /> : null}
                  <BreadcrumbItem>
                    {index === crumbs.length - 1 ? (
                      <BreadcrumbPage>{crumb}</BreadcrumbPage>
                    ) : (
                      <span className="text-muted-foreground">{crumb}</span>
                    )}
                  </BreadcrumbItem>
                </Fragment>
              ))}
            </BreadcrumbList>
          </Breadcrumb>
        </header>
        <div className="flex flex-col gap-6 p-6">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  )
}
