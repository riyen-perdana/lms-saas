// Server function log audit (US-04): Zod -> izin admin sekolah -> service.

import { createServerFn } from "@tanstack/react-start"

import { listAuditSchema } from "@/features/audit/schema"
import { listAuditLogs } from "@/features/audit/service"
import { schoolAdminMiddleware } from "@/features/auth/server/school-admin"

export const listAuditLogsFn = createServerFn({ method: "POST" })
  .middleware([schoolAdminMiddleware])
  .validator((data: unknown) => listAuditSchema.parse(data))
  .handler(({ data, context }) => listAuditLogs(context.schoolId, data))
