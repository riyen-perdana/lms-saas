# Progres Pengerjaan EduSaaS

Terakhir diperbarui: 2026-10-15
Pemeriksaan: typecheck hijau; lint 0 error (2 warning lama `no-shadow` di `src/components/ui/sidebar.tsx` masih dilaporkan, belum diperbaiki); 335 test unit hijau (36 berkas); E2E (Playwright): 103 lulus, 1 skipped, 0 gagal (104 tes, desktop + mobile-360). `pnpm build` tidak dijalankan pada pemeriksaan ini.

## Status per fase (PRD §10)

| Fase | Status |
| --- | --- |
| F0 Fondasi | **Selesai** — tenant, RLS, Better Auth, login per subdomain, CI |
| F1 Landing & registrasi | **Selesai** (utang di bawah) |
| F2 Onboarding & pengguna | **Selesai** — OB-01 s.d. OB-05, US-01 s.d. US-04 |
| Pekerjaan UI sekolah | **Tahap 1 selesai** (shell sidebar + breadcrumb + menu akun). Berikutnya Tahap 2 (DataTable daftar-detail) dan Tahap 3 (penataan halaman + KPI beranda) |

### Sudah jadi di F0–F1
- Resolusi subdomain, `tenantDb` + RLS, test isolasi antar sekolah
- Login email + password dengan cookie host-only per subdomain; `/beranda` sekolah (placeholder)
- LP-01 landing, LP-04 pendaftaran sekolah (cek subdomain real-time, trial 30 hari)
- Dashboard Super Admin (`app.localhost:3000/platform`): ringkasan, daftar sekolah, aktivasi paket manual, penangguhan
- Sekolah `suspended` ditolak di login dan pada sesi yang sudah ada
- Job kedaluwarsa langganan tiap 30 menit

### Sisa F1 (urutan disarankan)
1. ~~Perlindungan `/daftar`~~ selesai: rate limit berbasis DB (`src/lib/rate-limit.ts`, 5 daftar/IP/jam; env `REGISTER_RATE_LIMIT` untuk dev/E2E). Captcha belum; di produksi pastikan proxy mengisi `x-forwarded-for`
2. ~~LP-03~~ selesai: `/harga` + beranda membaca `plans` (Standar, Pro, kartu Enterprise statis). Harga seed masih sementara (final di F7)
3. ~~LP-05~~ selesai: `/kontak` (simpan ke `contact_requests`, notifikasi ke env `CONTACT_EMAIL`), `/privasi`, `/syarat` (draf, perlu tinjauan hukum). Belum ada UI baca pesan kontak di Super Admin
4. ~~LP-06~~ selesai: `seoMeta`, `/sitemap.xml`, `/robots.txt` (sekolah/platform tidak diindeks), noindex di login. Lighthouse ≥ 90 belum diukur; og:image/canonical belum ada
5. ~~LP-02~~ selesai: `/fitur` (Kelas, Ujian CBT, Laporan orang tua) dari `src/features/marketing/features.ts`; semua poin berlabel "Segera hadir", cabut `soon: true` per poin saat fitur rilis

