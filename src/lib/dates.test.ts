import { describe, expect, it } from "vitest"

import { addDaysUtc, addMonthsUtc } from "@/lib/dates"

describe("addMonthsUtc", () => {
  it("menambah bulan biasa", () => {
    expect(
      addMonthsUtc(new Date("2026-10-14T03:00:00Z"), 6).toISOString()
    ).toBe("2027-04-14T03:00:00.000Z")
    expect(
      addMonthsUtc(new Date("2026-10-14T00:00:00Z"), 12).toISOString()
    ).toBe("2027-10-14T00:00:00.000Z")
  })

  it("menjepit ke akhir bulan, tidak meluap", () => {
    expect(
      addMonthsUtc(new Date("2026-08-31T00:00:00Z"), 6).toISOString()
    ).toBe("2027-02-28T00:00:00.000Z")
    expect(
      addMonthsUtc(new Date("2027-08-31T00:00:00Z"), 6).toISOString()
    ).toBe("2028-02-29T00:00:00.000Z")
  })

  it("tidak mengubah tanggal asli", () => {
    const original = new Date("2026-01-31T00:00:00Z")
    addMonthsUtc(original, 1)
    expect(original.toISOString()).toBe("2026-01-31T00:00:00.000Z")
  })
})

describe("addDaysUtc", () => {
  it("menambah hari", () => {
    expect(addDaysUtc(new Date("2026-10-14T00:00:00Z"), 30).toISOString()).toBe(
      "2026-11-13T00:00:00.000Z"
    )
  })
})
