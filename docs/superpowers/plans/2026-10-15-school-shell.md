# Shell Layout Sekolah Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Membungkus halaman sekolah dengan shell gaya SKPI (sidebar bergrup, topbar breadcrumb, footer akun) dan memusatkan penjaga akses di satu layout.

**Architecture:** Layout pathless `(school)/_app.tsx` menjalankan `getAccess()` sekali, mengarahkan sesuai status, lalu menyediakan konteks `{ schoolName, user, role }` ke route anak. Menu didefinisikan sebagai data murni (`school-nav.ts`) yang diuji unit; komponen `SchoolShell` meniru `PlatformLayout`. Route anak khusus admin hanya mengecek `context.role`.

**Tech Stack:** TanStack Start + Router (file-based, `routeTree.gen.ts` ikut di-commit), shadcn/Base UI sidebar (sudah ada di `src/components/ui/`), lucide-react, Vitest, Playwright.

## Global Constraints

- Teks UI berbahasa Indonesia (AGENTS.md aturan 6).
- Dilarang hex/rgb/oklch literal dan warna bawaan Tailwind; pakai kelas semantik (`bg-muted`, `text-muted-foreground`, `border-border`). Tipografi dashboard: `text-ds-*`, jangan `text-mk-*`.
- Tidak ada dependency baru (aturan 7).
- Jangan menyentuh modul lain; penjaga server function (middleware) tidak diubah, `permission-audit.test.ts` harus tetap hijau tanpa perubahan.
- URL halaman sekolah tidak berubah. `/setup` dan `/gabung` tetap di luar shell.
- Selesai = `pnpm typecheck`, `pnpm lint`, `pnpm test` hijau, plus E2E terkait lulus (aturan 8).
- Menu admin hanya untuk `school_admin`; peran lain (teacher, student, parent) hanya melihat grup Utama.

---

## File Structure

| File | Aksi | Tanggung jawab |
| --- | --- | --- |
| `src/lib/format.ts` | ubah | tambah `initials(name)` bersama |
| `src/lib/format.test.ts` | baru | uji `initials` |
| `src/routes/(platform)/platform.tsx` | ubah | pakai `initials` bersama |
| `src/components/dashboard/school-nav.ts` | baru | data menu, `navForRole`, `breadcrumbFor`, `ROLE_LABELS` |
| `src/components/dashboard/school-nav.test.ts` | baru | uji data menu |
| `src/components/dashboard/school-shell.tsx` | baru | sidebar + topbar + footer akun |
| `src/routes/(school)/_app.tsx` | baru | layout pathless, penjaga akses |
| `src/routes/(school)/_app.<halaman>.tsx` | pindah | enam route lama jadi anak layout |
| `src/features/*/components/*-page.tsx` (5 file) | ubah | lepas `<main>` pembungkus lama |
| `src/routeTree.gen.ts` | regenerasi | hasil plugin router |
| `tests/e2e/auth-isolation.spec.ts` | ubah | tombol Keluar pindah ke menu akun |
| `tests/e2e/school-shell.spec.ts` | baru | E2E shell |
| `docs/PROGRESS.md` | ubah | status + keputusan |

---

### Task 1: Helper `initials` bersama

**Files:**
- Modify: `src/lib/format.ts`
- Create: `src/lib/format.test.ts`
- Modify: `src/routes/(platform)/platform.tsx:83-90` (hapus fungsi lokal, impor dari `@/lib/format`)

**Interfaces:**
- Produces: `initials(name: string): string` di `@/lib/format` (maks 2 huruf awal kata, huruf besar; string kosong -> `""`).

- [ ] **Step 1: Tulis test yang gagal**

`src/lib/format.test.ts`:

```ts
import { describe, expect, it } from "vitest"

import { initials } from "@/lib/format"

describe("initials", () => {
  it("mengambil huruf awal dua kata pertama dalam huruf besar", () => {
    expect(initials("Riyen Perdana")).toBe("RP")
    expect(initials("budi santoso wijaya")).toBe("BS")
  })

  it("satu kata dan spasi berlebih", () => {
    expect(initials("Admin")).toBe("A")
    expect(initials("  Sri   Mulyani ")).toBe("SM")
  })

  it("string kosong", () => {
    expect(initials("")).toBe("")
  })
})
```

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `pnpm vitest run src/lib/format.test.ts`
Expected: FAIL (`initials` tidak diekspor).