### F2 (selesai)
- Adapter storage `src/lib/storage` (driver `local` ke `.storage/`, `memory` untuk test; env `STORAGE_DRIVER`/`STORAGE_DIR`). Kunci file `schools/<school_id>/...`. Driver S3/R2 ditambahkan nanti tanpa mengubah pemanggil
- OB-01 selesai: tabel `academic_years`, `semesters`, `majors`, `classrooms`, `subjects` (RLS, satu tahun/semester aktif per sekolah), service di `src/features/academic`, wizard `/setup` (profil+logo, tahun ajaran, jurusan khusus SMK, rombel, mapel) dan `GET /api/logo`. Admin sekolah yang `setup_completed_at`-nya kosong diarahkan ke `/setup`
- OB-02 selesai: impor guru & siswa dari `.xlsx` (template diunduh dari `/impor`), tabel `teachers`, `students`, `enrollments`, `import_batches`, `import_errors` (RLS + index parsial unik kode guru/NIS), service + worker pg-boss di `src/features/people-import`, halaman `/impor`, route unduhan `/api/impor-template` dan `/api/laporan-impor/$batchId`
- OB-03 selesai: tabel `courses` (kelas pembelajaran = rombel x mapel x guru x semester) + kolom `classrooms.homeroom_teacher_id` (RLS, indeks parsial unik), service + server function di `src/features/teaching-assignment`, halaman `/penugasan` (tabel kelas pembelajaran semester aktif, filter per rombel, form tambah, daftar wali kelas per rombel)
- OB-04 selesai: kenaikan kelas / pergantian semester di `src/features/year-rollover` (tanpa migrasi baru), halaman `/tahun-ajaran` (daftar semester + aktifkan, tambah tahun ajaran berikutnya, panel kenaikan: sumber -> tujuan -> pratinjau -> jalankan)
- OB-05 selesai: tabel `parent_links` (RLS, indeks unik parsial), modul `src/features/parent-link`, halaman admin `/orang-tua` (kode per siswa + massal per rombel -> CSV, cabut) dan halaman publik `/gabung` (orang tua mendaftar/menautkan lewat kode); beranda orang tua menampilkan anak tertaut
- US-04 selesai: tabel `audit_logs` (RLS, hak UPDATE/DELETE dicabut dari `edusaas_app`), modul `src/features/audit` (`recordAudit`, `listAuditLogs`), halaman admin `/audit` (filter aksi, paginasi kursor). Dicatat: aktivasi paket, tangguhkan/aktifkan sekolah, mulai impor, kenaikan kelas, cabut tautan orang tua, hapus kelas pembelajaran, cabut wali kelas
- US-03 selesai: keputusan izin satu pintu di `features/auth/authorize.ts` (`authorizeSchoolRequest`, murni + teruji lewat matriks peran x status sekolah x sekolah lain); helper server `server/authorize-request.ts`; middleware `schoolAdminMiddleware` dan `schoolParentMiddleware`; route API unduhan memakai `requireSchoolRoleForRequest`. `permission-audit.test.ts` memindai kode: setiap `createServerFn` WAJIB memakai salah satu middleware penjaga atau terdaftar di `PUBLIC_SERVER_FNS` (dengan alasan); setiap route `api/*` WAJIB memakai `requireSchoolRoleForRequest` atau terdaftar di `PUBLIC_API_ROUTES`. `/api/tenant` kini 404 di produksi
- US-02 selesai: swalayan (`/lupa-sandi`, `/atur-ulang-sandi`, verifikasi email lewat adapter email + antrean pg-boss) + halaman admin `/pengguna` (menu "Pengguna" di grup Data) dan modul `src/features/user-management` (`listPeople`, `requestTeacherPasswordReset`; server function `listPeopleFn`, `requestTeacherResetFn`). Admin mencari/menyaring guru & siswa lalu mereset sandi guru: tautan atur sandi dikirim ke email guru (sandi tidak pernah terlihat admin). Aksi audit baru `user.password_reset` (tanpa data sensitif). Konfirmasi inline ("Ya, kirim"), bukan dialog. Daftar dibatasi 100 baris. Tombol PIN untuk siswa ditambahkan oleh US-01. Isolasi antar sekolah dan NOT_FOUND seragam teruji; E2E `tests/e2e/user-management.spec.ts`
- US-01 selesai: login siswa lewat NIS + PIN. Tabel `student_pins` (RLS, hash PIN), modul `src/features/student-pin` (`service.ts`, `login.ts`, `csv.ts`, `server/`), plugin Better Auth `src/lib/auth-student-pin.ts` (endpoint `/api/auth/sign-in/student-pin`), tab "Siswa (NIS + PIN)" di `/login`, aksi buat/reset PIN per siswa dan PIN massal per rombel (unduh CSV) di `/pengguna`, aksi audit `student.pin_issue` dan `student.pin_issue_bulk` (tanpa PIN), `releaseRateLimit` (baru) di `src/lib/rate-limit.ts`. E2E `tests/e2e/student-pin.spec.ts`
- Server function sekolah memakai `schoolAdminMiddleware` (login, peran school_admin, tolak suspended/readonly)
- Belum: ubah/hapus data guru & siswa di UI (daftar baca-saja sudah ada di `/pengguna`)
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
- OB-04: kenaikan = membuat rombel di semester tujuan + enrollment baru; rombel/enrollment lama tidak disentuh (itu arsipnya). Mode `same` (tingkat tetap, Ganjil->Genap) dan `promote` (tingkat+1; tingkat tertinggi jenjang = lulus, tanpa enrollment baru; belum ada status lulus di profil siswa)
- OB-04: wali kelas dan kelas pembelajaran SENGAJA tidak disalin (mapel/guru beda per tingkat); admin menetapkan ulang di `/penugasan`. Semester tujuan harus kosong dan setelah sumber; dijalankan dua kali ditolak (advisory lock transaksi mencegah dua admin bersamaan). Semester tujuan tidak otomatis aktif
- OB-04: usulan nama rombel hanya mengganti angka/romawi tingkat di awal nama ("X-1"->"XI-1"); selain itu nama dibiarkan dan disunting admin di pratinjau
- OB-05: kode 8 karakter (alfabet tanpa 0/O/1/I), hanya hash SHA-256 (`schoolId:kode`) yang disimpan, jadi kode hanya terlihat sekali saat dibuat; berlaku 14 hari, sekali pakai, maks 5 baris aktif per siswa. Kode salah/kedaluwarsa/terpakai/dicabut/milik sekolah lain memberi pesan SAMA. Penukaran atomik (update bersyarat) dan satu transaksi untuk akun + membership + tautan
- OB-05: pendaftaran orang tua tidak otomatis login (diarahkan ke /login); email orang tua belum diverifikasi (sama seperti keputusan verifikasi email lain). Email yang sudah terdaftar diminta login dulu; akun berperan lain di sekolah yang sama (mis. guru) ditolak. Batas laju penukaran: per IP (`PARENT_JOIN_RATE_LIMIT`, default 10/15 menit) + per sekolah 300/jam; `clientAddress` memercayai `x-forwarded-for`, jadi di produksi aplikasi harus di belakang proxy tepercaya
- OB-05: portal nilai orang tua tetap F5; saat ini orang tua hanya melihat nama anak + rombel di /beranda. Beranda kini menampilkan menu admin hanya untuk `school_admin`
- US-04: `recordAudit(db, schoolId, actor, entry)` dipanggil DI DALAM transaksi aksinya (aksi gagal = log batal). `actor` (`{userId, role}`) wajib dan menjadi parameter kedua service yang mencatat; datang dari `context.actor` di `schoolAdminMiddleware` / `platformAdminMiddleware`. Aksi Super Admin tercatat ke log sekolah yang dituju (RLS mengizinkan `app.is_platform`) dan tampil di `/audit` sekolah. `before`/`after` hanya field relevan, tanpa sandi/hash/kode. Aksi baru: tambah ke `AUDIT_ACTIONS` (`audit/schema.ts`). WAJIB: modul nilai (perubahan nilai) dan impersonate memanggil `recordAudit` saat dibuat
- US-03: peran baru (mis. guru) = tambah middleware top-level baru seperti `school-parent.ts` (panggil `authorizeHeaders` dengan daftar peran) lalu daftarkan namanya di `SERVER_FN_GUARDS` pada `permission-audit.test.ts`. Izin per sumber daya (guru hanya kelasnya sendiri) dikerjakan bersama modul LMS terkait. Suspended = 403 untuk semua fungsi sekolah (sebelumnya orang tua mendapat 404)
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
- US-02: `schoolHost` kini di `src/lib/tenant/host.ts` (sebelumnya di modul lain) supaya dipakai bersama oleh impor dan reset sandi
- US-02: siswa tidak menampilkan email di daftar `/pengguna` (email palsu `<nis>@<slug>.invalid`); tampil "—"
- US-02: email reset tidak di-await di dalam transaksi, jadi audit `user.password_reset` tercatat walau pengiriman email gagal diam-diam (admin hanya tahu "permintaan diterima")
- US-02: daftar dibatasi 100 baris; saat terpotong, urutan dari DB dan urutan `localeCompare` bisa berbeda sehingga baris yang terpotong tidak selalu yang terakhir menurut tampilan; admin diminta mempersempit pencarian
- US-01: PIN 6 digit 100000-999999 (tanpa nol di depan agar CSV/Excel aman). PIN massal MELEWATI siswa yang sudah punya PIN; reset per siswa mengganti PIN dan mencabut sesi siswa. Siswa tidak punya akun credential. PIN tidak bisa diubah siswa sendiri dan tidak muncul di laporan impor atau log audit. Pesan gagal login seragam ("NIS atau PIN salah.") dan memakai hash palsu untuk NIS tak dikenal
- US-01 batas laju: pola reserve-then-refund. `consumeRateLimit` dipanggil SEBELUM verifikasi PIN (jatah dipesan atomik), lalu `releaseRateLimit` mengembalikan jatah pada login sukses atau galat tak terduga, sehingga hanya kegagalan yang tersisa terhitung. Batas: 5 per NIS+IP/15 menit, 60 per IP/15 menit, 20 per NIS/jam
- US-01 produksi: IP klien berasal dari `x-forwarded-for` (host dari `x-forwarded-host`), jadi aplikasi WAJIB berada di belakang proxy tepercaya yang menimpa kedua header itu; kalau tidak, bucket per-IP bisa dihindari (bucket per-NIS tetap berlaku). Baris `rate_limits` bisa membengkak oleh nilai IP/NIS palsu dan bergantung pada job pembersihan (purge)
- US-01 trade-off ketersediaan: bucket per-IP (60 kegagalan/15 menit) bisa mengunci login PIN seluruh sekolah di balik satu NAT selama 15 menit bila cukup banyak PIN salah dimasukkan; bucket per-NIS (20/jam) memungkinkan orang lain mengunci login PIN siswa tertentu selama satu jam. Admin belum punya UI untuk membersihkannya (kedaluwarsa sendiri).
- US-01 PIN massal tanpa kunci baris: dua PIN massal bersamaan untuk rombel yang sama (atau PIN massal + reset satu siswa) bisa sama-sama mengembalikan PIN untuk satu siswa; tulisan terakhir menang, sehingga satu CSV unduhan bisa berisi PIN usang. Pemulihan: reset PIN siswa itu.
- US-01 pembatas bawaan Better Auth: path `/sign-in*` dibatasi 3 permintaan/10 detik per IP+path (aktif di produksi; tanpa proxy tepercaya semua klien berbagi bucket `no-trusted-ip`, per proses/memori). `/sign-in/student-pin` dikecualikan lewat `rateLimit.customRules` di `src/lib/auth.ts` (nilai `false`; dibatasi pembatas DB di `login.ts`). Login email TETAP kena batas 3/10 detik itu; di produksi di belakang proxy atur `advanced.ipAddress` (`trustedProxies` / `ipAddressHeaders`) agar tidak terbagi satu bucket.
- Shell sekolah: layout pathless `src/routes/(school)/_app.tsx` memegang penjaga akses + `SchoolShell`; route admin hanya cek `context.role`. `/setup` dan `/gabung` di luar shell. Menu per peran didefinisikan di `school-nav.ts` (menu modul baru ditambahkan di sana). Halaman admin selain beranda kini juga mengarahkan admin yang belum setup ke `/setup`. Halaman-halaman admin masih memakai `max-w-3xl` tanpa `mx-auto` (rata kiri di dalam shell) sampai dirapikan di Tahap 2/3.

