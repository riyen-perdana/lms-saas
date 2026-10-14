// Pendaftaran sekolah (LP-04). Hanya untuk host marketing; setelah berhasil,
// admin diarahkan ke halaman login di subdomain sekolah barunya.

import { useEffect, useState } from "react"
import { createFileRoute, redirect } from "@tanstack/react-router"

import { Container } from "@/components/marketing/section"
import { SiteFooter } from "@/components/marketing/closing"
import { SiteHeader } from "@/components/marketing/site-header"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  SCHOOL_LEVELS,
  SCHOOL_LEVEL_LABELS,
  registerSchoolSchema,
  slugSchema,
} from "@/features/registration/schema"
import {
  checkSlug,
  registerSchoolFn,
} from "@/features/registration/server/register"
import { seoMeta } from "@/lib/seo"
import { getTenantArea } from "@/lib/tenant/server"
import { cn } from "@/lib/utils"

export const Route = createFileRoute("/(marketing)/daftar")({
  staticData: { theme: "marketing" },
  beforeLoad: async () => {
    if ((await getTenantArea()) !== "marketing") {
      throw redirect({ to: "/login" })
    }
  },
  head: () => ({
    meta: seoMeta({
      title: "Daftar sekolah — EduSaaS",
      description:
        "Daftarkan sekolah Anda, pilih subdomain, dan mulai trial 30 hari tanpa kartu kredit.",
    }),
  }),
  component: RegisterPage,
})

type SlugState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "available" }
  | { status: "taken" }
  | { status: "invalid"; message: string }

type FieldErrors = Partial<Record<string, string>>

const selectClass =
  "h-8 w-full min-w-0 rounded-md border border-input bg-transparent px-2.5 text-xs outline-none focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50 aria-invalid:border-destructive"

function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string
  label: string
  hint?: string
  error?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  )
}

