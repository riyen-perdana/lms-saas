# US-02 Admin Reset Sandi Guru (/pengguna) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admin sekolah dapat melihat daftar guru/siswa di `/pengguna` dan memicu email tautan "atur sandi" untuk seorang guru, tercatat di log audit.

**Architecture:** Modul baru `src/features/user-management` (service, schema, server function, komponen) tanpa migrasi. Service membaca/menulis lewat `tenantDb`, mencatat audit di dalam transaksi, lalu setelah commit memanggil `auth.api.requestPasswordReset` (alur sama dengan impor OB-02). Siswa tampil tetapi reset dinonaktifkan sampai US-01 (login NIS+PIN).

**Tech Stack:** TanStack Start (server function + route), Prisma via `tenantDb`, Better Auth, Zod, Vitest, Playwright, shadcn/Base UI.

Spec: `docs/superpowers/specs/2026-10-15-us-02-admin-reset-password-design.md`

## Global Constraints

- Semua akses model tenant lewat `tenantDb(schoolId)`; jangan `prisma` langsung untuk `teachers`/`students` (AGENTS.md aturan 1).
- Server function: validasi Zod -> `schoolAdminMiddleware` -> service; tanpa logika bisnis (aturan 3).
- Service baru wajib punya test, termasuk isolasi antar sekolah (aturan 4).
- Tanpa migrasi baru dan tanpa dependency baru (aturan 5, 7).
- Teks UI berbahasa Indonesia; waktu UTC (aturan 6).
- Hanya kode kebutuhan US-02; jangan menyentuh modul lain selain yang disebut (aturan 9).
- Selesai = `pnpm typecheck`, `pnpm lint`, `pnpm test` hijau (aturan 8); E2E juga hijau.
- Windows/CRLF: edit lewat tool Edit/Write. Query di dalam satu `tenantDb` ditulis berurutan, bukan `Promise.all`.
- Audit: `recordAudit` dipanggil DI DALAM transaksi; entri tanpa email, tautan, atau token.
- Siswa memakai email palsu `<nis>@<slug>.invalid`; jangan tampilkan sebagai email di UI.

---

### Task 1: Helper `schoolHost` bersama

`schoolHost` sekarang privat di `people-import/service.ts`. US-02 butuh logika yang sama, jadi dipindah ke `src/lib/tenant/host.ts`.

**Files:**
- Modify: `src/lib/tenant/host.ts` (tambah ekspor di akhir file)
- Modify: `src/lib/tenant/host.test.ts` (tambah test)
- Modify: `src/features/people-import/service.ts:209-212` (hapus fungsi lokal, impor dari host.ts)

**Interfaces:**
- Produces: `schoolHost(slug: string): string` — `"<slug>.<APP_DOMAIN>"` bila `APP_DOMAIN` diisi, selain itu `"<slug>.localhost:3000"`.

- [ ] **Step 1: Tulis test yang gagal**

Tambahkan di akhir `src/lib/tenant/host.test.ts` (pastikan `afterEach`, `describe`, `expect`, `it` sudah diimpor dari vitest di file itu; tambahkan `schoolHost` ke impor dari `./host`):

```ts
describe("schoolHost", () => {
  const original = process.env.APP_DOMAIN
  afterEach(() => {
    if (original === undefined) delete process.env.APP_DOMAIN
    else process.env.APP_DOMAIN = original
  })

  it("memakai localhost:3000 bila APP_DOMAIN kosong", () => {
    delete process.env.APP_DOMAIN
    expect(schoolHost("man3pku")).toBe("man3pku.localhost:3000")
  })

  it("memakai APP_DOMAIN bila diisi", () => {
    process.env.APP_DOMAIN = "edusaas.id"
    expect(schoolHost("man3pku")).toBe("man3pku.edusaas.id")
  })
})
```

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `pnpm vitest run src/lib/tenant/host.test.ts`
Expected: FAIL (`schoolHost` is not exported / not a function).

- [ ] **Step 3: Implementasi**

Tambahkan di akhir `src/lib/tenant/host.ts`:

```ts
/** Host publik sebuah sekolah, dipakai untuk membangun tautan di email. */
export function schoolHost(slug: string): string {
  const domain = process.env.APP_DOMAIN
  return domain ? `${slug}.${domain}` : `${slug}.localhost:3000`
}
```

Di `src/features/people-import/service.ts`: hapus fungsi `schoolHost` lokal (baris 209-212) dan tambahkan impor `import { schoolHost } from "@/lib/tenant/host"` bersama impor `@/lib/...` lain.

- [ ] **Step 4: Jalankan test terkait**

Run: `pnpm vitest run src/lib/tenant/host.test.ts src/features/people-import`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/tenant/host.ts src/lib/tenant/host.test.ts src/features/people-import/service.ts
git commit -m "refactor: pindahkan schoolHost ke lib/tenant/host

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Aksi audit, skema, dan service user-management

