// The result of an Attempt, shared by the desktop and the phone. A pass says
// what it changed (the Training record, Skills in level words) and gives one
// next step: request the try-out at the line when the Training needs one,
// else the next Training. A fail is a teaching moment: read the missed key
// points first ("Read these N first"), then try again with new questions.

import { useEffect, useMemo, useState } from "react"
import { useMutation, useQuery } from "convex/react"
import { Link, useLocation } from "wouter"
import { toast } from "sonner"
import {
  ArrowRight,
  BookOpenCheck,
  Check,
  ChevronDown,
  ClipboardCheck,
  FileText,
  Home,
  Loader2,
  RotateCcw,
  TrendingUp,
  UserRoundCheck,
  Users,
} from "lucide-react"
import { api } from "../../../../convex/_generated/api"
import type { Id } from "../../../../convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { StickyBar } from "@/components/mobile/round/ProofChrome"
import { cn } from "@/lib/utils"
import type { AttemptView } from "./AttemptReview"
import { isRight, QuestionCard } from "./QuestionCard"
import { docHref, errorText, ext, fmtDate, LEVEL_WORDS, useIsFloor } from "./lib"

type Q = AttemptView["questions"][number]

/** Objectives with at least one question not right, each with its passage. */
function missedObjectives(a: AttemptView) {
  const out = new Map<string, { id: string; text: string; q: Q; critical: boolean }>()
  const critical = new Set(a.questions.filter((q) => (q as { critical?: boolean | null }).critical).map((q) => q.objectiveId))
  for (const o of ext(a).objectivesFull ?? []) if (o.critical) critical.add(o.id)
  for (const q of a.questions) {
    if (isRight(q) === true || out.has(q.objectiveId)) continue
    const text = q.objectiveText ?? a.objectives.find((o) => o.id === q.objectiveId)?.text ?? q.prompt
    out.set(q.objectiveId, { id: q.objectiveId, text, q, critical: critical.has(q.objectiveId) })
  }
  // "Must be right" first: those are the ones to read before trying again.
  return [...out.values()].sort((x, y) => Number(y.critical) - Number(x.critical))
}

export function AttemptResult({
  a,
  personId,
  review,
}: {
  a: AttemptView
  personId: Id<"people"> | null
  /** Shown under the result, above the action bar: every answer. */
  review?: React.ReactNode
}) {
  const floor = useIsFloor()
  const passed = a.status === "passed"
  const x = ext(a)
  const round = a.training?.kind === "round"
  const reading = useOpened(a._id)
  const pending = a.questions.filter((q) => isRight(q) === null && (q.answeredAt != null || q.answerIndex != null)).length

  return (
    <div className={cn("flex flex-col", floor && "min-h-full flex-1")} data-attempt-result>
      <div className={cn("space-y-3", floor && "p-3")}>
        <div
          className={cn(
            "flex items-center gap-4 rounded-xl border p-4",
            passed
              ? "border-emerald-300 bg-emerald-50 dark:border-emerald-500/40 dark:bg-emerald-500/10"
              : "border-red-300 bg-red-50 dark:border-red-500/40 dark:bg-red-500/10",
          )}
        >
          <span
            className={cn(
              "flex h-16 w-16 shrink-0 items-center justify-center rounded-full text-xl font-bold tabular-nums text-white",
              passed ? "bg-emerald-600" : "bg-red-600",
            )}
          >
            {a.score ?? 0}%
          </span>
          <div className="min-w-0 space-y-0.5">
            <p className={cn("font-semibold", floor ? "text-lg" : "text-base")}>
              {passed ? (round ? "Round passed" : "Training passed") : "Not passed this time"}
            </p>
            <p className={cn("text-muted-foreground", floor ? "text-sm" : "text-sm")}>
              {a.progress.correct} of {a.progress.total} right
              {x.attemptNumber && x.attemptNumber > 1 ? ` · attempt ${x.attemptNumber}` : ""}
            </p>
          </div>
        </div>
        {pending > 0 && (
          <p className="rounded-lg border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
            {pending} {pending === 1 ? "answer is" : "answers are"} still being checked. The score updates when that is done.
          </p>
        )}
        {passed ? <PassBody a={a} floor={floor} /> : <FailBody a={a} personId={personId} floor={floor} reading={reading} />}
        {review}
      </div>
      <ResultActions a={a} personId={personId} floor={floor} opened={reading.opened} />
    </div>
  )
}

// ---- Pass ----------------------------------------------------------------------------