- [ ] **Step 3: Implementasi**

Tambahkan di akhir `src/lib/format.ts`:

```ts
/** Inisial untuk avatar: huruf awal dua kata pertama, huruf besar. */
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("")
}
```

Di `src/routes/(platform)/platform.tsx`: hapus fungsi `initials` lokal (baris 83-90) dan tambahkan `import { initials } from "@/lib/format"` di antara impor `@/lib/auth-client` (urut abjad: `@/lib/auth-client`, lalu `@/lib/format`).

- [ ] **Step 4: Jalankan test + typecheck**

Run: `pnpm vitest run src/lib/format.test.ts && pnpm typecheck`
Expected: PASS, tanpa error tipe.

- [ ] **Step 5: Commit**

```bash
git add src/lib/format.ts src/lib/format.test.ts "src/routes/(platform)/platform.tsx"
git commit -m "refactor: share initials helper between platform and school layouts"
```

---

### Task 2: Data menu sekolah (`school-nav.ts`)

**Files:**
- Create: `src/components/dashboard/school-nav.ts`
- Create: `src/components/dashboard/school-nav.test.ts`

**Interfaces:**
- Produces:
  - `type SchoolPath = "/beranda" | "/tahun-ajaran" | "/penugasan" | "/impor" | "/orang-tua" | "/audit"`
  - `interface NavItem { to: SchoolPath; label: string; icon: LucideIcon }`
  - `interface NavGroup { label: string; items: NavItem[] }`
  - `ROLE_LABELS: Record<string, string>`
  - `navForRole(role: string): NavGroup[]`
  - `breadcrumbFor(pathname: string): string[]` (`["Beranda"]`, `["Sistem", "Audit"]`, `[]` bila tak dikenal)

- [ ] **Step 1: Tulis test yang gagal**

`src/components/dashboard/school-nav.test.ts`:

```ts
import { describe, expect, it } from "vitest"

import { ROLE_LABELS, breadcrumbFor, navForRole } from "./school-nav"

const labels = (role: string) =>
  navForRole(role).map((g) => [g.label, g.items.map((i) => i.label)])

describe("navForRole", () => {
  it("admin sekolah melihat semua grup", () => {
    expect(labels("school_admin")).toEqual([
      ["Utama", ["Beranda"]],
      ["Akademik", ["Tahun Ajaran", "Penugasan"]],
      ["Data", ["Impor Data", "Orang Tua"]],
      ["Sistem", ["Audit"]],
    ])
  })

  it.each(["teacher", "student", "parent", "peran-tak-dikenal"])(
    "%s hanya melihat Beranda",
    (role) => {
      expect(labels(role)).toEqual([["Utama", ["Beranda"]]])
    }
  )

  it("setiap item menunjuk path unik", () => {
    const paths = navForRole("school_admin").flatMap((g) =>
      g.items.map((i) => i.to)
    )
    expect(new Set(paths).size).toBe(paths.length)
  })
})

describe("breadcrumbFor", () => {
  it("Beranda hanya satu segmen", () => {
    expect(breadcrumbFor("/beranda")).toEqual(["Beranda"])
  })

  it("halaman lain: grup lalu judul", () => {
    expect(breadcrumbFor("/audit")).toEqual(["Sistem", "Audit"])
    expect(breadcrumbFor("/orang-tua")).toEqual(["Data", "Orang Tua"])
    expect(breadcrumbFor("/tahun-ajaran")).toEqual(["Akademik", "Tahun Ajaran"])
  })

  it("path anak dan garis miring akhir tetap dikenali", () => {
    expect(breadcrumbFor("/impor/")).toEqual(["Data", "Impor Data"])
    expect(breadcrumbFor("/penugasan/abc")).toEqual(["Akademik", "Penugasan"])
  })

  it("path tak dikenal -> kosong", () => {
    expect(breadcrumbFor("/lain")).toEqual([])
    expect(breadcrumbFor("/auditx")).toEqual([])
  })
})

describe("ROLE_LABELS", () => {
  it("memetakan peran sekolah ke label Indonesia", () => {
    expect(ROLE_LABELS.school_admin).toBe("Admin sekolah")
    expect(ROLE_LABELS.parent).toBe("Orang tua")
  })
})
```

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `pnpm vitest run src/components/dashboard/school-nav.test.ts`
Expected: FAIL (modul belum ada).

