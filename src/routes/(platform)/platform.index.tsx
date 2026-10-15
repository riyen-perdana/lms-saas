import { Link, createFileRoute } from "@tanstack/react-router"
import { ChevronRight } from "lucide-react"

import {
  SCHOOL_STATUSES,
  SCHOOL_STATUS_LABELS,
  type SchoolStatus,
} from "@/features/platform/schema"
import { getOverviewFn } from "@/features/platform/server/schools"
import { daysUntil, formatDate } from "@/lib/format"
import { cn } from "@/lib/utils"

export const Route = createFileRoute("/(platform)/platform/")({
  loader: () => getOverviewFn(),
  component: OverviewPage,
})

// Warna hanya untuk status (AGENTS.md "Styling & tema").
const DOT: Record<SchoolStatus, string> = {
  trial: "bg-status-warning",
  active: "bg-status-success",
  grace: "bg-status-warning",
  readonly: "bg-muted-foreground",
  suspended: "bg-status-danger",
}

function greeting(now: Date): string {
  const hour = (now.getUTCHours() + 7) % 24 // WIB
  if (hour < 11) return "Selamat pagi"
  if (hour < 15) return "Selamat siang"
  if (hour < 18) return "Selamat sore"
  return "Selamat malam"
}

function percent(part: number, total: number): string {
  return total === 0 ? "0%" : `${Math.round((part / total) * 100)}%`
}

