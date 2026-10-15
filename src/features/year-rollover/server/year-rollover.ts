// Server function kenaikan kelas (OB-04): validasi Zod -> middleware izin ->
// service (AGENTS.md aturan 3). Tanpa logika bisnis di sini.

import { createServerFn } from "@tanstack/react-start"

import { AcademicError, activateSemester } from "@/features/academic/service"
import { schoolAdminMiddleware } from "@/features/auth/server/school-admin"
import {
  rolloverPreviewSchema,
  rolloverSchema,
  semesterIdSchema,
} from "@/features/year-rollover/schema"
import {
  RolloverError,
  getRolloverBoard,
  previewRollover,
  runRollover,
  type RolloverPreview,
  type RolloverResult,
} from "@/features/year-rollover/service"

export type RolloverFailure = {
  ok: false
  code: RolloverError["code"] | AcademicError["code"]
  message: string
}

export type RolloverActionResult<T> = ({ ok: true } & T) | RolloverFailure

async function toResult<T extends object>(
  action: () => Promise<T>
): Promise<RolloverActionResult<T>> {
  try {
    return { ok: true, ...(await action()) }
  } catch (error) {
    if (error instanceof RolloverError || error instanceof AcademicError) {
      return { ok: false, code: error.code, message: error.message }
    }
    throw error
  }
}

export const getRolloverBoardFn = createServerFn({ method: "GET" })
  .middleware([schoolAdminMiddleware])
  .handler(({ context }) => getRolloverBoard(context.schoolId))

export const previewRolloverFn = createServerFn({ method: "POST" })
  .middleware([schoolAdminMiddleware])
  .validator((data: unknown) => rolloverPreviewSchema.parse(data))
  .handler(
    ({ data, context }): Promise<RolloverActionResult<{ preview: RolloverPreview }>> =>
      toResult(async () => ({ preview: await previewRollover(context.schoolId, data) }))
  )

export const runRolloverFn = createServerFn({ method: "POST" })
  .middleware([schoolAdminMiddleware])
  .validator((data: unknown) => rolloverSchema.parse(data))
  .handler(
    ({ data, context }): Promise<RolloverActionResult<{ result: RolloverResult }>> =>
      toResult(async () => ({ result: await runRollover(context.schoolId, data) }))
  )

export const activateSemesterFn = createServerFn({ method: "POST" })
  .middleware([schoolAdminMiddleware])
  .validator((data: unknown) => semesterIdSchema.parse(data))
  .handler(({ data, context }) =>
    toResult(async () => {
      await activateSemester(context.schoolId, data.semesterId)
      return {}
    })
  )
