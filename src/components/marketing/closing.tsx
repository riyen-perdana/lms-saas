import { Plus } from "lucide-react"

import { Brand } from "@/components/marketing/site-header"
import { Container, Section } from "@/components/marketing/section"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const FAQ = [
  {
    q: "Apakah sekolah perlu memasang server?",
    a: "Tidak. EduSaaS berjalan di cloud. Sekolah cukup memakai alamat subdomain sendiri dan membuka lewat browser di HP, tablet, atau komputer.",
  },
  {
    q: "Bagaimana data antar sekolah dipisahkan?",
    a: "Setiap sekolah punya subdomain dan data yang terisolasi, baik di lapisan aplikasi maupun di database. Pengguna satu sekolah tidak bisa membaca data sekolah lain.",
  },
  {
    q: "Bisakah data siswa diimpor dari Excel?",
    a: "Bisa. Unggah file Excel berisi guru dan siswa; setiap baris yang bermasalah dilaporkan beserta alasannya sehingga mudah diperbaiki.",
  },
  {
    q: "Bagaimana jika internet putus saat ujian?",
    a: "Jawaban disimpan setiap kali siswa memilih dan diantrekan di perangkat saat koneksi terputus sebentar. Timer ujian mengikuti jam server.",
  },
  {
    q: "Apa yang terjadi setelah trial berakhir?",
    a: "Data Anda tetap aman. Sekolah dapat memilih paket untuk melanjutkan; selama belum memilih, akun masuk mode hanya-baca.",
  },
]

export function Faq() {
  return (
    <Section id="faq">
      <h2 className="text-mk-h2 text-center">Pertanyaan umum</h2>
      <div className="mx-auto mt-10 max-w-2xl divide-y divide-border border-y border-border">
        {FAQ.map((item) => (
          <details key={item.q} className="group py-4">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-medium [&::-webkit-details-marker]:hidden">
              {item.q}
              <Plus
                className="size-3.5 shrink-0 transition-transform group-open:rotate-45"
                aria-hidden
              />
            </summary>
            <p className="mt-3 text-mk-body text-muted-foreground">{item.a}</p>
          </details>
        ))}
      </div>
    </Section>
  )
}

export function FinalCta() {
  return (
    <section className="pb-16 md:pb-24">
      <Container>
        <div className="flex flex-col items-center gap-4 rounded-lg border border-border bg-surface-subtle px-6 py-12 text-center">
          <h2 className="text-mk-h2 text-balance">Siapkan sekolah Anda hari ini.</h2>
          <p className="text-mk-body max-w-md text-muted-foreground">
            Daftar, pilih subdomain, dan buat kelas pertama. Trial 30 hari,
            tanpa kartu kredit.
          </p>
          <div className="mt-2 flex flex-wrap justify-center gap-3">
            <a href="/daftar" className={cn(buttonVariants({ size: "lg" }), "rounded-md px-4")}>
              Coba gratis 30 hari
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
        </div>
      </Container>
    </section>
  )
}

const FOOTER_COLUMNS = [
  {
    title: "Produk",
    links: [
      { label: "Fitur", href: "#fitur" },
      { label: "Ujian CBT", href: "#ujian-cbt" },
      { label: "Harga", href: "/harga" },
    ],
  },
  {
    title: "Perusahaan",
    links: [
      { label: "Kontak", href: "/kontak" },
      { label: "Demo", href: "/kontak" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Kebijakan privasi", href: "/privasi" },
      { label: "Syarat & ketentuan", href: "/syarat" },
    ],
  },
]

export function SiteFooter() {
  return (
    <footer className="border-t border-border py-12">
      <Container className="flex flex-col gap-10">
        <div className="flex flex-col justify-between gap-8 md:flex-row">
          <div className="flex flex-col gap-2">
            <Brand />
            <p className="text-xs text-muted-foreground">
              LMS sekolah untuk SD hingga SMK di Indonesia.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-8 text-xs md:gap-16">
            {FOOTER_COLUMNS.map((column) => (
              <nav key={column.title} aria-label={column.title}>
                <p className="font-medium">{column.title}</p>
                <ul className="mt-3 flex flex-col gap-2 text-muted-foreground">
                  {column.links.map((link) => (
                    <li key={link.label}>
                      <a href={link.href} className="hover:text-foreground">
                        {link.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>
            ))}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">© 2026 EduSaaS</p>
      </Container>
    </footer>
  )
}
