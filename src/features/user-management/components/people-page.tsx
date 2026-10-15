// Halaman admin pengguna (US-02): daftar guru & siswa, pencarian, dan reset
// sandi guru lewat email tautan "atur sandi". Siswa menunggu US-01 (NIS+PIN).

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
import {
  listPeopleFn,
  requestTeacherResetFn,
} from "@/features/user-management/server/people"
import type {
  PeopleList,
  PersonRow,
} from "@/features/user-management/service"

type Role = "all" | "teacher" | "student"

export function PeoplePage({ initial }: { initial: PeopleList }) {
  const ready = useHydrated()
  const [list, setList] = useState<PeopleList>(initial)
  const [role, setRole] = useState<Role>("all")
  const [q, setQ] = useState("")
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function search(next: { role: Role; q: string }) {
    setError(null)
    try {
      setList(await listPeopleFn({ data: next }))
    } catch {
      setError("Gagal memuat daftar. Periksa koneksi lalu coba lagi.")
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
        <Button type="submit" variant="outline" disabled={!ready}>
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
                    <span className="text-ds-caption text-muted-foreground">
                      Reset PIN tersedia setelah login NIS+PIN
                    </span>
                  ) : confirmId === person.id ? (
                    <span className="inline-flex flex-wrap items-center justify-end gap-2">
                      <span className="text-ds-caption">
                        Kirim tautan atur sandi ke {person.name}?
                      </span>
                      <Button
                        size="sm"
                        disabled={!ready || pending}
                        onClick={() => void sendReset(person)}
                      >
                        Ya, kirim
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
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
    </div>
  )
}
