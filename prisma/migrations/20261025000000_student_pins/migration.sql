-- CreateTable
CREATE TABLE "student_pins" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "pin_hash" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "student_pins_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "student_pins_school_id_student_id_key" ON "student_pins"("school_id", "student_id");

-- AddForeignKey
ALTER TABLE "student_pins" ADD CONSTRAINT "student_pins_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_pins" ADD CONSTRAINT "student_pins_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS model tenant (AGENTS.md aturan 2): hanya baris school_id = app.current_school_id.
-- Tanpa konteks itu query melihat nol baris (gagal tertutup).
ALTER TABLE student_pins ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_pins FORCE ROW LEVEL SECURITY;
CREATE POLICY student_pins_school_isolation ON student_pins
  USING (school_id = NULLIF(current_setting('app.current_school_id', true), '')::uuid)
  WITH CHECK (school_id = NULLIF(current_setting('app.current_school_id', true), '')::uuid);
