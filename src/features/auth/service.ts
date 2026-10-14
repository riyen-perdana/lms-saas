// Akses user ke sekolah (gate F0, PRD §5.2 "Login").
// ---------------------------------------------------------------------------
// Sesi Better Auth hanya membuktikan SIAPA user-nya. Boleh tidaknya ia masuk
// ke sebuah sekolah ditentukan di sini lewat `memberships`, selalu melalui
// tenantDb(schoolId) supaya RLS berlaku.

import { tenantDb } from "@/db/tenant"
import type { $Enums } from "@/generated/prisma/client"

export interface SchoolAccess {
  membershipId: string
  role: $Enums.MembershipRole
}

/** Keanggotaan aktif user di sekolah tersebut, atau null bila tidak ada. */
export async function getSchoolAccess(
  schoolId: string,
  userId: string
): Promise<SchoolAccess | null> {
  const membership = await tenantDb(schoolId, (db) =>
    db.membership.findFirst({
      where: { userId, status: "active", deletedAt: null },
      select: { id: true, role: true },
    })
  )

  return membership
    ? { membershipId: membership.id, role: membership.role }
    : null
}