**Files:**
- Modify: `src/features/audit/schema.ts` (tambah satu aksi)
- Create: `src/features/user-management/schema.ts`
- Create: `src/features/user-management/service.ts`
- Test: `src/features/user-management/service.test.ts`

**Interfaces:**
- Consumes: `tenantDb(schoolId, cb)` dari `@/db/tenant`; `recordAudit(db, schoolId, actor, entry)` dan tipe `AuditActor` dari `@/features/audit/service`; `schoolHost` (Task 1); `auth` dari `@/lib/auth`; `prisma` dari `@/db/client` (hanya untuk membaca `slug` sekolah, tabel global seperti di people-import).
- Produces (dipakai Task 3 dan 4):
  - `schema.ts`: `PEOPLE_LIMIT = 100`; `listPeopleSchema` (`{ role: "all"|"teacher"|"student" = "all", q: string = "" }`); `teacherIdSchema` (`{ teacherId: uuid }`); tipe `ListPeopleInput = z.input<typeof listPeopleSchema>`.
  - `service.ts`: `PersonRow = { id: string; role: "teacher"|"student"; name: string; identifier: string; email: string | null }`; `PeopleList = { rows: PersonRow[]; truncated: boolean }`; `listPeople(schoolId, input?: ListPeopleInput): Promise<PeopleList>`; `UserManagementError` dengan `code: "NOT_FOUND" | "EMAIL_FAILED"`; `requestTeacherPasswordReset(schoolId, actor: AuditActor, teacherId): Promise<void>`.

- [ ] **Step 1: Tambah aksi audit**

Di `src/features/audit/schema.ts`, tambahkan setelah `"homeroom.clear"`:

```ts
  "user.password_reset": "Permintaan reset sandi pengguna",
```

- [ ] **Step 2: Tulis skema**

Buat `src/features/user-management/schema.ts`:

```ts
// Skema masukan manajemen pengguna (US-02). Dipakai klien lalu server, jadi
// harus idempoten (parse dua kali menghasilkan nilai yang sama).

import { z } from "zod"

export const PEOPLE_LIMIT = 100

export const listPeopleSchema = z.object({
  role: z.enum(["all", "teacher", "student"]).default("all"),
  q: z.string().trim().max(100).default(""),
})

export type ListPeopleInput = z.input<typeof listPeopleSchema>

export const teacherIdSchema = z.object({ teacherId: z.uuid() })
```

- [ ] **Step 3: Tulis test yang gagal**

Buat `src/features/user-management/service.test.ts`:

```ts
// @vitest-environment node
// Test integrasi manajemen pengguna (US-02) + isolasi antar sekolah.
//
// Fixture dibuat lewat `admin` (DATABASE_URL, superuser); aturan bisnis diuji
// lewat service (DATABASE_APP_URL, kena RLS).

import { randomUUID } from "node:crypto"

import { PrismaPg } from "@prisma/adapter-pg"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import { PrismaClient } from "@/generated/prisma/client"
import { clearMemoryOutbox, getMemoryOutbox } from "@/lib/email"

import {
  UserManagementError,
  listPeople,
  requestTeacherPasswordReset,
} from "./service"

const adminUrl = process.env.DATABASE_URL
if (!adminUrl)
  throw new Error("DATABASE_URL belum diisi; test integrasi butuh .env")

const admin = new PrismaClient({
  adapter: new PrismaPg({ connectionString: adminUrl }),
})
const suffix = randomUUID().slice(0, 8)

let schoolAId: string
let schoolBId: string
let slugA: string
let actor: { userId: string; role: "school_admin" }
let guruA: string
let guruAEmail: string
let guruB: string
let guruHapus: string

async function createTeacher(
  schoolId: string,
  code: string,
  name: string,
  opts: { deleted?: boolean } = {}
) {
  const email = `guru-${code}-${suffix}@sekolah.test`
  const user = await admin.user.create({
    data: { email, name, emailVerified: true },
  })
  const teacher = await admin.teacher.create({
    data: {
      schoolId,
      userId: user.id,
      code,
      deletedAt: opts.deleted ? new Date() : null,
    },
  })
  return { id: teacher.id, email }
}

async function createStudent(schoolId: string, nis: string, name: string) {
  const user = await admin.user.create({
    data: {
      email: `${nis}-${suffix}@sekolah.invalid`,
      name,
      emailVerified: true,
    },
  })
  return (await admin.student.create({ data: { schoolId, userId: user.id, nis } }))
    .id
}

/** Email dikirim lewat antrean tanpa di-await, jadi tunggu sampai tiba. */
async function waitForEmail(to: string) {
  for (let i = 0; i < 50; i++) {
    const found = getMemoryOutbox().find((message) => message.to === to)
    if (found) return found
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  throw new Error(`Email untuk ${to} tidak tiba`)
}

beforeAll(async () => {
  slugA = `um-a-${suffix}`
  const [a, b] = await Promise.all([
    admin.school.create({
      data: { slug: slugA, name: "SMA Uji A", level: "SMA" },
    }),
    admin.school.create({
      data: { slug: `um-b-${suffix}`, name: "SMA Uji B", level: "SMA" },
    }),
  ])
  schoolAId = a.id
  schoolBId = b.id

  const adminUser = await admin.user.create({
    data: {
      email: `admin-${suffix}@sekolah.test`,
      name: "Admin Uji",
      emailVerified: true,
    },
  })
  actor = { userId: adminUser.id, role: "school_admin" }

  const gA = await createTeacher(schoolAId, "GRU-A1", "Ani Guru")
  guruA = gA.id
  guruAEmail = gA.email
  await createTeacher(schoolAId, "GRU-A2", "Budi Guru")
  guruHapus = (
    await createTeacher(schoolAId, "GRU-A3", "Citra Dihapus", { deleted: true })
  ).id
  await createStudent(schoolAId, "7001", "Dina Siswa")
  guruB = (await createTeacher(schoolBId, "GRU-B1", "Eko Sekolah B")).id
  await createStudent(schoolBId, "7002", "Fani Sekolah B")
})

beforeEach(() => clearMemoryOutbox())

afterAll(async () => {
  await admin.school.deleteMany({ where: { id: { in: [schoolAId, schoolBId] } } })
  await admin.user.deleteMany({
    where: {
      OR: [
        { email: { endsWith: `-${suffix}@sekolah.test` } },
        { email: { endsWith: `-${suffix}@sekolah.invalid` } },
      ],
    },
  })
  await admin.$disconnect()
})

describe("listPeople", () => {
  it("hanya berisi guru dan siswa sekolah itu (isolasi), tanpa yang dihapus", async () => {
    const { rows, truncated } = await listPeople(schoolAId)
    expect(rows.map((row) => row.name)).toEqual([
      "Ani Guru",
      "Budi Guru",
      "Dina Siswa",
    ])
    expect(truncated).toBe(false)
  })

  it("siswa memakai NIS sebagai pengenal dan tanpa email (email palsu disembunyikan)", async () => {
    const { rows } = await listPeople(schoolAId, { role: "student" })
    expect(rows).toEqual([
      expect.objectContaining({
        role: "student",
        identifier: "7001",
        email: null,
      }),
    ])
  })

  it("guru memakai kode sebagai pengenal dan menampilkan email", async () => {
    const { rows } = await listPeople(schoolAId, { role: "teacher" })
    expect(rows[0]).toEqual(
      expect.objectContaining({
        role: "teacher",
        identifier: "GRU-A1",
        email: guruAEmail,
      })
    )
  })

  it("mencari berdasarkan nama atau kode, tanpa peduli huruf besar/kecil", async () => {
    const byName = await listPeople(schoolAId, { q: "budi" })
    expect(byName.rows.map((row) => row.name)).toEqual(["Budi Guru"])

    const byCode = await listPeople(schoolAId, { q: "gru-a1" })
    expect(byCode.rows.map((row) => row.name)).toEqual(["Ani Guru"])

    const byNis = await listPeople(schoolAId, { q: "7001" })
    expect(byNis.rows.map((row) => row.name)).toEqual(["Dina Siswa"])
  })

  it("pencarian tidak menembus sekolah lain", async () => {
    const { rows } = await listPeople(schoolAId, { q: "Sekolah B" })
    expect(rows).toEqual([])
  })
})

describe("requestTeacherPasswordReset", () => {
  it("mengirim email tautan ke host sekolah dan mencatat audit tanpa data sensitif", async () => {
    await requestTeacherPasswordReset(schoolAId, actor, guruA)

    const message = await waitForEmail(guruAEmail)
    expect(message.subject).toContain("Atur ulang")
    expect(message.text).toContain(`${slugA}.localhost:3000`)

    const logs = await admin.auditLog.findMany({
      where: { schoolId: schoolAId, action: "user.password_reset" },
    })
    expect(logs).toHaveLength(1)
    expect(logs[0]).toMatchObject({
      actorUserId: actor.userId,
      entity: "teacher",
      entityId: guruA,
    })
    expect(JSON.stringify(logs[0])).not.toContain(guruAEmail)
    expect(JSON.stringify(logs[0])).not.toContain("reset-password")
  })

  it("guru sekolah lain -> NOT_FOUND, tanpa email dan tanpa audit", async () => {
    await expect(
      requestTeacherPasswordReset(schoolAId, actor, guruB)
    ).rejects.toMatchObject({ code: "NOT_FOUND" })

    await new Promise((resolve) => setTimeout(resolve, 150))
    expect(getMemoryOutbox()).toHaveLength(0)
    expect(
      await admin.auditLog.count({
        where: { schoolId: schoolAId, entityId: guruB },
      })
    ).toBe(0)
  })

  it("id tidak dikenal dan guru yang sudah dihapus -> NOT_FOUND", async () => {
    await expect(
      requestTeacherPasswordReset(schoolAId, actor, randomUUID())
    ).rejects.toBeInstanceOf(UserManagementError)
    await expect(
      requestTeacherPasswordReset(schoolAId, actor, guruHapus)
    ).rejects.toMatchObject({ code: "NOT_FOUND" })
  })
})
```

