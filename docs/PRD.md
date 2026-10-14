# PRD — LMS SaaS Multi-Sekolah

14 Oktober 2026 · Riyen Perdana

## 1. Ringkasan Produk

Produk ini adalah LMS berbasis SaaS yang dipakai banyak sekolah (SD/MI, SMP/MTs, SMA/MA, SMK) dalam satu platform, dengan tiap sekolah mendapat subdomain dan data yang terisolasi. MVP mencakup landing page publik, onboarding sekolah, kelas–materi–tugas, ujian CBT, laporan nilai ke orang tua, serta langganan berbayar berjenjang.

**Nama kerja:** `EduSaaS` (placeholder, ganti sesuai brand).

**Masalah yang diselesaikan:**

- Banyak sekolah, terutama swasta dan madrasah, tidak punya tim IT untuk memasang dan merawat LMS sendiri (mis. Moodle).
- Guru memakai alat terpisah (WhatsApp, Google Form, Classroom) sehingga nilai dan tugas tersebar dan sulit direkap.
- Orang tua jarang mendapat informasi perkembangan nilai anak secara rutin.
- Sekolah butuh ujian berbasis komputer (CBT) yang murah tanpa server lokal.

**Proposisi nilai:** sekolah mendaftar, memilih paket, dan langsung bisa memakai LMS lengkap di `namasekolah.edusaas.id` dalam kurang dari 1 hari, tanpa instalasi.

## 2. Tujuan & Metrik Sukses

Target MVP: 10 sekolah pilot aktif memakai platform selama satu semester penuh, dengan minimal 3 di antaranya berlangganan berbayar.

| Tujuan | Metrik | Target 6 bulan setelah rilis |
| --- | --- | --- |
| Sekolah cepat mulai | Waktu dari daftar sampai kelas pertama dibuat | < 24 jam |
| Guru aktif memakai | Guru aktif mingguan / total guru | ≥ 60% |
| Siswa terlibat | Rasio tugas dikumpulkan tepat waktu | ≥ 70% |
| CBT andal | Ujian selesai tanpa gangguan teknis | ≥ 99% sesi |
| Orang tua terinformasi | Orang tua yang membuka laporan nilai per bulan | ≥ 40% |
| Bisnis berjalan | Konversi trial → berbayar | ≥ 25% |
| Platform stabil | Uptime bulanan | ≥ 99,5% |

> Angka target adalah asumsi awal; sesuaikan setelah uji coba dengan sekolah pilot.

## 3. Peran Pengguna

Ada enam peran; semua kecuali Super Admin terikat pada satu sekolah (tenant). Satu akun bisa punya peran berbeda di sekolah berbeda (mis. guru honorer di dua sekolah).

| Peran | Lingkup | Kebutuhan utama | Akses kunci |
| --- | --- | --- | --- |
| Super Admin | Seluruh platform | Kelola sekolah, paket, tagihan, dukungan | Dashboard platform, impersonate (dengan log audit) |
| Admin Sekolah | 1 sekolah | Setup cepat, impor data massal, kontrol langganan | Data master, pengguna, pengaturan, billing sekolah |
| Guru | Kelas yang diampu | Unggah materi, buat tugas & ujian, menilai cepat | Kelas, bank soal, penilaian, rekap nilai |
| Wali Kelas | 1 rombel | Pantau seluruh mapel di kelasnya, kirim laporan | Rekap nilai lintas mapel, laporan orang tua |
| Siswa | Kelas yang diikuti | Akses materi, kumpul tugas, ikut ujian | Dashboard siswa, tugas, CBT |
| Orang Tua | Anak yang tertaut | Lihat perkembangan nilai & tugas anak | Portal orang tua (read-only) |

**Catatan per jenjang:**

- **SD/MI:** antarmuka siswa sangat sederhana (ikon besar, sedikit teks); login siswa bisa via kode kelas + PIN karena banyak siswa belum punya email.
- **SMP/SMA/MA:** alur standar. Jenjang atas (SMA/MA) diprioritaskan karena sekolah pilot pertama adalah MAN 3 Pekanbaru.
- **SMK:** mendukung mapel produktif per jurusan/kompetensi keahlian, serta tugas berbentuk unggahan file besar (desain, video, proyek).

## 4. Ruang Lingkup

MVP dibatasi pada tujuh modul; fitur lain ditunda agar rilis pertama bisa dipakai sekolah pilot dalam ±4 bulan.

**Masuk MVP:**

1. Landing page publik + halaman harga + pendaftaran sekolah (trial 30 hari)
2. Onboarding & data master sekolah (tahun ajaran, semester, rombel, mapel, impor guru/siswa via Excel)
3. Manajemen pengguna & RBAC per tenant
4. Kelas, materi, dan tugas (termasuk penilaian & umpan balik)
5. Bank soal & ujian CBT dengan penilaian otomatis
6. Rekap nilai & laporan ke orang tua (portal + notifikasi email)
7. Langganan berjenjang, invoice, dan pembayaran via payment gateway (dikerjakan paling akhir; sebelumnya paket diaktifkan manual oleh Super Admin)

**Di luar MVP (fase berikutnya):**

