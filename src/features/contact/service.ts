// Menyimpan pesan form kontak/demo (LP-05). Model global, tanpa tenantDb.

import { prisma } from "@/db/client"
import type { ContactInput } from "@/features/contact/schema"

export async function createContactRequest(input: ContactInput) {
  return prisma.contactRequest.create({
    data: {
      name: input.name,
      email: input.email,
      schoolName: input.schoolName,
      message: input.message,
    },
  })
}