- [ ] **Step 4: Jalankan, pastikan gagal**

Run: `pnpm vitest run src/features/user-management`
Expected: FAIL (modul `./service` belum ada).

- [ ] **Step 5: Implementasi service**

Buat `src/features/user-management/service.ts`:

```ts
// Manajemen pengguna oleh admin sekolah (US-02).
// ---------------------------------------------------------------------------
//   - `teachers`/`students` model tenant -> selalu lewat tenantDb(schoolId).
//     `users` dan `schools.slug` tabel global -> `prisma`.
//   - Reset sandi guru = email tautan "atur sandi" (Better Auth), alur yang
//     sama dengan impor OB-02. Admin tidak pernah melihat sandi.
//   - Audit dicatat di DALAM transaksi; email dikirim setelah commit.
//   - Siswa login lewat NIS + PIN (US-01); reset PIN dikerjakan di sana.

import { prisma } from "@/db/client"
import { tenantDb } from "@/db/tenant"
import { recordAudit, type AuditActor } from "@/features/audit/service"
import { auth } from "@/lib/auth"
import { schoolHost } from "@/lib/tenant/host"

import {
  PEOPLE_LIMIT,
  listPeopleSchema,
  type ListPeopleInput,
} from "./schema"

export type UserManagementErrorCode = "NOT_FOUND" | "EMAIL_FAILED"

export class UserManagementError extends Error {
  constructor(
    readonly code: UserManagementErrorCode,
    message: string
  ) {
    super(message)
    this.name = "UserManagementError"
  }
}

export interface PersonRow {
  id: string
  role: "teacher" | "student"
  name: string
  /** Kode guru atau NIS. */
  identifier: string
  /** Email nyata; null untuk siswa (emailnya palsu `.invalid`). */
  email: string | null
}

export interface PeopleList {
  rows: PersonRow[]
  /** True bila ada lebih dari PEOPLE_LIMIT hasil; persempit pencarian. */
  truncated: boolean
}

export async function listPeople(
  schoolId: string,
  input: ListPeopleInput = {}
): Promise<PeopleList> {
  const { role, q } = listPeopleSchema.parse(input)
  const take = PEOPLE_LIMIT + 1
  const like = { contains: q, mode: "insensitive" as const }

  const rows = await tenantDb(schoolId, async (db) => {
    const teachers =
      role === "student"
        ? []
        : await db.teacher.findMany({
            where: {
              deletedAt: null,
              ...(q
                ? {
                    OR: [
                      { code: like },
                      { user: { name: like } },
                      { user: { email: like } },
                    ],
                  }
                : {}),
            },
            orderBy: { user: { name: "asc" } },
            take,
            select: {
              id: true,
              code: true,
              user: { select: { name: true, email: true } },
            },
          })

    const students =
      role === "teacher"
        ? []
        : await db.student.findMany({
            where: {
              deletedAt: null,
              ...(q ? { OR: [{ nis: like }, { user: { name: like } }] } : {}),
            },
            orderBy: { user: { name: "asc" } },
            take,
            select: { id: true, nis: true, user: { select: { name: true } } },
          })

    return [
      ...teachers.map(
        (teacher): PersonRow => ({
          id: teacher.id,
          role: "teacher",
          name: teacher.user.name,
          identifier: teacher.code,
          email: teacher.user.email,
        })
      ),
      ...students.map(
        (student): PersonRow => ({
          id: student.id,
          role: "student",
          name: student.user.name,
          identifier: student.nis,
          email: null,
        })
      ),
    ]
  })

  rows.sort((a, b) => a.name.localeCompare(b.name, "id"))
  return { rows: rows.slice(0, PEOPLE_LIMIT), truncated: rows.length > PEOPLE_LIMIT }
}

const NOT_FOUND_MESSAGE = "Guru tidak ditemukan."

/**
 * Mengirim email tautan atur sandi ke seorang guru. Guru sekolah lain, id
 * tak dikenal, dan guru yang sudah dihapus semuanya NOT_FOUND (tidak
 * membocorkan keberadaan lintas sekolah).
 */
export async function requestTeacherPasswordReset(
  schoolId: string,
  actor: AuditActor,
  teacherId: string
): Promise<void> {
  const email = await tenantDb(schoolId, async (db) => {
    const teacher = await db.teacher.findFirst({
      where: { id: teacherId, deletedAt: null },
      select: { code: true, user: { select: { email: true } } },
    })
    if (!teacher) throw new UserManagementError("NOT_FOUND", NOT_FOUND_MESSAGE)

    await recordAudit(db, schoolId, actor, {
      action: "user.password_reset",
      entity: "teacher",
      entityId: teacherId,
      after: { code: teacher.code },
    })
    return teacher.user.email
  })

  const school = await prisma.school.findFirst({
    where: { id: schoolId, deletedAt: null },
    select: { slug: true },
  })
  if (!school) throw new UserManagementError("NOT_FOUND", NOT_FOUND_MESSAGE)

  const protocol = process.env.NODE_ENV === "production" ? "https" : "http"
  const host = schoolHost(school.slug)

  try {
    await auth.api.requestPasswordReset({
      body: { email, redirectTo: `${protocol}://${host}/atur-ulang-sandi` },
      headers: new Headers({ host }),
    })
  } catch (error) {
    console.error("[user-management] email reset sandi guru gagal:", error)
    throw new UserManagementError(
      "EMAIL_FAILED",
      "Email gagal dikirim, coba lagi."
    )
  }
}
```

- [ ] **Step 6: Jalankan test, pastikan lulus**

Run: `pnpm vitest run src/features/user-management src/features/audit`
Expected: PASS. Jika `localeCompare` urutan nama berbeda dari harapan di test pertama, urutan yang benar adalah "Ani Guru", "Budi Guru", "Dina Siswa" (alfabet).

- [ ] **Step 7: Typecheck dan commit**

Run: `pnpm typecheck`
Expected: tanpa error.

```bash
git add src/features/audit/schema.ts src/features/user-management
git commit -m "feat(user-management): daftar pengguna dan reset sandi guru (US-02)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Server function

