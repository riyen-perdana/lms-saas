// Halaman log audit (US-04): aksi sensitif terbaru dulu, filter jenis aksi,
// dan "Muat lebih banyak". Hanya admin sekolah.

import { useState } from "react"

import {
  Field,
  selectClass,
  useHydrated,
} from "@/components/dashboard/form-field"
import { PageHeader } from "@/components/dashboard/page-header"
import { Button } from "@/components/ui/button"
import { AUDIT_ACTIONS, type AuditAction } from "@/features/audit/schema"
import { listAuditLogsFn } from "@/features/audit/server/audit"
import type { AuditRow } from "@/features/audit/service"

interface Page {
  rows: AuditRow[]
  nextCursor: string | null
}

const ACTION_LABELS: Record<string, string> = AUDIT_ACTIONS

// Zona tetap supaya hasil render server dan klien sama (tanpa mismatch hydrate).
const formatTime = (value: Date | string) =>
  new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  }).format(new Date(value))

const ROLE_LABELS: Record<string, string> = {
  platform_admin: "Super Admin",
  school_admin: "Admin sekolah",
  teacher: "Guru",
  student: "Siswa",
  parent: "Orang tua",
}

export function AuditPage({ initial }: { initial: Page }) {
  const ready = useHydrated()
  const [action, setAction] = useState<AuditAction | "">("")
  const [page, setPage] = useState<Page>(initial)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function fetchPage(next: AuditAction | "", cursor?: string) {
    setError(null)
    setPending(true)
    try {
      const result = await listAuditLogsFn({
        data: { ...(next ? { action: next } : {}), ...(cursor ? { cursor } : {}) },
      })
      setPage((prev) =>
        cursor
          ? { rows: [...prev.rows, ...result.rows], nextCursor: result.nextCursor }
          : result
      )
    } catch {
      setError("Gagal memuat log. Periksa koneksi lalu coba lagi.")
    } finally {
      setPending(false)
    }
  }

  function choose(value: string) {
    const next = value as AuditAction | ""
    setAction(next)
    void fetchPage(next)
  }

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-10">
      <PageHeader
        title="Log audit"
        description="Jejak aksi sensitif di sekolah ini: perubahan langganan, impor, kenaikan kelas, dan penghapusan data. Log tidak dapat diubah atau dihapus. Waktu dalam WIB."
      />

      <div className="max-w-xs">
        <Field id="audit-action" label="Jenis aksi">
          <select
            id="audit-action"
            className={selectClass}
            value={action}
            disabled={!ready || pending}
            onChange={(event) => choose(event.target.value)}
          >
            <option value="">Semua aksi</option>
            {Object.entries(AUDIT_ACTIONS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}

      {page.rows.length === 0 ? (
        <p className="rounded-md border border-border px-3 py-4 text-ds-meta text-muted-foreground">
          Belum ada catatan audit.
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border">
          {page.rows.map((row) => (
            <li key={row.id} className="flex flex-col gap-1 px-3 py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-ds-table">
                  {ACTION_LABELS[row.action] ?? row.action}
                </span>
                <time
                  dateTime={new Date(row.createdAt).toISOString()}
                  className="text-ds-caption text-muted-foreground"
                >
                  {formatTime(row.createdAt)}
                </time>
              </div>
              <span className="text-ds-meta text-muted-foreground">
                {row.actorName} · {ROLE_LABELS[row.actorRole] ?? row.actorRole}
              </span>
              {row.before || row.after ? (
                <details className="text-ds-meta">
                  <summary className="cursor-pointer text-muted-foreground">
                    Rincian
                  </summary>
                  <div className="mt-1 flex flex-col gap-2">
                    {row.before ? (
                      <div>
                        <p className="text-ds-caption text-muted-foreground">
                          Sebelum
                        </p>
                        <pre className="overflow-x-auto rounded-md border border-border bg-muted p-2 font-mono text-ds-caption">
                          {row.before}
                        </pre>
                      </div>
                    ) : null}
                    {row.after ? (
                      <div>
                        <p className="text-ds-caption text-muted-foreground">
                          Sesudah
                        </p>
                        <pre className="overflow-x-auto rounded-md border border-border bg-muted p-2 font-mono text-ds-caption">
                          {row.after}
                        </pre>
                      </div>
                    ) : null}
                  </div>
                </details>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {page.nextCursor ? (
        <div>
          <Button
            type="button"
            variant="outline"
            className="rounded-md"
            disabled={!ready || pending}
            onClick={() => void fetchPage(action, page.nextCursor ?? undefined)}
          >
            Muat lebih banyak
          </Button>
        </div>
      ) : null}
    </main>
  )
}
