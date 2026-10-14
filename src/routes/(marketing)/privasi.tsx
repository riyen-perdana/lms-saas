// Kebijakan privasi (LP-05). Teks mendeskripsikan perilaku sistem saat ini;
// perlu ditinjau konsultan hukum sebelum peluncuran publik.

import { createFileRoute } from "@tanstack/react-router"

import { LegalPage, LegalSection } from "@/components/marketing/legal-page"
import { seoMeta } from "@/lib/seo"

export const Route = createFileRoute("/(marketing)/privasi")({
  staticData: { theme: "marketing" },
  head: () => ({
    meta: seoMeta({
      title: "Kebijakan privasi — EduSaaS",
      description:
        "Data apa yang dikumpulkan EduSaaS, bagaimana data sekolah dipisahkan, dan hak Anda atas data tersebut.",
    }),
  }),
  component: PrivacyPage,
})

function PrivacyPage() {
  return (
    <LegalPage title="Kebijakan privasi" updated="14 Oktober 2026">
      <LegalSection title="1. Data yang kami kumpulkan">
        <p>
          Saat sekolah mendaftar, kami menyimpan nama dan jenjang sekolah, NPSN
          (bila diisi), serta nama, email, dan kata sandi admin. Kata sandi
          disimpan dalam bentuk hash, bukan teks asli.
        </p>
        <p>
          Selama layanan dipakai, sekolah mengunggah dan mengelola data
          pembelajaran: data guru dan siswa, kelas, materi, tugas, ujian, dan
          nilai. Kami juga menyimpan pesan yang Anda kirim lewat form kontak.
        </p>
      </LegalSection>
      <LegalSection title="2. Peran sekolah dan EduSaaS">
        <p>
          Data guru dan siswa adalah milik sekolah. Sekolah menentukan siapa
          yang boleh mengakses dan mengelolanya; EduSaaS memprosesnya hanya
          untuk menjalankan layanan.
        </p>
      </LegalSection>
      <LegalSection title="3. Pemisahan data antar sekolah">
        <p>
          Setiap sekolah memiliki subdomain sendiri. Data dipisahkan di lapisan
          aplikasi dan di database sehingga pengguna satu sekolah tidak dapat
          membaca data sekolah lain.
        </p>
      </LegalSection>
      <LegalSection title="4. Cookie">
        <p>
          Kami memakai cookie sesi untuk menjaga Anda tetap masuk. Cookie ini
          hanya berlaku untuk subdomain tempat Anda masuk dan tidak dipakai
          untuk iklan atau pelacakan lintas situs.
        </p>
      </LegalSection>
      <LegalSection title="5. Email">
        <p>
          Kami mengirim email yang berkaitan dengan akun, seperti verifikasi
          email dan atur ulang kata sandi, serta pemberitahuan layanan
          langganan.
        </p>
      </LegalSection>
      <LegalSection title="6. Penyimpanan dan penghapusan">
        <p>
          Data disimpan selama sekolah berlangganan. Sekolah dapat meminta
          ekspor atau penghapusan data lewat halaman kontak; permintaan
          diproses dalam waktu wajar setelah identitas admin sekolah
          diverifikasi.
        </p>
      </LegalSection>
      <LegalSection title="7. Hubungi kami">
        <p>
          Pertanyaan tentang kebijakan ini dapat dikirim lewat halaman{" "}
          <a href="/kontak" className="underline underline-offset-4">
            kontak
          </a>
          .
        </p>
      </LegalSection>
    </LegalPage>
  )
}
