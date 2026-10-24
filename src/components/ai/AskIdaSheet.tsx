// Slide-in Ask sheet.
//
// Wraps AskPanel inside a shadcn Sheet that slides in from the right.
// Used in:
//   - DocumentReadPage  → scoped to the open document
//   - LibraryPage       → scoped to the whole library
//   - FloatingAskIda    → scoped from the route
//   - WikiPage          → "This Wiki" (Ask this Wiki)
//
// On a Wiki page (/wiki/:id) the sheet opens on "This Wiki": answers come only
// from the Wiki's sources, and the thread is saved like any other scope.

import { useEffect, useState, type ReactNode } from "react"
import { useLocation } from "wouter"
import { MessageSquareText } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { AskPanel, type AskPanelScope } from "./AskPanel"
import type { AnyAskScope } from "./ScopeChip"
import { cn } from "@/lib/utils"

interface AskIdaSheetProps {
  scope: AnyAskScope
  /** Override the trigger button label. Default: "Ask". */
  triggerLabel?: string
  /** Replace the default trigger entirely; null renders no trigger (controlled use). */
  trigger?: ReactNode | null
  /** Trigger button variant. */
  variant?: "default" | "outline" | "secondary" | "ghost"
  /** Trigger button size. */
  size?: "default" | "sm" | "lg" | "icon"
  className?: string
  /** Controlled open state (optional). */
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

/** The Wiki open on this route, if any. */
function wikiIdFromLocation(location: string): string | null {
  const m = location.match(/^\/wiki\/([a-z0-9]{32})$/)
  return m ? m[1] : null
}

export function AskIdaSheet({
  scope,
  triggerLabel = "Ask",
  trigger,
  variant = "default",
  size = "sm",
  className,
  open: openProp,
  onOpenChange,
}: AskIdaSheetProps) {
  const [openState, setOpenState] = useState(false)
  const open = openProp ?? openState
  const setOpen = (next: boolean) => {
    setOpenState(next)
    onOpenChange?.(next)
  }
  const [location] = useLocation()
  // Opened on a Wiki page with the default (library) scope: preselect the Wiki.
  const routeWiki = wikiIdFromLocation(location)
  const initial: AnyAskScope =
    routeWiki && scope.kind === "library" ? { kind: "wiki", id: routeWiki } : scope
  const [active, setActive] = useState<AnyAskScope>(initial)
  const initialKey = initial.kind === "library" ? "library" : `${initial.kind}:${initial.id}`
  useEffect(() => {
    setActive(initial)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialKey])

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      {trigger !== null && (
        <SheetTrigger asChild>
          {trigger ?? (
            <Button variant={variant} size={size} className={cn("gap-2", className)}>
              <MessageSquareText className="h-4 w-4" />
              {triggerLabel}
            </Button>
          )}
        </SheetTrigger>
      )}
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-md md:max-w-lg"
      >
        <SheetTitle className="sr-only">Ask</SheetTitle>
        <SheetDescription className="sr-only">
          Questions and answers for the current document, Asset, Wiki or the entire library.
        </SheetDescription>
        <div className="min-h-0 flex-1 p-3">
          <AskPanel
            scope={active as AskPanelScope}
            onScopeChange={(next) => setActive(next)}
            className="h-full border-0 shadow-none"
          />
        </div>
      </SheetContent>
    </Sheet>
  )
}
