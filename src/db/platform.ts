// platformDb() — jalan masuk lintas sekolah khusus Super Admin (PRD §5.2).
// ---------------------------------------------------------------------------
// Padanan tenantDb() untuk operasi platform (mis. aktivasi paket semua
// sekolah). Transaksi men-set `app.is_platform = 'on'`, yang dikenali policy
// RLS model tenant tertentu (lihat migrasi platform_admin_subscriptions).
// Tanpa flag itu query pada tabel tersebut melihat nol baris.
//
// ATURAN: hanya panggil dari service Super Admin
// (src/features/platform/service.ts), yang dijaga server function dengan cek
// platform_admins. Jangan dipakai untuk kode sekolah — di sana pakai tenantDb().

import { prisma } from "@/db/client"

export type PlatformDb = Parameters<
  Parameters<typeof prisma.$transaction>[0]
>[0]

export async function platformDb<T>(
  fn: (db: PlatformDb) => Promise<T>
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT set_config('app.is_platform', 'on', true)`
    return fn(tx)
  })
}
