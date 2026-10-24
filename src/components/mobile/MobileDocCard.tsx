import { ChevronRight, Star } from "lucide-react"
import type { Doc } from "@/types"
import { cn } from "@/lib/utils"
import { typeIcon, useDocTypes } from "@/lib/typeMeta"

interface MobileDocCardProps {
  doc: Pick<Doc, "id" | "title" | "naming_code" | "type" | "live_version" | "current_version">
  onClick: () => void
  saved?: boolean
  onToggleSave?: () => void
}

/**
 * A document row on the floor: the title on up to two lines and one meta
 * line "SOP · EXT-OPS-SOP-0001 · v2". Everything on the floor is Published,
 * so there is no status badge. Save is its own button next to the row.
 */
export function MobileDocCard({ doc, onClick, saved, onToggleSave }: MobileDocCardProps) {
  const { resolve } = useDocTypes()
  const meta = resolve(doc.type)
  const Icon = typeIcon(meta.icon)
  return (
    <div className="flex items-stretch rounded-2xl border bg-card shadow-sm">
      <button
        type="button"
        onClick={onClick}
        className="flex min-h-16 min-w-0 flex-1 items-center gap-3 rounded-2xl py-3 pl-3 pr-1 text-left transition active:scale-[0.99]"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted text-slate-600 dark:text-slate-300">
          <Icon className="h-5 w-5" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="line-clamp-2 text-base font-semibold leading-snug text-foreground">{doc.title}</span>
          <span className="truncate text-[13px] text-muted-foreground">
            {meta.token || meta.label} · <span className="font-mono">{doc.naming_code}</span> · v
            {doc.live_version ?? doc.current_version}
          </span>
        </span>
        {!onToggleSave && <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />}
      </button>
      {onToggleSave && (
        <SaveButton saved={!!saved} onToggle={onToggleSave} what="document" />
      )}
    </div>
  )
}

export function SaveButton({ saved, onToggle, what }: { saved: boolean; onToggle: () => void; what: string }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={saved}
      aria-label={saved ? `Saved. Remove this ${what} from Saved` : `Save this ${what}`}
      className={cn(
        "flex w-12 shrink-0 items-center justify-center rounded-r-2xl transition active:scale-95",
        saved ? "text-amber-500" : "text-muted-foreground",
      )}
    >
      <Star className={cn("h-5 w-5", saved && "fill-amber-500")} />
    </button>
  )
}
