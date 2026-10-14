import type { ComponentProps, ReactNode } from "react"

import { cn } from "@/lib/utils"

export function Container({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn("mx-auto w-full max-w-mk px-4 md:px-6", className)}
      {...props}
    />
  )
}

/** Pita section landing; `subtle` memberi latar abu sangat tipis. */
export function Section({
  id,
  subtle,
  className,
  children,
}: {
  id?: string
  subtle?: boolean
  className?: string
  children: ReactNode
}) {
  return (
    <section
      id={id}
      className={cn(
        "scroll-mt-16 py-16 md:py-24",
        subtle && "bg-surface-subtle",
        className
      )}
    >
      <Container>{children}</Container>
    </section>
  )
}

export function SectionHeading({
  eyebrow,
  title,
  lead,
  className,
}: {
  eyebrow?: string
  title: ReactNode
  lead?: string
  className?: string
}) {
  return (
    <div className={cn("flex max-w-2xl flex-col gap-3", className)}>
      {eyebrow ? (
        <p className="text-mk-eyebrow text-muted-foreground">{eyebrow}</p>
      ) : null}
      <h2 className="text-mk-h2">{title}</h2>
      {lead ? <p className="text-mk-body text-muted-foreground">{lead}</p> : null}
    </div>
  )
}
