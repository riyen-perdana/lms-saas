// Server function Super Admin: validasi Zod -> middleware izin -> service
// (AGENTS.md aturan 3). Tanpa logika bisnis di sini.

import { createServerFn } from "@tanstack/react-start"

import {
  activatePlanSchema,
  listSchoolsSchema,
  schoolIdSchema,
  suspendSchema,
} from "@/features/platform/schema"
import {
  PlatformError,
  activatePlan,
  getOverview,
  getSchool,
  listActivatablePlans,
  listSchools,
  setSuspended,
} from "@/features/platform/service"
import { platformAdminMiddleware } from "@/features/platform/server/guard"

export type ActionResult =
  { ok: true } | { ok: false; code: PlatformError["code"]; message: string }

async function toResult(action: () => Promise<unknown>): Promise<ActionResult> {
  try {
    await action()
    return { ok: true }
  } catch (error) {
    if (error instanceof PlatformError) {
      return { ok: false, code: error.code, message: error.message }
    }
    throw error
  }
}

export const getOverviewFn = createServerFn({ method: "GET" })
  .middleware([platformAdminMiddleware])
  .handler(() => getOverview())

export const listSchoolsFn = createServerFn({ method: "GET" })
  .middleware([platformAdminMiddleware])
  .validator((data: unknown) => listSchoolsSchema.parse(data))
  .handler(({ data }) => listSchools(data))

export const getSchoolFn = createServerFn({ method: "GET" })
  .middleware([platformAdminMiddleware])
  .validator((data: unknown) => schoolIdSchema.parse(data))
  .handler(({ data }) => getSchool(data.schoolId))

export const listPlansFn = createServerFn({ method: "GET" })
  .middleware([platformAdminMiddleware])
  .handler(() => listActivatablePlans())

export const activatePlanFn = createServerFn({ method: "POST" })
  .middleware([platformAdminMiddleware])
  .validator((data: unknown) => activatePlanSchema.parse(data))
  .handler(({ data }) => toResult(() => activatePlan(data)))

export const setSuspendedFn = createServerFn({ method: "POST" })
  .middleware([platformAdminMiddleware])
  .validator((data: unknown) => suspendSchema.parse(data))
  .handler(({ data }) =>
    toResult(() => setSuspended(data.schoolId, data.suspended))
  )
