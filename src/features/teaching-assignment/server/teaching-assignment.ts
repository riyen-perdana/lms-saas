// Server function penugasan guru (OB-03): validasi Zod -> middleware izin ->
// service (AGENTS.md aturan 3). Tanpa logika bisnis di sini.

import { createServerFn } from "@tanstack/react-start"

import { schoolAdminMiddleware } from "@/features/auth/server/school-admin"
import {
  classroomIdSchema,
  courseIdSchema,
  courseSchema,
  homeroomSchema,
} from "@/features/teaching-assignment/schema"
import {
  TeachingError,
  clearHomeroomTeacher,
  createCourse,
  getAssignmentBoard,
  removeCourse,
  setHomeroomTeacher,
} from "@/features/teaching-assignment/service"

export type TeachingResult =
  | { ok: true }
  | { ok: false; code: TeachingError["code"]; message: string }

async function toResult(action: () => Promise<unknown>): Promise<TeachingResult> {
  try {
    await action()
    return { ok: true }
  } catch (error) {
    if (error instanceof TeachingError) {
      return { ok: false, code: error.code, message: error.message }
    }
    throw error
  }
}

/** Satu snapshot untuk seluruh halaman: semester aktif, rombel, mapel, guru, kelas. */
export const getAssignmentBoardFn = createServerFn({ method: "GET" })
  .middleware([schoolAdminMiddleware])
  .handler(({ context }) => getAssignmentBoard(context.schoolId))

export const createCourseFn = createServerFn({ method: "POST" })
  .middleware([schoolAdminMiddleware])
  .validator((data: unknown) => courseSchema.parse(data))
  .handler(({ data, context }) => toResult(() => createCourse(context.schoolId, data)))

export const removeCourseFn = createServerFn({ method: "POST" })
  .middleware([schoolAdminMiddleware])
  .validator((data: unknown) => courseIdSchema.parse(data))
  .handler(({ data, context }) => toResult(() => removeCourse(context.schoolId, data.id)))

export const setHomeroomFn = createServerFn({ method: "POST" })
  .middleware([schoolAdminMiddleware])
  .validator((data: unknown) => homeroomSchema.parse(data))
  .handler(({ data, context }) =>
    toResult(() => setHomeroomTeacher(context.schoolId, data))
  )

export const clearHomeroomFn = createServerFn({ method: "POST" })
  .middleware([schoolAdminMiddleware])
  .validator((data: unknown) => classroomIdSchema.parse(data))
  .handler(({ data, context }) =>
    toResult(() => clearHomeroomTeacher(context.schoolId, data.classroomId))
  )