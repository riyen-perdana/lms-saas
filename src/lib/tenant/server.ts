// Server function kecil: area tenant untuk host request ini (marketing /
// platform / school), dipakai route untuk memutuskan halaman mana yang tampil.

import { createServerFn } from "@tanstack/react-start"

export const getTenantArea = createServerFn({ method: "GET" }).handler(
  ({ context }) => context.tenant.area
)
