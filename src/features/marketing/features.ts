// Isi halaman fitur (LP-02), diturunkan dari PRD §6.4–6.6.
// `soon: true` = belum tersedia di aplikasi; cabut saat fitur rilis.

export type FeaturePoint = { text: string; soon?: boolean }

export type FeatureGroup = {
  id: string
  eyebrow: string
  title: string
  lead: string
  points: FeaturePoint[]
}

export const FEATURE_GROUPS: FeatureGroup[] = [
  {
    id: "kelas",
    eyebrow: "Kelas",
    title: "Kelas, materi, dan tugas dalam satu tempat",
    lead: "Guru menyusun pembelajaran, siswa mengumpulkan tugas, dan penilaian selesai di satu layar.",
    points: [
      {
        text: "Materi per topik atau pertemuan: teks, file PDF/PPT/DOC, video, dan tautan. Bisa dijadwalkan terbit.",
        soon: true,
      },
      {
        text: "Tugas dengan tenggat, nilai maksimum, dan aturan keterlambatan beserta penalti.",
        soon: true,
      },
      {
        text: "Siswa mengumpulkan lewat teks, file, atau tautan, dan boleh mengganti sebelum tenggat.",
        soon: true,
      },
      {
        text: "Guru menilai di satu layar: daftar siswa, pratinjau file, nilai, komentar, dan rubrik sederhana.",
        soon: true,
      },
      {
        text: "Notifikasi di aplikasi dan email untuk tugas baru, tenggat besok, dan tugas yang sudah dinilai.",
        soon: true,
      },
    ],
  },
  {
    id: "cbt",
    eyebrow: "Ujian CBT",
    title: "Ujian berbasis komputer tanpa server lokal",
    lead: "Dari bank soal sampai analisis hasil, berjalan di browser dan tahan koneksi yang tidak stabil.",
    points: [
      {
        text: "Bank soal per mapel yang bisa dibagikan antar guru: pilihan ganda, pilihan ganda kompleks, benar/salah, isian singkat, dan esai.",
        soon: true,
      },
      {
        text: "Soal dengan gambar dan rumus; impor soal dari template Excel atau Word.",
        soon: true,
      },
      {
        text: "Atur durasi, jendela waktu, acak soal dan opsi, token ujian, serta jumlah percobaan.",
        soon: true,
      },
      {
        text: "Jawaban tersimpan otomatis ke server di setiap perubahan, dan timer mengikuti jam server.",
        soon: true,
      },
      {
        text: "Anti-curang dasar: keluar tab atau fullscreen dicatat, satu sesi aktif per siswa, dan guru bisa mereset sesi.",
        soon: true,
      },
      {
        text: "Soal objektif dinilai otomatis; esai dinilai manual oleh guru.",
        soon: true,
      },
      {
        text: "Monitor ujian langsung: siapa yang sedang mengerjakan, progres, dan pelanggaran yang tercatat.",
        soon: true,
      },
      {
        text: "Analisis hasil: rata-rata, sebaran nilai, tingkat kesukaran, dan daya beda tiap soal.",
        soon: true,
      },
    ],
  },
  {
    id: "laporan",
    eyebrow: "Laporan orang tua",
    title: "Nilai sampai ke orang tua tanpa rekap manual",
    lead: "Buku nilai guru, rekap wali kelas, dan portal orang tua memakai data yang sama.",
    points: [
      {
        text: "Buku nilai per kelas dengan kategori bobot (tugas, ulangan harian, PTS, PAS) yang diatur guru.",
        soon: true,
      },
      {
        text: "Rekap wali kelas untuk semua mapel dalam satu rombel, dapat diekspor ke Excel atau PDF.",
        soon: true,
      },
      {
        text: "Portal orang tua: nilai terbaru, tugas yang belum dikumpulkan, hasil ujian, dan komentar guru.",
        soon: true,
      },
      {
        text: "Laporan berkala otomatis lewat email, mingguan atau bulanan; wali kelas juga bisa mengirim manual.",
        soon: true,
      },
      {
        text: "Guru dapat menahan publikasi nilai sebagai draf sebelum terlihat oleh siswa dan orang tua.",
        soon: true,
      },
    ],
  },
]