function OverviewPage() {
  const overview = Route.useLoaderData()
  const { admin } = Route.useRouteContext()
  const now = new Date()

  const actions = [
    {
      key: "trial",
      count: overview.expiringTrials.length,
      title: "Uji coba berakhir ≤ 7 hari",
      hint: "Hubungi sekolah untuk aktivasi paket",
      status: "trial" as const,
    },
    {
      key: "grace",
      count: overview.byStatus.grace,
      title: "Sekolah dalam masa tenggang",
      hint: "Langganan lewat jatuh tempo",
      status: "grace" as const,
    },
    {
      key: "readonly",
      count: overview.byStatus.readonly,
      title: "Sekolah berstatus hanya baca",
      hint: "Perlu aktivasi paket agar bisa dipakai penuh",
      status: "readonly" as const,
    },
  ].filter((row) => row.count > 0)

  return (
    <>
      <header className="flex flex-col gap-1">
        <h1 className="text-ds-page-title">
          {greeting(now)}, {admin.name}
        </h1>
        <p className="text-ds-body text-muted-foreground">
          {new Intl.DateTimeFormat("id-ID", {
            dateStyle: "full",
            timeZone: "Asia/Jakarta",
          }).format(now)}{" "}
          · Seluruh sekolah
        </p>
      </header>

      <section
        aria-label="Jumlah sekolah per status"
        className="grid grid-cols-2 divide-border rounded-md border border-border md:grid-cols-3 lg:grid-cols-6 lg:divide-x"
      >
        <Kpi
          label="Total sekolah"
          value={overview.total}
          note="terdaftar di platform"
        />
        {SCHOOL_STATUSES.map((status) => (
          <Kpi
            key={status}
            label={SCHOOL_STATUS_LABELS[status]}
            value={overview.byStatus[status]}
            note={`${percent(overview.byStatus[status], overview.total)} dari total`}
            dot={DOT[status]}
          />
        ))}
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section className="rounded-md border border-border">
          <div className="flex flex-col gap-0.5 p-4">
            <h2 className="text-ds-body font-semibold">Perlu tindakan</h2>
            <p className="text-ds-meta text-muted-foreground">
              Lingkup: seluruh sekolah
            </p>
          </div>
          {actions.length === 0 ? (
            <p className="border-t border-border p-4 text-ds-body text-muted-foreground">
              Tidak ada yang perlu ditindaklanjuti.
            </p>
          ) : (
            <ul className="divide-y divide-border border-t border-border">
              {actions.map((row) => (
                <li key={row.key}>
                  <Link
                    to="/platform/sekolah"
                    search={{ status: row.status, page: 1 }}
                    className="flex items-center gap-4 p-4 transition-colors hover:bg-muted"
                  >
                    <span className="flex w-14 items-center gap-2">
                      <span
                        className={cn("size-1.5 rounded-full", DOT[row.status])}
                        aria-hidden
                      />
                      <span className="tabular text-ds-page-title">
                        {row.count}
                      </span>
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="text-ds-body font-medium">
                        {row.title}
                      </span>
                      <span className="text-ds-meta text-muted-foreground">
                        {row.hint}
                      </span>
                    </span>
                    <ChevronRight
                      className="size-4 text-muted-foreground"
                      aria-hidden
                    />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <aside className="flex flex-col gap-6">
          <section className="rounded-md border border-border">
            <div className="flex flex-col gap-0.5 p-4">
              <h2 className="text-ds-body font-semibold">Sebaran status</h2>
              <p className="text-ds-meta text-muted-foreground">
                {overview.total} sekolah terdaftar
              </p>
            </div>
            <div className="flex flex-col gap-3 border-t border-border p-4">
              <div
                className="flex h-2 overflow-hidden rounded-full bg-muted"
                role="img"
                aria-label="Sebaran status sekolah"
              >
                {SCHOOL_STATUSES.map((status) =>
                  overview.byStatus[status] > 0 ? (
                    <span
                      key={status}
                      className={DOT[status]}
                      style={{
                        width: `${(overview.byStatus[status] / overview.total) * 100}%`,
                      }}
                    />
                  ) : null,
                )}
              </div>
              <ul className="flex flex-col gap-1.5">
                {SCHOOL_STATUSES.map((status) => (
                  <li
                    key={status}
                    className="flex items-center justify-between text-ds-meta"
                  >
                    <span className="flex items-center gap-2 text-muted-foreground">
                      <span
                        className={cn("size-1.5 rounded-full", DOT[status])}
                        aria-hidden
                      />
                      {SCHOOL_STATUS_LABELS[status]}
                    </span>
                    <span className="tabular font-medium">
                      {overview.byStatus[status]}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          <section className="rounded-md border border-border">
            <div className="flex flex-col gap-0.5 p-4">
              <h2 className="text-ds-body font-semibold">
                Uji coba segera berakhir
              </h2>
              <p className="text-ds-meta text-muted-foreground">
                Dalam 7 hari ke depan
              </p>
            </div>
            {overview.expiringTrials.length === 0 ? (
              <p className="border-t border-border p-4 text-ds-body text-muted-foreground">
                Tidak ada trial yang segera berakhir.
              </p>
            ) : (
              <ul className="divide-y divide-border border-t border-border">
                {overview.expiringTrials.map((trial) => (
                  <li key={trial.schoolId} className="flex flex-col p-4">
                    <Link
                      to="/platform/sekolah/$schoolId"
                      params={{ schoolId: trial.schoolId }}
                      className="text-ds-body font-medium hover:underline"
                    >
                      {trial.name}
                    </Link>
                    <span className="text-ds-meta text-muted-foreground">
                      {trial.slug} · berakhir {formatDate(trial.endsAt)} (
                      {daysUntil(trial.endsAt)} hari lagi)
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </>
  )
}

function Kpi({
  label,
  value,
  note,
  dot,
}: {
  label: string
  value: number
  note: string
  dot?: string
}) {
  return (
    <div className="flex flex-col gap-1 border-b border-border p-4 last:border-b-0 lg:border-b-0">
      <span className="flex items-center gap-1.5 text-ds-meta font-medium tracking-wide text-muted-foreground uppercase">
        {dot ? (
          <span className={cn("size-1.5 rounded-full", dot)} aria-hidden />
        ) : null}
        {label}
      </span>
      <span className="tabular text-ds-page-title">{value}</span>
      <span className="text-ds-meta text-muted-foreground">{note}</span>
    </div>
  )
}
