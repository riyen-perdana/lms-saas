// @vitest-environment node
// Audit izin (US-03): setiap server function dan route API HARUS punya penjaga
// peran, atau terdaftar di daftar publik di bawah beserta alasannya. Tes ini
// memindai kode sumber, jadi fungsi baru yang lupa dijaga langsung gagal di CI.

import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"

import { describe, expect, it } from "vitest"

const SRC = join(process.cwd(), "src")

/** Server function tanpa login yang sengaja publik. Tambah hanya dengan alasan. */
const PUBLIC_SERVER_FNS: Record<string, string> = {
  getAccess: "membaca status akses sesi sendiri; anonim mendapat 'tidak login'",
  getTenantArea: "area dari host, data yang sudah publik",
  getPublicPlans: "daftar harga di landing",
  sendContactFn: "formulir kontak landing (rate limit)",
  checkSlug: "cek ketersediaan subdomain saat registrasi",
  registerSchoolFn: "registrasi sekolah baru (rate limit)",
  joinWithNewAccountFn: "orang tua baru menukar kode undangan (rate limit)",
  joinWithSessionFn: "orang tua login menukar kode undangan (rate limit)",
}

/** Route API tanpa penjaga peran yang sengaja publik. */
const PUBLIC_API_ROUTES: Record<string, string> = {
  "api/auth/$.ts": "endpoint Better Auth (login, sandi)",
  "api/logo.ts": "logo sekolah dari host, tanpa parameter sekolah",
  "api/tenant.ts": "diagnostik; 404 di produksi",
}

const SERVER_FN_GUARDS = [
  "schoolAdminMiddleware",
  "platformAdminMiddleware",
  "schoolParentMiddleware",
]

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? walk(path) : [path]
  })
}

const sourceFiles = walk(SRC).filter(
  (file) => /\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file)
)

interface ServerFn {
  file: string
  name: string
  guarded: boolean
}

function findServerFns(): ServerFn[] {
  const found: ServerFn[] = []
  for (const file of sourceFiles) {
    const text = readFileSync(file, "utf8")
    if (!text.includes("createServerFn(")) continue

    // Potong per deklarasi `export const` supaya penjaga fungsi lain tidak
    // dihitung untuk fungsi ini.
    const chunks = text.split(/\n(?=export const )/)
    for (const chunk of chunks) {
      const match = /^export const (\w+) = createServerFn\(/.exec(chunk)
      if (!match) continue
      found.push({
        file: relative(SRC, file),
        name: match[1],
        guarded: SERVER_FN_GUARDS.some((guard) => chunk.includes(guard)),
      })
    }
  }
  return found
}

describe("audit izin server function", () => {
  const serverFns = findServerFns()

  it("menemukan server function (pemindai tidak rusak)", () => {
    expect(serverFns.length).toBeGreaterThan(30)
  })

  it("setiap server function dijaga middleware peran atau terdaftar publik", () => {
    const unguarded = serverFns
      .filter((fn) => !fn.guarded && !(fn.name in PUBLIC_SERVER_FNS))
      .map((fn) => `${fn.file}: ${fn.name}`)
    expect(unguarded).toEqual([])
  })

  it("fungsi publik tidak diam-diam juga dijaga, dan daftar tidak basi", () => {
    const names = new Set(serverFns.map((fn) => fn.name))
    for (const name of Object.keys(PUBLIC_SERVER_FNS)) {
      expect(names.has(name), `${name} tidak ada lagi; hapus dari daftar`).toBe(
        true
      )
    }
    const redundant = serverFns
      .filter((fn) => fn.guarded && fn.name in PUBLIC_SERVER_FNS)
      .map((fn) => fn.name)
    expect(redundant).toEqual([])
  })
})

describe("audit izin route API", () => {
  const apiFiles = sourceFiles
    .map((file) => relative(join(SRC, "routes"), file).replaceAll("\\", "/"))
    .filter((file) => file.startsWith("api/"))

  it("setiap route API memakai penjaga peran atau terdaftar publik", () => {
    const unguarded = apiFiles.filter((file) => {
      if (file in PUBLIC_API_ROUTES) return false
      const text = readFileSync(join(SRC, "routes", file), "utf8")
      return !text.includes("requireSchoolRoleForRequest(")
    })
    expect(unguarded).toEqual([])
  })

  it("daftar publik tidak basi", () => {
    for (const file of Object.keys(PUBLIC_API_ROUTES)) {
      expect(apiFiles, `${file} tidak ada lagi; hapus dari daftar`).toContain(
        file
      )
    }
  })
})
