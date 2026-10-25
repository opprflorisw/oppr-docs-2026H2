import { useState } from "react"
import { useAction } from "convex/react"
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CircleHelp,
  Loader2,
  Plus,
  ShieldAlert,
  Sparkles,
  Trash2,
  X,
} from "lucide-react"
import { api } from "../../../../convex/_generated/api"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { GrowTextarea, SourceChip, errorText } from "./lib"
import {
  uid,
  type DraftBreakdownRow,
  type KeyPointKind,
  type TrainingDraft,
} from "./builderModel"

const KIND_LABEL: Record<KeyPointKind, string> = { safety: "Safety", quality: "Quality", knack: "Tip" }
const KIND_ORDER: KeyPointKind[] = ["safety", "quality", "knack"]
const KIND_CLASS: Record<KeyPointKind, string> = {
  safety: "border-red-300 bg-red-50 text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300",
  quality: "border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-500/40 dark:bg-sky-500/10 dark:text-sky-300",
  knack: "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200",
}

/**
 * The TWI Job breakdown (CONTEXT.md: Training): important steps in work
 * order, each with key points (safety, quality or knack) and the reason, and
 * the Learning objectives it teaches. Every row cites a Published passage.
 * The AI drafts it from the objectives' passages; the Engineer edits.
 */