- Absensi/presensi siswa
- E-rapor format resmi Kemendikbud/Kemenag
- Forum diskusi & chat real-time
- Integrasi video conference (Zoom/Meet) dan live class
- Aplikasi mobile native (MVP cukup PWA responsif)
- Gamifikasi, sertifikat, dan analitik pembelajaran lanjutan
- Notifikasi WhatsApp (MVP pakai email + notifikasi dalam aplikasi)
- Custom domain per sekolah (MVP pakai subdomain)
- Proctoring berbasis kamera untuk CBT

## 5. Arsitektur & Tech Stack

Aplikasi dibangun sebagai satu monolit TanStack Start dengan satu database PostgreSQL bersama; setiap tabel milik sekolah membawa kolom `school_id`, dan sekolah dikenali dari subdomain.

### 5.1 Tech stack

| Lapisan | Pilihan | Alasan |
| --- | --- | --- |
| Framework fullstack | TanStack Start (React, server functions) + TanStack Router | Type-safe end-to-end, routing berbasis file |
| Data fetching | TanStack Query | Cache & invalidasi di sisi klien |
| ORM | Prisma ORM + Prisma Migrate | Skema deklaratif, tipe otomatis, migrasi terkelola; RLS ditambahkan lewat migrasi SQL |
| Database | PostgreSQL 16+ | Satu DB bersama, RLS untuk isolasi tenant |
| Auth | Better Auth (email + password; tanpa plugin organization) | Sesi host-only per subdomain; peran per sekolah lewat `memberships` + RLS |
| Validasi | Zod | Satu skema untuk form, server function, dan env |
| UI | Tailwind CSS v4 + shadcn/ui preset `b1GKyb59c` (style base-lyra, Base UI, Inter), landing ditimpa tema monokrom (§5.4) | Komponen konsisten, mudah dihasilkan agen AI; warna landing dan dashboard bisa diganti terpisah |
| Form | TanStack Form atau React Hook Form + Zod | Validasi terpadu |
| Penyimpanan file | Adapter storage: driver `local` (folder di server, dipakai sekarang) dan driver S3-compatible (Cloudflare R2 / MinIO, menyusul) dengan presigned URL | Kode aplikasi hanya bergantung pada adapter, jadi pindah ke S3 cukup ganti driver lewat env tanpa mengubah fitur |
| Background job | pg-boss (antrian berbasis PostgreSQL) | Email, impor Excel, rekap nilai tanpa Redis |
| Email | SMTP / Resend | Notifikasi & laporan orang tua |
| Pembayaran | Xendit atau Midtrans (dibungkus adapter) | QRIS, VA, e-wallet; adapter memudahkan ganti provider |
| Testing | Vitest (unit/integrasi) + Playwright (E2E) | Gerbang mutu untuk kode hasil agen |
| Deploy | Tahap awal: localhost biasa tanpa Docker; reverse proxy Caddy/Traefik dengan wildcard TLS menyusul saat deploy | Mendukung `*.edusaas.id` |

> Pakai Prisma. Untuk shadcn dan TanStack, instalasi menggunakan:
>
> ```bash
> npx shadcn@latest init --preset b1GKyb59c --template start
> ```

### 5.2 Model multi-tenancy

- **Resolusi tenant:** middleware membaca host (`smkn1.edusaas.id` → slug `smkn1`), mencari `schools.slug`, lalu menaruh `schoolId` di konteks request. `www`/apex domain = landing page; `app.` = Super Admin.
- **Isolasi data, lapis 1 (aplikasi):** semua query lewat helper `tenantDb(schoolId)` (Prisma Client extension) yang wajib menambahkan `where: { schoolId }`. Query langsung ke model tenant tanpa helper dilarang (cek di code review & lint).
- **Isolasi data, lapis 2 (database):** Row Level Security PostgreSQL aktif di setiap tabel tenant; setiap transaksi Prisma (`$transaction`) diawali `select set_config('app.current_school_id', '<id>', true)`. Bila lapis 1 bocor, lapis 2 tetap menahan. Policy RLS ditulis di file migrasi SQL Prisma.
- **Tabel global** (tanpa `school_id`): `plans`, `users` (identitas), `platform_admins`, data referensi (provinsi, jenjang).
- **Kuota paket** (jumlah siswa, penyimpanan, fitur) dicek di service layer sebelum aksi create/upload.
- **Login:** sesi berlaku per subdomain; pengguna dengan beberapa sekolah memilih sekolah setelah login di `app.edusaas.id`.

**Development lokal (tanpa Docker):**

- PostgreSQL dipasang langsung di Windows; aplikasi jalan dengan `pnpm dev` di `localhost:3000`.
- Subdomain diuji lewat `*.localhost`, yang otomatis diarahkan browser modern ke 127.0.0.1: `localhost:3000` = landing page, `app.localhost:3000` = Super Admin, `man3pku.localhost:3000` = LMS sekolah contoh.
- Penyimpanan file memakai driver `local` (folder `.storage/`, tidak di-commit) di balik adapter storage. Kunci file selalu berawalan `schools/<school_id>/`, dan file dilayani lewat route aplikasi yang memeriksa tenant dan sesi. Pindah ke S3/R2 = menambah driver S3 dan mengganti `STORAGE_DRIVER` di env; skema dan fitur tidak berubah.
- Email dev dicatat ke console atau ditangkap Mailpit; pg-boss memakai PostgreSQL yang sama, jadi tidak perlu Redis.

