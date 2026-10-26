// SafetyPalette
//
// Popover anchored to the toolbar's Safety button. Renders a 4×4 grid of
// typed callouts (CalloutKind) so authors can pick the correct safety frame
// instead of typing "LOTO required" into a generic Danger callout. Each
// click inserts a callout via the editor command and closes the popover.
//
// 13 entries currently, grouped visually by tone (danger / warning / notice
// / tip). The icon does the per-type lifting; tone is for severity scanning.

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import { ShieldAlert } from "lucide-react"
import { cn } from "@/lib/utils"
import { CALLOUT_META, type CalloutKind } from "./CalloutBlock"

// Grouped in the same order as the on-block "Change type" menu so creating a
// callout and re-typing one feel like the same picker.
const SAFETY_GROUPS: { title: string; kinds: CalloutKind[] }[] = [
  { title: "Danger", kinds: ["danger", "hotwork", "loto", "electrical"] },
  { title: "Warning", kinds: ["warning", "caution", "heights", "confined"] },
  { title: "Notice", kinds: ["notice", "authorised", "permit", "cryo"] },
  { title: "Tip", kinds: ["tip"] },
]

const TONE_TEXT: Record<string, string> = {
  danger: "text-red-700 dark:text-red-300",
  warning: "text-amber-700 dark:text-amber-300",
  notice: "text-sky-700 dark:text-sky-300",
  tip: "text-emerald-700 dark:text-emerald-300",
}

interface SafetyPaletteProps {
  onSelect: (kind: CalloutKind) => void
  /** Custom trigger; defaults to a 32×32 ghost button with a ShieldAlert icon. */
  children?: React.ReactNode
  /** Force-controlled open state (used by slash-menu integration). */
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export function SafetyPalette({
  onSelect,
  children,
  open,
  onOpenChange,
}: SafetyPaletteProps) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        {children ?? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 gap-1 px-2 text-xs"
            title="Insert a safety callout: danger, warning, caution or note"
          >
            <ShieldAlert className="h-4 w-4 text-amber-600" />
            Safety
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        className="max-h-96 w-64 overflow-auto p-1.5"
      >
        <div className="px-2 pb-1.5 pt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Insert callout
        </div>
        {SAFETY_GROUPS.map((group) => (
          <div key={group.title} className="mb-1 last:mb-0">
            <div
              className={cn(
                "px-2 py-1 text-[10px] font-semibold uppercase tracking-wider",
                TONE_TEXT[group.title.toLowerCase()] ?? "text-muted-foreground",
              )}
            >
              {group.title}
            </div>
            {group.kinds.map((kind) => {
              const meta = CALLOUT_META[kind]
              const Icon = meta.icon
              return (
                <button
                  key={kind}
                  type="button"
                  onClick={() => {
                    onSelect(kind)
                    onOpenChange?.(false)
                  }}
                  className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                >
                  <Icon className={cn("h-4 w-4 shrink-0", TONE_TEXT[meta.tone])} />
                  <span>{meta.label}</span>
                </button>
              )
            })}
          </div>
        ))}
      </PopoverContent>
    </Popover>
  )
}