function PassBody({ a, floor }: { a: AttemptView; floor: boolean }) {
  return (
    <div className="space-y-2 rounded-xl border bg-card p-4">
      <p className={cn("flex items-center gap-2 font-semibold", floor ? "text-base" : "text-sm")}>
        <ClipboardCheck className="h-5 w-5 text-emerald-600" /> Training record written
      </p>
      <p className={cn("text-muted-foreground", floor ? "text-sm" : "text-sm")}>
        Proof that {a.personName} passed {a.training?.code} v{a.trainingVersion} on {fmtDate(a.finishedAt)}.
      </p>
      {a.skillsRaised.map((s) => (
        <p key={s.skillId} className={cn("flex items-start gap-2", floor ? "text-base" : "text-sm")}>
          <TrendingUp className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
          <span>
            {s.renewed ? "Skill renewed: " : "Skill raised: "}
            <span className="font-medium">{s.name}</span> to level {s.toLevel} ({LEVEL_WORDS[s.toLevel] ?? ""})
          </span>
        </p>
      ))}
    </div>
  )
}

// ---- Fail ----------------------------------------------------------------------------

type Reading = ReturnType<typeof useOpened>

function FailBody({
  a,
  personId,
  floor,
  reading,
}: {
  a: AttemptView
  personId: Id<"people"> | null
  floor: boolean
  reading: Reading
}) {
  const x = ext(a)
  const missed = useMemo(() => missedObjectives(a), [a])
  const mbr = (x.mustBeRightMissed ?? [])
    .map((id) => missed.find((m) => m.id === id)?.text ?? a.objectives.find((o) => o.id === id)?.text)
    .filter(Boolean) as string[]
  return (
    <div className="space-y-3">
      {mbr.length > 0 && (
        <p className={cn("rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-red-800 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200", floor ? "text-base" : "text-sm")}>
          Not passed: the question on {mbr.map((t) => `"${t}"`).join(" and ")} must be right to pass.
        </p>
      )}
      <ReadThese a={a} personId={personId} missed={missed} floor={floor} reading={reading} />
    </div>
  )
}

/** Local record of opened miss cards, per Attempt (kept on a reload). */
function useOpened(attemptId: string) {
  const key = `oppr.attempt.opened.${attemptId}`
  const [opened, setOpened] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(window.sessionStorage.getItem(key) ?? "[]") as string[])
    } catch {
      return new Set()
    }
  })
  function open(id: string) {
    setOpened((cur) => {
      if (cur.has(id)) return cur
      const next = new Set(cur).add(id)
      try {
        window.sessionStorage.setItem(key, JSON.stringify([...next]))
      } catch {
        // Not kept: the cards are opened again after a reload.
      }
      return next
    })
  }
  return { opened, open }
}

