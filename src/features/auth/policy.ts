// Kebijakan akses berdasarkan status sekolah.
// ---------------------------------------------------------------------------
// `suspended` memblokir seluruh akses pengguna sekolah (login dan sesi yang
// sudah ada). Status lain tetap boleh masuk: `readonly` dan `grace` membatasi
// penulisan, bukan akses, dan itu ditegakkan modul masing-masing nanti.

import type { SchoolStatus } from "@/features/platform/schema"

export const BLOCKED_SCHOOL_STATUSES: readonly SchoolStatus[] = ["suspended"]

export function isSchoolBlocked(status: string): boolean {
  return (BLOCKED_SCHOOL_STATUSES as readonly string[]).includes(status)
}

export const SUSPENDED_MESSAGE =
  "Sekolah ini sedang ditangguhkan. Hubungi administrator platform untuk mengaktifkannya kembali."
