// Citation pill — hover for the full excerpt + page/section, click to open
// the source document. We try to extract a 1-based page number from the
// chunk's page_or_section label so PDFs deep-link to that page.

import { FileText, ExternalLink } from "lucide-react"
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card"
import { Button } from "@/components/ui/button"
import type { Citation } from "@/types"
import { cn } from "@/lib/utils"

interface CitationPillProps {
  index: number
  citation: Citation
  /** When the user clicks the pill or "Open" button. Host decides where to go. */
  onOpen: (citation: Citation, page: number | null) => void
  /** DOM id used by inline footnote anchors to scrollIntoView. */
  domId?: string
  className?: string
}

export function CitationPill({
  index,
  citation,
  onOpen,
  domId,
  className,
}: CitationPillProps) {
  const page = extractPageNumber(citation.page_or_section)
  return (
    <HoverCard openDelay={120} closeDelay={300}>
      <HoverCardTrigger asChild>
        <button
          id={domId}
          type="button"
          onClick={() => onOpen(citation, page)}
          className={cn(
            "group inline-flex max-w-full items-center gap-1.5 rounded-2xl border text-left bg-background px-2.5 py-1 text-[11px] font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-primary/5",
            className,
          )}
        >
          <span className="inline-flex h-[16px] min-w-[18px] items-center justify-center rounded-sm bg-primary/15 px-1 text-[10px] font-semibold text-primary">
            {index}
          </span>
          <FileText className="h-3 w-3 shrink-0 text-muted-foreground" />
          <span className="line-clamp-2 min-w-0 break-words">{citation.document_title}</span>
          {citation.page_or_section && (
            <span className="shrink-0 text-muted-foreground">
              · {citation.page_or_section}
            </span>
          )}
        </button>
      </HoverCardTrigger>
      <HoverCardContent align="start" sideOffset={6} className="w-96 p-3">
        <div className="mb-1.5 flex items-center justify-between gap-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          <span>Source [{index}]</span>
          {citation.page_or_section && <span>{citation.page_or_section}</span>}
        </div>
        <div className="mb-2 text-xs font-medium text-foreground">
          {citation.document_title}
        </div>
        <p className="max-h-40 overflow-auto whitespace-pre-wrap rounded bg-muted/50 p-2 text-xs leading-relaxed text-foreground">
          {citation.excerpt}
        </p>
        <div className="mt-3 flex justify-end">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 gap-1 text-xs"
            onClick={() => onOpen(citation, page)}
          >
            Open at this location
            <ExternalLink className="h-3 w-3" />
          </Button>
        </div>
      </HoverCardContent>
    </HoverCard>
  )
}

/**
 * Common page-label shapes we see in the seed: "Page 3", "p. 12", "§ 2.4",
 * or just "3". We only pull a number when the label looks page-y; section
 * headings stay null and the reader opens at page 1.
 */
function extractPageNumber(label: string | null): number | null {
  if (!label) return null
  const m = label.match(/(?:^|\b)(?:p\.?|page)\s*(\d+)/i)
  if (m) return Number(m[1])
  const bare = label.match(/^\s*(\d+)\s*$/)
  if (bare) return Number(bare[1])
  return null
}