- [ ] **Step 3: Implementasi**

`src/components/dashboard/school-nav.ts`:

```ts
// Menu sidebar area sekolah. Data murni supaya mudah diuji; komponen
// tampilannya ada di school-shell.tsx.

import {
  CalendarDays,
  FileSpreadsheet,
  LayoutGrid,
  ScrollText,
  UserCog,
  Users,
  type LucideIcon,
} from "lucide-react"

export type SchoolPath =
  | "/beranda"
  | "/tahun-ajaran"
  | "/penugasan"
  | "/impor"
  | "/orang-tua"
  | "/audit"

export interface NavItem {
  to: SchoolPath
  label: string
  icon: LucideIcon
}

export interface NavGroup {
  label: string
  items: NavItem[]
}

export const ROLE_LABELS: Record<string, string> = {
  school_admin: "Admin sekolah",
  teacher: "Guru",
  student: "Siswa",
  parent: "Orang tua",
}

const COMMON: NavGroup[] = [
  {
    label: "Utama",
    items: [{ to: "/beranda", label: "Beranda", icon: LayoutGrid }],
  },
]

const ADMIN: NavGroup[] = [
  {
    label: "Akademik",
    items: [
      { to: "/tahun-ajaran", label: "Tahun Ajaran", icon: CalendarDays },
      { to: "/penugasan", label: "Penugasan", icon: UserCog },
    ],
  },
  {
    label: "Data",
    items: [
      { to: "/impor", label: "Impor Data", icon: FileSpreadsheet },
      { to: "/orang-tua", label: "Orang Tua", icon: Users },
    ],
  },
  {
    label: "Sistem",
    items: [{ to: "/audit", label: "Audit", icon: ScrollText }],
  },
]

/** Menu yang boleh dilihat peran ini. Hanya admin sekolah yang mendapat menu pengelolaan. */
export function navForRole(role: string): NavGroup[] {
  return role === "school_admin" ? [...COMMON, ...ADMIN] : COMMON
}

/** Segmen breadcrumb untuk pathname. Memakai seluruh menu, bukan hanya yang boleh dilihat. */
export function breadcrumbFor(pathname: string): string[] {
  for (const group of [...COMMON, ...ADMIN]) {
    for (const item of group.items) {
      if (pathname === item.to || pathname.startsWith(`${item.to}/`)) {
        return group.label === "Utama" ? [item.label] : [group.label, item.label]
      }
    }
  }
  return []
}
```

- [ ] **Step 4: Jalankan test + typecheck**

Run: `pnpm vitest run src/components/dashboard/school-nav.test.ts && pnpm typecheck`
Expected: PASS. Bila ikon lucide tertentu tidak ada di versi terpasang, typecheck gagal: ganti dengan ikon lain yang ada (mis. `Calendar`, `FileUp`, `Shield`) tanpa mengubah label.

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/school-nav.ts src/components/dashboard/school-nav.test.ts
git commit -m "feat(school): sidebar menu data and breadcrumb lookup by role"
```

---

### Task 3: Komponen `SchoolShell`

**Files:**
- Create: `src/components/dashboard/school-shell.tsx`

**Interfaces:**
- Consumes: `navForRole`, `breadcrumbFor`, `ROLE_LABELS` (Task 2); `initials` (Task 1).
- Produces: `SchoolShell({ schoolName, user, role, children })` dengan `user: { name: string }`, `role: string`, `children: ReactNode`.

Komponen ini tidak diuji unit (murni tampilan; dicakup E2E Task 6) dan mengikuti `PlatformLayout` baris per baris.

- [ ] **Step 1: Tulis komponen**

`src/components/dashboard/school-shell.tsx`:

```tsx
// Kerangka halaman sekolah (gaya template SKPI): sidebar kiri bergrup + topbar
// breadcrumb. Meniru PlatformLayout di routes/(platform)/platform.tsx.

