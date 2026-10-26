// Grouped sources view rendered under each assistant message.
//
// Two-level grouping:
//   1. By document_id  — multiple chunks from the same doc collapse into a
//      single card (the model citing N chunks from one SOP shouldn't render
//      as N near-identical pills).
//   2. By page_or_section within a doc — operators read sources at the
//      section level, so 3 chunks from "Before handover" collapse into one
//      sub-pill labelled "Before handover ×3".
//
// Origin badge: when the chat is in asset scope, each cited doc carries an
// origin tag — "asset-link" (in document_assets for that asset, the normal
// case) or "cross-link" (rare, usually a stale IndexedDB symptom). We
// surface "cross-link" prominently so the operator knows IDA is reaching
// outside their asset's connected docs.
//
// Inline footnote anchors in the message body still point at `[N]` indices
// that are 1:1 with the chunk array. To keep those anchors clickable when
// multiple chunks live in the same bucket, every index gets a hidden DOM
// node so scrollIntoView still finds something.

import { useMemo } from "react"
import { Boxes, ChevronRight, FileText, AlertTriangle } from "lucide-react"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import type { Citation } from "@/types"
import { CitationPill } from "./CitationPill"
import { cn } from "@/lib/utils"

interface SourcesBlockProps {
  citations: Citation[]
  /** DOM-id prefix so footnote anchors can scrollIntoView a specific pill. */
  domIdPrefix: string
  onOpen: (citation: Citation, page: number | null) => void
  className?: string
}

interface SectionBucket {
  label: string | null
  /** Citations in this section, in insertion order (1-based index preserved). */
  items: Array<{ index: number; citation: Citation }>
}

interface DocGroup {
  doc_id: string
  title: string
  /** All cited chunks from this doc share the same origin (origin is per-doc). */
  origin: Citation["origin"]
  sections: SectionBucket[]
  /** Lowest index in this group — used for the bucket's primary DOM id. */
  firstIndex: number
}

export function SourcesBlock({
  citations,
  domIdPrefix,
  onOpen,
  className,
}: SourcesBlockProps) {
  const groups = useMemo<DocGroup[]>(() => buildGroups(citations), [citations])
  const totalSections = groups.reduce((acc, g) => acc + g.sections.length, 0)

  if (groups.length === 0) return null

  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        <span>Sources</span>
        {totalSections > 0 && totalSections !== citations.length && (
          <span className="font-normal text-muted-foreground">
            · {totalSections} unique
          </span>
        )}
        <span className="font-normal normal-case tracking-normal text-muted-foreground">
          · numbers in the answer point here
        </span>
      </div>
      <div className="flex flex-col gap-1.5">
        {groups.map((g) => (
          <SourceGroup
            key={g.doc_id}
            group={g}
            domIdPrefix={domIdPrefix}
            onOpen={onOpen}
          />
        ))}
      </div>
    </div>
  )
}

function buildGroups(citations: Citation[]): DocGroup[] {
  const docs = new Map<string, DocGroup>()
  citations.forEach((c, i) => {
    const index = i + 1
    let g = docs.get(c.document_id)
    if (!g) {
      g = {
        doc_id: c.document_id,
        title: c.document_title,
        origin: c.origin,
        sections: [],
        firstIndex: index,
      }
      docs.set(c.document_id, g)
    }
    // Section key: null sections share one bucket per doc (label = null).
    const sectionKey = c.page_or_section ?? "__no_section__"
    let bucket = g.sections.find(
      (s) => (s.label ?? "__no_section__") === sectionKey,
    )
    if (!bucket) {
      bucket = { label: c.page_or_section, items: [] }
      g.sections.push(bucket)
    }
    bucket.items.push({ index, citation: c })
  })
  return Array.from(docs.values())
}

