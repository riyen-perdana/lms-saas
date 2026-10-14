// Server function: validasi -> permission -> service (AGENTS.md aturan 3).

import { createServerFn } from "@tanstack/react-start"
import { getRequestHeaders } from "@tanstack/react-start/server"

import { isSchoolBlocked } from "@/features/auth/policy"
import { getSchoolAccess } from "@/features/auth/service"
import { isPlatformAdmin } from "@/features/platform/service"
import { isSetupCompleted } from "@/features/school-setup/service"
import { auth } from "@/lib/auth"
import type { ResolvedTenant } from "@/lib/tenant/resolve"

export type AccessState =
  | { status: "anonymous" }
  | { status: "no-access" }
  | { status: "suspended" }
  | {
      status: "ok"
      user: { id: string; name: string; email: string }
      role: string
      /** Admin sekolah yang belum menyelesaikan wizard setup (OB-01). */
      setupPending?: boolean
    }

export interface LoginContext {
  area: ResolvedTenant["area"]
  schoolName: string | null
  access: AccessState
}

/**
 * Siapa yang sedang login di host ini, dan apakah ia anggota aktif sekolah
 * subdomain ini. Di host platform: apakah ia Super Admin. Di host marketing
 * tidak ada akses.
 */
export const getAccess = createServerFn({ method: "GET" }).handler(
  async ({ context }): Promise<LoginContext> => {
    const { tenant } = context
    const base = { area: tenant.area, schoolName: tenant.school?.name ?? null }
    const reply = (access: AccessState): LoginContext => ({ ...base, access })

    // Sekolah ditangguhkan: tutup untuk semua orang, termasuk sesi yang sudah
    // ada dan pengunjung yang belum login (cek lebih dulu dari sesi).
    if (
      tenant.area === "school" &&
      tenant.school &&
      isSchoolBlocked(tenant.school.status)
    ) {
      return reply({ status: "suspended" })
    }

    const session = await auth.api.getSession({ headers: getRequestHeaders() })
    if (!session) return reply({ status: "anonymous" })

    const user = {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
    }

    // Area platform: hanya Super Admin (tabel platform_admins) yang boleh masuk.
    if (tenant.area === "platform") {
      return (await isPlatformAdmin(session.user.id))
        ? reply({ status: "ok", user, role: "platform_admin" })
        : reply({ status: "no-access" })
    }

    if (tenant.area !== "school" || !tenant.school) {
      return reply({ status: "no-access" })
    }

    const access = await getSchoolAccess(tenant.school.id, session.user.id)
    if (!access) return reply({ status: "no-access" })

    const setupPending =
      access.role === "school_admin" && !(await isSetupCompleted(tenant.school.id))

    return reply({ status: "ok", user, role: access.role, setupPending })
  }
)