### 5.3 Gambaran komponen

```text
 Pengunjung              Guru, siswa, orang tua        Super Admin
 edusaas.id              nama-sekolah.edusaas.id       app.edusaas.id
      │                           │                          │
      └─────────────┬─────────────┴──────────────┬───────────┘
                    ▼                            ▼
        Reverse proxy (Caddy/Traefik) · wildcard TLS *.edusaas.id
                                  │
 ┌────────────── Aplikasi TanStack Start (satu deployment) ──────────────┐
 │  Rute marketing        Rute LMS sekolah          Rute platform        │
 │         └─────────────────────┬──────────────────────┘                │
 │      Middleware: resolusi tenant (host → schools.slug → schoolId)     │
 │                               │                                       │
 │      Service layer + tenantDb(schoolId)                               │
 │      cek permission & kuota · set app.current_school_id per transaksi │
 └───────┬───────────────┬──────────────────┬───────────────┬────────────┘
         ▼               ▼                  ▼               ▼
   PostgreSQL       Object storage     Worker pg-boss   Payment gateway
   school_id + RLS  R2/MinIO,          impor Excel,     Xendit/Midtrans,
                    (tahap awal:       email, laporan   webhook ke billing
                    folder lokal)
```

Semua subdomain masuk ke satu aplikasi; setiap request melewati resolusi tenant, lalu service layer dan RLS PostgreSQL memastikan data hanya terbaca oleh sekolah pemiliknya.

### 5.4 Design system: token warna, font, dan dua tema

Landing page memakai desain **Opsi A (Product-first)**. Tema dashboard diambil langsung dari preset shadcn, sedangkan landing menimpanya dengan palet monokrom. Kedua area memakai nama token shadcn yang sama, jadi komponen `ui/` bisa dipakai di keduanya.

**Preset shadcn `b1GKyb59c`** (hasil `npx shadcn@latest init --preset b1GKyb59c --template start`):

| Field | Nilai |
| --- | --- |
| Style | `base-lyra` |
| Library komponen | Base UI (`@base-ui/react`), bukan Radix |
| Base color | neutral |
| Tema warna | orange (primary oranye) |
| Warna chart | amber |
| Font | Inter |
| Ikon | lucide |
| Radius | 0.625rem (10px) |
| Menu | accent `subtle`, color `default` |

**Pembagian file:**

| File | Isi | Siapa yang menulis |
| --- | --- | --- |
| File CSS hasil init (path-nya di `components.json` → `tailwind.css`) | Tailwind, pemetaan `@theme inline`, token `:root` dan `.dark` dari preset = **tema dashboard** | CLI shadcn. Jangan ubah nilainya manual |
| `src/styles/edusaas.css` | Font mono, `surface-subtle`, warna status, skala `text-mk-*` dan `text-ds-*` | Kita |
| `src/styles/themes/marketing.css` | Penimpa token untuk landing: `:root[data-theme="marketing"]` | Kita |

Tambahkan dua baris ini di file CSS hasil init, tepat setelah baris `@import` yang sudah ada:

```css
@import "./styles/edusaas.css";
@import "./styles/themes/marketing.css";
```

Path di atas relatif terhadap lokasi file CSS hasil init; sesuaikan bila lokasinya berbeda.

**Area dan tema:**

| Area | Route group | Atribut di `<html>` | Token | Mode gelap |
| --- | --- | --- | --- | --- |
| LMS sekolah & Super Admin | `(school)`, `(platform)` | tidak ada (default) | Preset shadcn + `edusaas.css` | Ya, kelas `.dark` |
| Landing, harga, daftar | `(marketing)` | `data-theme="marketing"` | `marketing.css` | Tidak (terang saja) |

**Token warna utama (terang):**

| Token | Dashboard (preset) | Landing (`marketing.css`) |
| --- | --- | --- |
| `primary` | oklch(0.553 0.195 38.402), oranye | oklch(0.205 0 0), #171717 |
| `primary-foreground` | oklch(0.98 0.016 73.684) | oklch(0.985 0 0) |
| `background` / `foreground` | putih / oklch(0.145 0 0) | sama |
| `muted` | oklch(0.97 0 0) | sama |
| `muted-foreground` | oklch(0.556 0 0), #737373 | oklch(0.51 0 0), #666666 |
| `border` / `input` | oklch(0.922 0 0) | sama |
| `chart-1…5` | skala amber | skala abu-abu |
| `sidebar-primary` | oranye | #171717 |
| `radius` | 10px | 8px |
| `surface-subtle` | oklch(0.985 0 0) | sama |
| `status-warning-*` | amber (dot, teks, bg, border) | — |
| `status-success-*` | emerald | — |
| `status-danger-*` | red | — |

Nilai lengkap terang dan gelap ada di file CSS. Tabel ini hanya ringkasan.

**Font:**

| Peran | Font | Sumber |
| --- | --- | --- |
| `font-sans`, `font-heading` | Inter | Dipasang preset shadcn |
| `font-mono` | JetBrains Mono (variable) | `@fontsource-variable/jetbrains-mono`, untuk NIS/NISN, token ujian, kode undangan |

