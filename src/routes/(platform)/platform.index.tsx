import { Link, createFileRoute } from "@tanstack/react-router"

import { PageHeader } from "@/components/dashboard/page-header"
import {
  SCHOOL_STATUSES,
  SCHOOL_STATUS_LABELS,
} from "@/features/platform/schema"
import { getOverviewFn } from "@/features/platform/server/schools"
import { daysUntil, formatDate } from "@/lib/format"

export const Route = createFileRoute("/(platform)/platform/")({
  loader: () => getOverviewFn(),
  component: OverviewPage,
})

function OverviewPage() {
  const overview = Route.useLoaderData()

  return (
    <>
      <PageHeader
        title="Ringkasan"
        description="Kondisi seluruh sekolah di platform."
      />

      <section
        aria-label="Jumlah sekolah per status"
        className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6"
      >
        <StatCard label="Total sekolah" value={overview.total} />
        {SCHOOL_STATUSES.map((status) => (
          <StatCard
            key={status}
            label={SCHOOL_STATUS_LABELS[status]}
            value={overview.byStatus[status]}
          />
        ))}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-ds-body font-semibold">
          Trial berakhir dalam 7 hari
        </h2>
        {overview.expiringTrials.length === 0 ? (
          <p className="rounded-md border border-border p-4 text-ds-body text-muted-foreground">
            Tidak ada trial yang segera berakhir.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border">
            {overview.expiringTrials.map((trial) => (
              <li
                key={trial.schoolId}
                className="flex flex-wrap items-center justify-between gap-2 p-3 text-ds-body"
              >
                <div className="flex flex-col">
                  <Link
                    to="/platform/sekolah/$schoolId"
                    params={{ schoolId: trial.schoolId }}
                    className="font-medium hover:underline"
                  >
                    {trial.name}
                  </Link>
                  <span className="text-ds-meta text-muted-foreground">
                    {trial.slug}
                  </span>
                </div>
                <span className="text-ds-meta text-muted-foreground">
                  Berakhir {formatDate(trial.endsAt)} ({daysUntil(trial.endsAt)}{" "}
                  hari lagi)
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  )
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col gap-1 rounded-md border border-border p-4">
      <span className="text-ds-meta text-muted-foreground">{label}</span>
      <span className="tabular text-ds-page-title">{value}</span>
    </div>
  )
}
