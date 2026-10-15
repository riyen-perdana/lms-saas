# Shell layout sekolah (Tahap 1 dari 3)

Tanggal: 2026-10-15. Status: menunggu review.

## Latar belakang

Halaman sekolah (`<slug>.localhost:3000`) masih berupa halaman terpisah tanpa
kerangka bersama: tiap route mengulang pengecekan akses dan membuat `<main>`
sendiri, dan `/beranda` berisi tautan teks. Dashboard Super Admin sudah
memakai kerangka gaya template SKPI (sidebar bergrup + topbar breadcrumb,
`src/routes/(platform)/platform.tsx`). Pekerjaan ini membawa kerangka yang
sama ke area sekolah.

Pekerjaan UI ini dipecah menjadi tiga tahap. Dokumen ini hanya Tahap 1.

| Tahap | Isi |
| --- | --- |
| 1 (dokumen ini) | Shell sekolah: sidebar, topbar, footer akun, penjaga akses terpusat |
| 2 | Komponen daftar-detail (`DataTable`: cari/filter, kepadatan, panel detail, paginasi), diterapkan ke `/audit` dan `/orang-tua` |
| 3 | Penataan `/impor`, `/penugasan`, `/tahun-ajaran`, `/beranda` (KPI + perlu tindakan), kartu `/setup` |

## Keputusan

- Kerangka mengikuti screenshot SKPI dan `platform.tsx`: sidebar kiri, topbar
  dengan toggle sidebar + breadcrumb, konten di `SidebarInset`.
- `/setup` dan `/gabung` tetap tanpa shell (layar penuh terpusat).
- Menu sidebar sesuai halaman yang sudah ada; menu modul F2+ ditambahkan saat
  modulnya dibuat.
- Tidak ada dependency baru. Komponen `sidebar`, `breadcrumb`,
  `dropdown-menu`, `separator`, `tooltip` sudah ada di `src/components/ui/`.

## Rancangan

### Struktur route

Layout pathless baru `src/routes/(school)/_app.tsx` (id
`/(school)/_app`). Route berikut dipindah menjadi anaknya dengan `git mv`;
URL tidak berubah:

| Sebelum | Sesudah |
| --- | --- |
| `(school)/beranda.tsx` | `(school)/_app.beranda.tsx` |
| `(school)/audit.tsx` | `(school)/_app.audit.tsx` |
| `(school)/impor.tsx` | `(school)/_app.impor.tsx` |
| `(school)/penugasan.tsx` | `(school)/_app.penugasan.tsx` |
| `(school)/tahun-ajaran.tsx` | `(school)/_app.tahun-ajaran.tsx` |
| `(school)/orang-tua.tsx` | `(school)/_app.orang-tua.tsx` |

`setup.tsx` dan `gabung.tsx` tidak dipindah. String di `createFileRoute(...)`
tiap route yang dipindah disesuaikan; `routeTree.gen.ts` dibangkitkan ulang
oleh plugin router.

### Penjaga akses (`beforeLoad` layout)

Urutan, sama dengan yang kini diulang di tiap route:

1. `area !== "school"` -> redirect `/`
2. `access.status !== "ok"` -> redirect `/login`
3. `access.setupPending` -> redirect `/setup`
4. Mengembalikan konteks `{ schoolName, user, role }`

Dampak perilaku: halaman admin selain `/beranda` kini juga mengarahkan admin
yang belum selesai setup ke `/setup`. Ini sesuai catatan PROGRESS.md (admin
tanpa `setup_completed_at` diarahkan ke `/setup`), hanya kini konsisten di
semua halaman.

Route anak yang khusus admin (`audit`, `impor`, `penugasan`, `tahun-ajaran`,
`orang-tua`) hanya menyisakan satu baris: jika `context.role !== "school_admin"`
-> redirect `/beranda`. Tidak ada panggilan `getAccess()` kedua. Penjaga
server function (middleware) tidak diubah, jadi aturan di
`permission-audit.test.ts` tetap berlaku; pengecekan di `beforeLoad` hanyalah
UX.

### Menu sidebar

Didefinisikan sebagai data murni di `src/components/dashboard/school-nav.ts`:

```ts
navForRole(role: string): NavGroup[]
```

| Grup | Item (URL) | Peran |
| --- | --- | --- |
| Utama | Beranda (`/beranda`) | semua |
| Akademik | Tahun Ajaran (`/tahun-ajaran`), Penugasan (`/penugasan`) | school_admin |
| Data | Impor Data (`/impor`), Orang Tua (`/orang-tua`) | school_admin |
| Sistem | Audit (`/audit`) | school_admin |