export function JobBreakdownEditor({
  draft,
  onChange,
  aiChanged,
}: {
  draft: TrainingDraft
  onChange: (next: TrainingDraft) => void
  aiChanged: boolean
}) {
  const drafting = useAction(api.ai.trainingBuilder.draftBreakdown)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<{ tone: "info" | "error"; text: string } | null>(null)
  const rows = draft.breakdown
  const setRows = (breakdown: DraftBreakdownRow[]) => onChange({ ...draft, breakdown })
  const patch = (i: number, p: Partial<DraftBreakdownRow>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...p } : r)))
  const move = (i: number, d: -1 | 1) => {
    const next = [...rows]
    const [r] = next.splice(i, 1)
    next.splice(i + d, 0, r)
    setRows(next)
  }
  const objectiveNo = new Map(draft.objectives.map((o, i) => [o.id, i + 1]))
  const linked = new Set(rows.flatMap((r) => r.objectiveIds))

  async function generate() {
    if (draft.objectives.length === 0) return
    setBusy(true)
    setNote(null)
    try {
      const res = await drafting({
        title: draft.title,
        purpose: draft.purpose,
        objectives: draft.objectives.map((o) => ({
          id: o.id,
          text: o.text,
          documentId: o.documentId,
          chunkId: o.chunkId,
          quote: o.quote,
        })),
      })
      const critical = new Set(res.critical)
      onChange({
        ...draft,
        breakdown: res.rows,
        objectives: draft.objectives.map((o) => (critical.has(o.id) ? { ...o, critical: true } : o)),
      })
      setNote({
        tone: "info",
        text: res.byCode
          ? "Written by code from the passages, because the assistant is not available. Add the reasons yourself."
          : `Drafted ${res.rows.length} steps from the passages.${res.dropped > 0 ? ` ${res.dropped} points were left out because the passage does not state them.` : ""} Check every row.`,
      })
    } catch (err) {
      setNote({ tone: "error", text: errorText(err, "The breakdown could not be drafted. Try again.") })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl space-y-1">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            Job breakdown
            {aiChanged && <JustChanged />}
          </h3>
          <p className="text-sm text-muted-foreground">
            The important steps in the order the work is done. For each step: the key points that make or break it
            (safety, quality or a tip that makes it easier) and why they matter. Operators read these steps before the questions, and a
            trainer checks them in the try-out.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            disabled={busy || draft.objectives.length === 0}
            title={draft.objectives.length === 0 ? "Add Learning objectives first" : undefined}
            onClick={() => void generate()}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {rows.length > 0 ? "Draft again from the passages" : "Draft from the passages"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() =>
              setRows([...rows, { id: uid("b"), step: "", keyPoints: [""], keyPointKinds: ["quality"], reasons: [""], objectiveIds: [] }])
            }
          >
            <Plus className="h-4 w-4" /> Add step
          </Button>
        </div>
      </div>

      {draft.objectives.length === 0 && (
        <p className="rounded-md border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
          Add Learning objectives in Source and goal first. The breakdown is drafted from their passages.
        </p>
      )}
      {note && (
        <p
          role={note.tone === "error" ? "alert" : "status"}
          className={cn(
            "rounded-md border px-3 py-2 text-sm",
            note.tone === "error" ? "border-destructive/40 bg-destructive/5 text-destructive" : "bg-muted/40 text-muted-foreground",
          )}
        >
          {note.text}
        </p>
      )}

      {rows.length === 0 && draft.objectives.length > 0 && !busy && (
        <div className="rounded-md border border-dashed px-4 py-8 text-center">
          <p className="text-sm font-medium">No breakdown yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Without a breakdown the Training is a plain quiz. Draft one from the passages, or add the steps yourself.
          </p>
        </div>
      )}

      {rows.length > 0 && (
        <div className="overflow-hidden rounded-lg border">
          <div className="hidden grid-cols-[2.5rem_minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,1fr)_5.5rem] gap-3 border-b bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground lg:grid">
            <span>#</span>
            <span>Important step</span>
            <span>Key points</span>
            <span>Reasons</span>
            <span className="sr-only">Actions</span>
          </div>
          <ol className="divide-y">
            {rows.map((r, i) => (
              <BreakdownRow
                key={r.id}
                row={r}
                index={i}
                total={rows.length}
                objectives={draft.objectives}
                objectiveNo={objectiveNo}
                onPatch={(p) => patch(i, p)}
                onMove={(d) => move(i, d)}
                onRemove={() => setRows(rows.filter((_, j) => j !== i))}
                onToggleCritical={(id) =>
                  onChange({
                    ...draft,
                    objectives: draft.objectives.map((o) => (o.id === id ? { ...o, critical: !o.critical } : o)),
                  })
                }
              />
            ))}
          </ol>
        </div>
      )}

      {rows.length > 0 && draft.objectives.some((o) => !linked.has(o.id)) && (
        <div className="space-y-1.5 rounded-md border border-dashed p-3">
          <p className="text-xs font-medium text-muted-foreground">Learning objectives not in any step</p>
          <ul className="space-y-1">
            {draft.objectives
              .filter((o) => !linked.has(o.id))
              .map((o) => (
                <li key={o.id} className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span className="tabular-nums">{objectiveNo.get(o.id)}.</span>
                  <span className="min-w-0 flex-1 truncate">{o.text}</span>
                </li>
              ))}
          </ul>
          <p className="text-xs text-muted-foreground">They are still tested. Link them to a step so Operators see them in context.</p>
        </div>
      )}
    </div>
  )
}

