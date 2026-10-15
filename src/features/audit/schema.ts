// Skema dan daftar aksi log audit (US-04). Daftar aksi tunggal ini dipakai
// service (tipe), filter di UI (label), dan validasi server function.

import { z } from "zod"

export const AUDIT_ACTIONS = {
  "subscription.activate": "Aktivasi paket langganan",
  "school.suspend": "Penangguhan sekolah",
  "school.reactivate": "Pengaktifan kembali sekolah",
  "import.start": "Impor guru/siswa",
  "rollover.run": "Kenaikan kelas / pergantian semester",
  "parent_link.revoke": "Pencabutan tautan atau kode orang tua",
  "course.remove": "Penghapusan kelas pembelajaran",
  "homeroom.clear": "Pencabutan wali kelas",
  "user.password_reset": "Permintaan reset sandi pengguna",
} as const

export type AuditAction = keyof typeof AUDIT_ACTIONS

const ACTION_KEYS = Object.keys(AUDIT_ACTIONS) as [AuditAction, ...AuditAction[]]

export const AUDIT_PAGE_SIZE = 50

export const listAuditSchema = z.object({
  action: z.enum(ACTION_KEYS).optional(),
  /** id baris terakhir halaman sebelumnya (uuid v7, urut waktu). */
  cursor: z.uuid().optional(),
})

export type ListAuditInput = z.infer<typeof listAuditSchema>
