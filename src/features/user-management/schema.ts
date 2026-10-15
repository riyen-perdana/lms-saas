// Skema masukan manajemen pengguna (US-02). Dipakai klien lalu server, jadi
// harus idempoten (parse dua kali menghasilkan nilai yang sama).

import { z } from "zod"

export const PEOPLE_LIMIT = 100

export const listPeopleSchema = z.object({
  role: z.enum(["all", "teacher", "student"]).default("all"),
  q: z.string().trim().max(100).default(""),
})

export type ListPeopleInput = z.input<typeof listPeopleSchema>

export const teacherIdSchema = z.object({ teacherId: z.uuid() })
