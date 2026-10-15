// @vitest-environment node
// Test integrasi impor guru & siswa (OB-02): validasi per baris, laporan error,
// dan isolasi antar sekolah (PRD §5.2, §6.2).

import { randomUUID } from "node:crypto"

import { PrismaPg } from "@prisma/adapter-pg"
import { Workbook } from "exceljs"
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"

import { tenantDb } from "@/db/tenant"
import { PrismaClient } from "@/generated/prisma/client"

import {
  createAcademicYear,
  createClassroom,
  getActiveSemester,
} from "@/features/academic/service"
import { asExcelJsBuffer, assertSafeXlsx, buildTemplate, fromExcelJsBuffer } from "./excel"
import {
  getImportErrorReport,
  listImportBatches,
  runImportBatch,
  startImport,
} from "./service"
import {
  IMPORT_COLUMNS,
  studentRowSchema,
  teacherRowSchema,
} from "./schema"

// Driver memory: berkas impor tidak boleh menyentuh folder proyek.
process.env.STORAGE_DRIVER = "memory"

const adminUrl = process.env.DATABASE_URL
if (!adminUrl) throw new Error("DATABASE_URL belum diisi; test integrasi butuh .env")

const admin = new PrismaClient({ adapter: new PrismaPg({ connectionString: adminUrl }) })
const suffix = randomUUID().slice(0, 8)
const ACTOR = { userId: randomUUID(), role: "school_admin" as const }

let schoolAId: string
let schoolBId: string
let slugA: string
let slugB: string

const YEAR = {
  name: "2026/2027",
  ganjil: { startDate: "2026-07-13", endDate: "2026-12-19" },
  genap: { startDate: "2027-01-04", endDate: "2027-06-26" },
}

// ---------------------------------------------------------------------------
// Pembuat berkas uji
// ---------------------------------------------------------------------------

type Kind = "teachers" | "students"

async function buildFile(
  kind: Kind,
  rows: Partial<Record<string, string>>[],
  options: { sheetName?: string; headers?: string[] } = {}
): Promise<Buffer> {
  const workbook = new Workbook()
  const sheet = workbook.addWorksheet(
    options.sheetName ?? (kind === "teachers" ? "Guru" : "Siswa")
  )
  sheet.addRow(
    options.headers ?? IMPORT_COLUMNS[kind].map((column) => column.header)
  )
  for (const row of rows) {
    sheet.addRow(IMPORT_COLUMNS[kind].map((column) => row[column.key] ?? ""))
  }
  return fromExcelJsBuffer(await workbook.xlsx.writeBuffer())
}

async function readReport(path: Buffer, sheetName: string) {
  const workbook = new Workbook()
  await workbook.xlsx.load(asExcelJsBuffer(path))
  const sheet = workbook.getWorksheet(sheetName)!
  const out: { baris: string; kolom: string; nilai: string; pesan: string }[] = []
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return
    out.push({
      baris: String(row.getCell(1).value ?? ""),
      kolom: String(row.getCell(2).value ?? ""),
      nilai: String(row.getCell(3).value ?? ""),
      pesan: String(row.getCell(4).value ?? ""),
    })
  })
  return out
}

async function readSheet(path: Buffer, sheetName: string) {
  const workbook = new Workbook()
  await workbook.xlsx.load(asExcelJsBuffer(path))
  return workbook.getWorksheet(sheetName)
}

beforeAll(async () => {
  const [a, b] = await Promise.all([
    admin.school.create({
      data: { slug: `imp-a-${suffix}`, name: "SMA Impor A", level: "SMA" },
    }),
    admin.school.create({
      data: { slug: `imp-b-${suffix}`, name: "SMA Impor B", level: "SMA" },
    }),
  ])
  schoolAId = a.id
  schoolBId = b.id
  slugA = a.slug
  slugB = b.slug

  for (const schoolId of [schoolAId, schoolBId]) {
    await createAcademicYear(schoolId, YEAR)
    const semester = (await getActiveSemester(schoolId))!
    await createClassroom(schoolId, { semesterId: semester.id, grade: 10, name: "X-1" })
    await createClassroom(schoolId, { semesterId: semester.id, grade: 11, name: "XI-2" })
  }
})

