import { Check } from "lucide-react"

import { Section, SectionHeading } from "@/components/marketing/section"
import type { FeatureGroup } from "@/features/marketing/features"

function SoonBadge() {
  return (
    <span className="shrink-0 rounded-md border border-border px-1.5 py-0.5 text-xs text-muted-foreground">
      Segera hadir
    </span>
  )
}

/** Satu modul fitur. Bila semua poin belum rilis, label tampil sekali di judul. */
export function FeatureSection({
  group,
  subtle,
}: {
  group: FeatureGroup
  subtle?: boolean
}) {
  const allSoon = group.points.every((point) => point.soon)

  return (
    <Section id={group.id} subtle={subtle}>
      <div className="grid gap-10 md:grid-cols-[2fr_3fr]">
        <div className="flex flex-col items-start gap-4">
          <SectionHeading
            eyebrow={group.eyebrow}
            title={group.title}
            lead={group.lead}
          />
          {allSoon ? <SoonBadge /> : null}
        </div>
        <ul className="flex flex-col divide-y divide-border border-y border-border">
          {group.points.map((point) => (
            <li key={point.text} className="flex items-start gap-3 py-3">
              <Check
                className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                aria-hidden
              />
              <span className="flex-1 text-mk-body">{point.text}</span>
              {!allSoon && point.soon ? <SoonBadge /> : null}
            </li>
          ))}
        </ul>
      </div>
    </Section>
  )
}
