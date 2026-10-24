// Markdown renderer for assistant messages.
//
// Three layers of post-processing run on top of react-markdown:
//   1. The text node walker replaces `[1]`, `[2]`, … with clickable
//      footnote anchors (button-style spans) that scroll to the matching
//      citation pill in the Sources block.
//   2. The same walker auto-links Oppr Knowledge entity codes (EXT-OPS-SOP-0001,
//      EXL-201) when those codes exist in the local DB.
//      Fabricated codes stay plain text.
//   3. Streaming text is debounced — Markdown is re-parsed at most ~30 Hz
//      so partial `**bo` tokens don't flicker bold on/off.
//
// The Markdown surface uses the existing `.tiptap-content` CSS bucket so
// headings, lists, and tables match the rest of the app.

import { useEffect, useRef, useState, type ReactNode } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { Link as LinkIcon } from "lucide-react"
import { CODE_PATTERN, useCodeIndex, type CodeEntry } from "./useCodeIndex"
import { cn } from "@/lib/utils"

interface MessageContentProps {
  text: string
  /** When true, throttle re-parse cadence to keep streams smooth. */
  streaming?: boolean
  /**
   * Called when the user clicks a `[N]` footnote anchor. The host (panel)
   * scrolls the matching Sources pill into view.
   */
  onCitationClick?: (n: number) => void
  /** Called when a doc/asset/log code is clicked. */
  onCodeClick?: (entry: CodeEntry) => void
  /**
   * Total number of citations available. `[N]` markers with N > this are
   * left as plain text so the user doesn't see anchors that scroll
   * nowhere.
   */
  citationCount?: number
  className?: string
}

const STREAM_THROTTLE_MS = 33

export function MessageContent({
  text,
  streaming = false,
  onCitationClick,
  onCodeClick,
  citationCount,
  className,
}: MessageContentProps) {
  const codeIndex = useCodeIndex()
  const visible = useThrottled(text, streaming ? STREAM_THROTTLE_MS : 0)

  return (
    <div className={cn("tiptap-content chat-content", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Inline post-processing: every text node passes through the
          // walker so citations and codes become interactive.
          p: ({ children }) => (
            <p>{walkChildren(children, codeIndex, onCitationClick, onCodeClick, citationCount)}</p>
          ),
          li: ({ children }) => (
            <li>{walkChildren(children, codeIndex, onCitationClick, onCodeClick, citationCount)}</li>
          ),
          strong: ({ children }) => (
            <strong>{walkChildren(children, codeIndex, onCitationClick, onCodeClick, citationCount)}</strong>
          ),
          em: ({ children }) => (
            <em>{walkChildren(children, codeIndex, onCitationClick, onCodeClick, citationCount)}</em>
          ),
          h1: ({ children }) => <h2 className="mt-3 text-[1.15em] font-semibold">{children}</h2>,
          h2: ({ children }) => <h2 className="mt-3 text-[1.15em] font-semibold">{children}</h2>,
          h3: ({ children }) => <h3 className="mt-2 text-[1em] font-semibold">{children}</h3>,
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-0.5 text-primary underline underline-offset-2 hover:text-primary/80"
            >
              {children}
              <LinkIcon className="h-3 w-3" />
            </a>
          ),
        }}
      >
        {visible}
      </ReactMarkdown>
    </div>
  )
}

// --- Throttle hook ----------------------------------------------------------

function useThrottled(value: string, intervalMs: number): string {
  const [out, setOut] = useState(value)
  const lastRef = useRef(0)
  const pendingRef = useRef<number | null>(null)

  useEffect(() => {
    if (intervalMs <= 0) {
      setOut(value)
      return
    }
    const now = performance.now()
    const elapsed = now - lastRef.current
    if (elapsed >= intervalMs) {
      lastRef.current = now
      setOut(value)
      return
    }
    if (pendingRef.current != null) return
    pendingRef.current = window.setTimeout(() => {
      lastRef.current = performance.now()
      pendingRef.current = null
      setOut(value)
    }, intervalMs - elapsed)
    return () => {
      if (pendingRef.current != null) {
        clearTimeout(pendingRef.current)
        pendingRef.current = null
      }
    }
  }, [value, intervalMs])

  return out
}

// --- Inline walker ----------------------------------------------------------

type ChildNode = ReactNode