**Files:**
- Create: `src/features/user-management/server/people.ts`

**Interfaces:**
- Consumes: `listPeople`, `requestTeacherPasswordReset`, `UserManagementError`, `PeopleList` (Task 2); `listPeopleSchema`, `teacherIdSchema` (Task 2); `schoolAdminMiddleware` (`context.schoolId`, `context.actor`).
- Produces (dipakai Task 4):
  - `listPeopleFn({ data: ListPeopleInput }): Promise<PeopleList>`
  - `requestTeacherResetFn({ data: { teacherId: string } }): Promise<{ ok: true } | { ok: false; code: "NOT_FOUND" | "EMAIL_FAILED"; message: string }>`

- [ ] **Step 1: Tulis server function**

Buat `src/features/user-management/server/people.ts`:

```ts
// Server function manajemen pengguna (US-02): validasi Zod -> izin -> service
// (AGENTS.md aturan 3). Hanya admin sekolah.

import { createServerFn } from "@tanstack/react-start"

import { schoolAdminMiddleware } from "@/features/auth/server/school-admin"
import {
  listPeopleSchema,
  teacherIdSchema,
} from "@/features/user-management/schema"
import {
  UserManagementError,
  listPeople,
  requestTeacherPasswordReset,
} from "@/features/user-management/service"

export type ResetResult =
  | { ok: true }
  | { ok: false; code: UserManagementError["code"]; message: string }

export const listPeopleFn = createServerFn({ method: "POST" })
  .middleware([schoolAdminMiddleware])
  .validator((data: unknown) => listPeopleSchema.parse(data))
  .handler(({ data, context }) => listPeople(context.schoolId, data))

export const requestTeacherResetFn = createServerFn({ method: "POST" })
  .middleware([schoolAdminMiddleware])
  .validator((data: unknown) => teacherIdSchema.parse(data))
  .handler(async ({ data, context }): Promise<ResetResult> => {
    try {
      await requestTeacherPasswordReset(
        context.schoolId,
        context.actor,
        data.teacherId
      )
      return { ok: true }
    } catch (error) {
      if (error instanceof UserManagementError) {
        return { ok: false, code: error.code, message: error.message }
      }
      throw error
    }
  })
```

- [ ] **Step 2: Jalankan pemindai izin dan typecheck**

Run: `pnpm vitest run src/features/auth/permission-audit.test.ts; pnpm typecheck`
Expected: PASS (kedua fungsi memakai `schoolAdminMiddleware`, jadi pemindai menerimanya tanpa perubahan daftar).

- [ ] **Step 3: Commit**

```bash
git add src/features/user-management/server
git commit -m "feat(user-management): server function daftar pengguna dan reset sandi (US-02)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Halaman `/pengguna`, rute, dan menu

**Files:**
- Create: `src/features/user-management/components/people-page.tsx`
- Create: `src/routes/(school)/_app.pengguna.tsx`
- Modify: `src/components/dashboard/school-nav.ts` (path, ikon, menu)
- Modify: `src/components/dashboard/school-nav.test.ts` (daftar menu grup Data)
- Generate: `src/routeTree.gen.ts` (lihat Step 5; blok `declare module` di akhir file harus dikembalikan)

**Interfaces:**
- Consumes: `listPeopleFn`, `requestTeacherResetFn` (Task 3); `PeopleList`, `PersonRow` (Task 2); `PageHeader`, `Field`, `selectClass`, `useHydrated`, `Button`, `Input`, `Table*` dari `@/components/ui/table`.
- Produces: rute `/pengguna` (hanya `school_admin`), menu "Pengguna" di grup Data.

Konfirmasi memakai konfirmasi inline di baris (tombol "Reset sandi" -> "Kirim tautan atur sandi ke <nama>?" + "Ya, kirim" / "Batal"), bukan dialog, karena komponen dialog belum ada di `components/ui` dan tidak boleh menambah dependency/komponen baru untuk satu halaman.

- [ ] **Step 1: Ubah test menu agar gagal**

Di `src/components/dashboard/school-nav.test.ts` ubah baris grup Data pada test "admin sekolah melihat semua grup":

```ts
      ["Data", ["Pengguna", "Impor Data", "Orang Tua"]],