## Utang / belum ada
- Email pemberitahuan trial segera berakhir; penyedia email nyata (hanya driver `console`/`memory`)
- UI ubah/hapus data guru & siswa: daftar baca-saja + pencarian sudah ada di `/pengguna` (US-02); ubah/hapus, paginasi, dan DataTable belum
- US-01: siswa mengubah PIN sendiri; UI login khusus SD (ramah anak); masa berlaku PIN
- US-01 minor tertunda: galat jaringan saat fetch login siswa tidak menampilkan pesan (sama seperti jalur email); nama berkas CSV (`pin-<rombel>.csv`) belum disanitasi; ARIA tab login minimal (tanpa `tabpanel`/navigasi panah)
- Lint: 2 warning `no-shadow` lama di `src/components/ui/sidebar.tsx` masih dilaporkan oleh `pnpm lint` (butir terbuka, bukan diterima)
- Daftar siswa umum di UI admin (OB-05 hanya menampilkan siswa per rombel); kode undangan lama tidak bisa ditampilkan ulang (buat baru)
- US-04: tampilan log lintas sekolah untuk Super Admin, ekspor, dan masa simpan/pembersihan log belum ada; `/audit` memakai `schoolAdminMiddleware` sehingga tidak terbuka untuk sekolah mode hanya-baca
- Tinggal kelas / pindah rombel per siswa (butuh UI daftar siswa); status lulus pada profil siswa (OB-04)
- Pemilih semester di `/penugasan` (OB-03) — belum ada kelas pembelajaran untuk semester lampau
- Kuota jumlah siswa per paket belum dicek saat impor (ikut dikerjakan di BL-01/F7)
- Halaman masih: kolom Excel berisi rumus (`=...`) dibaca apa adanya sebagai teks, bukan hasil hitungan
- UI tambah/cabut Super Admin; log audit (US-04)
- Setiap server function sekolah baru **wajib** mengecek status sekolah (suspended), selain permission