function walkChildren(
  children: ChildNode,
  codeIndex: Map<string, CodeEntry>,
  onCitationClick?: (n: number) => void,
  onCodeClick?: (entry: CodeEntry) => void,
  citationCount?: number,
): ReactNode {
  if (children == null || typeof children === "boolean") return children
  if (typeof children === "string") {
    return interpolate(children, codeIndex, onCitationClick, onCodeClick, citationCount)
  }
  if (typeof children === "number") return children
  if (Array.isArray(children)) {
    return children.map((c, i) => (
      <span key={i}>{walkChildren(c, codeIndex, onCitationClick, onCodeClick, citationCount)}</span>
    ))
  }
  return children
}

const CITATION_PATTERN = /\[(\d+)\](?!\()/g

function interpolate(
  text: string,
  codeIndex: Map<string, CodeEntry>,
  onCitationClick?: (n: number) => void,
  onCodeClick?: (entry: CodeEntry) => void,
  citationCount?: number,
): ReactNode {
  // Strategy: collect every match (citations + codes), sort by position,
  // build a flat array of strings + nodes. Two passes is simpler than one
  // unified regex and avoids catastrophic regex complexity.
  type Hit =
    | { kind: "citation"; n: number; start: number; end: number }
    | { kind: "code"; entry: CodeEntry; start: number; end: number }

  const hits: Hit[] = []

  // Citations: [1], [2], ... but not [1](url) (Markdown links already gone).
  // Skip out-of-range markers so the user doesn't see anchors that lead
  // nowhere — leaving them as plain text is safer than rendering a dead link.
  CITATION_PATTERN.lastIndex = 0
  for (let m = CITATION_PATTERN.exec(text); m; m = CITATION_PATTERN.exec(text)) {
    const n = Number(m[1])
    if (citationCount != null && (n < 1 || n > citationCount)) continue
    hits.push({
      kind: "citation",
      n,
      start: m.index,
      end: m.index + m[0].length,
    })
  }

  // Codes: only auto-link known ones.
  CODE_PATTERN.lastIndex = 0
  for (let m = CODE_PATTERN.exec(text); m; m = CODE_PATTERN.exec(text)) {
    const entry = codeIndex.get(m[0])
    if (!entry) continue
    hits.push({ kind: "code", entry, start: m.index, end: m.index + m[0].length })
  }

  if (!hits.length) return text

  hits.sort((a, b) => a.start - b.start)

  // Drop overlapping hits (keep earlier ones).
  const filtered: Hit[] = []
  let cursor = 0
  for (const h of hits) {
    if (h.start < cursor) continue
    filtered.push(h)
    cursor = h.end
  }

  const out: ReactNode[] = []
  let i = 0
  filtered.forEach((h, k) => {
    if (h.start > i) out.push(text.slice(i, h.start))
    if (h.kind === "citation") {
      out.push(
        <CitationAnchor
          key={`c-${k}`}
          n={h.n}
          onClick={() => onCitationClick?.(h.n)}
        />,
      )
    } else {
      out.push(
        <CodeAnchor
          key={`k-${k}`}
          entry={h.entry}
          onClick={() => onCodeClick?.(h.entry)}
        />,
      )
    }
    i = h.end
  })
  if (i < text.length) out.push(text.slice(i))
  return out
}

function CitationAnchor({
  n,
  onClick,
}: {
  n: number
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mx-0.5 inline-flex h-[1.4em] min-w-[1.5em] items-center justify-center rounded bg-primary/15 px-1 text-[0.78em] font-semibold text-primary align-baseline transition-colors hover:bg-primary/25"
      aria-label={`Source ${n}: scrolls to the source list below`}
      title={`Source ${n}: tap to see where this comes from`}
    >
      {n}
    </button>
  )
}

function CodeAnchor({
  entry,
  onClick,
}: {
  entry: CodeEntry
  onClick: () => void
}) {
  const tone =
    entry.kind === "asset"
      ? "bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-300"
      : entry.kind === "log"
        ? "bg-amber-500/10 text-amber-700 hover:bg-amber-500/20 dark:text-amber-300"
        : "bg-primary/10 text-primary hover:bg-primary/20"
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "mx-0.5 inline-flex items-center rounded px-1.5 py-0 align-baseline font-mono text-[0.85em] font-medium transition-colors",
        tone,
      )}
      title={entry.label}
    >
      {entry.code}
    </button>
  )
}
