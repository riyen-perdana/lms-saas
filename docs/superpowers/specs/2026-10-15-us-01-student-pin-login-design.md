# US-01 — Login siswa dengan NIS + PIN

Tanggal: 2026-10-15
Kode kebutuhan: US-01 (PRD §6: "Login email + password; siswa SD bisa login dengan NIS + PIN")

## Latar belakang

Login email + sandi sudah ada. Siswa hasil impor (OB-02) tidak punya akun sandi: `users.email` mereka palsu (`<nis>@<slug>.invalid`) dan identitas sekolahnya adalah NIS. Reset sandi guru oleh admin sudah selesai (US-02). Yang belum ada: cara siswa masuk, dan cara admin membuat atau mereset PIN siswa.

## Keputusan

- **Siapa:** semua siswa, semua jenjang, memakai NIS + PIN di tab "Siswa" pada halaman login yang sama. (PRD catatan SD menyebut "kode kelas + PIN"; tidak dipakai karena rombel tidak punya kode dan NIS sudah unik per sekolah.)
- **Pembuatan PIN:** admin membuat PIN per siswa atau massal per rombel. PIN 6 digit acak, tampil sekali, hanya hash disimpan. Reset PIN memakai jalur yang sama dan menggantikan PIN lama.
- **Keamanan:** batas laju berlapis yang hanya menghitung kegagalan, tanpa mengunci akun siswa.
- **Mekanisme sesi:** plugin Better Auth dengan endpoint sendiri. PIN disimpan di tabel terpisah, bukan sebagai sandi akun credential, sehingga `sign-in/email` tidak bisa dipakai menebak PIN.

Di luar cakupan: siswa mengubah PIN sendiri, PIN di laporan impor, antarmuka khusus SD.

## Data

Satu migrasi baru (jangan ubah migrasi yang ada). Tabel tenant `student_pins`:
`id` (uuid v7), `schoolId`, `studentId` (unik), `pinHash`, `createdAt`, `updatedAt`. Indeks diawali `schoolId`. Policy RLS di SQL migrasi. Relasi ke `Student`.

PIN: 6 digit dari `crypto.randomInt` (rentang 100000-999999, tanpa nol di depan supaya CSV/spreadsheet tidak membuang angka nol), di-hash dengan `hashPassword` dari `better-auth/crypto` (scrypt, sama seperti sandi guru di OB-02). Teks PIN tidak pernah disimpan atau dicatat di log atau audit.

## Login (plugin Better Auth `student-pin`)

`src/lib/auth-student-pin.ts`, didaftarkan di `src/lib/auth.ts` sebelum `tanstackStartCookies()` (yang wajib terakhir).

Endpoint `POST /api/auth/sign-in/student-pin`, body `{ nis, pin }` (Zod):

1. Tentukan sekolah dari host (`parseHost` + lookup slug). Bukan host sekolah atau sekolah tidak ada: jawab galat generik.
2. Cek batas laju (lihat di bawah) **sebelum** verifikasi. Bila sudah penuh: tolak, bahkan untuk PIN yang benar.
3. Cari siswa aktif (`deletedAt` kosong) dengan membership `student` berstatus aktif di sekolah itu, lewat `tenantDb(schoolId)`.
4. Verifikasi PIN dengan `verifyPassword`. Bila NIS tidak ada atau belum punya PIN, tetap jalankan satu verifikasi terhadap hash palsu tetap supaya waktu respons tidak membedakan.
5. Berhasil: buat sesi lewat mekanisme Better Auth (`internalAdapter.createSession`, `setSessionCookie`). Sesi tetap host-only per subdomain seperti login lain.
6. Gagal apa pun menjawab sama: **"NIS atau PIN salah."** Terkunci menjawab pesan batas laju yang ada.

Sekolah `suspended`/`readonly` ditangani oleh `getAccess` setelah login, sama seperti login email.

### Batas laju (hanya kegagalan)

Menambah satu fungsi `assertRateLimit(rule, subject)` di `src/lib/rate-limit.ts`: membaca penghitung tanpa menambah, melempar `RateLimitError` bila `count >= limit` dan jendela belum lewat. Kegagalan dicatat dengan `consumeRateLimit` yang sudah ada.

