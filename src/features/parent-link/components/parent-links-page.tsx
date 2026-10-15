// Halaman admin tautan orang tua (OB-05): pilih rombel, buat kode undangan
// per siswa atau massal (CSV), dan cabut tautan/kode.
//
// Kode asli hanya ada di memori halaman ini sejak dibuat (server hanya
// menyimpan hash), jadi hilang saat halaman ditutup.

import { useState } from "react"

import {
  Field,
  selectClass,
  useHydrated,
} from "@/components/dashboard/form-field"
import { PageHeader } from "@/components/dashboard/page-header"
import { Button } from "@/components/ui/button"
import { invitesToCsv } from "@/features/parent-link/csv"
import {
  createClassroomInvitesFn,
  createInviteFn,
  listClassroomLinksFn,
  revokeLinkFn,
} from "@/features/parent-link/server/parent-link"
import type {
  BulkInviteRow,
  StudentLinks,
} from "@/features/parent-link/service"

interface Board {
  semesterName: string | null
  classrooms: { id: string; name: string; grade: number }[]
}

const day = (value: Date | string) => new Date(value).toISOString().slice(0, 10)

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

export function ParentLinksPage({ board }: { board: Board }) {
  const ready = useHydrated()
  const [classroomId, setClassroomId] = useState("")
  const [students, setStudents] = useState<StudentLinks[] | null>(null)
  const [fresh, setFresh] = useState<
    Partial<Record<string, { code: string; expiresAt: Date }>>
  >({})
  const [bulk, setBulk] = useState<{
    rows: BulkInviteRow[]
    skipped: number
  } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function load(id: string) {
    const result = await listClassroomLinksFn({ data: { classroomId: id } })
    if (!result.ok) {
      setError(result.message)
      setStudents(null)
      return
    }
    setStudents(result.students)
  }

  async function run(action: () => Promise<void>) {
    setError(null)
    setPending(true)
    try {
      await action()
    } catch {
      setError("Gagal memproses. Periksa koneksi lalu coba lagi.")
    } finally {
      setPending(false)
    }
  }

  function choose(id: string) {
    setClassroomId(id)
    setFresh({})
    setBulk(null)
    setError(null)
    setStudents(null)
    if (id) void run(() => load(id))
  }

  const freshInvite = (studentId: string) => fresh[studentId]

  const roomName =
    board.classrooms.find((room) => room.id === classroomId)?.name ?? "rombel"

  function downloadBulk(rows: BulkInviteRow[]) {
    download(`kode-undangan-${roomName}.csv`, invitesToCsv(rows))
  }

  if (!board.semesterName) {
    return (
      <div className="flex max-w-3xl flex-col gap-6">
        <PageHeader title="Tautan orang tua" />
        <p className="rounded-md border border-border p-4 text-ds-body text-muted-foreground">
          Sekolah belum punya semester aktif. Lengkapi setup sekolah lebih dulu.
        </p>
      </div>
    )
  }

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <PageHeader
        title="Tautan orang tua"
        description={`Buat kode undangan agar orang tua dapat menautkan akun ke anaknya (semester ${board.semesterName}). Kode hanya tampil sekali dan berlaku 14 hari; bagikan lewat wali kelas atau cetak dari CSV.`}
      />

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-48 flex-1">
          <Field id="parent-room" label="Rombel">
            <select
              id="parent-room"
              className={selectClass}
              value={classroomId}
              onChange={(event) => choose(event.target.value)}
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
          type="button"
          variant="outline"
          className="rounded-md"
          disabled={!ready || pending || !classroomId}
          onClick={() =>
            void run(async () => {
              const result = await createClassroomInvitesFn({
                data: { classroomId },
              })
              if (!result.ok) {
                setError(result.message)
                return
              }
              setBulk({ rows: result.rows, skipped: result.skipped })
              if (result.rows.length > 0) downloadBulk(result.rows)
              await load(classroomId)
            })
          }
        >
          Buat kode untuk semua siswa
        </Button>
      </div>

      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}

      {bulk ? (
        <div
          role="status"
          className="flex flex-col gap-2 rounded-md border border-border p-3 text-ds-meta"
        >
          <p>
            {bulk.rows.length} kode dibuat
            {bulk.skipped > 0
              ? `, ${bulk.skipped} siswa dilewati karena sudah punya orang tua atau kode aktif`
              : ""}
            .
            {bulk.rows.length > 0
              ? " Berkas CSV sudah diunduh; kode tidak dapat ditampilkan lagi setelah halaman ditutup."
              : ""}
          </p>
          {bulk.rows.length > 0 ? (
            <div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-md"
                onClick={() => downloadBulk(bulk.rows)}
              >
                Unduh ulang CSV
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      {students ? (
        students.length === 0 ? (
          <p className="rounded-md border border-border px-3 py-4 text-ds-meta text-muted-foreground">
            Belum ada siswa di rombel ini.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border">
            {students.map((student) => (
              <li
                key={student.studentId}
                className="flex flex-col gap-2 px-3 py-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-col">
                    <span className="text-ds-table">{student.name}</span>
                    <span className="font-mono text-ds-caption text-muted-foreground">
                      {student.nis}
                    </span>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-md"
                    aria-label={`Buat kode untuk ${student.name}`}
                    disabled={!ready || pending}
                    onClick={() =>
                      void run(async () => {
                        const result = await createInviteFn({
                          data: { studentId: student.studentId },
                        })
                        if (!result.ok) {
                          setError(result.message)
                          return
                        }
                        setFresh((prev) => ({
                          ...prev,
                          [student.studentId]: result.invite,
                        }))
                        await load(classroomId)
                      })
                    }
                  >
                    Buat kode
                  </Button>
                </div>

                {freshInvite(student.studentId) ? (
                  <p className="rounded-md border border-border bg-muted px-3 py-2 text-ds-meta">
                    Kode baru:{" "}
                    <span
                      className="font-mono text-ds-table"
                      data-testid="new-code"
                    >
                      {freshInvite(student.studentId)?.code}
                    </span>{" "}
                    (berlaku sampai{" "}
                    {day(
                      freshInvite(student.studentId)?.expiresAt ?? new Date()
                    )}
                    ). Catat sekarang; kode tidak dapat ditampilkan lagi.
                  </p>
                ) : null}

                {student.linked.map((link) => (
                  <div
                    key={link.linkId}
                    className="flex flex-wrap items-center justify-between gap-2 text-ds-meta"
                  >
                    <span>
                      Orang tua: {link.parentName} ({link.parentEmail})
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="rounded-md"
                      aria-label={`Cabut tautan ${link.parentName}`}
                      disabled={!ready || pending}
                      onClick={() =>
                        void run(async () => {
                          const result = await revokeLinkFn({
                            data: { linkId: link.linkId },
                          })
                          if (!result.ok) setError(result.message)
                          await load(classroomId)
                        })
                      }
                    >
                      Cabut
                    </Button>
                  </div>
                ))}

                {student.pending.map((invite) => (
                  <div
                    key={invite.linkId}
                    className="flex flex-wrap items-center justify-between gap-2 text-ds-meta text-muted-foreground"
                  >
                    <span>
                      Kode menunggu dipakai (berlaku sampai{" "}
                      {day(invite.expiresAt)})
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="rounded-md"
                      aria-label={`Cabut kode ${student.name}`}
                      disabled={!ready || pending}
                      onClick={() =>
                        void run(async () => {
                          const result = await revokeLinkFn({
                            data: { linkId: invite.linkId },
                          })
                          if (!result.ok) setError(result.message)
                          await load(classroomId)
                        })
                      }
                    >
                      Cabut
                    </Button>
                  </div>
                ))}
              </li>
            ))}
          </ul>
        )
      ) : null}
    </div>
  )
}
