-- CreateEnum
CREATE TYPE "gender" AS ENUM ('L', 'P');

-- CreateEnum
CREATE TYPE "import_kind" AS ENUM ('teachers', 'students');

-- CreateEnum
CREATE TYPE "import_status" AS ENUM ('queued', 'processing', 'done', 'failed');

-- CreateTable
CREATE TABLE "teachers" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "nip" VARCHAR(18),
    "nuptk" VARCHAR(32),
    "gender" "gender",
    "phone" VARCHAR(20),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "teachers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "students" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "nis" VARCHAR(32) NOT NULL,
    "nisn" VARCHAR(12),
    "gender" "gender",
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "students_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enrollments" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "classroom_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_batches" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "kind" "import_kind" NOT NULL,
    "status" "import_status" NOT NULL DEFAULT 'queued',
    "file_name" VARCHAR(191) NOT NULL,
    "total_rows" INTEGER NOT NULL DEFAULT 0,
    "imported_rows" INTEGER NOT NULL DEFAULT 0,
    "failed_rows" INTEGER NOT NULL DEFAULT 0,
    "error_message" VARCHAR(500),
    "created_by" UUID NOT NULL,
    "started_at" TIMESTAMPTZ(6),
    "finished_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "import_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_errors" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "row_number" INTEGER NOT NULL,
    "column" VARCHAR(32),
    "value" VARCHAR(191),
    "message" VARCHAR(300) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_errors_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "teachers_school_id_idx" ON "teachers"("school_id");

-- CreateIndex
CREATE UNIQUE INDEX "teachers_school_id_user_id_key" ON "teachers"("school_id", "user_id");

-- CreateIndex
CREATE INDEX "students_school_id_idx" ON "students"("school_id");

-- CreateIndex
CREATE UNIQUE INDEX "students_school_id_user_id_key" ON "students"("school_id", "user_id");

-- CreateIndex
CREATE INDEX "enrollments_school_id_student_id_idx" ON "enrollments"("school_id", "student_id");

-- CreateIndex
CREATE INDEX "enrollments_school_id_classroom_id_idx" ON "enrollments"("school_id", "classroom_id");

-- CreateIndex
CREATE UNIQUE INDEX "enrollments_school_id_classroom_id_student_id_key" ON "enrollments"("school_id", "classroom_id", "student_id");

-- CreateIndex
CREATE INDEX "import_batches_school_id_created_at_idx" ON "import_batches"("school_id", "created_at");

-- CreateIndex
CREATE INDEX "import_errors_school_id_batch_id_idx" ON "import_errors"("school_id", "batch_id");

-- AddForeignKey
ALTER TABLE "teachers" ADD CONSTRAINT "teachers_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teachers" ADD CONSTRAINT "teachers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_classroom_id_fkey" FOREIGN KEY ("classroom_id") REFERENCES "classrooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_errors" ADD CONSTRAINT "import_errors_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "import_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_errors" ADD CONSTRAINT "import_errors_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Kode guru dan NIS unik per sekolah selama belum dihapus (soft delete),
-- sehingga impor ulang setelah koreksi data bisa memakai kode yang sama.
CREATE UNIQUE INDEX "teachers_school_code_active_idx" ON "teachers"("school_id", lower("code")) WHERE "deleted_at" IS NULL;
CREATE UNIQUE INDEX "students_school_nis_active_idx" ON "students"("school_id", lower("nis")) WHERE "deleted_at" IS NULL;

-- RLS model tenant (AGENTS.md aturan 2): hanya baris school_id = app.current_school_id.
-- Tanpa konteks itu query melihat nol baris (gagal tertutup).
ALTER TABLE teachers ENABLE ROW LEVEL SECURITY;
ALTER TABLE teachers FORCE ROW LEVEL SECURITY;
CREATE POLICY teachers_school_isolation ON teachers
  USING (school_id = NULLIF(current_setting('app.current_school_id', true), '')::uuid)
  WITH CHECK (school_id = NULLIF(current_setting('app.current_school_id', true), '')::uuid);

ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE students FORCE ROW LEVEL SECURITY;
CREATE POLICY students_school_isolation ON students
  USING (school_id = NULLIF(current_setting('app.current_school_id', true), '')::uuid)
  WITH CHECK (school_id = NULLIF(current_setting('app.current_school_id', true), '')::uuid);

ALTER TABLE enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE enrollments FORCE ROW LEVEL SECURITY;
CREATE POLICY enrollments_school_isolation ON enrollments
  USING (school_id = NULLIF(current_setting('app.current_school_id', true), '')::uuid)
  WITH CHECK (school_id = NULLIF(current_setting('app.current_school_id', true), '')::uuid);

ALTER TABLE import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_batches FORCE ROW LEVEL SECURITY;
CREATE POLICY import_batches_school_isolation ON import_batches
  USING (school_id = NULLIF(current_setting('app.current_school_id', true), '')::uuid)
  WITH CHECK (school_id = NULLIF(current_setting('app.current_school_id', true), '')::uuid);

ALTER TABLE import_errors ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_errors FORCE ROW LEVEL SECURITY;
CREATE POLICY import_errors_school_isolation ON import_errors
  USING (school_id = NULLIF(current_setting('app.current_school_id', true), '')::uuid)
  WITH CHECK (school_id = NULLIF(current_setting('app.current_school_id', true), '')::uuid);