import { useState, type ReactNode } from "react"
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
                <BreadcrumbItem key={crumb}>
                  {index > 0 ? <BreadcrumbSeparator /> : null}
                  {index === crumbs.length - 1 ? (
                    <BreadcrumbPage>{crumb}</BreadcrumbPage>
                  ) : (
                    <span className="text-muted-foreground">{crumb}</span>
                  )}
                </BreadcrumbItem>
              ))}
            </BreadcrumbList>
          </Breadcrumb>
        </header>
        <main className="flex flex-col gap-6 p-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  )
}
```

Catatan: `BreadcrumbSeparator` dirender di dalam `BreadcrumbItem` agar tidak menjadi `<li>` bersarang. Jika komponen `BreadcrumbSeparator` di `src/components/ui/breadcrumb.tsx` sudah merender `<li>` sendiri (lihat file), pindahkan separator keluar dari `BreadcrumbItem` seperti pola di `platform.tsx` (separator sebagai sibling item).

- [ ] **Step 2: Typecheck dan lint**

Run: `pnpm typecheck && pnpm lint`
Expected: bersih. `Link to={item.to}` lolos tipe setelah route anak ada (Task 4); bila typecheck mengeluh soal `to`, kerjakan Task 4 dulu lalu ulangi langkah ini.

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/school-shell.tsx
git commit -m "feat(school): SchoolShell with grouped sidebar, breadcrumb, account menu"
```

---

### Task 4: Layout `_app` dan pemindahan route

**Files:**
- Create: `src/routes/(school)/_app.tsx`
- Move (`git mv`): `beranda`, `audit`, `impor`, `penugasan`, `tahun-ajaran`, `orang-tua` -> `_app.<nama>.tsx`
- Modify tiap route yang dipindah: id di `createFileRoute`, `beforeLoad`
- Modify: `src/routes/(school)/_app.beranda.tsx` (lepas Keluar dan pembungkus)
- Modify: `src/routeTree.gen.ts` (regenerasi)

**Interfaces:**
- Consumes: `SchoolShell` (Task 3), `ROLE_LABELS` (Task 2).
- Produces: konteks route `{ schoolName: string; user: { id; name; email }; role: string }` untuk semua anak `_app`.

- [ ] **Step 1: Pindahkan file**

```bash
cd "src/routes/(school)"
for f in beranda audit impor penugasan tahun-ajaran orang-tua; do git mv "$f.tsx" "_app.$f.tsx"; done
cd ../../..
```

- [ ] **Step 2: Tulis layout**

`src/routes/(school)/_app.tsx`:

```tsx
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
```

- [ ] **Step 3: Ubah lima route khusus admin**

Di `_app.audit.tsx`, `_app.impor.tsx`, `_app.penugasan.tsx`, `_app.tahun-ajaran.tsx`, `_app.orang-tua.tsx`:

1. Ganti id: `createFileRoute("/(school)/<nama>")` -> `createFileRoute("/(school)/_app/<nama>")`.
2. Ganti blok `beforeLoad` menjadi:

```tsx
  beforeLoad: ({ context }) => {
    if (context.role !== "school_admin") throw redirect({ to: "/beranda" })
  },
```

3. Hapus impor `getAccess` dari `@/features/auth/server/access` (tidak dipakai lagi). Impor `redirect` tetap dipakai.

Contoh hasil akhir `_app.audit.tsx`:

```tsx
// Log audit (US-04): aksi sensitif di sekolah ini. Hanya admin sekolah.

import { createFileRoute, redirect } from "@tanstack/react-router"

import { AuditPage } from "@/features/audit/components/audit-page"
import { listAuditLogsFn } from "@/features/audit/server/audit"

export const Route = createFileRoute("/(school)/_app/audit")({
  beforeLoad: ({ context }) => {
    if (context.role !== "school_admin") throw redirect({ to: "/beranda" })
  },
  loader: async () => ({ initial: await listAuditLogsFn({ data: {} }) }),
  head: () => ({ meta: [{ title: "Log audit — EduSaaS" }] }),
  component: AuditRoute,
})

function AuditRoute() {
  return <AuditPage initial={Route.useLoaderData().initial} />
}
```

