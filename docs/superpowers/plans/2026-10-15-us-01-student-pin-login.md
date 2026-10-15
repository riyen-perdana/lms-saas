# US-01 Login Siswa NIS + PIN Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Siswa dapat login dengan NIS + PIN 6 digit; admin sekolah membuat/mereset PIN per siswa atau massal per rombel dari `/pengguna`.

**Architecture:** Tabel tenant `student_pins` (hash PIN, RLS). Logika login ada di `features/student-pin/login.ts` (batas laju berlapis hanya-kegagalan + verifikasi), dipasang ke Better Auth sebagai plugin tipis `student-pin` yang membuat sesi lewat `internalAdapter.createSession` + `setSessionCookie`. Siswa tidak punya akun credential, jadi `sign-in/email` tidak bisa menebak PIN. Admin memakai server function ber-`schoolAdminMiddleware`.

**Tech Stack:** TanStack Start, Prisma + PostgreSQL RLS (`tenantDb`), Better Auth 1.7.7 (plugin endpoint), Zod, Vitest, Playwright.

Spec: `docs/superpowers/specs/2026-10-15-us-01-student-pin-login-design.md`

## Global Constraints

- Semua akses model tenant lewat `tenantDb(schoolId)` (AGENTS.md aturan 1). Model tenant baru: `schoolId`, `@@index`/`@@unique` diawali `schoolId`, policy RLS di migrasi SQL, dan daftarkan di `TENANT_MODELS` (`src/db/tenant.ts`) (aturan 2; `src/db/tenant.test.ts` memeriksanya).
- Server function: validasi Zod -> `schoolAdminMiddleware` -> service; tanpa logika bisnis (aturan 3).
- Service baru wajib punya test, termasuk isolasi antar sekolah (aturan 4).
- Jangan ubah migrasi yang ada; buat migrasi baru dengan timestamp setelah `20261024000000_audit_logs` (aturan 5).
- Teks UI berbahasa Indonesia; waktu UTC (aturan 6). Tanpa dependency baru (aturan 7).
- Selesai = `pnpm typecheck`, `pnpm lint`, `pnpm test`, dan `pnpm test:e2e` hijau tanpa pengecualian. Kegagalan (lama maupun baru) dilaporkan apa adanya dan diperbaiki, tidak disembunyikan atau digeser ke utang (aturan 8 dan 11).
- Jangan menyentuh modul lain selain yang disebut di plan (aturan 9).
- PIN: 6 digit dari `crypto.randomInt`, digit pertama 1-9 (rentang 100000-999999, agar spreadsheet CSV tidak membuang angka nol di depan); di-hash dengan `hashPassword` dari `better-auth/crypto`; teks PIN tidak pernah disimpan, dicatat di log, atau masuk audit.
- Pesan galat login selalu sama untuk semua sebab gagal: `NIS atau PIN salah.`
- Batas laju hanya menghitung kegagalan: 5 per sekolah+NIS+IP per 900 dtk; 60 per IP per 900 dtk; 20 per sekolah+NIS per 3600 dtk. Cek dilakukan SEBELUM verifikasi.
- Hash prisma: PowerShell/Bash tersedia; Windows CRLF: edit lewat tool Edit/Write. Query di dalam satu `tenantDb` ditulis berurutan, bukan `Promise.all`.
- Dev server harus mati di port 3000 sebelum `pnpm test:e2e`.
- Komponen: kelas semantik Tailwind saja, tipografi `text-ds-*`, tombol memakai `className="rounded-md"`, `font-mono` untuk NIS/PIN, aksi klien dinonaktifkan sampai hydrate (`useHydrated`).

---

### Task 1: `assertRateLimit` (cek tanpa menghitung)

**Files:**
- Modify: `src/lib/rate-limit.ts` (tambah fungsi setelah `consumeRateLimit`)
- Modify: `src/lib/rate-limit.test.ts` (tambah impor dan describe)

**Interfaces:**
- Produces: `assertRateLimit(rule: RateLimitRule, subject: string, now?: Date): Promise<void>` — tidak mengubah penghitung; melempar `RateLimitError` bila `count >= rule.limit` dan jendela belum lewat.

- [ ] **Step 1: Tulis test yang gagal**

Tambahkan `assertRateLimit` ke impor dari `@/lib/rate-limit` dan tambahkan di akhir `src/lib/rate-limit.test.ts`:

```ts
describe("assertRateLimit", () => {
  const checkRule = { bucket: `${bucket}-assert`, limit: 2, windowSeconds: 60 }
  const now = new Date("2026-10-14T10:00:00Z")

  it("tidak menambah hitungan dan menolak setelah batas tercapai", async () => {
    await assertRateLimit(checkRule, "a", now)
    await consumeRateLimit(checkRule, "a", now)
    await assertRateLimit(checkRule, "a", now)
    await consumeRateLimit(checkRule, "a", now)

    await expect(assertRateLimit(checkRule, "a", now)).rejects.toBeInstanceOf(
      RateLimitError
    )

    const row = await prisma.rateLimit.findUniqueOrThrow({
      where: { key: `${checkRule.bucket}:a` },
    })
    expect(row.count).toBe(2)
  })

  it("melepas setelah jendela lewat", async () => {
    const later = new Date(now.getTime() + 61_000)
    await assertRateLimit(checkRule, "a", later)
  })

  it("subjek lain tidak terpengaruh", async () => {
    await assertRateLimit(checkRule, "b", now)
  })
})
```

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `pnpm vitest run src/lib/rate-limit.test.ts`
Expected: FAIL (`assertRateLimit` bukan fungsi / tidak diekspor).

- [ ] **Step 3: Implementasi**

Di `src/lib/rate-limit.ts`, setelah `consumeRateLimit`:

```ts
/**
 * Memeriksa `subject` TANPA menambah hitungan. Melempar RateLimitError bila
 * batas sudah tercapai dan jendelanya belum lewat. Dipakai bersama
 * `consumeRateLimit` untuk batas yang hanya menghitung kegagalan (login PIN):
 * cek dulu, catat setelah gagal.
 */
export async function assertRateLimit(
  rule: RateLimitRule,
  subject: string,
  now: Date = new Date()
): Promise<void> {
  const row = await prisma.rateLimit.findUnique({
    where: { key: `${rule.bucket}:${subject}` },
  })
  if (!row || row.resetAt <= now || row.count < rule.limit) return

  throw new RateLimitError(
    Math.max(1, Math.ceil((row.resetAt.getTime() - now.getTime()) / 1000))
  )
}
```

- [ ] **Step 4: Jalankan, pastikan lulus**

Run: `pnpm vitest run src/lib/rate-limit.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/rate-limit.ts src/lib/rate-limit.test.ts
git commit -m "feat(rate-limit): assertRateLimit untuk batas yang hanya menghitung kegagalan

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Tabel `student_pins` dan service PIN

**Files:**
- Modify: `prisma/schema.prisma` (model `StudentPin`; relasi di `School` dan `Student`)
- Create: `prisma/migrations/20261025000000_student_pins/migration.sql`
- Modify: `src/db/tenant.ts` (tambah `"StudentPin"` ke `TENANT_MODELS`)
- Modify: `src/features/audit/schema.ts` (dua aksi)
- Create: `src/features/student-pin/schema.ts`
- Create: `src/features/student-pin/service.ts`
- Test: `src/features/student-pin/service.test.ts`

**Interfaces:**
- Consumes: `tenantDb(schoolId, cb, { timeout })` (`@/db/tenant`); `recordAudit(db, schoolId, actor, entry)` dan tipe `AuditActor` (`@/features/audit/service`); `hashPassword`/`verifyPassword` (`better-auth/crypto`).
- Produces (dipakai Task 3, 4, 6):
  - `schema.ts`: `PIN_LENGTH = 6`; `studentIdSchema = z.object({ studentId: z.uuid() })`; `classroomIdSchema = z.object({ classroomId: z.uuid() })`; `studentPinLoginSchema = z.object({ nis: string trim 1..32, pin: string /^\d{6}$/ })`; tipe `StudentPinLoginInput`.
  - `service.ts`: `StudentPinError` (`code: "NOT_FOUND"`); `generatePin(): string`; `issueStudentPin(schoolId, actor, studentId): Promise<{ pin: string }>`; `issuePinsForClassroom(schoolId, actor, classroomId): Promise<{ rows: PinRow[]; skipped: number }>` dengan `PinRow = { studentId: string; nis: string; name: string; pin: string }`; `verifyStudentPin(schoolId, nis, pin): Promise<{ userId: string } | null>`.

Keputusan: `issuePinsForClassroom` MELEWATI siswa yang sudah punya PIN (dihitung di `skipped`), seperti kode undangan OB-05, supaya klik massal tidak mengeluarkan satu kelas dari sesinya; PIN siswa yang sudah punya diganti lewat `issueStudentPin` per siswa. Service menerima rombel mana pun milik sekolah itu; UI hanya menawarkan rombel semester aktif.

- [ ] **Step 1: Skema Prisma dan migrasi**

Di `prisma/schema.prisma`, setelah model `ParentLink`, tambahkan:

```prisma
/// PIN login siswa (US-01). Hanya hash (scrypt) yang disimpan; PIN asli hanya
/// terlihat sekali saat dibuat. Satu baris per siswa; membuat ulang menimpa.
model StudentPin {
  id        String @id @default(uuid(7)) @db.Uuid
  schoolId  String @map("school_id") @db.Uuid
  studentId String @map("student_id") @db.Uuid
  pinHash   String @map("pin_hash") @db.VarChar(255)

  school  School  @relation(fields: [schoolId], references: [id], onDelete: Cascade)
  student Student @relation(fields: [studentId], references: [id], onDelete: Cascade)

  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)

  @@unique([schoolId, studentId])
  @@map("student_pins")
}
```

Tambahkan `studentPins StudentPin[]` ke model `School` (di dekat `parentLinks`) dan `pins StudentPin[]` ke model `Student` (di bawah `parentLinks ParentLink[]`).

Buat migrasi: `pnpm prisma migrate dev --create-only --name student_pins`. Folder yang dibuat memakai jam sistem; ganti namanya menjadi `20261025000000_student_pins` bila timestamp-nya lebih awal dari `20261024000000_audit_logs` (`Rename-Item`). Pastikan isi `migration.sql` sama dengan di bawah (tambahkan bagian RLS manual di akhir bila belum ada):

```sql
-- CreateTable
CREATE TABLE "student_pins" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "pin_hash" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "student_pins_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "student_pins_school_id_student_id_key" ON "student_pins"("school_id", "student_id");