```

Run: `pnpm vitest run src/components/dashboard/school-nav.test.ts`
Expected: FAIL.

- [ ] **Step 2: Tambah menu**

Di `src/components/dashboard/school-nav.ts`: tambahkan `"/pengguna"` ke `SchoolPath`, impor ikon `UsersRound` dari `lucide-react` (urut alfabet dengan impor lain), dan tambahkan item pertama grup Data:

```ts
      { to: "/pengguna", label: "Pengguna", icon: UsersRound },
```

(sebelum item `/impor`). Run lagi: `pnpm vitest run src/components/dashboard/school-nav.test.ts` -> PASS.

- [ ] **Step 3: Rute**

Buat `src/routes/(school)/_app.pengguna.tsx`:

```tsx
// Daftar guru & siswa + reset sandi guru (US-02). Hanya admin sekolah.

import { createFileRoute, redirect } from "@tanstack/react-router"

import { PeoplePage } from "@/features/user-management/components/people-page"
import { listPeopleFn } from "@/features/user-management/server/people"

export const Route = createFileRoute("/(school)/_app/pengguna")({
  beforeLoad: ({ context }) => {
    if (context.role !== "school_admin") throw redirect({ to: "/beranda" })
  },
  loader: async () => ({ people: await listPeopleFn({ data: {} }) }),
  head: () => ({ meta: [{ title: "Pengguna — EduSaaS" }] }),
  component: PenggunaPage,
})

function PenggunaPage() {
  return <PeoplePage initial={Route.useLoaderData().people} />
}
```

- [ ] **Step 4: Komponen halaman**

Buat `src/features/user-management/components/people-page.tsx`. Sebelum menulis, buka `src/components/ui/table.tsx` dan `src/components/ui/input.tsx` untuk nama ekspor yang tepat, dan `src/features/parent-link/components/parent-links-page.tsx` untuk pola status/galat/`run`; ikuti pola itu.

```tsx
// Halaman admin pengguna (US-02): daftar guru & siswa, pencarian, dan reset
// sandi guru lewat email tautan "atur sandi". Siswa menunggu US-01 (NIS+PIN).

import { useState } from "react"

import {
  Field,
  selectClass,
  useHydrated,
} from "@/components/dashboard/form-field"
import { PageHeader } from "@/components/dashboard/page-header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  listPeopleFn,
  requestTeacherResetFn,
} from "@/features/user-management/server/people"
import type {
  PeopleList,
  PersonRow,
} from "@/features/user-management/service"

type Role = "all" | "teacher" | "student"

