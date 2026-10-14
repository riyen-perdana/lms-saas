# Progres Pengerjaan EduSaaS

Terakhir diperbarui: 2026-10-15 · commit `5654607`
Pemeriksaan: typecheck, lint, 154 test unit, 69 E2E (Playwright), dan `pnpm build` hijau.

## Status per fase (PRD §10)

| Fase | Status |
| --- | --- |
| F0 Fondasi | **Selesai** — tenant, RLS, Better Auth, login per subdomain, CI |
| F1 Landing & registrasi | **Selesai** (utang di bawah) |
| F2 Onboarding & pengguna | **Berjalan** — OB-01 selesai; sisa OB-02..05, US-01..04 |

### Sudah jadi di F0–F1
- Resolusi subdomain, `tenantDb` + RLS, test isolasi antar sekolah
- Login email + password dengan cookie host-only per subdomain; `/beranda` sekolah (placeholder)
- LP-01 landing, LP-04 pendaftaran sekolah (cek subdomain real-time, trial 30 hari)
- Dashboard Super Admin (`app.localhost:3000/platform`): ringkasan, daftar sekolah, aktivasi paket manual, penangguhan
- Sekolah `suspended` ditolak di login dan pada sesi yang sudah ada
- US-02: reset sandi, verifikasi email (adapter email + antrean pg-boss)
- Job kedaluwarsa langganan tiap 30 menit

### Sisa F1 (urutan disarankan)
1. ~~Perlindungan `/daftar`~~ selesai: rate limit berbasis DB (`src/lib/rate-limit.ts`, 5 daftar/IP/jam; env `REGISTER_RATE_LIMIT` untuk dev/E2E). Captcha belum; di produksi pastikan proxy mengisi `x-forwarded-for`
2. ~~LP-03~~ selesai: `/harga` + beranda membaca `plans` (Standar, Pro, kartu Enterprise statis). Harga seed masih sementara (final di F7)
3. ~~LP-05~~ selesai: `/kontak` (simpan ke `contact_requests`, notifikasi ke env `CONTACT_EMAIL`), `/privasi`, `/syarat` (draf, perlu tinjauan hukum). Belum ada UI baca pesan kontak di Super Admin
4. ~~LP-06~~ selesai: `seoMeta`, `/sitemap.xml`, `/robots.txt` (sekolah/platform tidak diindeks), noindex di login. Lighthouse ≥ 90 belum diukur; og:image/canonical belum ada
5. ~~LP-02~~ selesai: `/fitur` (Kelas, Ujian CBT, Laporan orang tua) dari `src/features/marketing/features.ts`; semua poin berlabel "Segera hadir", cabut `soon: true` per poin saat fitur rilis

### F2 (berjalan)
- Adapter storage `src/lib/storage` (driver `local` ke `.storage/`, `memory` untuk test; env `STORAGE_DRIVER`/`STORAGE_DIR`). Kunci file `schools/<school_id>/...`. Driver S3/R2 ditambahkan nanti tanpa mengubah pemanggil
- OB-01 selesai: tabel `academic_years`, `semesters`, `majors`, `classrooms`, `subjects` (RLS, satu tahun/semester aktif per sekolah), service di `src/features/academic`, wizard `/setup` (profil+logo, tahun ajaran, jurusan khusus SMK, rombel, mapel) dan `GET /api/logo`. Admin sekolah yang `setup_completed_at`-nya kosong diarahkan ke `/setup`
- Server function sekolah memakai `schoolAdminMiddleware` (login, peran school_admin, tolak suspended/readonly)
- Belum: wali kelas di rombel (OB-03), impor guru/siswa (OB-02), pergantian tahun ajaran (OB-04), kode undangan orang tua (OB-05), log audit (US-04)
- E2E mematikan devtools lewat `VITE_E2E`; matikan server dev manual sebelum `pnpm test:e2e` agar tidak dipakai ulang

## Akun dev
Jalankan `pnpm db:seed`. Sandi `ubah-sandi-ini-123` (atau `SEED_ADMIN_PASSWORD`).

