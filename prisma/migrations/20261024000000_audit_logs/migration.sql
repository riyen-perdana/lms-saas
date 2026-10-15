-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "actor_user_id" UUID,
    "actor_name" VARCHAR(191) NOT NULL,
    "actor_role" VARCHAR(32) NOT NULL,
    "action" VARCHAR(64) NOT NULL,
    "entity" VARCHAR(64) NOT NULL,
    "entity_id" VARCHAR(64),
    "before" JSONB,
    "after" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_logs_school_id_created_at_idx" ON "audit_logs"("school_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_school_id_action_created_at_idx" ON "audit_logs"("school_id", "action", "created_at");

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;



-- Log hanya boleh ditambah: aplikasi (edusaas_app) tidak punya hak mengubah
-- atau menghapus baris, jadi bug aplikasi pun tidak bisa merusak jejak audit.
REVOKE UPDATE, DELETE, TRUNCATE ON "audit_logs" FROM edusaas_app;

-- RLS model tenant (AGENTS.md aturan 2). Aksi Super Admin atas sebuah sekolah
-- (platformDb, app.is_platform = 'on') dicatat ke sekolah itu juga.
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;
CREATE POLICY audit_logs_school_isolation ON audit_logs
  USING (
    school_id = NULLIF(current_setting('app.current_school_id', true), '')::uuid
    OR current_setting('app.is_platform', true) = 'on'
  )
  WITH CHECK (
    school_id = NULLIF(current_setting('app.current_school_id', true), '')::uuid
    OR current_setting('app.is_platform', true) = 'on'
  );