export function PeoplePage({ initial }: { initial: PeopleList }) {
  const ready = useHydrated()
  const [list, setList] = useState<PeopleList>(initial)
  const [role, setRole] = useState<Role>("all")
  const [q, setQ] = useState("")
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function search(next: { role: Role; q: string }) {
    setError(null)
    try {
      setList(await listPeopleFn({ data: next }))
    } catch {
      setError("Gagal memuat daftar. Periksa koneksi lalu coba lagi.")
    }
  }

  async function sendReset(person: PersonRow) {
    setError(null)
    setNotice(null)
    setPending(true)
    try {
      const result = await requestTeacherResetFn({
        data: { teacherId: person.id },
      })
      if (result.ok) {
        setNotice(`Tautan atur sandi dikirim ke email ${person.name}.`)
        setConfirmId(null)
      } else {
        setError(result.message)
      }
    } catch {
      setError("Gagal memproses. Periksa koneksi lalu coba lagi.")
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Pengguna"
        description="Daftar guru dan siswa sekolah ini. Reset sandi guru mengirim tautan atur sandi ke email guru; sandi tidak pernah terlihat oleh admin."
      />

      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault()
          void search({ role, q })
        }}
      >
        <div className="w-40">
          <Field id="peran" label="Peran">
            <select
              id="peran"
              className={selectClass}
              value={role}
              onChange={(event) => {
                const next = event.target.value as Role
                setRole(next)
                void search({ role: next, q })
              }}
            >
              <option value="all">Semua</option>
              <option value="teacher">Guru</option>
              <option value="student">Siswa</option>
            </select>
          </Field>
        </div>
        <div className="w-64">
          <Field id="cari" label="Cari">
            <Input
              id="cari"
              placeholder="Nama, kode guru, NIS, atau email"
              value={q}
              onChange={(event) => setQ(event.target.value)}
            />
          </Field>
        </div>
        <Button type="submit" variant="outline" disabled={!ready}>
          Cari
        </Button>
      </form>

      {notice ? (
        <p role="status" className="text-ds-body">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-ds-body text-destructive">
          {error}
        </p>
      ) : null}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nama</TableHead>
            <TableHead>Peran</TableHead>
            <TableHead>Kode / NIS</TableHead>
            <TableHead>Email</TableHead>
            <TableHead className="text-right">Aksi</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {list.rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="text-muted-foreground">
                Tidak ada pengguna yang cocok.
              </TableCell>
            </TableRow>
          ) : (
            list.rows.map((person) => (
              <TableRow key={`${person.role}-${person.id}`}>
                <TableCell>{person.name}</TableCell>
                <TableCell>{person.role === "teacher" ? "Guru" : "Siswa"}</TableCell>
                <TableCell className="font-mono">{person.identifier}</TableCell>
                <TableCell>{person.email ?? "—"}</TableCell>
                <TableCell className="text-right">
                  {person.role === "student" ? (
                    <span className="text-ds-caption text-muted-foreground">
                      Reset PIN tersedia setelah login NIS+PIN
                    </span>
                  ) : confirmId === person.id ? (
                    <span className="inline-flex flex-wrap items-center justify-end gap-2">
                      <span className="text-ds-caption">
                        Kirim tautan atur sandi ke {person.name}?
                      </span>
                      <Button
                        size="sm"
                        disabled={!ready || pending}
                        onClick={() => void sendReset(person)}
                      >
                        Ya, kirim
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pending}
                        onClick={() => setConfirmId(null)}
                      >
                        Batal
                      </Button>
                    </span>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!ready}
                      aria-label={`Reset sandi ${person.name}`}
                      onClick={() => {
                        setNotice(null)
                        setConfirmId(person.id)
                      }}
                    >
                      Reset sandi
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      {list.truncated ? (
        <p className="text-ds-meta text-muted-foreground">
          Hanya 100 pengguna pertama yang ditampilkan. Persempit pencarian.
        </p>
      ) : null}
    </div>
  )
}
```

Jika nama ekspor `Table*`, prop `size`/`variant` `Button`, atau kelas `text-ds-*` berbeda dari yang dipakai halaman lain, ikuti yang dipakai halaman lain (jangan ubah komponen `ui/`).

- [ ] **Step 5: Regenerasi route tree**

Run: `pnpm generate-routes`
Lalu buka akhir `src/routeTree.gen.ts`; jika blok `declare module '@tanstack/react-start'` (interface `Register`) hilang, kembalikan dari `git diff` / `git show HEAD:src/routeTree.gen.ts` (jebakan di docs/PROGRESS.md).

- [ ] **Step 6: Typecheck, lint, test**

Run: `pnpm typecheck; pnpm lint; pnpm vitest run src/components src/features/user-management src/features/auth`
Expected: semua hijau.

- [ ] **Step 7: Commit**

```bash
git add src/features/user-management/components "src/routes/(school)/_app.pengguna.tsx" src/components/dashboard/school-nav.ts src/components/dashboard/school-nav.test.ts src/routeTree.gen.ts
git commit -m "feat(user-management): halaman /pengguna dan menu (US-02)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Uji E2E dan PROGRESS.md

**Files:**
- Create: `tests/e2e/user-management.spec.ts`
- Modify: `docs/PROGRESS.md`

**Interfaces:**
- Consumes: halaman `/pengguna` (Task 4); pola fixture dari `tests/e2e/audit.spec.ts` (`newSchool`, `login`) dan pembacaan outbox dari `tests/e2e/email.spec.ts` (`.email-outbox/*-<email>.json`).

- [ ] **Step 1: Tulis E2E**

Buat `tests/e2e/user-management.spec.ts` dengan struktur yang sama seperti `tests/e2e/parent-link.spec.ts` (impor `dotenv/config`, `PrismaClient`/`PrismaPg`, `hashPassword`, `afterAll` yang menghapus sekolah dan user). Fixture `newSchool` membuat sekolah (`setupCompletedAt` terisi), admin sekolah (akun credential + membership `school_admin`), satu guru (`Teacher` dengan `code: "GRU-E2E"`, user `guru-<tag>@sekolah.test`) dan satu siswa (`nis: "9001"`). Salin `login` dari parent-link.spec. Isi test:

```ts
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

const OUTBOX = join(process.cwd(), ".email-outbox")

function emailFilesFor(to: string): string[] {
  if (!existsSync(OUTBOX)) return []
  const safe = to.replace(/[^a-z0-9@._-]/gi, "_")
  return readdirSync(OUTBOX)
    .filter((name) => name.endsWith(`-${safe}.json`))
    .sort()
}

async function waitForEmail(to: string) {
  const deadline = Date.now() + 25_000
  while (Date.now() < deadline) {
    const files = emailFilesFor(to)
    if (files.length > 0) {
      return JSON.parse(
        readFileSync(join(OUTBOX, files[files.length - 1]), "utf8")
      ) as { subject: string; text: string }
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error(`Email untuk ${to} tidak tiba dalam 25 detik`)
}

test("admin mereset sandi guru dari /pengguna, siswa tidak bisa direset", async ({
  page,
}, testInfo) => {
  const school = await newSchool(testInfo)
  await login(page, school.origin, school.email)

  await page.getByRole("link", { name: "Pengguna" }).first().click()
  await expect(page).toHaveURL(/\/pengguna$/)
  await expect(page.getByRole("heading", { name: "Pengguna" })).toBeVisible()

  // Siswa tampil tanpa tombol reset.
  const siswa = page.getByRole("row", { name: /Siswa Uji/ })
  await expect(siswa).toBeVisible()
  await expect(siswa.getByRole("button")).toHaveCount(0)
  await expect(siswa.getByText(/setelah login NIS\+PIN/)).toBeVisible()

  // Cari guru, reset, konfirmasi.
  await page.getByLabel("Cari").fill("GRU-E2E")
  await page.getByRole("button", { name: "Cari", exact: true }).click()
  await expect(page.getByRole("row", { name: /Guru Uji/ })).toBeVisible()
  await expect(page.getByRole("row", { name: /Siswa Uji/ })).toHaveCount(0)

  const reset = page.getByRole("button", { name: "Reset sandi Guru Uji" })
  await expect(reset).toBeEnabled()
  await reset.click()
  await page.getByRole("button", { name: "Ya, kirim" }).click()
  await expect(page.getByRole("status")).toContainText(
    "Tautan atur sandi dikirim"
  )

  const message = await waitForEmail(school.teacherEmail)
  expect(message.subject).toContain("Atur ulang")
  expect(message.text).toContain(`${school.slug}.localhost:3000`)

  // Tercatat di log audit.
  await page.getByRole("link", { name: "Audit" }).first().click()
  await expect(page.getByText("Permintaan reset sandi pengguna")).toBeVisible()
})
```

Nama tampilan: user guru bernama `Guru Uji`, siswa `Siswa Uji`; `newSchool` mengembalikan `teacherEmail` dan menambahkan semua userId/email ke daftar pembersihan.

- [ ] **Step 2: Jalankan E2E**

Matikan server dev manual di port 3000 dulu (jebakan PROGRESS.md).
Run: `pnpm test:e2e tests/e2e/user-management.spec.ts`
Expected: PASS di project desktop dan mobile-360. Jika selektor tidak cocok karena menu sidebar ganda, batasi ke `main` seperti catatan jebakan.

- [ ] **Step 3: Suite penuh**

Run: `pnpm typecheck; pnpm lint; pnpm test; pnpm test:e2e`
Expected: semua hijau (flake lama `platform/service.test.ts > getOverview` boleh diulang sekali).

- [ ] **Step 4: Perbarui PROGRESS.md**

Di `docs/PROGRESS.md`:
- Baris tanggal dan ringkasan pemeriksaan (jumlah test unit/E2E terbaru dari output Step 3).
- Status F2: tandai US-02 selesai; sisa US-01 (termasuk reset PIN siswa dari admin).
- Hapus butir "US-02: reset sandi, verifikasi email..." dari daftar F0-F1 dan pindahkan ke F2 dengan ringkasan: swalayan (lupa-sandi, atur-ulang-sandi, verifikasi email) + `/pengguna` + modul `src/features/user-management`.
- Tambah di bagian F2: "US-02 selesai: ..." (halaman `/pengguna`, `requestTeacherPasswordReset`, aksi audit `user.password_reset`, konfirmasi inline, batas 100 baris).
- Utang: perbarui butir "UI daftar/ubah/hapus data guru & siswa" (sekarang daftar baca-saja ada di `/pengguna`; ubah/hapus, paginasi, DataTable belum), tambah "Reset PIN siswa oleh admin -> US-01".
- Keputusan: `schoolHost` kini di `src/lib/tenant/host.ts`; siswa tidak menampilkan email (palsu `.invalid`).

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/user-management.spec.ts docs/PROGRESS.md
git commit -m "test(e2e): reset sandi guru dari /pengguna; docs: catat US-02 selesai

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## Self-Review

- **Cakupan spec:** halaman `/pengguna` dengan pencarian/filter (Task 2, 4); reset guru lewat email (Task 2); siswa dinonaktifkan dengan keterangan (Task 4); audit `user.password_reset` tanpa data sensitif (Task 2); isolasi sekolah dan NOT_FOUND seragam (Task 2); middleware + pemindai izin (Task 3); menu (Task 4); E2E dan PROGRESS (Task 5). Perubahan dari spec: dialog konfirmasi menjadi konfirmasi inline karena belum ada komponen dialog di `components/ui`; spec diperbarui bila perlu saat Task 5.
- **Placeholder:** tidak ada TBD; satu instruksi "ikuti pola halaman lain" di Task 4 Step 4 hanya untuk nama ekspor komponen UI yang harus dicocokkan dengan file yang ada.
- **Konsistensi tipe:** `PersonRow`, `PeopleList`, `listPeople`, `requestTeacherPasswordReset`, `UserManagementError`, `listPeopleFn`, `requestTeacherResetFn`, `ResetResult` konsisten di Task 2-4.
