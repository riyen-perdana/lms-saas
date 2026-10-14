// Langkah jurusan, rombel, dan mapel pada wizard setup. Setiap langkah:
// formulir tambah di atas, daftar di bawah dengan tombol hapus.

import { useState, type ReactNode } from "react"

import { Field, selectClass, useHydrated } from "@/components/dashboard/form-field"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  GRADE_RANGES,
  SUBJECT_GROUPS,
  SUBJECT_GROUP_LABELS,
  classroomSchema,
  majorSchema,
  subjectSchema,
} from "@/features/academic/schema"
import {
  createClassroomFn,
  createMajorFn,
  createSubjectFn,
  removeClassroomFn,
  removeMajorFn,
  removeSubjectFn,
  type AcademicResult,
} from "@/features/academic/server/academic"
import type { SchoolLevel } from "@/generated/prisma/enums"

type Errors = Partial<Record<string, string>>

/** Kerangka bersama: submit -> validasi klien -> panggil server -> muat ulang. */
function useAddForm(onChanged: () => Promise<void>) {
  const ready = useHydrated()
  const [errors, setErrors] = useState<Errors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function submit(
    event: React.FormEvent<HTMLFormElement>,
    run: (form: FormData) => Promise<AcademicResult | Errors>
  ) {
    event.preventDefault()
    setFormError(null)
    const formEl = event.currentTarget
    setPending(true)
    try {
      const out = await run(new FormData(formEl))
      if ("ok" in out) {
        if (!out.ok) {
          setErrors({ form: out.message })
          return
        }
        setErrors({})
        formEl.reset()
        await onChanged()
      } else {
        setErrors(out)
      }
    } catch {
      setFormError("Gagal menyimpan. Periksa koneksi lalu coba lagi.")
    } finally {
      setPending(false)
    }
  }

  return { ready, errors, formError, pending, submit }
}

function issues(error: { issues: { path: PropertyKey[]; message: string }[] }): Errors {
  const next: Errors = {}
  for (const issue of error.issues) next[String(issue.path[0])] ??= issue.message
  return next
}

function FormMessages({ errors, formError }: { errors: Errors; formError: string | null }) {
  const message = errors.form ?? formError
  return message ? (
    <p role="alert" className="text-xs text-destructive">
      {message}
    </p>
  ) : null
}

