// Adapter email (AGENTS.md "src/lib/ (email)").
// ---------------------------------------------------------------------------
// Aplikasi hanya memanggil `sendEmail`; driver dipilih lewat EMAIL_DRIVER:
//   console  (default di development) : cetak ke konsol dan simpan ke
//            `.email-outbox/*.json` — tanpa akun penyedia, cocok untuk uji lokal.
//   memory   : tampung di array proses ini (dipakai test).
// Penyedia nyata (Resend, SMTP, ...) ditambahkan sebagai driver baru di sini
// tanpa mengubah pemanggil. Produksi WAJIB mengisi EMAIL_DRIVER secara eksplisit.

import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"

export interface EmailMessage {
  to: string
  subject: string
  text: string
  html?: string
}

interface EmailDriver {
  send: (message: EmailMessage) => Promise<void>
}

const memoryOutbox: EmailMessage[] = []

/** Hanya untuk test: isi kotak keluar driver `memory`. */
export function getMemoryOutbox(): readonly EmailMessage[] {
  return memoryOutbox
}

export function clearMemoryOutbox(): void {
  memoryOutbox.length = 0
}

const memoryDriver: EmailDriver = {
  send(message) {
    memoryOutbox.push(message)
    return Promise.resolve()
  },
}

export const OUTBOX_DIR = ".email-outbox"

const consoleDriver: EmailDriver = {
  async send(message) {
    console.info(
      `\n[email] Ke: ${message.to}\n[email] Subjek: ${message.subject}\n${message.text}\n`
    )

    await mkdir(OUTBOX_DIR, { recursive: true })
    const safeTo = message.to.replace(/[^a-z0-9@._-]/gi, "_")
    const file = join(OUTBOX_DIR, `${Date.now()}-${safeTo}.json`)
    await writeFile(file, JSON.stringify(message, null, 2), "utf8")
  },
}

function resolveDriver(): EmailDriver {
  const name =
    process.env.EMAIL_DRIVER ??
    (process.env.NODE_ENV === "production" ? undefined : "console")

  switch (name) {
    case "memory":
      return memoryDriver
    case "console":
      return consoleDriver
    default:
      throw new Error(
        `EMAIL_DRIVER tidak dikenali atau belum diisi (${String(name)}). Gunakan "console" atau "memory", atau tambahkan driver penyedia email.`
      )
  }
}

export async function sendEmail(message: EmailMessage): Promise<void> {
  await resolveDriver().send(message)
}
