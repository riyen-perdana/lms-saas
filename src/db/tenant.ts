// tenantDb(schoolId) — satu-satunya jalan masuk ke data tenant (AGENTS.md aturan 1).
// ---------------------------------------------------------------------------
// Dua lapis pertahanan, sesuai PRD §5.2:
//
//   Lapis 1 (aplikasi): setiap operasi pada model tenant di-extend sehingga
//     `schoolId` terisi otomatis pada where/create. Code tidak bisa lupa, dan
//     menuliskan schoolId sekolah lain akan ditimpa di sini.
//
//   Lapis 2 (database): RLS. Transaksi selalu diawali
//     `set_config('app.current_school_id', <schoolId>, true)` sehingga policy
//     memberships_school_isolation (dan policy model tenant berikutnya) hanya
//     memperlihatkan baris sekolah tersebut.
//
// Sifat penting: set_config memakai flag `true` (transaction-scoped) supaya
// tidak bocor ke koneksi berikutnya di pool. Efeknya, akses model tenant DI
// LUAR tenantDb() tidakerror — ia hanya melihat nol baris (gagal tertutup),
// bukan data sekolah lain.
//
// Contoh:
//   const members = await tenantDb(schoolId, (db) =>
//     db.membership.findMany({ where: { role: "teacher" } })
//   )

import { Prisma } from "@/generated/prisma/client"

import { prisma } from "@/db/client"

/**
 * Model tenant yang memakai RLS, ditulis dengan nama model di schema.prisma.
 * Wajib ditambah setiap kali ada model tenant baru — tanpa itu lapisan
 * aplikasi tidak mengunci schoolId, walaupun RLS tetap menahannya.
 */
export const TENANT_MODELS = [
  "Membership",
  "Subscription",
  "AcademicYear",
  "Semester",
  "Major",
  "Classroom",
  "Subject",
  "Teacher",
  "Student",
  "Enrollment",
  "Course",
  "ParentLink",
  "ImportBatch",
  "ImportError",
] as const

/** `Membership` -> `membership`, mengikuti aturan delegate Prisma Client. */
export function tenantDelegate(model: (typeof TENANT_MODELS)[number]) {
  return model.charAt(0).toLowerCase() + model.slice(1)
}

const READ_OPERATIONS = new Set([
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "findUnique",
  "findUniqueOrThrow",
  "count",
  "aggregate",
  "groupBy",
])

const WRITE_WITH_WHERE_OPERATIONS = new Set([
  "update",
  "updateMany",
  "upsert",
  "delete",
  "deleteMany",
])

const WRITE_WITH_DATA_OPERATIONS = new Set([
  "create",
  "createMany",
  "createManyAndReturn",
])

function isTenantModel(
  model: string | undefined
): model is (typeof TENANT_MODELS)[number] {
  return (
    model !== undefined && (TENANT_MODELS as readonly string[]).includes(model)
  )
}

type Args = Record<string, unknown>

function scopeWhere(args: Args, schoolId: string): Args {
  const where = (args.where ?? {}) as Args
  return { ...args, where: { ...where, schoolId } }
}

function scopeData(args: Args, schoolId: string): Args {
  const data = args.data
  if (Array.isArray(data)) {
    return {
      ...args,
      data: data.map((item) => ({ ...(item as Args), schoolId })),
    }
  }
  return { ...args, data: { ...(data as Args), schoolId } }
}

function scopeArgs(operation: string, args: Args, schoolId: string): Args {
  let scoped = args

  if (WRITE_WITH_DATA_OPERATIONS.has(operation)) {
    scoped = scopeData(scoped, schoolId)
  }

  if (
    READ_OPERATIONS.has(operation) ||
    WRITE_WITH_WHERE_OPERATIONS.has(operation)
  ) {
    scoped = scopeWhere(scoped, schoolId)
  }

  return scoped
}

function tenantExtension(schoolId: string) {
  return Prisma.defineExtension((client) =>
    client.$extends({
      name: "tenant-isolation",
      query: {
        $allModels: {
          async $allOperations({ model, operation, args, query }) {
            if (!isTenantModel(model)) {
              return query(args)
            }
            return query(scopeArgs(operation, args, schoolId))
          },
        },
      },
    })
  )
}

/**
 * Client yang diterima callback: client transaksi. Prisma menutupi `$extends`
 * pada client transaksi, jadi hook `query.$allOperations` dipasang pada
 * client dasar lalu transaksi dibuka dari client ter-extend tersebut — dengan
 * begitu query di dalam callback tetap satu transaksi dan RLS aktif.
 */
function createTenantScope(schoolId: string) {
  return prisma.$extends(tenantExtension(schoolId))
}

export type TenantDb = Parameters<
  Parameters<ReturnType<typeof createTenantScope>["$transaction"]>[0]
>[0]

export interface TenantDbOptions {
  /** Batas waktu transaksi (ms). Default Prisma 5 detik; naikkan hanya untuk job massal. */
  timeout?: number
}

export async function tenantDb<T>(
  schoolId: string,
  fn: (db: TenantDb) => Promise<T>,
  options: TenantDbOptions = {}
): Promise<T> {
  if (!schoolId) {
    throw new Error("tenantDb: schoolId wajib diisi")
  }

  const scoped = createTenantScope(schoolId)

  return scoped.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT set_config('app.current_school_id', ${schoolId}, true)`
    return fn(tx)
  }, options)
}
