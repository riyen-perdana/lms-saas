// Permintaan atur ulang kata sandi (US-02). Pesan hasil selalu sama, ada atau
// tidaknya akun, agar tidak bisa dipakai menebak email yang terdaftar.

import { useEffect, useState } from "react"
import { Link, createFileRoute } from "@tanstack/react-router"
import { z } from "zod"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { authClient } from "@/lib/auth-client"
import { NOINDEX_META } from "@/lib/seo"

export const Route = createFileRoute("/lupa-sandi")({
  head: () => ({
    meta: [{ title: "Lupa kata sandi — EduSaaS" }, ...NOINDEX_META],
  }),
  component: ForgotPasswordPage,
})

const emailSchema = z
  .string()
  .trim()
  .min(1, "Email wajib diisi")
  .email("Format email tidak valid")

function ForgotPasswordPage() {
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [sent, setSent] = useState(false)
  // Sebelum hydrate, submit akan jadi GET native dan membawa data ke URL.
  const [ready, setReady] = useState(false)
  useEffect(() => setReady(true), [])

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    const parsed = emailSchema.safeParse(
      new FormData(event.currentTarget).get("email")
    )
    if (!parsed.success) {
      setError(parsed.error.issues[0].message)
      return
    }

    setPending(true)
    try {
      await authClient.requestPasswordReset({
        email: parsed.data,
        redirectTo: `${window.location.origin}/atur-ulang-sandi`,
      })
      setSent(true)
    } catch {
      setError("Permintaan gagal diproses. Periksa koneksi lalu coba lagi.")
    } finally {
      setPending(false)
    }
  }

  return (
    <main className="mx-auto flex min-h-svh max-w-sm flex-col justify-center gap-6 p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-ds-page-title font-medium">Lupa kata sandi</h1>
        <p className="text-ds-body text-muted-foreground">
          Masukkan email akun Anda. Kami akan mengirim tautan untuk mengatur
          ulang kata sandi.
        </p>
      </header>

      {sent ? (
        <p
          role="status"
          className="rounded-md border border-border p-3 text-ds-body"
        >
          Jika email tersebut terdaftar, tautan atur ulang kata sandi sudah
          dikirim. Periksa kotak masuk Anda; tautan berlaku 1 jam.
        </p>
      ) : (
        <form
          method="post"
          onSubmit={onSubmit}
          className="flex flex-col gap-4"
          noValidate
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="username"
              required
            />
          </div>

          {error ? (
            <p role="alert" className="text-ds-body text-destructive">
              {error}
            </p>
          ) : null}

          <Button type="submit" disabled={pending || !ready}>
            {pending ? "Memproses..." : "Kirim tautan"}
          </Button>
        </form>
      )}

      <Link
        to="/login"
        className="text-ds-body text-muted-foreground underline underline-offset-4"
      >
        Kembali ke halaman masuk
      </Link>
    </main>
  )
}