-- AddForeignKey
ALTER TABLE "student_pins" ADD CONSTRAINT "student_pins_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_pins" ADD CONSTRAINT "student_pins_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS model tenant (AGENTS.md aturan 2): hanya baris school_id = app.current_school_id.
-- Tanpa konteks itu query melihat nol baris (gagal tertutup).
ALTER TABLE student_pins ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_pins FORCE ROW LEVEL SECURITY;
CREATE POLICY student_pins_school_isolation ON student_pins
  USING (school_id = NULLIF(current_setting('app.current_school_id', true), '')::uuid)
  WITH CHECK (school_id = NULLIF(current_setting('app.current_school_id', true), '')::uuid);
```

Lalu: `pnpm prisma migrate deploy` dan `pnpm prisma generate`. Tambahkan `"StudentPin",` ke `TENANT_MODELS` di `src/db/tenant.ts` (setelah `"ParentLink",`).

- [ ] **Step 2: Jalankan test tenant**

Run: `pnpm vitest run src/db/tenant.test.ts`
Expected: PASS (tabel ber-`school_id` sama dengan `TENANT_MODELS`, isolasi per model).

- [ ] **Step 3: Aksi audit dan skema Zod**

Di `src/features/audit/schema.ts`, setelah `"user.password_reset"`:

```ts
  "student.pin_issue": "Pembuatan atau reset PIN siswa",
  "student.pin_issue_bulk": "Pembuatan PIN siswa massal per rombel",
```

Buat `src/features/student-pin/schema.ts`:

```ts
// Skema masukan PIN siswa (US-01). Dipakai klien lalu server, jadi harus
// idempoten (parse dua kali menghasilkan nilai yang sama).

import { z } from "zod"

export const PIN_LENGTH = 6

export const studentIdSchema = z.object({
  studentId: z.uuid("Siswa tidak valid"),
})

export const classroomIdSchema = z.object({
  classroomId: z.uuid("Rombel tidak valid"),
})

export const studentPinLoginSchema = z.object({
  nis: z.string().trim().min(1, "NIS wajib diisi").max(32, "NIS terlalu panjang"),
  pin: z.string().regex(/^\d{6}$/, "PIN terdiri dari 6 angka"),
})

export type StudentPinLoginInput = z.infer<typeof studentPinLoginSchema>
```

- [ ] **Step 4: Tulis test yang gagal**

Buat `src/features/student-pin/service.test.ts`:

```ts
// @vitest-environment node
// Test integrasi PIN siswa (US-01) + isolasi antar sekolah.
//
// Fixture dibuat lewat `admin` (DATABASE_URL, superuser); aturan bisnis diuji
// lewat service (DATABASE_APP_URL, kena RLS).

import { randomUUID } from "node:crypto"

import { PrismaPg } from "@prisma/adapter-pg"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { PrismaClient } from "@/generated/prisma/client"

import {
  createAcademicYear,
  createClassroom,
  getActiveSemester,
} from "@/features/academic/service"

import {
  StudentPinError,
  generatePin,
  issuePinsForClassroom,
  issueStudentPin,
  verifyStudentPin,
} from "./service"

const adminUrl = process.env.DATABASE_URL
if (!adminUrl)
  throw new Error("DATABASE_URL belum diisi; test integrasi butuh .env")

const admin = new PrismaClient({
  adapter: new PrismaPg({ connectionString: adminUrl }),
})
const suffix = randomUUID().slice(0, 8)
const ACTOR = { userId: randomUUID(), role: "school_admin" as const }

const YEAR = {
  name: "2026/2027",
  ganjil: { startDate: "2026-07-13", endDate: "2026-12-19" },
  genap: { startDate: "2027-01-04", endDate: "2027-06-26" },
}

let schoolAId: string
let schoolBId: string
let kelasA: string
let kelasB: string
let ani: { id: string; userId: string }
let budi: { id: string; userId: string }
let citraB: { id: string; userId: string }

async function createStudent(
  schoolId: string,
  nis: string,
  name: string,
  opts: { membership?: "active" | "inactive" | "none"; deleted?: boolean } = {}
) {
  const user = await admin.user.create({
    data: {
      email: `${nis}-${randomUUID().slice(0, 6)}-${suffix}@sekolah.invalid`,
      name,
      emailVerified: true,
    },
  })
  const student = await admin.student.create({
    data: {
      schoolId,
      userId: user.id,
      nis,
      deletedAt: opts.deleted ? new Date() : null,
    },
  })
  const membership = opts.membership ?? "active"
  if (membership !== "none") {
    await admin.membership.create({
      data: { schoolId, userId: user.id, role: "student", status: membership },
    })
  }
  return { id: student.id, userId: user.id }
}

async function enroll(schoolId: string, classroomId: string, studentId: string) {
  await admin.enrollment.create({ data: { schoolId, classroomId, studentId } })
}

beforeAll(async () => {
  const [a, b] = await Promise.all([
    admin.school.create({
      data: { slug: `sp-a-${suffix}`, name: "SD Uji A", level: "SD" },
    }),
    admin.school.create({
      data: { slug: `sp-b-${suffix}`, name: "SD Uji B", level: "SD" },
    }),
  ])
  schoolAId = a.id
  schoolBId = b.id

  await createAcademicYear(schoolAId, YEAR)
  const semA = (await getActiveSemester(schoolAId))!
  kelasA = (
    await createClassroom(schoolAId, { semesterId: semA.id, grade: 1, name: "1-A" })
  ).id
  await createAcademicYear(schoolBId, YEAR)
  const semB = (await getActiveSemester(schoolBId))!
  kelasB = (
    await createClassroom(schoolBId, { semesterId: semB.id, grade: 1, name: "1-A" })
  ).id

  ani = await createStudent(schoolAId, "6001", "Ani Lestari")
  budi = await createStudent(schoolAId, "6002", "Budi Hartono")
  // NIS yang sama dengan Ani, tetapi di sekolah lain.
  citraB = await createStudent(schoolBId, "6001", "Citra Dewi")
  await enroll(schoolAId, kelasA, ani.id)
  await enroll(schoolAId, kelasA, budi.id)
  await enroll(schoolBId, kelasB, citraB.id)
})

afterAll(async () => {
  await admin.school.deleteMany({ where: { id: { in: [schoolAId, schoolBId] } } })
  await admin.user.deleteMany({
    where: { email: { endsWith: `-${suffix}@sekolah.invalid` } },
  })
  await admin.$disconnect()
})

describe("generatePin", () => {
  it("6 digit, digit pertama bukan nol", () => {
    for (let i = 0; i < 200; i++) {
      expect(generatePin()).toMatch(/^[1-9]\d{5}$/)
    }
  })
})