- [ ] **Step 4: Ubah `_app.beranda.tsx`**

Hapus `useState`, `useNavigate`, `Button`, `signOut`, `getAccess`, `redirect`-nya yang lama, `ROLE_LABELS` lokal, dan `onSignOut`. Hasil akhir (gunakan sebagai pengganti seluruh isi; bagian "Anak Anda" dan tautan admin disalin utuh dari file lama, tidak diubah):

```tsx
// Beranda sekolah (sementara). Dashboard sekolah penuh dikerjakan di F2+;
// halaman ini menjadi tujuan setelah login supaya alur masuk tidak buntu.

import { Link, createFileRoute } from "@tanstack/react-router"

import { ROLE_LABELS } from "@/components/dashboard/school-nav"
import { PageHeader } from "@/components/dashboard/page-header"
import { listMyChildrenFn } from "@/features/parent-link/server/parent-link"

export const Route = createFileRoute("/(school)/_app/beranda")({
  loader: async ({ context }) => ({
    children: context.role === "parent" ? await listMyChildrenFn() : [],
  }),
  head: () => ({ meta: [{ title: "Beranda — EduSaaS" }] }),
  component: SchoolHome,
})

function SchoolHome() {
  const { schoolName, user, role } = Route.useRouteContext()
  const { children } = Route.useLoaderData()

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <PageHeader
        title={schoolName}
        description={`Masuk sebagai ${user.name} · ${ROLE_LABELS[role] ?? role}`}
      />
      {/* ...paragraf placeholder, section "Anak Anda", dan blok tautan admin:
          salin tanpa perubahan dari file lama... */}
    </div>
  )
}
```

(Saat mengerjakan, salin tiga blok JSX itu persis dari versi sebelumnya; hanya `<main ...>` pembungkus menjadi `<div>` di atas dan tombol Keluar di `PageHeader` dibuang.)

- [ ] **Step 5: Regenerasi routeTree**

Run: `pnpm build`
Expected: build sukses dan `src/routeTree.gen.ts` berubah (memuat `/(school)/_app` dan anak-anaknya). Jika plugin tidak menulis ulang saat build, jalankan `pnpm dev`, tunggu "ready", lalu hentikan.

Verifikasi: `git diff --stat src/routeTree.gen.ts` menunjukkan perubahan, dan `grep -c "_app" src/routeTree.gen.ts` > 0.

- [ ] **Step 6: Typecheck, lint, test**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: hijau. `permission-audit.test.ts` harus lulus tanpa perubahan (hanya memindai `createServerFn` dan `api/*`).

- [ ] **Step 7: Commit**

```bash
git add -A "src/routes/(school)" src/routeTree.gen.ts
git commit -m "feat(school): pathless _app layout with central access guard and shell"
```

---

### Task 5: Lepas pembungkus `<main>` lama pada komponen halaman

Shell sudah menyediakan `<main>`; `<main>` bersarang tidak valid dan padding berlipat.

**Files (ubah):**
- `src/features/audit/components/audit-page.tsx:73`
- `src/features/parent-link/components/parent-links-page.tsx:104,114`
- `src/features/people-import/components/import-page.tsx:121`
- `src/features/teaching-assignment/components/assignment-page.tsx:327,346`
- `src/features/year-rollover/components/rollover-page.tsx:405`

Tidak diubah: `join-page.tsx` (`/gabung`) dan `school-setup/components/wizard.tsx` (`/setup`), keduanya di luar shell.

- [ ] **Step 1: Ganti pembuka dan penutup**

Di setiap file di atas:
- `<main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-10">` -> `<div className="flex max-w-3xl flex-col gap-6">`
- `rollover-page.tsx`: `<main className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-10">` -> `<div className="flex max-w-3xl flex-col gap-8">`
- setiap `</main>` pasangannya -> `</div>`