function BreakdownRow({
  row: r,
  index: i,
  total,
  objectives,
  objectiveNo,
  onPatch,
  onMove,
  onRemove,
  onToggleCritical,
}: {
  row: DraftBreakdownRow
  index: number
  total: number
  objectives: TrainingDraft["objectives"]
  objectiveNo: Map<string, number>
  onPatch: (p: Partial<DraftBreakdownRow>) => void
  onMove: (d: -1 | 1) => void
  onRemove: () => void
  onToggleCritical: (objectiveId: string) => void
}) {
  const noReason = r.keyPoints.some((k) => k.trim()) && r.reasons.every((x) => !x.trim())
  const setKp = (j: number, text: string) => onPatch({ keyPoints: r.keyPoints.map((k, x) => (x === j ? text : k)) })
  const cycleKind = (j: number) => {
    const cur = r.keyPointKinds[j] ?? "quality"
    const next = KIND_ORDER[(KIND_ORDER.indexOf(cur) + 1) % KIND_ORDER.length]
    onPatch({ keyPointKinds: r.keyPoints.map((_, x) => (x === j ? next : r.keyPointKinds[x] ?? "quality")) })
  }
  const removeKp = (j: number) =>
    onPatch({
      keyPoints: r.keyPoints.filter((_, x) => x !== j),
      keyPointKinds: r.keyPointKinds.filter((_, x) => x !== j),
    })
  return (
    <li className={cn("grid gap-3 px-3 py-3 lg:grid-cols-[2.5rem_minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,1fr)_5.5rem]", noReason && "bg-amber-50/50 dark:bg-amber-500/5")}>
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
        {i + 1}
      </span>

      {/* Step and its source */}
      <div className="min-w-0 space-y-2">
        <GrowTextarea
          value={r.step}
          onChange={(e) => onPatch({ step: e.target.value })}
          placeholder="What is done, e.g. Close the die gate"
          aria-label={`Important step ${i + 1}`}
          className="text-sm font-medium"
        />
        {r.citation ? (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            Cites
            <SourceChip
              documentId={r.citation.documentId}
              namingCode={r.citation.namingCode}
              version={r.citation.version}
              quote={r.citation.quote}
            />
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">No source passage: link an objective.</span>
        )}
        <div className="flex flex-wrap gap-1">
          {objectives.map((o) => {
            const on = r.objectiveIds.includes(o.id)
            return (
              <button
                key={o.id}
                type="button"
                title={o.text}
                aria-pressed={on}
                aria-label={`Teaches objective ${objectiveNo.get(o.id)}`}
                onClick={() =>
                  onPatch({ objectiveIds: on ? r.objectiveIds.filter((x) => x !== o.id) : [...r.objectiveIds, o.id] })
                }
                className={cn(
                  "h-7 min-w-7 rounded-full border px-2 text-xs tabular-nums transition-colors",
                  on ? "border-primary bg-primary/10 font-medium text-foreground" : "bg-background text-muted-foreground hover:border-primary/50",
                )}
              >
                {objectiveNo.get(o.id)}
              </button>
            )
          })}
        </div>
        {r.objectiveIds.length > 0 && (
          <div className="space-y-1">
            {objectives
              .filter((o) => r.objectiveIds.includes(o.id))
              .map((o) => (
                <label key={o.id} className="flex cursor-pointer items-start gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={Boolean(o.critical)}
                    onChange={() => onToggleCritical(o.id)}
                    className="mt-0.5 h-4 w-4 accent-red-600"
                  />
                  <span className="min-w-0">
                    <span className="font-medium">Must be right</span>
                    <span className="text-muted-foreground"> · objective {objectiveNo.get(o.id)}</span>
                  </span>
                </label>
              ))}
          </div>
        )}
      </div>

      {/* Key points */}
      <div className="min-w-0 space-y-1.5">
        {r.keyPoints.map((k, j) => {
          const kind = r.keyPointKinds[j] ?? "quality"
          return (
            <div key={j} className="flex items-start gap-1.5">
              <button
                type="button"
                onClick={() => cycleKind(j)}
                title="Change the kind: safety, quality or knack"
                className={cn("mt-1 inline-flex h-7 shrink-0 items-center gap-1 rounded-full border px-2 text-xs font-medium", KIND_CLASS[kind])}
              >
                {kind === "safety" && <ShieldAlert className="h-3.5 w-3.5" />}
                {KIND_LABEL[kind]}
              </button>
              <GrowTextarea
                value={k}
                onChange={(e) => setKp(j, e.target.value)}
                placeholder="What makes or breaks the step"
                aria-label={`Key point ${j + 1} of step ${i + 1}`}
                className="text-sm"
              />
              <button
                type="button"
                aria-label={`Remove key point ${j + 1}`}
                onClick={() => removeKp(j)}
                className="mt-1 rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )
        })}
        <button
          type="button"
          onClick={() => onPatch({ keyPoints: [...r.keyPoints, ""], keyPointKinds: [...r.keyPointKinds, "quality"] })}
          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          <Plus className="h-3.5 w-3.5" /> Key point
        </button>
      </div>

      {/* Reasons */}
      <div className="min-w-0 space-y-1.5">
        {r.reasons.map((x, j) => (
          <div key={j} className="flex items-start gap-1.5">
            <GrowTextarea
              value={x}
              onChange={(e) => onPatch({ reasons: r.reasons.map((y, z) => (z === j ? e.target.value : y)) })}
              placeholder="Why it matters"
              aria-label={`Reason ${j + 1} of step ${i + 1}`}
              className="text-sm"
            />
            <button
              type="button"
              aria-label={`Remove reason ${j + 1}`}
              onClick={() => onPatch({ reasons: r.reasons.filter((_, z) => z !== j) })}
              className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
        {noReason && (
          <p className="flex items-start gap-1.5 text-xs text-amber-800 dark:text-amber-200">
            <CircleHelp className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            No reason in the source: ask the author. The Training cannot be approved without it.
          </p>
        )}
        <button
          type="button"
          onClick={() => onPatch({ reasons: [...r.reasons, ""] })}
          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          <Plus className="h-3.5 w-3.5" /> Reason
        </button>
      </div>

      <div className="flex items-start gap-0.5 lg:justify-end">
        <IconButton label="Move up" disabled={i === 0} onClick={() => onMove(-1)}>
          <ArrowUp className="h-4 w-4" />
        </IconButton>
        <IconButton label="Move down" disabled={i === total - 1} onClick={() => onMove(1)}>
          <ArrowDown className="h-4 w-4" />
        </IconButton>
        <IconButton label={`Remove step ${i + 1}`} onClick={onRemove} danger>
          <Trash2 className="h-4 w-4" />
        </IconButton>
      </div>
    </li>
  )
}

function IconButton({
  label,
  onClick,
  disabled,
  danger,
  children,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  danger?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "rounded p-1.5 text-muted-foreground hover:bg-muted disabled:opacity-30",
        danger && "hover:text-destructive",
      )}
    >
      {children}
    </button>
  )
}

export function JustChanged() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
      <Sparkles className="h-3 w-3" />
      Just changed
    </span>
  )
}

