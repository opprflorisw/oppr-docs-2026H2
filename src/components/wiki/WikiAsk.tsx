import { MessageSquareText } from "lucide-react"
import { Button } from "@/components/ui/button"
import { openAsk, useAskOpen } from "@/components/ai/AskDock"
import { cn } from "@/lib/utils"
import { starterQuestions } from "./wikiStarters"

// Ask this Wiki: a compact way into the one Ask panel, scoped to this Wiki.
// Answers come only from the documents the Wiki is built from, at the
// versions it cites. A starter question opens the panel and asks it. While
// the panel is open it shows the same starters, so this entry steps aside.
// "rail" stacks it in the side rail; "inline" sits above the text when there
// is no rail.

export function WikiAskEntry({
  wikiId,
  headings,
  variant = "inline",
  className,
}: {
  wikiId: string
  headings: string[]
  variant?: "inline" | "rail"
  className?: string
}) {
  const scope = { kind: "wiki" as const, id: wikiId }
  const starters = starterQuestions(headings).slice(0, 3)
  const askOpen = useAskOpen()
  if (askOpen) return null

  if (variant === "rail") {
    return (
      <section aria-label="Ask about this Wiki" className={cn("space-y-2", className)} data-print="hide">
        <Button size="sm" variant="outline" className="w-full justify-start gap-1.5" onClick={() => openAsk(undefined, scope)}>
          <MessageSquareText className="h-3.5 w-3.5" aria-hidden />
          Ask about this Wiki
        </Button>
        <ul className="space-y-0.5">
          {starters.map((q) => (
            <li key={q}>
              <button
                type="button"
                onClick={() => openAsk(q, scope)}
                className="w-full rounded px-2 py-1 text-left text-xs leading-snug text-muted-foreground transition-colors [@media(hover:hover)]:hover:bg-primary/5 [@media(hover:hover)]:hover:text-foreground"
              >
                {q}
              </button>
            </li>
          ))}
        </ul>
      </section>
    )
  }

  return (
    <section aria-label="Ask about this Wiki" className={cn("flex flex-wrap items-center gap-2", className)} data-print="hide">
      <Button size="sm" variant="outline" className="gap-1.5" onClick={() => openAsk(undefined, scope)}>
        <MessageSquareText className="h-3.5 w-3.5" aria-hidden />
        Ask about this Wiki
      </Button>
      {starters.map((q) => (
        <button
          key={q}
          type="button"
          onClick={() => openAsk(q, scope)}
          className="max-w-full truncate rounded-full border bg-background px-3 py-1.5 text-left text-xs text-muted-foreground transition-colors [@media(hover:hover)]:hover:border-primary/50 [@media(hover:hover)]:hover:text-foreground"
          title={q}
        >
          {q}
        </button>
      ))}
    </section>
  )
}