- [ ] **Step 2: Pastikan pasangan tag seimbang**

Run: `grep -c "<main" src/features/{audit,parent-link,people-import,teaching-assignment,year-rollover}/components/*-page.tsx`
Expected: semua `0` (kecuali `join-page.tsx` yang tidak termasuk glob ini), lalu `pnpm typecheck` bersih (tag tak seimbang akan error).

- [ ] **Step 3: Test, lint**

Run: `pnpm lint && pnpm test`
Expected: hijau.

- [ ] **Step 4: Commit**

```bash
git add src/features
git commit -m "refactor(school): drop per-page main wrappers now provided by shell"
```

---

### Task 6: E2E shell dan perbaikan selector Keluar

**Files:**
- Modify: `tests/e2e/auth-isolation.spec.ts:63-68`
- Create: `tests/e2e/school-shell.spec.ts`

**Interfaces:**
- Consumes: label peran "Admin sekolah" pada tombol akun; tautan sidebar bernama persis "Audit", "Beranda"; tombol `aria-label="Buka/tutup sidebar"`; item menu "Keluar".

Catatan: di project `mobile-360` sidebar berupa sheet yang tertutup; tautan sidebar dan menu akun baru ada di DOM setelah tombol "Buka/tutup sidebar" diklik.

- [ ] **Step 1: Perbaiki E2E yang memakai tombol Keluar langsung**

Di `tests/e2e/auth-isolation.spec.ts`, ganti blok `toPass` Keluar (baris 63-68) dengan:

```ts
  // Keluar lewat menu akun di sidebar; mobile menyembunyikan sidebar di sheet.
  // Klik sebelum hydrate tidak berefek; ulangi sampai handler terpasang.
  await expect(async () => {
    const account = page.getByRole("button", { name: /Admin sekolah/ })
    if (!(await account.isVisible())) {
      await page.getByRole("button", { name: "Buka/tutup sidebar" }).click()
    }
    await account.click()
    await page.getByRole("menuitem", { name: "Keluar" }).click()
    await expect(page).toHaveURL(/\/login$/, { timeout: 1500 })
  }).toPass({ timeout: 15_000 })
```

Catatan: percobaan ulang di `toPass` bisa menemui sheet yang sudah terbuka; `account.isVisible()` menangani itu.

- [ ] **Step 2: Tulis `school-shell.spec.ts`**

`tests/e2e/school-shell.spec.ts` (fixture disalin dari `audit.spec.ts`, ditambah opsi `setupDone`):

```ts
import "dotenv/config"

import { randomUUID } from "node:crypto"

import { PrismaPg } from "@prisma/adapter-pg"
import { hashPassword } from "better-auth/crypto"
import { expect, test, type Page } from "@playwright/test"

import { PrismaClient } from "../../src/generated/prisma/client.js"

// Shell sekolah: sidebar per peran, breadcrumb, penjaga setup, Keluar.

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
})

const PASSWORD = "sandi-uji-12345"

const created: { schoolId: string; userIds: string[] }[] = []

test.afterAll(async () => {
  for (const { schoolId, userIds } of created) {
    await db.school.deleteMany({ where: { id: schoolId } })
    await db.user.deleteMany({ where: { id: { in: userIds } } })
  }
  await db.$disconnect()
})

async function newSchool(
  testInfo: { project: { name: string } },
  setupDone = true
) {
  const tag = `${randomUUID().slice(0, 6)}${testInfo.project.name === "mobile-360" ? "m" : "d"}`
  const slug = `sh-${tag}`

  const school = await db.school.create({
    data: {
      slug,
      name: `SMA Shell ${tag}`,
      level: "SMA",
      status: "trial",
      setupCompletedAt: setupDone ? new Date() : null,
    },
  })
  const userIds: string[] = []

  async function addUser(role: "school_admin" | "teacher", name: string) {
    const email = `${role}-${tag}@sekolah.test`
    const user = await db.user.create({
      data: { email, name, emailVerified: true },
    })
    userIds.push(user.id)
    await db.account.create({
      data: {
        userId: user.id,
        providerId: "credential",
        accountId: user.id,
        password: await hashPassword(PASSWORD),
      },
    })
    await db.membership.create({
      data: { schoolId: school.id, userId: user.id, role },
    })
    return email
  }

  const adminEmail = await addUser("school_admin", "Admin Shell")
  const teacherEmail = await addUser("teacher", "Guru Shell")

  created.push({ schoolId: school.id, userIds })

  return {
    adminEmail,
    teacherEmail,
    origin: `http://${slug}.localhost:3000`,
  }
}

