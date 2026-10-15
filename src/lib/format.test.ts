import { describe, expect, it } from "vitest"

import { initials } from "@/lib/format"

describe("initials", () => {
  it("mengambil huruf awal dua kata pertama dalam huruf besar", () => {
    expect(initials("Riyen Perdana")).toBe("RP")
    expect(initials("budi santoso wijaya")).toBe("BS")
  })

  it("satu kata dan spasi berlebih", () => {
    expect(initials("Admin")).toBe("A")
    expect(initials("  Sri   Mulyani ")).toBe("SM")
  })

  it("string kosong", () => {
    expect(initials("")).toBe("")
  })
})
