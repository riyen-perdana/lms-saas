import { Link } from "@tanstack/react-router"
import { GraduationCap } from "lucide-react"

import { Container } from "@/components/marketing/section"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const NAV = [
  { href: "#fitur", label: "Fitur" },
  { href: "#untuk-siapa", label: "Untuk siapa" },
  { href: "#ujian-cbt", label: "Ujian CBT" },
  { href: "#harga", label: "Harga" },
  { href: "#faq", label: "FAQ" },
]

export function Brand() {
  return (
    <span className="flex items-center gap-2 text-sm font-semibold">
      <span className="flex size-6 items-center justify-center rounded-md bg-primary text-primary-foreground">
        <GraduationCap className="size-3.5" aria-hidden />
      </span>
      EduSaaS
    </span>
  )
}

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur">
      <Container className="flex h-14 items-center justify-between gap-4">
        <div className="flex items-center gap-8">
          <a href="/" aria-label="EduSaaS — beranda">
            <Brand />
          </a>
          <nav aria-label="Utama" className="hidden items-center gap-5 md:flex">
            {NAV.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                {item.label}
              </a>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/login"
            className={cn(buttonVariants({ variant: "ghost" }), "rounded-md")}
          >
            Masuk
          </Link>
          <a href="/daftar" className={cn(buttonVariants(), "rounded-md")}>
            Coba gratis
          </a>
        </div>
      </Container>
    </header>
  )
}