afterEach(async () => {
  const { clearMemoryStorage } = await import("@/lib/storage")
  clearMemoryStorage()
})

afterAll(async () => {
  await admin.school.deleteMany({ where: { id: { in: [schoolAId, schoolBId] } } })
  await admin.user.deleteMany({ where: { email: { contains: suffix } } })
  await admin.user.deleteMany({ where: { email: { contains: `.${slugA}.invalid` } } })
  await admin.user.deleteMany({ where: { email: { contains: `.${slugB}.invalid` } } })
  await admin.$disconnect()
})

// ---------------------------------------------------------------------------
// Skema baris
// ---------------------------------------------------------------------------

describe("skema baris", () => {
  const student = { nis: "1001", name: "Ahmad Fauzi", nisn: "", gender: "", classroom: "" }
  const teacher = { code: "G001", name: "Budi Santoso", email: "BUDI@Sekolah.Test" }

  it("idempoten: hasil parse bisa diparse lagi dengan nilai sama", () => {
    const once = studentRowSchema.parse(student)
    expect(studentRowSchema.parse(once)).toEqual(once)
    const guru = teacherRowSchema.parse(teacher)
    expect(teacherRowSchema.parse(guru)).toEqual(guru)
    expect(guru.email).toBe("budi@sekolah.test")
    expect(once.nisn).toBeUndefined()
    expect(once.gender).toBeUndefined()
  })

  it("menolak nilai yang tidak valid dengan pesan Indonesia", () => {
    expect(studentRowSchema.safeParse({ ...student, nis: "" }).error?.issues[0].message).toBe(
      "NIS wajib diisi"
    )
    expect(
      studentRowSchema.safeParse({ ...student, nisn: "12345" }).error?.issues[0].message
    ).toBe("NISN harus 10 digit angka")
    expect(
      studentRowSchema.safeParse({ ...student, gender: "X" }).error?.issues[0].message
    ).toBe("Jenis kelamin harus L atau P")
    expect(teacherRowSchema.safeParse({ ...teacher, email: "budi" }).error?.issues[0].message).toBe(
      "Email tidak valid"
    )
    expect(
      teacherRowSchema.safeParse({ ...teacher, name: "B" }).error?.issues[0].message
    ).toBe("Nama wajib diisi (minimal 2 karakter)")
  })
})

describe("template", () => {
  it("memuat sheet dan judul kolom sesuai skema", async () => {
    const sheet = await readSheet(await buildTemplate("students"), "Siswa")
    const headers = (sheet!.getRow(1).values as string[]).slice(1)
    expect(headers).toEqual(IMPORT_COLUMNS.students.map((column) => column.header))
    expect(await readSheet(await buildTemplate("students"), "Petunjuk")).toBeTruthy()
  })

  it("template guru memuat kolom email", async () => {
    const sheet = await readSheet(await buildTemplate("teachers"), "Guru")
    const headers = (sheet!.getRow(1).values as string[]).slice(1)
    expect(headers).toContain("Email")
  })
})

// ---------------------------------------------------------------------------
// Impor siswa
// ---------------------------------------------------------------------------

