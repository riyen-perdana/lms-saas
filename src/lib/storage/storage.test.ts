import { mkdtemp, readdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  InvalidStorageKeyError,
  clearMemoryStorage,
  deleteFile,
  getFile,
  putFile,
  schoolKey,
} from "./index"

const SCHOOL_A = "0190a000-0000-7000-8000-00000000000a"
const SCHOOL_B = "0190a000-0000-7000-8000-00000000000b"
const png = { body: Buffer.from([1, 2, 3]), contentType: "image/png" }

describe("kunci file", () => {
  it("berawalan schools/<id>", () => {
    expect(schoolKey(SCHOOL_A, "logo", "a.png")).toBe(`schools/${SCHOOL_A}/logo/a.png`)
  })

  it("menolak traversal, path absolut, dan segmen kosong", async () => {
    expect(() => schoolKey(SCHOOL_A, "..", "x")).toThrow(InvalidStorageKeyError)
    expect(() => schoolKey(SCHOOL_A, "a/b")).toThrow(InvalidStorageKeyError)
    expect(() => schoolKey(SCHOOL_A, "")).toThrow(InvalidStorageKeyError)
    expect(() => schoolKey(SCHOOL_A, "a\\b")).toThrow(InvalidStorageKeyError)
    await expect(
      getFile(SCHOOL_A, `schools/${SCHOOL_A}/../${SCHOOL_B}/x.png`)
    ).rejects.toThrow(InvalidStorageKeyError)
  })
})

describe.each(["memory", "local"] as const)("driver %s", (driver) => {
  let dir: string

  beforeEach(async () => {
    process.env.STORAGE_DRIVER = driver
    dir = await mkdtemp(join(tmpdir(), "edusaas-storage-"))
    process.env.STORAGE_DIR = dir
    clearMemoryStorage()
  })

  afterEach(async () => {
    delete process.env.STORAGE_DRIVER
    delete process.env.STORAGE_DIR
    await rm(dir, { recursive: true, force: true })
  })

  it("menyimpan, membaca, lalu menghapus file", async () => {
    const key = await putFile(SCHOOL_A, ["logo", "a.png"], png)
    expect(await getFile(SCHOOL_A, key)).toEqual(png)

    await deleteFile(SCHOOL_A, key)
    expect(await getFile(SCHOOL_A, key)).toBeNull()
  })

  it("mengembalikan null untuk file yang tidak ada", async () => {
    expect(await getFile(SCHOOL_A, schoolKey(SCHOOL_A, "tidak-ada.png"))).toBeNull()
  })

  it("isolasi: sekolah lain tidak bisa membaca atau menghapus file", async () => {
    const key = await putFile(SCHOOL_A, ["logo.png"], png)

    await expect(getFile(SCHOOL_B, key)).rejects.toThrow(InvalidStorageKeyError)
    await expect(deleteFile(SCHOOL_B, key)).rejects.toThrow(InvalidStorageKeyError)
    expect(await getFile(SCHOOL_A, key)).toEqual(png)
  })

  it("driver local menulis di bawah STORAGE_DIR", async () => {
    if (driver !== "local") return
    await putFile(SCHOOL_A, ["logo.png"], png)
    expect(await readdir(join(dir, "schools", SCHOOL_A))).toContain("logo.png")
  })
})

describe("pemilihan driver", () => {
  it("produksi tanpa STORAGE_DRIVER ditolak", async () => {
    const env = process.env as Record<string, string | undefined>
    const before = { driver: env.STORAGE_DRIVER, node: env.NODE_ENV }
    delete env.STORAGE_DRIVER
    env.NODE_ENV = "production"
    try {
      await expect(putFile(SCHOOL_A, ["a.png"], png)).rejects.toThrow(/STORAGE_DRIVER/)
    } finally {
      env.NODE_ENV = before.node
      if (before.driver) env.STORAGE_DRIVER = before.driver
    }
  })
})