**Skala tipografi:**

| Area | Kelas | Ukuran / berat | Untuk |
| --- | --- | --- | --- |
| Landing | `text-mk-display` | 38–68px responsif / 600, tracking −0.04em | Judul hero |
| Landing | `text-mk-h2` | 30–44px / 600, tracking −0.035em | Judul section |
| Landing | `text-mk-lead` | 18px | Sub-judul hero |
| Landing | `text-mk-body` | 15px | Isi |
| Landing | `text-mk-eyebrow` | 13px / 500 | Label di atas judul |
| Dashboard | `text-ds-page-title` | 22px / 600, tracking −0.025em | Satu h1 per halaman |
| Dashboard | `text-ds-body` | 14px | Deskripsi, isi dialog |
| Dashboard | `text-ds-table` | 13px | Sel tabel |
| Dashboard | `text-ds-meta` | 12px | Sub-teks, paginasi |
| Dashboard | `text-ds-caption` | 11px | Count, tanggal |

**Cara tema dipasang:** layout `(marketing)` mengisi `staticData: { theme: 'marketing' }`, lalu `__root.tsx` menaruhnya di `<html data-theme=…>`. Atributnya dipasang di `<html>`, bukan di `<div>` pembungkus, agar dialog, popover, dan toast yang di-*portal* ke `<body>` ikut mendapat tema. Kelas `.dark` hanya dipasang di area dashboard.

```tsx
// src/routes/(marketing)/route.tsx
export const Route = createFileRoute('/(marketing)')({
  staticData: { theme: 'marketing' },
})

// src/routes/__root.tsx (potongan)
const theme = useRouterState({
  select: (s) => s.matches.findLast((m) => m.staticData?.theme)?.staticData.theme,
})
return <html lang="id" data-theme={theme}>…</html>
```

**Mengganti warna nanti:**
- Dashboard: jalankan ulang CLI shadcn dengan preset lain. Jangan menyunting nilai `:root` hasil init secara manual.
- Landing: ubah `--primary` di `marketing.css`.

## 6. Kebutuhan Fungsional

Setiap kebutuhan diberi kode (mis. `LP-01`) agar bisa dirujuk langsung saat memberi perintah ke opencode dan saat menulis test.

### 6.1 Landing page (publik, domain utama)

- **LP-01** Beranda: hero, masalah–solusi, fitur per peran (guru/siswa/orang tua/admin), dukungan jenjang SD–SMK, testimoni, FAQ, CTA "Coba gratis 30 hari".
- **LP-02** Halaman fitur detail per modul (Kelas, CBT, Laporan Orang Tua).
- **LP-03** Halaman harga: tabel paket dibaca dari tabel `plans` (bukan hardcode), toggle bulanan/tahunan.
- **LP-04** Form pendaftaran sekolah: nama sekolah, NPSN, jenjang, slug subdomain (cek ketersediaan real-time), nama & email admin.
- **LP-05** Halaman kontak/demo, kebijakan privasi, syarat & ketentuan.
- **LP-06** SEO: SSR, meta tag & Open Graph per halaman, `sitemap.xml`, skor Lighthouse ≥ 90.

**Kriteria terima:** pendaftaran valid membuat record `schools` berstatus `trial`, akun admin, dan mengirim email verifikasi; slug yang sudah dipakai atau kata terlarang (`www`, `app`, `api`, `admin`) ditolak.

### 6.2 Onboarding & data master sekolah

- **OB-01** Wizard setup pertama: profil sekolah & logo → tahun ajaran & semester aktif → jurusan (khusus SMK) → rombel → mapel.
- **OB-02** Impor guru & siswa dari template Excel; validasi per baris, laporan error yang bisa diunduh, proses di background job.
- **OB-03** Penugasan guru: guru × mapel × rombel (= *kelas pembelajaran*), wali kelas per rombel.
- **OB-04** Kenaikan kelas/pergantian tahun ajaran: salin struktur rombel, pindahkan siswa, arsipkan kelas lama (data tetap bisa dibaca).
- **OB-05** Penautan orang tua ↔ siswa lewat kode undangan unik per siswa.

### 6.3 Pengguna & RBAC

- **US-01** Login email + password; siswa SD bisa login dengan NIS + PIN.
- **US-02** Reset password, verifikasi email, admin sekolah bisa reset password siswa/guru.
- **US-03** Permission berbasis peran dicek di setiap server function (bukan hanya disembunyikan di UI).
- **US-04** Log audit untuk aksi sensitif: ubah nilai, hapus data, impersonate, ubah langganan.

### 6.4 Kelas, materi & tugas

- **KL-01** Halaman kelas pembelajaran berisi tab: Materi, Tugas, Ujian, Nilai, Anggota.
- **KL-02** Materi disusun per topik/pertemuan; tipe: teks rich (editor), file (PDF/PPT/DOC), video (link YouTube/unggah), tautan. Bisa dijadwalkan terbit.
- **KL-03** Tugas: judul, instruksi, lampiran, tenggat, nilai maksimum, izinkan terlambat (ya/tidak, penalti %), tipe pengumpulan (teks, file, tautan).
- **KL-04** Siswa mengumpulkan, bisa mengganti sebelum tenggat; status: belum, dikumpulkan, terlambat, dinilai, dikembalikan untuk revisi.
- **KL-05** Guru menilai di satu layar (daftar siswa + pratinjau file), memberi nilai & komentar, dukungan rubrik sederhana.
- **KL-06** Notifikasi dalam aplikasi + email: tugas baru, tenggat H-1, tugas dinilai.
- **KL-07** Batas ukuran file mengikuti paket. Tahap awal: unggah lewat server ke driver `local`. Setelah driver S3 ada: unggah langsung ke storage via presigned URL.