## Jebakan

- Middleware TanStack Start HARUS dideklarasikan top-level (`export const x = createMiddleware().server(...)`). Pabrik fungsi yang membuat middleware di dalamnya (`requireSchoolRole(...)`) membuat kode server (Prisma, `node:url`) bocor ke bundel klien: tombol login tetap disabled karena hydrate gagal, semua E2E gagal. Taruh logika di helper server-only (`authorize-request.ts`) dan buat middleware per peran
- Flake lama: `platform/service.test.ts > getOverview` sesekali gagal saat seluruh suite berjalan paralel (menghitung trial lintas semua sekolah dengan `take: 10`, terpengaruh test file lain); lulus saat diulang
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
- Tombol Keluar kini ada di menu akun sidebar (di mobile sidebar harus dibuka dulu); E2E memakai `getByRole("button", { name: /Admin sekolah/ })` lalu `menuitem "Keluar"`.
- Shell menambah daftar/tombol/tautan di semua halaman sekolah: `getByRole("listitem")` atau `getByRole("button", { name: "Impor" })` tanpa cakupan kini bisa cocok dengan item sidebar/breadcrumb/menu akun. Batasi ke `main ul` / `main`, atau pakai nama persis (`exact: true`).
- Windows/CRLF: edit file lewat tool Edit; skrip Python harus membuka file dengan `newline=''`. Perintah bash yang sangat panjang bisa gagal di-parse, tulis file lewat tool Write.
- E2E tab login siswa: klik tab sebelum hydrate tidak berefek; bungkus klik tab + `expect(NIS).toBeVisible()` dengan `toPass()`. Hal sama untuk `selectOption` pada rombel di `/pengguna` (select terkontrol akan kembali kosong bila dipilih sebelum hydrate)
- Kegagalan login E2E dihitung pada bucket laju per-IP yang sama (semua trafik Playwright satu IP); batasi tebakan PIN salah seminimal mungkin (paling banyak dua per tes)
