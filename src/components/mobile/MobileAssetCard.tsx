// Compact asset list-card for the mobile assets list and the Ask scope picker.
// Shows the floor pin and the number of Published documents, each labelled,
// at a tap-friendly density.

import { ChevronRight, Files, MapPin, Star } from "lucide-react"
import type { Asset } from "@/types"
import { cn } from "@/lib/utils"

interface MobileAssetCardProps {
  asset: Asset
  docCount?: number
  /** Not shown: asset logs are not used on the floor. */
  logCount?: number
  onClick: () => void
  pinned?: boolean
  onTogglePin?: () => void
}

export function MobileAssetCard({
  asset,
  docCount,
  onClick,
  pinned,
  onTogglePin,
}: MobileAssetCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-2xl border bg-card p-3.5 text-left shadow-sm transition active:scale-[0.99]"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
          {asset.code}
        </div>
        <div className="truncate text-sm font-semibold text-foreground">
          {asset.name}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {asset.pin_number != null && (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-primary">
              <MapPin className="h-2.5 w-2.5" />
              Pin {String(asset.pin_number).padStart(2, "0")}
            </span>
          )}
          {docCount != null && (
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                docCount > 0
                  ? "bg-primary/10 text-primary"
                  : "border border-dashed border-muted-foreground/20 text-muted-foreground",
              )}
            >
              <Files className="h-2.5 w-2.5" />
              {docCount} {docCount === 1 ? "doc" : "docs"}
            </span>
          )}
          {asset.location && (
            <span className="truncate text-[10px] text-muted-foreground">
              {asset.location}
            </span>
          )}
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
          aria-label={pinned ? "Unpin asset" : "Pin asset"}
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition",
            pinned
              ? "text-amber-500 hover:bg-amber-500/10"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          <Star
            className={cn("h-4 w-4", pinned ? "fill-amber-500" : "")}
          />
        </span>
      )}
      <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
    </button>
  )
}