### 6.5 Bank soal & CBT

- **CB-01** Bank soal per mapel & guru, bisa dibagikan ke guru lain di sekolah yang sama. Tipe soal MVP: pilihan ganda, pilihan ganda kompleks, benar/salah, isian singkat, esai.
- **CB-02** Soal mendukung gambar dan rumus (LaTeX/KaTeX); impor soal dari template Excel/Word.
- **CB-03** Ujian: pilih soal manual/acak dari bank, bobot per soal, durasi, jendela waktu mulai–selesai, acak urutan soal & opsi, token ujian opsional, jumlah percobaan.
- **CB-04** Pengerjaan: jawaban tersimpan otomatis ke server tiap perubahan (tahan koneksi putus), timer berbasis waktu server, navigasi nomor soal, tandai ragu-ragu.
- **CB-05** Anti-curang dasar: deteksi keluar tab/fullscreen (dicatat, bukan diblokir), satu sesi aktif per siswa, guru bisa reset sesi.
- **CB-06** Penilaian otomatis untuk soal objektif; esai dinilai manual; nilai akhir terhitung setelah semua esai dinilai.
- **CB-07** Monitor ujian langsung untuk guru: siapa sedang mengerjakan, progres, pelanggaran tercatat.
- **CB-08** Analisis hasil: rata-rata, sebaran nilai, tingkat kesukaran & daya beda per soal.

**Kriteria terima:** 500 siswa dalam satu sekolah dapat mengerjakan ujian bersamaan dengan waktu simpan jawaban p95 < 300 ms.

### 6.6 Rekap nilai & laporan orang tua

- **NL-01** Buku nilai per kelas pembelajaran: kolom dari tugas & ujian, kategori bobot (mis. Tugas 30%, UH 30%, PTS 20%, PAS 20%) yang bisa diatur guru.
- **NL-02** Rekap wali kelas: nilai semua mapel untuk satu rombel, ekspor Excel/PDF.
- **NL-03** Portal orang tua: daftar anak, nilai terbaru, tugas yang belum dikumpulkan, hasil ujian, komentar guru.
- **NL-04** Laporan berkala otomatis (mingguan/bulanan, diatur admin sekolah) dikirim via email ke orang tua; wali kelas juga bisa mengirim manual.
- **NL-05** Guru bisa menahan publikasi nilai (draft) sebelum terlihat oleh siswa & orang tua.

### 6.7 Langganan & pembayaran

- **BL-01** Paket berjenjang disimpan di tabel `plans`: harga, batas siswa, batas storage, daftar fitur (feature flag).
- **BL-02** Trial 30 hari untuk paket tertinggi tanpa kartu; pengingat H-7, H-3, H-1 sebelum berakhir.
- **BL-03** Checkout: pilih paket & periode (semester/tahunan) → invoice → bayar via payment gateway (QRIS, VA, e-wallet). Webhook memperbarui status; idempoten.
- **BL-04** Upgrade di tengah periode dengan prorata; downgrade berlaku di periode berikutnya.
- **BL-05** Masa tenggang 7 hari setelah jatuh tempo, lalu mode baca-saja (data tidak dihapus).
- **BL-06** Halaman billing sekolah: paket aktif, pemakaian kuota, riwayat invoice PDF.
- **BL-07** Super Admin: daftar sekolah & status langganan, pendapatan bulanan, ubah paket manual, beri diskon/kupon.

Contoh struktur paket (harga final ditentukan kemudian):

| Paket | Siswa maks. | Storage | Fitur |
| --- | --- | --- | --- |
| Basic | 300 | 20 GB | Kelas, materi, tugas, nilai |
| Pro | 1.000 | 100 GB | + CBT, laporan orang tua otomatis, analisis soal |
| Enterprise | Tak terbatas | Kustom | + dukungan prioritas, SLA, onboarding dibantu |

## 7. Model Data Inti

Semua tabel di bawah, kecuali yang bertanda **(global)**, wajib memiliki `school_id` (FK ke `schools`), indeks komposit diawali `school_id`, dan policy RLS. Primary key memakai UUID v7; semua tabel punya `created_at`, `updated_at`, dan `deleted_at` (soft delete) bila relevan. Di skema Prisma, nama model memakai PascalCase dan dipetakan ke nama tabel snake_case dengan `@@map`.

