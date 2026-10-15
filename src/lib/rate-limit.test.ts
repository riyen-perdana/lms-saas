import { randomUUID } from "node:crypto"

import { afterAll, describe, expect, it } from "vitest"

import { prisma } from "@/db/client"
import {
  RateLimitError,
  clientAddress,
  consumeRateLimit,
  purgeExpiredRateLimits,
  releaseRateLimit,
} from "@/lib/rate-limit"

const bucket = `test-${randomUUID().slice(0, 8)}`
const rule = { bucket, limit: 3, windowSeconds: 60 }

afterAll(async () => {
  await prisma.rateLimit.deleteMany({ where: { key: { startsWith: bucket } } })
})

describe("consumeRateLimit", () => {
  it("mengizinkan sampai batas lalu menolak", async () => {
    const now = new Date("2026-10-14T10:00:00Z")
    for (let i = 0; i < 3; i++) {
      await consumeRateLimit(rule, "1.1.1.1", now)
    }
    await expect(consumeRateLimit(rule, "1.1.1.1", now)).rejects.toBeInstanceOf(
      RateLimitError
    )
  })

  it("menghitung per alamat secara terpisah", async () => {
    const now = new Date("2026-10-14T10:00:00Z")
    for (let i = 0; i < 3; i++) {
      await consumeRateLimit(rule, "2.2.2.2", now)
    }
    await expect(
      consumeRateLimit(rule, "3.3.3.3", now)
    ).resolves.toBeUndefined()
  })

  it("membuka kembali setelah jendela berakhir", async () => {
    const start = new Date("2026-10-14T10:00:00Z")
    for (let i = 0; i < 3; i++) {
      await consumeRateLimit(rule, "4.4.4.4", start)
    }
    const later = new Date(start.getTime() + 61_000)
    await expect(
      consumeRateLimit(rule, "4.4.4.4", later)
    ).resolves.toBeUndefined()
  })

  it("melaporkan sisa waktu tunggu", async () => {
    const now = new Date("2026-10-14T10:00:00Z")
    for (let i = 0; i < 3; i++) {
      await consumeRateLimit(rule, "5.5.5.5", now)
    }
    const error = await consumeRateLimit(rule, "5.5.5.5", now).catch(
      (e: unknown) => e
    )
    expect((error as RateLimitError).retryAfterSeconds).toBe(60)
  })

  it("purge menghapus hanya jendela yang sudah lewat", async () => {
    const old = new Date("2020-01-01T00:00:00Z")
    await consumeRateLimit(rule, "6.6.6.6", old)
    await purgeExpiredRateLimits(new Date("2026-10-14T10:00:00Z"))
    const left = await prisma.rateLimit.findUnique({
      where: { key: `${bucket}:6.6.6.6` },
    })
    expect(left).toBeNull()
  })
})

describe("clientAddress", () => {
  it("memakai entri pertama x-forwarded-for", () => {
    const headers = new Headers({ "x-forwarded-for": "9.9.9.9, 10.0.0.1" })
    expect(clientAddress(headers)).toBe("9.9.9.9")
  })

  it("jatuh ke unknown bila tanpa header", () => {
    expect(clientAddress(new Headers())).toBe("unknown")
  })
})

describe("releaseRateLimit", () => {
  const relRule = { bucket: `${bucket}-rel`, limit: 5, windowSeconds: 60 }
  const now = new Date("2026-10-14T10:00:00Z")
  const countOf = async (subject: string) =>
    (
      await prisma.rateLimit.findUnique({
        where: { key: `${relRule.bucket}:${subject}` },
      })
    )?.count ?? null

  it("mengurangi hitungan satu", async () => {
    await consumeRateLimit(relRule, "a", now)
    await consumeRateLimit(relRule, "a", now)
    await releaseRateLimit(relRule, "a", now)
    expect(await countOf("a")).toBe(1)
  })

  it("tidak turun di bawah nol", async () => {
    await consumeRateLimit(relRule, "b", now)
    await releaseRateLimit(relRule, "b", now)
    await releaseRateLimit(relRule, "b", now)
    await releaseRateLimit(relRule, "b", now)
    expect(await countOf("b")).toBe(0)
  })

  it("tidak melakukan apa pun bila baris tidak ada", async () => {
    await releaseRateLimit(relRule, "tidak-ada", now)
    expect(await countOf("tidak-ada")).toBeNull()
  })

  it("tidak mengubah jendela yang sudah lewat", async () => {
    await consumeRateLimit(relRule, "c", now)
    const later = new Date(now.getTime() + 61_000)
    await releaseRateLimit(relRule, "c", later)
    expect(await countOf("c")).toBe(1)
  })

  it("subjek lain tidak terpengaruh", async () => {
    await consumeRateLimit(relRule, "d", now)
    await consumeRateLimit(relRule, "e", now)
    await releaseRateLimit(relRule, "d", now)
    expect(await countOf("d")).toBe(0)
    expect(await countOf("e")).toBe(1)
  })
})
