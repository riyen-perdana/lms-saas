// Halaman penugasan guru (OB-03).
//
// Semua isi halaman berasal dari satu papan (semester aktif, rombel, mapel, guru,
// kelas pembelajaran) yang dibaca dalam satu transaksi; penyusunan nama untuk
// tabel dilakukan di klien dari id yang sudah ada di papan itu.

import { useState } from "react"
import { Link, useRouter } from "@tanstack/react-router"

import { Field, selectClass, useHydrated } from "@/components/dashboard/form-field"
import { PageHeader } from "@/components/dashboard/page-header"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  clearHomeroomFn,
  createCourseFn,
  removeCourseFn,
  setHomeroomFn,
  type TeachingResult,
} from "@/features/teaching-assignment/server/teaching-assignment"
import { courseSchema, homeroomSchema } from "@/features/teaching-assignment/schema"
import type { AssignmentBoard } from "@/features/teaching-assignment/service"

type Errors = Partial<Record<string, string>>

function issues(error: { issues: { path: PropertyKey[]; message: string }[] }): Errors {
  const next: Errors = {}
  for (const issue of error.issues) next[String(issue.path[0])] ??= issue.message
  return next
}

function Alert({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <p role="alert" className="text-xs text-destructive">
      {message}
    </p>
  )
}

/** Nama mapel atau guru dari papan; id yang tidak ada (data dihapus) tampil sebagai "-". */
function useLabels(board: AssignmentBoard) {
  const classroom = new Map(board.classrooms.map((row) => [row.id, row]))
  const subject = new Map(board.subjects.map((row) => [row.id, row]))
  const teacher = new Map(board.teachers.map((row) => [row.id, row]))
  return { classroom, subject, teacher }
}

function ClassroomTable({
  board,
  rows,
  onRemove,
}: {
  board: AssignmentBoard
  rows: AssignmentBoard["courses"]
  onRemove: (id: string) => Promise<void>
}) {
  const ready = useHydrated()
  const { classroom, subject, teacher } = useLabels(board)

  if (rows.length === 0) {
    return (
      <p className="rounded-md border border-border px-3 py-4 text-ds-meta text-muted-foreground">
        Belum ada kelas pembelajaran untuk semester ini.
      </p>
    )
  }

  return (
    <div className="rounded-md border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Rombel</TableHead>
            <TableHead>Mapel</TableHead>
            <TableHead>Guru</TableHead>
            <TableHead className="w-24">Aksi</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell className="text-ds-table">
                {classroom.get(row.classroomId)?.name ?? "-"}
              </TableCell>
              <TableCell className="text-ds-table">
                {subject.get(row.subjectId)?.name ?? "-"}
              </TableCell>
              <TableCell className="text-ds-table">
                {teacher.get(row.teacherId)?.name ?? "-"}
              </TableCell>
              <TableCell>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="rounded-md"
                  disabled={!ready}
                  onClick={() => void onRemove(row.id)}
                >
                  Hapus
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function CourseForm({
  board,
  onChanged,
}: {
  board: AssignmentBoard
  onChanged: () => Promise<void>
}) {
  const ready = useHydrated()
  const [errors, setErrors] = useState<Errors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const disabled = !ready || pending

  return (
    <section aria-label="Tambah kelas pembelajaran" className="flex flex-col gap-4">
      <h2 className="text-ds-body font-medium">Tambah kelas pembelajaran</h2>

      <form
        noValidate
        className="grid gap-4 sm:grid-cols-3 sm:items-start"
        onSubmit={async (event) => {
          event.preventDefault()
          setFormError(null)
          const form = event.currentTarget
          setPending(true)
          try {
            const values = new FormData(form)
            const parsed = courseSchema.safeParse({
              semesterId: board.semester?.id,
              classroomId: values.get("classroomId"),
              subjectId: values.get("subjectId"),
              teacherId: values.get("teacherId"),
            })
            if (!parsed.success) {
              setErrors(issues(parsed.error))
              return
            }

            const result: TeachingResult = await createCourseFn({ data: parsed.data })
            if (!result.ok) {
              setErrors({ form: result.message })
              return
            }

            setErrors({})
            form.reset()
            await onChanged()
          } catch {
            setFormError("Gagal menyimpan. Periksa koneksi lalu coba lagi.")
          } finally {
            setPending(false)
          }
        }}
      >
        <Field id="course-classroom" label="Rombel" error={errors.classroomId}>
          <select id="course-classroom" name="classroomId" className={selectClass} defaultValue="">
            <option value="">Pilih rombel</option>
            {board.classrooms.map((room) => (
              <option key={room.id} value={room.id}>
                {room.name} (tingkat {room.grade}
                {room.majorCode ? `, ${room.majorCode}` : ""})
              </option>
            ))}
          </select>
        </Field>

        <Field id="course-subject" label="Mata pelajaran" error={errors.subjectId}>
          <select id="course-subject" name="subjectId" className={selectClass} defaultValue="">
            <option value="">Pilih mapel</option>
            {board.subjects.map((row) => (
              <option key={row.id} value={row.id}>
                {row.code} — {row.name}
              </option>
            ))}
          </select>
        </Field>

        <Field id="course-teacher" label="Guru pengampu" error={errors.teacherId}>
          <select id="course-teacher" name="teacherId" className={selectClass} defaultValue="">
            <option value="">Pilih guru</option>
            {board.teachers.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name} ({row.code})
              </option>
            ))}
          </select>
        </Field>

        <div className="sm:col-span-3">
          <Button type="submit" className="rounded-md" disabled={disabled}>
            {pending ? "Menyimpan..." : "Tambah"}
          </Button>
        </div>
      </form>

      <Alert message={errors.form ?? formError} />
    </section>
  )
}

