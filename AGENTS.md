# EduSaaS — LMS multi-tenant untuk sekolah

Baca docs/PRD.md sebelum mengerjakan fitur. Rujuk kode kebutuhan (mis. CB-04).
Baca juga docs/PROGRESS.md: status pengerjaan, keputusan desain, utang, akun dev, dan jebakan yang sudah pernah kena. Perbarui file itu setelah menyelesaikan satu kode kebutuhan.

## Stack
TanStack Start + Router + Query, Prisma ORM, PostgreSQL, Better Auth,
Zod, Tailwind + shadcn/ui, pg-boss, Vitest, Playwright. Package manager: pnpm.
Development di localhost tanpa Docker (PostgreSQL terpasang lokal di Windows).
`exceljs` (OB-02) hanya dipakai di server dan harus dimuat lewat
`createRequire`, bukan impor named — lihat docs/PROGRESS.md "Jebakan".

Inisialisasi proyek (shadcn + TanStack Start):
npx shadcn@latest init --preset b1GKyb59c --template start

## Perintah
- pnpm dev | pnpm test | pnpm test:e2e | pnpm lint | pnpm typecheck
- pnpm prisma migrate dev --name <nama> untuk perubahan skema
- pnpm prisma generate setelah mengubah schema.prisma

## Subdomain lokal
- localhost:3000 = landing page
- app.localhost:3000 = Super Admin
- <slug>.localhost:3000 = LMS sekolah (contoh: man3pku.localhost:3000)

## Struktur
- prisma/schema.prisma, prisma/migrations/ (termasuk SQL policy RLS)
- src/routes/(marketing) | (platform) | (school)
- src/features/<modul>/{components,server,service.ts,schema.ts,*.test.ts}
- src/db/client.ts (PrismaClient tunggal), src/db/tenant.ts (tenantDb)
- src/lib/ (auth, storage, email, payment adapter, jobs)
- src/styles/edusaas.css, src/styles/themes/marketing.css (+ file CSS hasil shadcn init)
- src/components/{ui,marketing,dashboard}/

## Styling & tema (detail: docs/PRD.md §5.4)
- Preset shadcn b1GKyb59c: style base-lyra, komponen Base UI (@base-ui/react, bukan Radix), primary oranye, font Inter.
- Tema dashboard = token :root/.dark di file CSS hasil `shadcn init` (path di components.json → tailwind.css).
  JANGAN ubah nilai token di file itu secara manual; ganti preset lewat CLI shadcn.
- Tema landing = src/styles/themes/marketing.css (:root[data-theme="marketing"]), monokrom, terang saja.
  `data-theme="marketing"` dipasang di <html> oleh __root.tsx dari `staticData.theme` layout (marketing).
  Kelas `.dark` hanya untuk area dashboard.
- Token tambahan (font mono, surface-subtle, status-*, text-mk-*, text-ds-*) di src/styles/edusaas.css.
- Di komponen: pakai kelas semantik (bg-background, text-muted-foreground, border-border, bg-primary,
  bg-status-warning-bg, ...). Dilarang hex/rgb/oklch literal dan warna bawaan Tailwind (bg-blue-500, text-gray-600).
- Tipografi landing: text-mk-display, text-mk-h2, text-mk-lead, text-mk-body, text-mk-eyebrow.
  Tipografi dashboard: text-ds-page-title, text-ds-body, text-ds-table, text-ds-meta, text-ds-caption.
  Jangan campur skala mk-* di dashboard atau ds-* di landing.
- Font: font-sans (Inter) untuk semua teks; font-mono (JetBrains Mono) hanya untuk NIS/NISN, token ujian, kode undangan.
- Komponen khusus landing di src/components/marketing/, khusus LMS di src/components/dashboard/, shadcn di src/components/ui/.
- Gaya: monokrom, garis 1px bukan bayangan, radius rounded-md (8px). Warna hanya untuk status dan destructive.
- Landing mengikuti mockup Opsi A (hero tengah → product shot → strip jenjang → grid fitur → peran → CBT → testimoni → harga → FAQ → CTA → footer).

## Aturan WAJIB
1. Semua akses model tenant lewat tenantDb(schoolId). Jangan pakai prisma langsung.
2. Setiap model tenant baru: field schoolId, @@index diawali schoolId, policy RLS di migrasi SQL.
3. Server function: validasi Zod -> cek permission -> panggil service. Tanpa logika bisnis.
4. Setiap service baru wajib punya test, termasuk test isolasi antar sekolah.
5. Jangan ubah migrasi yang sudah ada; buat migrasi baru.
6. Teks UI berbahasa Indonesia. Waktu disimpan UTC.
7. Jangan menambah dependency baru tanpa menyebut alasannya.
8. Selesai = typecheck, lint, dan test hijau.
9. Kerjakan hanya kode kebutuhan yang diminta; jangan menyentuh modul lain.
10. Modul pembayaran (BL-*) dikerjakan paling akhir; sebelum itu paket diaktifkan manual oleh Super Admin.
