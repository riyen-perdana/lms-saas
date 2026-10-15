# US-02 — Admin sekolah mereset sandi guru (halaman /pengguna)

Tanggal: 2026-10-15
Kode kebutuhan: US-02 (PRD §6: "admin sekolah bisa reset password siswa/guru")

## Latar belakang

Bagian swalayan US-02 sudah ada: halaman `lupa-sandi` dan `atur-ulang-sandi`, email reset, email verifikasi, dan antrean pg-boss. Yang belum ada adalah admin sekolah memicu reset untuk pengguna lain. Belum ada layar daftar guru/siswa, jadi US-02 membawa halaman `/pengguna` yang sederhana. Tahap 2 (DataTable) nanti membungkus tabelnya.

Siswa login lewat NIS + PIN (US-01) dan email mereka palsu (`<nis>@<slug>.invalid`). Reset PIN siswa karenanya dikerjakan di US-01, bukan di sini.

## Cakupan

Termasuk:
- Halaman admin `/pengguna`: tabel guru dan siswa (nama, kode guru atau NIS, email), pencarian, filter peran. Baca saja.
- Guru: tombol "Reset sandi" dengan dialog konfirmasi. Sistem mengirim email tautan "atur sandi" lewat `auth.api.requestPasswordReset` (alur sama dengan impor OB-02). Admin tidak pernah melihat sandi.
- Siswa: tombol dinonaktifkan dengan keterangan bahwa reset tersedia setelah login NIS+PIN (US-01).
- Log audit aksi `user.password_reset`.

Tidak termasuk: ubah/hapus data guru/siswa, DataTable (Tahap 2), reset PIN siswa (US-01).

## Struktur

Modul baru `src/features/user-management`, tanpa migrasi:

- `service.ts`
  - `listPeople(db, { role, q })`: membaca lewat `tenantDb`, relasi `teachers`/`students` ke `users`, tanpa baris `deletedAt`, maksimal 100 baris. UI menampilkan petunjuk "persempit pencarian" bila terpotong.
  - `requestTeacherPasswordReset(schoolId, actor, teacherId)`: memeriksa guru milik sekolah itu; guru sekolah lain atau tidak ada menghasilkan `NOT_FOUND` yang sama (tidak membocorkan keberadaan lintas sekolah).
- `schema.ts`: skema Zod (idempoten).
- `server/people.ts`: server function dengan `schoolAdminMiddleware`.
- `components/`: tabel dan dialog konfirmasi.
- Rute `src/routes/(school)/_app.pengguna.tsx` dan satu entri menu di `school-nav.ts` (grup yang sama dengan Impor).
- Audit: tambah `user.password_reset` ("Permintaan reset sandi pengguna") ke `AUDIT_ACTIONS`. Entri memuat id guru dan kode guru; tanpa email, tautan, atau token.

## Alur data dan galat

1. Validasi Zod.
2. `schoolAdminMiddleware` (peran school_admin; tolak sekolah suspended/readonly).
3. Service memeriksa guru dan mencatat audit di dalam transaksi `tenantDb` (`recordAudit` dengan `actor`).
4. Setelah commit: `auth.api.requestPasswordReset` dengan `redirectTo` ke `/atur-ulang-sandi` pada host sekolah.
5. Bila pengiriman gagal, UI menampilkan "Email gagal dikirim, coba lagi". Log audit tetap ada (mencatat permintaan).

Teks UI berbahasa Indonesia.

## Pengujian

- Service (integrasi, `DATABASE_APP_URL`): daftar hanya berisi orang di sekolah itu; guru sekolah lain menghasilkan `NOT_FOUND` dan tidak ada email; audit tercatat; email masuk outbox dengan tautan ke host sekolah yang benar.
- `permission-audit.test.ts` otomatis memindai server function baru.
- E2E: admin membuka `/pengguna`, mencari guru, reset + konfirmasi, notifikasi sukses; baris siswa tidak punya tombol aktif.
- Selesai bila typecheck, lint, test, dan E2E hijau; PROGRESS.md diperbarui.
