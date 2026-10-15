// Halaman admin pengguna (US-02): daftar guru & siswa, pencarian, dan reset
// sandi guru lewat email tautan "atur sandi", serta buat/reset PIN siswa
// (satuan dan massal per rombel, US-01).

import { useState } from "react"

import {
  Field,
  selectClass,
  useHydrated,
} from "@/components/dashboard/form-field"
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
import { pinsToCsv } from "@/features/student-pin/csv"
import {
  issueClassroomPinsFn,
  issueStudentPinFn,
} from "@/features/student-pin/server/student-pin"
import {
  listPeopleFn,
  requestTeacherResetFn,
} from "@/features/user-management/server/people"
import type {
  PeopleList,
  PersonRow,
} from "@/features/user-management/service"

type Role = "all" | "teacher" | "student"

type PinBoard = {
  semesterName: string | null
  classrooms: { id: string; name: string; grade: number }[]
}

function download(filename: string, content: string) {
  const url = URL.createObjectURL(
    new Blob([content], { type: "text/csv;charset=utf-8" })
  )
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export function PeoplePage({
  initial,
  board,
}: {
  initial: PeopleList
  board: PinBoard
}) {
  const ready = useHydrated()
  const [list, setList] = useState<PeopleList>(initial)
  const [role, setRole] = useState<Role>("all")
  const [q, setQ] = useState("")
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [freshPins, setFreshPins] = useState<Record<string, string>>({})
  const [classroomId, setClassroomId] = useState("")
  const [bulkNotice, setBulkNotice] = useState<string | null>(null)
  const [bulkPending, setBulkPending] = useState(false)

  async function search(next: { role: Role; q: string }) {
    setError(null)
    try {
      setList(await listPeopleFn({ data: next }))
    } catch {
      setError("Gagal memuat daftar. Periksa koneksi lalu coba lagi.")
    }
  }

  async function issuePin(person: PersonRow) {
    setError(null)
    setNotice(null)
    setPending(true)
    try {
      const result = await issueStudentPinFn({
        data: { studentId: person.id },
      })
      if (result.ok) {
        setFreshPins((prev) => ({ ...prev, [person.id]: result.pin }))
        setList((prev) => ({
          ...prev,
          rows: prev.rows.map((row) =>
            row.role === "student" && row.id === person.id
              ? { ...row, hasPin: true }
              : row
          ),
        }))
        setConfirmId(null)
      } else {
        setError(result.message)
      }
    } catch {
      setError("Gagal memproses. Periksa koneksi lalu coba lagi.")
    } finally {
      setPending(false)
    }
  }

  async function issueBulk() {
    const room = board.classrooms.find((item) => item.id === classroomId)
    if (!room) return
    setError(null)
    setBulkNotice(null)
    setBulkPending(true)
    try {
      const result = await issueClassroomPinsFn({ data: { classroomId } })
      if (!result.ok) {
        setError(result.message)
        return
      }
      if (result.rows.length === 0) {
        setBulkNotice("Semua siswa di rombel ini sudah punya PIN.")
        return
      }
      download(`pin-${room.name}.csv`, pinsToCsv(result.rows))
      setBulkNotice(
        `${result.rows.length} PIN dibuat dan diunduh; ${result.skipped} siswa dilewati karena sudah punya PIN.`
      )
      await search({ role, q })
    } catch {
      setError("Gagal memproses. Periksa koneksi lalu coba lagi.")
    } finally {
      setBulkPending(false)
    }
  }

  async function sendReset(person: PersonRow) {
    setError(null)
    setNotice(null)
    setPending(true)
    try {
      const result = await requestTeacherResetFn({
        data: { teacherId: person.id },
      })
      if (result.ok) {
        setNotice(`Tautan atur sandi dikirim ke email ${person.name}.`)
        setConfirmId(null)
      } else {
        setError(result.message)
      }
    } catch {
      setError("Gagal memproses. Periksa koneksi lalu coba lagi.")
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Pengguna"
        description="Daftar guru dan siswa sekolah ini. Reset sandi guru mengirim tautan atur sandi ke email guru; sandi tidak pernah terlihat oleh admin."
      />

      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault()
          void search({ role, q })
        }}
      >
        <div className="w-40">
          <Field id="peran" label="Peran">
            <select
              id="peran"
              className={selectClass}
              value={role}
              onChange={(event) => {
                const next = event.target.value as Role
                setRole(next)
                void search({ role: next, q })
              }}
            >
              <option value="all">Semua</option>
              <option value="teacher">Guru</option>
              <option value="student">Siswa</option>
            </select>
          </Field>
        </div>
        <div className="w-64">
          <Field id="cari" label="Cari">
            <Input
              id="cari"
              placeholder="Nama, kode guru, NIS, atau email"
              value={q}
              onChange={(event) => setQ(event.target.value)}
            />
          </Field>
        </div>
        <Button
          type="submit"
          variant="outline"
          className="rounded-md"
          disabled={!ready}
        >
          Cari
        </Button>
      </form>

      {notice ? (
        <p role="status" className="text-ds-body">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-ds-body text-destructive">
          {error}
        </p>
      ) : null}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nama</TableHead>
            <TableHead>Peran</TableHead>
            <TableHead>Kode / NIS</TableHead>
            <TableHead>Email</TableHead>
            <TableHead className="text-right">Aksi</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {list.rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="text-muted-foreground">
                Tidak ada pengguna yang cocok.
              </TableCell>
            </TableRow>
          ) : (
            list.rows.map((person) => (
              <TableRow key={`${person.role}-${person.id}`}>
                <TableCell>{person.name}</TableCell>
                <TableCell>{person.role === "teacher" ? "Guru" : "Siswa"}</TableCell>
                <TableCell className="font-mono">{person.identifier}</TableCell>
                <TableCell>{person.email ?? "—"}</TableCell>
                <TableCell className="text-right">
                  {person.role === "student" ? (
                    confirmId === person.id ? (
                      <span className="inline-flex flex-wrap items-center justify-end gap-2">
                        <span className="text-ds-caption">
                          Buat PIN baru untuk {person.name}? PIN lama tidak
                          berlaku lagi dan sesi siswa berakhir.
                        </span>
                        <Button
                          size="sm"
                          className="rounded-md"
                          disabled={!ready || pending}
                          onClick={() => void issuePin(person)}
                        >
                          Ya, buat
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="rounded-md"
                          disabled={pending}
                          onClick={() => setConfirmId(null)}
                        >
                          Batal
                        </Button>
                      </span>
                    ) : (
                      <span className="inline-flex flex-wrap items-center justify-end gap-2">
                        {freshPins[person.id] ? (
                          <span className="inline-flex flex-col items-end">
                            <span
                              data-testid="new-pin"
                              className="font-mono text-ds-body"
                            >
                              {freshPins[person.id]}
                            </span>
                            <span className="text-ds-caption text-muted-foreground">
                              Catat sekarang. PIN tidak bisa dilihat lagi.
                            </span>
                          </span>
                        ) : null}
                        <Button
                          size="sm"
                          variant="outline"
                          className="rounded-md"
                          disabled={!ready}
                          aria-label={`${person.hasPin ? "Reset" : "Buat"} PIN ${person.name}`}
                          onClick={() => {
                            setNotice(null)
                            setConfirmId(person.id)
                          }}
                        >
                          {person.hasPin ? "Reset PIN" : "Buat PIN"}
                        </Button>
                      </span>
                    )
                  ) : confirmId === person.id ? (
                    <span className="inline-flex flex-wrap items-center justify-end gap-2">
                      <span className="text-ds-caption">
                        Kirim tautan atur sandi ke {person.name}?
                      </span>
                      <Button
                        size="sm"
                        className="rounded-md"
                        disabled={!ready || pending}
                        onClick={() => void sendReset(person)}
                      >
                        Ya, kirim
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-md"
                        disabled={pending}
                        onClick={() => setConfirmId(null)}
                      >
                        Batal
                      </Button>
                    </span>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-md"
                      disabled={!ready}
                      aria-label={`Reset sandi ${person.name}`}
                      onClick={() => {
                        setNotice(null)
                        setConfirmId(person.id)
                      }}
                    >
                      Reset sandi
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      {list.truncated ? (
        <p className="text-ds-meta text-muted-foreground">
          Hanya 100 pengguna pertama yang ditampilkan. Persempit pencarian.
        </p>
      ) : null}

      <section
        aria-label="PIN massal per rombel"
        className="flex max-w-3xl flex-col gap-3 rounded-md border border-border p-4"
      >
        <h2 className="text-ds-body font-medium">PIN massal per rombel</h2>
        <p className="text-ds-meta text-muted-foreground">
          Membuat PIN untuk siswa rombel yang belum punya PIN dan mengunduhnya
          sebagai CSV. Siswa yang sudah punya PIN dilewati.
        </p>
        {board.semesterName ? (
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-64">
              <Field id="rombel-pin" label="Rombel">
                <select
                  id="rombel-pin"
                  className={selectClass}
                  value={classroomId}
                  onChange={(event) => setClassroomId(event.target.value)}
                >
                  <option value="">Pilih rombel</option>
                  {board.classrooms.map((room) => (
                    <option key={room.id} value={room.id}>
                      {room.name} (tingkat {room.grade})
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Button
              className="rounded-md"
              disabled={!ready || !classroomId || bulkPending}
              onClick={() => void issueBulk()}
            >
              Buat PIN massal
            </Button>
          </div>
        ) : (
          <p className="text-ds-body text-muted-foreground">
            Belum ada semester aktif.
          </p>
        )}
        {bulkNotice ? (
          <p role="status" className="text-ds-body">
            {bulkNotice}
          </p>
        ) : null}
      </section>
    </div>
  )
}
