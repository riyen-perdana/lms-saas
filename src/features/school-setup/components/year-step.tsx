import { useState } from "react"

import { Field, useHydrated } from "@/components/dashboard/form-field"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { academicYearSchema } from "@/features/academic/schema"
import { createYearFn } from "@/features/academic/server/academic"

export interface YearRow {
  id: string
  name: string
  isActive: boolean
  semesters: { id: string; name: string; startDate: Date | string; endDate: Date | string }[]
}

/** Isian awal: tahun ajaran yang sedang berjalan menurut tanggal hari ini. */
export function suggestYear(today: Date = new Date()) {
  const start = today.getUTCMonth() >= 6 ? today.getUTCFullYear() : today.getUTCFullYear() - 1
  return {
    name: `${start}/${start + 1}`,
    ganjilStart: `${start}-07-13`,
    ganjilEnd: `${start}-12-19`,
    genapStart: `${start + 1}-01-04`,
    genapEnd: `${start + 1}-06-26`,
  }
}

const day = (value: Date | string) => new Date(value).toISOString().slice(0, 10)

type Errors = Partial<Record<string, string>>

export function YearStep({
  years,
  onChanged,
}: {
  years: YearRow[]
  onChanged: () => Promise<void>
}) {
  const ready = useHydrated()
  const [errors, setErrors] = useState<Errors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const suggestion = suggestYear()

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError(null)
    const f = new FormData(event.currentTarget)

    const parsed = academicYearSchema.safeParse({
      name: f.get("name"),
      ganjil: { startDate: f.get("ganjilStart"), endDate: f.get("ganjilEnd") },
      genap: { startDate: f.get("genapStart"), endDate: f.get("genapEnd") },
    })
    if (!parsed.success) {
      const next: Errors = {}
      for (const issue of parsed.error.issues) {
        const key = issue.path.length === 1 ? String(issue.path[0]) : `${String(issue.path[0])}-${String(issue.path[1])}`
        next[key] ??= issue.message
      }
      setErrors(next)
      return
    }
    setErrors({})

    setPending(true)
    try {
      const result = await createYearFn({ data: parsed.data })
      if (!result.ok) {
        setErrors({ name: result.message })
        return
      }
      await onChanged()
    } catch {
      setFormError("Gagal menyimpan. Periksa koneksi lalu coba lagi.")
    } finally {
      setPending(false)
    }
  }

  if (years.length > 0) {
    return (
      <div className="flex flex-col gap-3">
        {years.map((year) => (
          <div key={year.id} className="rounded-md border border-border p-4">
            <p className="text-ds-body font-medium">
              Tahun ajaran {year.name}
              {year.isActive ? " (aktif)" : ""}
            </p>
            <ul className="mt-2 text-ds-meta text-muted-foreground">
              {year.semesters.map((semester) => (
                <li key={semester.id}>
                  Semester {semester.name}: {day(semester.startDate)} s.d. {day(semester.endDate)}
                </li>
              ))}
            </ul>
          </div>
        ))}
        <p className="text-ds-meta text-muted-foreground">
          Tahun ajaran berikutnya ditambahkan saat pergantian tahun ajaran.
        </p>
      </div>
    )
  }

  const dates: [string, string, string, string][] = [
    ["ganjilStart", "Ganjil mulai", suggestion.ganjilStart, "ganjil-startDate"],
    ["ganjilEnd", "Ganjil selesai", suggestion.ganjilEnd, "ganjil-endDate"],
    ["genapStart", "Genap mulai", suggestion.genapStart, "genap-startDate"],
    ["genapEnd", "Genap selesai", suggestion.genapEnd, "genap-endDate"],
  ]

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      <Field id="year-name" label="Tahun ajaran" error={errors.name} hint="Format 2026/2027.">
        <Input id="year-name" name="name" defaultValue={suggestion.name} aria-invalid={!!errors.name} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        {dates.map(([name, label, value, errorKey]) => (
          <Field key={name} id={name} label={label} error={errors[errorKey]}>
            <Input id={name} name={name} type="date" defaultValue={value} aria-invalid={!!errors[errorKey]} />
          </Field>
        ))}
      </div>
      {formError ? (
        <p role="alert" className="text-xs text-destructive">
          {formError}
        </p>
      ) : null}
      <div>
        <Button type="submit" className="rounded-md" disabled={!ready || pending}>
          {pending ? "Menyimpan..." : "Simpan tahun ajaran"}
        </Button>
      </div>
    </form>
  )
}