function HomeroomRow({
  board,
  classroomId,
  currentTeacherId,
  onChanged,
}: {
  board: AssignmentBoard
  classroomId: string
  currentTeacherId: string | null
  onChanged: () => Promise<void>
}) {
  const ready = useHydrated()
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [teacherId, setTeacherId] = useState(currentTeacherId ?? "")

  async function save(next: string) {
    setError(null)
    setPending(true)
    try {
      if (next === "") {
        const result = await clearHomeroomFn({ data: { classroomId } })
        if (!result.ok) {
          setTeacherId(currentTeacherId ?? "")
          setError(result.message)
          return
        }
      } else {
        const parsed = homeroomSchema.safeParse({ classroomId, teacherId: next })
        if (!parsed.success) {
          setTeacherId(currentTeacherId ?? "")
          setError(issues(parsed.error).teacherId ?? "Guru tidak valid.")
          return
        }
        const result = await setHomeroomFn({ data: parsed.data })
        if (!result.ok) {
          setTeacherId(currentTeacherId ?? "")
          setError(result.message)
          return
        }
      }
      await onChanged()
    } catch {
      setTeacherId(currentTeacherId ?? "")
      setError("Gagal menyimpan. Periksa koneksi lalu coba lagi.")
    } finally {
      setPending(false)
    }
  }

  return (
    <li className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-start sm:gap-3">
      <div className="flex flex-col gap-1 sm:w-48 sm:shrink-0">
        <span className="text-ds-table">{homeroomLabel(board, classroomId)}</span>
        <span className="text-ds-caption text-muted-foreground">
          {currentTeacherId ? homeroomTeacherLabel(board, currentTeacherId) : "Belum ada wali kelas"}
        </span>
      </div>

      <div className="flex flex-1 items-start gap-2">
        <select
          aria-label={`Wali kelas ${homeroomLabel(board, classroomId)}`}
          className={selectClass}
          value={teacherId}
          disabled={!ready || pending}
          onChange={(event) => {
            setTeacherId(event.target.value)
            void save(event.target.value)
          }}
        >
          <option value="">Tanpa wali kelas</option>
          {board.teachers.map((row) => (
            <option key={row.id} value={row.id}>
              {row.name} ({row.code})
            </option>
          ))}
        </select>
        {pending ? <span className="text-ds-caption text-muted-foreground">Menyimpan...</span> : null}
      </div>

      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </li>
  )
}

