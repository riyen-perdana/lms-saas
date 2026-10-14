// Layanan Super Admin: daftar sekolah, ringkasan, aktivasi paket manual
// (AGENTS.md aturan 10), dan penangguhan.
// ---------------------------------------------------------------------------
// Service ini TIDAK memeriksa siapa pemanggilnya — pemeriksaan
// platform_admins dilakukan server function (server/guard.ts) sebelum
// memanggil sini. Akses lintas sekolah selalu lewat platformDb().

import { prisma } from "@/db/client"
import { platformDb } from "@/db/platform"
import {
  PAGE_SIZE,
  type ActivatePlanInput,
  type ListSchoolsInput,
  type SchoolStatus,
} from "@/features/platform/schema"
import { TRIAL_PLAN_CODE } from "@/features/subscription/trial"
import type { $Enums, Prisma } from "@/generated/prisma/client"
import { addDaysUtc, addMonthsUtc } from "@/lib/dates"

export type PlatformErrorCode =
  "SCHOOL_NOT_FOUND" | "PLAN_NOT_FOUND" | "TRIAL_PLAN_NOT_ACTIVATABLE"

const MESSAGES: Record<PlatformErrorCode, string> = {
  SCHOOL_NOT_FOUND: "Sekolah tidak ditemukan.",
  PLAN_NOT_FOUND: "Paket tidak ditemukan.",
  TRIAL_PLAN_NOT_ACTIVATABLE:
    "Paket uji coba tidak dapat diaktifkan manual. Pilih paket berbayar.",
}

export class PlatformError extends Error {
  constructor(readonly code: PlatformErrorCode) {
    super(MESSAGES[code])
    this.name = "PlatformError"
  }
}

export async function isPlatformAdmin(userId: string): Promise<boolean> {
  const admin = await prisma.platformAdmin.findUnique({
    where: { userId },
    select: { id: true },
  })

  return admin !== null
}

export interface CurrentSubscription {
  status: $Enums.SubscriptionStatus
  planCode: string
  planName: string
  periodEnd: Date
}

export interface SchoolRow {
  id: string
  slug: string
  name: string
  npsn: string | null
  level: $Enums.SchoolLevel
  status: SchoolStatus
  createdAt: Date
  subscription: CurrentSubscription | null
}

const CURRENT_SUBSCRIPTION = {
  where: { status: { in: ["trial", "active"] } },
  orderBy: { createdAt: "desc" },
  take: 1,
  select: {
    status: true,
    periodEnd: true,
    plan: { select: { code: true, name: true } },
  },
} satisfies Prisma.School$subscriptionsArgs

type SchoolWithSubscription = {
  id: string
  slug: string
  name: string
  npsn: string | null
  level: $Enums.SchoolLevel
  status: $Enums.SchoolStatus
  createdAt: Date
  subscriptions: {
    status: $Enums.SubscriptionStatus
    periodEnd: Date
    plan: { code: string; name: string }
  }[]
}

function toRow(school: SchoolWithSubscription): SchoolRow {
  const current = school.subscriptions.at(0)

  return {
    id: school.id,
    slug: school.slug,
    name: school.name,
    npsn: school.npsn,
    level: school.level,
    status: school.status,
    createdAt: school.createdAt,
    subscription: current
      ? {
          status: current.status,
          planCode: current.plan.code,
          planName: current.plan.name,
          periodEnd: current.periodEnd,
        }
      : null,
  }
}

export async function listSchools(
  input: ListSchoolsInput
): Promise<{ items: SchoolRow[]; total: number; pageSize: number }> {
  const search = input.search?.trim()
  const where = {
    deletedAt: null,
    ...(input.status ? { status: input.status } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" as const } },
            { slug: { contains: search, mode: "insensitive" as const } },
            { npsn: { contains: search } },
          ],
        }
      : {}),
  }

  return platformDb(async (db) => {
    const [schools, total] = await Promise.all([
      db.school.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (input.page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        select: {
          id: true,
          slug: true,
          name: true,
          npsn: true,
          level: true,
          status: true,
          createdAt: true,
          subscriptions: CURRENT_SUBSCRIPTION,
        },
      }),
      db.school.count({ where }),
    ])

    return { items: schools.map(toRow), total, pageSize: PAGE_SIZE }
  })
}

export async function getSchool(schoolId: string): Promise<SchoolRow> {
  const school = await platformDb((db) =>
    db.school.findFirst({
      where: { id: schoolId, deletedAt: null },
      select: {
        id: true,
        slug: true,
        name: true,
        npsn: true,
        level: true,
        status: true,
        createdAt: true,
        subscriptions: CURRENT_SUBSCRIPTION,
      },
    })
  )
  if (!school) throw new PlatformError("SCHOOL_NOT_FOUND")

  return toRow(school)
}

