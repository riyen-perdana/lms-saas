// Halaman login sekolah (US-01). Hanya bermakna di subdomain sekolah: sesi
// berlaku per subdomain, dan akses ditentukan oleh `memberships` sekolah itu.

import { useEffect, useState } from "react"
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { loginSchema } from "@/features/auth/schema"
import { getAccess } from "@/features/auth/server/access"
import { signIn, signOut } from "@/lib/auth-client"

export const Route = createFileRoute("/login")({
  loader: async () => {
    const context = await getAccess()

    if (context.access.status === "ok") {
      throw redirect({ to: "/" })
    }

    return context
  },
  component: LoginPage,
})

function LoginPage() {
  const { area, schoolName } = Route.useLoaderData()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  // Sebelum hydrate, submit akan jadi GET native dan membawa sandi ke URL.
  const [ready, setReady] = useState(false)
  useEffect(() => setReady(true), [])

  if (area !== "school" || !schoolName) {
    return (
      <main className="mx-auto flex min-h-svh max-w-sm flex-col justify-center gap-2 p-6">
        <h1 className="text-ds-page-title font-medium">Login sekolah</h1>
        <p className="text-ds-body text-muted-foreground">
          Buka alamat sekolah Anda (contoh: namasekolah.edusaas.id) untuk masuk.
        </p>
      </main>
    )
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    const parsed = loginSchema.safeParse(
      Object.fromEntries(new FormData(event.currentTarget))
    )
    if (!parsed.success) {
      setError(parsed.error.issues[0].message)
      return
    }

    setPending(true)
    try {
      const result = await signIn.email(parsed.data)
      if (result.error) {
        setError("Email atau kata sandi salah.")
        return
      }

      // Sesi valid belum berarti boleh masuk: cek keanggotaan di sekolah ini.
      const { access } = await getAccess()
      if (access.status !== "ok") {
        await signOut()
        setError("Akun ini tidak terdaftar di sekolah ini.")
        return
      }

      await navigate({ to: "/" })
    } finally {
      setPending(false)
    }
  }

  return (
    <main className="mx-auto flex min-h-svh max-w-sm flex-col justify-center gap-6 p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-ds-page-title font-medium">Masuk</h1>
        <p className="text-ds-body text-muted-foreground">{schoolName}</p>
      </header>

      <form method="post" onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
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
        <div className="flex flex-col gap-2">
          <Label htmlFor="password">Kata sandi</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </div>

        {error ? (
          <p role="alert" className="text-ds-body text-destructive">
            {error}
          </p>
        ) : null}

        <Button type="submit" disabled={pending || !ready}>
          {pending ? "Memproses..." : "Masuk"}
        </Button>
      </form>
    </main>
  )
}
