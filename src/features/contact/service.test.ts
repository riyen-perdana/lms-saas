import { afterAll, describe, expect, it } from "vitest"

import { prisma } from "@/db/client"
import { contactSchema } from "@/features/contact/schema"
import { createContactRequest } from "@/features/contact/service"

const email = `kontak-${Date.now()}@sekolah.test`

afterAll(async () => {
  await prisma.contactRequest.deleteMany({ where: { email } })
})

describe("contactSchema", () => {
  const valid = {
    name: "Bu Rina",
    email: "  RINA@Sekolah.test ",
    schoolName: "",
    message: "Kami ingin jadwal demo untuk 300 siswa.",
  }

  it("menormalkan email dan mengosongkan nama sekolah kosong", () => {
    const parsed = contactSchema.parse(valid)
    expect(parsed.email).toBe("rina@sekolah.test")
    expect(parsed.schoolName).toBeUndefined()
  })

  it("idempoten bila diparse dua kali", () => {
    const once = contactSchema.parse(valid)
    expect(contactSchema.parse(once)).toEqual(once)
  })

  it("menolak pesan pendek dan email salah", () => {
    expect(contactSchema.safeParse({ ...valid, message: "halo" }).success).toBe(false)
    expect(contactSchema.safeParse({ ...valid, email: "bukan-email" }).success).toBe(false)
  })
})

describe("createContactRequest", () => {
  it("menyimpan pesan", async () => {
    const saved = await createContactRequest({
      name: "Pak Budi",
      email,
      schoolName: "SMA 1",
      message: "Mohon info paket Enterprise untuk yayasan kami.",
    })

    const row = await prisma.contactRequest.findUniqueOrThrow({
      where: { id: saved.id },
    })
    expect(row.schoolName).toBe("SMA 1")
  })
})