describe("issueStudentPin + verifyStudentPin", () => {
  it("membuat PIN yang bisa diverifikasi; hash tersimpan, bukan teks", async () => {
    const { pin } = await issueStudentPin(schoolAId, ACTOR, ani.id)
    expect(pin).toMatch(/^[1-9]\d{5}$/)

    const row = await admin.studentPin.findFirstOrThrow({
      where: { schoolId: schoolAId, studentId: ani.id },
    })
    expect(row.pinHash).not.toContain(pin)
    expect(row.pinHash).not.toBe(pin)

    expect(await verifyStudentPin(schoolAId, "6001", pin)).toEqual({
      userId: ani.userId,
    })
    expect(await verifyStudentPin(schoolAId, "6001", "000000")).toBeNull()
  })

  it("membuat ulang mengganti PIN lama dan mencabut sesi siswa itu saja", async () => {
    const first = await issueStudentPin(schoolAId, ACTOR, ani.id)
    const expiresAt = new Date(Date.now() + 3_600_000)
    await admin.session.create({
      data: { userId: ani.userId, token: `tok-ani-${suffix}`, expiresAt },
    })
    await admin.session.create({
      data: { userId: budi.userId, token: `tok-budi-${suffix}`, expiresAt },
    })

    const second = await issueStudentPin(schoolAId, ACTOR, ani.id)

    expect(await verifyStudentPin(schoolAId, "6001", second.pin)).not.toBeNull()
    if (first.pin !== second.pin) {
      expect(await verifyStudentPin(schoolAId, "6001", first.pin)).toBeNull()
    }
    expect(await admin.session.count({ where: { userId: ani.userId } })).toBe(0)
    expect(await admin.session.count({ where: { userId: budi.userId } })).toBe(1)
  })

  it("mencatat audit tanpa PIN", async () => {
    const { pin } = await issueStudentPin(schoolAId, ACTOR, budi.id)
    const logs = await admin.auditLog.findMany({
      where: { schoolId: schoolAId, action: "student.pin_issue", entityId: budi.id },
    })
    expect(logs.length).toBeGreaterThan(0)
    expect(JSON.stringify(logs)).not.toContain(pin)
    expect(logs[0]).toMatchObject({ entity: "student", actorUserId: ACTOR.userId })
  })

  it("isolasi: siswa sekolah lain NOT_FOUND; NIS sama di dua sekolah tidak tertukar", async () => {
    await expect(
      issueStudentPin(schoolAId, ACTOR, citraB.id)
    ).rejects.toBeInstanceOf(StudentPinError)
    await expect(
      issueStudentPin(schoolAId, ACTOR, randomUUID())
    ).rejects.toMatchObject({ code: "NOT_FOUND" })

    const { pin } = await issueStudentPin(schoolBId, ACTOR, citraB.id)
    expect(await verifyStudentPin(schoolBId, "6001", pin)).toEqual({
      userId: citraB.userId,
    })
    // NIS "6001" di sekolah A adalah Ani; PIN Citra tidak berlaku di sana.
    expect(await verifyStudentPin(schoolAId, "6001", pin)).toBeNull()
  })

  it("NIS tidak dikenal, belum punya PIN, membership tidak aktif, atau siswa dihapus -> null", async () => {
    expect(await verifyStudentPin(schoolAId, "9999", "123456")).toBeNull()

    const tanpaPin = await createStudent(schoolAId, "6101", "Tanpa Pin")
    expect(await verifyStudentPin(schoolAId, "6101", "123456")).toBeNull()

    const nonaktif = await createStudent(schoolAId, "6102", "Nonaktif", {
      membership: "inactive",
    })
    const pinNonaktif = (await issueStudentPin(schoolAId, ACTOR, nonaktif.id)).pin
    expect(await verifyStudentPin(schoolAId, "6102", pinNonaktif)).toBeNull()

    const dihapus = await createStudent(schoolAId, "6103", "Dihapus")
    const pinDihapus = (await issueStudentPin(schoolAId, ACTOR, dihapus.id)).pin
    await admin.student.update({
      where: { id: dihapus.id },
      data: { deletedAt: new Date() },
    })
    expect(await verifyStudentPin(schoolAId, "6103", pinDihapus)).toBeNull()
    expect(tanpaPin.id).toBeTruthy()
  })
})

describe("issuePinsForClassroom", () => {
  it("membuat PIN untuk siswa rombel yang belum punya, melewati yang sudah punya, satu audit tanpa PIN", async () => {
    // Ani dan Budi diberi PIN dulu (test ini tidak boleh bergantung pada urutan
    // test lain); Dina dan Eko adalah siswa baru tanpa PIN.
    await issueStudentPin(schoolAId, ACTOR, ani.id)
    await issueStudentPin(schoolAId, ACTOR, budi.id)
    const dina = await createStudent(schoolAId, "6201", "Dina Aulia")
    const eko = await createStudent(schoolAId, "6202", "Eko Prasetyo")
    await enroll(schoolAId, kelasA, dina.id)
    await enroll(schoolAId, kelasA, eko.id)

    const result = await issuePinsForClassroom(schoolAId, ACTOR, kelasA)

    expect(result.rows.map((row) => row.nis)).toEqual(["6201", "6202"])
    expect(result.rows.map((row) => row.name)).toEqual([
      "Dina Aulia",
      "Eko Prasetyo",
    ])
    expect(result.skipped).toBe(2)
    for (const row of result.rows) {
      expect(row.pin).toMatch(/^[1-9]\d{5}$/)
      expect(await verifyStudentPin(schoolAId, row.nis, row.pin)).not.toBeNull()
    }

    const logs = await admin.auditLog.findMany({
      where: {
        schoolId: schoolAId,
        action: "student.pin_issue_bulk",
        entityId: kelasA,
      },
    })
    expect(logs).toHaveLength(1)
    expect(JSON.stringify(logs)).not.toContain(result.rows[0].pin)
  })

  it("rombel sekolah lain atau tidak dikenal -> NOT_FOUND", async () => {
    await expect(
      issuePinsForClassroom(schoolAId, ACTOR, kelasB)
    ).rejects.toMatchObject({ code: "NOT_FOUND" })
    await expect(
      issuePinsForClassroom(schoolAId, ACTOR, randomUUID())
    ).rejects.toMatchObject({ code: "NOT_FOUND" })
  })
})
```

- [ ] **Step 5: Jalankan, pastikan gagal**

Run: `pnpm vitest run src/features/student-pin`
Expected: FAIL (modul `./service` belum ada).

- [ ] **Step 6: Implementasi service**

Buat `src/features/student-pin/service.ts`:

```ts
// PIN login siswa (US-01).
// ---------------------------------------------------------------------------
//   - `student_pins` model tenant -> selalu lewat tenantDb(schoolId).
//   - Hanya hash (scrypt, better-auth/crypto) yang disimpan; PIN asli hanya
//     dikembalikan sekali saat dibuat dan tidak pernah masuk log atau audit.
//   - Membuat ulang PIN menimpa yang lama dan mencabut semua sesi siswa itu.
//   - verifyStudentPin selalu menjalankan satu verifikasi hash (hash palsu bila
//     NIS tidak ada) supaya waktu respons tidak membedakan penyebab gagal.

import { randomInt } from "node:crypto"

import { hashPassword, verifyPassword } from "better-auth/crypto"

import { tenantDb, type TenantDb } from "@/db/tenant"
import { recordAudit, type AuditActor } from "@/features/audit/service"

const PIN_MIN = 100_000
const PIN_MAX = 1_000_000 // eksklusif -> 100000..999999
const BULK_TIMEOUT_MS = 120_000

export class StudentPinError extends Error {
  constructor(
    readonly code: "NOT_FOUND",
    message: string
  ) {
    super(message)
    this.name = "StudentPinError"
  }
}

export interface PinRow {
  studentId: string
  nis: string
  name: string
  pin: string
}

/** PIN 6 digit, digit pertama 1-9 (CSV/spreadsheet tidak membuang nol di depan). */
export function generatePin(): string {
  return String(randomInt(PIN_MIN, PIN_MAX))
}

/** Menyimpan PIN baru (upsert) dan mencabut sesi pengguna siswa. */
async function savePin(
  db: TenantDb,
  schoolId: string,
  student: { id: string; userId: string }
): Promise<string> {
  const pin = generatePin()
  const pinHash = await hashPassword(pin)

  await db.studentPin.upsert({
    where: { schoolId_studentId: { schoolId, studentId: student.id } },
    create: { schoolId, studentId: student.id, pinHash },
    update: { pinHash },
  })
  await db.session.deleteMany({ where: { userId: student.userId } })

  return pin
}

export function issueStudentPin(
  schoolId: string,
  actor: AuditActor,
  studentId: string
): Promise<{ pin: string }> {
  return tenantDb(schoolId, async (db) => {
    const student = await db.student.findFirst({
      where: { id: studentId, deletedAt: null },
      select: { id: true, nis: true, userId: true },
    })
    if (!student) throw new StudentPinError("NOT_FOUND", "Siswa tidak ditemukan.")

    const pin = await savePin(db, schoolId, student)
    await recordAudit(db, schoolId, actor, {
      action: "student.pin_issue",
      entity: "student",
      entityId: student.id,
      after: { nis: student.nis },
    })
    return { pin }
  })
}

/**
 * PIN untuk semua siswa rombel yang BELUM punya PIN. Yang sudah punya
 * dilewati (`skipped`); PIN-nya diganti per siswa lewat issueStudentPin.
 * Satu transaksi: gagal di tengah = tidak ada PIN yang berubah.
 */
export function issuePinsForClassroom(
  schoolId: string,
  actor: AuditActor,
  classroomId: string
): Promise<{ rows: PinRow[]; skipped: number }> {
  return tenantDb(
    schoolId,
    async (db) => {
      const classroom = await db.classroom.findFirst({
        where: { id: classroomId, deletedAt: null },
        select: { id: true, name: true },
      })
      if (!classroom) throw new StudentPinError("NOT_FOUND", "Rombel tidak ditemukan.")

      const enrollments = await db.enrollment.findMany({
        where: { classroomId, student: { deletedAt: null } },
        select: {
          student: {
            select: {
              id: true,
              nis: true,
              userId: true,
              user: { select: { name: true } },
            },
          },
        },
      })
      const students = enrollments
        .map((row) => row.student)
        .sort((a, b) => a.user.name.localeCompare(b.user.name, "id"))

      const rows: PinRow[] = []
      let skipped = 0
      for (const student of students) {
        const existing = await db.studentPin.findFirst({
          where: { studentId: student.id },
          select: { id: true },
        })
        if (existing) {
          skipped++
          continue
        }
        const pin = await savePin(db, schoolId, student)
        rows.push({
          studentId: student.id,
          nis: student.nis,
          name: student.user.name,
          pin,
        })
      }

      await recordAudit(db, schoolId, actor, {
        action: "student.pin_issue_bulk",
        entity: "classroom",
        entityId: classroom.id,
        after: { classroom: classroom.name, created: rows.length, skipped },
      })
      return { rows, skipped }
    },
    { timeout: BULK_TIMEOUT_MS }
  )
}

