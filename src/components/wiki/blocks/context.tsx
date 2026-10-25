import { createContext, useContext } from "react"
import { Link } from "wouter"
import { AlertOctagon } from "lucide-react"
import { cn } from "@/lib/utils"
import { CitationMarker, SourcesButton } from "../Citations"
import {
  WikiText,
  type SourceNote,
  type WikiCitation,
  type WikiContentView,
  type WikiPointView,
  type WikiView,
} from "../wikiShared"

// What every block renderer needs from the page: the Wiki (passages, ids),
// the surface, the source markers and the jumps. One provider per reader.

export interface BlockCtx {
  wiki: WikiView
  content: WikiContentView
  surface: "desktop" | "phone"
  /** "Show source codes inline" (desktop). */
  showCodes: boolean
  /** Source markers by `${blockId}:${pointIndex}`, numbered per section (desktop and print). */
  notes: Map<string, SourceNote>
  /** Danger callouts past the Wiki's limit: shown as warnings (D5). */
  dangerOver: Set<string>
  /** Section id to its #anchor. */
  slugs: Record<string, string>
  /** Opens a section and scrolls to it. */
  jumpTo: (sectionId: string) => void
  /** Phone: opens the source sheet. */
  openSources: (citations: WikiCitation[]) => void
}

export const BlockContext = createContext<BlockCtx | null>(null)

export function useBlockCtx(): BlockCtx {
  const ctx = useContext(BlockContext)
  if (!ctx) throw new Error("Wiki blocks render inside a BlockContext provider")
  return ctx
}

/** Body text size per surface. */
export function textClass(surface: BlockCtx["surface"]) {
  return surface === "phone" ? "text-base leading-relaxed" : "text-[15px] leading-7"
}

/** The desktop marker after point `index` of a block, when a run ends there. */
export function Marker({ blockId, index }: { blockId: string; index: number }) {
  const { wiki, notes, showCodes, surface } = useBlockCtx()
  if (surface !== "desktop") return null
  const note = notes.get(`${blockId}:${index}`)
  if (!note) return null
  return <CitationMarker wiki={wiki} n={note.n} citations={note.citations} showCodes={showCodes} />
}

/** Phone: "Sources (n)" for one row or one paragraph. */
export function PhoneSources({ citations, inline }: { citations: WikiCitation[]; inline?: boolean }) {
  const { surface, openSources } = useBlockCtx()
  if (surface !== "phone") return null
  return <SourcesButton citations={citations} onOpen={openSources} inline={inline} />
}

/** "New" and "Open finding" on a point. */
export function PointBadges({ point }: { point: WikiPointView }) {
  const { surface } = useBlockCtx()
  const phone = surface === "phone"
  return (
    <>
      {point.isNew && (
        <span
          className={cn(
            "ml-1.5 inline-flex items-center rounded-full bg-emerald-100 px-1.5 py-px align-middle font-medium text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200",
            phone ? "text-[13px]" : "text-xs",
          )}
        >
          New
        </span>
      )}
      {point.findingId && !point.disputed && (
        <Link
          href={`/library/findings?f=${point.findingId}`}
          title={point.findingSummary ?? "Open contradiction between the sources"}
          className={cn(
            "ml-1.5 inline-flex items-center gap-1 rounded-full bg-red-100 px-1.5 py-px align-middle font-medium text-red-800 dark:bg-red-500/15 dark:text-red-200 [@media(hover:hover)]:hover:bg-red-200",
            phone ? "text-[13px]" : "text-xs",
          )}
        >
          <AlertOctagon className="h-3 w-3" aria-hidden />
          Open finding
        </Link>
      )}
    </>
  )
}

/**
 * State both values (spec 5.4): a point that rests on one side of an open
 * contradiction shows what the other Document says.
 */
export function DisputedLine({ point }: { point: WikiPointView }) {
  const d = point.disputed
  if (!d) return null
  return (
    <span className="mt-1 block rounded-md border-l-2 border-red-400 bg-red-50/60 px-2 py-1 text-sm leading-6 text-red-950 dark:bg-red-500/10 dark:text-red-100">
      <span className="font-mono text-xs">
        {d.otherNamingCode} v{d.otherVersion}
      </span>{" "}
      says: "{d.otherQuote}" ·{" "}
      <Link href={`/library/findings?f=${d.findingId}`} className="font-medium underline-offset-2 hover:underline">
        Open finding
      </Link>
    </span>
  )
}

/** One point's text with its badges, marker and disputed line. */
export function PointBody({ point, blockId, index, strong }: { point: WikiPointView; blockId: string; index: number; strong?: boolean }) {
  const { surface } = useBlockCtx()
  return (
    <>
      <span className={cn(strong && "font-medium")}>
        <WikiText text={point.text} mobile={surface === "phone"} />
      </span>
      <Marker blockId={blockId} index={index} />
      <PointBadges point={point} />
      <DisputedLine point={point} />
    </>
  )
}