async function login(page: Page, origin: string, email: string) {
  await page.goto(`${origin}/login`)
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Kata sandi").fill(PASSWORD)
  await expect(page.getByRole("button", { name: "Masuk" })).toBeEnabled()
  await page.getByRole("button", { name: "Masuk" }).click()
  await expect(page).toHaveURL(/\/(beranda|setup)$/)
}

// Di layar 360 px sidebar menjadi sheet tertutup; buka dulu bila perlu.
async function openSidebarIfMobile(
  page: Page,
  testInfo: { project: { name: string } }
) {
  if (testInfo.project.name === "mobile-360") {
    await page.getByRole("button", { name: "Buka/tutup sidebar" }).click()
  }
}

test("admin melihat menu bergrup dan breadcrumb mengikuti halaman", async ({
  page,
}, testInfo) => {
  const school = await newSchool(testInfo)
  await login(page, school.origin, school.adminEmail)

  await openSidebarIfMobile(page, testInfo)
  for (const group of ["Utama", "Akademik", "Data", "Sistem"]) {
    await expect(page.getByText(group, { exact: true })).toBeVisible()
  }

  await page.getByRole("link", { name: "Audit", exact: true }).click()
  await expect(page).toHaveURL(/\/audit$/)
  const crumbs = page.getByRole("navigation", { name: "breadcrumb" })
  await expect(crumbs).toContainText("Sistem")
  await expect(crumbs).toContainText("Audit")
})

test("guru hanya melihat Beranda dan tidak bisa membuka halaman admin", async ({
  page,
}, testInfo) => {
  const school = await newSchool(testInfo)
  await login(page, school.origin, school.teacherEmail)

  await openSidebarIfMobile(page, testInfo)
  await expect(page.getByRole("link", { name: "Beranda", exact: true })).toBeVisible()
  await expect(page.getByRole("link", { name: "Audit", exact: true })).toHaveCount(0)
  await expect(page.getByText("Akademik", { exact: true })).toHaveCount(0)

  await page.goto(`${school.origin}/audit`)
  await expect(page).toHaveURL(/\/beranda$/)
})

test("admin yang belum selesai setup diarahkan ke /setup dari halaman admin", async ({
  page,
}, testInfo) => {
  const school = await newSchool(testInfo, false)
  await login(page, school.origin, school.adminEmail)
  await expect(page).toHaveURL(/\/setup$/)

  await page.goto(`${school.origin}/audit`)
  await expect(page).toHaveURL(/\/setup$/)
})

test("Keluar dari menu akun mengembalikan ke login", async ({ page }, testInfo) => {
  const school = await newSchool(testInfo)
  await login(page, school.origin, school.adminEmail)

  // Klik sebelum hydrate tidak berefek; ulangi sampai handler terpasang.
  await expect(async () => {
    const account = page.getByRole("button", { name: /Admin sekolah/ })
    if (!(await account.isVisible())) {
      await page.getByRole("button", { name: "Buka/tutup sidebar" }).click()
    }
    await account.click()
    await page.getByRole("menuitem", { name: "Keluar" }).click()
    await expect(page).toHaveURL(/\/login$/, { timeout: 1500 })
  }).toPass({ timeout: 15_000 })
})
```

- [ ] **Step 3: Jalankan E2E terkait (butuh `pnpm db:seed` dan PostgreSQL lokal)**

Run: `pnpm exec playwright test school-shell auth-isolation audit import parent-link teaching-assignment year-rollover setup register`
Expected: semua lulus di `chromium` dan `mobile-360`. Jika `school-shell` gagal karena "strict mode violation" pada `getByText("Utama")` (teks juga muncul di tempat lain), persempit dengan `page.locator('[data-slot="sidebar"]').getByText(...)` setelah memeriksa atribut sebenarnya di `src/components/ui/sidebar.tsx`.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/auth-isolation.spec.ts tests/e2e/school-shell.spec.ts
git commit -m "test(e2e): school shell sidebar, breadcrumb, setup guard, sign out"
```