describe("impor siswa", () => {
  it("mengimpor baris valid, membuat user, membership, dan enrollment", async () => {
    const body = await buildFile("students", [
      { nis: "1001", name: "Ahmad Fauzi", nisn: "0123456789", gender: "L", classroom: "X-1" },
      { nis: "1002", name: "Bunga Lestari", gender: "P" },
      { nis: "1003", name: "Citra Dewi", gender: "P", classroom: "XI-2" },
    ])

    const { batchId } = await startImport(schoolAId, ACTOR, {
      kind: "students",
      fileName: "siswa.xlsx",
      body,
    })

    expect(
      await admin.auditLog.count({
        where: { schoolId: schoolAId, action: "import.start", entityId: batchId },
      })
    ).toBe(1)

    const [batch] = await listImportBatches(schoolAId)
    expect(batch.id).toBe(batchId)
    expect(batch.status).toBe("done")
    expect(batch).toMatchObject({ totalRows: 3, importedRows: 3, failedRows: 0 })

    const stored = await tenantDb(schoolAId, async (db) => {
      const students = await db.student.findMany({ orderBy: { nis: "asc" } })
      const memberships = await db.membership.findMany({
        where: { userId: { in: students.map((s) => s.userId) } },
      })
      const enrollments = await db.enrollment.findMany({
        include: { classroom: true },
      })
      return { students, memberships, enrollments }
    })

    expect(stored.students.map((s) => s.nis)).toEqual(["1001", "1002", "1003"])
    expect(stored.students[0].nisn).toBe("0123456789")
    expect(stored.students[0].gender).toBe("L")
    expect(stored.memberships).toHaveLength(3)
    expect(stored.memberships.every((m) => m.role === "student")).toBe(true)
    expect(stored.enrollments.map((e) => e.classroom.name)).toEqual(["X-1", "XI-2"])

    // Email siswa internal tidak pernah terkirim ke domain nyata.
    const users = await admin.user.findMany({
      where: { id: { in: stored.students.map((s) => s.userId) } },
    })
    expect(users.every((user) => user.email.endsWith(`${slugA}.invalid`))).toBe(true)
  })

  it("menyimpan laporan error per baris dan bisa diunduh sebagai .xlsx", async () => {
    const body = await buildFile("students", [
      { nis: "2001", name: "Dina Ayu" },
      { nis: "", name: "Tanpa NIS" },
      { nis: "2002", name: "E", gender: "X" },
      { nis: "2003", name: "Fajar Rahman", classroom: "X-9" },
      { nis: "2001", name: "Duplikat NIS" },
    ])

    const { batchId } = await startImport(schoolAId, ACTOR, {
      kind: "students",
      fileName: "siswa-salah.xlsx",
      body,
    })

    const [batch] = await listImportBatches(schoolAId)
    expect(batch.status).toBe("done")
    expect(batch.importedRows).toBe(1)
    expect(batch.failedRows).toBe(4)

    const report = await getImportErrorReport(schoolAId, batchId)
    expect(report.fileName).toMatch(/^laporan-error/)

    const rows = await readReport(report.body, "Laporan")
    const messages = rows.map((row) => row.pesan)
    expect(messages).toEqual(
      expect.arrayContaining([
        expect.stringContaining("NIS wajib diisi"),
        expect.stringContaining("Nama wajib diisi"),
        expect.stringContaining('Rombel "X-9" tidak ada pada semester aktif'),
        expect.stringContaining("NIS 2001 sudah dipakai di sekolah ini"),
      ])
    )
    // Nomor baris dilaporkan sesuai baris di Excel.
    const nisRow = rows.find((row) => row.pesan.includes("NIS wajib diisi"))!
    expect(nisRow.baris).toBe("3")
    expect(nisRow.kolom).toBe("-")
  })

  it("menolak baris yang isinya sudah ada di sekolah ini", async () => {
    const body = await buildFile("students", [
      { nis: "1001", name: "Ahmad Fauzi" },
      { nis: "9001", name: "Baru Nadira" },
    ])

    await startImport(schoolAId, ACTOR, {
      kind: "students",
      fileName: "siswa-ulang.xlsx",
      body,
    })

    const [batch] = await listImportBatches(schoolAId)
    expect(batch.importedRows).toBe(1)
    expect(batch.failedRows).toBe(1)
  })

  it("berkas yang salah format menandai batch gagal tanpa menulis data", async () => {
    const batchesBefore = (await listImportBatches(schoolAId)).length

    const salahSheet = await buildFile("students", [{ nis: "7001", name: "Gagal Impor" }], {
      sheetName: "Data",
    })
    const salahJudul = await buildFile("students", [{ nis: "7002", name: "Gagal Impor" }], {
      headers: ["NIS", "Nama Lengkap", "Rombel"],
    })
    const kosong = await buildFile("students", [])

    for (const [body, expected] of [
      [salahSheet, /Sheet "Siswa" tidak ditemukan/],
      [salahJudul, /Kolom wajib yang hilang/],
      [kosong, /Tidak ada baris data/],
    ] as const) {
      const { batchId } = await startImport(schoolAId, ACTOR, {
        kind: "students",
        fileName: "rusak.xlsx",
        body,
      })
      const batch = (await listImportBatches(schoolAId)).find((b) => b.id === batchId)!
      expect(batch.status).toBe("failed")
      expect(batch.errorMessage).toMatch(expected)
    }

    expect((await listImportBatches(schoolAId)).length).toBe(batchesBefore + 3)
    expect(
      await tenantDb(schoolAId, (db) => db.student.count({ where: { nis: { startsWith: "70" } } }))
    ).toBe(0)
  })

  it("menolak berkas yang bukan .xlsx atau terlalu besar", async () => {
    const before = (await listImportBatches(schoolAId)).length

    await expect(
      startImport(schoolAId, ACTOR, {
        kind: "students",
        fileName: "siswa.csv",
        body: Buffer.from("nis,nama\n"),
      })
    ).rejects.toMatchObject({ code: "INVALID" })

    await expect(
      startImport(schoolAId, ACTOR, {
        kind: "students",
        fileName: "besar.xlsx",
        body: Buffer.alloc(6 * 1024 * 1024),
      })
    ).rejects.toMatchObject({ code: "INVALID" })

    expect((await listImportBatches(schoolAId)).length).toBe(before)
  })

  it("1.000 siswa selesai jauh di bawah 2 menit (target PRD)", async () => {
    const rows = Array.from({ length: 1000 }, (_, i) => ({
      nis: String(20_000 + i),
      name: `Siswa Nomor ${i + 1}`,
      gender: i % 2 === 0 ? "L" : "P",
      classroom: "X-1",
    }))

    const started = Date.now()
    const { batchId } = await startImport(schoolBId, ACTOR, {
      kind: "students",
      fileName: "siswa-1000.xlsx",
      body: await buildFile("students", rows),
    })
    const elapsed = Date.now() - started

    const batch = (await listImportBatches(schoolBId)).find((b) => b.id === batchId)!
    expect(batch.id).toBe(batchId)
    expect(batch).toMatchObject({ status: "done", totalRows: 1000, importedRows: 1000 })
    expect(await tenantDb(schoolBId, (db) => db.enrollment.count())).toBe(1000)
    expect(elapsed).toBeLessThan(120_000)
  })
})

