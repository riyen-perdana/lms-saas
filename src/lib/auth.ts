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
import { studentPin } from "@/lib/auth-student-pin"
import { enqueueEmail } from "@/lib/jobs"
import { resetPasswordEmail, verificationEmail } from "@/lib/email/templates"
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
      ? [
          `https://${process.env.APP_DOMAIN}`,
          `https://*.${process.env.APP_DOMAIN}`,
        ]
      : []),
  ],
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  advanced: {
    // Kolom id bertipe uuid; PRD §7 mewajibkan UUID v7.
    database: { generateId: () => uuidv7() },
    useSecureCookies: isProduction,
  },
  // Pembatas bawaan Better Auth (aktif di produksi) memberi 3 permintaan/10 dtk
  // per IP+path untuk semua path /sign-in*. Di belakang proxy tanpa
  // `advanced.ipAddress` yang dikonfigurasi, semua klien berbagi satu bucket
  // "no-trusted-ip", sehingga satu kelas siswa di IP sekolah yang sama akan
  // terblokir. Login PIN sudah dibatasi pembatas DB sendiri (login.ts, per
  // NIS+IP / IP / NIS), jadi pembatas bawaan dimatikan khusus path ini.
  // Login email TETAP memakai batas bawaan (lihat docs/PROGRESS.md).
  rateLimit: {
    customRules: { "/sign-in/student-pin": false },
  },
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    // Verifikasi email dikirim tapi tidak menjadi syarat login (LP-04: admin
    // bisa langsung masuk setelah mendaftar). Ubah ke true bila kebijakan berubah.
    requireEmailVerification: false,
    resetPasswordTokenExpiresIn: 60 * 60,
    // Setelah sandi diganti, semua sesi lama dicabut.
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: ({ user, url }) => {
      // Tidak di-await: waktu respons tidak boleh membedakan email terdaftar
      // dari yang tidak (enumerasi akun).
      void enqueueEmail(
        resetPasswordEmail({ to: user.email, name: user.name, url })
      ).catch((error: unknown) => console.error("[auth] email reset:", error))
      return Promise.resolve()
    },
  },
  emailVerification: {
    expiresIn: 60 * 60 * 24,
    autoSignInAfterVerification: false,
    sendVerificationEmail: ({ user, url }) => {
      void enqueueEmail(
        verificationEmail({ to: user.email, name: user.name, url })
      ).catch((error: unknown) =>
        console.error("[auth] email verifikasi:", error)
      )
      return Promise.resolve()
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
  },
  // Wajib paling akhir: meneruskan Set-Cookie ke respons TanStack Start.
  plugins: [studentPin(), tanstackStartCookies()],
})

export type Auth = typeof auth
