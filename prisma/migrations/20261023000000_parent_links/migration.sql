-- CreateTable
CREATE TABLE "parent_links" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "parent_user_id" UUID,
    "code_hash" VARCHAR(64) NOT NULL,
    "code_expires_at" TIMESTAMPTZ(6) NOT NULL,
    "linked_at" TIMESTAMPTZ(6),
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "parent_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "parent_links_school_id_student_id_idx" ON "parent_links"("school_id", "student_id");

-- CreateIndex
CREATE INDEX "parent_links_school_id_parent_user_id_idx" ON "parent_links"("school_id", "parent_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "parent_links_school_id_code_hash_key" ON "parent_links"("school_id", "code_hash");

-- AddForeignKey
ALTER TABLE "parent_links" ADD CONSTRAINT "parent_links_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parent_links" ADD CONSTRAINT "parent_links_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parent_links" ADD CONSTRAINT "parent_links_parent_user_id_fkey" FOREIGN KEY ("parent_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Satu orang tua hanya boleh tertaut sekali ke satu siswa selama tautannya
-- belum dicabut (kode berbeda untuk orang tua yang sama ditolak).
CREATE UNIQUE INDEX "parent_links_active_parent_student_idx"
  ON "parent_links"("school_id", "student_id", "parent_user_id")
  WHERE "parent_user_id" IS NOT NULL AND "revoked_at" IS NULL;

-- RLS model tenant (AGENTS.md aturan 2): hanya baris school_id = app.current_school_id.
-- Tanpa konteks itu query melihat nol baris (gagal tertutup).
ALTER TABLE parent_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE parent_links FORCE ROW LEVEL SECURITY;
CREATE POLICY parent_links_school_isolation ON parent_links
  USING (school_id = NULLIF(current_setting('app.current_school_id', true), '')::uuid)
  WITH CHECK (school_id = NULLIF(current_setting('app.current_school_id', true), '')::uuid);
