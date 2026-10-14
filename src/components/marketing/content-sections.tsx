import {
  BookOpen,
  ClipboardCheck,
  Check,
  FileSpreadsheet,
  Mail,
  MonitorCheck,
  ShieldCheck,
} from "lucide-react"
import type { ComponentType } from "react"

import {
  Container,
  Section,
  SectionHeading,
} from "@/components/marketing/section"

export function LevelStrip() {
  return (
    <div className="border-y border-border">
      <Container className="flex flex-col items-start justify-between gap-3 py-5 text-sm sm:flex-row sm:items-center">
        <p className="text-muted-foreground">Dirancang untuk setiap jenjang</p>
        <ul className="flex flex-wrap gap-x-8 gap-y-2 font-medium">
          {["SD / MI", "SMP / MTs", "SMA / MA", "SMK"].map((level) => (
            <li key={level}>{level}</li>
          ))}
        </ul>
      </Container>
    </div>
  )
}

const FEATURES: {
  icon: ComponentType<{ className?: string }>
  title: string
  body: string
}[] = [
  {
    icon: BookOpen,
    title: "Kelas & materi",
    body: "Susun materi per pertemuan: teks, PDF, slide, video, atau tautan. Jadwalkan kapan terbit.",
  },
  {
    icon: ClipboardCheck,
    title: "Tugas & penilaian",
    body: "Tenggat, penalti terlambat, dan rubrik sederhana. Nilai seluruh kelas dari satu layar.",
  },
  {
    icon: MonitorCheck,
    title: "Ujian CBT",
    body: "Bank soal, acak soal dan opsi, timer dari server, dan penilaian otomatis untuk soal objektif.",
  },
  {
    icon: Mail,
    title: "Laporan ke orang tua",
    body: "Portal orang tua dan email berkala berisi nilai terbaru, tugas yang belum dikumpulkan, dan komentar guru.",
  },
  {
    icon: FileSpreadsheet,
    title: "Impor data dari Excel",
    body: "Masukkan ribuan guru dan siswa sekaligus, lengkap dengan laporan kesalahan per baris.",
  },
  {
    icon: ShieldCheck,
    title: "Data tiap sekolah terpisah",
    body: "Setiap sekolah punya subdomain sendiri. Data terisolasi di aplikasi dan di database.",
  },
]

export function Features() {
  return (
    <Section id="fitur">
      <SectionHeading
        eyebrow="Fitur"
        title={
          <>
            Semua yang dibutuhkan kelas, di satu tempat.
          </>
        }
        lead="Guru tidak perlu lagi berpindah antara grup chat, formulir, dan spreadsheet untuk merekap nilai."
      />
      <ul className="mt-10 grid overflow-hidden rounded-lg border border-border sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map(({ icon: Icon, title, body }) => (
          <li
            key={title}
            className="flex flex-col gap-2 border-b border-border p-6 last:border-b-0 sm:border-r sm:[&:nth-child(2n)]:border-r-0 lg:[&:nth-child(2n)]:border-r lg:[&:nth-child(3n)]:border-r-0 lg:[&:nth-last-child(-n+3)]:border-b-0"
          >
            <Icon className="size-4" aria-hidden />
            <h3 className="text-sm font-semibold">{title}</h3>
            <p className="text-mk-body text-muted-foreground">{body}</p>
          </li>
        ))}
      </ul>
    </Section>
  )
}

const ROLES = [
  {
    name: "Guru",
    points: [
      "Unggah materi per pertemuan",
      "Buat tugas dan ujian",
      "Nilai cepat dengan rubrik",
      "Buku nilai terbobot otomatis",
    ],
  },
  {
    name: "Siswa",
    points: [
      "Semua materi di satu tempat",
      "Kumpulkan tugas dari HP",
      "Ikut ujian dari perangkatnya",
      "Siswa SD masuk dengan NIS + PIN",
    ],
  },
  {
    name: "Orang tua",
    points: [
      "Lihat nilai terbaru anak",
      "Tahu tugas yang belum dikumpulkan",
      "Laporan rutin lewat email",
      "Satu akun untuk beberapa anak",
    ],
  },
  {
    name: "Admin sekolah",
    points: [
      "Wizard setup tahun ajaran",
      "Impor guru dan siswa",
      "Kenaikan kelas sekali klik",
      "Pantau kuota dan langganan",
    ],
  },
]

export function Roles() {
  return (
    <Section id="untuk-siapa" subtle>
      <SectionHeading
        eyebrow="Untuk siapa"
        title="Satu akun, tampilan sesuai peran."
      />
      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {ROLES.map((role) => (
          <article
            key={role.name}
            className="rounded-lg border border-border bg-background p-5"
          >
            <h3 className="text-sm font-semibold">{role.name}</h3>
            <ul className="mt-3 flex flex-col gap-2 text-mk-body text-muted-foreground">
              {role.points.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </Section>
  )
}

const OPTIONS = ["1 s", "2 s", "3 s", "4 s"]

/** Cuplikan soal CBT statis — dekoratif. */
function ExamPreview() {
  return (
    <div
      aria-hidden
      className="rounded-lg border border-border bg-background p-5 text-left"
    >
      <div className="flex items-center justify-between border-b border-border pb-3 text-xs">
        <span className="font-medium">PTS Fisika · XI</span>
        <span className="text-muted-foreground">Sisa 42:17</span>
      </div>
      <p className="mt-4 text-[11px] text-muted-foreground">Soal 7 dari 40</p>
      <p className="mt-1 text-sm">
        Sebuah benda dilepas horizontal dari ketinggian 20 m. Jika g = 10 m/s²,
        berapa lama benda sampai di tanah?
      </p>
      <ul className="mt-4 flex flex-col gap-2 text-xs">
        {OPTIONS.map((option, index) => (
          <li
            key={option}
            className={
              index === 1
                ? "rounded-md border border-foreground bg-muted px-3 py-2"
                : "rounded-md border border-border px-3 py-2"
            }
          >
            {String.fromCharCode(65 + index)}. {option}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[11px] text-muted-foreground">Tersimpan otomatis</p>
    </div>
  )
}

export function CbtSection() {
  return (
    <Section id="ujian-cbt">
      <div className="grid items-center gap-10 lg:grid-cols-2">
        <div className="flex flex-col gap-6">
          <SectionHeading
            eyebrow="Ujian CBT"
            title="Ujian serentak tanpa server lokal."
            lead="Jawaban tersimpan setiap kali siswa memilih, jadi koneksi yang putus sebentar tidak menghapus pekerjaan mereka."
          />
          <ul className="flex flex-col gap-3 text-mk-body">
            {[
              "Timer mengikuti jam server, bukan perangkat siswa",
              "Acak urutan soal dan opsi, token ujian opsional",
              "Keluar tab dan keluar layar penuh tercatat untuk guru",
              "Analisis tingkat kesukaran dan daya beda per soal",
            ].map((item) => (
              <li key={item} className="flex items-start gap-2.5">
                <Check className="mt-1 size-3.5 shrink-0" aria-hidden />
                {item}
              </li>
            ))}
          </ul>
        </div>
        <ExamPreview />
      </div>
    </Section>
  )
}

export function Testimonial() {
  return (
    <section className="border-y border-border py-16 md:py-20">
      <Container className="flex flex-col items-center gap-3 text-center">
        <blockquote className="text-mk-lead max-w-2xl font-medium text-balance">
          [Kutipan dari sekolah pilot — diisi setelah uji coba berjalan]
        </blockquote>
        <p className="text-xs text-muted-foreground">
          [Nama, jabatan] · [Nama sekolah]
        </p>
      </Container>
    </section>
  )
}
