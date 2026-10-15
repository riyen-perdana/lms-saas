// Halaman publik /gabung (OB-05): orang tua menukar kode undangan.
// Belum login = buat akun baru; sudah login = cukup kode.

import { useState } from "react"
import { Link } from "@tanstack/react-router"

import { Field, useHydrated } from "@/components/dashboard/form-field"
import { PageHeader } from "@/components/dashboard/page-header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { AccessState } from "@/features/auth/server/access"
import {
  joinExistingSchema,
  joinNewSchema,
} from "@/features/parent-link/schema"
import {
  joinWithNewAccountFn,
  joinWithSessionFn,
} from "@/features/parent-link/server/parent-link"

type Errors = Partial<Record<string, string>>

export function JoinPage({
  schoolName,
  access,
}: {
  schoolName: string
  access: AccessState
}) {
  const ready = useHydrated()
  const [errors, setErrors] = useState<Errors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [done, setDone] = useState<{
    studentName: string
    loggedIn: boolean
  } | null>(null)

  const loggedIn = access.status === "ok" || access.status === "no-access"
  const wrongRole = access.status === "ok" && access.role !== "parent"

  if (access.status === "suspended") {
    return (
      <main className="mx-auto flex max-w-md flex-col gap-6 px-4 py-12">
        <PageHeader title="Tautkan akun orang tua" />
        <p className="rounded-md border border-border p-4 text-ds-body text-muted-foreground">
          Sekolah ini sedang tidak dapat menerima pendaftaran orang tua.
        </p>
      </main>
    )
  }

  if (wrongRole) {
    return (
      <main className="mx-auto flex max-w-md flex-col gap-6 px-4 py-12">
        <PageHeader title="Tautkan akun orang tua" />
        <p className="rounded-md border border-border p-4 text-ds-body text-muted-foreground">
          Anda sedang masuk sebagai akun staf {schoolName}. Keluar dulu, lalu
          buka halaman ini lagi untuk mendaftar sebagai orang tua dengan email
          yang berbeda.
        </p>
        <Link
          to="/beranda"
          className="text-ds-body text-primary underline-offset-4 hover:underline"
        >
          Kembali ke beranda
        </Link>
      </main>
    )
  }

  if (done) {
    return (
      <main className="mx-auto flex max-w-md flex-col gap-6 px-4 py-12">
        <PageHeader title="Berhasil ditautkan" />
        <p
          role="status"
          className="rounded-md border border-border p-4 text-ds-body"
        >
          Akun Anda sudah tertaut ke {done.studentName}.
          {done.loggedIn
            ? ""
            : " Silakan masuk dengan email dan kata sandi yang baru dibuat."}
        </p>
        <Link
          to={done.loggedIn ? "/beranda" : "/login"}
          className="text-ds-body text-primary underline-offset-4 hover:underline"
        >
          {done.loggedIn ? "Lihat beranda" : "Masuk"}
        </Link>
      </main>
    )
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError(null)
    const form = new FormData(event.currentTarget)

    const parsed = loggedIn
      ? joinExistingSchema.safeParse({ code: form.get("code") })
      : joinNewSchema.safeParse({
          code: form.get("code"),
          name: form.get("name"),
          email: form.get("email"),
          password: form.get("password"),
        })
    if (!parsed.success) {
      const next: Errors = {}
      for (const issue of parsed.error.issues)
        next[String(issue.path[0])] ??= issue.message
      setErrors(next)
      return
    }
    setErrors({})

    setPending(true)
    try {
      const result = loggedIn
        ? await joinWithSessionFn({
            data: joinExistingSchema.parse(parsed.data),
          })
        : await joinWithNewAccountFn({ data: joinNewSchema.parse(parsed.data) })
      if (!result.ok) {
        setFormError(result.message)
        return
      }
      setDone({ studentName: result.studentName, loggedIn })
    } catch {
      setFormError("Gagal memproses. Periksa koneksi lalu coba lagi.")
    } finally {
      setPending(false)
    }
  }

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-4 py-12">
      <PageHeader
        title="Tautkan akun orang tua"
        description={
          loggedIn
            ? `Masukkan kode undangan dari ${schoolName} untuk menautkan anak ke akun Anda.`
            : `Masukkan kode undangan dari ${schoolName} dan buat akun orang tua. Sudah punya akun? Masuk dulu, lalu buka halaman ini lagi.`
        }
      />

      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <Field
          id="join-code"
          label="Kode undangan"
          error={errors.code}
          hint="Contoh: ABCD-2345"
        >
          <Input
            id="join-code"
            name="code"
            autoComplete="off"
            className="font-mono uppercase"
            aria-invalid={!!errors.code}
          />
        </Field>

        {loggedIn ? null : (
          <>
            <Field id="join-name" label="Nama lengkap" error={errors.name}>
              <Input
                id="join-name"
                name="name"
                autoComplete="name"
                aria-invalid={!!errors.name}
              />
            </Field>
            <Field id="join-email" label="Email" error={errors.email}>
              <Input
                id="join-email"
                name="email"
                type="email"
                autoComplete="email"
                aria-invalid={!!errors.email}
              />
            </Field>
            <Field
              id="join-password"
              label="Kata sandi"
              error={errors.password}
              hint="Minimal 8 karakter."
            >
              <Input
                id="join-password"
                name="password"
                type="password"
                autoComplete="new-password"
                aria-invalid={!!errors.password}
              />
            </Field>
          </>
        )}

        {formError ? (
          <p role="alert" className="text-xs text-destructive">
            {formError}
          </p>
        ) : null}

        <div>
          <Button
            type="submit"
            className="rounded-md"
            disabled={!ready || pending}
          >
            {pending
              ? "Memproses..."
              : loggedIn
                ? "Tautkan anak"
                : "Daftar dan tautkan"}
          </Button>
        </div>
      </form>
    </main>
  )
}
