// CSV kode undangan massal (OB-05), dibuat di klien dari hasil server supaya
// kode asli tidak pernah disimpan atau dikirim ulang.

const BOM = String.fromCharCode(0xfeff)

/** Sel yang diawali = + - @ atau tab/CR dibaca spreadsheet sebagai rumus; beri awalan apostrof. */
function cell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

export function invitesToCsv(
  rows: { nis: string; name: string; code: string; expiresAt: Date | string }[]
): string {
  const lines = [
    ["NIS", "Nama", "Kode undangan", "Berlaku sampai"],
    ...rows.map((row) => [
      row.nis,
      row.name,
      row.code,
      new Date(row.expiresAt).toISOString().slice(0, 10),
    ]),
  ]
  // BOM supaya Excel membaca UTF-8 (nama berhuruf non-ASCII) dengan benar.
  return `${BOM}${lines.map((line) => line.map(cell).join(",")).join("\r\n")}\r\n`
}
