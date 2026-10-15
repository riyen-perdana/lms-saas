// Halaman impor guru & siswa (OB-02).
//
// Formulir hanya mengirim berkas; pembacaan berkas berjalan di worker pg-boss
// supaya 1.000 siswa tidak memblokir halaman. Karena itu tabel status perlu
// disegarkan berkala sampai batch selesai diproses.

import { useEffect, useState } from "react"
import { useRouter } from "@tanstack/react-router"

import { PageHeader } from "@/components/dashboard/page-header"
import { Field, selectClass, useHydrated } from "@/components/dashboard/form-field"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { ImportBatchSummary } from "@/features/people-import/service"
import { uploadImportFileFn } from "@/features/people-import/server/import"
import {
  IMPORT_COLUMNS,
  IMPORT_KIND_LABELS,
  type ImportKindInput,
} from "@/features/people-import/schema"
import { cn } from "@/lib/utils"

const STATUS_LABELS: Record<ImportBatchSummary["status"], string> = {
  queued: "Menunggu",
  processing: "Diproses",
  done: "Selesai",
  failed: "Gagal",
}

// Warna hanya untuk status (AGENTS.md "Styling & tema").
const STATUS_STYLES: Record<ImportBatchSummary["status"], string> = {
  queued: "border-border bg-muted text-muted-foreground",
  processing:
    "border-status-warning-border bg-status-warning-bg text-status-warning-text",
  done: "border-status-success-border bg-status-success-bg text-status-success-text",
  failed: "border-status-danger-border bg-status-danger-bg text-status-danger-text",
}

const REFRESH_INTERVAL_MS = 3_000

export function templateUrl(kind: ImportKindInput): string {
  return `/api/impor-template?jenis=${kind}`
}

export function reportUrl(batchId: string): string {
  return `/api/laporan-impor/${batchId}`
}

function formatWaktu(value: Date | string): string {
  // Waktu disimpan UTC; ditampilkan apa adanya agar tidak ambigu di rapor.
  return new Date(value).toLocaleString("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  })
}

export function ImportPage({ batches }: { batches: ImportBatchSummary[] }) {
  const router = useRouter()
  const ready = useHydrated()

  const [jenis, setJenis] = useState<ImportKindInput>("students")
  const [pending, setPending] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const berjalan = batches.some(
    (batch) => batch.status === "queued" || batch.status === "processing"
  )

  // Batch diproses di luar request; segarkan tabel sampai semua selesai.
  useEffect(() => {
    if (!berjalan) return
    const timer = setInterval(() => void router.invalidate(), REFRESH_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [berjalan, router])

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError(null)
    const form = event.currentTarget
    const file = new FormData(form).get("berkas")

    if (!(file instanceof File) || file.size === 0) {
      setFormError("Pilih berkas .xlsx yang sudah diisi.")
      return
    }

    setPending(true)
    try {
      const payload = new FormData()
      payload.set("jenis", jenis)
      payload.set("berkas", file)

      const result = await uploadImportFileFn({ data: payload })
      if (!result.ok) {
        setFormError(result.message)
        return
      }

      form.reset()
      await router.invalidate()
    } catch {
      setFormError("Gagal mengunggah berkas. Periksa koneksi lalu coba lagi.")
    } finally {
      setPending(false)
    }
  }

  const kolom = IMPORT_COLUMNS[jenis]

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <PageHeader
        title="Impor guru dan siswa"
        description="Unduh template, isi data di Excel, lalu unggah berkasnya di sini."
      />

      <section className="flex flex-col gap-4 rounded-lg border border-border p-5">
        <h2 className="text-ds-body font-medium">Unggah berkas</h2>

        <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
          <Field
            id="import-kind"
            label="Jenis data"
            hint={`Kolom pada template: ${kolom
              .map((column) => column.header)
              .join(", ")}.`}
          >
            <select
              id="import-kind"
              className={selectClass}
              value={jenis}
              onChange={(event) => setJenis(event.target.value as ImportKindInput)}
            >
              <option value="students">Siswa</option>
              <option value="teachers">Guru</option>
            </select>
          </Field>

          <Field
            id="import-file"
            label="Berkas Excel"
            hint="Format .xlsx, maksimal 5 MB dan 5.000 baris data."
          >
            <Input
              id="import-file"
              name="berkas"
              type="file"
              accept=".xlsx"
              aria-label="Berkas Excel"
            />
          </Field>

          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" className="rounded-md" disabled={!ready || pending}>
              {pending ? "Mengunggah..." : "Impor"}
            </Button>
            <a
              href={templateUrl(jenis)}
              className={cn(buttonVariants({ variant: "outline" }), "rounded-md")}
            >
              Unduh template {IMPORT_KIND_LABELS[jenis]}
            </a>
          </div>
        </form>

        {formError ? (
          <p role="alert" className="text-xs text-destructive">
            {formError}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            Berkas dibaca di latar belakang. Baris yang ditolak bisa diperiksa lewat
            laporan error yang diunduh dari tabel riwayat.
          </p>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-ds-body font-medium">Riwayat impor</h2>
        {batches.length === 0 ? (
          <p className="text-ds-meta text-muted-foreground">Belum ada impor.</p>
        ) : (
          <div className="rounded-md border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Jenis</TableHead>
                  <TableHead>Berkas</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Berhasil</TableHead>
                  <TableHead>Gagal</TableHead>
                  <TableHead>Waktu</TableHead>
                  <TableHead>Laporan</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {batches.map((batch) => (
                  <TableRow key={batch.id}>
                    <TableCell>{IMPORT_KIND_LABELS[batch.kind]}</TableCell>
                    <TableCell className="max-w-40 truncate">{batch.fileName}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={cn("rounded-md", STATUS_STYLES[batch.status])}
                      >
                        {STATUS_LABELS[batch.status]}
                      </Badge>
                      {batch.errorMessage ? (
                        <p className="mt-1 max-w-56 text-ds-caption text-destructive">
                          {batch.errorMessage}
                        </p>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-ds-table">{batch.totalRows}</TableCell>
                    <TableCell className="text-ds-table">{batch.importedRows}</TableCell>
                    <TableCell className="text-ds-table">{batch.failedRows}</TableCell>
                    <TableCell className="text-ds-meta">
                      {formatWaktu(batch.finishedAt ?? batch.createdAt)}
                    </TableCell>
                    <TableCell>
                      {batch.status === "done" && batch.failedRows > 0 ? (
                        <a
                          href={reportUrl(batch.id)}
                          className={cn(
                            buttonVariants({ variant: "outline", size: "sm" }),
                            "rounded-md"
                          )}
                        >
                          Unduh laporan
                        </a>
                      ) : (
                        <span className="text-ds-caption text-muted-foreground">-</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  )
}