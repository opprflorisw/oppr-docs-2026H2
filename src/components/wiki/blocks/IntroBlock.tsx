import { cn } from "@/lib/utils"
import type { WikiBlockView, WikiContentView } from "../wikiShared"
import { useBlockCtx } from "./context"
import { Paragraph } from "./ProseBlock"

/** The introduction under the title: 2 to 4 cited sentences, then the coverage line. */
export function IntroBlock({ block }: { block: WikiBlockView }) {
  const { surface } = useBlockCtx()
  return <Paragraph block={block} className={cn(surface === "desktop" ? "text-[17px] leading-8" : "text-[17px] leading-7")} />
}

function list(items: string[], max = 6): string {
  if (items.length <= max) return items.join(", ")
  return `${items.slice(0, max).join(", ")} and ${items.length - max} more`
}

/**
 * Written by code, never stored as points (spec 2.2): "Built from 13
 * documents, 160 of 812 passages read. Covers: ... Not covered: ...".
 */
export function coverageText(c: WikiContentView["coverage"]): string {
  const parts = [
    `Built from ${c.documents} ${c.documents === 1 ? "document" : "documents"}${
      c.passagesTotal > 0 ? `, ${c.passagesRead} of ${c.passagesTotal} passages read` : ""
    }.`,
  ]
  if (c.covers.length > 0) parts.push(`Covers: ${list(c.covers)}.`)
  if (c.notCovered.length > 0) parts.push(`Not covered: ${list(c.notCovered)}.`)
  return parts.join(" ")
}

export function CoverageLine({ coverage, className }: { coverage: WikiContentView["coverage"]; className?: string }) {
  return <p className={cn("text-sm leading-6 text-muted-foreground", className)}>{coverageText(coverage)}</p>
}
