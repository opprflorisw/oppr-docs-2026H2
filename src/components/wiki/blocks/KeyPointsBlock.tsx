import { ChevronDown, ListChecks } from "lucide-react"
import { cn } from "@/lib/utils"
import { bodySections, pointDomId, type WikiBlockView, type WikiContentView, type WikiPointView } from "../wikiShared"
import { PhoneSources, PointBody, textClass, useBlockCtx } from "./context"

const MAX_KEY_POINTS = 5

/** The body section that holds the detail of a key point: the first one citing the same passages. */
function detailSection(content: WikiContentView, point: WikiPointView) {
  const chunks = new Set(point.citations.map((c) => String(c.chunkId)))
  for (const s of bodySections(content))
    for (const b of s.blocks) if (b.points.some((p) => p.citations.some((c) => chunks.has(String(c.chunkId))))) return s
  return null
}

/**
 * "Key points": at most 5 short lines, each with a jump to the section that
 * holds the detail (spec 2.2). Folds; open by default.
 */
export function KeyPointsBlock({ block, open, onToggle }: { block: WikiBlockView; open: boolean; onToggle: () => void }) {
  const { content, surface, jumpTo } = useBlockCtx()
  const points = block.points.slice(0, MAX_KEY_POINTS)
  if (points.length === 0) return null
  const bodyId = `kp-${block.id}`
  const phone = surface === "phone"
  return (
    <section aria-labelledby={`${bodyId}-h`} data-tour="wiki-key-points" className={cn("wiki-key-points rounded-xl bg-primary/[0.045]", phone ? "p-4" : "max-w-[68ch] px-5 py-4")}>
      <h2 id={`${bodyId}-h`} className="text-sm font-semibold text-primary-strong">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={onToggle}
          className="flex w-full items-center gap-2 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ListChecks className="h-4 w-4" aria-hidden />
          <span className="flex-1">Key points</span>
          <ChevronDown className={cn("h-4 w-4 transition-transform", !open && "-rotate-90")} aria-hidden />
        </button>
      </h2>
      <ul id={bodyId} hidden={!open} className={cn("mt-2", phone ? "divide-y" : "space-y-2")}>
        {points.map((p, i) => {
          const detail = detailSection(content, p)
          return (
            <li key={i} id={pointDomId(block.id, i)} data-point={p.pointKey} className={cn("flex gap-3", textClass(surface), phone && "py-2")}>
              {!phone && <span className="mt-[11px] h-1.5 w-1.5 shrink-0 rounded-full bg-primary-strong" aria-hidden />}
              <span className="min-w-0">
                <PointBody point={p} blockId={block.id} index={i} strong />
                {detail && (
                  <button
                    type="button"
                    onClick={() => jumpTo(detail.id)}
                    className={cn(
                      "ml-1.5 text-left text-muted-foreground underline-offset-2 [@media(hover:hover)]:hover:text-primary-strong [@media(hover:hover)]:hover:underline",
                      // Phone: 13 px floor minimum and a 44 px tap area around the short line.
                      phone ? "relative text-[13px] after:absolute after:-inset-y-3.5 after:inset-x-0 after:content-['']" : "text-xs",
                    )}
                  >
                    in {detail.heading}
                  </button>
                )}
                <PhoneSources citations={p.citations} inline />
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
