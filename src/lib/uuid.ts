// UUID v7 (RFC 9562) — sesuai PRD §7: seluruh primary key memakai UUID v7.
// ---------------------------------------------------------------------------
// Prisma `@default(uuid(7))` membangkitkan id di sisi Prisma Client, sehingga
// baris yang disisipkan lewat SQL mentah (impor Excel, job pg-boss, seed)
// tetap perlu pembangkitan id yang sama. Better Auth juga membangkitkan id
// sendiri lewat `advanced.database.generateId`, dan kolom `id` bertipe uuid —
// tanpa helper ini Better Auth akan menulis id acak yang tidak bisa masuk ke
// kolom uuid.

import { randomUUID } from "node:crypto"

/**
 * Menghasilkan UUID v7 dari timestamp milliseconds yang diberikan.
 *
 * Layout 128 bit (RFC 9562 §5.7):
 *   bits 0-47   unix_ts_ms
 *   bits 48-51  version = 7
 *   bits 52-63  rand_a
 *   bits 64-65  variant = 0b10
 *   bits 66-127 rand_b
 *
 * Karena 48 bit pertama berisi waktu, UUID v7 terurut menaik menurut waktu
 * pembuatan: indeks btree tetap padat dan `ORDER BY id` setara urutan waktu.
 */
export function uuidv7(now: Date = new Date()): string {
  const ms = now.getTime()

  if (!Number.isSafeInteger(ms) || ms < 0) {
    throw new RangeError(`uuidv7: timestamp tidak valid (${now.toISOString()})`)
  }

  // 48 bit = 12 digit heksadesimal.
  const timestamp = ms.toString(16).padStart(12, "0").slice(-12)
  const random = randomUUID().replaceAll("-", "")

  const randA = random.slice(0, 3)
  const randB = random.slice(7, 19)
  // Mask 0x3fff membuang dua bit paling atas, lalu 0x8000 memasang pola variant.
  const variant = ((Number.parseInt(random.slice(3, 7), 16) & 0x3fff) | 0x8000)
    .toString(16)
    .padStart(4, "0")

  const hex = `${timestamp}7${randA}${variant}${randB}`

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-")
}

const UUID_V7_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

export function isUuidV7(value: string): boolean {
  return UUID_V7_PATTERN.test(value)
}

/** Membaca kembali timestamp yang tertanam pada UUID v7 (milidetik epoch). */
export function uuidV7Timestamp(value: string): number {
  if (!isUuidV7(value)) {
    throw new TypeError(`Bukan UUID v7: ${value}`)
  }

  return Number.parseInt(value.replaceAll("-", "").slice(0, 12), 16)
}