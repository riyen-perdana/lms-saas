// Server function publik: daftar paket untuk halaman harga (tanpa cek peran).

import { createServerFn } from "@tanstack/react-start"

import { listPublicPlans } from "@/features/pricing/service"

export const getPublicPlans = createServerFn({ method: "GET" }).handler(() =>
  listPublicPlans()
)
