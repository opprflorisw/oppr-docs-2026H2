import { ChevronRight, Star } from "lucide-react"
import { StatusBadge } from "@/components/docs/StatusBadge"
import { TypeBadge } from "@/components/docs/TypeBadge"
import type { Doc } from "@/types"
import { cn } from "@/lib/utils"
import { effectiveStatus } from "@/lib/docStatus"

interface MobileDocCardProps {
  doc: Doc
  onClick: () => void
  pinned?: boolean
  onTogglePin?: () => void
}

/**
 * Compact mobile doc card: title, naming code, type+status badges. Shows the
 * Published version an Operator reads, not a revision being drafted. Optional
 * pin star on the right that toggles via stopPropagation so the row tap still
 * opens the document.
 */
export function MobileDocCard({
  doc,
  onClick,
  pinned,
  onTogglePin,
}: MobileDocCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-2xl border bg-card p-4 text-left shadow-sm transition active:scale-[0.99]"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="truncate text-sm font-semibold text-foreground">
          {doc.title}
        </div>
        <div className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
          {doc.naming_code}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <TypeBadge type={doc.type} className="px-1.5 py-0 text-[10px]" />
          <StatusBadge status={effectiveStatus(doc)} className="px-1.5 py-0 text-[10px]" />
          <span className="font-mono text-[10px] text-muted-foreground">
            v{doc.live_version ?? doc.current_version}
          </span>
        </div>
      </div>
      {onTogglePin && (
        <span
          role="button"
          tabIndex={-1}
          onClick={(e) => {
            e.stopPropagation()
            onTogglePin()
          }}
          aria-label={pinned ? "Unpin document" : "Pin document"}
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition",
            pinned
              ? "text-amber-500 hover:bg-amber-500/10"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          <Star className={cn("h-4 w-4", pinned ? "fill-amber-500" : "")} />
        </span>
      )}
      <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
    </button>
  )
}
