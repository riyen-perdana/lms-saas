// Antrean job (pg-boss) — AGENTS.md "src/lib/ (jobs)".
// ---------------------------------------------------------------------------
// Dipakai untuk pekerjaan yang tidak boleh memblokir request: pengiriman email
// (dengan retry) dan job terjadwal kedaluwarsa langganan.
//
// pg-boss membuat skema `pgboss` sendiri, jadi koneksinya memakai
// DATABASE_URL (role pemilik), BUKAN DATABASE_APP_URL yang dibatasi RLS. Data
// job bukan data tenant dan tidak boleh berisi data pribadi selain yang perlu.
//
// Worker saat ini berjalan di proses aplikasi (hosting sementara lokal) dan
// dimulai lazy pada request pertama lewat ensureJobsStarted(). Saat deploy,
// pisahkan ke proses worker sendiri.

import { PgBoss } from "pg-boss"

import { purgeExpiredRateLimits } from "@/lib/rate-limit"
import { expireSubscriptions } from "@/features/subscription/expiry"
import { sendEmail, type EmailMessage } from "@/lib/email"

export const QUEUES = {
  sendEmail: "send-email",
  expireSubscriptions: "expire-subscriptions",
} as const

const EXPIRE_CRON = "*/30 * * * *" // setiap 30 menit

const globalForJobs = globalThis as unknown as {
  __edusaasBoss?: Promise<PgBoss>
}

async function startBoss(): Promise<PgBoss> {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error("DATABASE_URL belum diisi; pg-boss butuh koneksi database.")
  }

  const boss = new PgBoss({ connectionString, max: 4 })
  boss.on("error", (error) => console.error("[jobs] pg-boss:", error))
  await boss.start()

  await boss.createQueue(QUEUES.sendEmail, {
    retryLimit: 5,
    retryDelay: 30,
    retryBackoff: true,
  })
  await boss.createQueue(QUEUES.expireSubscriptions)

  await boss.work<EmailMessage>(QUEUES.sendEmail, async (jobs) => {
    // Gagal melempar error agar pg-boss mengulang sesuai retry queue.
    for (const job of jobs) await sendEmail(job.data)
  })

  await boss.work(QUEUES.expireSubscriptions, async () => {
    const result = await expireSubscriptions()
    console.info("[jobs] kedaluwarsa langganan:", result)
    await purgeExpiredRateLimits()
  })
  await boss.schedule(QUEUES.expireSubscriptions, EXPIRE_CRON)

  return boss
}

function getBoss(): Promise<PgBoss> {
  globalForJobs.__edusaasBoss ??= startBoss().catch((error: unknown) => {
    // Izinkan percobaan ulang pada request berikutnya.
    globalForJobs.__edusaasBoss = undefined
    throw error
  })

  return globalForJobs.__edusaasBoss
}

/** Memulai pg-boss + worker bila belum; aman dipanggil di setiap request. */
export function ensureJobsStarted(): void {
  if (process.env.VITEST) return

  getBoss().catch((error: unknown) => {
    console.error("[jobs] gagal memulai pg-boss:", error)
  })
}

/**
 * Mengantrekan email. Di test (VITEST) dikirim langsung lewat driver, supaya
 * test tidak bergantung pada worker. Bila antrean gagal, email dikirim langsung
 * sebagai cadangan agar tautan verifikasi/reset tidak hilang.
 */
export async function enqueueEmail(message: EmailMessage): Promise<void> {
  if (process.env.VITEST) {
    await sendEmail(message)
    return
  }

  try {
    const boss = await getBoss()
    await boss.send(QUEUES.sendEmail, message)
  } catch (error) {
    console.error("[jobs] antrean email gagal, kirim langsung:", error)
    await sendEmail(message)
  }
}
