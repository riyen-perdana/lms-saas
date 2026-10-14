-- CreateEnum
CREATE TYPE "subscription_status" AS ENUM ('trial', 'active', 'expired', 'canceled');

-- CreateTable
CREATE TABLE "platform_admins" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_admins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "status" "subscription_status" NOT NULL,
    "period_start" TIMESTAMPTZ(6) NOT NULL,
    "period_end" TIMESTAMPTZ(6) NOT NULL,
    "trial_ends_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "platform_admins_user_id_key" ON "platform_admins"("user_id");

-- CreateIndex
CREATE INDEX "subscriptions_school_id_status_idx" ON "subscriptions"("school_id", "status");

-- CreateIndex
CREATE INDEX "subscriptions_school_id_created_at_idx" ON "subscriptions"("school_id", "created_at");

-- CreateIndex
CREATE INDEX "subscriptions_period_end_idx" ON "subscriptions"("period_end");

-- AddForeignKey
ALTER TABLE "platform_admins" ADD CONSTRAINT "platform_admins_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RLS subscriptions (model tenant, AGENTS.md aturan 2).
--
-- Dua jalur akses:
--   1. Sekolah: hanya baris dengan school_id = app.current_school_id
--      (di-set oleh tenantDb).
--   2. Platform: Super Admin mengelola langganan semua sekolah. Transaksi
--      platformDb() (src/db/platform.ts) men-set app.is_platform = 'on'.
--      Tanpa salah satu konteks itu, query melihat nol baris (gagal tertutup).
--
-- Catatan: flag app.is_platform hanya boleh di-set oleh platformDb(), yang
-- hanya dipanggil dari service Super Admin setelah cek keanggotaan
-- platform_admins. Jangan memakainya di kode lain.
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions FORCE ROW LEVEL SECURITY;

CREATE POLICY subscriptions_school_isolation ON subscriptions
  USING (
    school_id = NULLIF(current_setting('app.current_school_id', true), '')::uuid
    OR current_setting('app.is_platform', true) = 'on'
  )
  WITH CHECK (
    school_id = NULLIF(current_setting('app.current_school_id', true), '')::uuid
    OR current_setting('app.is_platform', true) = 'on'
  );
