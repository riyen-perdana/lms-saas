// Halaman fitur detail (LP-02): Kelas, CBT, Laporan orang tua.

import { createFileRoute, redirect } from "@tanstack/react-router"

import { FinalCta, SiteFooter } from "@/components/marketing/closing"
import { FeatureSection } from "@/components/marketing/feature-section"
import { Section } from "@/components/marketing/section"
import { SiteHeader } from "@/components/marketing/site-header"
import { FEATURE_GROUPS } from "@/features/marketing/features"
import { seoMeta } from "@/lib/seo"
import { getTenantArea } from "@/lib/tenant/server"

export const Route = createFileRoute("/(marketing)/fitur")({
  staticData: { theme: "marketing" },
  beforeLoad: async () => {
    if ((await getTenantArea()) !== "marketing") throw redirect({ to: "/" })
  },
  head: () => ({
    meta: seoMeta({
      title: "Fitur — EduSaaS",
      description:
        "Kelas, materi, tugas, ujian CBT, dan laporan nilai untuk orang tua dalam satu LMS sekolah.",
    }),
  }),
  component: FeaturesPage,
})

function FeaturesPage() {
  return (
    <div className="bg-background text-foreground">
      <SiteHeader />
      <main id="konten">
        <Section className="pb-0 md:pb-0">
          <div className="flex max-w-2xl flex-col gap-3">
            <h1 className="text-mk-display">Fitur EduSaaS</h1>
            <p className="text-mk-lead text-muted-foreground">
              Tiga modul inti untuk pembelajaran sehari-hari, ujian, dan
              pelaporan ke orang tua. Fitur yang berlabel "Segera hadir" sedang
              dikerjakan. Lihat{" "}
              <a href="/harga" className="underline underline-offset-4">
                paket dan harga
              </a>{" "}
              untuk pembagiannya.
            </p>
          </div>
        </Section>
        {FEATURE_GROUPS.map((group, index) => (
          <FeatureSection key={group.id} group={group} subtle={index % 2 === 1} />
        ))}
        <div className="pt-16 md:pt-24">
          <FinalCta />
        </div>
      </main>
      <SiteFooter />
    </div>
  )
}
