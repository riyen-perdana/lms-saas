// Adapter penyimpanan file (AGENTS.md "src/lib/ (storage)").
// ---------------------------------------------------------------------------
// Aplikasi hanya memanggil putFile/getFile/deleteFile; driver dipilih lewat
// STORAGE_DRIVER:
//   local   (default di development) : folder di server (STORAGE_DIR, default
//            `.storage`). Tahap awal sebelum ada object storage.
//   memory  : tampung di proses ini (dipakai test).
// Driver S3/R2 ditambahkan di sini nanti tanpa mengubah pemanggil. Produksi
// WAJIB mengisi STORAGE_DRIVER secara eksplisit.
//
// Isolasi antar sekolah: kunci file selalu `schools/<schoolId>/<path>`, dan
// setiap fungsi publik menolak kunci milik sekolah lain atau yang mencoba
// keluar folder (`..`, path absolut, backslash).

import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { dirname, join, resolve, sep } from "node:path"

export interface StoredFile {
  body: Buffer
  contentType: string
}

interface StorageDriver {
  put: (key: string, file: StoredFile) => Promise<void>
  get: (key: string) => Promise<StoredFile | null>
  delete: (key: string) => Promise<void>
}

export class InvalidStorageKeyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "InvalidStorageKeyError"
  }
}

const SEGMENT = /^[a-z0-9][a-z0-9._-]*$/i

function assertSegments(segments: string[]): void {
  if (segments.length === 0) throw new InvalidStorageKeyError("Path file kosong.")
  for (const segment of segments) {
    if (!SEGMENT.test(segment) || segment.includes("..")) {
      throw new InvalidStorageKeyError(`Segmen path tidak valid: "${segment}".`)
    }
  }
}

/** Kunci file untuk sekolah, mis. schoolKey(id, "logo", "a.png"). */
export function schoolKey(schoolId: string, ...path: string[]): string {
  assertSegments([schoolId])
  assertSegments(path)
  return ["schools", schoolId, ...path].join("/")
}

/** Pastikan `key` milik `schoolId` dan aman; kembalikan key yang sama. */
export function assertSchoolKey(schoolId: string, key: string): string {
  const segments = key.split("/")
  const [root, owner, ...rest] = segments
  if (root !== "schools" || owner !== schoolId) {
    throw new InvalidStorageKeyError("Kunci file bukan milik sekolah ini.")
  }
  assertSegments(rest)
  return key
}

const memoryFiles = new Map<string, StoredFile>()

/** Hanya untuk test: kosongkan driver `memory`. */
export function clearMemoryStorage(): void {
  memoryFiles.clear()
}

const memoryDriver: StorageDriver = {
  put(key, file) {
    memoryFiles.set(key, file)
    return Promise.resolve()
  },
  get(key) {
    return Promise.resolve(memoryFiles.get(key) ?? null)
  },
  delete(key) {
    memoryFiles.delete(key)
    return Promise.resolve()
  },
}

export const DEFAULT_STORAGE_DIR = ".storage"

function localDriver(): StorageDriver {
  const root = resolve(process.env.STORAGE_DIR ?? DEFAULT_STORAGE_DIR)

  function pathOf(key: string): string {
    const full = resolve(join(root, ...key.split("/")))
    if (!full.startsWith(root + sep)) {
      throw new InvalidStorageKeyError("Kunci file keluar dari folder penyimpanan.")
    }
    return full
  }

  return {
    async put(key, file) {
      const path = pathOf(key)
      await mkdir(dirname(path), { recursive: true })
      await writeFile(path, file.body)
      await writeFile(`${path}.type`, file.contentType, "utf8")
    },
    async get(key) {
      const path = pathOf(key)
      try {
        const [body, contentType] = await Promise.all([
          readFile(path),
          readFile(`${path}.type`, "utf8"),
        ])
        return { body, contentType }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null
        throw error
      }
    },
    async delete(key) {
      const path = pathOf(key)
      await rm(path, { force: true })
      await rm(`${path}.type`, { force: true })
    },
  }
}

function resolveDriver(): StorageDriver {
  const name =
    process.env.STORAGE_DRIVER ??
    (process.env.NODE_ENV === "production" ? undefined : "local")

  switch (name) {
    case "memory":
      return memoryDriver
    case "local":
      return localDriver()
    default:
      throw new Error(
        `STORAGE_DRIVER tidak dikenali atau belum diisi (${String(name)}). Gunakan "local" atau "memory", atau tambahkan driver object storage.`
      )
  }
}

/** Simpan file milik sekolah; mengembalikan kunci yang disimpan. */
export async function putFile(
  schoolId: string,
  path: string[],
  file: StoredFile
): Promise<string> {
  const key = schoolKey(schoolId, ...path)
  await resolveDriver().put(key, file)
  return key
}

export async function getFile(schoolId: string, key: string): Promise<StoredFile | null> {
  return resolveDriver().get(assertSchoolKey(schoolId, key))
}

export async function deleteFile(schoolId: string, key: string): Promise<void> {
  await resolveDriver().delete(assertSchoolKey(schoolId, key))
}
