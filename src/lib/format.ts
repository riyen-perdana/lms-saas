// Format tampilan. Waktu disimpan UTC (AGENTS.md aturan 6) dan ditampilkan
// dalam WIB dengan zona tetap, sehingga hasil SSR dan klien identik.

const DATE = new Intl.DateTimeFormat("id-ID", {
  dateStyle: "medium",
  timeZone: "Asia/Jakarta",
})

export function formatDate(value: Date | string): string {
  return DATE.format(new Date(value))
}

const RUPIAH = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
})

export function formatRupiah(value: number): string {
  return RUPIAH.format(value)
}

const MS_PER_DAY = 24 * 60 * 60 * 1000

/** Selisih hari (dibulatkan ke atas) dari `from` sampai `to`; negatif bila sudah lewat. */
export function daysUntil(to: Date | string, from: Date = new Date()): number {
  return Math.ceil((new Date(to).getTime() - from.getTime()) / MS_PER_DAY)
}