export interface PlanOption {
  code: string
  name: string
  priceSemester: number
  priceYear: number
  maxStudents: number
  maxStorageGb: number
}

/** Paket berbayar yang bisa diaktifkan manual (trial tidak termasuk). */
export async function listActivatablePlans(): Promise<PlanOption[]> {
  return prisma.plan.findMany({
    where: { deletedAt: null, code: { not: TRIAL_PLAN_CODE } },
    orderBy: { priceSemester: "asc" },
    select: {
      code: true,
      name: true,
      priceSemester: true,
      priceYear: true,
      maxStudents: true,
      maxStorageGb: true,
    },
  })
}

export interface Overview {
  total: number
  byStatus: Record<SchoolStatus, number>
  expiringTrials: {
    schoolId: string
    name: string
    slug: string
    endsAt: Date
  }[]
}

const EXPIRING_WINDOW_DAYS = 7

export async function getOverview(now: Date = new Date()): Promise<Overview> {
  return platformDb(async (db) => {
    const grouped = await db.school.groupBy({
      by: ["status"],
      where: { deletedAt: null },
      _count: { _all: true },
    })

    const byStatus: Overview["byStatus"] = {
      trial: 0,
      active: 0,
      grace: 0,
      readonly: 0,
      suspended: 0,
    }
    for (const row of grouped) byStatus[row.status] = row._count._all

    const expiring = await db.subscription.findMany({
      where: {
        status: "trial",
        periodEnd: { gte: now, lte: addDaysUtc(now, EXPIRING_WINDOW_DAYS) },
        school: { deletedAt: null, status: "trial" },
      },
      orderBy: { periodEnd: "asc" },
      take: 10,
      select: {
        periodEnd: true,
        school: { select: { id: true, name: true, slug: true } },
      },
    })

    return {
      total: Object.values(byStatus).reduce((sum, count) => sum + count, 0),
      byStatus,
      expiringTrials: expiring.map((row) => ({
        schoolId: row.school.id,
        name: row.school.name,
        slug: row.school.slug,
        endsAt: row.periodEnd,
      })),
    }
  })
}

/**
 * Aktivasi paket manual: langganan trial/aktif sebelumnya dibatalkan (riwayat
 * tetap tersimpan), langganan baru dibuat, dan sekolah menjadi `active`.
 */
export async function activatePlan(
  input: ActivatePlanInput,
  now: Date = new Date()
): Promise<void> {
  if (input.planCode === TRIAL_PLAN_CODE) {
    throw new PlatformError("TRIAL_PLAN_NOT_ACTIVATABLE")
  }

  await platformDb(async (db) => {
    const school = await db.school.findFirst({
      where: { id: input.schoolId, deletedAt: null },
      select: { id: true },
    })
    if (!school) throw new PlatformError("SCHOOL_NOT_FOUND")

    const plan = await db.plan.findFirst({
      where: { code: input.planCode, deletedAt: null },
      select: { id: true },
    })
    if (!plan) throw new PlatformError("PLAN_NOT_FOUND")

    await db.subscription.updateMany({
      where: { schoolId: school.id, status: { in: ["trial", "active"] } },
      data: { status: "canceled" },
    })

    await db.subscription.create({
      data: {
        schoolId: school.id,
        planId: plan.id,
        status: "active",
        periodStart: now,
        periodEnd: addMonthsUtc(now, input.period === "year" ? 12 : 6),
      },
    })

    await db.school.update({
      where: { id: school.id },
      data: { status: "active" },
    })
  })
}

/**
 * Tangguhkan sekolah, atau aktifkan kembali. Status setelah diaktifkan
 * mengikuti langganan yang berlaku: aktif -> `active`, trial -> `trial`,
 * selain itu `readonly` (langganan sudah habis).
 */
export async function setSuspended(
  schoolId: string,
  suspended: boolean,
  now: Date = new Date()
): Promise<SchoolStatus> {
  return platformDb(async (db) => {
    const school = await db.school.findFirst({
      where: { id: schoolId, deletedAt: null },
      select: { id: true },
    })
    if (!school) throw new PlatformError("SCHOOL_NOT_FOUND")

    let status: SchoolStatus = "suspended"

    if (!suspended) {
      const current = await db.subscription.findFirst({
        where: {
          schoolId,
          status: { in: ["trial", "active"] },
          periodEnd: { gt: now },
        },
        orderBy: { createdAt: "desc" },
        select: { status: true },
      })
      status =
        current?.status === "active"
          ? "active"
          : current?.status === "trial"
            ? "trial"
            : "readonly"
    }

    await db.school.update({ where: { id: schoolId }, data: { status } })

    return status
  })
}
