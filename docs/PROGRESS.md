# Progres Pengerjaan EduSaaS

Terakhir diperbarui: 2026-10-15
Pemeriksaan: typecheck, lint, 204 test unit, 77 E2E (Playwright, 1 skipped), dan `pnpm build` hijau.

## Status per fase (PRD §10)

| Fase | Status |
| --- | --- |
| F0 Fondasi | **Selesai** — tenant, RLS, Better Auth, login per subdomain, CI |
| F1 Landing & registrasi | **Selesai** (utang di bawah) |
| F2 Onboarding & pengguna | **Berjalan** — OB-01 s.d. OB-03 selesai; sisa OB-04, OB-05, US-01 (login siswa SD via NIS+PIN), US-04 |

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
- OB-02 selesai: impor guru & siswa dari `.xlsx` (template diunduh dari `/impor`), tabel `teachers`, `students`, `enrollments`, `import_batches`, `import_errors` (RLS + index parsial unik kode guru/NIS), service + worker pg-boss di `src/features/people-import`, halaman `/impor`, route unduhan `/api/impor-template` dan `/api/laporan-impor/$batchId`
- OB-03 selesai: tabel `courses` (kelas pembelajaran = rombel x mapel x guru x semester) + kolom `classrooms.homeroom_teacher_id` (RLS, indeks parsial unik), service + server function di `src/features/teaching-assignment`, halaman `/penugasan` (tabel kelas pembelajaran semester aktif, filter per rombel, form tambah, daftar wali kelas per rombel)
- Server function sekolah memakai `schoolAdminMiddleware` (login, peran school_admin, tolak suspended/readonly)
- Belum: pergantian tahun ajaran (OB-04), kode undangan orang tua (OB-05), daftar/ubah data guru & siswa di UI (OB-02 baru impor), log audit (US-04)
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
- Dashboard platform di `/platform/*` pada host `app.localhost`; sekolah punya `/beranda` (placeholder), `/setup` (wizard OB-01), `/impor` (OB-02), dan `/penugasan` (OB-03).
- Server function sekolah memakai `schoolAdminMiddleware` (`src/features/auth/server/school-admin.ts`); tolak sekolah `suspended` dan `readonly`.
- Penyimpanan file lewat `src/lib/storage` (driver `local` ke `.storage/`); kunci selalu `schools/<school_id>/...`.
- Wali kelas di rombel (`homeroom_teacher_id`) dan penugasan guru (OB-03) selesai; belum ada layar kelas untuk guru/siswa (F3)
- `/penugasan` (OB-03) hanya menampilkan **semester aktif**; belum ada pemilih semester (kelas pembelajaran untuk semester lama hanya terlihat lewat data, belum ada UI)
- OB-03: aturan "satu rombel satu mapel per semester" dan "satu guru satu wali rombel per semester" dijamin indeks unik parsial di migrasi (bukan hanya pengecekan di service), jadi tetap aman saat dua admin menyimpan bersamaan; `createCourse`/`setHomeroomTeacher` tetap menangkap P2002 lalu mengubahnya jadi pesan ramah
- OB-03: halaman membaca satu "papan penugasan" (`getAssignmentBoard`) dalam SATU transaksi tenantDb — semester, rombel, mapel, guru, dan kelas pembelajaran selalu dari snapshot yang sama; filter per rombel dikerjakan di klien karena datanya satu semester
- OB-03: `courses.semester_id` sebenarnya bisa diturunkan dari rombel, tapi tetap disimpan (PRD §7) dan dipakai service sebagai pemeriksaan integritas; `semesters` tidak punya `deleted_at`, jadi query semester tidak memfilter `deletedAt`
- OB-03: Error memakai kode yang sama dengan modul lain: `INVALID | DUPLICATE | NOT_FOUND` di `TeachingError`
- OB-02: impor memvalidasi tiap baris dan berhenti di batch yang gagal total (sheet/judul kolom salah, berkas rusak); baris cacat lain hanya jadi baris gagal, tidak membatalkan impor.
- OB-02: baris duplikat (dalam berkas, huruf besar/kecil berbeda, atau sudah ada di sekolah) **ditolak**, bukan menimpa. Impor ulang setelah koreksi aman; konsekuensinya perbaikan data harus lewat modul lain (belum ada UI ubah).
- OB-02: kolom `Kode guru` sengaja terpisah dari NIP/NUPTK karena guru honor belum tentu punya NIP; kode guru adalah kunci unik profil guru di sekolah.
- OB-02: impor siswa memakai domain email `<nis>@<slug>.invalid` (RFC 2606, tidak bisa dirutekan) karena `users.email` wajib unik global, sedangkan siswa login lewat NIS + PIN (US-01).
- OB-02: guru mendapat `accounts` (credential) dengan sandi acak yang tidak pernah dibagikan + email tautan "atur sandi" (memakai `auth.api.requestPasswordReset`, jadi alur sama dengan US-02). Kegagalan email tidak membatalkan impor; guru bisa memakai "Lupa sandi".
- OB-02: batch diproses oleh worker pg-boss (queue `import-people`), bukan di dalam request; tabel di `/impor` menyegarkan diri tiap 3 detik selama ada batch berjalan. Di test (`VITEST`) worker dijalankan langsung.
- OB-02: seluruh penulisan satu batch (users, akun, profil, membership, laporan error, status `done`) dalam SATU transaksi `tenantDb` (opsi `timeout` 120 dtk); gagal di tengah = rollback total, tidak ada akun yatim. Hash sandi guru dihitung sebelum transaksi.
- OB-02: `assertSafeXlsx` (excel.ts) menolak zip bomb dengan menjumlahkan ukuran terdekompresi di central directory (batas 50 MB, maks 2.000 entri) sebelum exceljs membuka berkas. Email kembar di dalam berkas ditolak per baris.
- OB-02: berkas sumber dihapus dari storage setelah diproses (data pribadi siswa, UU PDP); laporan error disimpan per baris di `import_errors` sehingga bisa diunduh ulang kapan saja.
- OB-02: Route unduhan memakai helper sendiri `requireSchoolAdminForDownload()` karena `schoolAdminMiddleware` hanya untuk server function.

