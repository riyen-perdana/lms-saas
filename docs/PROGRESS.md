# Progres Pengerjaan EduSaaS

Terakhir diperbarui: 2026-10-14 · commit `6fe3dc5`
Pemeriksaan: typecheck, lint, 116 test unit, 60 E2E (Playwright), dan `pnpm build` hijau.

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

## Utang / belum ada
- Email pemberitahuan trial segera berakhir; penyedia email nyata (hanya driver `console`/`memory`)
- UI tambah/cabut Super Admin; log audit (US-04)
- Setiap server function sekolah baru **wajib** mengecek status sekolah (suspended), selain permission

## Jebakan
- Setelah `prisma migrate`/`generate`, matikan server dev lama di port 3000 sebelum menjalankan E2E.
- Aksi di form klien harus menunggu hydrate; di E2E pakai `expect(...).toPass()`.
- Skema Zod dipakai klien lalu server, jadi harus idempoten (parse dua kali).
- Migrasi baru harus bertimestamp setelah `20261015120000_better_auth`.
