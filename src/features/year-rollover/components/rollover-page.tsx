// Halaman tahun ajaran & kenaikan kelas (OB-04). Hanya admin sekolah.
//
// Tiga bagian: daftar semester (aktifkan), tambah tahun ajaran berikutnya, dan
// panel kenaikan (pilih sumber/tujuan -> pratinjau -> jalankan).

import { useState } from "react"
import { useRouter } from "@tanstack/react-router"

import { Field, selectClass, useHydrated } from "@/components/dashboard/form-field"
import { PageHeader } from "@/components/dashboard/page-header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { YearStep, suggestYear } from "@/features/school-setup/components/year-step"
import { ROLLOVER_MODES, ROLLOVER_MODE_LABELS, rolloverSchema } from "@/features/year-rollover/schema"
import {
  activateSemesterFn,
  previewRolloverFn,
  runRolloverFn,
} from "@/features/year-rollover/server/year-rollover"
import type { RolloverPreview, RolloverYear } from "@/features/year-rollover/service"

type Mode = (typeof ROLLOVER_MODES)[number]

const day = (value: Date | string) => new Date(value).toISOString().slice(0, 10)

function Alert({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <p role="alert" className="text-xs text-destructive">
      {message}
    </p>
  )
}

function flatSemesters(years: RolloverYear[]) {
  return years
    .flatMap((year) => year.semesters.map((semester) => ({ ...semester, yearId: year.id, yearName: year.name })))
    .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())
}

function nextYearSuggestion(years: RolloverYear[]) {
  const latest = years.map((year) => Number.parseInt(year.name.slice(0, 4), 10)).sort((a, b) => b - a)
    .at(0)
  return suggestYear(new Date(Date.UTC((latest ?? new Date().getUTCFullYear() - 1) + 1, 7, 1)))
}

