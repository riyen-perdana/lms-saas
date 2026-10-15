// Menu sidebar area sekolah. Data murni supaya mudah diuji; komponen
// tampilannya ada di school-shell.tsx.

import {
  CalendarDays,
  FileSpreadsheet,
  LayoutGrid,
  ScrollText,
  UserCog,
  Users,
  UsersRound,
  type LucideIcon,
} from "lucide-react"

export type SchoolPath =
  | "/beranda"
  | "/tahun-ajaran"
  | "/penugasan"
  | "/pengguna"
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
      { to: "/pengguna", label: "Pengguna", icon: UsersRound },
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
