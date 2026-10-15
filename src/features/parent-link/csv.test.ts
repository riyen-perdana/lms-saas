import { describe, expect, it } from "vitest"

import { invitesToCsv } from "./csv"

describe("CSV kode undangan", () => {
  it("memuat header, BOM, dan tanggal berlaku", () => {
    const csv = invitesToCsv([
      {
        nis: "1001",
        name: "Ani",
        code: "ABCD-2345",
        expiresAt: new Date("2026-10-29T00:00:00Z"),
      },
    ])
    expect(csv.startsWith("﻿NIS,Nama,Kode undangan,Berlaku sampai\r\n")).toBe(
      true
    )
    expect(csv).toContain("1001,Ani,ABCD-2345,2026-10-29")
  })

  it("mengutip koma dan tanda kutip", () => {
    const csv = invitesToCsv([
      { nis: "1", name: 'Budi, "B"', code: "X", expiresAt: new Date(0) },
    ])
    expect(csv).toContain('"Budi, ""B"""')
  })

  it("menetralkan sel yang dibaca sebagai rumus", () => {
    const csv = invitesToCsv([
      { nis: "1", name: '=HYPERLINK("x")', code: "X", expiresAt: new Date(0) },
    ])
    expect(csv).toContain("'=HYPERLINK")
    expect(csv).not.toMatch(/,=HYPERLINK/)
  })
})