function ItemList({
  title,
  empty,
  items,
}: {
  title: string
  empty: string
  items: { id: string; label: ReactNode; onRemove: () => Promise<void> }[]
}) {
  return (
    <section aria-label={title} className="mt-6">
      <h3 className="text-ds-body font-medium">{title}</h3>
      {items.length === 0 ? (
        <p className="mt-2 text-ds-meta text-muted-foreground">{empty}</p>
      ) : (
        <ul className="mt-2 divide-y divide-border rounded-md border border-border">
          {items.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-3 px-3 py-2 text-ds-table">
              <span>{item.label}</span>
              <Button type="button" variant="ghost" size="sm" className="rounded-md" onClick={item.onRemove}>
                Hapus
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------

export interface MajorRow {
  id: string
  code: string
  name: string
}

export function MajorStep({ majors, onChanged }: { majors: MajorRow[]; onChanged: () => Promise<void> }) {
  const { ready, errors, formError, pending, submit } = useAddForm(onChanged)

  async function remove(id: string) {
    const result = await removeMajorFn({ data: { id } })
    if (!result.ok) window.alert(result.message)
    await onChanged()
  }

  return (
    <div>
      <form
        noValidate
        className="grid gap-4 sm:grid-cols-[8rem_1fr_auto] sm:items-start"
        onSubmit={(event) =>
          submit(event, async (f) => {
            const parsed = majorSchema.safeParse({ code: f.get("code"), name: f.get("name") })
            return parsed.success ? createMajorFn({ data: parsed.data }) : issues(parsed.error)
          })
        }
      >
        <Field id="major-code" label="Kode" error={errors.code}>
          <Input id="major-code" name="code" aria-invalid={!!errors.code} />
        </Field>
        <Field id="major-name" label="Nama jurusan" error={errors.name}>
          <Input id="major-name" name="name" aria-invalid={!!errors.name} />
        </Field>
        <div className="sm:mt-[1.625rem]">
          <Button type="submit" className="rounded-md" disabled={!ready || pending}>
            Tambah
          </Button>
        </div>
      </form>
      <FormMessages errors={errors} formError={formError} />
      <ItemList
        title="Jurusan terdaftar"
        empty="Belum ada jurusan."
        items={majors.map((m) => ({
          id: m.id,
          label: `${m.code} — ${m.name}`,
          onRemove: () => remove(m.id),
        }))}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------

export interface ClassroomRow {
  id: string
  grade: number
  name: string
  major: { code: string } | null
}

export function ClassroomStep({
  level,
  semesterId,
  majors,
  classrooms,
  onChanged,
}: {
  level: SchoolLevel
  semesterId: string | null
  majors: MajorRow[]
  classrooms: ClassroomRow[]
  onChanged: () => Promise<void>
}) {
  const { ready, errors, formError, pending, submit } = useAddForm(onChanged)
  const [min, max] = GRADE_RANGES[level]
  const grades = Array.from({ length: max - min + 1 }, (_, i) => min + i)

  async function remove(id: string) {
    await removeClassroomFn({ data: { id } })
    await onChanged()
  }

  if (!semesterId) {
    return <p className="text-ds-body text-muted-foreground">Tambahkan tahun ajaran terlebih dahulu.</p>
  }

  return (
    <div>
      <form
        noValidate
        className="grid gap-4 sm:grid-cols-[7rem_1fr_1fr_auto] sm:items-start"
        onSubmit={(event) =>
          submit(event, async (f) => {
            const major = f.get("majorId")
            const parsed = classroomSchema.safeParse({
              semesterId,
              grade: Number(f.get("grade")),
              majorId: major ? String(major) : undefined,
              name: f.get("name"),
            })
            return parsed.success ? createClassroomFn({ data: parsed.data }) : issues(parsed.error)
          })
        }
      >
        <Field id="classroom-grade" label="Tingkat" error={errors.grade}>
          <select id="classroom-grade" name="grade" className={selectClass} defaultValue={min}>
            {grades.map((grade) => (
              <option key={grade} value={grade}>
                {grade}
              </option>
            ))}
          </select>
        </Field>
        <Field id="classroom-name" label="Nama rombel" error={errors.name} hint="Contoh: X-1">
          <Input id="classroom-name" name="name" aria-invalid={!!errors.name} />
        </Field>
        {level === "SMK" ? (
          <Field id="classroom-major" label="Jurusan" error={errors.majorId}>
            <select id="classroom-major" name="majorId" className={selectClass} defaultValue="">
              <option value="">Tanpa jurusan</option>
              {majors.map((major) => (
                <option key={major.id} value={major.id}>
                  {major.code}
                </option>
              ))}
            </select>
          </Field>
        ) : (
          <div />
        )}
        <div className="sm:mt-[1.625rem]">
          <Button type="submit" className="rounded-md" disabled={!ready || pending}>
            Tambah
          </Button>
        </div>
      </form>
      <FormMessages errors={errors} formError={formError} />
      <ItemList
        title="Rombel semester aktif"
        empty="Belum ada rombel."
        items={classrooms.map((c) => ({
          id: c.id,
          label: `${c.name} (tingkat ${c.grade}${c.major ? `, ${c.major.code}` : ""})`,
          onRemove: () => remove(c.id),
        }))}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------

export interface SubjectRow {
  id: string
  code: string
  name: string
  group: (typeof SUBJECT_GROUPS)[number]
}

export function SubjectStep({ subjects, onChanged }: { subjects: SubjectRow[]; onChanged: () => Promise<void> }) {
  const { ready, errors, formError, pending, submit } = useAddForm(onChanged)

  async function remove(id: string) {
    await removeSubjectFn({ data: { id } })
    await onChanged()
  }

  return (
    <div>
      <form
        noValidate
        className="grid gap-4 sm:grid-cols-[7rem_1fr_9rem_auto] sm:items-start"
        onSubmit={(event) =>
          submit(event, async (f) => {
            const parsed = subjectSchema.safeParse({
              code: f.get("code"),
              name: f.get("name"),
              group: f.get("group"),
            })
            return parsed.success ? createSubjectFn({ data: parsed.data }) : issues(parsed.error)
          })
        }
      >
        <Field id="subject-code" label="Kode" error={errors.code}>
          <Input id="subject-code" name="code" aria-invalid={!!errors.code} />
        </Field>
        <Field id="subject-name" label="Nama mapel" error={errors.name}>
          <Input id="subject-name" name="name" aria-invalid={!!errors.name} />
        </Field>
        <Field id="subject-group" label="Kelompok" error={errors.group}>
          <select id="subject-group" name="group" className={selectClass} defaultValue="umum">
            {SUBJECT_GROUPS.map((group) => (
              <option key={group} value={group}>
                {SUBJECT_GROUP_LABELS[group]}
              </option>
            ))}
          </select>
        </Field>
        <div className="sm:mt-[1.625rem]">
          <Button type="submit" className="rounded-md" disabled={!ready || pending}>
            Tambah
          </Button>
        </div>
      </form>
      <FormMessages errors={errors} formError={formError} />
      <ItemList
        title="Mapel terdaftar"
        empty="Belum ada mapel."
        items={subjects.map((s) => ({
          id: s.id,
          label: `${s.code} — ${s.name} (${SUBJECT_GROUP_LABELS[s.group]})`,
          onRemove: () => remove(s.id),
        }))}
      />
    </div>
  )
}
