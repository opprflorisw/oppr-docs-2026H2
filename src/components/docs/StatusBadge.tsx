import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { DocumentStatus } from "@/types"

export const STATUS_LABELS: Record<DocumentStatus, string> = {
  pre_draft: "Pre-draft",
  draft: "Draft",
  in_review: "In review",
  approved: "Approved",
  published: "Published",
  archived: "Archived",
}

interface StatusBadgeProps {
  status: DocumentStatus
  className?: string
}

/**
 * Maps a document status to a badge variant + colour:
 *   draft      → secondary (muted)
 *   in_review  → outline w/ amber text
 *   published  → success (green)
 *   archived   → outline w/ muted text
 */
export function StatusBadge({ status, className }: StatusBadgeProps) {
  const label = STATUS_LABELS[status] ?? status

  switch (status) {
    case "pre_draft":
      return (
        <Badge
          variant="outline"
          className={cn(
            "border-dashed border-muted-foreground/50 text-muted-foreground",
            className,
          )}
        >
          {label}
        </Badge>
      )
    case "draft":
      return (
        <Badge variant="secondary" className={cn("font-medium", className)}>
          {label}
        </Badge>
      )
    case "in_review":
      return (
        <Badge
          variant="outline"
          className={cn(
            "border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-50",
            className,
          )}
        >
          {label}
        </Badge>
      )
    case "approved":
      return (
        <Badge
          variant="outline"
          className={cn(
            "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-50",
            className,
          )}
        >
          {label}
        </Badge>
      )
    case "published":
      return (
        <Badge variant="success" className={cn("font-medium", className)}>
          {label}
        </Badge>
      )
    case "archived":
      return (
        <Badge
          variant="outline"
          className={cn("text-muted-foreground", className)}
        >
          {label}
        </Badge>
      )
    default:
      return <Badge className={className}>{label}</Badge>
  }
}
