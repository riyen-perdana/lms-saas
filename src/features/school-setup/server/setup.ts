// Server function wizard setup: validasi Zod -> middleware izin -> service
// (AGENTS.md aturan 3). Tanpa logika bisnis di sini.

import { createServerFn } from "@tanstack/react-start"

import { schoolAdminMiddleware } from "@/features/auth/server/school-admin"
import { profileSchema } from "@/features/school-setup/schema"
import {
  SetupError,
  completeSetup,
  getSetupState,
  saveLogo,
  updateProfile,
} from "@/features/school-setup/service"

export type SetupResult =
  | { ok: true }
  | { ok: false; code: SetupError["code"]; message: string }

async function toResult(action: () => Promise<unknown>): Promise<SetupResult> {
  try {
    await action()
    return { ok: true }
  } catch (error) {
    if (error instanceof SetupError) {
      return { ok: false, code: error.code, message: error.message }
    }
    throw error
  }
}

export const getSetupStateFn = createServerFn({ method: "GET" })
  .middleware([schoolAdminMiddleware])
  .handler(({ context }) => getSetupState(context.schoolId))

export const updateProfileFn = createServerFn({ method: "POST" })
  .middleware([schoolAdminMiddleware])
  .validator((data: unknown) => profileSchema.parse(data))
  .handler(({ data, context }) => toResult(() => updateProfile(context.schoolId, data)))

export const uploadLogoFn = createServerFn({ method: "POST" })
  .middleware([schoolAdminMiddleware])
  .validator((data: unknown) => {
    if (!(data instanceof FormData)) throw new Error("Data harus FormData")
    const file = data.get("logo")
    if (!(file instanceof File)) throw new Error("File logo wajib diisi")
    return file
  })
  .handler(({ data, context }) =>
    toResult(async () =>
      saveLogo(context.schoolId, {
        body: Buffer.from(await data.arrayBuffer()),
        contentType: data.type,
      })
    )
  )

export const completeSetupFn = createServerFn({ method: "POST" })
  .middleware([schoolAdminMiddleware])
  .handler(({ context }) => toResult(() => completeSetup(context.schoolId)))
