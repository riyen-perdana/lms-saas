// Server function publik form kontak: validasi Zod -> batas laju -> service.

import { createServerFn } from "@tanstack/react-start"
import { getRequestHeaders } from "@tanstack/react-start/server"

import { contactSchema } from "@/features/contact/schema"
import { createContactRequest } from "@/features/contact/service"
import { enqueueEmail } from "@/lib/jobs"
import { contactNotificationEmail } from "@/lib/email/templates"
import {
  RateLimitError,
  clientAddress,
  consumeRateLimit,
} from "@/lib/rate-limit"

const CONTACT_LIMIT = { bucket: "contact", limit: 5, windowSeconds: 3600 }

export type ContactResult =
  | { ok: true }
  | { ok: false; message: string }

export const sendContactFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => contactSchema.parse(data))
  .handler(async ({ data }): Promise<ContactResult> => {
    try {
      await consumeRateLimit(CONTACT_LIMIT, clientAddress(getRequestHeaders()))
    } catch (error) {
      if (error instanceof RateLimitError) {
        return { ok: false, message: error.message }
      }
      throw error
    }

    await createContactRequest(data)

    // Pesan sudah tersimpan; notifikasi email bersifat tambahan.
    const inbox = process.env.CONTACT_EMAIL
    if (inbox) {
      try {
        await enqueueEmail(contactNotificationEmail({ to: inbox, ...data }))
      } catch (error) {
        console.error("[contact] notifikasi email gagal:", error)
      }
    }

    return { ok: true }
  })