function RegisterPage() {
  const [slug, setSlug] = useState("")
  const [slugState, setSlugState] = useState<SlugState>({ status: "idle" })
  const [domain, setDomain] = useState("edusaas.id")
  const [errors, setErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  // Sebelum hydrate, submit akan jadi GET native dan membawa sandi ke URL.
  const [ready, setReady] = useState(false)
  const [done, setDone] = useState<{ loginUrl: string; slug: string } | null>(
    null
  )

  useEffect(() => {
    setReady(true)
    setDomain(window.location.host.replace(/^www\./, ""))
    // Teks yang sudah diketik sebelum hydrate tidak boleh hilang.
    const typed = document.getElementById("slug")
    if (typed instanceof HTMLInputElement) setSlug(typed.value)
  }, [])

  // Cek ketersediaan subdomain secara real-time (ditunda agar tidak
  // menembak server di setiap ketukan tombol).
  useEffect(() => {
    if (slug === "") {
      setSlugState({ status: "idle" })
      return
    }

    const parsed = slugSchema.safeParse(slug)
    if (!parsed.success) {
      setSlugState({ status: "invalid", message: parsed.error.issues[0].message })
      return
    }

    let cancelled = false
    setSlugState({ status: "checking" })

    const timer = setTimeout(() => {
      checkSlug({ data: { slug: parsed.data } })
        .then(({ available }) => {
          if (!cancelled) {
            setSlugState({ status: available ? "available" : "taken" })
          }
        })
        .catch(() => {
          if (!cancelled) setSlugState({ status: "idle" })
        })
    }, 400)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [slug])

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError(null)

    const parsed = registerSchoolSchema.safeParse(
      Object.fromEntries(new FormData(event.currentTarget))
    )
    if (!parsed.success) {
      const next: FieldErrors = {}
      for (const issue of parsed.error.issues) {
        next[String(issue.path[0])] ??= issue.message
      }
      setErrors(next)
      return
    }
    setErrors({})

    setPending(true)
    try {
      const result = await registerSchoolFn({ data: parsed.data })

      if (result.ok) {
        setDone({ loginUrl: result.loginUrl, slug: result.slug })
        return
      }

      if (result.code === "SLUG_TAKEN") {
        setSlugState({ status: "taken" })
        setErrors({ slug: result.message })
      } else if (result.code === "NPSN_TAKEN") {
        setErrors({ npsn: result.message })
      } else if (result.code === "RATE_LIMITED") {
        setFormError(result.message)
      } else {
        setErrors({ adminEmail: result.message })
      }
    } catch {
      setFormError("Pendaftaran gagal diproses. Periksa koneksi lalu coba lagi.")
    } finally {
      setPending(false)
    }
  }

  const slugError =
    errors.slug ??
    (slugState.status === "invalid"
      ? slugState.message
      : slugState.status === "taken"
        ? "Subdomain sudah dipakai sekolah lain."
        : undefined)

  const slugHint =
    slugState.status === "checking"
      ? "Memeriksa ketersediaan..."
      : slugState.status === "available"
        ? `Tersedia: ${slug.trim().toLowerCase()}.${domain}`
        : `Alamat sekolah Anda: ${slug.trim().toLowerCase() || "namasekolah"}.${domain}`

  return (
    <div className="bg-background text-foreground">
      <SiteHeader />
      <main className="py-12 md:py-20">
        <Container className="max-w-xl">
          {done ? (
            <section className="flex flex-col gap-4" aria-live="polite">
              <h1 className="text-mk-h2">Sekolah Anda sudah terdaftar.</h1>
              <p className="text-mk-body text-muted-foreground">
                Trial 30 hari dimulai. Masuk dengan email dan kata sandi yang
                baru saja Anda buat di alamat sekolah:
              </p>
              <p className="rounded-md border border-border bg-surface-subtle px-3 py-2 text-sm font-medium break-all">
                {done.loginUrl}
              </p>
              <a
                href={done.loginUrl}
                className={cn(buttonVariants({ size: "lg" }), "w-fit rounded-md px-4")}
              >
                Masuk ke sekolah
              </a>
            </section>
          ) : (
            <>
              <header className="flex flex-col gap-3">
                <h1 className="text-mk-h2">Daftarkan sekolah Anda.</h1>
                <p className="text-mk-body text-muted-foreground">
                  Trial 30 hari, tanpa kartu kredit. Anda akan menjadi admin
                  sekolah.
                </p>
              </header>

              <form
                method="post"
                onSubmit={onSubmit}
                noValidate
                className="mt-8 flex flex-col gap-5"
              >
                <Field id="schoolName" label="Nama sekolah" error={errors.schoolName}>
                  <Input
                    id="schoolName"
                    name="schoolName"
                    autoComplete="organization"
                    aria-invalid={!!errors.schoolName}
                    required
                  />
                </Field>

                <div className="grid gap-5 sm:grid-cols-2">
                  <Field
                    id="npsn"
                    label="NPSN (opsional)"
                    hint="8 digit, dari data Dapodik."
                    error={errors.npsn}
                  >
                    <Input
                      id="npsn"
                      name="npsn"
                      inputMode="numeric"
                      aria-invalid={!!errors.npsn}
                    />
                  </Field>
                  <Field id="level" label="Jenjang" error={errors.level}>
                    <select
                      id="level"
                      name="level"
                      defaultValue=""
                      className={selectClass}
                      aria-invalid={!!errors.level}
                      required
                    >
                      <option value="" disabled>
                        Pilih jenjang
                      </option>
                      {SCHOOL_LEVELS.map((level) => (
                        <option key={level} value={level}>
                          {SCHOOL_LEVEL_LABELS[level]}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>

                <Field
                  id="slug"
                  label="Subdomain sekolah"
                  hint={slugHint}
                  error={slugError}
                >
                  <Input
                    id="slug"
                    name="slug"
                    defaultValue={slug}
                    onChange={(event) => setSlug(event.target.value)}
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    aria-invalid={!!slugError}
                    aria-describedby={slugError ? "slug-error" : "slug-hint"}
                    required
                  />
                </Field>

                <fieldset className="flex flex-col gap-5 border-t border-border pt-5">
                  <legend className="sr-only">Akun admin sekolah</legend>
                  <Field id="adminName" label="Nama admin" error={errors.adminName}>
                    <Input
                      id="adminName"
                      name="adminName"
                      autoComplete="name"
                      aria-invalid={!!errors.adminName}
                      required
                    />
                  </Field>
                  <Field id="adminEmail" label="Email admin" error={errors.adminEmail}>
                    <Input
                      id="adminEmail"
                      name="adminEmail"
                      type="email"
                      autoComplete="email"
                      aria-invalid={!!errors.adminEmail}
                      required
                    />
                  </Field>
                  <Field
                    id="password"
                    label="Kata sandi"
                    hint="Minimal 8 karakter."
                    error={errors.password}
                  >
                    <Input
                      id="password"
                      name="password"
                      type="password"
                      autoComplete="new-password"
                      aria-invalid={!!errors.password}
                      required
                    />
                  </Field>
                </fieldset>

                {formError ? (
                  <p role="alert" className="text-sm text-destructive">
                    {formError}
                  </p>
                ) : null}

                <Button
                  type="submit"
                  size="lg"
                  className="rounded-md"
                  disabled={
                    pending ||
                    !ready ||
                    slugState.status === "checking" ||
                    slugState.status === "taken"
                  }
                >
                  {pending ? "Memproses..." : "Daftar & mulai trial"}
                </Button>
              </form>
            </>
          )}
        </Container>
      </main>
      <SiteFooter />
    </div>
  )
}
