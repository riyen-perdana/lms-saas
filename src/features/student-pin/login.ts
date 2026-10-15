// Login siswa dengan NIS + PIN (US-01): sekolah dari host, batas laju berlapis
// yang HANYA menghitung kegagalan (jatah dicadangkan atomik sebelum verifikasi
// dan dikembalikan bila berhasil), lalu verifikasi.
// Semua sebab gagal memberi pesan yang sama. Dipanggil oleh plugin Better Auth
// `student-pin` (src/lib/auth-student-pin.ts).

import {
  RateLimitError,
  consumeRateLimit,
  releaseRateLimit,
  type RateLimitRule,
} from "@/lib/rate-limit"
import { resolveTenant } from "@/lib/tenant/resolve"

import { verifyStudentPin } from "./service"

export const INVALID_LOGIN_MESSAGE = "NIS atau PIN salah."

export const STUDENT_LOGIN_LIMITS = {
  /** Per sekolah + NIS + alamat IP. */
  perNisIp: { bucket: "student-pin", limit: 5, windowSeconds: 900 },
  /** Per alamat IP (semua NIS). */
  perIp: { bucket: "student-pin-ip", limit: 60, windowSeconds: 900 },
  /** Per sekolah + NIS (semua IP). */
  perNis: { bucket: "student-pin-nis", limit: 20, windowSeconds: 3600 },
} satisfies Record<string, RateLimitRule>

export class StudentLoginError extends Error {
  constructor(
    readonly code: "INVALID" | "RATE_LIMITED",
    message: string,
    readonly retryAfterSeconds?: number
  ) {
    super(message)
    this.name = "StudentLoginError"
  }
}

interface LoginInput {
  host: string | null
  ip: string
  nis: string
  pin: string
}

export async function loginWithStudentPin(
  input: LoginInput
): Promise<{ userId: string }> {
  const tenant = await resolveTenant(input.host)
  const school = tenant.school
  if (tenant.area !== "school" || !school) {
    throw new StudentLoginError("INVALID", INVALID_LOGIN_MESSAGE)
  }

  const nisKey = `${school.id}:${input.nis}`
  const checks: [RateLimitRule, string][] = [
    [STUDENT_LOGIN_LIMITS.perNisIp, `${nisKey}:${input.ip}`],
    [STUDENT_LOGIN_LIMITS.perIp, input.ip],
    [STUDENT_LOGIN_LIMITS.perNis, nisKey],
  ]

  // Jatah dicadangkan secara atomik SEBELUM verifikasi (ledakan permintaan
  // paralel tidak bisa lolos), lalu dikembalikan bila login berhasil.
  const reserved: [RateLimitRule, string][] = []
  const releaseAll = () =>
    Promise.all(
      reserved.map(([rule, subject]) => releaseRateLimit(rule, subject))
    )

  try {
    for (const check of checks) {
      // consumeRateLimit menambah hitungan sebelum melempar, jadi yang menolak
      // juga ikut dicatat supaya ikut dikembalikan.
      reserved.push(check)
      await consumeRateLimit(...check)
    }
  } catch (error) {
    await releaseAll()
    if (error instanceof RateLimitError) {
      throw new StudentLoginError(
        "RATE_LIMITED",
        error.message,
        error.retryAfterSeconds
      )
    }
    throw error
  }

  let result: { userId: string } | null
  try {
    result = await verifyStudentPin(school.id, input.nis, input.pin)
  } catch (error) {
    // Galat tak terduga (mis. database) bukan tebakan: jangan dihitung.
    await releaseAll()
    throw error
  }

  if (result) {
    await releaseAll()
    return result
  }
  // Gagal: jatah yang dicadangkan tetap terpakai.
  throw new StudentLoginError("INVALID", INVALID_LOGIN_MESSAGE)
}
