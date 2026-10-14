# Progres Pengerjaan EduSaaS

Terakhir diperbarui: 2026-10-14 · commit `88d6c26`
Pemeriksaan: typecheck, lint, 106 test unit, 52 E2E (Playwright), dan `pnpm build` hijau.

## Status per fase (PRD §10)

| Fase | Status |
| --- | --- |
| F0 Fondasi | **Selesai** — tenant, RLS, Better Auth, login per subdomain, CI |
| F1 Landing & registrasi | **Hampir** — sisa di bawah |
| F2 dst. | Belum dimulai |

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
3. LP-02 fitur detail · LP-05 kontak, privasi, syarat (`/kontak` kini 404) · LP-06 SEO dan sitemap

Berikutnya F2: OB-01..05, US-01..04 (impor Excel, wizard tahun ajaran, log audit).

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
