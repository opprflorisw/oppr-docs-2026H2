import { useCallback, useEffect, useState } from "react"
import { Link } from "wouter"
import { FileText } from "lucide-react"
import * as HoverCardPrimitive from "@radix-ui/react-hover-card"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import { groupByDocument, passageHref, type WikiCitation, type WikiView } from "./wikiShared"

// Citations on the Wiki page (spec 4.5). Desktop: one superscript marker per
// run of sentences that share their sources; hover or focus shows each
// passage, click opens the Document at the passage. Under each section one
// "Sources:" line. Auditors can switch codes back on inline. Phone: one
// "Sources (n)" link per row or paragraph, opening the source sheet.

const SHOW_CODES_KEY = "wiki:showCodes"
const SHOW_CODES_EVENT = "wiki-show-codes"

function readShowCodes(): boolean {
  try {
    return window.localStorage.getItem(SHOW_CODES_KEY) === "1"
  } catch {
    return false
  }
}

/** "Show source codes inline", per viewer, shared by every Wiki. */
export function useInlineCodes(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(readShowCodes)
  useEffect(() => {
    const sync = () => setOn(readShowCodes())
    window.addEventListener(SHOW_CODES_EVENT, sync)
    return () => window.removeEventListener(SHOW_CODES_EVENT, sync)
  }, [])
  const set = useCallback((value: boolean) => {
    try {
      window.localStorage.setItem(SHOW_CODES_KEY, value ? "1" : "0")
    } catch {
      // Storage blocked: the toggle still works on this page.
    }
    setOn(value)
    window.dispatchEvent(new Event(SHOW_CODES_EVENT))
  }, [])
  return [on, set]
}

export function InlineCodesToggle({ on, onChange }: { on: boolean; onChange: (on: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
      <Switch checked={on} onCheckedChange={onChange} className="scale-75" aria-label="Show source codes inline" />
      Show source codes inline
    </label>
  )
}

/** The passages behind a marker, grouped by Document. */
function PassageList({ wiki, citations }: { wiki: WikiView; citations: WikiCitation[] }) {
  return (
    <div className="space-y-3">
      {groupByDocument(citations).map((g) => (
        <div key={g.documentId} className="space-y-1.5">
          <p className="font-mono text-xs text-muted-foreground">
            {g.namingCode} · v{g.version}
          </p>
          {g.items.map((c) => (
            <div key={c.chunkId} className="space-y-0.5">
              {c.section && <p className="text-xs font-medium text-muted-foreground">{c.section}</p>}
              <p className="leading-relaxed">{wiki.excerpts[c.chunkId] ?? "This passage is no longer in the Published version."}</p>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

/**
 * The marker after a run (desktop). A superscript number, or the Document
 * codes when "Show source codes inline" is on. Hover or focus shows the
 * passages; click opens the first one in its Document.
 */
export function CitationMarker({
  wiki,
  n,
  citations,
  showCodes,
}: {
  wiki: WikiView
  n: number
  citations: WikiCitation[]
  showCodes: boolean
}) {
  const groups = groupByDocument(citations)
  const first = citations[0]
  if (!first) return null
  const href = passageHref(first.documentId, first.version, wiki.excerpts[first.chunkId], { wikiId: wiki._id })
  const label = `Source ${n}: ${groups.map((g) => `${g.namingCode} v${g.version}`).join(", ")}`
  return (
    <HoverCard openDelay={120} closeDelay={80}>
      <HoverCardTrigger asChild>
        {showCodes ? (
          <Link
            href={href}
            aria-label={label}
            className="wiki-source ml-1 inline-flex items-center gap-1 whitespace-nowrap rounded px-1 align-baseline font-mono text-xs text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [@media(hover:hover)]:hover:bg-primary/5 [@media(hover:hover)]:hover:text-primary-strong"
          >
            <FileText className="h-3 w-3 shrink-0 opacity-70" aria-hidden />
            {groups.map((g) => g.namingCode).join(", ")}
          </Link>
        ) : (
          <Link
            href={href}
            aria-label={label}
            className="wiki-source rounded-sm px-0.5 align-super text-[0.7em] font-semibold leading-none text-primary-strong no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [@media(hover:hover)]:hover:bg-primary/10"
          >
            {/* Word joiner: the marker never wraps onto a line of its own. */}
            {String.fromCharCode(0x2060)}
            {n}
          </Link>
        )}
      </HoverCardTrigger>
      {/* Portalled: the marker sits inside a <p>, and the passage list holds block elements. */}
      <HoverCardPrimitive.Portal>
        <HoverCardContent className="max-h-96 w-96 overflow-y-auto text-xs" align="start">
          <PassageList wiki={wiki} citations={citations} />
          <p className="mt-3 text-xs text-primary-strong">Click to open {citations.length > 1 ? "the first passage" : "it"} in the Document</p>
        </HoverCardContent>
      </HoverCardPrimitive.Portal>
    </HoverCard>
  )
}

/** "Sources: EXT-HSE-LMRA-0001 v2, EXT-SOP-0004 v3" under a section (desktop). */
export function SectionSources({
  wiki,
  docs,
  className,
}: {
  wiki: WikiView
  docs: { documentId: string; namingCode: string; version: number }[]
  className?: string
}) {
  if (docs.length === 0) return null
  return (
    <p className={cn("wiki-section-sources text-xs leading-5 text-muted-foreground", className)}>
      Sources:{" "}
      {docs.map((d, i) => (
        <span key={d.documentId}>
          {i > 0 && ", "}
          <Link
            href={`/docs/${d.documentId}?wiki=${wiki._id}`}
            className="font-mono [@media(hover:hover)]:hover:text-primary-strong [@media(hover:hover)]:hover:underline"
          >
            {d.namingCode} v{d.version}
          </Link>
        </span>
      ))}
    </p>
  )
}

/** "Sources (2)" on a phone row or paragraph; opens the source sheet. */
export function SourcesButton({
  citations,
  onOpen,
  inline = false,
}: {
  citations: WikiCitation[]
  onOpen: (c: WikiCitation[]) => void
  /** After the text of a row, instead of on a line of its own. */
  inline?: boolean
}) {
  if (citations.length === 0) return null
  const docs = groupByDocument(citations).length
  return (
    <button
      type="button"
      onClick={() => onOpen(citations)}
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap text-sm font-medium text-primary-strong active:opacity-70",
        inline ? "ml-2 min-h-8 align-baseline" : "mt-1 min-h-9",
      )}
    >
      <FileText className="h-3.5 w-3.5" aria-hidden />
      Sources ({docs})
    </button>
  )
}

export { PassageList }
