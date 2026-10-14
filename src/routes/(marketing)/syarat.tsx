// Syarat & ketentuan (LP-05). Teks mendeskripsikan perilaku sistem saat ini
// (trial 30 hari, mode hanya-baca, penangguhan); perlu ditinjau konsultan hukum.

import { createFileRoute } from "@tanstack/react-router"

import { LegalPage, LegalSection } from "@/components/marketing/legal-page"
import { seoMeta } from "@/lib/seo"

export const Route = createFileRoute("/(marketing)/syarat")({
  staticData: { theme: "marketing" },
  head: () => ({
    meta: seoMeta({
      title: "Syarat & ketentuan — EduSaaS",
      description:
        "Ketentuan penggunaan EduSaaS: trial, langganan, tanggung jawab sekolah, dan penangguhan akun.",
    }),
  }),
  component: TermsPage,
})

function TermsPage() {
  return (
    <LegalPage title="Syarat & ketentuan" updated="14 Oktober 2026">
      <LegalSection title="1. Penerimaan">
        <p>
          Dengan mendaftarkan sekolah atau memakai EduSaaS, Anda menyatakan
          berwenang mewakili sekolah dan menyetujui ketentuan ini.
        </p>
      </LegalSection>
      <LegalSection title="2. Trial dan langganan">
        <p>
          Setiap sekolah baru mendapat trial 30 hari tanpa kartu kredit. Setelah
          trial berakhir tanpa paket berbayar, akun masuk mode hanya-baca: data
          tetap aman dan dapat dilihat, tetapi tidak dapat diubah sampai paket
          diaktifkan.
        </p>
        <p>
          Langganan berbayar berlaku per semester atau per tahun sesuai paket.
          Saat masa berlangganan habis, tersedia masa tenggang sebelum akun
          masuk mode hanya-baca.
        </p>
      </LegalSection>
      <LegalSection title="3. Tanggung jawab sekolah">
        <p>
          Sekolah bertanggung jawab atas keakuratan data yang diunggah, menjaga
          kerahasiaan kata sandi, dan memastikan penggunaan oleh guru dan siswa
          sesuai hukum yang berlaku, termasuk soal persetujuan data siswa.
        </p>
      </LegalSection>
      <LegalSection title="4. Penggunaan yang dilarang">
        <p>
          Dilarang menyalahgunakan layanan untuk mengakses data sekolah lain,
          mengganggu kinerja layanan, atau mengunggah konten yang melanggar
          hukum.
        </p>
      </LegalSection>
      <LegalSection title="5. Penangguhan">
        <p>
          Kami dapat menangguhkan akun sekolah yang melanggar ketentuan ini atau
          yang tidak membayar. Selama ditangguhkan, pengguna sekolah tidak dapat
          masuk. Data tidak dihapus dan akses dipulihkan setelah masalah
          diselesaikan.
        </p>
      </LegalSection>
      <LegalSection title="6. Ketersediaan layanan">
        <p>
          Kami berupaya menjaga layanan tetap tersedia, tetapi tidak menjamin
          bebas gangguan. Pemeliharaan terjadwal akan diumumkan bila
          memengaruhi ujian yang sedang berlangsung.
        </p>
      </LegalSection>
      <LegalSection title="7. Perubahan ketentuan">
        <p>
          Ketentuan ini dapat berubah. Perubahan penting akan diberitahukan
          lewat email admin sekolah.
        </p>
      </LegalSection>
      <LegalSection title="8. Kontak">
        <p>
          Pertanyaan dapat dikirim lewat halaman{" "}
          <a href="/kontak" className="underline underline-offset-4">
            kontak
          </a>
          .
        </p>
      </LegalSection>
    </LegalPage>
  )
}
