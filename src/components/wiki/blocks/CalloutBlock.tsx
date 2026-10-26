import { AlertOctagon, AlertTriangle, Lightbulb } from "lucide-react"
import { cn } from "@/lib/utils"
import type { WikiBlockView } from "../wikiShared"
import { useBlockCtx } from "./context"
import { Paragraph } from "./ProseBlock"

const LABEL = { danger: "Danger", warning: "Warning", tip: "Tip" } as const

/**
 * One short message with a tone (spec 2.2). Only `danger` is a strong red
 * box, capped per Wiki (D5); past the cap it shows as a warning. `warning` is
 * an amber left border, `tip` a neutral one. No filled amber boxes.
 */
export function CalloutBlock({ block }: { block: WikiBlockView }) {
  const { dangerOver, surface } = useBlockCtx()
  const tone = block.tone === "danger" && dangerOver.has(block.id) ? "warning" : (block.tone ?? "tip")
  const Icon = tone === "danger" ? AlertOctagon : tone === "warning" ? AlertTriangle : Lightbulb
  return (
    <aside
      role="note"
      aria-label={LABEL[tone]}
      data-tone={tone}
      className={cn(
        "wiki-callout flex gap-3",
        tone === "danger" &&
          "rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-red-950 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-50",
        tone === "warning" && "border-l-[3px] border-amber-500 py-0.5 pl-4",
        tone === "tip" && "border-l-[3px] border-border py-0.5 pl-4",
      )}
    >
      <Icon
        className={cn(
          "mt-1.5 h-4 w-4 shrink-0",
          tone === "danger" ? "text-red-700 dark:text-red-300" : tone === "warning" ? "text-amber-600" : "text-muted-foreground",
        )}
        aria-hidden
      />
      <div className="min-w-0">
        <p className={cn("font-semibold uppercase tracking-wide", surface === "phone" ? "text-[13px]" : "text-xs", tone === "danger" ? "text-red-800 dark:text-red-200" : "text-muted-foreground")}>
          {LABEL[tone]}
        </p>
        <Paragraph block={block} />
      </div>
    </aside>
  )
}