| Domain | Tabel | Kolom penting / catatan |
| --- | --- | --- |
| Tenant | `schools` **(global)** | slug (unik), npsn, name, level (`SD`,`SMP`,`SMA`,`SMK`,`MI`,`MTS`,`MA`), status (`trial`,`active`,`grace`,`readonly`,`suspended`), logo_url |
| Billing | `plans` **(global)** | code, name, price_semester, price_year, max_students, max_storage_gb, features (jsonb) |
| Billing | `subscriptions` | plan_id, status, period_start, period_end, trial_ends_at |
| Billing | `invoices` / `payments` | amount, status, gateway, gateway_ref (unik), paid_at, raw_payload (jsonb) |
| Identitas | `users` **(global)** | email, name, image, email_verified (kredensial di `accounts`) |
| Identitas | `sessions` / `accounts` / `verifications` **(global)** | milik Better Auth; hash sandi di `accounts.password`, tanpa RLS |
| Identitas | `memberships` | user_id, role (`school_admin`,`teacher`,`student`,`parent`), status |
| Akademik | `academic_years`, `semesters` | name, start_date, end_date, is_active |
| Akademik | `majors` | khusus SMK: kode & nama kompetensi keahlian |
| Akademik | `classrooms` (rombel) | semester_id, grade (1–12), major_id?, name, homeroom_teacher_id |
| Akademik | `subjects` | code, name, group (umum/produktif/muatan lokal) |
| Akademik | `students` / `teachers` | profil sekolah: nis/nisn, nip/nuptk, user_id |
| Akademik | `enrollments` | student_id, classroom_id |
| Akademik | `parent_links` | parent_user_id, student_id, invite_code |
| Pembelajaran | `courses` (kelas pembelajaran) | classroom_id, subject_id, teacher_id, semester_id |
| Pembelajaran | `course_sections`, `materials` | type (`text`,`file`,`video`,`link`), body, file_key, publish_at, order |
| Pembelajaran | `assignments` | due_at, max_score, allow_late, late_penalty_pct, submission_type |
| Pembelajaran | `submissions` | assignment_id, student_id, content, file_keys, status, score, feedback, graded_by |
| CBT | `question_banks`, `questions` | type, body (rich + LaTeX), options (jsonb), answer_key (jsonb), points |
| CBT | `exams` | course_id, duration_min, opens_at, closes_at, shuffle, token, max_attempts |
| CBT | `exam_questions` | exam_id, question_id (snapshot soal saat ujian dibuat), weight, order |
| CBT | `exam_attempts` | student_id, started_at, deadline_at, submitted_at, score, status |
| CBT | `exam_answers` | attempt_id, question_id, answer (jsonb), is_correct, score, updated_at |
| CBT | `exam_events` | attempt_id, type (`tab_blur`,`fullscreen_exit`,`reconnect`), at |
| Nilai | `grade_categories`, `grade_entries` | course_id, weight; entri dari tugas/ujian/manual, published |
| Laporan | `parent_reports` | student_id, period, sent_at, payload (jsonb) |
| Sistem | `notifications`, `audit_logs`, `files` | user_id, action, entity, before/after (jsonb); `files` mencatat ukuran untuk kuota |

**Aturan penting:**

- Soal ujian di-*snapshot* ke `exam_questions` saat ujian dipublikasikan, agar edit bank soal tidak mengubah ujian yang sedang/sudah berjalan.
- `gateway_ref` unik untuk menjamin webhook pembayaran idempoten.
- Nilai tidak pernah dihapus permanen; perubahan nilai tercatat di `audit_logs`.

## 8. Kebutuhan Non-Fungsional

Yang paling kritis adalah isolasi data antar sekolah dan keandalan CBT; keduanya punya test otomatis wajib.

| Aspek | Kebutuhan |
| --- | --- |
| Keamanan tenant | Test integrasi wajib: pengguna sekolah A tidak bisa membaca/mengubah data sekolah B lewat server function mana pun |
| Keamanan umum | Password di-hash (argon2/bcrypt), CSRF & rate limiting di login/registrasi/webhook, validasi Zod di semua input server, verifikasi signature webhook |
| Privasi data anak | Patuh UU PDP No. 27/2022: persetujuan sekolah sebagai pengendali data, data minimal, ekspor & penghapusan data atas permintaan sekolah |
| Performa | Halaman LMS TTFB < 500 ms (p95); simpan jawaban CBT < 300 ms (p95); query selalu terindeks `school_id` |
| Skala awal | 50 sekolah, 25.000 pengguna, 2.000 peserta CBT bersamaan di seluruh platform |
| Ketersediaan | Uptime ≥ 99,5%; backup DB harian (retensi 30 hari) + point-in-time recovery; uji restore tiap bulan |
| Aksesibilitas & perangkat | Responsif mulai lebar 360 px (HP Android kelas bawah), PWA, kontras WCAG AA |
| Bahasa & zona waktu | UI Bahasa Indonesia; waktu disimpan UTC, ditampilkan sesuai zona sekolah (WIB/WITA/WIT) |
| Observabilitas | Log terstruktur dengan `school_id` & `user_id`, error tracking (Sentry), health check endpoint |
| Kualitas kode | TypeScript strict, ESLint + Prettier, coverage service layer ≥ 70%, CI wajib hijau sebelum merge |

## 9. Struktur Proyek & Panduan Kerja dengan opencode

Agar opencode konsisten, simpan PRD ini di repo, tulis aturan proyek di `AGENTS.md`, dan kerjakan satu kode kebutuhan per sesi dengan alur Plan → Build → Test → Commit.

### 9.1 Struktur folder (feature-based)

