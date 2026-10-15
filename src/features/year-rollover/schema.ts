// Skema input kenaikan kelas / pergantian semester (OB-04).
//
// Hanya uuid, enum, dan nama rombel yang sudah di-trim, supaya idempoten:
// diparse di klien lalu diparse lagi di server tanpa berubah (docs/PROGRESS.md
// "Jebakan").

import { z } from "zod"

/** `same`: tingkat tetap (mis. Ganjil -> Genap). `promote`: naik satu tingkat. */
export const ROLLOVER_MODES = ["same", "promote"] as const

export const ROLLOVER_MODE_LABELS: Record<(typeof ROLLOVER_MODES)[number], string> = {
  same: "Tingkat tetap (mis. Ganjil ke Genap)",
  promote: "Naik tingkat (tahun ajaran baru)",
}

const semesterPair = {
  sourceSemesterId: z.uuid("Semester sumber tidak valid"),
  targetSemesterId: z.uuid("Semester tujuan tidak valid"),
  mode: z.enum(ROLLOVER_MODES, "Mode tidak valid"),
}

export const rolloverPreviewSchema = z.object(semesterPair)

/** `names`: nama rombel tujuan hasil suntingan admin, dikunci oleh id rombel sumber. */
export const rolloverSchema = z.object({
  ...semesterPair,
  names: z.record(
    z.uuid("Rombel tidak valid"),
    z.string().trim().min(1, "Nama rombel wajib diisi").max(64, "Nama terlalu panjang")
  ),
})

export const semesterIdSchema = z.object({ semesterId: z.uuid("Semester tidak valid") })

export type RolloverPreviewInput = z.infer<typeof rolloverPreviewSchema>
export type RolloverInput = z.infer<typeof rolloverSchema>
