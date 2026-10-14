// Template email (teks UI berbahasa Indonesia, AGENTS.md aturan 6).

import type { EmailMessage } from "@/lib/email"

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
}

function layout(
  to: string,
  subject: string,
  intro: string,
  action: { label: string; url: string },
  outro: string
): EmailMessage {
  const text = [intro, "", `${action.label}: ${action.url}`, "", outro].join(
    "\n"
  )
  const html = `<p>${escapeHtml(intro)}</p><p><a href="${escapeHtml(
    action.url
  )}">${escapeHtml(action.label)}</a></p><p>${escapeHtml(outro)}</p>`

  return { to, subject, text, html }
}

export function verificationEmail(input: {
  to: string
  name: string
  url: string
}): EmailMessage {
  return layout(
    input.to,
    "Verifikasi email Anda — EduSaaS",
    `Halo ${input.name}, terima kasih telah mendaftar di EduSaaS. Verifikasi email Anda dengan membuka tautan berikut (berlaku 24 jam).`,
    { label: "Verifikasi email", url: input.url },
    "Jika Anda tidak merasa mendaftar, abaikan email ini."
  )
}

export function resetPasswordEmail(input: {
  to: string
  name: string
  url: string
}): EmailMessage {
  return layout(
    input.to,
    "Atur ulang kata sandi — EduSaaS",
    `Halo ${input.name}, kami menerima permintaan untuk mengatur ulang kata sandi akun Anda. Tautan berikut berlaku 1 jam.`,
    { label: "Atur ulang kata sandi", url: input.url },
    "Jika Anda tidak memintanya, abaikan email ini; kata sandi Anda tidak berubah."
  )
}

export function contactNotificationEmail(input: {
  to: string
  name: string
  email: string
  schoolName?: string
  message: string
}): EmailMessage {
  const lines = [
    `Nama: ${input.name}`,
    `Email: ${input.email}`,
    `Sekolah: ${input.schoolName ?? "-"}`,
    "",
    input.message,
  ]

  return {
    to: input.to,
    subject: `Pesan kontak baru dari ${input.name} — EduSaaS`,
    text: lines.join("\n"),
    html: lines.map((line) => `<p>${escapeHtml(line)}</p>`).join(""),
  }
}