```text
edusaas/
├─ AGENTS.md                  # aturan untuk opencode (wajib di-commit)
├─ opencode.json              # memuat docs/ sebagai instructions
├─ docs/
│  ├─ PRD.md                  # dokumen ini
│  ├─ decisions/              # ADR: keputusan arsitektur bernomor
│  └─ modules/                # spesifikasi detail per modul bila perlu
├─ prisma/
│  ├─ schema.prisma           # skema Prisma semua domain
│  ├─ migrations/             # migrasi Prisma + SQL policy RLS
│  └─ seed.ts                 # data contoh (paket, sekolah demo)
├─ src/
│  ├─ routes/
│  │  ├─ (marketing)/         # landing page, harga, daftar — domain utama
│  │  ├─ (platform)/          # super admin — app.edusaas.id
│  │  └─ (school)/            # LMS per tenant — {slug}.edusaas.id
│  ├─ features/               # satu folder per modul
│  │  ├─ onboarding/
│  │  ├─ academic/
│  │  ├─ courses/
│  │  ├─ assignments/
│  │  ├─ cbt/
│  │  ├─ grades/
│  │  ├─ parent-reports/
│  │  └─ billing/
│  │      ├─ components/      # UI khusus fitur
│  │      ├─ server/          # server functions (tipis, panggil service)
│  │      ├─ service.ts       # logika bisnis + cek permission & kuota
│  │      ├─ schema.ts        # skema Zod
│  │      └─ *.test.ts
│  ├─ db/
│  │  ├─ client.ts            # PrismaClient tunggal
│  │  └─ tenant.ts            # tenantDb(schoolId) + set RLS context
│  ├─ lib/                    # auth, storage, email, payment adapter, jobs
│  ├─ styles/
│  │  ├─ edusaas.css          # font mono, status, surface-subtle, skala text-mk-*/text-ds-*
│  │  └─ themes/
│  │     └─ marketing.css     # :root[data-theme="marketing"] penimpa token landing
│  │                          # (token dashboard = file CSS hasil shadcn init, lihat components.json)
│  ├─ components/
│  │  ├─ ui/                  # shadcn/ui (dipakai kedua area)
│  │  ├─ marketing/           # komponen khusus landing (Hero, FeatureGrid, PricingCard, …)
│  │  └─ dashboard/           # komponen khusus LMS (PageHeader, DataTable, StatusDot, …)
├─ tests/e2e/                 # Playwright
└─ .env.example               # DATABASE_URL ke PostgreSQL lokal
```

### 9.2 Isi awal `AGENTS.md`

```markdown
# EduSaaS — LMS multi-tenant untuk sekolah

Baca docs/PRD.md sebelum mengerjakan fitur. Rujuk kode kebutuhan (mis. CB-04).

## Stack
TanStack Start + Router + Query, Prisma ORM, PostgreSQL, Better Auth,
Zod, Tailwind + shadcn/ui, pg-boss, Vitest, Playwright. Package manager: pnpm.
Development di localhost tanpa Docker (PostgreSQL terpasang lokal di Windows).

## Perintah
- pnpm dev | pnpm test | pnpm test:e2e | pnpm lint | pnpm typecheck
- pnpm prisma migrate dev --name <nama> untuk perubahan skema
- pnpm prisma generate setelah mengubah schema.prisma

## Aturan WAJIB
1. Semua akses model tenant lewat tenantDb(schoolId). Jangan pakai prisma langsung.
2. Setiap model tenant baru: field schoolId, @@index diawali schoolId, policy RLS di migrasi SQL.
3. Server function: validasi Zod -> cek permission -> panggil service. Tanpa logika bisnis.
4. Setiap service baru wajib punya test, termasuk test isolasi antar sekolah.
5. Jangan ubah migrasi yang sudah ada; buat migrasi baru.
6. Teks UI berbahasa Indonesia. Waktu disimpan UTC.
7. Jangan menambah dependency baru tanpa menyebut alasannya.
8. Selesai = typecheck, lint, dan test hijau.
```

### 9.3 Alur kerja per fitur

1. Buka sesi baru per kode kebutuhan (mis. `KL-03`), mulai dengan agen **Plan**: minta rencana file yang akan dibuat/diubah tanpa menulis kode.
2. Tinjau rencananya, koreksi bila menyimpang dari PRD, lalu beralih ke agen **Build** untuk implementasi.
3. Minta opencode menulis test lebih dulu untuk aturan bisnis kritis (isolasi tenant, timer CBT, webhook pembayaran).
4. Jalankan `pnpm typecheck && pnpm lint && pnpm test`; perbaiki sampai hijau.
5. Review diff sendiri, commit kecil dengan pesan berawalan kode kebutuhan (`feat(KL-03): ...`).
6. Bila ada keputusan arsitektur baru, minta opencode mencatatnya di `docs/decisions/` dan, bila perlu, perbarui `AGENTS.md` (perintah `/init` bisa memperbaikinya secara otomatis).

**Contoh prompt:**

```text
Kerjakan KL-03 dan KL-04 dari docs/PRD.md (tugas & pengumpulan).
Ikuti struktur src/features/assignments seperti src/features/courses.
Tulis test service termasuk: siswa sekolah lain tidak bisa mengumpulkan,
pengumpulan setelah tenggat ditandai terlambat dan kena penalti.
Jangan sentuh modul lain.
```

