-- Isolasi tenant lapis 2: Row Level Security (PRD §5.2).
--
-- Syarat mutlak: role yang dipakai aplikasi TIDAK boleh superuser dan TIDAK
-- boleh punya atribut BYPASSRLS, karena PostgreSQL selalu membiarkan keduanya
-- melewati policy. Maka:
--   - DATABASE_URL     (user postgres)  -> hanya Prisma CLI & migrasi.
--   - DATABASE_APP_URL (user edusaas_app) -> aplikasi dan test.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'edusaas_app') THEN
    -- Password dev-only untuk PostgreSQL lokal. Di produksi, credential
    -- diambil dari secret manager lewat connection pooler.
    CREATE ROLE edusaas_app
      LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE
      PASSWORD 'edusaas_dev';
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO edusaas_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO edusaas_app;

-- Tabel tenant yang dibuat migrasi berikutnya otomatis dapat diakses role aplikasi.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO edusaas_app;

-- memberships: hanya baris sekolah yang sedang diakses yang terlihat.
-- current_setting(..., true) mengembalikan NULL bila transaksi tidak
-- menjalankan set_config('app.current_school_id', ...) lebih dulu, sehingga
-- query tanpa konteks sekolah mengembalikan nol baris (gagal tertutup), bukan
-- seluruh data.
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships FORCE ROW LEVEL SECURITY;

CREATE POLICY memberships_school_isolation ON memberships
  USING (
    school_id = NULLIF(current_setting('app.current_school_id', true), '')::uuid
  )
  WITH CHECK (
    school_id = NULLIF(current_setting('app.current_school_id', true), '')::uuid
  );