function SourceGroup({
  group,
  domIdPrefix,
  onOpen,
}: {
  group: DocGroup
  domIdPrefix: string
  onOpen: (citation: Citation, page: number | null) => void
}) {
  // The simplest possible doc: 1 section with 1 chunk → render the legacy
  // inline pill so single-source answers stay compact and visually identical
  // to the pre-grouping layout.
  const isSimple =
    group.sections.length === 1 &&
    group.sections[0].items.length === 1 &&
    group.origin !== "cross-link"
  if (isSimple) {
    const { index, citation } = group.sections[0].items[0]
    return (
      <CitationPill
        index={index}
        citation={citation}
        domId={`${domIdPrefix}-${index}`}
        onOpen={onOpen}
      />
    )
  }

  return (
    <div
      className={cn(
        "rounded-lg border bg-background p-2",
        group.origin === "cross-link" && "border-orange-500/40 bg-orange-500/5",
      )}
    >
      <div className="flex items-center gap-1.5 text-xs font-medium">
        <FileText className="h-3 w-3 text-muted-foreground" />
        <span className="line-clamp-2 min-w-0 break-words">{group.title}</span>
        <OriginBadge origin={group.origin} title={group.title} />
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1">
        {group.sections.map((bucket, i) => (
          <SectionPill
            key={i}
            bucket={bucket}
            domIdPrefix={domIdPrefix}
            onOpen={onOpen}
          />
        ))}
      </div>
    </div>
  )
}

function SectionPill({
  bucket,
  domIdPrefix,
  onOpen,
}: {
  bucket: SectionBucket
  domIdPrefix: string
  onOpen: (citation: Citation, page: number | null) => void
}) {
  // Use the first chunk's citation as the click target; the section label is
  // the user-facing identity, and the count badge tells the user N chunks
  // contributed if N > 1. Hidden anchors below ensure footnote links to
  // [3], [5] etc. still land on this pill via scrollIntoView.
  const primary = bucket.items[0]
  const page = extractPageNumber(bucket.label)
  return (
    <>
      <button
        type="button"
        id={`${domIdPrefix}-${primary.index}`}
        onClick={() => onOpen(primary.citation, page)}
        className="inline-flex items-center gap-1 rounded-full border bg-muted/30 px-2 py-0.5 text-[11px] transition-colors hover:border-primary/40 hover:bg-primary/5"
        title={primary.citation.excerpt}
      >
        <span className="font-semibold text-primary">{primary.index}</span>
        <span className="max-w-[22ch] truncate text-muted-foreground">
          {bucket.label ?? firstWords(primary.citation.excerpt)}
        </span>
        {bucket.items.length > 1 && (
          <span className="rounded bg-muted px-1 text-[9px] font-medium text-muted-foreground">
            ×{bucket.items.length}
          </span>
        )}
      </button>
      {bucket.items.slice(1).map((it) => (
        <span
          key={it.index}
          id={`${domIdPrefix}-${it.index}`}
          aria-hidden
          className="sr-only"
        />
      ))}
    </>
  )
}

function OriginBadge({
  origin,
  title,
}: {
  origin: Citation["origin"]
  title: string
}) {
  if (origin === "asset-link") {
    return (
      <span className="ml-auto inline-flex items-center gap-1 text-[10px] text-emerald-700 dark:text-emerald-300">
        <Boxes className="h-3 w-3" />
        Linked
      </span>
    )
  }
  if (origin === "cross-link") {
    return (
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="ml-auto inline-flex items-center gap-1 rounded-full bg-orange-500/15 px-1.5 py-0.5 text-[10px] font-medium text-orange-700 transition-colors hover:bg-orange-500/25 dark:text-orange-300"
          >
            <AlertTriangle className="h-3 w-3" />
            Not linked
            <ChevronRight className="h-3 w-3" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72 p-3 text-xs">
          <div className="mb-1 font-medium">Cross-link source</div>
          <p className="text-muted-foreground">
            <span className="font-medium text-foreground">{title}</span> isn't connected
            to this asset. The documents that are linked didn't answer the question, so
            Ask widened the search to the whole library and this was the best match.
          </p>
          <p className="mt-2 text-muted-foreground">
            If this document does belong to the asset, link it on the asset page and the
            badge disappears.
          </p>
        </PopoverContent>
      </Popover>
    )
  }
  return (
    <span className="ml-auto inline-flex items-center gap-1 text-[10px] text-amber-700 dark:text-amber-300">
      <Boxes className="h-3 w-3" />
      Asset log
    </span>
  )
}

// A passage without a section heading is named by its opening words.
function firstWords(text: string, n = 5): string {
  const words = text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean)
  if (words.length === 0) return "Passage"
  return words.length > n ? `${words.slice(0, n).join(" ")}…` : words.join(" ")
}

function extractPageNumber(label: string | null): number | null {
  if (!label) return null
  const m = label.match(/(?:^|\b)(?:p\.?|page)\s*(\d+)/i)
  if (m) return Number(m[1])
  const bare = label.match(/^\s*(\d+)\s*$/)
  if (bare) return Number(bare[1])
  return null
}
