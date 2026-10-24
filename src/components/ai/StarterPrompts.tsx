// Curated starter prompts shown when the chat panel opens with no history.
// Per-scope so the suggestions are immediately relevant.

import { Sparkles } from "lucide-react"
import type { AskPanelScope } from "./AskPanel"
import { cn } from "@/lib/utils"

interface StarterPromptsProps {
  scope: AskPanelScope
  onPick: (prompt: string) => void
  className?: string
  /** Floor app: 16px prompts with 48px targets. */
  floor?: boolean
}

export function StarterPrompts({
  scope,
  onPick,
  className,
  floor = false,
}: StarterPromptsProps) {
  const prompts = getStarters(scope)
  if (!prompts.length) return null

  return (
    <div className={cn("space-y-2", className)}>
      <div
        className={cn(
          "flex items-center gap-1 font-semibold uppercase tracking-wide text-muted-foreground",
          floor ? "text-[13px]" : "text-[10px]",
        )}
      >
        <Sparkles className={floor ? "h-4 w-4" : "h-3 w-3"} />
        Try asking
      </div>
      <div className={cn("flex flex-col", floor ? "gap-2" : "gap-1.5")}>
        {prompts.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onPick(p)}
            className={cn(
              "border bg-background text-left text-foreground transition-colors hover:border-primary/40 hover:bg-primary/5",
              floor ? "min-h-12 rounded-2xl px-4 py-3 text-base" : "rounded-md px-3 py-2 text-xs",
            )}
          >
            {p}
          </button>
        ))}
      </div>
    </div>
  )
}

function getStarters(scope: AskPanelScope): string[] {
  if (scope.kind === "library") {
    return [
      "How long do I dry PE granulate before extrusion?",
      "How do I lock out line 2 before I reach into the haul-off?",
      "Which documents cover the EXL-201 extruder?",
    ]
  }
  if (scope.kind === "asset") {
    return [
      "Which documents apply to this Asset?",
      "What is the daily check on this Asset?",
      "Are there any safety steps before startup?",
    ]
  }
  return [
    "Summarise this document in 5 points.",
    "What PPE or safety equipment is required?",
    "What are the critical steps and their order?",
  ]
}