let dummyHash: Promise<string> | undefined
/** Hash tetap untuk menyamakan waktu verifikasi saat NIS tidak ada. */
function getDummyHash(): Promise<string> {
  dummyHash ??= hashPassword("100000")
  return dummyHash
}

/**
 * Memeriksa NIS + PIN di satu sekolah. Mengembalikan userId bila cocok dan
 * siswa aktif (tidak dihapus, membership `student` aktif); selain itu null.
 */
export async function verifyStudentPin(
  schoolId: string,
  nis: string,
  pin: string
): Promise<{ userId: string } | null> {
  const found = await tenantDb(schoolId, async (db) => {
    const student = await db.student.findFirst({
      where: { nis, deletedAt: null },
      select: { id: true, userId: true },
    })
    if (!student) return null

    const stored = await db.studentPin.findFirst({
      where: { studentId: student.id },
      select: { pinHash: true },
    })
    const membership = await db.membership.findFirst({
      where: {
        userId: student.userId,
        role: "student",
        status: "active",
        deletedAt: null,
      },
      select: { id: true },
    })
    return {
      userId: student.userId,
      pinHash: stored?.pinHash ?? null,
      active: membership !== null,
    }
  })

  const hash = found?.pinHash ?? (await getDummyHash())
  const matches = await verifyPassword({ hash, password: pin })

  if (found && found.pinHash && found.active && matches) {
    return { userId: found.userId }
  }
  return null
}
```

- [ ] **Step 7: Jalankan test, pastikan lulus**

Run: `pnpm vitest run src/features/student-pin src/db/tenant.test.ts src/features/audit`
Expected: PASS. Jika `db.session` tidak tersedia pada tipe `TenantDb`, gunakan cara yang dipakai `recordAudit` untuk mengakses model global (`const client = db as PlatformDb`) atau `prisma.session.deleteMany` setelah transaksi, dan jelaskan di laporan.

- [ ] **Step 8: Typecheck, lint, commit**

Run: `pnpm typecheck; pnpm lint` (periksa exit code).

```bash
git add prisma src/db/tenant.ts src/features/audit/schema.ts src/features/student-pin
git commit -m "feat(student-pin): tabel student_pins dan service PIN siswa (US-01)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Login PIN (batas laju berlapis + plugin Better Auth)

**Files:**
- Create: `src/features/student-pin/login.ts`
- Test: `src/features/student-pin/login.test.ts`
- Create: `src/lib/auth-student-pin.ts`
- Test: `src/lib/auth-student-pin.test.ts`
- Modify: `src/lib/auth.ts` (daftarkan plugin sebelum `tanstackStartCookies()`)

**Interfaces:**
- Consumes: `verifyStudentPin` (Task 2); `assertRateLimit`, `consumeRateLimit`, `RateLimitError`, `clientAddress` (`@/lib/rate-limit`, Task 1); `resolveTenant(host)` (`@/lib/tenant/resolve`); `studentPinLoginSchema` (Task 2).
- Produces:
  - `login.ts`: `INVALID_LOGIN_MESSAGE = "NIS atau PIN salah."`; `STUDENT_LOGIN_LIMITS = { perNisIp, perIp, perNis }` (tiga `RateLimitRule`); `StudentLoginError` (`code: "INVALID" | "RATE_LIMITED"`, `retryAfterSeconds?: number`); `loginWithStudentPin(input: { host: string | null; ip: string; nis: string; pin: string }): Promise<{ userId: string }>`.
  - `auth-student-pin.ts`: `studentPin()` — plugin Better Auth `id: "student-pin"` dengan endpoint `POST /sign-in/student-pin` (`auth.api.signInStudentPin`); sukses = sesi + cookie, JSON `{ token, user: { id, name } }`; galat 401 `NIS atau PIN salah.` / 429 pesan batas laju.

- [ ] **Step 1: Tulis test logika login yang gagal**

Buat `src/features/student-pin/login.test.ts`:

```ts
// @vitest-environment node
// Test integrasi login NIS + PIN: batas laju berlapis (hanya kegagalan),
// pesan galat seragam, isolasi sekolah.

import { randomUUID } from "node:crypto"

import { PrismaPg } from "@prisma/adapter-pg"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { prisma } from "@/db/client"
import { PrismaClient } from "@/generated/prisma/client"
import { consumeRateLimit } from "@/lib/rate-limit"

import {
  INVALID_LOGIN_MESSAGE,
  STUDENT_LOGIN_LIMITS,
  StudentLoginError,
  loginWithStudentPin,
} from "./login"
import { issueStudentPin } from "./service"

const adminUrl = process.env.DATABASE_URL
if (!adminUrl)
  throw new Error("DATABASE_URL belum diisi; test integrasi butuh .env")

const admin = new PrismaClient({
  adapter: new PrismaPg({ connectionString: adminUrl }),
})
const suffix = randomUUID().slice(0, 8)
const ACTOR = { userId: randomUUID(), role: "school_admin" as const }
const ip = (label: string) => `ip-${suffix}-${label}`

let schoolId: string
let host: string
let aniPin: string
let budiPin: string

async function createStudent(nis: string, name: string) {
  const user = await admin.user.create({
    data: {
      email: `${nis}-${randomUUID().slice(0, 6)}-${suffix}@sekolah.invalid`,
      name,
      emailVerified: true,
    },
  })
  const student = await admin.student.create({
    data: { schoolId, userId: user.id, nis },
  })
  await admin.membership.create({
    data: { schoolId, userId: user.id, role: "student", status: "active" },
  })
  return { id: student.id, userId: user.id }
}

async function expectLoginError(
  promise: Promise<unknown>,
  code: "INVALID" | "RATE_LIMITED"
) {
  const error = await promise.then(
    () => null,
    (reason: unknown) => reason
  )
  expect(error).toBeInstanceOf(StudentLoginError)
  expect((error as StudentLoginError).code).toBe(code)
  return error as StudentLoginError
}

beforeAll(async () => {
  const slug = `lp-${suffix}`
  const school = await admin.school.create({
    data: { slug, name: "SD Login Pin", level: "SD" },
  })
  schoolId = school.id
  host = `${slug}.localhost:3000`

  const ani = await createStudent("7001", "Ani")
  const budi = await createStudent("7002", "Budi")
  aniPin = (await issueStudentPin(schoolId, ACTOR, ani.id)).pin
  budiPin = (await issueStudentPin(schoolId, ACTOR, budi.id)).pin
})

afterAll(async () => {
  await prisma.rateLimit.deleteMany({ where: { key: { contains: suffix } } })
  await prisma.rateLimit.deleteMany({ where: { key: { contains: schoolId } } })
  await admin.school.deleteMany({ where: { id: schoolId } })
  await admin.user.deleteMany({
    where: { email: { endsWith: `-${suffix}@sekolah.invalid` } },
  })
  await admin.$disconnect()
})

describe("loginWithStudentPin", () => {
  it("PIN benar mengembalikan userId", async () => {
    const result = await loginWithStudentPin({
      host,
      ip: ip("ok"),
      nis: "7001",
      pin: aniPin,
    })
    expect(result.userId).toBeTruthy()
  })

  it("semua sebab gagal memberi pesan yang sama", async () => {
    const messages = new Set<string>()
    const attempts = [
      { host, nis: "7001", pin: "100000" }, // PIN salah
      { host, nis: "9999", pin: aniPin }, // NIS tidak ada
      { host: "localhost:3000", nis: "7001", pin: aniPin }, // bukan host sekolah
      { host: `tidak-ada-${suffix}.localhost:3000`, nis: "7001", pin: aniPin },
    ]
    for (const [index, attempt] of attempts.entries()) {
      const error = await expectLoginError(
        loginWithStudentPin({ ...attempt, ip: ip(`msg${index}`) }),
        "INVALID"
      )
      messages.add(error.message)
    }
    expect([...messages]).toEqual([INVALID_LOGIN_MESSAGE])
  })

  it("setelah 5 kegagalan NIS+IP, PIN benar pun ditolak; IP lain tetap bisa masuk", async () => {
    const attacker = ip("brute")
    for (let i = 0; i < STUDENT_LOGIN_LIMITS.perNisIp.limit; i++) {
      await expectLoginError(
        loginWithStudentPin({ host, ip: attacker, nis: "7002", pin: "100000" }),
        "INVALID"
      )
    }
    const locked = await expectLoginError(
      loginWithStudentPin({ host, ip: attacker, nis: "7002", pin: budiPin }),
      "RATE_LIMITED"
    )
    expect(locked.retryAfterSeconds).toBeGreaterThan(0)

    // Siswa lain dari IP yang sama tidak terkunci oleh batas NIS+IP.
    const other = await loginWithStudentPin({
      host,
      ip: attacker,
      nis: "7001",
      pin: aniPin,
    })
    expect(other.userId).toBeTruthy()

    // Pemilik akun dari IP lain tetap bisa masuk.
    const owner = await loginWithStudentPin({
      host,
      ip: ip("owner"),
      nis: "7002",
      pin: budiPin,
    })
    expect(owner.userId).toBeTruthy()
  })

  it("login berhasil tidak menambah hitungan", async () => {
    const same = ip("repeat")
    for (let i = 0; i < STUDENT_LOGIN_LIMITS.perNisIp.limit + 3; i++) {
      await loginWithStudentPin({ host, ip: same, nis: "7001", pin: aniPin })
    }
  })

  it("batas per IP: 60 kegagalan di berbagai NIS mengunci IP itu", async () => {
    const noisy = ip("noisy")
    for (let i = 0; i < STUDENT_LOGIN_LIMITS.perIp.limit; i++) {
      await consumeRateLimit(STUDENT_LOGIN_LIMITS.perIp, noisy)
    }
    await expectLoginError(
      loginWithStudentPin({ host, ip: noisy, nis: "7001", pin: aniPin }),
      "RATE_LIMITED"
    )
  })

  it("batas per NIS: 20 kegagalan dari berbagai IP mengunci NIS itu untuk semua IP", async () => {
    for (let i = 0; i < STUDENT_LOGIN_LIMITS.perNis.limit; i++) {
      await consumeRateLimit(STUDENT_LOGIN_LIMITS.perNis, `${schoolId}:7001`)
    }
    await expectLoginError(
      loginWithStudentPin({ host, ip: ip("fresh"), nis: "7001", pin: aniPin }),
      "RATE_LIMITED"
    )
  })
})
```