**Tips:**

- Daftarkan `docs/PRD.md` di field `instructions` pada `opencode.json` agar selalu dimuat sebagai konteks ([dokumentasi Rules](https://opencode.ai/docs/rules/)).
- Bangun satu modul referensi yang rapi lebih dulu (mis. `academic`), lalu minta opencode meniru polanya untuk modul berikutnya.
- Jangan beri satu prompt untuk banyak modul sekaligus; konteks terlalu luas menurunkan kualitas.

## 10. Roadmap Pengembangan

MVP dipecah menjadi 8 fase berurutan selama ±20 minggu (asumsi 1 developer dibantu opencode); setiap fase punya gerbang yang harus lolos sebelum fase berikutnya dimulai.

| Fase | Minggu | Cakupan | Gerbang (acceptance) |
| --- | --- | --- | --- |
| F0 Fondasi | 1–2 | Setup repo, tooling, PostgreSQL terpasang lokal, Prisma, Better Auth, resolusi subdomain, `tenantDb` + RLS, CI, `AGENTS.md` | Test isolasi tenant lulus; login di 2 subdomain berbeda tidak saling bocor |
| F1 Landing & registrasi | 3–4 | LP-01 s.d. LP-06, sekolah status trial, dashboard Super Admin dasar, tabel `plans` + aktivasi paket manual oleh Super Admin | Sekolah baru terdaftar dan bisa login di subdomainnya < 5 menit |
| F2 Onboarding & pengguna | 5–7 | OB-01 s.d. OB-05, US-01 s.d. US-04 | Impor 1.000 siswa dari Excel < 2 menit dengan laporan error per baris |
| F3 Kelas, materi & tugas | 8–10 | KL-01 s.d. KL-07 | Alur guru buat tugas → siswa kumpul → guru nilai lulus E2E |
| F4 CBT | 11–13 | CB-01 s.d. CB-08 | Load test 500 peserta bersamaan, simpan jawaban p95 < 300 ms; jawaban tidak hilang saat koneksi putus |
| F5 Nilai & laporan ortu | 14–15 | NL-01 s.d. NL-05 | Orang tua tertaut melihat nilai anak; email laporan bulanan terkirim |
| F6 Hardening & pilot | 16–18 | Review keamanan, backup & uji restore, monitoring, dokumen bantuan, pilot di MAN 3 Pekanbaru | Tidak ada bug kritis terbuka; MAN 3 Pekanbaru aktif memakai platform |
| F7 Langganan & pembayaran | 19–20 | BL-01 s.d. BL-07, kuota & feature flag otomatis, pilih payment gateway, finalisasi harga | Pembayaran sandbox end-to-end; webhook ganda tidak membuat pembayaran ganda |

**Definition of Done untuk setiap kode kebutuhan:**

- [ ] Sesuai deskripsi & kriteria terima di PRD
- [ ] Permission dan isolasi tenant diuji
- [ ] Typecheck, lint, unit & integration test hijau; E2E untuk alur utama
- [ ] Tampilan dicek di lebar 360 px dan desktop
- [ ] Teks UI Bahasa Indonesia, pesan error jelas
- [ ] Migrasi DB baru (bila ada) bisa dijalankan dari nol

## 11. Risiko & Keputusan

Risiko terbesar adalah kebocoran data antar sekolah dan CBT yang gagal saat ujian serentak; mitigasinya sudah dikunci di fase F0 dan F4.

| Risiko | Dampak | Mitigasi |
| --- | --- | --- |
| Data bocor antar sekolah | Sangat tinggi (kepercayaan & hukum) | `tenantDb` + RLS, test isolasi wajib, review manual tiap server function baru |
| CBT gagal saat ujian serentak | Tinggi | Autosave per jawaban, timer server, load test, jadwal ujian dibatasi per paket |
| Kode hasil agen tidak konsisten | Sedang | `AGENTS.md` ketat, modul referensi, prompt per kode kebutuhan, CI wajib hijau |
| Koneksi internet sekolah lemah | Sedang | Halaman ringan, aset di CDN, antrean jawaban di klien saat offline singkat |
| Lonjakan biaya storage video | Sedang | Kuota per paket, dorong video via YouTube, kompresi |
| Perubahan kurikulum/format rapor | Rendah untuk MVP | Bobot & kategori nilai dapat diatur; e-rapor resmi ditunda |

**Keputusan & pertanyaan terbuka:**

| Topik | Status |
| --- | --- |
| Nama produk & domain utama | Sementara pakai localhost (`*.localhost`); nama & domain ditentukan nanti |
| ORM | **Diputuskan:** Prisma |
| Payment gateway (Xendit/Midtrans) | Ditunda ke akhir (F7); utamakan fitur lain dulu |
| Harga final & periode tagihan | Ditentukan di akhir (F7) |
| Sekolah pilot & jenjang prioritas | **Diputuskan:** MAN 3 Pekanbaru, jenjang atas (SMA/MA) |
| Hosting | Sementara lokal dahulu |
| Penyesuaian khusus Kemenag untuk madrasah | Ditanyakan di akhir |
