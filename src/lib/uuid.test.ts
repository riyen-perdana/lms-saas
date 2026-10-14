// @vitest-environment node
import { describe, expect, it } from "vitest"

import { isUuidV7, uuidV7Timestamp, uuidv7 } from "@/lib/uuid"

describe("uuidv7", () => {
  it("menghasilkan UUID v7 yang valid", () => {
    expect(isUuidV7(uuidv7())).toBe(true)
  })

  it("menanamkan timestamp yang diberikan pada 48 bit pertama", () => {
    const now = new Date("2026-10-15T09:30:00.000Z")

    expect(uuidV7Timestamp(uuidv7(now))).toBe(now.getTime())
  })

  it("memasang version 7 dan variant RFC 9562", () => {
    const value = uuidv7()

    expect(value[14]).toBe("7")
    expect("89ab").toContain(value[19])
  })

  it("id berbeda walau dibuat pada milidetik yang sama", () => {
    const now = new Date("2026-10-15T09:30:00.000Z")
    const ids = new Set(Array.from({ length: 50 }, () => uuidv7(now)))

    expect(ids.size).toBe(50)
  })

  it("terurut menaik menurut waktu pembuatan", () => {
    const awal = new Date("2026-10-15T09:30:00.000Z")
    const akhir = new Date(awal.getTime() + 5)

    expect(uuidv7(akhir) > uuidv7(awal)).toBe(true)
  })

  it("menolak tanggal yang tidak valid", () => {
    expect(() => uuidv7(new Date("tidakValid"))).toThrow(RangeError)
  })
})

describe("isUuidV7", () => {
  it("menolak UUID versi lain dan nilai bukan uuid", () => {
    expect(isUuidV7("0f2b3c4d-5e6f-4a8b-9c0d-1e2f3a4b5c6d")).toBe(false)
    expect(isUuidV7("bukan-uuid")).toBe(false)
  })
})