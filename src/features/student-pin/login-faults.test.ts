// @vitest-environment node
// Unit test jalur galat login PIN: pencadangan/pelepasan jatah laju saat
// consume gagal karena galat non-RateLimitError, dan saat pelepasan gagal.
// Semua dependensi di-mock (tanpa database).

import { beforeEach, describe, expect, it, vi } from "vitest"

import { RateLimitError } from "@/lib/rate-limit"

import { StudentLoginError, loginWithStudentPin } from "./login"

const mocks = vi.hoisted(() => ({
  consume: vi.fn(),
  release: vi.fn(),
  verify: vi.fn(),
}))

vi.mock("@/lib/rate-limit", () => {
  class MockRateLimitError extends Error {
    constructor(public readonly retryAfterSeconds: number) {
      super("Terlalu banyak percobaan.")
    }
  }
  return {
    RateLimitError: MockRateLimitError,
    consumeRateLimit: mocks.consume,
    releaseRateLimit: mocks.release,
  }
})
vi.mock("@/lib/tenant/resolve", () => ({
  resolveTenant: () =>
    Promise.resolve({ area: "school", school: { id: "sekolah-1" } }),
}))
vi.mock("./service", () => ({ verifyStudentPin: mocks.verify }))

const input = {
  host: "x.localhost:3000",
  ip: "1.1.1.1",
  nis: "7001",
  pin: "123456",
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.consume.mockResolvedValue(undefined)
  mocks.release.mockResolvedValue(undefined)
})

describe("loginWithStudentPin jalur galat", () => {
  it("galat DB pada consume ke-2: hanya jatah ke-1 dikembalikan, galat asli dilempar", async () => {
    const dbError = new Error("db down")
    mocks.consume
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(dbError)

    await expect(loginWithStudentPin(input)).rejects.toBe(dbError)
    expect(mocks.release).toHaveBeenCalledTimes(1)
    expect(mocks.release.mock.calls[0][1]).toBe(`sekolah-1:7001:1.1.1.1`)
    expect(mocks.verify).not.toHaveBeenCalled()
  })

  it("RateLimitError pada consume ke-2: jatah ke-1 dan yang ditolak dikembalikan", async () => {
    mocks.consume
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new RateLimitError(30))

    const error = await loginWithStudentPin(input).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(StudentLoginError)
    expect((error as StudentLoginError).code).toBe("RATE_LIMITED")
    expect(mocks.release).toHaveBeenCalledTimes(2)
  })

  it("pelepasan yang gagal tidak menutupi hasil login sukses", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined)
    mocks.verify.mockResolvedValue({ userId: "u1" })
    mocks.release.mockRejectedValue(new Error("db down"))

    await expect(loginWithStudentPin(input)).resolves.toEqual({ userId: "u1" })
    expect(spy).toHaveBeenCalledTimes(3)
    spy.mockRestore()
  })

  it("pelepasan yang gagal tidak menutupi galat verifikasi asli", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined)
    const verifyError = new Error("verify boom")
    mocks.verify.mockRejectedValue(verifyError)
    mocks.release.mockRejectedValue(new Error("db down"))

    await expect(loginWithStudentPin(input)).rejects.toBe(verifyError)
    spy.mockRestore()
  })
})
