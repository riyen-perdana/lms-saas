// Server function manajemen pengguna (US-02): validasi Zod -> izin -> service
// (AGENTS.md aturan 3). Hanya admin sekolah.

import { createServerFn } from "@tanstack/react-start"

import { schoolAdminMiddleware } from "@/features/auth/server/school-admin"
import {
  listPeopleSchema,
  teacherIdSchema,
} from "@/features/user-management/schema"
import {
  UserManagementError,
  listPeople,
  requestTeacherPasswordReset,
} from "@/features/user-management/service"

export type ResetResult =
  | { ok: true }
  | { ok: false; code: UserManagementError["code"]; message: string }

export const listPeopleFn = createServerFn({ method: "POST" })
  .middleware([schoolAdminMiddleware])
  .validator((data: unknown) => listPeopleSchema.parse(data))
  .handler(({ data, context }) => listPeople(context.schoolId, data))

export const requestTeacherResetFn = createServerFn({ method: "POST" })
  .middleware([schoolAdminMiddleware])
  .validator((data: unknown) => teacherIdSchema.parse(data))
  .handler(async ({ data, context }): Promise<ResetResult> => {
    try {
      await requestTeacherPasswordReset(
        context.schoolId,
        context.actor,
        data.teacherId
      )
      return { ok: true }
    } catch (error) {
      if (error instanceof UserManagementError) {
        return { ok: false, code: error.code, message: error.message }
      }
      throw error
    }
  })
