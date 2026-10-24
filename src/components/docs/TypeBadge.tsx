import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { DocumentType } from "@/types"
import { typeIcon, useDocTypes } from "@/lib/typeMeta"

interface TypeBadgeProps {
  type: DocumentType
  className?: string
  /** Hide the label (used when space is tight). */
  iconOnly?: boolean
  /** Show the full type name instead of the short token (SOP, WI, LMRA). */
  long?: boolean
}

// A document-type chip from the editable namingTypes vocabulary. Types are
// neutral (grey outline plus icon) so they never read as a status, they never
// wrap, and the short token carries the full name as a tooltip. All badges
// share one Convex subscription via useDocTypes; unknown slugs fall back to a
// neutral placeholder so a deleted type still renders.
export function TypeBadge({ type, className, iconOnly, long }: TypeBadgeProps) {
  const { resolve } = useDocTypes()
  const meta = resolve(type)
  const Icon = typeIcon(meta.icon)
  const short = meta.token || meta.label
  return (
    <Badge
      variant="outline"
      title={meta.label}
      aria-label={meta.label}
      className={cn(
        "gap-1 whitespace-nowrap border-slate-300 bg-background font-medium text-slate-700",
        className,
      )}
    >
      <Icon className="h-3 w-3 shrink-0" aria-hidden />
      {!iconOnly && <span>{long ? meta.label : short}</span>}
    </Badge>
  )
}
