// Plugin Better Auth: login siswa dengan NIS + PIN (US-01).
// Logika (sekolah dari host, batas laju, verifikasi) ada di
// features/student-pin/login.ts; di sini hanya menjembatani ke sesi Better
// Auth supaya cookie, masa berlaku, dan pencabutan sesi sama dengan login lain.

import type { BetterAuthPlugin } from "better-auth"
import { APIError, createAuthEndpoint } from "better-auth/api"
import { setSessionCookie } from "better-auth/cookies"

import {
  INVALID_LOGIN_MESSAGE,
  StudentLoginError,
  loginWithStudentPin,
} from "@/features/student-pin/login"
import { studentPinLoginSchema } from "@/features/student-pin/schema"
import { clientAddress } from "@/lib/rate-limit"

export const studentPin = () =>
  ({
    id: "student-pin",
    endpoints: {
      signInStudentPin: createAuthEndpoint(
        "/sign-in/student-pin",
        { method: "POST", body: studentPinLoginSchema },
        async (ctx) => {
          const headers = ctx.headers ?? ctx.request?.headers ?? new Headers()

          let userId: string
          try {
            ;({ userId } = await loginWithStudentPin({
              host: headers.get("x-forwarded-host") ?? headers.get("host"),
              ip: clientAddress(headers),
              nis: ctx.body.nis,
              pin: ctx.body.pin,
            }))
          } catch (error) {
            if (error instanceof StudentLoginError) {
              throw new APIError(
                error.code === "RATE_LIMITED" ? "TOO_MANY_REQUESTS" : "UNAUTHORIZED",
                { message: error.message }
              )
            }
            throw error
          }

          const user = await ctx.context.internalAdapter.findUserById(userId)
          if (!user) {
            throw new APIError("UNAUTHORIZED", { message: INVALID_LOGIN_MESSAGE })
          }
          const session = await ctx.context.internalAdapter.createSession(user.id)
          await setSessionCookie(ctx, { session, user })

          return ctx.json({
            token: session.token,
            user: { id: user.id, name: user.name },
          })
        }
      ),
    },
  }) satisfies BetterAuthPlugin
