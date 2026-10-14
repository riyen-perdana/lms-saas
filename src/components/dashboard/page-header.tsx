import type { ReactNode } from "react"

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string
  description?: string
  actions?: ReactNode
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex flex-col gap-1">
        <h1 className="text-ds-page-title">{title}</h1>
        {description ? (
          <p className="text-ds-body text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions}
    </header>
  )
}
