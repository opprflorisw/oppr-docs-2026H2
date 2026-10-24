import { useEffect, useState } from "react"
import { useAction, useQuery } from "convex/react"
import { Link } from "wouter"
import {
  AlertTriangle,
  BookOpenText,
  CheckCircle2,
  CircleHelp,
  Flag,
  Footprints,
  Lightbulb,
  Loader2,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  TrendingDown,
} from "lucide-react"
import { toast } from "sonner"
import { api } from "../../../../convex/_generated/api"
import type { Id } from "../../../../convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { useCheckIn } from "@/lib/checkIn"
import { cn } from "@/lib/utils"
import { daysAgo, errorText, fmtDate, ProgressBar } from "./lib"

type SignalKind = "misconception" | "unclear_question" | "document_gap" | "too_easy" | "practice_differs"

const KIND: Record<SignalKind, { label: string; icon: typeof AlertTriangle; tone: string }> = {
  misconception: {
    label: "Shared misconception",
    icon: TrendingDown,
    tone: "border-red-300 bg-red-50 text-red-800 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200",
  },
  unclear_question: {
    label: "Unclear question",
    icon: CircleHelp,
    tone: "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100",
  },
  document_gap: {
    label: "Gap in the document",
    icon: BookOpenText,
    tone: "border-violet-300 bg-violet-50 text-violet-900 dark:border-violet-500/40 dark:bg-violet-500/10 dark:text-violet-100",
  },
  practice_differs: {
    label: "Done differently on the floor",
    icon: Footprints,
    tone: "border-sky-300 bg-sky-50 text-sky-900 dark:border-sky-500/40 dark:bg-sky-500/10 dark:text-sky-100",
  },
  too_easy: {
    label: "Too easy",
    icon: Lightbulb,
    tone: "border-slate-300 bg-slate-50 text-slate-800 dark:border-slate-500/40 dark:bg-slate-500/10 dark:text-slate-200",
  },
}

export interface SignalObjective {
  id: string
  text: string
  documentId: Id<"documents">
  namingCode: string
}

/**
 * "Still on point?" (CONTEXT.md: Training): an AI analysis of every answer
 * on the version in use. Shared misconceptions, unclear questions, gaps in
 * the source document, differences with the floor, and objectives that are
 * too easy, each with examples and a next step. A gap in the document offers
 * "Propose a revision" (the normal Proposed revision flow).
 */
