import { ArrowRight } from "lucide-react"

import { Container } from "@/components/marketing/section"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const SIDEBAR = [
  "Beranda",
  "Kelas",
  "Bank soal",
  "Ujian",
  "Buku nilai",
  "Laporan orang tua",
]

const ASSIGNMENTS = [
  {
    title: "Laporan praktikum gerak parabola",
    meta: "File · maks. 100",
    due: "20 Okt",
    done: "28 / 32",
    status: "Perlu dinilai",
  },
  {
    title: "Soal latihan hukum Newton",
    meta: "Teks · maks. 50",
    due: "17 Okt",
    done: "32 / 32",
    status: "Dinilai",
  },
  {
    title: "Video eksperimen bandul",
    meta: "Tautan · maks. 100",
    due: "27 Okt",
    done: "5 / 32",
    status: "Berjalan",
  },
]

function StatusCell({ status }: { status: string }) {
  const dot =
    status === "Perlu dinilai"
      ? "bg-status-warning"
      : status === "Dinilai"
        ? "bg-status-success"
        : "bg-border"

  return (
    <span
      className={cn(
        "flex items-center gap-1.5",
        status === "Berjalan" && "text-muted-foreground"
      )}
    >
      <span className={cn("size-1.5 rounded-full", dot)} aria-hidden />
      {status}
    </span>
  )
}

/** Cuplikan produk statis (bukan screenshot) — dekoratif, disembunyikan dari pembaca layar. */
function ProductShot() {
  return (
    <div
      aria-hidden
      className="mx-auto w-full max-w-5xl rounded-lg border border-border bg-surface-subtle p-2 md:p-3"
    >
      <div className="overflow-hidden rounded-md border border-border bg-background">
        <div className="flex items-center justify-center border-b border-border px-3 py-2">
          <span className="rounded-md bg-muted px-3 py-0.5 text-[11px] text-muted-foreground">
            mansekolah.edusaas.id/kelas/fisika-xi-1
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-[11rem_1fr]">
          <nav className="hidden border-r border-border p-4 md:block">
            <p className="mb-4 text-xs font-medium">MAN Contoh</p>
            <ul className="flex flex-col gap-1">
              {SIDEBAR.map((item) => (
                <li
                  key={item}
                  className={cn(
                    "rounded-md px-2 py-1.5 text-xs text-muted-foreground",
                    item === "Kelas" && "bg-muted font-medium text-foreground"
                  )}
                >
                  {item}
                </li>
              ))}
            </ul>
          </nav>
          <div className="p-4 text-left md:p-6">
            <p className="text-[11px] text-muted-foreground">Kelas › XI-1</p>
            <h3 className="mt-1 text-lg font-semibold">Fisika · XI-1</h3>
            <p className="text-xs text-muted-foreground">
              Semester Ganjil 2026/2027 · 32 siswa
            </p>
            <div className="mt-4 flex gap-4 border-b border-border text-xs">
              {["Materi", "Tugas", "Ujian", "Nilai", "Anggota"].map((tab) => (
                <span
                  key={tab}
                  className={cn(
                    "pb-2",
                    tab === "Tugas"
                      ? "border-b-2 border-foreground font-medium"
                      : "text-muted-foreground"
                  )}
                >
                  {tab}
                </span>
              ))}
            </div>
            <div className="mt-3 overflow-hidden rounded-md border border-border text-xs">
              <div className="hidden grid-cols-[2fr_1fr_1fr_1fr] bg-surface-subtle px-3 py-2 text-[10px] tracking-wide text-muted-foreground uppercase sm:grid">
                <span>Tugas</span>
                <span>Tenggat</span>
                <span>Dikumpulkan</span>
                <span>Status</span>
              </div>
              {ASSIGNMENTS.map((row) => (
                <div
                  key={row.title}
                  className="grid grid-cols-2 gap-1 border-t border-border px-3 py-2.5 sm:grid-cols-[2fr_1fr_1fr_1fr] sm:items-center"
                >
                  <div className="col-span-2 sm:col-span-1">
                    <p className="font-medium">{row.title}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {row.meta}
                    </p>
                  </div>
                  <span>{row.due}</span>
                  <span>{row.done}</span>
                  <StatusCell status={row.status} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export function Hero() {
  return (
    <section className="pt-14 pb-16 md:pt-20 md:pb-24">
      <Container className="flex flex-col items-center gap-12 text-center">
        <div className="flex max-w-3xl flex-col items-center gap-6">
          <p className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">
            Kini dalam uji coba bersama sekolah pilot
            <a href="#harga" className="rounded-full bg-muted px-2 py-0.5 font-medium text-foreground">
              Ikut program pilot ›
            </a>
          </p>
          <h1 className="text-mk-display text-balance">
            Satu platform belajar untuk seluruh sekolah Anda.
          </h1>
          <p className="text-mk-lead max-w-xl text-pretty text-muted-foreground">
            Kelas, materi, tugas, ujian CBT, dan laporan nilai ke orang tua —
            siap dipakai di subdomain sekolah Anda dalam kurang dari sehari,
            tanpa memasang server.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <a
              href="/daftar"
              className={cn(buttonVariants({ size: "lg" }), "rounded-md px-4")}
            >
              Coba gratis 30 hari
              <ArrowRight className="size-3.5" aria-hidden />
            </a>
            <a
              href="/kontak"
              className={cn(
                buttonVariants({ variant: "outline", size: "lg" }),
                "rounded-md px-4"
              )}
            >
              Jadwalkan demo
            </a>
          </div>
          <p className="text-xs text-muted-foreground">
            Tanpa kartu kredit · Untuk SD/MI, SMP/MTs, SMA/MA, dan SMK
          </p>
        </div>
        <ProductShot />
      </Container>
    </section>
  )
}
