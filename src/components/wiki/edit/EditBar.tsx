import { History, MoreHorizontal, Settings2, Sparkles, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { allowanceText, plural, type EditCtx } from "./editShared"

/**
 * The edit bar (spec 3.1): unapplied changes, who else is editing, the AI
 * allowance, and one primary action: Review and apply.
 */
export function EditBar({ ctx, onDone }: { ctx: EditCtx; onDone: () => void }) {
  const { state } = ctx
  const count = state.stagedCount
  const others = state.alsoEditing.map((p) => p.name)
  return (
    <div
      role="region"
      aria-label="Edit bar"
      className="sticky top-[7.25rem] z-10 space-y-1.5 rounded-lg border border-primary/30 bg-background/95 px-3 py-2 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/85"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="text-sm font-semibold">Editing</span>
        <span className="text-sm text-muted-foreground" aria-live="polite">
          {count === 0 ? "No unapplied changes" : plural(count, "unapplied change")}
        </span>
        {others.length > 0 && (
          <span className="inline-flex items-center gap-1 text-xs text-amber-800 dark:text-amber-200">
            <Users className="h-3.5 w-3.5" aria-hidden />
            Also editing: {others.join(", ")}
          </span>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          <Button size="sm" disabled={count === 0} onClick={() => ctx.open({ kind: "apply" })}>
            Review and apply
          </Button>
          <Button size="sm" variant="ghost" disabled={count === 0} onClick={() => ctx.open({ kind: "discard" })}>
            Discard
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="More edit actions">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuItem onClick={() => ctx.open({ kind: "restore" })}>
                <History className="mr-2 h-3.5 w-3.5" /> Restore previous build
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => ctx.open({ kind: "settings" })}>
                <Settings2 className="mr-2 h-3.5 w-3.5" /> Wiki settings
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button size="sm" variant="outline" onClick={onDone}>
            Done
          </Button>
        </div>
      </div>
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Sparkles className="h-3 w-3 shrink-0" aria-hidden />
        {allowanceText(state.allowance)}
        {count > 0 && <span> · Readers keep seeing the live Wiki until you apply.</span>}
      </p>
    </div>
  )
}