| Peran | Alamat | Email |
| --- | --- | --- |
| Super Admin | `http://app.localhost:3000` | `superadmin@edusaas.id` |
| Admin MAN 3 Pekanbaru | `http://man3pku.localhost:3000` | `admin@man3pku.sch.id` |
| Admin SMA Demo | `http://sekolahdemo.localhost:3000` | `admin@sekolahdemo.sch.id` |

Email di development tidak dikirim sungguhan: lihat konsol server atau folder `.email-outbox/`.

## Keputusan yang perlu diketahui
- Verifikasi email **bukan** syarat login (`requireEmailVerification` di `src/lib/auth.ts`).
- Masa tenggang `grace` = 7 hari (asumsi, PRD tidak menyebut). Alur: trial habis → `readonly`; berbayar habis → `grace` → `readonly`.
- Super Admin = baris di tabel `platform_admins`; akses lintas sekolah lewat `platformDb()` (flag RLS `app.is_platform`).
- Cache tenant 30 detik per proses; `invalidateTenantCache` dipanggil saat status berubah.
- Worker pg-boss berjalan di dalam proses aplikasi; pisahkan ke proses worker saat deploy (F6).
- Email dev memakai driver `console` (cetak + simpan ke `.email-outbox/`); penyedia nyata ditambahkan sebagai driver di `src/lib/email/index.ts`.
- Dashboard platform di `/platform/*` pada host `app.localhost`; sekolah punya `/beranda` (placeholder) dan `/setup` (wizard OB-01).
- Server function sekolah memakai `schoolAdminMiddleware` (`src/features/auth/server/school-admin.ts`); tolak sekolah `suspended` dan `readonly`.
- Penyimpanan file lewat `src/lib/storage` (driver `local` ke `.storage/`); kunci selalu `schools/<school_id>/...`.
- Wali kelas di rombel (`homeroom_teacher_id`) sengaja belum ada; ditambahkan di OB-03 setelah tabel guru ada.

## Utang / belum ada
- Email pemberitahuan trial segera berakhir; penyedia email nyata (hanya driver `console`/`memory`)
- UI tambah/cabut Super Admin; log audit (US-04)
- Setiap server function sekolah baru **wajib** mengecek status sekolah (suspended), selain permission

## Jebakan
- Setelah `prisma migrate`/`generate`, matikan server dev lama di port 3000 sebelum menjalankan E2E.
- Aksi di form klien harus menunggu hydrate; di E2E pakai `expect(...).toPass()`.
- Skema Zod dipakai klien lalu server, jadi harus idempoten (parse dua kali).
- Migrasi baru harus bertimestamp setelah migrasi terakhir di `prisma/migrations/`. `prisma migrate dev` memakai jam sistem untuk nama folder, jadi cek dan rename bila perlu (jangan ubah migrasi yang sudah diterapkan).
- E2E mematikan devtools lewat `VITE_E2E` (tombolnya menutupi tombol kanan-bawah di layar 360px). Server dev yang dijalankan manual dipakai ulang oleh Playwright dan menampilkan devtools, jadi matikan dulu.
- Assertion E2E "bukan /login" terlalu lemah; pakai URL tujuan yang positif.
- Fixture E2E yang membuat sekolah langsung harus mengisi `setupCompletedAt`, kalau tidak login diarahkan ke `/setup`.
- Form dan aksi klien dinonaktifkan sampai hydrate (`useHydrated` di `src/components/dashboard/form-field.tsx`), supaya submit tidak menjadi GET native.
- Test integrasi memakai `DATABASE_URL` (superuser) untuk fixture dan `DATABASE_APP_URL` (role `edusaas_app`, kena RLS) lewat service; jangan membalik keduanya.
- Console piping devtools dimatikan di `vite.config.ts` (memantulkan log hydration dari ekstensi browser).
- Log `Error: aborted ... ECONNRESET` di server dev muncul saat browser menutup koneksi; tidak berbahaya.
- Windows/CRLF: edit file lewat tool Edit; skrip Python harus membuka file dengan `newline=''`. Perintah bash yang sangat panjang bisa gagal di-parse, tulis file lewat tool Write.
