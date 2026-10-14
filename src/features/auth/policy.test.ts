import { describe, expect, it } from "vitest"

import { isSchoolBlocked } from "@/features/auth/policy"
import { SCHOOL_STATUSES } from "@/features/platform/schema"

describe("isSchoolBlocked", () => {
  it("hanya memblokir sekolah yang ditangguhkan", () => {
    const blocked = SCHOOL_STATUSES.filter((status) => isSchoolBlocked(status))

    expect(blocked).toEqual(["suspended"])
  })
})