Grup tanpa item setelah disaring dibuang. Peran lain (guru, siswa, orang tua)
hanya mendapat grup Utama. Fungsi yang sama dipakai breadcrumb untuk mencari
`{ grup, judul }` dari pathname.

### Komponen shell

`src/components/dashboard/school-shell.tsx` (props: `schoolName`, `user`,
`role`, `children`), meniru `PlatformLayout`:

- **Header sidebar**: ikon + nama sekolah (truncate), subjudul "Platform
  pembelajaran".
- **Konten sidebar**: grup dan item dari `navForRole`; item aktif dari
  pathname (`startsWith`), tautan lewat `render={<Link ... />}`.
- **Footer**: avatar inisial, nama, label peran (Admin sekolah / Guru /
  Siswa / Orang tua), dropdown berisi "Keluar" (pakai `signOut` dari
  `@/lib/auth-client`, lalu ke `/login`).
- **Topbar**: `SidebarTrigger`, separator, breadcrumb `Grup > Halaman`
  (untuk Beranda hanya "Beranda"), seperti "Autentikasi > Pengguna" di
  screenshot.
- **Konten**: `<main className="flex flex-col gap-6 p-6"><Outlet /></main>`.

`initials()` yang kini duplikat di `platform.tsx` dipindah ke satu helper
bersama dan dipakai kedua layout (perubahan kecil, tanpa mengubah perilaku
platform).

Responsif: perilaku bawaan komponen sidebar (di layar kecil menjadi sheet).

### Perubahan isi halaman (seminimal mungkin)

- `/beranda`: tombol "Keluar" dan `<main max-w-3xl px-4 py-12>` dibuang
  karena sudah ada di shell; isi lain (placeholder, "Anak Anda", tautan admin)
  dibiarkan sampai Tahap 3.
- Halaman lain: jika membungkus diri dengan `<main>` atau `max-w-*`/padding
  sendiri, pembungkus itu dilepas supaya tidak bertumpuk dengan padding
  shell. Isi dan logikanya tidak diubah.

## Pengujian

- Unit (Vitest) `school-nav.test.ts`: `navForRole` untuk school_admin (semua
  grup), teacher/student/parent (hanya Utama), peran tak dikenal (hanya
  Utama), pencarian `{ grup, judul }` dari pathname, termasuk path anak.
- Aturan 4 (test isolasi antar sekolah) tidak berlaku: tidak ada service atau
  model baru.
- `permission-audit.test.ts` harus tetap hijau tanpa perubahan.
- E2E (Playwright), tambah/ubah: admin sekolah demo login -> sidebar tampil
  dengan 4 grup, klik "Audit" membuka `/audit` dengan breadcrumb
  "Sistem > Audit"; admin yang belum setup membuka `/audit` -> `/setup`;
  orang tua login -> sidebar hanya Beranda, `/audit` -> `/beranda`; "Keluar"
  -> `/login`. Test E2E yang sudah ada diperiksa terhadap perubahan selector
  (tombol Keluar pindah ke dropdown).
- Selesai = `pnpm typecheck`, `pnpm lint`, `pnpm test` hijau, E2E untuk alur di
  atas lulus, dan pengecekan visual manual di
  `sekolahdemo.localhost:3000`.

## Di luar cakupan Tahap 1

`DataTable` dan pola daftar-detail, KPI beranda, penataan ulang isi halaman
dan wizard, menu modul F2+, pencarian global.

## Risiko

- Halaman lama mungkin memakai `min-h-screen`, `max-w-*`, atau `<main>`
  sendiri yang bentrok dengan shell; diperiksa satu per satu saat
  implementasi.
- Mengganti id route `/(school)/x` menjadi `/(school)/_app/x` bisa merusak
  `Route.useLoaderData`/`useRouteContext` bila ada pemanggilan dengan id
  eksplisit; dicari dengan `grep` sebelum memindah.
- Memindah file di Windows dengan `git mv` menjaga riwayat; routeTree
  dibangkitkan ulang saat `pnpm dev`/build.

## Setelah selesai

Perbarui `docs/PROGRESS.md` (status, keputusan: shell sekolah, penjaga akses
terpusat, `/setup` tanpa shell). Memori proyek ikut diperbarui.
