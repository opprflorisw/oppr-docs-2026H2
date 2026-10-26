import { Link } from "wouter"
import { cn } from "@/lib/utils"
import { groupByDocument, pointDomId, unionCitations, type WikiBlockView } from "../wikiShared"
import { PhoneSources, PointBody, textClass, useBlockCtx } from "./context"

/**
 * Bullets and steps (spec 2.2). Desktop: a plain list with grouped markers.
 * Phone: rows with a thin divider and one "Sources (n)" per row; steps are one
 * numbered list, never inside a box.
 */
export function ListBlock({ block, safety }: { block: WikiBlockView; safety?: boolean }) {
  const { wiki, surface } = useBlockCtx()
  const phone = surface === "phone"
  const steps = block.kind === "steps"
  // "Full procedure: EXT-SOP-0003 v4" when every step comes from one Document.
  const docs = steps ? groupByDocument(unionCitations(block.points)) : []
  const procedure = docs.length === 1 ? docs[0] : null
  const Tag = steps ? "ol" : "ul"
  return (
    <div className="space-y-2">
      <Tag className={cn(phone ? "divide-y" : steps ? "space-y-3" : "space-y-2.5")}>
        {block.points.map((p, i) => (
          <li
            key={i}
            id={pointDomId(block.id, i)}
            data-point={p.pointKey}
            className={cn("flex gap-3", textClass(surface), phone && "py-2.5")}
          >
            {steps ? (
              <span
                className={cn(
                  "flex shrink-0 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary-strong",
                  phone ? "mt-0.5 h-7 w-7 text-sm" : "mt-0.5 h-6 w-6 text-xs",
                )}
                aria-hidden
              >
                {i + 1}
              </span>
            ) : (
              <span className={cn("mt-[11px] h-1.5 w-1.5 shrink-0 rounded-full", safety ? "bg-amber-600" : "bg-foreground/40")} aria-hidden />
            )}
            <span className="min-w-0 break-words">
              <PointBody point={p} blockId={block.id} index={i} strong={p.key} />
              <PhoneSources citations={p.citations} inline />
            </span>
          </li>
        ))}
      </Tag>
      {procedure && block.points.length > 1 && (
        <p className={cn("text-muted-foreground", phone ? "text-sm" : "text-xs")}>
          Full procedure:{" "}
          <Link
            href={phone ? `/m/docs/${procedure.documentId}` : `/docs/${procedure.documentId}?wiki=${wiki._id}`}
            className={cn(
              "font-mono font-medium text-primary-strong underline-offset-2 hover:underline",
              // Phone: the step-by-step SOP is one tap away, sized for gloves.
              phone && "inline-flex min-h-11 items-center underline",
            )}
          >
            {procedure.namingCode} v{procedure.version}
          </Link>
        </p>
      )}
    </div>
  )
}