// ---------------------------------------------------------------------------
// Impor guru
// ---------------------------------------------------------------------------

describe("impor guru", () => {
  it("membuat akun kredensial dan mengirim tautan atur sandi", async () => {
    const { clearMemoryOutbox, getMemoryOutbox } = await import("@/lib/email")
    clearMemoryOutbox()

    const email = `guru-${suffix}@sekolah.test`
    await startImport(schoolBId, ACTOR, {
      kind: "teachers",
      fileName: "guru.xlsx",
      body: await buildFile("teachers", [
        { code: "G-001", name: "Hendra Wijaya", email, nip: "198501012010011001" },
      ]),
    })

    const [batch] = await listImportBatches(schoolBId)
    expect(batch).toMatchObject({ status: "done", importedRows: 1, failedRows: 0 })

    const teacher = await tenantDb(schoolBId, async (db) =>
      db.teacher.findFirstOrThrow({ include: { user: true } })
    )
    expect(teacher.code).toBe("G-001")
    expect(teacher.nip).toBe("198501012010011001")
    expect(teacher.user.email).toBe(email)

    const account = await admin.account.findUnique({
      where: {
        providerId_accountId: { providerId: "credential", accountId: teacher.userId },
      },
    })
    expect(account?.password).toBeTruthy()

    const membership = await tenantDb(schoolBId, (db) =>
      db.membership.findFirst({ where: { userId: teacher.userId } })
    )
    expect(membership?.role).toBe("teacher")

    expect(getMemoryOutbox().some((message) => message.to === email)).toBe(true)
    clearMemoryOutbox()
  })

  it("menolak email yang sudah dipakai pengguna lain dan kode guru kembar", async () => {
    const email = `guru-${suffix}@sekolah.test`
    const emailBaru = `guru-baru-${suffix}@sekolah.test`

    const body = await buildFile("teachers", [
      { code: "G-002", name: "Siti Aminah", email: emailBaru },
      { code: "g-002", name: "Kembaran Kode", email: `guru-kembar-${suffix}@sekolah.test` },
      // Email yang sama dengan guru pada impor sebelumnya (beda huruf besar).
      { code: "G-003", name: "Email Bentrok", email: email.toUpperCase() },
    ])

    const { batchId } = await startImport(schoolBId, ACTOR, {
      kind: "teachers",
      fileName: "guru-salah.xlsx",
      body,
    })

    const batch = (await listImportBatches(schoolBId)).find((b) => b.id === batchId)!
    expect(batch.importedRows).toBe(1)
    expect(batch.failedRows).toBe(2)

    const report = await getImportErrorReport(schoolBId, batch.id)
    const rows = await readReport(report.body, "Laporan")
    const messages = rows.map((row) => row.pesan)
    expect(messages).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Kode guru g-002 sudah dipakai di sekolah ini"),
        expect.stringContaining("Email ini sudah terdaftar"),
      ])
    )
  })

  it("proses batch yang sama dua kali tidak menggandakan data", async () => {
    const batch = (await listImportBatches(schoolBId)).find((b) => b.fileName === "guru-salah.xlsx")!
    const again = await runImportBatch(schoolBId, batch.id)

    expect(again.importedRows).toBe(batch.importedRows)
    expect(await tenantDb(schoolBId, (db) => db.teacher.count())).toBe(2)
  })
})

