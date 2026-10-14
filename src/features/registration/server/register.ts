// Server function pendaftaran: validasi Zod -> service (AGENTS.md aturan 3).
// Endpoint ini publik (pendaftar belum punya akun), jadi tidak ada cek peran.

import { createServerFn } from "@tanstack/react-start"
import { getRequestHeaders } from "@tanstack/react-start/server"
import { z } from "zod"

import {
  registerSchoolSchema,
  slugSchema,
} from "@/features/registration/schema"
import {
  RegistrationError,
  isSlugAvailable,
  registerSchool,
} from "@/features/registration/service"
import { auth } from "@/lib/auth"
import {
  RateLimitError,
  clientAddress,
  consumeRateLimit,
} from "@/lib/rate-limit"
import { schoolBaseUrl } from "@/lib/tenant/host"

// Batas per alamat klien: pendaftaran dibatasi ketat karena membuat sekolah,
// akun, dan mengirim email; pengecekan subdomain lebih longgar (dipanggil
// saat mengetik).
// REGISTER_RATE_LIMIT hanya untuk dev/E2E (banyak pendaftaran dari satu IP).
const REGISTER_LIMIT = {
  bucket: "register",
  limit: Number(process.env.REGISTER_RATE_LIMIT) || 5,
  windowSeconds: 3600,
}
const SLUG_CHECK_LIMIT = { bucket: "slug-check", limit: 60, windowSeconds: 60 }

export const checkSlug = createServerFn({ method: "GET" })
  .validator((data: unknown) => z.object({ slug: slugSchema }).parse(data))
  .handler(async ({ data }) => {
    await consumeRateLimit(
      SLUG_CHECK_LIMIT,
      clientAddress(getRequestHeaders())
    )

    return { available: await isSlugAvailable(data.slug) }
  })

export type RegisterResult =
  | { ok: true; slug: string; loginUrl: string }
  | {
      ok: false
      code: RegistrationError["code"] | "RATE_LIMITED"
      message: string
    }

export const registerSchoolFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => registerSchoolSchema.parse(data))
  .handler(async ({ data }): Promise<RegisterResult> => {
    const headers = getRequestHeaders()

    try {
      await consumeRateLimit(REGISTER_LIMIT, clientAddress(headers))
      const { slug } = await registerSchool(data)
      const loginUrl = `${schoolBaseUrl(headers.get("host"), slug)}/login`

      // Email verifikasi (LP-04). Kegagalan kirim tidak boleh membatalkan
      // pendaftaran yang sudah tersimpan; admin tetap bisa login.
      try {
        await auth.api.sendVerificationEmail({
          body: { email: data.adminEmail, callbackURL: loginUrl },
          headers,
        })
      } catch (error) {
        console.error("[registration] email verifikasi gagal:", error)
      }

      return { ok: true, slug, loginUrl }
    } catch (error) {
      if (error instanceof RateLimitError) {
        return { ok: false, code: "RATE_LIMITED", message: error.message }
      }
      if (error instanceof RegistrationError) {
        return { ok: false, code: error.code, message: error.message }
      }
      throw error
    }
  })