Catatan urutan: test "batas per NIS" dijalankan terakhir karena mengunci NIS 7001 untuk seluruh IP.

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `pnpm vitest run src/features/student-pin/login.test.ts`
Expected: FAIL (modul `./login` belum ada).

- [ ] **Step 3: Implementasi logika login**

Buat `src/features/student-pin/login.ts`:

```ts
// Login siswa dengan NIS + PIN (US-01): sekolah dari host, batas laju berlapis
// yang HANYA menghitung kegagalan (dicek sebelum verifikasi), lalu verifikasi.
// Semua sebab gagal memberi pesan yang sama. Dipanggil oleh plugin Better Auth
// `student-pin` (src/lib/auth-student-pin.ts).

import {
  RateLimitError,
  assertRateLimit,
  consumeRateLimit,
  type RateLimitRule,
} from "@/lib/rate-limit"
import { resolveTenant } from "@/lib/tenant/resolve"

import { verifyStudentPin } from "./service"

export const INVALID_LOGIN_MESSAGE = "NIS atau PIN salah."

export const STUDENT_LOGIN_LIMITS = {
  /** Per sekolah + NIS + alamat IP. */
  perNisIp: { bucket: "student-pin", limit: 5, windowSeconds: 900 },
  /** Per alamat IP (semua NIS). */
  perIp: { bucket: "student-pin-ip", limit: 60, windowSeconds: 900 },
  /** Per sekolah + NIS (semua IP). */
  perNis: { bucket: "student-pin-nis", limit: 20, windowSeconds: 3600 },
} satisfies Record<string, RateLimitRule>

export class StudentLoginError extends Error {
  constructor(
    readonly code: "INVALID" | "RATE_LIMITED",
    message: string,
    readonly retryAfterSeconds?: number
  ) {
    super(message)
    this.name = "StudentLoginError"
  }
}

interface LoginInput {
  host: string | null
  ip: string
  nis: string
  pin: string
}

export async function loginWithStudentPin(
  input: LoginInput
): Promise<{ userId: string }> {
  const tenant = await resolveTenant(input.host)
  const school = tenant.school
  if (tenant.area !== "school" || !school) {
    throw new StudentLoginError("INVALID", INVALID_LOGIN_MESSAGE)
  }

  const nisKey = `${school.id}:${input.nis}`
  const checks: [RateLimitRule, string][] = [
    [STUDENT_LOGIN_LIMITS.perNisIp, `${nisKey}:${input.ip}`],
    [STUDENT_LOGIN_LIMITS.perIp, input.ip],
    [STUDENT_LOGIN_LIMITS.perNis, nisKey],
  ]

  try {
    for (const [rule, subject] of checks) await assertRateLimit(rule, subject)
  } catch (error) {
    if (error instanceof RateLimitError) {
      throw new StudentLoginError(
        "RATE_LIMITED",
        error.message,
        error.retryAfterSeconds
      )
    }
    throw error
  }

  const result = await verifyStudentPin(school.id, input.nis, input.pin)
  if (result) return result

  // Hanya kegagalan yang dihitung. Melewati batas saat mencatat (balapan
  // permintaan paralel) tidak mengubah hasil: tetap "NIS atau PIN salah".
  for (const [rule, subject] of checks) {
    await consumeRateLimit(rule, subject).catch((error: unknown) => {
      if (!(error instanceof RateLimitError)) throw error
    })
  }
  throw new StudentLoginError("INVALID", INVALID_LOGIN_MESSAGE)
}
```

- [ ] **Step 4: Jalankan test logika, pastikan lulus**

Run: `pnpm vitest run src/features/student-pin/login.test.ts`
Expected: PASS.

- [ ] **Step 5: Tulis test endpoint plugin yang gagal**

Buat `src/lib/auth-student-pin.test.ts`:

```ts
// @vitest-environment node
// Test integrasi endpoint Better Auth POST /sign-in/student-pin: sesi + cookie
// pada sukses, galat seragam pada gagal, dan sign-in/email tidak berlaku
// untuk siswa (tanpa akun credential).

import { randomUUID } from "node:crypto"

import { PrismaPg } from "@prisma/adapter-pg"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { prisma } from "@/db/client"
import { PrismaClient } from "@/generated/prisma/client"
import { issueStudentPin } from "@/features/student-pin/service"
import { auth } from "@/lib/auth"

// Fixture lewat `admin` (DATABASE_URL, superuser); `prisma` aplikasi (role
// biasa, kena RLS) hanya dipakai untuk tabel global rate_limits.
const adminUrl = process.env.DATABASE_URL
if (!adminUrl)
  throw new Error("DATABASE_URL belum diisi; test integrasi butuh .env")

const admin = new PrismaClient({
  adapter: new PrismaPg({ connectionString: adminUrl }),
})

const suffix = randomUUID().slice(0, 8)
const ACTOR = { userId: randomUUID(), role: "school_admin" as const }
const ip = (label: string) => `ip-${suffix}-${label}`

let schoolId: string
let host: string
let userId: string
let pin: string
let email: string

const headersFor = (label: string, extra: Record<string, string> = {}) =>
  new Headers({ host, "x-forwarded-for": ip(label), ...extra })

beforeAll(async () => {
  const slug = `ap-${suffix}`
  const school = await admin.school.create({
    data: { slug, name: "SD Endpoint Pin", level: "SD" },
  })
  schoolId = school.id
  host = `${slug}.localhost:3000`

  email = `8001-${suffix}@${slug}.invalid`
  const user = await admin.user.create({
    data: { email, name: "Siswa Endpoint", emailVerified: true },
  })
  userId = user.id
  const student = await admin.student.create({
    data: { schoolId, userId, nis: "8001" },
  })
  await admin.membership.create({
    data: { schoolId, userId, role: "student", status: "active" },
  })
  pin = (await issueStudentPin(schoolId, ACTOR, student.id)).pin
})

afterAll(async () => {
  await prisma.rateLimit.deleteMany({ where: { key: { contains: suffix } } })
  await prisma.rateLimit.deleteMany({ where: { key: { contains: schoolId } } })
  await admin.school.deleteMany({ where: { id: schoolId } })
  await admin.user.deleteMany({ where: { id: userId } })
  await admin.$disconnect()
  await prisma.$disconnect()
})

describe("POST /sign-in/student-pin", () => {
  it("PIN benar: 200, cookie sesi, dan sesi mengenali siswa itu", async () => {
    const response = await auth.api.signInStudentPin({
      body: { nis: "8001", pin },
      headers: headersFor("ok"),
      asResponse: true,
    })
    expect(response.status).toBe(200)

    const setCookie = response.headers.get("set-cookie") ?? ""
    expect(setCookie).toContain("session_token")
    const cookie = setCookie.split(";")[0]

    const session = await auth.api.getSession({
      headers: new Headers({ host, cookie }),
    })
    expect(session?.user.id).toBe(userId)
  })

  it("PIN salah: 401 dengan pesan seragam dan tanpa cookie", async () => {
    const response = await auth.api.signInStudentPin({
      body: { nis: "8001", pin: "100000" },
      headers: headersFor("bad"),
      asResponse: true,
    })
    expect(response.status).toBe(401)
    expect(response.headers.get("set-cookie") ?? "").not.toContain("session_token")
    expect(await response.text()).toContain("NIS atau PIN salah.")
  })

  it("terkunci: 429", async () => {
    const attacker = "lock"
    for (let i = 0; i < 5; i++) {
      await auth.api.signInStudentPin({
        body: { nis: "8001", pin: "100000" },
        headers: headersFor(attacker),
        asResponse: true,
      })
    }
    const response = await auth.api.signInStudentPin({
      body: { nis: "8001", pin },
      headers: headersFor(attacker),
      asResponse: true,
    })
    expect(response.status).toBe(429)
  })

  it("siswa tidak punya akun credential: sign-in email dengan PIN gagal", async () => {
    await expect(
      auth.api.signInEmail({
        body: { email, password: pin },
        headers: headersFor("email"),
      })
    ).rejects.toBeDefined()
  })
})
```

- [ ] **Step 6: Jalankan, pastikan gagal**

Run: `pnpm vitest run src/lib/auth-student-pin.test.ts`
Expected: FAIL (`auth.api.signInStudentPin` belum ada).