## Utang / belum ada
- Email pemberitahuan trial segera berakhir; penyedia email nyata (hanya driver `console`/`memory`)
- UI daftar/ubah/hapus data guru & siswa (OB-02 baru mengimpor; belum ada layar daftar, pencarian, atau ubah data)
- Pemilih semester di `/penugasan` (OB-03) — belum ada kelas pembelajaran untuk semester lampau
- Kuota jumlah siswa per paket belum dicek saat impor (ikut dikerjakan di BL-01/F7)
- Halaman masih: kolom Excel berisi rumus (`=...`) dibaca apa adanya sebagai teks, bukan hasil hitungan
- UI tambah/cabut Super Admin; log audit (US-04)
- Setiap server function sekolah baru **wajib** mengecek status sekolah (suspended), selain permission

## Jebakan
- Setelah `prisma migrate`/`generate`, matikan server dev lama di port 3000 sebelum menjalankan E2E.
- `pnpm generate-routes` menghapus blok `declare module '@tanstack/react-start'` (interface `Register`) di akhir `src/routeTree.gen.ts`. Blok itu wajib dikembalikan setiap kali regenerate, kalau tidak tipe `context` server function (`context.tenant`) jadi `undefined` dan `pnpm typecheck` gagal di beberapa file yang tidak disentuh.
- `prisma migrate reset` tidak menjalankan seed di environment ini; setelah reset harus `pnpm db:seed`, kalau tidak test registrasi/tenant gagal (paket "trial" hilang).
- `exceljs` hanya CommonJS dengan `module.exports = require(...)` sehingga impor named (`import { Workbook }`) gagal saat SSR Vite. Di `src/features/people-import/excel.ts` dan `tests/e2e/import.spec.ts` dipakai `createRequire(import.meta.url)("exceljs")`. `ssr.noExternal` justru lebih buruk ("module is not defined"). Paket ini tetap di-*runtime require*, jadi harus ikut terpasang saat deploy.
- exceljs mendeklarasikan tipe `Buffer` sendiri berbasis `ArrayBuffer`; konversi masuk/keluar pustaka ini lewat `asExcelJsBuffer`/`fromExcelJsBuffer` di `excel.ts` supaya tidak ada `as any` yang menyebar.
- `page.waitForEvent("download")` harus dipanggil **tanpa await** sebelum aksi klik.
- Nilai unduhan Playwright disimpan di folder sementara tanpa ekstensi; assertion pakai `download.suggestedFilename()`, bukan `download.path()`.
- Aksi di form klien harus menunggu hydrate; di E2E pakai `expect(...).toPass()`.
- Skema Zod dipakai klien lalu server, jadi harus idempoten (parse dua kali).
- Migrasi baru harus bertimestamp setelah migrasi terakhir di `prisma/migrations/`. `prisma migrate dev` memakai jam sistem untuk nama folder, jadi cek dan rename bila perlu (jangan ubah migrasi yang sudah diterapkan).
- `prisma migrate dev --create-only` + `Rename-Item` dipakai untuk OB-03 supaya SQL parsial (indeks unik parsial + policy RLS) bisa ditulis manual setelah Prisma membuat migration-nya; setelah itu `pnpm prisma migrate deploy`.
- Query paralel (`Promise.all`) di dalam callback `tenantDb` memicu peringatan deprecation dari adapter `pg` ("client.query() when the client is already executing a query"). Prisma menjalankan query transaksi satu per satu, jadi tulis berurutan (lihat `getAssignmentBoard`).
- `include` beberapa relasi sekaligus (mis. classroom+subject+teacher.user) di dalam `tenantDb` juga memicu peringatan itu; kalau tidak perlu, ambil id saja lalu susun nama di lapisan pemanggil.
- E2E mematikan devtools lewat `VITE_E2E` (tombolnya menutupi tombol kanan-bawah di layar 360px). Server dev yang dijalankan manual dipakai ulang oleh Playwright dan menampilkan devtools, jadi matikan dulu.
- Assertion E2E "bukan /login" terlalu lemah; pakai URL tujuan yang positif.
- Fixture E2E yang membuat sekolah langsung harus mengisi `setupCompletedAt`, kalau tidak login diarahkan ke `/setup`. `prisma/seed.ts` juga sudah mengisi kolom itu untuk sekolah demo.
- Form dan aksi klien dinonaktifkan sampai hydrate (`useHydrated` di `src/components/dashboard/form-field.tsx`), supaya submit tidak menjadi GET native.
- Test integrasi memakai `DATABASE_URL` (superuser) untuk fixture dan `DATABASE_APP_URL` (role `edusaas_app`, kena RLS) lewat service; jangan membalik keduanya.
- Console piping devtools dimatikan di `vite.config.ts` (memantulkan log hydration dari ekstensi browser).
- Log `Error: aborted ... ECONNRESET` di server dev muncul saat browser menutup koneksi; tidak berbahaya.
- Windows/CRLF: edit file lewat tool Edit; skrip Python harus membuka file dengan `newline=''`. Perintah bash yang sangat panjang bisa gagal di-parse, tulis file lewat tool Write.
