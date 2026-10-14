// Mengatur kata sandi baru lewat tautan email (US-02). Tautan datang dari
// Better Auth sebagai /atur-ulang-sandi?token=... (atau ?error=INVALID_TOKEN).

import { useEffect, useState } from "react"
import { Link, createFileRoute } from "@tanstack/react-router"
import { z } from "zod"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { authClient } from "@/lib/auth-client"
import { NOINDEX_META } from "@/lib/seo"

const searchSchema = z.object({
  token: z.string().optional().catch(undefined),
  error: z.string().optional().catch(undefined),
})

export const Route = createFileRoute("/atur-ulang-sandi")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [{ title: "Atur ulang kata sandi — EduSaaS" }, ...NOINDEX_META],
  }),
  component: ResetPasswordPage,
})

const passwordSchema = z
  .object({
    password: z
      .string()
      .min(8, "Kata sandi minimal 8 karakter")
      .max(128, "Kata sandi maksimal 128 karakter"),
    confirm: z.string(),
  })
  .refine((value) => value.password === value.confirm, {
    message: "Konfirmasi kata sandi tidak sama",
    path: ["confirm"],
  })

function ResetPasswordPage() {
  const { token, error: linkError } = Route.useSearch()
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [done, setDone] = useState(false)
  const [ready, setReady] = useState(false)
  useEffect(() => setReady(true), [])

  if (!token || linkError) {
    return (
      <main className="mx-auto flex min-h-svh max-w-sm flex-col justify-center gap-4 p-6">
        <h1 className="text-ds-page-title font-medium">Tautan tidak valid</h1>
        <p role="alert" className="text-ds-body text-muted-foreground">
          Tautan atur ulang kata sandi sudah kedaluwarsa atau sudah dipakai.
          Minta tautan baru.
        </p>
        <Link
          to="/lupa-sandi"
          className="text-ds-body underline underline-offset-4"
        >
          Minta tautan baru
        </Link>
      </main>
    )
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    const parsed = passwordSchema.safeParse(
      Object.fromEntries(new FormData(event.currentTarget))
    )
    if (!parsed.success) {
      setError(parsed.error.issues[0].message)
      return
    }

    setPending(true)
    try {
      const result = await authClient.resetPassword({
        newPassword: parsed.data.password,
        token,
      })
      if (result.error) {
        setError(
          "Tautan sudah kedaluwarsa atau sudah dipakai. Minta tautan baru."
        )
        return
      }
      setDone(true)
    } catch {
      setError("Permintaan gagal diproses. Periksa koneksi lalu coba lagi.")
    } finally {
      setPending(false)
    }
  }

  if (done) {
    return (
      <main className="mx-auto flex min-h-svh max-w-sm flex-col justify-center gap-4 p-6">
        <h1 className="text-ds-page-title font-medium">
          Kata sandi diperbarui
        </h1>
        <p role="status" className="text-ds-body text-muted-foreground">
          Kata sandi Anda sudah diganti dan semua sesi lama dikeluarkan. Silakan
          masuk dengan kata sandi baru.
        </p>
        <Link to="/login" className="text-ds-body underline underline-offset-4">
          Ke halaman masuk
        </Link>
      </main>
    )
  }

  return (
    <main className="mx-auto flex min-h-svh max-w-sm flex-col justify-center gap-6 p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-ds-page-title font-medium">
          Atur ulang kata sandi
        </h1>
        <p className="text-ds-body text-muted-foreground">
          Buat kata sandi baru untuk akun Anda.
        </p>
      </header>

      <form
        method="post"
        onSubmit={onSubmit}
        className="flex flex-col gap-4"
        noValidate
      >
        <div className="flex flex-col gap-2">
          <Label htmlFor="password">Kata sandi baru</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="confirm">Ulangi kata sandi baru</Label>
          <Input
            id="confirm"
            name="confirm"
            type="password"
            autoComplete="new-password"
            required
          />
        </div>

        {error ? (
          <p role="alert" className="text-ds-body text-destructive">
            {error}
          </p>
        ) : null}

        <Button type="submit" disabled={pending || !ready}>
          {pending ? "Memproses..." : "Simpan kata sandi"}
        </Button>
      </form>
    </main>
  )
}
