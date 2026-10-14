import type { ReactNode } from "react"

import { SiteFooter } from "@/components/marketing/closing"
import { Container } from "@/components/marketing/section"
import { SiteHeader } from "@/components/marketing/site-header"

/** Kerangka halaman hukum (privasi, syarat): judul, tanggal, lalu bagian bernomor. */
export function LegalPage({
  title,
  updated,
  children,
}: {
  title: string
  updated: string
  children: ReactNode
}) {
  return (
    <div className="bg-background text-foreground">
      <SiteHeader />
      <main className="py-12 md:py-20">
        <Container className="max-w-2xl">
          <h1 className="text-mk-h2">{title}</h1>
          <p className="mt-2 text-xs text-muted-foreground">
            Terakhir diperbarui: {updated}
          </p>
          <div className="mt-8 flex flex-col gap-8">{children}</div>
        </Container>
      </main>
      <SiteFooter />
    </div>
  )
}

export function LegalSection({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold">{title}</h2>
      <div className="flex flex-col gap-2 text-mk-body text-muted-foreground">
        {children}
      </div>
    </section>
  )
}
