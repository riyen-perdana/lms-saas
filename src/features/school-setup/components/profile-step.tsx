import { useState } from "react"

import { Field, useHydrated } from "@/components/dashboard/form-field"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { LOGO_MAX_BYTES, profileSchema } from "@/features/school-setup/schema"
import { updateProfileFn, uploadLogoFn } from "@/features/school-setup/server/setup"
import type { SetupState } from "@/features/school-setup/service"

type Errors = Partial<Record<string, string>>

export function ProfileStep({
  state,
  onSaved,
}: {
  state: SetupState
  onSaved: () => Promise<void>
}) {
  const ready = useHydrated()
  const [errors, setErrors] = useState<Errors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [logoVersion, setLogoVersion] = useState(0)

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError(null)
    const form = new FormData(event.currentTarget)

    const parsed = profileSchema.safeParse({ name: form.get("name"), npsn: form.get("npsn") })
    const logo = form.get("logo")
    const next: Errors = {}
    if (!parsed.success) {
      for (const issue of parsed.error.issues) next[String(issue.path[0])] ??= issue.message
    }
    if (logo instanceof File && logo.size > LOGO_MAX_BYTES) next.logo = "Ukuran logo maksimal 1 MB."
    setErrors(next)
    if (!parsed.success || next.logo) return

    setPending(true)
    try {
      const profile = await updateProfileFn({ data: parsed.data })
      if (!profile.ok) {
        setErrors({ npsn: profile.message })
        return
      }
      if (logo instanceof File && logo.size > 0) {
        const body = new FormData()
        body.set("logo", logo)
        const uploaded = await uploadLogoFn({ data: body })
        if (!uploaded.ok) {
          setErrors({ logo: uploaded.message })
          return
        }
        setLogoVersion((v) => v + 1)
      }
      await onSaved()
    } catch {
      setFormError("Gagal menyimpan. Periksa koneksi lalu coba lagi.")
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      <Field id="name" label="Nama sekolah" error={errors.name}>
        <Input id="name" name="name" defaultValue={state.name} aria-invalid={!!errors.name} />
      </Field>
      <Field id="npsn" label="NPSN (opsional)" error={errors.npsn} hint="8 digit angka.">
        <Input
          id="npsn"
          name="npsn"
          inputMode="numeric"
          defaultValue={state.npsn ?? ""}
          aria-invalid={!!errors.npsn}
        />
      </Field>
      <Field
        id="logo"
        label="Logo sekolah (opsional)"
        error={errors.logo}
        hint="PNG, JPG, atau WebP, maksimal 1 MB."
      >
        <div className="flex items-center gap-3">
          {state.hasLogo || logoVersion > 0 ? (
            <img
              src={`/api/logo?v=${logoVersion}`}
              alt="Logo sekolah saat ini"
              className="size-12 rounded-md border border-border object-contain"
            />
          ) : null}
          <Input id="logo" name="logo" type="file" accept="image/png,image/jpeg,image/webp" />
        </div>
      </Field>
      {formError ? (
        <p role="alert" className="text-xs text-destructive">
          {formError}
        </p>
      ) : null}
      <div>
        <Button type="submit" className="rounded-md" disabled={!ready || pending}>
          {pending ? "Menyimpan..." : "Simpan dan lanjut"}
        </Button>
      </div>
    </form>
  )
}
