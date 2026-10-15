// Skema input penugasan guru (OB-03).
//
// Sengaja hanya berisi uuid tanpa transform apa pun supaya idempoten: diparse
// di klien, dikirim ke server function, lalu diparse lagi di server tanpa
// berubah (lihat docs/PROGRESS.md "Jebakan").

import { z } from "zod"

/** Kelas pembelajaran = rombel x mapel x guru pada satu semester. */
export const courseSchema = z.object({
  semesterId: z.uuid("Semester tidak valid"),
  classroomId: z.uuid("Rombel tidak valid"),
  subjectId: z.uuid("Mata pelajaran tidak valid"),
  teacherId: z.uuid("Guru tidak valid"),
})

/** Penetapan wali kelas satu rombel. */
export const homeroomSchema = z.object({
  classroomId: z.uuid("Rombel tidak valid"),
  teacherId: z.uuid("Guru tidak valid"),
})

/** Penghapusan kelas pembelajaran: hanya id yang dibutuhkan. */
export const courseIdSchema = z.object({ id: z.uuid("Kelas pembelajaran tidak valid") })

/** Pencabutan wali kelas: hanya id rombel yang dibutuhkan. */
export const classroomIdSchema = z.object({ classroomId: z.uuid("Rombel tidak valid") })

export type CourseInput = z.infer<typeof courseSchema>
export type HomeroomInput = z.infer<typeof homeroomSchema>