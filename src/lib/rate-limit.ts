// Pembatasan laju berbasis PostgreSQL (jendela tetap). Disimpan di database
// agar berlaku di semua proses aplikasi, bukan per proses.

import { prisma } from "@/db/client"

export type RateLimitRule = {
  /** Nama bucket, mis. "register". */
  bucket: string
  /** Jumlah permintaan maksimum per jendela. */
  limit: number
  /** Lama jendela dalam detik. */
  windowSeconds: number
}

export class RateLimitError extends Error {
  constructor(public readonly retryAfterSeconds: number) {
    super("Terlalu banyak percobaan. Coba lagi beberapa saat lagi.")
    this.name = "RateLimitError"
  }
}

/**
 * Menghitung satu permintaan untuk `subject` (mis. alamat IP). Melempar
 * RateLimitError bila batas jendela terlampaui. Atomik lewat satu upsert.
 */
export async function consumeRateLimit(
  rule: RateLimitRule,
  subject: string,
  now: Date = new Date()
): Promise<void> {
  const key = `${rule.bucket}:${subject}`
  const resetAt = new Date(now.getTime() + rule.windowSeconds * 1000)

  const rows = await prisma.$queryRaw<{ count: number; reset_at: Date }[]>`
    INSERT INTO rate_limits ("key", "count", "reset_at")
    VALUES (${key}, 1, ${resetAt})
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN rate_limits."reset_at" <= ${now} THEN 1 ELSE rate_limits."count" + 1 END,
      "reset_at" = CASE WHEN rate_limits."reset_at" <= ${now} THEN ${resetAt} ELSE rate_limits."reset_at" END
    RETURNING "count", "reset_at"`

  const row = rows[0]
  if (row.count > rule.limit) {
    throw new RateLimitError(
      Math.max(1, Math.ceil((row.reset_at.getTime() - now.getTime()) / 1000))
    )
  }
}

/**
 * Memeriksa `subject` TANPA menambah hitungan. Melempar RateLimitError bila
 * batas sudah tercapai dan jendelanya belum lewat. Dipakai bersama
 * `consumeRateLimit` untuk batas yang hanya menghitung kegagalan (login PIN):
 * cek dulu, catat setelah gagal.
 */
export async function assertRateLimit(
  rule: RateLimitRule,
  subject: string,
  now: Date = new Date()
): Promise<void> {
  const row = await prisma.rateLimit.findUnique({
    where: { key: `${rule.bucket}:${subject}` },
  })
  if (!row || row.resetAt <= now || row.count < rule.limit) return

  throw new RateLimitError(
    Math.max(1, Math.ceil((row.resetAt.getTime() - now.getTime()) / 1000))
  )
}

/** Menghapus penghitung yang jendelanya sudah lewat (dipanggil job berkala). */
export async function purgeExpiredRateLimits(
  now: Date = new Date()
): Promise<number> {
  const result = await prisma.rateLimit.deleteMany({
    where: { resetAt: { lte: now } },
  })

  return result.count
}

/** Alamat klien dari header proxy; "unknown" bila tidak ada. */
export function clientAddress(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim()

  return forwarded || headers.get("x-real-ip") || "unknown"
}
