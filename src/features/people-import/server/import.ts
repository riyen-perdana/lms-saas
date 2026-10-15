// Server function impor guru & siswa (OB-02): validasi Zod -> middleware izin
// -> service (AGENTS.md aturan 3). Tanpa logika bisnis di sini.

import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { schoolAdminMiddleware } from "@/features/auth/server/school-admin"
import { PeopleImportError, listImportBatches, startImport } from "@/features/people-import/service"

export type PeopleImportResult =
  | { ok: true; batchId: string }
  | { ok: false; code: PeopleImportError["code"]; message: string }

async function toResult(
  action: () => Promise<{ batchId: string }>
): Promise<PeopleImportResult> {
  try {
    const { batchId } = await action()
    return { ok: true, batchId }
  } catch (error) {
    if (error instanceof PeopleImportError) {
      return { ok: false, code: error.code, message: error.message }
    }
    throw error
  }
}

const kindSchema = z.enum(["teachers", "students"])

/**
 * Unggahan dikirim sebagai FormData (satu berkas, bukan JSON). Batas ukuran
 * divalidasi lagi di service supaya tidak hanya bergantung pada browser.
 */
export const uploadImportFileFn = createServerFn({ method: "POST" })
  .middleware([schoolAdminMiddleware])
  .validator((data: unknown) => {
    if (!(data instanceof FormData)) throw new Error("Data harus FormData")
    const file = data.get("berkas")
    if (!(file instanceof File)) throw new Error("Berkas Excel wajib dipilih")
    const kind = kindSchema.parse(data.get("jenis"))
    return { kind, file }
  })
  .handler(async ({ data, context }) => {
    const body = Buffer.from(await data.file.arrayBuffer())
    return toResult(() =>
      startImport(context.schoolId, context.adminUserId, {
        kind: data.kind,
        fileName: data.file.name,
        body,
        contentType: data.file.type,
      })
    )
  })

export const listImportBatchesFn = createServerFn({ method: "GET" })
  .middleware([schoolAdminMiddleware])
  .handler(({ context }) => listImportBatches(context.schoolId))