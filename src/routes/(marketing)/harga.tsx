// Halaman harga (LP-03): paket dibaca dari tabel `plans`.

import { createFileRoute, redirect } from "@tanstack/react-router"

import { FinalCta, SiteFooter } from "@/components/marketing/closing"
import { Pricing } from "@/components/marketing/pricing"
import { SiteHeader } from "@/components/marketing/site-header"
import { getPublicPlans } from "@/features/pricing/server/plans"
import { seoMeta } from "@/lib/seo"
import { getTenantArea } from "@/lib/tenant/server"

export const Route = createFileRoute("/(marketing)/harga")({
  staticData: { theme: "marketing" },
  beforeLoad: async () => {
    if ((await getTenantArea()) !== "marketing") throw redirect({ to: "/" })
  },
  loader: () => getPublicPlans(),
  head: () => ({
    meta: seoMeta({
      title: "Harga — EduSaaS",
      description:
        "Paket langganan per sekolah, bukan per guru. Mulai dengan trial 30 hari fitur lengkap.",
    }),
  }),
  component: PricingPage,
})

function PricingPage() {
  const plans = Route.useLoaderData()

  return (
    <div className="bg-background text-foreground">
      <SiteHeader />
      <main id="konten">
        <Pricing plans={plans} />
        <FinalCta />
      </main>
      <SiteFooter />
    </div>
  )
}
