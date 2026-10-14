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
import { schoolBaseUrl } from "@/lib/tenant/host"

export const checkSlug = createServerFn({ method: "GET" })
  .validator((data: unknown) => z.object({ slug: slugSchema }).parse(data))
  .handler(async ({ data }) => ({
    available: await isSlugAvailable(data.slug),
  }))

export type RegisterResult =
  | { ok: true; slug: string; loginUrl: string }
  | { ok: false; code: RegistrationError["code"]; message: string }

export const registerSchoolFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => registerSchoolSchema.parse(data))
  .handler(async ({ data }): Promise<RegisterResult> => {
    try {
      const { slug } = await registerSchool(data)
      const host = getRequestHeaders().get("host")

      return { ok: true, slug, loginUrl: `${schoolBaseUrl(host, slug)}/login` }
    } catch (error) {
      if (error instanceof RegistrationError) {
        return { ok: false, code: error.code, message: error.message }
      }
      throw error
    }
  })
