import { useState } from "react"
import { Link, createFileRoute, useRouter } from "@tanstack/react-router"

import { PageHeader } from "@/components/dashboard/page-header"
import { SchoolStatusBadge } from "@/components/dashboard/school-status-badge"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  BILLING_PERIODS,
  BILLING_PERIOD_LABELS,
} from "@/features/platform/schema"
import {
  activatePlanFn,
  getSchoolFn,
  listPlansFn,
  setSuspendedFn,
} from "@/features/platform/server/schools"
import { daysUntil, formatDate, formatRupiah } from "@/lib/format"

export const Route = createFileRoute("/(platform)/platform/sekolah/$schoolId")({
  loader: async ({ params }) => {
    const [school, plans] = await Promise.all([
      getSchoolFn({ data: { schoolId: params.schoolId } }),
      listPlansFn(),
    ])

    return { school, plans }
  },
  errorComponent: () => (
    <div className="flex flex-col gap-3">
      <p className="text-ds-body">Sekolah tidak ditemukan.</p>
      <Link
        to="/platform/sekolah"
        className="text-ds-body underline underline-offset-4"
      >
        Kembali ke daftar sekolah
      </Link>
    </div>
  ),
  component: SchoolDetailPage,
})

const selectClass =
  "h-8 w-full rounded-md border border-input bg-transparent px-2.5 text-ds-body outline-none focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50"

function SchoolDetailPage() {
  const { school, plans } = Route.useLoaderData()
  const router = useRouter()
  const [message, setMessage] = useState<{
    kind: "ok" | "error"
    text: string
  } | null>(null)
  const [pending, setPending] = useState(false)

  async function run(
    action: () => Promise<{ ok: true } | { ok: false; message: string }>,
    success: string
  ) {
    setPending(true)
    setMessage(null)
    try {
      const result = await action()

      if (result.ok) {
        setMessage({ kind: "ok", text: success })
        await router.invalidate()
      } else {
        setMessage({ kind: "error", text: result.message })
      }
    } catch {
      setMessage({ kind: "error", text: "Gagal memproses. Coba lagi." })
    } finally {
      setPending(false)
    }
  }

  function onActivate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const planCode = String(data.get("planCode") ?? "")
    const period = BILLING_PERIODS.find((value) => value === data.get("period"))

    if (!planCode || !period) {
      setMessage({ kind: "error", text: "Pilih paket dan periode." })
      return
    }

    void run(
      () => activatePlanFn({ data: { schoolId: school.id, planCode, period } }),
      "Paket berhasil diaktifkan."
    )
  }

  const suspended = school.status === "suspended"
  const subscription = school.subscription

  return (
    <>
      <div>
        <Link
          to="/platform/sekolah"
          className="text-ds-meta text-muted-foreground hover:text-foreground"
        >
          ‹ Semua sekolah
        </Link>
      </div>

      <PageHeader
        title={school.name}
        description={`${school.slug} · ${school.level}${school.npsn ? ` · NPSN ${school.npsn}` : ""}`}
        actions={<SchoolStatusBadge status={school.status} />}
      />

      {message ? (
        <p
          role={message.kind === "error" ? "alert" : "status"}
          className={
            message.kind === "error"
              ? "rounded-md border border-status-danger-border bg-status-danger-bg p-3 text-ds-body text-status-danger-text"
              : "rounded-md border border-status-success-border bg-status-success-bg p-3 text-ds-body text-status-success-text"
          }
        >
          {message.text}
        </p>
      ) : null}

      <section className="flex flex-col gap-3 rounded-md border border-border p-4">
        <h2 className="text-ds-body font-semibold">Langganan saat ini</h2>
        {subscription ? (
          <dl className="grid gap-3 text-ds-body sm:grid-cols-3">
            <div>
              <dt className="text-ds-meta text-muted-foreground">Paket</dt>
              <dd>{subscription.planName}</dd>
            </div>
            <div>
              <dt className="text-ds-meta text-muted-foreground">Status</dt>
              <dd>{subscription.status === "trial" ? "Uji coba" : "Aktif"}</dd>
            </div>
            <div>
              <dt className="text-ds-meta text-muted-foreground">
                Berlaku sampai
              </dt>
              <dd className="tabular">
                {formatDate(subscription.periodEnd)}
                <span className="text-muted-foreground">
                  {" "}
                  ({daysUntil(subscription.periodEnd)} hari lagi)
                </span>
              </dd>
            </div>
          </dl>
        ) : (
          <p className="text-ds-body text-muted-foreground">
            Belum ada langganan yang berlaku.
          </p>
        )}
      </section>

      <section className="flex flex-col gap-3 rounded-md border border-border p-4">
        <h2 className="text-ds-body font-semibold">Aktifkan paket</h2>
        <p className="text-ds-meta text-muted-foreground">
          Mengaktifkan paket membatalkan langganan berlaku saat ini dan memulai
          periode baru dari hari ini.
        </p>
        <form
          onSubmit={onActivate}
          className="grid gap-3 sm:grid-cols-3 sm:items-end"
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="planCode">Paket</Label>
            <select
              id="planCode"
              name="planCode"
              className={selectClass}
              defaultValue=""
            >
              <option value="" disabled>
                Pilih paket
              </option>
              {plans.map((plan) => (
                <option key={plan.code} value={plan.code}>
                  {plan.name} — {formatRupiah(plan.priceSemester)}/semester
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="period">Periode</Label>
            <select
              id="period"
              name="period"
              className={selectClass}
              defaultValue="semester"
            >
              {BILLING_PERIODS.map((period) => (
                <option key={period} value={period}>
                  {BILLING_PERIOD_LABELS[period]}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" className="rounded-md" disabled={pending}>
            {pending ? "Memproses..." : "Aktifkan paket"}
          </Button>
        </form>
      </section>

      <section className="flex flex-col gap-3 rounded-md border border-border p-4">
        <h2 className="text-ds-body font-semibold">
          {suspended ? "Sekolah ditangguhkan" : "Tangguhkan sekolah"}
        </h2>
        <p className="text-ds-meta text-muted-foreground">
          {suspended
            ? "Pengguna sekolah ini tidak dapat memakai platform sampai diaktifkan kembali."
            : "Penangguhan menghentikan akses pengguna sekolah ini. Data tetap tersimpan."}
        </p>
        <Button
          variant={suspended ? "outline" : "destructive"}
          className="w-fit rounded-md"
          disabled={pending}
          onClick={() => {
            if (!suspended && !window.confirm(`Tangguhkan ${school.name}?`))
              return
            void run(
              () =>
                setSuspendedFn({
                  data: { schoolId: school.id, suspended: !suspended },
                }),
              suspended
                ? "Sekolah diaktifkan kembali."
                : "Sekolah ditangguhkan."
            )
          }}
        >
          {suspended ? "Aktifkan kembali" : "Tangguhkan sekolah"}
        </Button>
      </section>
    </>
  )
}
