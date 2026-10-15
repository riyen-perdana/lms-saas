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
