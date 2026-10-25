import { useCallback, useState } from "react"
import { toast } from "sonner"
import type { Id } from "../../../../convex/_generated/dataModel"
import type {
  AiAllowance,
  BlockKind,
  BlockStatus,
  ComposedBlock,
  EditorBlock,
  EditorState,
  OutlineSection,
} from "../../../../convex/lib/wikiTypes"
import { errorText } from "@/components/captures/captureUi"
import { cn } from "@/lib/utils"
import { formatDate } from "@/lib/time"
import type { WikiView } from "../wikiShared"

// Shared state and words for the Wiki edit layer (docs/specs/wiki-upgrade.md
// 3.1 to 3.5, 6.5). The renderers draw inside the reader, outside the layer's
// React tree, so everything they need travels in one EditCtx prop.

/** A side sheet or dialog the layer is showing. One at a time. */
export type Panel =
  | {
      kind: "generate"
      sectionId: string
      afterBlockId: string | null
      /** Set when regenerating an existing block. */
      blockId?: string
      preset?: { kind?: BlockKind; tone?: "danger" | "warning" | "tip" }
    }
  | { kind: "find"; sectionId: string; blockId?: string; query?: string }
  | { kind: "confirm"; blockId: string }
  | { kind: "addSection"; afterSectionId: string | null }
  | { kind: "editSection"; sectionId: string }
  | { kind: "removeSection"; sectionId: string }
  | { kind: "removeBlock"; blockId: string }
  | { kind: "apply" }
  | { kind: "discard" }
  | { kind: "restore" }
  | { kind: "settings" }

/** The rows of one block: the live one, its unapplied edit, or its unapplied removal. */
export interface BlockRows {
  live: EditorBlock | null
  staged: EditorBlock | null
  removed: EditorBlock | null
}

export interface EditCtx {
  wiki: WikiView
  wikiId: Id<"wikis">
  personId: Id<"people">
  state: EditorState
  rows: Map<string, BlockRows>
  /** Sections as they will be after Apply (unapplied Outline, else live). */
  sections: OutlineSection[]
  /** Sections as readers see them now. */
  liveSections: OutlineSection[]
  /** Sections the reader draws, so their blocks get chrome there. */
  composedSectionIds: Set<string>
  composedBlockIds: Set<string>
  /** A block job (generate, check) runs for this Wiki: Restore waits. */
  jobRunning: boolean
  open: (p: Panel) => void
  /** The written block whose text box is open. */
  writingBlockId: string | null
  setWriting: (blockId: string | null) => void
}

export function rowsFor(state: EditorState): Map<string, BlockRows> {
  const map = new Map<string, BlockRows>()
  for (const b of state.blocks) {
    const r = map.get(b.blockId) ?? { live: null, staged: null, removed: null }
    if (b.state === "live") r.live = b
    else if (b.state === "staged") r.staged = b
    else r.removed = b
    map.set(b.blockId, r)
  }
  return map
}

/** The row an Engineer works on: the unapplied edit when there is one. */
export function effectiveRow(r: BlockRows | undefined): EditorBlock | null {
  return r ? (r.staged ?? r.live ?? r.removed) : null
}

/** Blocks of a section as they will be after Apply, in order (removed ones included, flagged). */
export function sectionRows(ctx: EditCtx, sectionId: string): { row: EditorBlock; removed: boolean }[] {
  const out: { row: EditorBlock; removed: boolean }[] = []
  for (const r of ctx.rows.values()) {
    const row = effectiveRow(r)
    if (row && row.sectionId === sectionId) out.push({ row, removed: !!r.removed })
  }
  return out.sort((a, b) => (a.row.order < b.row.order ? -1 : a.row.order > b.row.order ? 1 : 0))
}

/** Blocks the reader does not draw: new, hidden by status, or in a section readers do not see yet. */
export function offPageRows(ctx: EditCtx, sectionId: string): { row: EditorBlock; removed: boolean }[] {
  return sectionRows(ctx, sectionId).filter(({ row }) => !ctx.composedBlockIds.has(row.blockId))
}

// ---- Words -----------------------------------------------------------------------

export const KIND_LABEL: Record<BlockKind, string> = {
  intro: "Introduction",
  prose: "Paragraph",
  keyPoints: "Key points",
  bullets: "List",
  steps: "Steps",
  table: "Table",
  callout: "Callout",
  images: "Images",
  gap: "Gap",
}

type Tone = "green" | "blue" | "amber" | "red" | "grey" | "muted"

export const STATUS: Record<BlockStatus, { label: string; tone: Tone; hint: string }> = {
  generating: { label: "Generating", tone: "muted", hint: "The AI is writing this block from Published passages." },
  grounded: { label: "Grounded", tone: "green", hint: "Every fact passed the code check against its live Published passage." },
  checked: { label: "Checked", tone: "green", hint: "Every claim is verified against a live Published passage." },
  awaitingConfirm: {
    label: "Waits for a second Engineer",
    tone: "blue",
    hint: "Verified, but another Engineer must confirm it before readers see it.",
  },
  unchecked: { label: "Not checked yet", tone: "grey", hint: "Press Check against Published before you apply." },
  contradicts: { label: "Differs from Published", tone: "red", hint: "A claim contradicts Published Knowledge. It can never be applied." },
  notCovered: {
    label: "Not covered by Published",
    tone: "grey",
    hint: "A claim has no supporting passage. It can never be applied.",
  },
  needsRecheck: { label: "A source changed; check again", tone: "amber", hint: "Readers do not see this block until it passes again." },
  gap: { label: "No Published source", tone: "grey", hint: "No Published document covers this yet." },
  failed: { label: "Generation failed", tone: "red", hint: "The AI job failed. The previous content stays." },
}

