import { useState } from "react"
import { Check } from "lucide-react"

import { Section } from "@/components/marketing/section"
import { buttonVariants } from "@/components/ui/button"
import type { PublicPlan } from "@/features/pricing/service"
import { formatRupiah } from "@/lib/format"
import { cn } from "@/lib/utils"

type Period = "semester" | "year"

const ENTERPRISE = {
  name: "Enterprise",
  blurb: "Untuk yayasan dan sekolah besar.",
  points: [
    "Siswa tak terbatas",
    "Penyimpanan sesuai kebutuhan",
    "Semua fitur Pro",
    "SLA & dukungan prioritas",
    "Onboarding dibantu",
  ],
}

const BLURBS: Record<string, string> = {
  standard: "Untuk sekolah yang baru mulai dan menjalankan ujian CBT.",
  pro: "Untuk sekolah besar yang butuh kuota dan domain sendiri.",
}

export function Pricing({ plans }: { plans: PublicPlan[] }) {
  const [period, setPeriod] = useState<Period>("semester")

  return (
    <Section id="harga" subtle>
      <div className="flex flex-col items-center gap-5 text-center">
        <p className="text-mk-eyebrow text-muted-foreground">Harga</p>
        <h2 className="text-mk-h2">Paket per sekolah, bukan per guru.</h2>
        <div
          role="group"
          aria-label="Periode tagihan"
          className="inline-flex rounded-md border border-border bg-background p-0.5 text-xs"
        >
          {(
            [
              ["semester", "Per semester"],
              ["year", "Tahunan"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={period === value}
              onClick={() => setPeriod(value)}
              className={cn(
                "rounded-[6px] px-3 py-1.5 transition-colors",
                period === value
                  ? "bg-muted font-medium text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="mx-auto mt-10 grid max-w-5xl gap-4 md:grid-cols-3">
        {plans.map((plan, index) => {
          const featured = index === plans.length - 1
          const price =
            period === "semester" ? plan.priceSemester : plan.priceYear
          const saving = Math.round(
            (1 - plan.priceYear / (plan.priceSemester * 2)) * 100
          )

          return (
            <article
              key={plan.code}
              className={cn(
                "flex flex-col gap-4 rounded-lg border bg-background p-6",
                featured ? "border-foreground" : "border-border"
              )}
            >
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">{plan.name}</h3>
                {featured ? (
                  <span className="rounded-md bg-primary px-2 py-0.5 text-[10px] font-medium text-primary-foreground">
                    Paling lengkap
                  </span>
                ) : null}
              </div>
              <p className="text-xs text-muted-foreground">
                {BLURBS[plan.code] ?? "Paket langganan per sekolah."}
              </p>
              <div>
                <p className="text-2xl font-semibold tracking-tight">
                  {formatRupiah(price)}
                  <span className="ml-1 text-xs font-normal text-muted-foreground">
                    / {period === "semester" ? "semester" : "tahun"}
                  </span>
                </p>
                {period === "year" && saving > 0 ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Hemat {saving}% dibanding dua semester.
                  </p>
                ) : null}
              </div>
              <a
                href="/daftar"
                className={cn(
                  buttonVariants({
                    variant: featured ? "default" : "outline",
                    size: "lg",
                  }),
                  "w-full rounded-md"
                )}
              >
                Mulai trial
              </a>
              <PointList points={plan.points} />
            </article>
          )
        })}

        <article className="flex flex-col gap-4 rounded-lg border border-border bg-background p-6">
          <h3 className="text-sm font-semibold">{ENTERPRISE.name}</h3>
          <p className="text-xs text-muted-foreground">{ENTERPRISE.blurb}</p>
          <p className="text-2xl font-semibold tracking-tight">Hubungi kami</p>
          <a
            href="/kontak"
            className={cn(
              buttonVariants({ variant: "outline", size: "lg" }),
              "w-full rounded-md"
            )}
          >
            Bicara dengan tim
          </a>
          <PointList points={ENTERPRISE.points} />
        </article>
      </div>
      <p className="mt-6 text-center text-xs text-muted-foreground">
        Semua paket mulai dengan trial 30 hari fitur lengkap.
      </p>
    </Section>
  )
}

function PointList({ points }: { points: string[] }) {
  return (
    <ul className="flex flex-col gap-2 border-t border-border pt-4 text-xs">
      {points.map((point) => (
        <li key={point} className="flex items-start gap-2">
          <Check className="mt-0.5 size-3 shrink-0" aria-hidden />
          {point}
        </li>
      ))}
    </ul>
  )
}
