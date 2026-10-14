import { useState } from "react"
import { Check } from "lucide-react"

import { Section } from "@/components/marketing/section"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type Period = "semester" | "year"

// Harga final ditentukan di F7 (PRD §11); halaman harga penuh (LP-03) akan
// membaca tabel `plans`. Di beranda, nominal sengaja masih placeholder.
const PLANS = [
  {
    name: "Basic",
    blurb: "Untuk sekolah kecil yang baru mulai.",
    price: "[HARGA]",
    cta: "Mulai trial",
    featured: false,
    points: ["Hingga 300 siswa", "Penyimpanan 20 GB", "Kelas, materi, tugas, nilai"],
  },
  {
    name: "Pro",
    blurb: "Untuk sekolah yang menjalankan ujian CBT.",
    price: "[HARGA]",
    cta: "Mulai trial",
    featured: true,
    points: [
      "Hingga 1.000 siswa",
      "Penyimpanan 100 GB",
      "Semua fitur Basic",
      "Ujian CBT & analisis soal",
      "Laporan orang tua otomatis",
    ],
  },
  {
    name: "Enterprise",
    blurb: "Untuk yayasan dan sekolah besar.",
    price: "Hubungi kami",
    cta: "Bicara dengan tim",
    featured: false,
    points: [
      "Siswa tak terbatas",
      "Penyimpanan sesuai kebutuhan",
      "Semua fitur Pro",
      "SLA & dukungan prioritas",
      "Onboarding dibantu",
    ],
  },
]

export function Pricing() {
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
        {PLANS.map((plan) => (
          <article
            key={plan.name}
            className={cn(
              "flex flex-col gap-4 rounded-lg border bg-background p-6",
              plan.featured ? "border-foreground" : "border-border"
            )}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">{plan.name}</h3>
              {plan.featured ? (
                <span className="rounded-md bg-primary px-2 py-0.5 text-[10px] font-medium text-primary-foreground">
                  Paling lengkap
                </span>
              ) : null}
            </div>
            <p className="text-xs text-muted-foreground">{plan.blurb}</p>
            <p className="text-2xl font-semibold tracking-tight">
              {plan.price}
              {plan.price.startsWith("[") ? (
                <span className="ml-1 text-xs font-normal text-muted-foreground">
                  / {period === "semester" ? "semester" : "tahun"}
                </span>
              ) : null}
            </p>
            <a
              href={plan.name === "Enterprise" ? "/kontak" : "/daftar"}
              className={cn(
                buttonVariants({
                  variant: plan.featured ? "default" : "outline",
                  size: "lg",
                }),
                "w-full rounded-md"
              )}
            >
              {plan.cta}
            </a>
            <ul className="flex flex-col gap-2 border-t border-border pt-4 text-xs">
              {plan.points.map((point) => (
                <li key={point} className="flex items-start gap-2">
                  <Check className="mt-0.5 size-3 shrink-0" aria-hidden />
                  {point}
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
      <p className="mt-6 text-center text-xs text-muted-foreground">
        Semua paket mulai dengan trial 30 hari fitur lengkap.
      </p>
    </Section>
  )
}
