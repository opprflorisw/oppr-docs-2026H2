// An Asset row on the floor: code, name, its spot on the floor plan and
// how many Published documents it has. Save is its own button.

import { ChevronRight, Files } from "lucide-react"
import type { Asset } from "@/types"
import { SaveButton } from "./MobileDocCard"

interface MobileAssetCardProps {
  asset: Pick<Asset, "id" | "code" | "name" | "location" | "pin_number">
  docCount?: number
  /** Not shown: asset logs are not used on the floor. */
  logCount?: number
  onClick: () => void
  saved?: boolean
  onToggleSave?: () => void
}

/** "On the floor plan" when the Asset has a place on the plan. */
export function spotLabel(pin: number | null | undefined): string | null {
  return pin == null ? null : "On the floor plan"
}

export function MobileAssetCard({ asset, docCount, onClick, saved, onToggleSave }: MobileAssetCardProps) {
  return (
    <div className="flex items-stretch rounded-2xl border bg-card shadow-sm">
      <button
        type="button"
        onClick={onClick}
        className="flex min-h-16 min-w-0 flex-1 flex-col gap-0.5 rounded-2xl py-3 pl-4 pr-1 text-left transition active:scale-[0.99]"
      >
        <span className="font-mono text-[13px] font-medium text-muted-foreground">{asset.code}</span>
        <span className="line-clamp-2 text-base font-semibold leading-snug text-foreground">{asset.name}</span>
        <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[13px] text-muted-foreground">
          {docCount != null && (
            <span className="inline-flex items-center gap-1">
              <Files className="h-3.5 w-3.5" />
              {docCount} {docCount === 1 ? "document" : "documents"}
            </span>
          )}
          {asset.location && <span className="truncate">{asset.location}</span>}
        </span>
      </button>
      {onToggleSave ? (
        <SaveButton saved={!!saved} onToggle={onToggleSave} what="Asset" />
      ) : (
        <span className="flex w-10 shrink-0 items-center justify-center text-muted-foreground">
          <ChevronRight className="h-5 w-5" />
        </span>
      )}
    </div>
  )
}
