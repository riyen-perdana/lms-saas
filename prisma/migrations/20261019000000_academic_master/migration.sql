-- CreateEnum
CREATE TYPE "subject_group" AS ENUM ('umum', 'produktif', 'muatan_lokal');

-- CreateTable
CREATE TABLE "academic_years" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "name" VARCHAR(32) NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "academic_years_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "semesters" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "name" VARCHAR(32) NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "semesters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "majors" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "code" VARCHAR(16) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "majors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "classrooms" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "semester_id" UUID NOT NULL,
    "grade" SMALLINT NOT NULL,
    "major_id" UUID,
    "name" VARCHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "classrooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subjects" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "code" VARCHAR(16) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "group" "subject_group" NOT NULL DEFAULT 'umum',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "subjects_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "academic_years_school_id_is_active_idx" ON "academic_years"("school_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "academic_years_school_id_name_key" ON "academic_years"("school_id", "name");

-- CreateIndex
CREATE INDEX "semesters_school_id_is_active_idx" ON "semesters"("school_id", "is_active");

-- CreateIndex
CREATE INDEX "semesters_school_id_academic_year_id_idx" ON "semesters"("school_id", "academic_year_id");

-- CreateIndex
CREATE UNIQUE INDEX "semesters_school_id_academic_year_id_name_key" ON "semesters"("school_id", "academic_year_id", "name");

-- CreateIndex
CREATE INDEX "majors_school_id_code_idx" ON "majors"("school_id", "code");

-- CreateIndex
CREATE INDEX "classrooms_school_id_semester_id_idx" ON "classrooms"("school_id", "semester_id");

-- CreateIndex
CREATE INDEX "classrooms_school_id_major_id_idx" ON "classrooms"("school_id", "major_id");

-- CreateIndex
CREATE INDEX "subjects_school_id_code_idx" ON "subjects"("school_id", "code");

-- AddForeignKey
ALTER TABLE "academic_years" ADD CONSTRAINT "academic_years_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "semesters" ADD CONSTRAINT "semesters_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "semesters" ADD CONSTRAINT "semesters_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "majors" ADD CONSTRAINT "majors_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classrooms" ADD CONSTRAINT "classrooms_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classrooms" ADD CONSTRAINT "classrooms_semester_id_fkey" FOREIGN KEY ("semester_id") REFERENCES "semesters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classrooms" ADD CONSTRAINT "classrooms_major_id_fkey" FOREIGN KEY ("major_id") REFERENCES "majors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Satu tahun ajaran dan satu semester aktif per sekolah.
CREATE UNIQUE INDEX "academic_years_one_active_idx" ON "academic_years"("school_id") WHERE "is_active";
CREATE UNIQUE INDEX "semesters_one_active_idx" ON "semesters"("school_id") WHERE "is_active";

-- Kode jurusan dan mapel unik per sekolah selama belum dihapus (soft delete).
CREATE UNIQUE INDEX "majors_school_code_active_idx" ON "majors"("school_id", lower("code")) WHERE "deleted_at" IS NULL;
CREATE UNIQUE INDEX "subjects_school_code_active_idx" ON "subjects"("school_id", lower("code")) WHERE "deleted_at" IS NULL;

-- RLS model tenant (AGENTS.md aturan 2): hanya baris school_id = app.current_school_id.
-- Tanpa konteks itu query melihat nol baris (gagal tertutup).
ALTER TABLE academic_years ENABLE ROW LEVEL SECURITY;
ALTER TABLE academic_years FORCE ROW LEVEL SECURITY;
CREATE POLICY academic_years_school_isolation ON academic_years
  USING (school_id = NULLIF(current_setting('app.current_school_id', true), '')::uuid)
  WITH CHECK (school_id = NULLIF(current_setting('app.current_school_id', true), '')::uuid);

ALTER TABLE semesters ENABLE ROW LEVEL SECURITY;
ALTER TABLE semesters FORCE ROW LEVEL SECURITY;
CREATE POLICY semesters_school_isolation ON semesters
  USING (school_id = NULLIF(current_setting('app.current_school_id', true), '')::uuid)
  WITH CHECK (school_id = NULLIF(current_setting('app.current_school_id', true), '')::uuid);

ALTER TABLE majors ENABLE ROW LEVEL SECURITY;
ALTER TABLE majors FORCE ROW LEVEL SECURITY;
CREATE POLICY majors_school_isolation ON majors
  USING (school_id = NULLIF(current_setting('app.current_school_id', true), '')::uuid)
  WITH CHECK (school_id = NULLIF(current_setting('app.current_school_id', true), '')::uuid);

ALTER TABLE classrooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE classrooms FORCE ROW LEVEL SECURITY;
CREATE POLICY classrooms_school_isolation ON classrooms
  USING (school_id = NULLIF(current_setting('app.current_school_id', true), '')::uuid)
  WITH CHECK (school_id = NULLIF(current_setting('app.current_school_id', true), '')::uuid);

ALTER TABLE subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE subjects FORCE ROW LEVEL SECURITY;
CREATE POLICY subjects_school_isolation ON subjects
  USING (school_id = NULLIF(current_setting('app.current_school_id', true), '')::uuid)
  WITH CHECK (school_id = NULLIF(current_setting('app.current_school_id', true), '')::uuid);