- [ ] **Step 7: Implementasi plugin dan pendaftaran**

Buat `src/lib/auth-student-pin.ts`:

```ts
// Plugin Better Auth: login siswa dengan NIS + PIN (US-01).
// Logika (sekolah dari host, batas laju, verifikasi) ada di
// features/student-pin/login.ts; di sini hanya menjembatani ke sesi Better
// Auth supaya cookie, masa berlaku, dan pencabutan sesi sama dengan login lain.

import type { BetterAuthPlugin } from "better-auth"
import { APIError, createAuthEndpoint } from "better-auth/api"
import { setSessionCookie } from "better-auth/cookies"

import {
  INVALID_LOGIN_MESSAGE,
  StudentLoginError,
  loginWithStudentPin,
} from "@/features/student-pin/login"
import { studentPinLoginSchema } from "@/features/student-pin/schema"
import { clientAddress } from "@/lib/rate-limit"

export const studentPin = () =>
  ({
    id: "student-pin",
    endpoints: {
      signInStudentPin: createAuthEndpoint(
        "/sign-in/student-pin",
        { method: "POST", body: studentPinLoginSchema },
        async (ctx) => {
          const headers = ctx.headers ?? ctx.request?.headers ?? new Headers()

          let userId: string
          try {
            ;({ userId } = await loginWithStudentPin({
              host: headers.get("x-forwarded-host") ?? headers.get("host"),
              ip: clientAddress(headers),
              nis: ctx.body.nis,
              pin: ctx.body.pin,
            }))
          } catch (error) {
            if (error instanceof StudentLoginError) {
              throw new APIError(
                error.code === "RATE_LIMITED" ? "TOO_MANY_REQUESTS" : "UNAUTHORIZED",
                { message: error.message }
              )
            }
            throw error
          }

          const user = await ctx.context.internalAdapter.findUserById(userId)
          if (!user) {
            throw new APIError("UNAUTHORIZED", { message: INVALID_LOGIN_MESSAGE })
          }
          const session = await ctx.context.internalAdapter.createSession(user.id)
          await setSessionCookie(ctx, { session, user })

          return ctx.json({
            token: session.token,
            user: { id: user.id, name: user.name },
          })
        }
      ),
    },
  }) satisfies BetterAuthPlugin
```

Di `src/lib/auth.ts`: tambahkan impor `import { studentPin } from "@/lib/auth-student-pin"` dan ubah baris plugin menjadi `plugins: [studentPin(), tanstackStartCookies()],` (komentar "Wajib paling akhir" tetap berlaku untuk `tanstackStartCookies()`).

Jika bentuk API berbeda di versi 1.7.7 (mis. konstruktor `APIError`, tipe `ctx.headers`), sesuaikan minimal mengikuti `node_modules/better-auth/dist/plugins/username/index.mjs` dan jelaskan penyimpangan di laporan.

- [ ] **Step 8: Jalankan semua test terkait**

Run: `pnpm vitest run src/lib src/features/student-pin src/features/auth`
Expected: PASS. Dependensi sirkular `auth.ts` -> plugin -> login -> service -> `tenantDb`/`prisma` tidak boleh mengimpor `@/lib/auth`; bila typecheck/runtime melaporkan siklus, laporkan sebagai BLOCKED.

- [ ] **Step 9: Typecheck, lint, commit**

Run: `pnpm typecheck; pnpm lint` (periksa exit code).

```bash
git add src/features/student-pin/login.ts src/features/student-pin/login.test.ts src/lib/auth-student-pin.ts src/lib/auth-student-pin.test.ts src/lib/auth.ts
git commit -m "feat(auth): login siswa NIS + PIN dengan batas laju berlapis (US-01)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Server function admin dan CSV PIN

**Files:**
- Create: `src/features/student-pin/csv.ts`
- Test: `src/features/student-pin/csv.test.ts`
- Create: `src/features/student-pin/server/student-pin.ts`

**Interfaces:**
- Consumes: `issueStudentPin`, `issuePinsForClassroom`, `StudentPinError`, `PinRow` (Task 2); `studentIdSchema`, `classroomIdSchema` (Task 2); `schoolAdminMiddleware`; `getActiveSemester`, `listClassrooms` dari `@/features/academic/service`.
- Produces (dipakai Task 6):
  - `csv.ts`: `pinsToCsv(rows: { nis: string; name: string; pin: string }[]): string` — BOM + header `NIS,Nama,PIN` + CRLF.
  - `server/student-pin.ts`: `issueStudentPinFn({ data: { studentId } }): Promise<{ ok: true; pin: string } | { ok: false; code: "NOT_FOUND"; message: string }>`; `issueClassroomPinsFn({ data: { classroomId } }): Promise<{ ok: true; rows: PinRow[]; skipped: number } | { ok: false; code: "NOT_FOUND"; message: string }>`; `getPinBoardFn(): Promise<{ semesterName: string | null; classrooms: { id: string; name: string; grade: number }[] }>` (GET).

- [ ] **Step 1: Tulis test CSV yang gagal**

Buat `src/features/student-pin/csv.test.ts`:

```ts
import { describe, expect, it } from "vitest"

import { pinsToCsv } from "./csv"

describe("pinsToCsv", () => {
  it("BOM, header, dan baris dengan CRLF", () => {
    const csv = pinsToCsv([
      { nis: "6001", name: "Ani Lestari", pin: "123456" },
      { nis: "6002", name: 'Budi "B" Hartono', pin: "654321" },
    ])
    expect(csv.startsWith("﻿")).toBe(true)
    expect(csv.slice(1)).toBe(
      'NIS,Nama,PIN\r\n6001,Ani Lestari,123456\r\n6002,"Budi ""B"" Hartono",654321\r\n'
    )
  })

  it("nama yang berawalan rumus diberi apostrof", () => {
    const csv = pinsToCsv([{ nis: "1", name: "=HYPERLINK(1)", pin: "111111" }])
    expect(csv).toContain("'=HYPERLINK(1)")
  })
})
```

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `pnpm vitest run src/features/student-pin/csv.test.ts`
Expected: FAIL (modul belum ada).

- [ ] **Step 3: Implementasi CSV**

Buat `src/features/student-pin/csv.ts` (pola `src/features/parent-link/csv.ts`; jangan mengimpor dari modul itu):

```ts
// CSV PIN siswa massal (US-01), dibuat di klien dari hasil server supaya PIN
// asli tidak pernah disimpan atau dikirim ulang.

const BOM = String.fromCharCode(0xfeff)

/** Sel yang diawali = + - @ atau tab/CR dibaca spreadsheet sebagai rumus; beri awalan apostrof. */
function cell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

export function pinsToCsv(
  rows: { nis: string; name: string; pin: string }[]
): string {
  const lines = [
    ["NIS", "Nama", "PIN"],
    ...rows.map((row) => [row.nis, row.name, row.pin]),
  ]
  // BOM supaya Excel membaca UTF-8 (nama berhuruf non-ASCII) dengan benar.
  return `${BOM}${lines.map((line) => line.map(cell).join(",")).join("\r\n")}\r\n`
}
```

- [ ] **Step 4: Jalankan test CSV**

Run: `pnpm vitest run src/features/student-pin/csv.test.ts`
Expected: PASS.

- [ ] **Step 5: Server function**

Buat `src/features/student-pin/server/student-pin.ts` (ikuti pola `src/features/parent-link/server/parent-link.ts` untuk `.middleware/.validator/.handler` dan `getActiveSemester`/`listClassrooms`):

```ts
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
```

- [ ] **Step 6: Pemindai izin, typecheck, lint, commit**

Run: `pnpm vitest run src/features/auth/permission-audit.test.ts src/features/student-pin; pnpm typecheck; pnpm lint` (periksa exit code).

```bash
git add src/features/student-pin/csv.ts src/features/student-pin/csv.test.ts src/features/student-pin/server
git commit -m "feat(student-pin): server function admin dan CSV PIN massal (US-01)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Tab "Siswa (NIS + PIN)" di halaman login

**Files:**
- Modify: `src/routes/login.tsx`

**Interfaces:**
- Consumes: `studentPinLoginSchema` (Task 2); endpoint `POST /api/auth/sign-in/student-pin` (Task 3); `getAccess`, `signOut`, `navigate` yang sudah ada di halaman.

Perilaku: di host sekolah (`!isPlatform`), tampil dua tab "Email" dan "Siswa (NIS + PIN)" (`role="tablist"`/`role="tab"` dengan `aria-selected`); di host platform tidak ada tab. Form siswa: field "NIS" (`id="nis"`, `name="nis"`, `autoComplete="username"`, `font-mono`) dan "PIN" (`id="pin"`, `name="pin"`, `type="password"`, `inputMode="numeric"`, `maxLength={6}`, `autoComplete="current-password"`), tombol "Masuk" nonaktif sampai hydrate. Pengiriman: `fetch("/api/auth/sign-in/student-pin", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(parsed.data) })`. Respons `429` -> "Terlalu banyak percobaan. Coba lagi beberapa saat lagi."; `!ok` lain -> "NIS atau PIN salah." Setelah sukses, pemeriksaan akses yang sama dengan login email (`getAccess`, tolak suspended / bukan anggota dengan `signOut()` lalu pesan galat), lalu `navigate({ to: "/" })`.

- [ ] **Step 1: Refaktor kecil dan tambah tab**

