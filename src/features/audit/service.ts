// Log audit (US-04). `recordAudit` dipanggil service di DALAM transaksi aksinya
// (tenantDb/platformDb): aksi gagal -> log tidak ada; log gagal -> aksi batal.
// Tabel hanya bisa ditambah (hak UPDATE/DELETE dicabut di migrasi).

import type { PlatformDb } from "@/db/platform"
import { tenantDb, type TenantDb } from "@/db/tenant"
import type { Prisma } from "@/generated/prisma/client"

import {
  AUDIT_PAGE_SIZE,
  type AuditAction,
  type ListAuditInput,
} from "./schema"

export type AuditActorRole =
  "platform_admin" | "school_admin" | "teacher" | "student" | "parent"

export interface AuditActor {
  userId: string
  role: AuditActorRole
}

export interface AuditEntry {
  action: AuditAction
  entity: string
  entityId?: string
  /** Hanya field relevan; jangan memasukkan sandi, hash, atau kode undangan. */
  before?: Prisma.InputJsonValue
  after?: Prisma.InputJsonValue
}

export async function recordAudit(
  db: TenantDb | PlatformDb,
  schoolId: string,
  actor: AuditActor,
  entry: AuditEntry
): Promise<void> {
  // Kedua jenis client adalah client transaksi Prisma; tenantDb mengunci
  // schoolId lagi lewat extension, platformDb memakai schoolId eksplisit.
  const client = db as PlatformDb
  const user = await client.user.findUnique({
    where: { id: actor.userId },
    select: { name: true },
  })

  await client.auditLog.create({
    data: {
      schoolId,
      actorUserId: actor.userId,
      actorName: user?.name ?? "Tidak diketahui",
      actorRole: actor.role,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId ?? null,
      before: entry.before,
      after: entry.after,
    },
  })
}

export interface AuditRow {
  id: string
  actorName: string
  actorRole: string
  action: string
  entity: string
  entityId: string | null
  /** JSON sebagai teks supaya aman diserialisasi ke klien. */
  before: string | null
  after: string | null
  createdAt: Date
}

export async function listAuditLogs(
  schoolId: string,
  input: ListAuditInput = {}
): Promise<{ rows: AuditRow[]; nextCursor: string | null }> {
  const rows = await tenantDb(schoolId, (db) =>
    db.auditLog.findMany({
      where: {
        ...(input.action ? { action: input.action } : {}),
        // uuid v7 berurutan menurut waktu, jadi id cukup sebagai kursor.
        ...(input.cursor ? { id: { lt: input.cursor } } : {}),
      },
      orderBy: { id: "desc" },
      take: AUDIT_PAGE_SIZE + 1,
      select: {
        id: true,
        actorName: true,
        actorRole: true,
        action: true,
        entity: true,
        entityId: true,
        before: true,
        after: true,
        createdAt: true,
      },
    })
  )

  const page = rows.slice(0, AUDIT_PAGE_SIZE)
  const text = (value: unknown) =>
    value === null ? null : JSON.stringify(value, null, 2)
  return {
    rows: page.map((row) => ({
      ...row,
      before: text(row.before),
      after: text(row.after),
    })),
    nextCursor: rows.length > AUDIT_PAGE_SIZE ? (page.at(-1)?.id ?? null) : null,
  }
}
