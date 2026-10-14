// Server function data master akademik: validasi Zod -> middleware izin ->
// service (AGENTS.md aturan 3). Tanpa logika bisnis di sini.

import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import {
  academicYearSchema,
  classroomSchema,
  majorSchema,
  subjectSchema,
} from "@/features/academic/schema"
import {
  AcademicError,
  createAcademicYear,
  createClassroom,
  createMajor,
  createSubject,
  getActiveSemester,
  listAcademicYears,
  listClassrooms,
  listMajors,
  listSubjects,
  removeClassroom,
  removeMajor,
  removeSubject,
} from "@/features/academic/service"
import { schoolAdminMiddleware } from "@/features/auth/server/school-admin"

export type AcademicResult =
  | { ok: true }
  | { ok: false; code: AcademicError["code"]; message: string }

async function toResult(action: () => Promise<unknown>): Promise<AcademicResult> {
  try {
    await action()
    return { ok: true }
  } catch (error) {
    if (error instanceof AcademicError) {
      return { ok: false, code: error.code, message: error.message }
    }
    throw error
  }
}

const idSchema = z.object({ id: z.uuid() })
const semesterQuerySchema = z.object({ semesterId: z.uuid() })

export const listYearsFn = createServerFn({ method: "GET" })
  .middleware([schoolAdminMiddleware])
  .handler(({ context }) => listAcademicYears(context.schoolId))

export const getActiveSemesterFn = createServerFn({ method: "GET" })
  .middleware([schoolAdminMiddleware])
  .handler(({ context }) => getActiveSemester(context.schoolId))

export const createYearFn = createServerFn({ method: "POST" })
  .middleware([schoolAdminMiddleware])
  .validator((data: unknown) => academicYearSchema.parse(data))
  .handler(({ data, context }) => toResult(() => createAcademicYear(context.schoolId, data)))

export const listMajorsFn = createServerFn({ method: "GET" })
  .middleware([schoolAdminMiddleware])
  .handler(({ context }) => listMajors(context.schoolId))

export const createMajorFn = createServerFn({ method: "POST" })
  .middleware([schoolAdminMiddleware])
  .validator((data: unknown) => majorSchema.parse(data))
  .handler(({ data, context }) => toResult(() => createMajor(context.schoolId, data)))

export const removeMajorFn = createServerFn({ method: "POST" })
  .middleware([schoolAdminMiddleware])
  .validator((data: unknown) => idSchema.parse(data))
  .handler(({ data, context }) => toResult(() => removeMajor(context.schoolId, data.id)))

export const listClassroomsFn = createServerFn({ method: "GET" })
  .middleware([schoolAdminMiddleware])
  .validator((data: unknown) => semesterQuerySchema.parse(data))
  .handler(({ data, context }) => listClassrooms(context.schoolId, data.semesterId))

export const createClassroomFn = createServerFn({ method: "POST" })
  .middleware([schoolAdminMiddleware])
  .validator((data: unknown) => classroomSchema.parse(data))
  .handler(({ data, context }) => toResult(() => createClassroom(context.schoolId, data)))

export const removeClassroomFn = createServerFn({ method: "POST" })
  .middleware([schoolAdminMiddleware])
  .validator((data: unknown) => idSchema.parse(data))
  .handler(({ data, context }) => toResult(() => removeClassroom(context.schoolId, data.id)))

export const listSubjectsFn = createServerFn({ method: "GET" })
  .middleware([schoolAdminMiddleware])
  .handler(({ context }) => listSubjects(context.schoolId))

export const createSubjectFn = createServerFn({ method: "POST" })
  .middleware([schoolAdminMiddleware])
  .validator((data: unknown) => subjectSchema.parse(data))
  .handler(({ data, context }) => toResult(() => createSubject(context.schoolId, data)))

export const removeSubjectFn = createServerFn({ method: "POST" })
  .middleware([schoolAdminMiddleware])
  .validator((data: unknown) => idSchema.parse(data))
  .handler(({ data, context }) => toResult(() => removeSubject(context.schoolId, data.id)))