// ---------------------------------------------------------------------------
// Ketahanan impor
// ---------------------------------------------------------------------------

describe("ketahanan impor", () => {
  it("menolak zip bomb: berkas kecil yang isinya membengkak setelah dibuka", async () => {
    const workbook = new Workbook()
    const sheet = workbook.addWorksheet("Guru")
    sheet.addRow(IMPORT_COLUMNS.teachers.map((column) => column.header))
    sheet.addRow(["G-BOM", "A".repeat(60 * 1024 * 1024), `bom-${suffix}@sekolah.test`])
    const body = fromExcelJsBuffer(await workbook.xlsx.writeBuffer())
    expect(body.length).toBeLessThan(5 * 1024 * 1024)

    expect(() => assertSafeXlsx(body)).toThrow(/terlalu besar/)

    const { batchId } = await startImport(schoolAId, ACTOR, {
      kind: "teachers",
      fileName: "bom.xlsx",
      body,
    })
    const batch = (await listImportBatches(schoolAId)).find((b) => b.id === batchId)!
    expect(batch.status).toBe("failed")
    expect(batch.errorMessage).toContain("terlalu besar")
  })

  it("berkas yang bukan zip ditolak tanpa melempar error mentah", () => {
    expect(() => assertSafeXlsx(Buffer.from("bukan zip sama sekali"))).toThrow(
      /tidak bisa dibaca/
    )
  })

  it("email kembar di dalam berkas ditolak per baris, bukan menggagalkan seluruh batch", async () => {
    const email = `kembar-${suffix}@sekolah.test`
    const { batchId } = await startImport(schoolAId, ACTOR, {
      kind: "teachers",
      fileName: "email-kembar.xlsx",
      body: await buildFile("teachers", [
        { code: "K-1", name: "Pertama", email },
        { code: "K-2", name: "Kedua", email: email.toUpperCase() },
      ]),
    })

    const batch = (await listImportBatches(schoolAId)).find((b) => b.id === batchId)!
    expect(batch).toMatchObject({ status: "done", importedRows: 1, failedRows: 1 })

    const rows = await readReport((await getImportErrorReport(schoolAId, batchId)).body, "Laporan")
    expect(rows[0].pesan).toContain("juga dipakai di baris 2")
  })

  it("gagal di tengah penulisan membatalkan semuanya (tanpa akun yatim)", async () => {
    // Pemicu database: baris dengan kode BOOM ditolak saat dimasukkan, sehingga
    // kegagalan terjadi di potongan kedua (baris ke-501 ke atas) setelah
    // potongan pertama sudah ditulis.
    const fn = `uji_boom_${suffix.replace(/-/g, "")}`
    await admin.$executeRawUnsafe(
      `CREATE FUNCTION ${fn}() RETURNS trigger AS $$ BEGIN
         IF NEW.code = 'BOOM' THEN RAISE EXCEPTION 'uji kegagalan'; END IF;
         RETURN NEW; END; $$ LANGUAGE plpgsql`
    )
    await admin.$executeRawUnsafe(
      `CREATE TRIGGER ${fn} BEFORE INSERT ON teachers FOR EACH ROW EXECUTE FUNCTION ${fn}()`
    )

    try {
      const tag = `atom-${suffix}`
      const rows = Array.from({ length: 600 }, (_, i) => ({
        code: i === 550 ? "BOOM" : `AT-${i}`,
        name: `Guru Atomik ${i}`,
        email: `${tag}-${i}@sekolah.test`,
      }))
      const before = await tenantDb(schoolAId, (db) => db.teacher.count())

      const { batchId } = await startImport(schoolAId, ACTOR, {
        kind: "teachers",
        fileName: "atomik.xlsx",
        body: await buildFile("teachers", rows),
      })

      const batch = (await listImportBatches(schoolAId)).find((b) => b.id === batchId)!
      expect(batch.status).toBe("failed")
      expect(batch.importedRows).toBe(0)
      expect(await tenantDb(schoolAId, (db) => db.teacher.count())).toBe(before)
      expect(await admin.user.count({ where: { email: { startsWith: `${tag}-` } } })).toBe(0)
    } finally {
      await admin.$executeRawUnsafe(`DROP TRIGGER IF EXISTS ${fn} ON teachers`)
      await admin.$executeRawUnsafe(`DROP FUNCTION IF EXISTS ${fn}()`)
    }
  }, 60_000)
})