export function StillOnPointPanel({
  trainingId,
  objectives,
  onOpenQuestions,
}: {
  trainingId: Id<"trainings">
  objectives: SignalObjective[]
  /** Opens the question bank (in the builder) to fix a question. */
  onOpenQuestions?: () => void
}) {
  const data = useQuery(api.trainingBuilder.signals, { trainingId })
  const refresh = useAction(api.ai.trainingBuilder.refreshSignals)
  const { person } = useCheckIn()
  const engineer = person?.kind === "engineer"
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [propose, setPropose] = useState<{ documentId: Id<"documents">; namingCode: string; note: string } | null>(null)
  const objectiveById = new Map(objectives.map((o, i) => [o.id, { ...o, n: i + 1 }]))

  async function run() {
    setBusy(true)
    setError(null)
    try {
      const r = await refresh({ trainingId })
      toast.success(r.items === 0 ? "Analysis done. Nothing needs attention." : `Analysis done: ${r.items} ${r.items === 1 ? "point" : "points"}.`)
    } catch (err) {
      setError(errorText(err, "The analysis could not be finished. Try again."))
    } finally {
      setBusy(false)
    }
  }

  if (data === undefined) {
    return <div className="h-40 animate-pulse rounded-lg bg-muted" />
  }
  if (data === null) return null
  const row = data.row
  const running = row?.status === "running" || busy
  const items = row?.status === "ready" ? row.items : []
  const attention = items.filter((i) => i.kind !== "too_easy")
  const easy = items.filter((i) => i.kind === "too_easy")

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl space-y-1">
          <h3 className="text-sm font-semibold">Still on point?</h3>
          <p className="text-sm text-muted-foreground">
            The AI reads every answer on v{data.version}: chosen options, open answers and their grades, and flags. It
            reports patterns, never single answers. You decide what to change.
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Button size="sm" variant="outline" className="gap-1.5" disabled={running || !engineer} onClick={() => void run()}>
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {running ? "Analysing" : "Refresh analysis"}
          </Button>
          {!engineer && <span className="text-xs text-muted-foreground">Check in as an Engineer to refresh it.</span>}
        </div>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>{data.finished} finished Attempts on v{data.version}</span>
        {row && row.status !== "running" && (
          <span>
            Last analysis {fmtDate(row.at)} ({daysAgo(row.at)}) of {row.attemptsAnalysed} Attempts
            {data.fromVersion !== data.version && `, on v${data.fromVersion}`}
          </span>
        )}
        {row && data.newSince > 0 && (
          <span className="font-medium text-foreground">
            {data.newSince} new {data.newSince === 1 ? "Attempt" : "Attempts"} since
          </span>
        )}
      </div>

      {error && (
        <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {!row && !running && (
        <div className="rounded-lg border border-dashed px-4 py-8 text-center">
          <p className="text-sm font-medium">No analysis yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            {data.finished === 0
              ? "Once people have done Attempts, the analysis shows what they misunderstand and where the document falls short."
              : "Press Refresh analysis to see what people misunderstand and where the document falls short."}
          </p>
        </div>
      )}
      {running && (
        <div className="flex items-center gap-2 rounded-lg border px-4 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Reading the answers. This takes about a minute.
        </div>
      )}
      {row?.status === "failed" && !running && (
        <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          The last analysis failed{row.error ? `: ${row.error}` : "."} Try again.
        </p>
      )}

      {row?.status === "ready" && !running && (
        <>
          {row.summary && (
            <div
              className={cn(
                "flex items-start gap-2 rounded-lg border px-4 py-3 text-sm",
                attention.length > 0
                  ? "border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100"
                  : "border-emerald-300 bg-emerald-50 text-emerald-950 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-100",
              )}
            >
              {attention.length > 0 ? (
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              ) : (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              )}
              <span>{row.summary}</span>
            </div>
          )}
          <ul className="space-y-3">
            {[...attention, ...easy].map((item, i) => {
              const k = KIND[item.kind]
              const o = item.objectiveId ? objectiveById.get(item.objectiveId) : undefined
              return (
                <li key={i} className="space-y-2 rounded-lg border p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium", k.tone)}>
                      <k.icon className="h-3.5 w-3.5" /> {k.label}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {item.count} {item.count === 1 ? "answer" : "answers"}
                    </span>
                    {o && (
                      <span className="min-w-0 truncate text-xs text-muted-foreground">
                        · Objective {o.n}: {o.text}
                      </span>
                    )}
                  </div>
                  <p className="text-sm font-medium">{item.text}</p>
                  {item.examples.length > 0 && (
                    <ul className="space-y-1">
                      {item.examples.map((ex, j) => (
                        <li key={j} className="border-l-2 pl-3 text-sm italic text-muted-foreground">
                          "{ex}"
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="flex items-start gap-1.5 text-sm">
                    <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                    <span>{item.suggestion}</span>
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {(item.kind === "document_gap" || item.kind === "misconception" || item.kind === "practice_differs") && o && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5"
                        disabled={!engineer}
                        title={engineer ? undefined : "Check in as an Engineer"}
                        onClick={() =>
                          setPropose({
                            documentId: o.documentId,
                            namingCode: o.namingCode,
                            note: `From Training "Still on point?": ${item.text} ${item.suggestion}`.slice(0, 480),
                          })
                        }
                      >
                        <BookOpenText className="h-4 w-4" /> Propose a revision of {o.namingCode}
                      </Button>
                    )}
                    {(item.kind === "unclear_question" || item.kind === "too_easy" || item.kind === "misconception") &&
                      onOpenQuestions && (
                        <Button size="sm" variant="outline" onClick={onOpenQuestions}>
                          Open the questions
                        </Button>
                      )}
                  </div>
                </li>
              )
            })}
          </ul>
        </>
      )}

      <ProposeRevisionDialog value={propose} onClose={() => setPropose(null)} />
    </div>
  )
}

/** Starts the normal Proposed revision flow for the source document of a gap. */
function ProposeRevisionDialog({
  value,
  onClose,
}: {
  value: { documentId: Id<"documents">; namingCode: string; note: string } | null
  onClose: () => void
}) {
  const propose = useAction(api.ai.revision.propose)
  const { person } = useCheckIn()
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const open = value !== null

  // A new signal starts with its own note.
  useEffect(() => {
    if (value) {
      setNote(value.note)
      setError(null)
    }
  }, [value])

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o && !busy) onClose()
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Propose a revision of {value?.namingCode}</DialogTitle>
          <DialogDescription>
            The AI reads the Published version and this signal from the Training, and proposes small edits with their
            reasons. They become a draft version that goes through normal review. Nothing is published.
          </DialogDescription>
        </DialogHeader>
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={4} maxLength={480} className="text-sm" aria-label="What the revision should fix" />
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            disabled={busy || !value || person?.kind !== "engineer"}
            onClick={async () => {
              if (!value || !person) return
              setBusy(true)
              setError(null)
              try {
                await propose({
                  documentId: value.documentId,
                  source: { kind: "insight", note: [note.trim(), `Requested by ${person.name}`].filter(Boolean).join(". ") },
                })
                toast.success(`Preparing a revision of ${value.namingCode}. It appears on the document in about a minute.`)
                onClose()
              } catch (err) {
                setError(errorText(err))
              } finally {
                setBusy(false)
              }
            }}
          >
            {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Prepare the revision
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * How it is going: per Learning objective, how often people get it right on
 * their first Attempt and the wrong answer chosen most; flagged questions and
 * how many questions code had to write.
 */
export function TrainingInsightsPanel({
  trainingId,
  objectives,
  onOpenQuestions,
}: {
  trainingId: Id<"trainings">
  objectives: SignalObjective[]
  onOpenQuestions?: () => void
}) {
  const stats = useQuery(api.trainingBuilder.objectiveStats, { trainingId })
  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold">How it is going</h3>
          {stats && (
            <p className="text-sm text-muted-foreground">
              {stats.attempts === 0
                ? `No finished Attempts on v${stats.version} yet.`
                : `${stats.attempts} finished ${stats.attempts === 1 ? "Attempt" : "Attempts"} by ${stats.people} ${stats.people === 1 ? "person" : "people"} on v${stats.version}, ${stats.passed} passed.`}
              {stats.questions > 0 &&
                ` ${Math.round((stats.byCode / stats.questions) * 100)}% of the questions were written by code.`}
            </p>
          )}
        </div>
        {stats === undefined ? (
          <div className="h-32 animate-pulse rounded-lg bg-muted" />
        ) : stats && stats.attempts > 0 ? (
          <div className="overflow-hidden rounded-lg border">
            <div className="grid grid-cols-[minmax(0,1.6fr)_8rem_minmax(0,1fr)] gap-3 border-b bg-muted/40 px-4 py-2 text-xs font-medium text-muted-foreground">
              <span>Learning objective</span>
              <span>Right first time</span>
              <span>Wrong answer chosen most</span>
            </div>
            <ul className="divide-y">
              {stats.objectives.map((o, i) => (
                <li key={o.objectiveId} className="grid grid-cols-[minmax(0,1.6fr)_8rem_minmax(0,1fr)] items-start gap-3 px-4 py-3 text-sm">
                  <span className="min-w-0">
                    <span className="mr-1.5 text-muted-foreground">{i + 1}.</span>
                    {o.text}
                    {o.critical && (
                      <span className="ml-1.5 inline-flex items-center gap-0.5 text-xs font-medium text-red-700 dark:text-red-300">
                        <ShieldAlert className="h-3 w-3" /> Must be right
                      </span>
                    )}
                  </span>
                  <span className="space-y-1">
                    <span className={cn("block font-semibold tabular-nums", o.firstTryRight != null && o.firstTryRight < 60 && "text-red-700 dark:text-red-300")}>
                      {o.firstTryRight == null ? "No answers" : `${o.firstTryRight}%`}
                    </span>
                    {o.firstTryRight != null && <ProgressBar value={o.firstTryRight} tone={o.firstTryRight >= 80 ? "emerald" : "primary"} />}
                  </span>
                  <span className="min-w-0 text-muted-foreground">
                    {o.topWrong ? (
                      <>
                        "{o.topWrong.text}" <span className="text-xs">({o.topWrong.count}x)</span>
                      </>
                    ) : (
                      "None"
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {stats && stats.flagged.length > 0 && (
          <div className="space-y-2 rounded-lg border p-4">
            <p className="flex items-center gap-1.5 text-sm font-medium">
              <Flag className="h-4 w-4 text-amber-600" /> Flagged as unclear or wrong ({stats.flagged.length})
            </p>
            <ul className="space-y-2">
              {stats.flagged.map((f, i) => (
                <li key={i} className="text-sm">
                  <span className="block">{f.prompt}</span>
                  <span className="block text-muted-foreground">"{f.flag}"</span>
                </li>
              ))}
            </ul>
            {onOpenQuestions ? (
              <Button size="sm" variant="outline" onClick={onOpenQuestions}>
                Open the questions
              </Button>
            ) : (
              <Link href="/library/health" className="text-xs text-primary hover:underline">
                Flags also show in the source document's insights
              </Link>
            )}
          </div>
        )}
      </section>
      <StillOnPointPanel trainingId={trainingId} objectives={objectives} onOpenQuestions={onOpenQuestions} />
    </div>
  )
}

/** The short "Still on point?" line for the Training page header area. */
export function StillOnPointSignal({ trainingId, onOpen }: { trainingId: Id<"trainings">; onOpen: () => void }) {
  const data = useQuery(api.trainingBuilder.signals, { trainingId })
  if (!data?.row || data.row.status !== "ready" || data.attention === 0) return null
  const top = data.row.items.filter((i) => i.kind !== "too_easy").sort((a, b) => b.count - a.count)[0]
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-left text-sm text-amber-950 hover:bg-amber-100 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="font-medium">
          Still on point? {data.attention} {data.attention === 1 ? "point needs" : "points need"} attention
          {data.fromVersion !== data.version ? `, from the analysis of v${data.fromVersion}` : ""}.
        </span>{" "}
        {top && <span>{top.text}</span>}
      </span>
      <span className="shrink-0 text-xs font-medium underline-offset-2 hover:underline">See why</span>
    </button>
  )
}
