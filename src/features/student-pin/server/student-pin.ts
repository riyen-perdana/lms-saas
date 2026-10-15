// Server function PIN siswa (US-01): validasi Zod -> izin -> service
// (AGENTS.md aturan 3). Hanya admin sekolah.

import { createServerFn } from "@tanstack/react-start"

import { getActiveSemester, listClassrooms } from "@/features/academic/service"
import { schoolAdminMiddleware } from "@/features/auth/server/school-admin"
import {
  classroomIdSchema,
  studentIdSchema,
} from "@/features/student-pin/schema"
import {
  StudentPinError,
  issuePinsForClassroom,
  issueStudentPin,
  type PinRow,
} from "@/features/student-pin/service"

type Failure = { ok: false; code: StudentPinError["code"]; message: string }

async function toResult<T extends object>(
  action: () => Promise<T>
): Promise<({ ok: true } & T) | Failure> {
  try {
    return { ok: true, ...(await action()) }
  } catch (error) {
    if (error instanceof StudentPinError) {
      return { ok: false, code: error.code, message: error.message }
    }
    throw error
  }
}

export const issueStudentPinFn = createServerFn({ method: "POST" })
  .middleware([schoolAdminMiddleware])
  .validator((data: unknown) => studentIdSchema.parse(data))
  .handler(({ data, context }) =>
    toResult(() => issueStudentPin(context.schoolId, context.actor, data.studentId))
  )

export const issueClassroomPinsFn = createServerFn({ method: "POST" })
  .middleware([schoolAdminMiddleware])
  .validator((data: unknown) => classroomIdSchema.parse(data))
  .handler(({ data, context }) =>
    toResult(
      (): Promise<{ rows: PinRow[]; skipped: number }> =>
        issuePinsForClassroom(context.schoolId, context.actor, data.classroomId)
    )
  )

/** Semester aktif + rombelnya, untuk memilih rombel pada PIN massal. */
export const getPinBoardFn = createServerFn({ method: "GET" })
  .middleware([schoolAdminMiddleware])
  .handler(async ({ context }) => {
    const semester = await getActiveSemester(context.schoolId)
    if (!semester) return { semesterName: null, classrooms: [] }

    const classrooms = await listClassrooms(context.schoolId, semester.id)
    return {
      semesterName: `${semester.name} ${semester.academicYear.name}`,
      classrooms: classrooms.map((room) => ({
        id: room.id,
        name: room.name,
        grade: room.grade,
      })),
    }
  })