// ---------------------------------------------------------------------------
// Isolasi antar sekolah
// ---------------------------------------------------------------------------

describe("isolasi antar sekolah", () => {
  it("profil siswa sekolah A tidak terlihat oleh sekolah B", async () => {
    const dariA = await tenantDb(schoolAId, (db) => db.student.count())
    const dariB = await tenantDb(schoolBId, (db) => db.student.count())

    expect(dariA).toBeGreaterThan(0)
    expect(dariB).toBe(1000)
    expect(
      await tenantDb(schoolBId, (db) => db.student.findFirst({ where: { nis: "1001" } }))
    ).toBeNull()
  })

  it("batch dan laporan error sekolah A tidak bisa dibaca sekolah B", async () => {
    const batchA = (await listImportBatches(schoolAId))[0]

    expect((await listImportBatches(schoolBId)).map((b) => b.id)).not.toContain(batchA.id)
    await expect(getImportErrorReport(schoolBId, batchA.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    })
  })

  it("import sekolah B tidak menimpa profil sekolah A", async () => {
    const sebelum = await tenantDb(schoolAId, (db) =>
      db.student.findFirstOrThrow({ where: { nis: "1001" } })
    )

    await startImport(schoolBId, ACTOR, {
      kind: "students",
      fileName: "tabrakan.xlsx",
      body: await buildFile("students", [{ nis: "1001", name: "Nama Berubah" }]),
    })

    const sesudah = await tenantDb(schoolAId, (db) =>
      db.student.findFirstOrThrow({ where: { nis: "1001" } })
    )
    expect(sesudah.id).toEqual(sebelum.id)
  })

  it("RLS: tanpa konteks tenant tabel baru tidak terlihat sama sekali", async () => {
    const { prisma } = await import("@/db/client")
    expect(await prisma.student.count()).toBe(0)
    expect(await prisma.teacher.count()).toBe(0)
    expect(await prisma.enrollment.count()).toBe(0)
    expect(await prisma.importBatch.count()).toBe(0)
    expect(await prisma.importError.count()).toBe(0)
  })

  it("RLS: sekolah lain tidak bisa menyisipkan baris atas nama sekolah ini", async () => {
    await expect(
      tenantDb(schoolBId, (db) =>
        db.$executeRaw`INSERT INTO students (id, school_id, user_id, nis, updated_at)
                       VALUES (gen_random_uuid(), ${schoolAId}::uuid, gen_random_uuid(), '7777', now())`
      )
    ).rejects.toThrow()
  })
})