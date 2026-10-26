// Pieces of Ask on the floor (AskPanel variant "floor"): one primary source
// chip with the rest folded under "More sources", and "Helpful" or
// "Unclear or wrong?" under each answer.

import { useEffect, useMemo, useState } from "react"
import { useMutation } from "convex/react"
import { Check, ChevronDown, FileText, ThumbsUp } from "lucide-react"
import { toast } from "sonner"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import type { Citation } from "@/types"
import { useCheckIn } from "@/lib/checkIn"
import { cn } from "@/lib/utils"

type Source = { citation: Citation; indexes: number[]; label: string }

/** Excerpt numbers in the order the answer first cites them: [3] then [5] ... */
function citedOrder(answer: string): number[] {
  const out: number[] = []
  for (const m of answer.matchAll(/\[(\d+)\]/g)) {
    const n = Number(m[1])
    if (!out.includes(n)) out.push(n)
  }
  return out
}

function groupSources(citations: Citation[]): Source[] {
  const out: Source[] = []
  const byKey = new Map<string, Source>()
  citations.forEach((c, i) => {
    const key = `${c.document_id}|${c.page_or_section ?? ""}`
    const hit = byKey.get(key)
    if (hit) {
      hit.indexes.push(i + 1)
      return
    }
    const s: Source = {
      citation: c,
      indexes: [i + 1],
      label: c.page_or_section ? `${c.document_title} · ${c.page_or_section}` : c.document_title,
    }
    byKey.set(key, s)
    out.push(s)
  })
  return out
}

export function FloorSources({
  citations,
  answer,
  domIdPrefix,
  onOpen,
}: {
  citations: Citation[]
  answer: string
  domIdPrefix: string
  onOpen: (c: Citation, page: number | null) => void
}) {
  // The main source is the one the answer cites first, so its number matches
  // the first [n] in the text. Sources the answer never cites come last.
  const sources = useMemo(() => {
    const order = citedOrder(answer)
    const rank = (s: Source) => {
      const r = Math.min(...s.indexes.map((n) => (order.includes(n) ? order.indexOf(n) : Infinity)))
      return Number.isFinite(r) ? r : order.length + s.indexes[0]
    }
    return groupSources(citations).sort((a, b) => rank(a) - rank(b))
  }, [citations, answer])
  const [more, setMore] = useState(false)
  if (sources.length === 0) return null
  const [first, ...rest] = sources
  const pageOf = (c: Citation) => {
    const m = c.page_or_section?.match(/^Page (\d+)$/i)
    return m ? Number(m[1]) : null
  }
  const row = (s: Source, primary: boolean) => (
    <button
      key={`${s.citation.document_id}-${s.indexes[0]}`}
      id={`${domIdPrefix}-${s.indexes[0]}`}
      type="button"
      onClick={() => onOpen(s.citation, pageOf(s.citation))}
      className={cn(
        "flex min-h-12 w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition active:scale-[0.99]",
        primary ? "border-[#6E59A5]/40 bg-background" : "bg-background/60",
      )}
    >
      <FileText className="h-5 w-5 shrink-0 text-[#6E59A5]" />
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 block text-sm font-semibold leading-snug">
          <span className="mr-1 font-mono text-[#6E59A5]">{s.indexes.map((n) => `[${n}]`).join(" ")}</span>
          {s.label}
        </span>
        <span className="block text-[13px] text-muted-foreground">Published version in use · Open at this passage</span>
      </span>
      {/* Footnote anchors [2], [3] in the answer scroll to these. */}
      {s.indexes.slice(1).map((n) => (
        <span key={n} id={`${domIdPrefix}-${n}`} className="sr-only">
          Source {n}
        </span>
      ))}
    </button>
  )
  return (
    <div className="flex flex-col gap-2 pt-1">
      {row(first, true)}
      {rest.length > 0 && (
        <>
          <button
            type="button"
            aria-expanded={more}
            onClick={() => setMore((v) => !v)}
            className="flex min-h-11 items-center gap-1 self-start text-sm font-medium text-muted-foreground"
          >
            <ChevronDown className={cn("h-4 w-4 transition-transform", more && "rotate-180")} />
            More sources ({rest.length})
          </button>
          {more ? rest.map((s) => row(s, false)) : rest.map((s) =>
            s.indexes.map((n) => (
              <span key={n} id={`${domIdPrefix}-${n}`} className="sr-only">
                Source {n}
              </span>
            )),
          )}
        </>
      )}
    </div>
  )
}

const REASONS = [
  { key: "wrong_machine", label: "Wrong machine" },
  { key: "out_of_date", label: "Out of date" },
  { key: "missing_step", label: "Missing step" },
  { key: "other", label: "Other" },
] as const

export function FloorFeedback({ question, citations }: { question: string | null; citations: Citation[] }) {
  const { person } = useCheckIn()
  const send = useMutation(api.insights.askFeedback)
  const [state, setState] = useState<"idle" | "asking" | "helpful" | "flagged">("idle")

  async function give(verdict: "helpful" | "unclear", reason?: (typeof REASONS)[number]["key"]) {
    try {
      await send({
        verdict,
        reason,
        question: question ?? "",
        citations: citations.map((c) => ({
          documentId: c.document_id as Id<"documents">,
          chunkId: (c.chunk_id || null) as Id<"chunks"> | null,
        })),
        personId: person?._id ?? null,
      })
      setState(verdict === "helpful" ? "helpful" : "flagged")
    } catch {
      toast.error("Could not send that. Try again.")
    }
  }

  if (state === "helpful" || state === "flagged") {
    return (
      <p className="flex items-center gap-1.5 pt-1 text-[13px] text-muted-foreground">
        <Check className="h-4 w-4" />
        {state === "helpful" ? "Thanks." : "Thanks. The document owner sees this."}
      </p>
    )
  }
  if (state === "asking") {
    return (
      <div className="flex flex-col gap-2 pt-1">
        <p className="text-[13px] font-medium text-muted-foreground">What is wrong?</p>
        <div className="flex flex-wrap gap-2">
          {REASONS.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => void give("unclear", r.key)}
              className="min-h-11 rounded-full border bg-background px-4 text-sm font-medium active:scale-95"
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>
    )
  }
  return (
    <div className="flex flex-wrap gap-2 pt-1">
      <button
        type="button"
        onClick={() => void give("helpful")}
        className="flex min-h-11 items-center gap-1.5 rounded-full border bg-background px-4 text-sm font-medium active:scale-95"
      >
        <ThumbsUp className="h-4 w-4" />
        Helpful
      </button>
      <button
        type="button"
        onClick={() => setState("asking")}
        className="min-h-11 rounded-full border bg-background px-4 text-sm font-medium active:scale-95"
      >
        Unclear or wrong?
      </button>
    </div>
  )
}

/**
 * While Ask looks for an answer on the floor. A weak signal in the hall can
 * make this take long, so after a few seconds we say so and point at Stop.
 */
export function FloorWaiting() {
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    const t = window.setTimeout(() => setSlow(true), 8000)
    return () => window.clearTimeout(t)
  }, [])
  return (
    <div role="status" className="text-base text-muted-foreground">
      <p className="italic">Looking in the Published documents...</p>
      {slow && (
        <p className="mt-1 text-sm">
          This takes longer than usual, often a weak signal. Wait a bit, or tap the square to stop and ask again.
        </p>
      )}
    </div>
  )
}
