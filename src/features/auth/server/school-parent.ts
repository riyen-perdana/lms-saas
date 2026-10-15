// Penjaga orang tua untuk server function (US-03). Sekolah mode hanya-baca
// tetap boleh: fungsi orang tua tidak menulis data sekolah.

import { createMiddleware } from "@tanstack/react-start"
import { getRequestHeaders } from "@tanstack/react-start/server"

import { authorizeHeaders } from "@/features/auth/server/authorize-request"

export const schoolParentMiddleware = createMiddleware({
  type: "function",
}).server(async ({ next }) => {
  const access = await authorizeHeaders(getRequestHeaders(), {
    roles: ["parent"],
    allowReadonly: true,
  })
  return next({
    context: { schoolId: access.schoolId, userId: access.userId },
  })
})
