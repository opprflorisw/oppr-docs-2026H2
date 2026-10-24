// Curated starter prompts shown when the chat panel opens with no history.
// Per-scope so the suggestions are immediately relevant.

import { Sparkles } from "lucide-react"
import type { AskPanelScope } from "./AskPanel"
import { cn } from "@/lib/utils"

interface StarterPromptsProps {
  scope: AskPanelScope
  onPick: (prompt: string) => void
  className?: string
}

export function StarterPrompts({
  scope,
  onPick,
  className,
}: StarterPromptsProps) {
  const prompts = getStarters(scope)
  if (!prompts.length) return null

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        <Sparkles className="h-3 w-3" />
        Try asking
      </div>
      <div className="flex flex-col gap-1.5">
        {prompts.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onPick(p)}
            className="rounded-md border bg-background px-3 py-2 text-left text-xs text-foreground transition-colors hover:border-primary/40 hover:bg-primary/5"
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
      "What documents apply to this asset?",
      "What's the daily check on this asset?",
      "Are there any safety steps before startup?",
    ]
  }
  return [
    "Summarise this document in 5 bullets.",
    "What PPE or safety equipment is required?",
    "What are the critical steps and their order?",
  ]
}
