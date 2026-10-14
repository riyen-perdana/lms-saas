// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest"

import { clearMemoryOutbox, getMemoryOutbox, sendEmail } from "@/lib/email"
import { resetPasswordEmail, verificationEmail } from "@/lib/email/templates"

beforeEach(() => clearMemoryOutbox())

describe("sendEmail (driver memory)", () => {
  it("menampung email di kotak keluar", async () => {
    await sendEmail({ to: "a@sekolah.test", subject: "Uji", text: "isi" })

    expect(getMemoryOutbox()).toEqual([
      { to: "a@sekolah.test", subject: "Uji", text: "isi" },
    ])
  })
})

describe("template", () => {
  it("memuat tautan di teks dan html, berbahasa Indonesia", () => {
    const url = "http://x.localhost:3000/api/auth/verify-email?token=abc"
    const message = verificationEmail({ to: "a@b.test", name: "Budi", url })

    expect(message.text).toContain(url)
    expect(message.html).toContain("href=")
    expect(message.subject).toContain("Verifikasi")
    expect(
      resetPasswordEmail({ to: "a@b.test", name: "Budi", url }).subject
    ).toContain("Atur ulang")
  })

  it("meloloskan karakter HTML pada nama (anti injeksi)", () => {
    const message = verificationEmail({
      to: "a@b.test",
      name: '<script>alert("x")</script>',
      url: "http://x.test/?a=1&b=2",
    })

    expect(message.html).not.toContain("<script>")
    expect(message.html).toContain("&lt;script&gt;")
    expect(message.html).toContain("a=1&amp;b=2")
  })
})