function ReadThese({
  a,
  personId,
  missed,
  floor,
  reading,
}: {
  a: AttemptView
  personId: Id<"people"> | null
  missed: ReturnType<typeof missedObjectives>
  floor: boolean
  reading: Reading
}) {
  const markReviewed = useMutation(api.attempts.markMissesReviewed)
  const { opened, open } = reading
  const [expanded, setExpanded] = useState<string | null>(null)
  // Only "Must be right" cards gate the retry; the others are there to help.
  const gate = missed.filter((m) => m.critical)
  const done = gate.every((m) => opened.has(m.id))
  const recorded = ext(a).missesReviewedAt != null
  useEffect(() => {
    if (!done || recorded || !personId || personId !== a.personId) return
    markReviewed({ id: a._id, personId }).catch(() => {})
  }, [done, recorded, personId, a._id, a.personId, markReviewed])

  if (missed.length === 0) return null
  return (
    <div className="space-y-2 rounded-xl border bg-card p-4" data-read-these>
      <p className={cn("flex items-center gap-2 font-semibold", floor ? "text-base" : "text-sm")}>
        <BookOpenCheck className="h-5 w-5 text-primary" />
        Read again: {missed.length} {missed.length === 1 ? "thing" : "things"} you missed
      </p>
      <p className={cn("text-muted-foreground", floor ? "text-sm" : "text-xs")}>
        {gate.length > 0
          ? `Open the ${gate.length === 1 ? "card marked" : `${gate.length} cards marked`} Must be right before you try again. You get new questions on the same things.`
          : "Read what you missed, then try again: you get new questions on the same things."}
      </p>
      <ul className="space-y-2">
        {missed.map((m) => {
          const isOpen = expanded === m.id
          const seen = opened.has(m.id)
          return (
            <li key={m.id} className={cn("rounded-lg border", m.critical && "border-red-300 dark:border-red-500/40")}>
              <button
                type="button"
                data-miss-card
                aria-expanded={isOpen}
                onClick={() => {
                  setExpanded(isOpen ? null : m.id)
                  open(m.id)
                }}
                className={cn("flex min-h-12 w-full items-center gap-2 px-3 py-2 text-left", floor ? "text-base" : "text-sm")}
              >
                <span
                  className={cn(
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border",
                    seen && "border-emerald-500 bg-emerald-500 text-white",
                  )}
                >
                  {seen && <Check className="h-3.5 w-3.5" />}
                </span>
                <span className="min-w-0 flex-1">
                  {m.text}
                  {m.critical && <span className="ml-1.5 text-xs font-medium text-red-700 dark:text-red-300">Must be right</span>}
                </span>
                <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform", isOpen && "rotate-180")} />
              </button>
              {isOpen && (
                <div className="space-y-2 border-t px-3 py-2.5">
                  {m.q.citation.quote ? (
                    <p className={cn("italic leading-relaxed", floor ? "text-base" : "text-sm")}>"{m.q.citation.quote}"</p>
                  ) : (
                    <p className="text-sm text-muted-foreground">Open the passage to read it in the document.</p>
                  )}
                  {m.q.explanation && <p className={cn(floor ? "text-[15px]" : "text-sm")}>{m.q.explanation}</p>}
                  <Link
                    href={docHref(m.q.citation.documentId, {
                      version: m.q.citation.version,
                      quote: m.q.citation.quote,
                      mobile: floor,
                    })}
                    data-open-document
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-lg border bg-background px-3 font-medium text-primary-strong active:bg-muted [@media(hover:hover)]:hover:bg-muted",
                      floor ? "min-h-12 text-base" : "min-h-9 text-sm",
                    )}
                  >
                    <FileText className="h-4 w-4" />
                    Open the document
                    <span className="font-mono text-xs text-muted-foreground">
                      {m.q.citation.namingCode}
                      {m.q.citation.version != null && ` v${m.q.citation.version}`}
                    </span>
                  </Link>
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

// ---- Next step -----------------------------------------------------------------------

function ResultActions({
  a,
  personId,
  floor,
  opened,
}: {
  a: AttemptView
  personId: Id<"people"> | null
  floor: boolean
  opened: Set<string>
}) {
  const [, navigate] = useLocation()
  const x = ext(a)
  const passed = a.status === "passed"
  const isOwner = personId != null && personId === a.personId
  const home = floor ? "/m" : "/learn"
  const homeLabel = floor ? "Back to Home" : "Back to Learn"

  const secondary = (
    <Button
      variant="outline"
      className={cn("gap-1.5", floor ? "h-12 rounded-xl text-base" : "")}
      onClick={() => navigate(home)}
    >
      <Home className="h-4 w-4" /> {homeLabel}
    </Button>
  )

  let primary: React.ReactNode = null
  let extra: React.ReactNode = null
  if (isOwner && passed && x.tryOutRequired && !x.tryOut) {
    extra = <RequestTryOut a={a} personId={personId!} floor={floor} />
  } else if (isOwner && passed) {
    primary = <NextUp a={a} personId={personId!} floor={floor} />
  } else if (isOwner && a.status === "failed") {
    primary = <RetryButton a={a} personId={personId!} floor={floor} opened={opened} />
    if ((x.failStreak ?? 0) >= (x.walkthroughAfter ?? 2)) extra = <WalkThrough a={a} personId={personId!} floor={floor} />
  }

  if (floor) {
    return (
      <>
        {extra && <div className="px-3 pb-3">{extra}</div>}
        <StickyBar className="flex-col items-stretch">
          {primary}
          {secondary}
        </StickyBar>
      </>
    )
  }
  return (
    <div className="mt-3 space-y-3">
      {extra}
      <div className="flex flex-wrap items-center gap-2">
        {primary}
        {secondary}
      </div>
    </div>
  )
}

function RetryButton({
  a,
  personId,
  floor,
  opened,
}: {
  a: AttemptView
  personId: Id<"people">
  floor: boolean
  opened: Set<string>
}) {
  const [, navigate] = useLocation()
  const start = useMutation(api.attempts.start)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const x = ext(a)
  const missed = missedObjectives(a)
  const gate = missed.filter((m) => m.critical)
  const allOpened = x.missesReviewedAt != null || gate.every((m) => opened.has(m.id))
  const canRetry = a.training?.liveVersion != null && a.training.status !== "archived"
  if (!canRetry) return <p className="text-sm text-muted-foreground">This Training is not in use any more, so it cannot be done again.</p>
  const round = a.training?.kind === "round"
  return (
    <div className="flex flex-col gap-1">
      <Button
        className={cn("gap-1.5", floor ? "h-12 w-full rounded-xl text-base" : "")}
        disabled={busy || !allOpened}
        data-retry
        onClick={async () => {
          setBusy(true)
          setError(null)
          try {
            const id = await start({ trainingId: a.trainingId, personId })
            navigate(floor ? `/m/${round ? "round" : "attempt"}/${id}` : `/learn/attempts/${id}`)
          } catch (err) {
            setError(errorText(err))
          } finally {
            setBusy(false)
          }
        }}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
        {round ? "Walk the Round again" : "Try again with new questions"}
      </Button>
      {!allOpened && (
        <p className={cn("text-center text-muted-foreground", floor ? "text-sm" : "text-xs")}>
          First open the {gate.length === 1 ? "card" : "cards"} marked Must be right above.
        </p>
      )}
      {error && <p className="text-sm text-red-700 dark:text-red-300">{error}</p>}
    </div>
  )
}

/** The next Training to do, from My learning. */
function NextUp({ a, personId, floor }: { a: AttemptView; personId: Id<"people">; floor: boolean }) {
  const [, navigate] = useLocation()
  const learning = useQuery(api.skills.myLearning, { personId })
  const start = useMutation(api.attempts.start)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const next = useMemo(() => {
    for (const item of learning?.todo ?? []) {
      const status = (item as { status?: string }).status
      if (status && status !== "startable") continue
      for (const t of item.row.offered ?? []) if (!t.passed && t._id !== a.trainingId) return t
    }
    return null
  }, [learning, a.trainingId])
  if (!next) return null
  return (
    <div className="flex flex-col gap-1">
      <Button
        className={cn("gap-1.5", floor ? "h-12 w-full rounded-xl text-base" : "")}
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          setError(null)
          try {
            const id = await start({ trainingId: next._id, personId })
            navigate(floor ? `/m/${next.kind === "round" ? "round" : "attempt"}/${id}` : `/learn/attempts/${id}`)
          } catch (err) {
            setError(errorText(err))
          } finally {
            setBusy(false)
          }
        }}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
        <span className="truncate">Next up: {next.title}</span>
      </Button>
      {error && <p className="text-sm text-red-700 dark:text-red-300">{error}</p>}
    </div>
  )
}

function TrainerPicker({
  trainers,
  value,
  onChange,
  floor,
}: {
  trainers: { _id: Id<"people">; name: string; role: string; level3: boolean }[]
  value: Id<"people"> | null
  onChange: (id: Id<"people"> | null) => void
  floor: boolean
}) {
  return (
    <div className="space-y-1.5" role="radiogroup" aria-label="Trainer">
      {trainers.slice(0, 6).map((t) => (
        <button
          key={t._id}
          type="button"
          role="radio"
          aria-checked={value === t._id}
          onClick={() => onChange(t._id)}
          className={cn(
            "flex min-h-12 w-full items-center gap-3 rounded-lg border-2 px-3 text-left",
            floor ? "text-base" : "text-sm",
            value === t._id ? "border-primary bg-primary/10" : "border-border",
          )}
        >
          <UserRoundCheck className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1">
            <span className="block font-medium">{t.name}</span>
            <span className="block text-xs text-muted-foreground">{t.level3 ? "Level 3, can teach it" : t.role}</span>
          </span>
        </button>
      ))}
      <button
        type="button"
        role="radio"
        aria-checked={value === null}
        onClick={() => onChange(null)}
        className={cn(
          "flex min-h-12 w-full items-center gap-3 rounded-lg border-2 px-3 text-left",
          floor ? "text-base" : "text-sm",
          value === null ? "border-primary bg-primary/10" : "border-border",
        )}
      >
        <Users className="h-4 w-4 shrink-0 text-muted-foreground" />
        Whoever is free first
      </button>
    </div>
  )
}

function RequestTryOut({ a, personId, floor }: { a: AttemptView; personId: Id<"people">; floor: boolean }) {
  const trainers = useQuery(api.tryOuts.trainers, { trainingId: a.trainingId, personId })
  const mine = useQuery(api.tryOuts.mine, { personId })
  const request = useMutation(api.tryOuts.request)
  const [trainer, setTrainer] = useState<Id<"people"> | null | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const open = mine?.find((r) => r.trainingId === a.trainingId && r.kind === "tryout" && r.status === "open")
  const picked = trainer === undefined ? (trainers?.[0]?._id ?? null) : trainer

  if (open) {
    return (
      <div className="space-y-1 rounded-xl border border-primary/30 bg-primary/5 p-4">
        <p className={cn("font-semibold", floor ? "text-base" : "text-sm")}>Try-out requested</p>
        <p className={cn("text-muted-foreground", floor ? "text-sm" : "text-sm")}>
          Waiting for {open.trainerName ?? "a trainer"} since {fmtDate(open.createdAt)}. They watch you do the job at the line
          and sign it. That raises the Skill to level 2 (Can do it).
        </p>
      </div>
    )
  }
  return (
    <div className="space-y-3 rounded-xl border border-primary/30 bg-primary/5 p-4" data-request-tryout>
      <div className="space-y-1">
        <p className={cn("font-semibold", floor ? "text-base" : "text-sm")}>Next: a try-out at the line</p>
        <p className={cn("text-muted-foreground", floor ? "text-sm" : "text-sm")}>
          A trainer watches you do the job once and signs it. Then you can do it on your own (level 2, Can do it).
        </p>
      </div>
      {trainers === undefined ? (
        <div className="h-24 animate-pulse rounded-lg bg-muted" />
      ) : (
        <TrainerPicker trainers={trainers} value={picked} onChange={setTrainer} floor={floor} />
      )}
      <Button
        className={cn("w-full gap-1.5", floor ? "h-12 rounded-xl text-base" : "")}
        disabled={busy || trainers === undefined}
        onClick={async () => {
          setBusy(true)
          setError(null)
          try {
            await request({ attemptId: a._id, trainerId: picked, personId })
            toast.success("Try-out requested")
          } catch (err) {
            setError(errorText(err))
          } finally {
            setBusy(false)
          }
        }}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserRoundCheck className="h-4 w-4" />}
        Request try-out
      </Button>
      {error && <p className="text-sm text-red-700 dark:text-red-300">{error}</p>}
    </div>
  )
}

function WalkThrough({ a, personId, floor }: { a: AttemptView; personId: Id<"people">; floor: boolean }) {
  const trainers = useQuery(api.tryOuts.trainers, { trainingId: a.trainingId, personId })
  const mine = useQuery(api.tryOuts.mine, { personId })
  const request = useMutation(api.tryOuts.request)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const who = trainers?.[0] ?? null
  const open = mine?.find((r) => r.trainingId === a.trainingId && r.kind === "walkthrough" && r.status === "open")
  if (open)
    return (
      <p className={cn("rounded-lg border bg-muted/40 px-3 py-2", floor ? "text-sm" : "text-sm")}>
        Walk-through asked from {open.trainerName ?? "an Engineer"} on {fmtDate(open.createdAt)}.
      </p>
    )
  return (
    <div className="space-y-2 rounded-xl border bg-card p-4">
      <p className={cn("text-muted-foreground", floor ? "text-sm" : "text-sm")}>
        Not passed {ext(a).failStreak === 2 ? "twice" : `${ext(a).failStreak ?? 2} times`} in a row. Someone can show you at the line, that often helps more than reading.
      </p>
      <Button
        variant="outline"
        className={cn("w-full gap-1.5", floor ? "h-12 rounded-xl text-base" : "")}
        disabled={busy || trainers === undefined}
        onClick={async () => {
          setBusy(true)
          setError(null)
          try {
            await request({ attemptId: a._id, trainerId: who?._id ?? null, personId, kind: "walkthrough" })
            toast.success("Asked for a walk-through")
          } catch (err) {
            setError(errorText(err))
          } finally {
            setBusy(false)
          }
        }}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />}
        Ask {who ? who.name.split(" ")[0] : "a trainer"} for a walk-through at the line
      </Button>
      {error && <p className="text-sm text-red-700 dark:text-red-300">{error}</p>}
    </div>
  )
}

/**
 * "See every answer": the whole Attempt, question by question, inside the
 * page (the phone never opens the desktop record).
 */
export function EveryAnswer({ a, personId }: { a: AttemptView; personId: Id<"people"> | null }) {
  const floor = useIsFloor()
  const [open, setOpen] = useState(false)
  return (
    <div className="space-y-3">
      <button
        type="button"
        aria-expanded={open}
        data-every-answer
        onClick={() => setOpen((x) => !x)}
        className={cn(
          "flex min-h-12 w-full items-center justify-between rounded-xl border bg-card px-4 font-medium",
          floor ? "text-base" : "text-sm",
        )}
      >
        See every answer
        <ChevronDown className={cn("h-5 w-5 transition-transform", open && "rotate-180")} />
      </button>
      {open &&
        a.questions.map((q, i) => (
          <QuestionCard
            key={q.id}
            attemptId={a._id}
            personId={personId}
            question={q}
            number={i + 1}
            total={a.questions.length}
            canAnswer={false}
            review
          />
        ))}
    </div>
  )
}
