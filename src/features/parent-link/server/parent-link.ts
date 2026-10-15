// Server function tautan orang tua (OB-05): validasi Zod -> izin -> service
// (AGENTS.md aturan 3). Fungsi admin memakai schoolAdminMiddleware; fungsi
// orang tua memeriksa sesi + peran `parent` di sekolah subdomain ini.

import { createServerFn } from "@tanstack/react-start"
import { getRequestHeaders } from "@tanstack/react-start/server"

import { getActiveSemester, listClassrooms } from "@/features/academic/service"
import { isSchoolBlocked } from "@/features/auth/policy"
import { schoolAdminMiddleware } from "@/features/auth/server/school-admin"
import { schoolParentMiddleware } from "@/features/auth/server/school-parent"
import {
  classroomIdSchema,
  joinExistingSchema,
  joinNewSchema,
  linkIdSchema,
  studentIdSchema,
} from "@/features/parent-link/schema"
import {
  ParentLinkError,
  createInvite,
  createInvitesForClassroom,
  listChildren,
  listClassroomLinks,
  redeemInvite,
  revokeLink,
  type JoinIdentity,
} from "@/features/parent-link/service"
import { auth } from "@/lib/auth"
import {
  RateLimitError,
  clientAddress,
  consumeRateLimit,
} from "@/lib/rate-limit"

// Penukaran kode dibatasi per alamat klien DAN per sekolah (alamat bisa
// dipalsukan lewat header bila aplikasi tidak di belakang proxy tepercaya).
// PARENT_JOIN_RATE_LIMIT hanya untuk dev/E2E.
const JOIN_IP_LIMIT = {
  bucket: "parent-join",
  limit: Number(process.env.PARENT_JOIN_RATE_LIMIT) || 10,
  windowSeconds: 900,
}
const JOIN_SCHOOL_LIMIT = {
  bucket: "parent-join-school",
  limit: 300,
  windowSeconds: 3600,
}

export type ParentLinkFailure = {
  ok: false
  code: ParentLinkError["code"] | "RATE_LIMITED" | "UNAVAILABLE"
  message: string
}
export type ParentLinkResult<T = object> =
  ({ ok: true } & T) | ParentLinkFailure

async function toResult<T extends object>(
  action: () => Promise<T>
): Promise<ParentLinkResult<T>> {
  try {
    return { ok: true, ...(await action()) }
  } catch (error) {
    if (error instanceof ParentLinkError) {
      return { ok: false, code: error.code, message: error.message }
    }
    if (error instanceof RateLimitError) {
      return { ok: false, code: "RATE_LIMITED", message: error.message }
    }
    throw error
  }
}

// ---------------------------------------------------------------------------
// Admin sekolah
// ---------------------------------------------------------------------------

/** Semester aktif + rombelnya, untuk memilih rombel di /orang-tua. */
export const getParentBoardFn = createServerFn({ method: "GET" })
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

export const listClassroomLinksFn = createServerFn({ method: "POST" })
  .middleware([schoolAdminMiddleware])
  .validator((data: unknown) => classroomIdSchema.parse(data))
  .handler(({ data, context }) =>
    toResult(async () => ({
      students: await listClassroomLinks(context.schoolId, data.classroomId),
    }))
  )

export const createInviteFn = createServerFn({ method: "POST" })
  .middleware([schoolAdminMiddleware])
  .validator((data: unknown) => studentIdSchema.parse(data))
  .handler(({ data, context }) =>
    toResult(async () => ({
      invite: await createInvite(context.schoolId, data.studentId),
    }))
  )

export const createClassroomInvitesFn = createServerFn({ method: "POST" })
  .middleware([schoolAdminMiddleware])
  .validator((data: unknown) => classroomIdSchema.parse(data))
  .handler(({ data, context }) =>
    toResult(() =>
      createInvitesForClassroom(context.schoolId, data.classroomId)
    )
  )

export const revokeLinkFn = createServerFn({ method: "POST" })
  .middleware([schoolAdminMiddleware])
  .validator((data: unknown) => linkIdSchema.parse(data))
  .handler(({ data, context }) =>
    toResult(async () => {
      await revokeLink(context.schoolId, context.actor, data.linkId)
      return {}
    })
  )

// ---------------------------------------------------------------------------
// Orang tua (publik: /gabung)
// ---------------------------------------------------------------------------

type SchoolContext = { id: string; status: string }

async function consumeJoinLimits(schoolId: string) {
  await consumeRateLimit(JOIN_IP_LIMIT, clientAddress(getRequestHeaders()))
  await consumeRateLimit(JOIN_SCHOOL_LIMIT, schoolId)
}

function joinableSchool(
  school: SchoolContext | null
): SchoolContext | ParentLinkFailure {
  if (
    !school ||
    isSchoolBlocked(school.status) ||
    school.status === "readonly"
  ) {
    return {
      ok: false,
      code: "UNAVAILABLE",
      message:
        "Sekolah ini tidak dapat menerima pendaftaran orang tua saat ini.",
    }
  }
  return school
}

async function join(
  school: SchoolContext | null,
  code: string,
  identity: () => Promise<JoinIdentity>
) {
  const target = joinableSchool(school)
  if ("ok" in target) return target

  return toResult(async () => {
    await consumeJoinLimits(target.id)
    const result = await redeemInvite(target.id, code, await identity())
    return { studentName: result.studentName }
  })
}

export const joinWithNewAccountFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => joinNewSchema.parse(data))
  .handler(({ data, context }) =>
    join(context.tenant.school, data.code, () =>
      Promise.resolve({
        kind: "new",
        name: data.name,
        email: data.email,
        password: data.password,
      })
    )
  )

export const joinWithSessionFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => joinExistingSchema.parse(data))
  .handler(({ data, context }) =>
    join(context.tenant.school, data.code, async () => {
      const session = await auth.api.getSession({
        headers: getRequestHeaders(),
      })
      if (!session) throw new Response("Belum login", { status: 401 })
      return { kind: "existing", userId: session.user.id }
    })
  )

/** Anak yang tertaut ke akun yang sedang login (hanya peran parent). */
export const listMyChildrenFn = createServerFn({ method: "GET" })
  .middleware([schoolParentMiddleware])
  .handler(({ context }) => listChildren(context.schoolId, context.userId))