function homeroomLabel(board: AssignmentBoard, classroomId: string): string {
  const room = board.classrooms.find((row) => row.id === classroomId)
  return room ? `${room.name} (tingkat ${room.grade})` : "Rombel"
}

function homeroomTeacherLabel(board: AssignmentBoard, teacherId: string): string {
  const teacher = board.teachers.find((row) => row.id === teacherId)
  return teacher ? `Wali: ${teacher.name}` : "Wali: data sudah dihapus"
}

export function AssignmentPage({ board }: { board: AssignmentBoard }) {
  const router = useRouter()
  const [filter, setFilter] = useState("")
  const [removeError, setRemoveError] = useState<string | null>(null)
  const onChanged = () => router.invalidate()

  if (!board.semester) {
    return (
      <div className="flex max-w-3xl flex-col gap-6">
        <PageHeader
          title="Penugasan guru"
          description="Kelas pembelajaran adalah pasangan rombel, mata pelajaran, dan guru pada satu semester."
        />
        <p className="rounded-md border border-border p-4 text-ds-body text-muted-foreground">
          Sekolah belum punya semester aktif.{" "}
          <Link to="/setup" className="text-primary underline-offset-4 hover:underline">
            Lengkapi setup sekolah
          </Link>{" "}
          lebih dulu.
        </p>
      </div>
    )
  }

  const rows = filter ? board.courses.filter((row) => row.classroomId === filter) : board.courses

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <PageHeader
        title="Penugasan guru"
        description={`Kelas pembelajaran semester ${board.semester.name} ${board.semester.academicYearName}: pasangan rombel, mata pelajaran, dan guru.`}
      />

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-ds-body font-medium">Kelas pembelajaran</h2>
          <div className="flex items-center gap-2">
            <label htmlFor="filter-rombel" className="text-ds-meta text-muted-foreground">
              Tampilkan rombel
            </label>
            <select
              id="filter-rombel"
              className={selectClass}
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
            >
              <option value="">Semua rombel</option>
              {board.classrooms.map((room) => (
                <option key={room.id} value={room.id}>
                  {room.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <ClassroomTable
          board={board}
          rows={rows}
          onRemove={async (id) => {
            setRemoveError(null)
            try {
              const result = await removeCourseFn({ data: { id } })
              if (!result.ok) setRemoveError(result.message)
            } catch {
              setRemoveError("Gagal menghapus. Periksa koneksi lalu coba lagi.")
            }
            await onChanged()
          }}
        />
        <Alert message={removeError} />
        <p className="text-ds-caption text-muted-foreground">
          Menampilkan {rows.length} dari {board.courses.length} kelas pembelajaran.
        </p>
      </section>

      <div className="rounded-lg border border-border p-5">
        {board.teachers.length === 0 || board.subjects.length === 0 || board.classrooms.length === 0 ? (
          <p className="text-ds-body text-muted-foreground">
            Rombel, mapel, atau guru belum ada. Lengkapi datanya lebih dulu — rombel dan
            mapel dibuat di{" "}
            <Link to="/setup" className="text-primary underline-offset-4 hover:underline">
              setup sekolah
            </Link>
            , guru lewat{" "}
            <Link to="/impor" className="text-primary underline-offset-4 hover:underline">
              impor dari Excel
            </Link>
            .
          </p>
        ) : (
          <CourseForm board={board} onChanged={onChanged} />
        )}
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-ds-body font-medium">Wali kelas</h2>
        <p className="text-ds-meta text-muted-foreground">
          Satu guru hanya dapat menjadi wali kelas satu rombel pada semester yang sama.
        </p>
        {board.classrooms.length === 0 ? (
          <p className="rounded-md border border-border px-3 py-4 text-ds-meta text-muted-foreground">
            Belum ada rombel pada semester ini.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border">
            {board.classrooms.map((room) => (
              <HomeroomRow
                key={`${room.id}:${room.homeroomTeacherId ?? ""}`}
                board={board}
                classroomId={room.id}
                currentTeacherId={room.homeroomTeacherId}
                onChanged={onChanged}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}