// Login siswa dengan NIS + PIN (US-01): sekolah dari host, batas laju berlapis
// yang HANYA menghitung kegagalan (dicek sebelum verifikasi), lalu verifikasi.
// Semua sebab gagal memberi pesan yang sama. Dipanggil oleh plugin Better Auth
// `student-pin` (src/lib/auth-student-pin.ts).

import {
  RateLimitError,
  assertRateLimit,
  consumeRateLimit,
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

  try {
    for (const [rule, subject] of checks) await assertRateLimit(rule, subject)
  } catch (error) {
    if (error instanceof RateLimitError) {
      throw new StudentLoginError(
        "RATE_LIMITED",
        error.message,
        error.retryAfterSeconds
      )
    }
    throw error
  }

  const result = await verifyStudentPin(school.id, input.nis, input.pin)
  if (result) return result

  // Hanya kegagalan yang dihitung. Melewati batas saat mencatat (balapan
  // permintaan paralel) tidak mengubah hasil: tetap "NIS atau PIN salah".
  for (const [rule, subject] of checks) {
    await consumeRateLimit(rule, subject).catch((error: unknown) => {
      if (!(error instanceof RateLimitError)) throw error
    })
  }
  throw new StudentLoginError("INVALID", INVALID_LOGIN_MESSAGE)
}
