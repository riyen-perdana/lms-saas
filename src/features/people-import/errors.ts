// Kesalahan impor yang bisa ditampilkan ke pengguna (OB-02).
// Dipisah dari service.ts supaya excel.ts (yang memanggil dari dalam) dan
// server function bisa memakai kelas yang sama tanpa mengimpor service.

export type PeopleImportErrorCode = "INVALID" | "DUPLICATE" | "NOT_FOUND"

export class PeopleImportError extends Error {
  constructor(
    readonly code: PeopleImportErrorCode,
    message: string
  ) {
    super(message)
    this.name = "PeopleImportError"
  }
}