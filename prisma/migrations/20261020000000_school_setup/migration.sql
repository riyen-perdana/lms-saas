-- AlterTable
ALTER TABLE "schools" ADD COLUMN "setup_completed_at" TIMESTAMPTZ(6);

-- Sekolah yang sudah ada sebelum wizard setup dianggap selesai; hanya sekolah
-- yang mendaftar sesudahnya yang diarahkan ke /setup.
UPDATE "schools" SET "setup_completed_at" = now();
