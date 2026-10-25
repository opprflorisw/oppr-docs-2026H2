import { PenLine } from "lucide-react"
import * as HoverCardPrimitive from "@radix-ui/react-hover-card"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"
import { formatDate } from "@/lib/time"
import { PassageList } from "../Citations"
import { groupByDocument, unionCitations, type WikiBlockView } from "../wikiShared"
import { useBlockCtx } from "./context"

/**
 * "Written by Sanne Visser, verified 25 Oct against EXT-HSE-SOP-0001 v3"
 * (spec 2.3). Shown quietly to readers under written and edited blocks;
 * hovering or focusing it shows the verbatim Published passages the text
 * rests on. Generated blocks carry no mark for readers.
 */
export function originText(block: WikiBlockView, opts: { short?: boolean } = {}): string | null {
  if (block.origin === "generated") return null
  const verb = block.origin === "written" ? "Written" : "Edited"
  const who = block.authorName ?? "an Engineer"
  const name = opts.short ? who.replace(/^(\S)\S*\s+/, "$1. ") : who
  const when = block.checkedAt ? `, verified ${formatDate(block.checkedAt)}` : ", verified"
  const docs = groupByDocument(unionCitations(block.points))
    .map((g) => `${g.namingCode} v${g.version}`)
    .join(", ")
  const against = !opts.short && docs ? ` against ${docs}` : ""
  const confirmed = block.confirmedByName ? `, confirmed by ${block.confirmedByName}` : ""
  return `${verb} by ${name}${when}${against}${confirmed}`
}

export function OriginMark({ block }: { block: WikiBlockView }) {
  const { wiki, surface } = useBlockCtx()
  const text = originText(block)
  if (!text) return null
  const citations = unionCitations(block.points)
  const body = (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <PenLine className="h-3 w-3 shrink-0" aria-hidden />
      {text}
    </span>
  )
  if (surface === "phone" || citations.length === 0) return <p className="wiki-origin">{body}</p>
  return (
    <p className="wiki-origin">
      <HoverCard openDelay={120}>
        <HoverCardTrigger asChild>
          <button type="button" className="rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            {body}
          </button>
        </HoverCardTrigger>
        <HoverCardPrimitive.Portal>
          <HoverCardContent className="max-h-96 w-96 overflow-y-auto text-xs" align="start">
            <p className="mb-2 font-medium">The Published passages this text rests on</p>
            <PassageList wiki={wiki} citations={citations} />
          </HoverCardContent>
        </HoverCardPrimitive.Portal>
      </HoverCard>
    </p>
  )
}
