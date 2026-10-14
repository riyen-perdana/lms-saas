// Kedaluwarsa langganan (job terjadwal, PRD §4 "trial 30 hari").
// ---------------------------------------------------------------------------
// Transisi status sekolah:
//   trial  --(trial habis)-->            readonly   (data aman, hanya-baca)
//   active --(periode berbayar habis)--> grace      (masa tenggang)
//   grace  --(GRACE_DAYS lewat)-->       readonly
// Sekolah `suspended` tidak disentuh: penangguhan adalah keputusan manual.
// Operasi bersifat idempoten, jadi aman dijalankan berulang oleh job.

import { platformDb } from "@/db/platform"
import { addDaysUtc } from "@/lib/dates"
import { invalidateTenantCache } from "@/lib/tenant/resolve"

export const GRACE_DAYS = 7

export interface ExpiryResult {
  trialsExpired: number
  paidExpired: number
  graceEnded: number
}

export async function expireSubscriptions(
  now: Date = new Date()
): Promise<ExpiryResult> {
  const { result, slugs } = await platformDb(async (db) => {
    const changed = new Set<string>()

    // 1) Trial habis.
    const trials = await db.subscription.findMany({
      where: { status: "trial", periodEnd: { lte: now } },
      select: { id: true, schoolId: true },
    })
    if (trials.length > 0) {
      await db.subscription.updateMany({
        where: { id: { in: trials.map((row) => row.id) } },
        data: { status: "expired" },
      })
      const moved = await db.school.findMany({
        where: {
          id: { in: trials.map((row) => row.schoolId) },
          status: "trial",
        },
        select: { id: true, slug: true },
      })
      await db.school.updateMany({
        where: { id: { in: moved.map((row) => row.id) } },
        data: { status: "readonly" },
      })
      moved.forEach((row) => changed.add(row.slug))
    }

    // 2) Periode berbayar habis -> masa tenggang.
    const paid = await db.subscription.findMany({
      where: { status: "active", periodEnd: { lte: now } },
      select: { id: true, schoolId: true },
    })
    if (paid.length > 0) {
      await db.subscription.updateMany({
        where: { id: { in: paid.map((row) => row.id) } },
        data: { status: "expired" },
      })
      const moved = await db.school.findMany({
        where: {
          id: { in: paid.map((row) => row.schoolId) },
          status: "active",
        },
        select: { id: true, slug: true },
      })
      await db.school.updateMany({
        where: { id: { in: moved.map((row) => row.id) } },
        data: { status: "grace" },
      })
      moved.forEach((row) => changed.add(row.slug))
    }

    // 3) Masa tenggang berakhir -> hanya-baca. Patokannya akhir periode
    //    langganan terakhir; sekolah yang sudah punya langganan berlaku lagi
    //    (mis. paket diaktifkan ulang) tidak terkena.
    const grace = await db.school.findMany({
      where: { status: "grace", deletedAt: null },
      select: {
        id: true,
        slug: true,
        subscriptions: {
          orderBy: { periodEnd: "desc" },
          take: 1,
          select: { status: true, periodEnd: true },
        },
      },
    })
    const cutoff = addDaysUtc(now, -GRACE_DAYS)
    const ended = grace.filter((school) => {
      const last = school.subscriptions.at(0)
      return (
        last !== undefined &&
        last.status === "expired" &&
        last.periodEnd <= cutoff
      )
    })
    if (ended.length > 0) {
      await db.school.updateMany({
        where: { id: { in: ended.map((row) => row.id) } },
        data: { status: "readonly" },
      })
      ended.forEach((row) => changed.add(row.slug))
    }

    return {
      result: {
        trialsExpired: trials.length,
        paidExpired: paid.length,
        graceEnded: ended.length,
      },
      slugs: [...changed],
    }
  })

  // Status berubah: buang cache tenant agar berlaku seketika.
  slugs.forEach((slug) => invalidateTenantCache(slug))

  return result
}