---

### Task 7: Verifikasi akhir dan dokumentasi

**Files:**
- Modify: `docs/PROGRESS.md`

- [ ] **Step 1: Verifikasi penuh**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: hijau semua. Jalankan ulang E2E Task 6 Step 3 bila ada perubahan sejak itu.

- [ ] **Step 2: Cek visual manual**

Run: `pnpm dev`, buka `http://sekolahdemo.localhost:3000` (login `admin@sekolahdemo.sch.id`). Periksa: sidebar 4 grup, item aktif tersorot, breadcrumb `Grup > Halaman`, menu akun berisi Keluar, tidak ada padding ganda di `/audit`, `/impor`, `/penugasan`, `/tahun-ajaran`, `/orang-tua`; lebar 360 px: sidebar menjadi sheet. Laporkan hasilnya apa adanya, termasuk bagian yang terlihat janggal (akan dirapikan di Tahap 2/3).

- [ ] **Step 3: Perbarui `docs/PROGRESS.md`**

Tambahkan di bagian status: shell sekolah (Tahap 1 pekerjaan UI) selesai; Tahap 2 (DataTable daftar-detail) dan Tahap 3 (penataan halaman + KPI beranda) berikutnya. Tambahkan di "Keputusan": layout pathless `(school)/_app.tsx` memegang penjaga akses + shell (route admin hanya cek `context.role`); `/setup` dan `/gabung` di luar shell; menu didefinisikan di `school-nav.ts` (menu modul baru ditambahkan di sana); halaman admin selain beranda kini juga mengarahkan admin yang belum setup ke `/setup`. Tambahkan di "Jebakan": tombol Keluar kini ada di menu akun sidebar (di mobile harus membuka sidebar dulu) sehingga E2E memakai `getByRole("button", { name: /Admin sekolah/ })` lalu `menuitem "Keluar"`.

- [ ] **Step 4: Commit**

```bash
git add docs/PROGRESS.md
git commit -m "docs: record school shell layout (UI phase 1) in progress"
```

---

## Self-Review

**Cakupan spec:** struktur route dan pemindahan (Task 4); penjaga akses terpusat termasuk redirect setup dan cek peran (Task 4); menu per peran + breadcrumb (Task 2); komponen shell (Task 3); `initials` bersama (Task 1); perubahan isi halaman minimal: beranda (Task 4), pembungkus halaman lain (Task 5); pengujian unit/E2E/permission-audit (Task 2, 6, 4 Step 6); PROGRESS.md dan memori (Task 7: memori proyek diperbarui oleh agen yang menjalankan, setelah Task 7 selesai).

**Placeholder:** satu bagian `_app.beranda.tsx` menyuruh menyalin tiga blok JSX lama; ini penyalinan utuh dari file yang ada, bukan konten baru, dan sumbernya disebut jelas.

**Konsistensi tipe:** `SchoolPath`, `NavItem`, `NavGroup`, `navForRole`, `breadcrumbFor`, `ROLE_LABELS` (Task 2) dipakai sama di Task 3 dan 4; `initials` (Task 1) di Task 3; konteks `{ schoolName, user, role }` (Task 4) sama dengan props `SchoolShell` (Task 3).

**Risiko yang sudah ditangani:** E2E lama yang memakai tombol "Keluar" langsung di beranda hanya `auth-isolation.spec.ts` (Task 6 Step 1); nama tautan beranda yang dipakai E2E lain ("Log audit", "Impor guru dan siswa dari Excel", dst.) tidak bentrok dengan label sidebar ("Audit", "Impor Data", dst.) dan beranda tidak diubah selain pembungkus.
