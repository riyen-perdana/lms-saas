import { Badge } from "@/components/ui/badge"
import {
  SCHOOL_STATUS_LABELS,
  type SchoolStatus,
} from "@/features/platform/schema"
import { cn } from "@/lib/utils"

// Warna hanya untuk status (AGENTS.md "Styling & tema").
const STYLES: Record<SchoolStatus, string> = {
  trial:
    "border-status-warning-border bg-status-warning-bg text-status-warning-text",
  active:
    "border-status-success-border bg-status-success-bg text-status-success-text",
  grace:
    "border-status-warning-border bg-status-warning-bg text-status-warning-text",
  readonly: "border-border bg-muted text-muted-foreground",
  suspended:
    "border-status-danger-border bg-status-danger-bg text-status-danger-text",
}

export function SchoolStatusBadge({ status }: { status: SchoolStatus }) {
  return (
    <Badge variant="outline" className={cn("rounded-md", STYLES[status])}>
      {SCHOOL_STATUS_LABELS[status]}
    </Badge>
  )
}
