import { Link, createFileRoute, useNavigate } from "@tanstack/react-router"
import { z } from "zod"

import { PageHeader } from "@/components/dashboard/page-header"
import { SchoolStatusBadge } from "@/components/dashboard/school-status-badge"
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
  SCHOOL_STATUSES,
  SCHOOL_STATUS_LABELS,
} from "@/features/platform/schema"
import { listSchoolsFn } from "@/features/platform/server/schools"
import { formatDate } from "@/lib/format"

const searchSchema = z.object({
  q: z.string().optional().catch(undefined),
  status: z.enum(SCHOOL_STATUSES).optional().catch(undefined),
  page: z.number().int().min(1).default(1).catch(1),
})

export const Route = createFileRoute("/(platform)/platform/sekolah/")({
  validateSearch: searchSchema,
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) =>
    listSchoolsFn({
      data: { search: deps.q, status: deps.status, page: deps.page },
    }),
  component: SchoolsPage,
})

const selectClass =
  "h-8 rounded-md border border-input bg-transparent px-2.5 text-ds-body outline-none focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50"

function SchoolsPage() {
  const { items, total, pageSize } = Route.useLoaderData()
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const pages = Math.max(1, Math.ceil(total / pageSize))

  function onFilter(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const q = String(data.get("q") ?? "").trim()
    const status = String(data.get("status") ?? "")

    void navigate({
      search: {
        q: q || undefined,
        status: SCHOOL_STATUSES.find((value) => value === status),
        page: 1,
      },
    })
  }

  return (
    <>
      <PageHeader title="Sekolah" description={`${total} sekolah terdaftar.`} />

      <form
        onSubmit={onFilter}
        className="flex flex-wrap items-end gap-2"
        role="search"
        aria-label="Pencarian sekolah"
      >
        <Input
          name="q"
          defaultValue={search.q ?? ""}
          placeholder="Cari nama, subdomain, atau NPSN"
          aria-label="Cari sekolah"
          className="w-full rounded-md sm:w-72"
        />
        <select
          name="status"
          defaultValue={search.status ?? ""}
          aria-label="Filter status"
          className={selectClass}
        >
          <option value="">Semua status</option>
          {SCHOOL_STATUSES.map((status) => (
            <option key={status} value={status}>
              {SCHOOL_STATUS_LABELS[status]}
            </option>
          ))}
        </select>
        <Button type="submit" className="rounded-md">
          Terapkan
        </Button>
      </form>

      <div className="overflow-x-auto rounded-md border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Sekolah</TableHead>
              <TableHead>Jenjang</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Paket</TableHead>
              <TableHead>Berlaku sampai</TableHead>
              <TableHead>Terdaftar</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="py-8 text-center text-muted-foreground"
                >
                  Tidak ada sekolah yang cocok.
                </TableCell>
              </TableRow>
            ) : (
              items.map((school) => (
                <TableRow key={school.id}>
                  <TableCell>
                    <Link
                      to="/platform/sekolah/$schoolId"
                      params={{ schoolId: school.id }}
                      className="font-medium hover:underline"
                    >
                      {school.name}
                    </Link>
                    <div className="text-ds-meta text-muted-foreground">
                      {school.slug}
                      {school.npsn ? ` · NPSN ${school.npsn}` : ""}
                    </div>
                  </TableCell>
                  <TableCell>{school.level}</TableCell>
                  <TableCell>
                    <SchoolStatusBadge status={school.status} />
                  </TableCell>
                  <TableCell>{school.subscription?.planName ?? "—"}</TableCell>
                  <TableCell className="tabular">
                    {school.subscription
                      ? formatDate(school.subscription.periodEnd)
                      : "—"}
                  </TableCell>
                  <TableCell className="tabular">
                    {formatDate(school.createdAt)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {pages > 1 ? (
        <nav
          aria-label="Halaman"
          className="flex items-center justify-between text-ds-body"
        >
          <span className="text-muted-foreground">
            Halaman {search.page} dari {pages}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="rounded-md"
              disabled={search.page <= 1}
              onClick={() =>
                void navigate({
                  search: (prev) => ({ ...prev, page: search.page - 1 }),
                })
              }
            >
              Sebelumnya
            </Button>
            <Button
              variant="outline"
              className="rounded-md"
              disabled={search.page >= pages}
              onClick={() =>
                void navigate({
                  search: (prev) => ({ ...prev, page: search.page + 1 }),
                })
              }
            >
              Berikutnya
            </Button>
          </div>
        </nav>
      ) : null}
    </>
  )
}
