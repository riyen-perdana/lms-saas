-- AlterTable
ALTER TABLE "classrooms" ADD COLUMN     "homeroom_teacher_id" UUID;

-- CreateTable
CREATE TABLE "courses" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "classroom_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "teacher_id" UUID NOT NULL,
    "semester_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "courses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "courses_school_id_semester_id_idx" ON "courses"("school_id", "semester_id");

-- CreateIndex
CREATE INDEX "courses_school_id_classroom_id_idx" ON "courses"("school_id", "classroom_id");

-- CreateIndex
CREATE INDEX "courses_school_id_subject_id_idx" ON "courses"("school_id", "subject_id");

-- CreateIndex
CREATE INDEX "courses_school_id_teacher_id_idx" ON "courses"("school_id", "teacher_id");

-- AddForeignKey
ALTER TABLE "classrooms" ADD CONSTRAINT "classrooms_homeroom_teacher_id_fkey" FOREIGN KEY ("homeroom_teacher_id") REFERENCES "teachers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courses" ADD CONSTRAINT "courses_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courses" ADD CONSTRAINT "courses_classroom_id_fkey" FOREIGN KEY ("classroom_id") REFERENCES "classrooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courses" ADD CONSTRAINT "courses_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courses" ADD CONSTRAINT "courses_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "teachers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courses" ADD CONSTRAINT "courses_semester_id_fkey" FOREIGN KEY ("semester_id") REFERENCES "semesters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Satu rombel tidak boleh punya dua kelas pembelajaran untuk mapel yang sama
-- pada semester yang sama (PRD OB-03). Unik selama belum dihapus (soft delete),
-- sehingga kelas yang dihapus boleh dibuat ulang dengan mapel yang sama.
CREATE UNIQUE INDEX "courses_classroom_subject_semester_active_idx"
  ON "courses"("school_id", "classroom_id", "subject_id", "semester_id")
  WHERE "deleted_at" IS NULL;

-- Satu guru paling banyak menjadi wali kelas satu rombel per semester. Semua
-- kolom ada di baris classrooms, jadi indeks ini cukup; diuji juga lewat service.
CREATE UNIQUE INDEX "classrooms_homeroom_teacher_per_semester_active_idx"
  ON "classrooms"("school_id", "homeroom_teacher_id", "semester_id")
  WHERE "homeroom_teacher_id" IS NOT NULL AND "deleted_at" IS NULL;

-- RLS model tenant (AGENTS.md aturan 2): hanya baris school_id = app.current_school_id.
-- Tanpa konteks itu query melihat nol baris (gagal tertutup).
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE courses FORCE ROW LEVEL SECURITY;
CREATE POLICY courses_school_isolation ON courses
  USING (school_id = NULLIF(current_setting('app.current_school_id', true), '')::uuid)
  WITH CHECK (school_id = NULLIF(current_setting('app.current_school_id', true), '')::uuid);