const TONE_CLASS: Record<Tone, string> = {
  green: "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-200",
  blue: "border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-500/40 dark:bg-sky-500/10 dark:text-sky-200",
  amber: "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100",
  red: "border-red-300 bg-red-50 text-red-800 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200",
  grey: "border-border bg-muted text-muted-foreground",
  muted: "border-border bg-background text-muted-foreground",
}

/** Outline of a block card by status (spec 2.4: blue, dashed, red, grey). */
export const STATUS_OUTLINE: Partial<Record<BlockStatus, string>> = {
  awaitingConfirm: "border-sky-400",
  unchecked: "border-dashed border-muted-foreground/50",
  contradicts: "border-red-400",
  notCovered: "border-muted-foreground/40",
  needsRecheck: "border-amber-400",
  failed: "border-red-300",
}

export function Pill({ tone, children, title }: { tone: Tone; children: React.ReactNode; title?: string }) {
  return (
    <span
      title={title}
      className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium leading-4", TONE_CLASS[tone])}
    >
      {children}
    </span>
  )
}

export function StatusPill({ status }: { status: BlockStatus }) {
  const s = STATUS[status]
  return (
    <Pill tone={s.tone} title={s.hint}>
      {s.label}
    </Pill>
  )
}

function passagesOf(points: { citations: { chunkId: string }[] }[]): number {
  return new Set(points.flatMap((p) => p.citations.map((c) => c.chunkId))).size
}

/** "Generated from 6 passages" / "Written by Sanne Visser, verified 25 Oct" (spec 2.3). */
export function originText(b: {
  origin: ComposedBlock["origin"]
  points: { citations: { chunkId: string }[] }[]
  authorName?: string | null
  checkedAt?: number | null
  confirmedByName?: string | null
}): string {
  if (b.origin === "generated") {
    const n = passagesOf(b.points)
    return n ? `Generated from ${plural(n, "passage")}` : "Generated"
  }
  const who = b.authorName ?? "an Engineer"
  const verified = b.checkedAt ? `, verified ${formatDate(b.checkedAt)}` : ""
  const confirmed = b.confirmedByName ? `, confirmed by ${b.confirmedByName}` : ""
  return `${b.origin === "written" ? "Written" : "Edited"} by ${who}${verified}${confirmed}`
}

export function plural(n: number, word: string, many = `${word}s`): string {
  return `${n} ${n === 1 ? word : many}`
}

const WORDS = ["No", "One", "Two", "Three", "Four", "Five"]
export function countWord(n: number): string {
  return WORDS[n] ?? String(n)
}

export { errorText }

/**
 * Runs one server call for a button: tracks pending, keeps the server's
 * plain message, and toasts it unless the caller shows it inline.
 */
export function useRun(opts: { inline?: boolean } = {}) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inline = !!opts.inline
  const run = useCallback(
    async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
      setPending(true)
      setError(null)
      try {
        return await fn()
      } catch (err) {
        const msg = errorText(err)
        setError(msg)
        if (!inline) toast.error(msg)
        return undefined
      } finally {
        setPending(false)
      }
    },
    [inline],
  )
  return { run, pending, error, setError }
}

/** Danger callouts readers see plus unapplied ones, without `exceptBlockId` (spec 3.2, D5). */
export function dangerCount(ctx: EditCtx, exceptBlockId?: string): number {
  const ids = new Set<string>()
  for (const s of ctx.wiki.contentV2?.sections ?? [])
    for (const b of s.blocks) if (b.kind === "callout" && b.tone === "danger") ids.add(b.id)
  for (const r of ctx.rows.values()) {
    const row = effectiveRow(r)
    if (!row) continue
    if (r.removed) ids.delete(row.blockId)
    else if (row.kind === "callout" && row.tone === "danger") ids.add(row.blockId)
    else ids.delete(row.blockId)
  }
  if (exceptBlockId) ids.delete(exceptBlockId)
  return ids.size
}

/** Heading of a section by id, from the unapplied Outline or the live one. */
export function headingOf(ctx: EditCtx, sectionId: string): string {
  return (
    ctx.sections.find((s) => s.id === sectionId)?.heading ??
    ctx.liveSections.find((s) => s.id === sectionId)?.heading ??
    "a section"
  )
}

/** Plain text of a block row's points, for previews. */
export function pointLines(row: Pick<EditorBlock, "points">): string[] {
  return row.points.map((p) => (p.cells?.length ? p.cells.join(" · ") : p.text))
}

/** "14 generations, 9 checks and 30 searches left this hour" (spec 3.1, 6.6). */
export function allowanceText(a: AiAllowance): string {
  if (a.off) return "AI is switched off for Wikis. Structure, writing by hand and Apply still work."
  const parts: string[] = []
  if (a.person)
    parts.push(
      `${plural(a.person.wikiBlock, "generation")}, ${plural(a.person.wikiCheck, "check")} and ${plural(a.person.wikiFind, "search", "searches")} left this hour`,
    )
  parts.push(`${plural(a.wiki, "AI action")} left today for this Wiki`)
  return parts.join(" · ")
}
