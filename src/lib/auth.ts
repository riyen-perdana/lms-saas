// Konfigurasi Better Auth (PRD §5.2, US-01 s.d. US-02).
// ---------------------------------------------------------------------------
// Sesi berlaku PER SUBDOMAIN: cookie sengaja dibiarkan host-only (tanpa
// atribut Domain, `crossSubDomainCookies` tidak diaktifkan), sehingga browser
// tidak mengirim cookie `sekolah-a.edusaas.id` ke `sekolah-b.edusaas.id`.
// Jangan aktifkan `crossSubDomainCookies` — itu akan membocorkan sesi antar
// sekolah.
//
// Hak akses ke SEKOLAH TERTENTU tidak ditentukan oleh sesi ini, melainkan oleh
// `memberships` (user + schoolId + role) yang dicek di setiap server function.
// Plugin organization sengaja tidak dipakai: peran per sekolah sudah dimodelkan
// oleh `memberships` + RLS.

import { betterAuth } from "better-auth"
import { prismaAdapter } from "better-auth/adapters/prisma"
import { tanstackStartCookies } from "better-auth/tanstack-start"

import { prisma } from "@/db/client"
import { uuidv7 } from "@/lib/uuid"

/**
 * Host yang boleh memakai endpoint auth. Di development: localhost dan semua
 * subdomainnya. Di produksi: domain utama dari `APP_DOMAIN` plus subdomainnya.
 */
function allowedHosts(): string[] {
  const hosts = ["localhost:*", "*.localhost:*"]
  const domain = process.env.APP_DOMAIN

  if (domain) {
    hosts.push(domain, `*.${domain}`)
  }

  return hosts
}

const isProduction = process.env.NODE_ENV === "production"

export const auth = betterAuth({
  appName: "EduSaaS",
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: {
    allowedHosts: allowedHosts(),
    protocol: isProduction ? "https" : "http",
  },
  trustedOrigins: [
    "http://localhost:*",
    "http://*.localhost:*",
    ...(process.env.APP_DOMAIN
      ? [`https://${process.env.APP_DOMAIN}`, `https://*.${process.env.APP_DOMAIN}`]
      : []),
  ],
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  advanced: {
    // Kolom id bertipe uuid; PRD §7 mewajibkan UUID v7.
    database: { generateId: () => uuidv7() },
    useSecureCookies: isProduction,
  },
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    // Verifikasi email & reset sandi menyusul di US-02 (butuh adapter email).
    requireEmailVerification: false,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
  },
  // Wajib paling akhir: meneruskan Set-Cookie ke respons TanStack Start.
  plugins: [tanstackStartCookies()],
})

export type Auth = typeof auth
