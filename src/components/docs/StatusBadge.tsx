import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { DocumentStatus } from "@/types"

export const STATUS_LABELS: Record<DocumentStatus, string> = {
  pre_draft: "New draft",
  draft: "Draft",
  in_review: "In review",
  approved: "Approved",
  published: "Published",
  archived: "Archived",
}

/**
 * The status palette (index.css --status-*). These colours are reserved for
 * status: Draft grey, In review amber, Approved blue, Published green,
 * Archived slate. Nothing else on a page uses them.
 */
export const STATUS_CLASSES: Record<DocumentStatus, string> = {
  pre_draft:
    "border-dashed border-status-draft/40 bg-status-draft-bg text-status-draft",
  draft: "border-status-draft/25 bg-status-draft-bg text-status-draft",
  in_review: "border-status-review/30 bg-status-review-bg text-status-review",
  approved: "border-status-approved/30 bg-status-approved-bg text-status-approved",
  published:
    "border-status-published/30 bg-status-published-bg text-status-published",
  archived: "border-status-archived/30 bg-status-archived-bg text-status-archived",
}

interface StatusBadgeProps {
  status: DocumentStatus
  className?: string
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const label = STATUS_LABELS[status] ?? status
  return (
    <Badge
      variant="outline"
      className={cn(
        "whitespace-nowrap font-medium",
        STATUS_CLASSES[status] ?? STATUS_CLASSES.draft,
        className,
      )}
    >
      {label}
    </Badge>
  )
}