| Bucket | Kunci | Batas | Jendela |
| --- | --- | --- | --- |
| `student-pin` | sekolah + NIS + IP | 5 kegagalan | 15 menit |
| `student-pin-ip` | IP | 60 kegagalan | 15 menit |
| `student-pin-nis` | sekolah + NIS | 20 kegagalan | 1 jam |

Login berhasil tidak menambah hitungan, jadi satu kelas yang login bersamaan lewat IP sekolah tidak saling memblokir.

## Admin (modul `src/features/student-pin`)

- `schema.ts`: `studentIdSchema`, `classroomIdSchema`, skema login `{ nis, pin }` (pin = tepat 6 digit).
- `service.ts`:
  - `issueStudentPin(schoolId, actor, studentId)`: dalam satu transaksi `tenantDb`, upsert hash, hapus semua sesi pengguna siswa itu, `recordAudit` aksi `student.pin_issue` (entity `student`, id, NIS; **tanpa PIN**), lalu kembalikan PIN sekali. Siswa sekolah lain atau tidak ada: `NOT_FOUND`.
  - `issuePinsForClassroom(schoolId, actor, classroomId)`: untuk siswa terdaftar di rombel yang BELUM punya PIN (yang sudah punya dilewati dan dihitung sebagai `skipped`, seperti kode undangan OB-05, agar klik massal tidak mengeluarkan satu kelas dari sesinya; PIN siswa yang sudah punya diganti per siswa lewat reset). UI hanya menawarkan rombel semester aktif; satu audit `student.pin_issue_bulk` (id rombel, jumlah). Mengembalikan baris NIS, nama, PIN.
  - Fungsi verifikasi untuk plugin: `verifyStudentPin(schoolId, nis, pin)` mengembalikan `userId` atau null.
- `server/student-pin.ts`: server function dengan `schoolAdminMiddleware`; hasil CSV memakai pola `parent-link/csv.ts`.
- Tambah dua aksi ke `AUDIT_ACTIONS`.

## UI

- `/login`: di subdomain sekolah ada tab "Email" dan "Siswa (NIS + PIN)". NIS dengan `font-mono`, PIN `type=password`, `inputMode="numeric"`, `maxLength=6`. Panggilan lewat `fetch` ke endpoint plugin (cookie diset oleh respons), lalu alur `getAccess` yang sama dengan login email. Tab dinonaktifkan sampai hydrate. Teks Indonesia.
- `/pengguna`: baris siswa mendapat tombol "Buat PIN" atau "Reset PIN" dengan konfirmasi inline; PIN tampil sekali (`data-testid="new-pin"`) dengan peringatan "Catat sekarang, PIN tidak bisa dilihat lagi". Bagian "PIN massal per rombel": pilih rombel, buat PIN, unduh CSV. Catatan "Reset PIN tersedia setelah login NIS+PIN" yang lama dihapus.

## Pengujian (TDD)

- Service (integrasi, `DATABASE_APP_URL`): PIN dibuat dan diverifikasi; hash tersimpan, bukan teks; reset mengganti PIN dan mencabut sesi; isolasi (admin sekolah A tidak bisa membuat PIN siswa sekolah B; NIS sama di dua sekolah tidak tertukar); audit tanpa PIN; massal hanya rombel itu.
- Login/batas laju: PIN salah, NIS tidak ada, dan siswa dihapus/nonaktif memberi pesan sama; setelah 5 kegagalan NIS+IP, PIN benar pun ditolak; login berhasil tidak menambah hitungan; siswa lain dari IP yang sama tetap bisa masuk; `assertRateLimit` murni tidak menambah hitungan.
- `permission-audit.test.ts` otomatis memindai server function baru.
- E2E: admin membuat PIN di `/pengguna`, siswa (browser terpisah) login lewat tab Siswa dan sampai di `/beranda`; PIN salah gagal dengan pesan generik; reset membuat PIN lama tidak berlaku dan menendang sesi siswa.
- Selesai bila `pnpm typecheck`, `pnpm lint`, `pnpm test`, dan `pnpm test:e2e` hijau tanpa pengecualian (AGENTS.md aturan 8 dan 11); PROGRESS.md diperbarui.