/** Read view of a breakdown (Training page Overview). */
export function BreakdownReadView({
  rows,
  objectives,
}: {
  rows: DraftBreakdownRow[]
  objectives: { id: string; text: string; critical?: boolean }[]
}) {
  const critical = new Set(objectives.filter((o) => o.critical).map((o) => o.id))
  return (
    <ol className="divide-y rounded-lg border">
      {rows.map((r, i) => (
        <li key={r.id} className="grid gap-3 px-4 py-3 md:grid-cols-[2rem_minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,1fr)]">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
            {i + 1}
          </span>
          <div className="min-w-0 space-y-1">
            <p className="text-sm font-medium">{r.step}</p>
            {r.objectiveIds.some((x) => critical.has(x)) && (
              <span className="inline-flex items-center gap-1 rounded-full border border-red-300 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300">
                <AlertTriangle className="h-3 w-3" /> Must be right
              </span>
            )}
            {r.citation && (
              <div>
                <SourceChip
                  documentId={r.citation.documentId}
                  namingCode={r.citation.namingCode}
                  version={r.citation.version}
                  quote={r.citation.quote}
                />
              </div>
            )}
          </div>
          <ul className="min-w-0 space-y-1">
            {r.keyPoints.map((k, j) => {
              const kind = r.keyPointKinds[j] ?? "quality"
              return (
                <li key={j} className="flex items-start gap-1.5 text-sm">
                  <span className={cn("mt-0.5 inline-flex shrink-0 items-center rounded-full border px-1.5 text-xs font-medium", KIND_CLASS[kind])}>
                    {KIND_LABEL[kind]}
                  </span>
                  <span className="min-w-0">{k}</span>
                </li>
              )
            })}
          </ul>
          <div className="min-w-0 text-sm text-muted-foreground">
            {r.reasons.length > 0 ? (
              <ul className="space-y-1">
                {r.reasons.map((x, j) => (
                  <li key={j}>{x}</li>
                ))}
              </ul>
            ) : (
              <span className="text-xs text-amber-800 dark:text-amber-200">No reason in the source: ask the author.</span>
            )}
          </div>
        </li>
      ))}
    </ol>
  )
}