Di `LoginPage`:
1. Tambah state `const [mode, setMode] = useState<"email" | "siswa">("email")`.
2. Ekstrak blok "Sesi valid belum berarti boleh masuk" menjadi fungsi `finishLogin()` di dalam komponen (memanggil `getAccess`, menangani `suspended` / bukan anggota seperti kode sekarang, lalu `await navigate({ to: "/" })`), dan panggil dari `onSubmit` email. Perilaku login email tidak boleh berubah.
3. Tambah `onSubmitStudent` yang mem-parse dengan `studentPinLoginSchema.safeParse(Object.fromEntries(new FormData(event.currentTarget)))` (galat pertama ditampilkan), `fetch` seperti di atas, lalu `finishLogin()` pada sukses; `setPending` seperti `onSubmit`.
4. Render tab hanya bila `!isPlatform`. Ganti pesan galat saat berpindah tab (`setError(null)`).
5. Sisanya (judul, kartu, gaya) mengikuti halaman yang ada: kelas semantik, `text-ds-*`, `font-mono` hanya untuk input NIS dan PIN.

- [ ] **Step 2: Typecheck dan lint**

Run: `pnpm typecheck; pnpm lint` (periksa exit code).
Expected: bersih.

- [ ] **Step 3: Periksa manual singkat bila memungkinkan, lalu commit**

Jika dev server dapat dijalankan cepat (`pnpm dev`, buka `http://sekolahdemo.localhost:3000/login`), pastikan dua tab tampil dan tab Email tetap berfungsi; matikan server dev sesudahnya (port 3000 harus kosong untuk E2E). Cakupan penuh ada di E2E Task 7.

```bash
git add src/routes/login.tsx
git commit -m "feat(auth): tab login siswa NIS + PIN di halaman login (US-01)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Aksi PIN di `/pengguna`

**Files:**
- Modify: `src/features/user-management/service.ts` (`PersonRow.hasPin`; `listPeople`)
- Modify: `src/features/user-management/service.test.ts` (test `hasPin`)
- Modify: `src/features/user-management/components/people-page.tsx`
- Modify: `src/routes/(school)/_app.pengguna.tsx`

**Interfaces:**
- Consumes: `issueStudentPinFn`, `issueClassroomPinsFn`, `getPinBoardFn` (Task 4); `pinsToCsv` (Task 4); komponen yang sudah ada di `people-page.tsx`.
- Produces: `PersonRow` mendapat `hasPin: boolean` (guru: selalu `false`).

- [ ] **Step 1: Tulis test `hasPin` yang gagal**

Di `src/features/user-management/service.test.ts`, di describe `listPeople` tambahkan (di fixture buat satu `StudentPin` untuk siswa "Dina Siswa" lewat `admin.studentPin.create({ data: { schoolId: schoolAId, studentId, pinHash: "x" } })` — pastikan `createStudent` mengembalikan id siswa, ubah helper bila perlu — dan hapus `studentPin` pada cleanup bila FK tidak cascade; school delete sudah cascade):

```ts
  it("siswa yang sudah punya PIN bertanda hasPin; siswa tanpa PIN dan guru tidak", async () => {
    const { rows } = await listPeople(schoolAId)
    const byName = Object.fromEntries(rows.map((row) => [row.name, row.hasPin]))
    expect(byName["Dina Siswa"]).toBe(true)
    expect(byName["Ani Guru"]).toBe(false)
  })
```

Tambahkan satu siswa kedua tanpa PIN bila diperlukan agar kasus `false` untuk siswa juga teruji; sesuaikan ekspektasi test lain (jumlah/urutan baris) dengan fixture baru.

Run: `pnpm vitest run src/features/user-management` -> Expected: FAIL (`hasPin` belum ada).

- [ ] **Step 2: Implementasi `hasPin`**

Di `service.ts`: tambah `hasPin: boolean` ke `PersonRow`. Pada query siswa tambahkan ke `select`: `pins: { select: { id: true }, take: 1 }` dan peta `hasPin: student.pins.length > 0`; guru `hasPin: false`. Jalankan `pnpm vitest run src/features/user-management` -> PASS.

- [ ] **Step 3: Rute memuat papan rombel**

Di `src/routes/(school)/_app.pengguna.tsx`: loader menjadi

```tsx
  loader: async () => {
    const [people, board] = await Promise.all([
      listPeopleFn({ data: {} }),
      getPinBoardFn(),
    ])
    return { people, board }
  },
```

dan komponen: `<PeoplePage initial={data.people} board={data.board} />` (impor `getPinBoardFn` dari `@/features/student-pin/server/student-pin`).

- [ ] **Step 4: UI di `people-page.tsx`**

Tambah prop `board: { semesterName: string | null; classrooms: { id: string; name: string; grade: number }[] }`. Perubahan:

1. Baris siswa: ganti catatan "Reset PIN tersedia setelah login NIS+PIN" dengan aksi PIN. Tombol `variant="outline" size="sm" className="rounded-md"` berlabel "Buat PIN" bila `!person.hasPin`, "Reset PIN" bila `hasPin`, dengan `aria-label` `Buat PIN {nama}` / `Reset PIN {nama}`, nonaktif sampai hydrate. Klik membuka konfirmasi inline (pola yang sama dengan reset guru): "Buat PIN baru untuk {nama}? PIN lama tidak berlaku lagi dan sesi siswa berakhir." dengan tombol "Ya, buat" dan "Batal" (`rounded-md`, nonaktif saat `pending`).
2. Sukses: simpan `{ [studentId]: pin }` di state `freshPins`, tandai baris `hasPin = true` di state daftar, tutup konfirmasi, dan tampilkan di sel aksi baris itu: `<span data-testid="new-pin" className="font-mono text-ds-body">{pin}</span>` beserta teks `text-ds-caption`: "Catat sekarang. PIN tidak bisa dilihat lagi." Galat (`!result.ok`) tampil lewat `role="alert"` yang ada.
3. Di bawah tabel (atau di atas, sebelum tabel) tambah `<section aria-label="PIN massal per rombel">` dengan judul "PIN massal per rombel", deskripsi singkat ("Membuat PIN untuk siswa rombel yang belum punya PIN dan mengunduhnya sebagai CSV. Siswa yang sudah punya PIN dilewati."), `<select>` berlabel "Rombel" (`selectClass`; opsi "Pilih rombel" kosong + `board.classrooms` sebagai `{name} (tingkat {grade})`; bila `board.semesterName` null tampilkan teks "Belum ada semester aktif."), dan tombol "Buat PIN massal" (`rounded-md`, nonaktif bila belum memilih rombel atau belum hydrate). Hasil: unduh CSV `pin-{nama-rombel}.csv` lewat `pinsToCsv` (pola fungsi `download` di `src/features/parent-link/components/parent-links-page.tsx`; salin fungsi kecil itu ke file ini, jangan mengimpor dari modul orang tua) dan `role="status"`: "{n} PIN dibuat dan diunduh; {m} siswa dilewati karena sudah punya PIN." Bila `rows.length === 0` jangan mengunduh berkas kosong; tampilkan "Semua siswa di rombel ini sudah punya PIN."
4. Setelah PIN massal, muat ulang daftar (`search(...)` yang sudah ada) agar `hasPin` terbarui.

Ikuti aturan gaya: kelas semantik, `text-ds-*`, `font-mono` hanya untuk PIN dan kode/NIS.

- [ ] **Step 5: Typecheck, lint, test, commit**

Run: `pnpm generate-routes` TIDAK diperlukan (tidak ada rute baru). `pnpm typecheck; pnpm lint; pnpm vitest run src/features/user-management src/features/auth` (periksa exit code).

```bash
git add src/features/user-management "src/routes/(school)/_app.pengguna.tsx"
git commit -m "feat(user-management): buat/reset PIN siswa dan PIN massal di /pengguna (US-01)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: E2E dan PROGRESS.md

**Files:**
- Create: `tests/e2e/student-pin.spec.ts`
- Modify: `tests/e2e/user-management.spec.ts` (bila assertion lama soal catatan "setelah login NIS+PIN" gagal)
- Modify: `docs/PROGRESS.md`

**Interfaces:**
- Consumes: halaman `/pengguna` dan `/login` (Task 5, 6); pola fixture dari `tests/e2e/user-management.spec.ts` dan `tests/e2e/parent-link.spec.ts` (`newSchool`, `login`).

- [ ] **Step 1: Perbarui E2E lama yang bergantung pada teks lama**

Jalankan `pnpm vitest run` tidak perlu; periksa `tests/e2e/user-management.spec.ts`: assertion "baris siswa tidak punya tombol" dan teks "setelah login NIS+PIN" tidak lagi benar. Ubah menjadi: baris siswa punya tombol `Buat PIN Siswa Uji` dan tidak ada tombol reset sandi guru di baris itu. Jangan melemahkan assertion lain.

- [ ] **Step 2: Tulis `tests/e2e/student-pin.spec.ts`**

Struktur sama dengan `user-management.spec.ts`: `dotenv/config`, `PrismaClient` + `PrismaPg`, `hashPassword`, fixture `newSchool(testInfo)` dengan tag acak (slug `sp-<tag>`), `setupCompletedAt` terisi, satu admin sekolah (akun credential + membership `school_admin`), tahun ajaran + semester aktif + rombel "1-A" (tingkat 1), dua siswa (NIS `5001` "Ani Lestari" dan `5002` "Budi Hartono") masing-masing user email `<nis>-<tag>@sekolah.test` (huruf kecil), `Student`, membership `student` aktif, dan `Enrollment` ke rombel; bersihkan sekolah dan semua user di `afterAll`. Tes:

```ts
test("admin membuat PIN, siswa login lewat tab Siswa, PIN salah ditolak, reset mengakhiri sesi dan PIN lama", async ({
  page,
  browser,
}, testInfo) => {
  const school = await newSchool(testInfo)
  await loginAdmin(page, school.origin, school.adminEmail)

  await page.goto(`${school.origin}/pengguna`)
  await expect(page.getByRole("heading", { name: "Pengguna" })).toBeVisible()

  const main = page.getByRole("main")
  const buat = main.getByRole("button", { name: "Buat PIN Ani Lestari" })
  await expect(buat).toBeEnabled()
  await buat.click()
  await main.getByRole("button", { name: "Ya, buat" }).click()
  const pin = ((await main.getByTestId("new-pin").textContent()) ?? "").trim()
  expect(pin).toMatch(/^[1-9]\d{5}$/)

  // Siswa (konteks terpisah) login lewat tab Siswa.
  const siswa = await browser.newContext()
  const siswaPage = await siswa.newPage()
  await siswaPage.goto(`${school.origin}/login`)
  await siswaPage.getByRole("tab", { name: "Siswa (NIS + PIN)" }).click()

  // PIN salah: pesan seragam.
  await fillAndSubmitStudent(siswaPage, "5001", pin === "111111" ? "222222" : "111111")
  await expect(siswaPage.getByRole("alert")).toHaveText("NIS atau PIN salah.")

  // PIN benar.
  await fillAndSubmitStudent(siswaPage, "5001", pin)
  await expect(siswaPage).toHaveURL(/\/beranda$/)

  // Admin mereset PIN: sesi siswa berakhir dan PIN lama tidak berlaku.
  await main.getByRole("button", { name: "Reset PIN Ani Lestari" }).click()
  await main.getByRole("button", { name: "Ya, buat" }).click()
  await expect(main.getByTestId("new-pin")).toBeVisible()
  const newPin = ((await main.getByTestId("new-pin").textContent()) ?? "").trim()
  expect(newPin).not.toBe(pin)

  await siswaPage.reload()
  await expect(siswaPage).toHaveURL(/\/login/)

  await siswaPage.getByRole("tab", { name: "Siswa (NIS + PIN)" }).click()
  await fillAndSubmitStudent(siswaPage, "5001", pin)
  await expect(siswaPage.getByRole("alert")).toHaveText("NIS atau PIN salah.")
  await fillAndSubmitStudent(siswaPage, "5001", newPin)
  await expect(siswaPage).toHaveURL(/\/beranda$/)

  await siswa.close()
})

test("PIN massal per rombel: CSV berisi siswa yang belum punya PIN dan PIN-nya berlaku", async ({
  page,
  browser,
}, testInfo) => {
  const school = await newSchool(testInfo)
  await loginAdmin(page, school.origin, school.adminEmail)
  await page.goto(`${school.origin}/pengguna`)

  const main = page.getByRole("main")
  await main.getByLabel("Rombel", { exact: true }).selectOption({ label: "1-A (tingkat 1)" })
  const downloadPromise = page.waitForEvent("download")
  await main.getByRole("button", { name: "Buat PIN massal" }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe("pin-1-A.csv")
  const csv = await readFile((await download.path())!, "utf8")
  const line = csv.split("\r\n").find((row) => row.startsWith("5002,"))
  expect(line).toBeTruthy()
  const pinBudi = line!.split(",").at(-1)!
  expect(pinBudi).toMatch(/^[1-9]\d{5}$/)
  await expect(main.getByRole("status")).toContainText("2 PIN dibuat")

  const siswa = await browser.newContext()
  const siswaPage = await siswa.newPage()
  await siswaPage.goto(`${school.origin}/login`)
  await siswaPage.getByRole("tab", { name: "Siswa (NIS + PIN)" }).click()
  await fillAndSubmitStudent(siswaPage, "5002", pinBudi)
  await expect(siswaPage).toHaveURL(/\/beranda$/)
  await siswa.close()
})
```

Helper `fillAndSubmitStudent(page, nis, pin)`: isi `getByLabel("NIS")` dan `getByLabel("PIN")`, tunggu tombol `Masuk` aktif (`expect(...).toBeEnabled()`), klik. Helper `loginAdmin` seperti `login` di `parent-link.spec.ts` (tab Email adalah default). Hati-hati: selektor dibatasi ke `main` karena sidebar/breadcrumb menduplikasi nama; `page.waitForEvent("download")` dipanggil tanpa `await` sebelum klik; nama berkas unduhan memakai `download.suggestedFilename()`. Kegagalan login dihitung pada batas laju (IP "unknown"); jangan melakukan lebih dari beberapa kegagalan per tes. Bila pesan alert bentrok dengan `role="alert"` lain di halaman, batasi ke `main`.

- [ ] **Step 3: Jalankan spec baru dan lama yang terkait**

Pastikan tidak ada dev server di port 3000. Run: `pnpm test:e2e tests/e2e/student-pin.spec.ts tests/e2e/user-management.spec.ts` (desktop + mobile-360).
Expected: PASS. Perbaiki masalah di tes, bukan dengan melemahkan assertion; bila penyebabnya bug aplikasi, perbaiki aplikasinya dan laporkan.

- [ ] **Step 4: Suite penuh**

Run berurutan, periksa exit code masing-masing: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm test:e2e`. Semua HARUS hijau (aturan 8 dan 11). Flake lama `platform/service.test.ts > getOverview` yang gagal sekali saat paralel: ulangi untuk memastikan lulus dan laporkan bahwa itu terjadi.

- [ ] **Step 5: Perbarui PROGRESS.md**

Edit `docs/PROGRESS.md` dengan perubahan byte-aman (jangan mengubah akhir baris CRLF; file harus tetap UTF-8 valid):
- Tanggal dan baris "Pemeriksaan" (jumlah test unit/E2E dari proses yang benar-benar dijalankan; sebutkan jika `pnpm build` tidak dijalankan).
- Status F2: US-01 selesai -> F2 **Selesai**.
- Tambahkan butir "US-01 selesai" di bagian F2: tabel `student_pins` (RLS), modul `src/features/student-pin` (`service.ts`, `login.ts`, `csv.ts`, `server/`), plugin `src/lib/auth-student-pin.ts` (endpoint `/api/auth/sign-in/student-pin`), tab "Siswa (NIS + PIN)" di `/login`, aksi PIN dan PIN massal di `/pengguna`, aksi audit `student.pin_issue` dan `student.pin_issue_bulk`, `assertRateLimit` di `rate-limit.ts`.
- Keputusan: PIN 6 digit 100000-999999 (tanpa nol di depan agar CSV aman); batas laju hanya menghitung kegagalan (5 NIS+IP/15 mnt, 60 IP/15 mnt, 20 NIS/jam); PIN massal melewati siswa yang sudah punya PIN, reset per siswa mengganti PIN dan mencabut sesi; siswa tanpa akun credential; IP berasal dari `x-forwarded-for` (di produksi aplikasi harus di belakang proxy tepercaya); PIN tidak bisa diubah siswa sendiri; PIN tidak ada di laporan impor.
- Utang: siswa mengubah PIN sendiri; UI siswa khusus SD; masa berlaku PIN; ubah/hapus data siswa dan DataTable (Tahap 2).
- Hapus catatan lama "Reset PIN siswa oleh admin -> US-01" dan "Reset PIN tersedia setelah login NIS+PIN" yang kini usang.
- Jebakan baru bila ada (mis. detail API plugin Better Auth yang berbeda dari dugaan).

- [ ] **Step 6: Commit**

```bash
git add tests/e2e/student-pin.spec.ts tests/e2e/user-management.spec.ts docs/PROGRESS.md
git commit -m "test(e2e): login siswa NIS + PIN dan PIN massal; docs: catat US-01 selesai

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## Self-Review

- **Cakupan spec:** data `student_pins` + RLS + `TENANT_MODELS` (Task 2); plugin + endpoint + sesi (Task 3); batas laju berlapis hanya kegagalan + `assertRateLimit` (Task 1, 3); pesan seragam dan hash palsu (Task 2, 3); admin per siswa + massal + audit tanpa PIN + pencabutan sesi (Task 2, 4); CSV (Task 4); tab login (Task 5); aksi di `/pengguna` (Task 6); pengujian service/isolasi/login/E2E (Task 2, 3, 7); PROGRESS (Task 7).
- **Penyimpangan dari spec, perlu disebut ke pemilik:** (1) PIN massal MELEWATI siswa yang sudah punya PIN (spec berbunyi "melakukan hal yang sama"); (2) PIN berentang 100000-999999 (tanpa nol di depan) demi keamanan CSV.
- **Placeholder:** tidak ada TBD; dua instruksi "ikuti pola file X" (Task 4 server function, Task 6 download CSV) merujuk ke berkas konkret yang ada.
- **Konsistensi tipe:** `PinRow`, `issueStudentPin`, `issuePinsForClassroom`, `verifyStudentPin`, `STUDENT_LOGIN_LIMITS`, `StudentLoginError`, `loginWithStudentPin`, `studentPin()`, `issueStudentPinFn`, `issueClassroomPinsFn`, `getPinBoardFn`, `pinsToCsv`, `PersonRow.hasPin` konsisten antar task.
