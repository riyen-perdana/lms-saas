// Beranda landing (LP-01). Hanya untuk host marketing; subdomain sekolah
// diarahkan ke /beranda (sudah login) atau /login, dan host platform ke /platform.

import { createFileRoute, redirect } from "@tanstack/react-router"

import {
  Faq,
  FinalCta,
  SiteFooter,
} from "@/components/marketing/closing"
import {
  CbtSection,
  Features,
  LevelStrip,
  Roles,
  Testimonial,
} from "@/components/marketing/content-sections"
import { Hero } from "@/components/marketing/hero"
import { Pricing } from "@/components/marketing/pricing"
import { SiteHeader } from "@/components/marketing/site-header"
import { getAccess } from "@/features/auth/server/access"
import { getTenantArea } from "@/lib/tenant/server"

export const Route = createFileRoute("/(marketing)/")({
  staticData: { theme: "marketing" },
  beforeLoad: async () => {
    const area = await getTenantArea()

    if (area === "platform") throw redirect({ to: "/platform" })

    if (area === "school") {
      const { access } = await getAccess()
      throw redirect({ to: access.status === "ok" ? "/beranda" : "/login" })
    }

    if (area !== "marketing") throw redirect({ to: "/login" })
  },
  head: () => ({
    meta: [
      { title: "EduSaaS — LMS untuk sekolah SD hingga SMK" },
      {
        name: "description",
        content:
          "Kelas, materi, tugas, ujian CBT, dan laporan nilai ke orang tua dalam satu platform di subdomain sekolah Anda. Coba gratis 30 hari.",
      },
    ],
  }),
  component: LandingPage,
})

function LandingPage() {
  return (
    <div className="bg-background text-foreground">
      <a
        href="#konten"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground"
      >
        Lewati ke konten
      </a>
      <SiteHeader />
      <main id="konten">
        <Hero />
        <LevelStrip />
        <Features />
        <Roles />
        <CbtSection />
        <Testimonial />
        <Pricing />
        <Faq />
        <FinalCta />
      </main>
      <SiteFooter />
    </div>
  )
}
