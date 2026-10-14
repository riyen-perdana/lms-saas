// Kontak & permintaan demo (LP-05). Pesan disimpan di database.

import { useEffect, useState } from "react"
import { createFileRoute, redirect } from "@tanstack/react-router"

import { SiteFooter } from "@/components/marketing/closing"
import { Container } from "@/components/marketing/section"
import { SiteHeader } from "@/components/marketing/site-header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { contactSchema } from "@/features/contact/schema"
import { sendContactFn } from "@/features/contact/server/contact"
import { seoMeta } from "@/lib/seo"
import { getTenantArea } from "@/lib/tenant/server"

export const Route = createFileRoute("/(marketing)/kontak")({
  staticData: { theme: "marketing" },
  beforeLoad: async () => {
    if ((await getTenantArea()) !== "marketing") throw redirect({ to: "/login" })
  },
  head: () => ({
    meta: seoMeta({
      title: "Kontak & demo — EduSaaS",
      description:
        "Hubungi tim EduSaaS untuk jadwal demo, paket Enterprise, atau pertanyaan seputar penerapan di sekolah Anda.",
    }),
  }),
  component: ContactPage,
})

type FieldErrors = Partial<Record<string, string>>

const textareaClass =
  "min-h-28 w-full rounded-md border border-input bg-transparent px-2.5 py-2 text-xs outline-none focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50 aria-invalid:border-destructive"

const FIELDS = [
  ["name", "Nama", "name", "text"],
  ["email", "Email", "email", "email"],
  ["schoolName", "Nama sekolah (opsional)", "organization", "text"],
] as const

function ContactPage() {
  const [errors, setErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [done, setDone] = useState(false)
  // Sebelum hydrate, submit akan jadi GET native.
  const [ready, setReady] = useState(false)
  useEffect(() => setReady(true), [])

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError(null)

    const parsed = contactSchema.safeParse(
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
      const result = await sendContactFn({ data: parsed.data })
      if (result.ok) setDone(true)
      else setFormError(result.message)
    } catch {
      setFormError("Pesan gagal dikirim. Periksa koneksi lalu coba lagi.")
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="bg-background text-foreground">
      <SiteHeader />
      <main className="py-12 md:py-20">
        <Container className="max-w-xl">
          {done ? (
            <section className="flex flex-col gap-4" aria-live="polite">
              <h1 className="text-mk-h2">Pesan Anda sudah terkirim.</h1>
              <p role="status" className="text-mk-body text-muted-foreground">
                Terima kasih. Tim kami akan membalas lewat email dalam 1–2 hari
                kerja.
              </p>
            </section>
          ) : (
            <>
              <header className="flex flex-col gap-3">
                <h1 className="text-mk-h2">Hubungi kami.</h1>
                <p className="text-mk-body text-muted-foreground">
                  Ceritakan kebutuhan sekolah Anda: jadwal demo, paket
                  Enterprise, atau pertanyaan lain.
                </p>
              </header>

              <form
                method="post"
                onSubmit={onSubmit}
                noValidate
                className="mt-8 flex flex-col gap-5"
              >
                {FIELDS.map(([id, label, autoComplete, type]) => (
                  <div key={id} className="flex flex-col gap-2">
                    <Label htmlFor={id}>{label}</Label>
                    <Input
                      id={id}
                      name={id}
                      type={type}
                      autoComplete={autoComplete}
                      aria-invalid={!!errors[id]}
                    />
                    {errors[id] ? (
                      <p role="alert" className="text-xs text-destructive">
                        {errors[id]}
                      </p>
                    ) : null}
                  </div>
                ))}

                <div className="flex flex-col gap-2">
                  <Label htmlFor="message">Pesan</Label>
                  <textarea
                    id="message"
                    name="message"
                    className={textareaClass}
                    aria-invalid={!!errors.message}
                  />
                  {errors.message ? (
                    <p role="alert" className="text-xs text-destructive">
                      {errors.message}
                    </p>
                  ) : null}
                </div>

                {formError ? (
                  <p role="alert" className="text-sm text-destructive">
                    {formError}
                  </p>
                ) : null}

                <Button
                  type="submit"
                  size="lg"
                  className="rounded-md"
                  disabled={pending || !ready}
                >
                  {pending ? "Mengirim..." : "Kirim pesan"}
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
