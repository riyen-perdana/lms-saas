// Penjaga admin sekolah untuk server function (US-03): dipasang pada SETIAP
// server function yang membaca atau mengubah data master sekolah.
// Konteks: schoolId, userId, actor (untuk log audit).

import { createMiddleware } from "@tanstack/react-start"
import { getRequestHeaders } from "@tanstack/react-start/server"

import { authorizeHeaders } from "@/features/auth/server/authorize-request"

export const schoolAdminMiddleware = createMiddleware({
  type: "function",
}).server(async ({ next }) => {
  const access = await authorizeHeaders(getRequestHeaders(), {
    roles: ["school_admin"],
  })
  return next({
    context: {
      schoolId: access.schoolId,
      userId: access.userId,
      actor: { userId: access.userId, role: "school_admin" as const },
    },
  })
})