function SemesterList({
  years,
  onChanged,
}: {
  years: RolloverYear[]
  onChanged: () => Promise<void>
}) {
  const ready = useHydrated()
  const [error, setError] = useState<string | null>(null)
  const [pendingId, setPendingId] = useState<string | null>(null)

  async function activate(semesterId: string) {
    setError(null)
    setPendingId(semesterId)
    try {
      const result = await activateSemesterFn({ data: { semesterId } })
      if (!result.ok) setError(result.message)
      await onChanged()
    } catch {
      setError("Gagal mengaktifkan. Periksa koneksi lalu coba lagi.")
    } finally {
      setPendingId(null)
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-ds-body font-medium">Tahun ajaran dan semester</h2>
      {years.length === 0 ? (
        <p className="rounded-md border border-border px-3 py-4 text-ds-meta text-muted-foreground">
          Belum ada tahun ajaran.
        </p>
      ) : (
        <div className="rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Semester</TableHead>
                <TableHead>Periode</TableHead>
                <TableHead>Rombel</TableHead>
                <TableHead className="w-28">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {years.flatMap((year) =>
                year.semesters.map((semester) => (
                  <TableRow key={semester.id}>
                    <TableCell className="text-ds-table">
                      {semester.name} {year.name}
                    </TableCell>
                    <TableCell className="text-ds-table">
                      {day(semester.startDate)} s.d. {day(semester.endDate)}
                    </TableCell>
                    <TableCell className="text-ds-table">{semester.classroomCount}</TableCell>
                    <TableCell>
                      {semester.isActive ? (
                        <span className="text-ds-meta text-muted-foreground">Aktif</span>
                      ) : (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="rounded-md"
                          aria-label={`Aktifkan ${semester.name} ${year.name}`}
                          disabled={!ready || pendingId !== null}
                          onClick={() => void activate(semester.id)}
                        >
                          Aktifkan
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}
      <Alert message={error} />
    </section>
  )
}

function RolloverPanel({
  years,
  onChanged,
}: {
  years: RolloverYear[]
  onChanged: () => Promise<void>
}) {
  const ready = useHydrated()
  const semesters = flatSemesters(years)
  const activeIndex = Math.max(
    0,
    semesters.findIndex((semester) => semester.isActive)
  )

  const [sourceId, setSourceId] = useState(semesters.at(activeIndex)?.id ?? "")
  const [targetId, setTargetId] = useState(semesters.at(activeIndex + 1)?.id ?? "")
  const [mode, setMode] = useState<Mode>(() => {
    const from = semesters.at(activeIndex)
    const to = semesters.at(activeIndex + 1)
    return from && to && from.yearId !== to.yearId ? "promote" : "same"
  })
  const [preview, setPreview] = useState<RolloverPreview | null>(null)
  const [names, setNames] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  if (semesters.length < 2) {
    return (
      <section className="flex flex-col gap-3">
        <h2 className="text-ds-body font-medium">Kenaikan kelas</h2>
        <p className="rounded-md border border-border px-3 py-4 text-ds-meta text-muted-foreground">
          Tambahkan tahun ajaran berikutnya lebih dulu agar ada semester tujuan.
        </p>
      </section>
    )
  }

  function reset() {
    setPreview(null)
    setNames({})
    setError(null)
    setDone(null)
  }

  function chooseSource(id: string) {
    setSourceId(id)
    reset()
  }

  function chooseTarget(id: string) {
    setTargetId(id)
    // Lintas tahun ajaran = naik tingkat; dalam tahun yang sama = tingkat tetap.
    const from = semesters.find((s) => s.id === sourceId)
    const to = semesters.find((s) => s.id === id)
    if (from && to) setMode(from.yearId === to.yearId ? "same" : "promote")
    reset()
  }

  async function onPreview() {
    reset()
    setPending(true)
    try {
      const result = await previewRolloverFn({
        data: { sourceSemesterId: sourceId, targetSemesterId: targetId, mode },
      })
      if (!result.ok) {
        setError(result.message)
        return
      }
      setPreview(result.preview)
      setNames(
        Object.fromEntries(
          result.preview.rows.flatMap((row) =>
            row.suggestedName === null ? [] : [[row.classroomId, row.suggestedName]]
          )
        )
      )
    } catch {
      setError("Gagal memuat pratinjau. Periksa koneksi lalu coba lagi.")
    } finally {
      setPending(false)
    }
  }

  async function onRun() {
    if (!preview) return
    setError(null)
    const parsed = rolloverSchema.safeParse({
      sourceSemesterId: sourceId,
      targetSemesterId: targetId,
      mode,
      names,
    })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Data tidak valid.")
      return
    }

    setPending(true)
    try {
      const result = await runRolloverFn({ data: parsed.data })
      if (!result.ok) {
        setError(result.message)
        return
      }
      const { classroomsCreated, studentsMoved, graduated } = result.result
      setPreview(null)
      setDone(
        `Selesai: ${classroomsCreated} rombel dibuat, ${studentsMoved} siswa dipindahkan` +
          (graduated > 0 ? `, ${graduated} siswa lulus.` : ".")
      )
      await onChanged()
    } catch {
      setError("Gagal menjalankan kenaikan. Periksa koneksi lalu coba lagi.")
    } finally {
      setPending(false)
    }
  }

  const label = (s: (typeof semesters)[number]) => `${s.name} ${s.yearName}`
  const canRun = preview !== null && preview.blocked === null

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-ds-body font-medium">Kenaikan kelas</h2>
        <p className="text-ds-meta text-muted-foreground">
          Menyalin rombel ke semester tujuan dan memindahkan siswanya. Rombel lama tetap tersimpan
          sebagai arsip. Wali kelas dan kelas pembelajaran tidak disalin; tetapkan ulang di
          Penugasan guru.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field id="rollover-source" label="Semester sumber">
          <select
            id="rollover-source"
            className={selectClass}
            value={sourceId}
            onChange={(event) => chooseSource(event.target.value)}
          >
            {semesters.map((s) => (
              <option key={s.id} value={s.id}>
                {label(s)}
              </option>
            ))}
          </select>
        </Field>
        <Field id="rollover-target" label="Semester tujuan">
          <select
            id="rollover-target"
            className={selectClass}
            value={targetId}
            onChange={(event) => chooseTarget(event.target.value)}
          >
            <option value="">Pilih semester tujuan</option>
            {semesters
              .filter((s) => s.id !== sourceId)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {label(s)}
                </option>
              ))}
          </select>
        </Field>
        <Field id="rollover-mode" label="Mode">
          <select
            id="rollover-mode"
            className={selectClass}
            value={mode}
            onChange={(event) => {
              setMode(event.target.value as Mode)
              reset()
            }}
          >
            {ROLLOVER_MODES.map((value) => (
              <option key={value} value={value}>
                {ROLLOVER_MODE_LABELS[value]}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div>
        <Button
          type="button"
          variant="outline"
          className="rounded-md"
          disabled={!ready || pending || !targetId}
          onClick={() => void onPreview()}
        >
          Lihat pratinjau
        </Button>
      </div>

      {preview ? (
        <div className="flex flex-col gap-3">
          <Alert message={preview.blocked} />
          <div className="rounded-md border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Rombel sumber</TableHead>
                  <TableHead>Siswa</TableHead>
                  <TableHead>Rombel tujuan</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {preview.rows.map((row) => (
                  <TableRow key={row.classroomId}>
                    <TableCell className="text-ds-table">
                      {row.name} (tingkat {row.grade}
                      {row.majorCode ? `, ${row.majorCode}` : ""})
                    </TableCell>
                    <TableCell className="text-ds-table">{row.studentCount}</TableCell>
                    <TableCell>
                      {row.targetGrade === null ? (
                        <span className="text-ds-meta text-muted-foreground">
                          Lulus (tidak ada rombel tujuan)
                        </span>
                      ) : (
                        <Input
                          aria-label={`Nama rombel tujuan untuk ${row.name}`}
                          value={names[row.classroomId] ?? ""}
                          maxLength={64}
                          disabled={!canRun}
                          onChange={(event) =>
                            setNames((prev) => ({ ...prev, [row.classroomId]: event.target.value }))
                          }
                        />
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div>
            <Button
              type="button"
              className="rounded-md"
              disabled={!ready || pending || !canRun}
              onClick={() => void onRun()}
            >
              {pending ? "Memproses..." : "Jalankan kenaikan"}
            </Button>
          </div>
        </div>
      ) : null}

      <Alert message={error} />
      {done ? (
        <p role="status" className="text-ds-meta text-foreground">
          {done}
        </p>
      ) : null}
    </section>
  )
}

export function RolloverPage({ years }: { years: RolloverYear[] }) {
  const router = useRouter()
  const onChanged = () => router.invalidate()

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-10">
      <PageHeader
        title="Tahun ajaran dan kenaikan kelas"
        description="Atur semester aktif, tambahkan tahun ajaran baru, lalu naikkan rombel dan siswa ke semester berikutnya."
      />

      <SemesterList years={years} onChanged={onChanged} />

      <section className="flex flex-col gap-3 rounded-lg border border-border p-5">
        <h2 className="text-ds-body font-medium">Tambah tahun ajaran</h2>
        <YearStep
          years={years.map((year) => ({
            id: year.id,
            name: year.name,
            isActive: year.isActive,
            semesters: year.semesters,
          }))}
          onChanged={onChanged}
          showList={false}
          suggestion={nextYearSuggestion(years)}
        />
      </section>

      <RolloverPanel key={years.map((year) => year.id).join(",")} years={years} onChanged={onChanged} />
    </main>
  )
}
