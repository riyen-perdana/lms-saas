import { describe, expect, it } from "vitest"

import { cn } from "@/lib/utils"

describe("cn", () => {
  it("menggabungkan nama kelas", () => {
    expect(cn("px-2", "py-1")).toBe("px-2 py-1")
  })

  it("membuang nilai falsy", () => {
    const nilaiFalsy: Array<string | false | null | undefined> = [
      null,
      undefined,
      "",
      false,
    ]
    expect(cn("px-2", ...nilaiFalsy, "py-1")).toBe("px-2 py-1")
  })

  it("menggabungkan tailwind yang bertentangan, kelas terakhir menang", () => {
    expect(cn("px-2", "px-4")).toBe("px-4")
  })

  it("menerima array dan objek", () => {
    expect(cn(["px-2", "py-1"], { "text-sm": true, hidden: false })).toBe(
      "px-2 py-1 text-sm"
    )
  })
})
