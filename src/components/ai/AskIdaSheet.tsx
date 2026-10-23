// Slide-in Ask IDA sheet.
//
// Wraps AskPanel inside a shadcn Sheet that slides in from the right.
// Used in:
//   - DocumentReadPage  → scoped to the open document
//   - LibraryPage       → scoped to the whole library
//   - (later) AssetDetailPage → scoped to the asset
//
// The trigger renders as a primary-styled button with an "Ask IDA" label
// + sparkle/message icon. Both the trigger and the sheet are owned by this
// component so callers just pass `scope` and (optionally) `triggerLabel`.

import { useState, type ReactNode } from "react"
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
import { cn } from "@/lib/utils"

interface AskIdaSheetProps {
  scope: AskPanelScope
  /** Override the trigger button label. Default: "Ask IDA". */
  triggerLabel?: string
  /** Replace the default trigger entirely. */
  trigger?: ReactNode
  /** Trigger button variant. */
  variant?: "default" | "outline" | "secondary" | "ghost"
  /** Trigger button size. */
  size?: "default" | "sm" | "lg" | "icon"
  className?: string
}

export function AskIdaSheet({
  scope,
  triggerLabel = "Ask",
  trigger,
  variant = "default",
  size = "sm",
  className,
}: AskIdaSheetProps) {
  const [open, setOpen] = useState(false)

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        {trigger ?? (
          <Button
            variant={variant}
            size={size}
            className={cn("gap-2", className)}
          >
            <MessageSquareText className="h-4 w-4" />
            {triggerLabel}
          </Button>
        )}
      </SheetTrigger>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-md md:max-w-lg"
      >
        <SheetTitle className="sr-only">Ask</SheetTitle>
        <SheetDescription className="sr-only">
          Q&amp;A panel for the current document, asset, or the entire library.
        </SheetDescription>
        <div className="flex-1 min-h-0 p-3">
          <AskPanel scope={scope} className="h-full border-0 shadow-none" />
        </div>
      </SheetContent>
    </Sheet>
  )
}
