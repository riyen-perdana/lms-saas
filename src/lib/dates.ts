// Aritmetika tanggal dalam UTC (AGENTS.md aturan 6: waktu disimpan UTC).

/**
 * Menambah bulan tanpa meluap ke bulan berikutnya: 31 Agustus + 6 bulan
 * menjadi 28/29 Februari, bukan 3 Maret.
 */
export function addMonthsUtc(date: Date, months: number): Date {
  const result = new Date(date.getTime())
  const day = result.getUTCDate()

  result.setUTCDate(1)
  result.setUTCMonth(result.getUTCMonth() + months)

  const lastDay = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)
  ).getUTCDate()
  result.setUTCDate(Math.min(day, lastDay))

  return result
}

export function addDaysUtc(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000)
}
