// CSV PIN siswa massal (US-01), dibuat di klien dari hasil server supaya PIN
// asli tidak pernah disimpan atau dikirim ulang.

const BOM = String.fromCharCode(0xfeff)

/** Sel yang diawali = + - @ atau tab/CR dibaca spreadsheet sebagai rumus; beri awalan apostrof. */
function cell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

export function pinsToCsv(
  rows: { nis: string; name: string; pin: string }[]
): string {
  const lines = [
    ["NIS", "Nama", "PIN"],
    ...rows.map((row) => [row.nis, row.name, row.pin]),
  ]
  // BOM supaya Excel membaca UTF-8 (nama berhuruf non-ASCII) dengan benar.
  return `${BOM}${lines.map((line) => line.map(cell).join(",")).join("\r\n")}\r\n`
}
