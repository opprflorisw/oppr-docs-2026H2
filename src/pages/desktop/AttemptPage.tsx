import { useEffect, useState } from "react"
import { useMutation, useQuery } from "convex/react"
import { Link, useLocation, useRoute } from "wouter"
import { toast } from "sonner"
import {
  ArrowLeft,
  ArrowRight,
  Award,
  CircleAlert,
  ClipboardCheck,
  Loader2,
  Printer,
  RotateCcw,
  Sparkles,
  TrendingUp,
  XCircle,
} from "lucide-react"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import { TopBar } from "@/components/layout/TopBar"
import { PageHeader } from "@/components/layout/PageHeader"
import { Button } from "@/components/ui/button"
import { useCheckIn } from "@/lib/checkIn"
import { cn } from "@/lib/utils"
import { errorText, fmtDate, KindBadge, ProgressBar } from "@/components/learn/training/lib"
import { QuestionCard } from "@/components/learn/training/QuestionCard"
import { AttemptReview, type AttemptView } from "@/components/learn/training/AttemptReview"
import { RoundRunner } from "@/components/learn/training/RoundRunner"

// /learn/attempts/:id: doing (or reviewing) one Attempt; every question cites its source.
export function AttemptPage() {
  const [, params] = useRoute<{ id: string }>("/learn/attempts/:id")
  const id = params?.id as Id<"trainingAttempts"> | undefined
  const a = useQuery(api.attempts.get, id ? { id } : "skip")
  const { person } = useCheckIn()

  const crumbs = [
    { label: "Learn", href: "/learn" },
    ...(a?.training ? [{ label: a.training.code, href: `/learn/trainings/${a.trainingId}` }] : []),
    { label: "Attempt" },
  ]

  if (a === undefined) {
    return (
      <Shell crumbs={crumbs}>
        <div className="mx-auto w-full max-w-3xl space-y-3 p-6">
          <div className="h-5 w-1/2 animate-pulse rounded bg-muted" />
          <div className="h-40 animate-pulse rounded-lg bg-muted" />
        </div>
      </Shell>
    )
  }
  if (a === null) {
    return (
      <Shell crumbs={crumbs}>
        <div className="flex flex-col items-center gap-2 p-12 text-center">
          <CircleAlert className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm font-medium">This Attempt does not exist</p>
          <Button asChild size="sm" variant="outline">
            <Link href="/learn?tab=records">Training records</Link>
          </Button>
        </div>
      </Shell>
    )
  }

  const isOwner = person?._id === a.personId
  const finished = a.status === "passed" || a.status === "failed"

  return (
    <Shell crumbs={crumbs}>
      <div className="contents print:hidden">
        <PageHeader
          icon={ClipboardCheck}
          title={a.training ? a.training.title : "Attempt"}
          subtitle={
            <span className="flex flex-wrap items-center gap-1.5">
              <span className="font-mono">
                {a.training?.code} · v{a.trainingVersion}
              </span>
              {a.training && <KindBadge kind={a.training.kind} />}
              <span>· {a.personName}</span>
              <span>· started {fmtDate(a.startedAt)}</span>
            </span>
          }
          actions={
            finished ? (
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => window.print()}>
                <Printer className="h-3.5 w-3.5" /> Print
              </Button>
            ) : undefined
          }
        />
      </div>
      <div className="mx-auto w-full max-w-3xl space-y-4 p-6 print:max-w-none print:p-0">
        {a.status === "generating" && <Generating startedAt={a.startedAt} kind={a.training?.kind ?? "course"} />}
        {a.status === "error" && <GenerationError a={a} isOwner={isOwner} />}
        {a.status === "abandoned" && (
          <Notice>
            This Attempt was stopped before it was finished, so it has no score.{" "}
            <Link href={`/learn/trainings/${a.trainingId}`} className="font-medium text-primary hover:underline">
              Back to the Training
            </Link>
          </Notice>
        )}
        {a.status === "in_progress" &&
          (isOwner && person ? (
            a.round ? (
              <>
                <Progress a={a} />
                <RoundRunner key={a._id} a={a} personId={person._id} />
                <FinishBar a={a} personId={person._id} />
              </>
            ) : (
              <CourseRunner key={a._id} a={a} personId={person._id} />
            )
          ) : (
            <Notice>
              This Attempt belongs to <span className="font-medium">{a.personName}</span> and is in progress (
              {a.progress.answered} of {a.progress.total} answered). Only {a.personName.split(" ")[0]} can answer: check in as{" "}
              {a.personName.split(" ")[0]} (top right) to continue.
            </Notice>
          ))}
        {finished && (
          <>
            <Result a={a} isOwner={isOwner} />
            <div className="flex items-center gap-2 pt-2 print:hidden">
              <h2 className="text-sm font-semibold">Every question and answer</h2>
              <span className="text-[11px] text-muted-foreground">This is the record an auditor or labour inspector sees.</span>
            </div>
            <AttemptReview a={a} />
          </>
        )}
      </div>
    </Shell>
  )
}

function Shell({ crumbs, children }: { crumbs: { label: string; href?: string }[]; children: React.ReactNode }) {
  return (
    <div className="flex flex-col">
      {/* display:contents keeps the bar sticky, and lets print hide it. */}
      <div className="contents print:hidden">
        <TopBar breadcrumb={crumbs} />
      </div>
      {children}
    </div>
  )
}

function Notice({ children }: { children: React.ReactNode }) {
  return <div className="rounded-lg border bg-muted/30 px-4 py-3 text-sm">{children}</div>
}

function Generating({ startedAt, kind }: { startedAt: number; kind: "course" | "round" }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  const secs = Math.max(0, Math.floor((now - startedAt) / 1000))
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border px-6 py-12 text-center">
      <span className="relative flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
        <Sparkles className="h-5 w-5 text-primary" />
        <Loader2 className="absolute h-10 w-10 animate-spin text-primary/40" />
      </span>
      <p className="text-sm font-medium">Preparing your questions</p>
      <p className="max-w-md text-xs text-muted-foreground">
        They are written fresh for you from the published documents, one or more for every Learning objective, and each is
        checked against the passage it cites.{kind === "round" ? " Then you walk the Round stop by stop." : ""}
      </p>
      <p className="text-[11px] tabular-nums text-muted-foreground">{secs}s · usually under a minute</p>
    </div>
  )
}

function GenerationError({ a, isOwner }: { a: AttemptView; isOwner: boolean }) {
  const start = useMutation(api.attempts.start)
  const [busy, setBusy] = useState(false)
  return (
    <div className="space-y-2 rounded-lg border border-destructive/40 bg-destructive/5 p-4">
      <p className="flex items-center gap-1.5 text-sm font-medium text-destructive">
        <XCircle className="h-4 w-4" /> The questions could not be prepared
      </p>
      <p className="text-sm">{a.error ?? "Something went wrong while preparing the questions."}</p>
      {isOwner && (
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5"
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            try {
              await start({ trainingId: a.trainingId, personId: a.personId })
            } catch (err) {
              toast.error(errorText(err))
            } finally {
              setBusy(false)
            }
          }}
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
          Try again
        </Button>
      )}
    </div>
  )
}

function Progress({ a }: { a: AttemptView }) {
  const pct = a.progress.total ? (a.progress.answered / a.progress.total) * 100 : 0
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[11px] text-muted-foreground">
        <span>
          {a.progress.answered} of {a.progress.total} answered
          {a.round && ` · stop ${Math.min(a.round.currentStop + 1, a.stops.length)} of ${a.stops.length}`}
        </span>
        <span>Pass mark {a.passMark}%</span>
      </div>
      <ProgressBar value={pct} />
    </div>
  )
}

function CourseRunner({ a, personId }: { a: AttemptView; personId: Id<"people"> }) {
  const firstOpen = a.questions.findIndex((q) => q.answerIndex === null)
  const [index, setIndex] = useState(firstOpen < 0 ? Math.max(0, a.questions.length - 1) : firstOpen)
  const q = a.questions[index]
  if (!q) return <Notice>This Attempt has no questions.</Notice>
  const last = index === a.questions.length - 1
  const answered = q.answerIndex !== null
  return (
    <div className="space-y-4">
      <Progress a={a} />
      <QuestionCard
        attemptId={a._id}
        personId={personId}
        question={q}
        number={index + 1}
        total={a.questions.length}
        canAnswer
        footer={
          <div className="flex items-center justify-between gap-2 border-t pt-3">
            <Button size="sm" variant="ghost" className="gap-1" disabled={index === 0} onClick={() => setIndex(index - 1)}>
              <ArrowLeft className="h-3.5 w-3.5" /> Previous
            </Button>
            {!last ? (
              <Button size="sm" className="gap-1" disabled={!answered} onClick={() => setIndex(index + 1)}>
                Next question <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            ) : (
              <FinishButton a={a} personId={personId} />
            )}
          </div>
        }
      />
      <p className="text-center text-[11px] text-muted-foreground">
        Answers are final once chosen. Each question shows its source after you answer.
      </p>
    </div>
  )
}

function FinishBar({ a, personId }: { a: AttemptView; personId: Id<"people"> }) {
  const ready = a.progress.answered === a.progress.total && a.stops.every((s) => s.done)
  if (!ready) return null
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3">
      <p className="text-sm">Every stop is done. See how you did.</p>
      <FinishButton a={a} personId={personId} />
    </div>
  )
}

function FinishButton({ a, personId }: { a: AttemptView; personId: Id<"people"> }) {
  const finish = useMutation(api.attempts.finish)
  const [busy, setBusy] = useState(false)
  const open = a.progress.total - a.progress.answered
  return (
    <Button
      size="sm"
      className="gap-1.5"
      disabled={busy || open > 0}
      title={open > 0 ? `${open} still open` : undefined}
      onClick={async () => {
        setBusy(true)
        try {
          await finish({ id: a._id, personId })
          window.scrollTo({ top: 0, behavior: "smooth" })
        } catch (err) {
          toast.error(errorText(err))
        } finally {
          setBusy(false)
        }
      }}
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Award className="h-3.5 w-3.5" />}
      See your result
    </Button>
  )
}

function Result({ a, isOwner }: { a: AttemptView; isOwner: boolean }) {
  const passed = a.status === "passed"
  const start = useMutation(api.attempts.start)
  const [, navigate] = useLocation()
  const [busy, setBusy] = useState(false)
  const canRetry = isOwner && !passed && a.training?.liveVersion != null && a.training.status !== "archived"
  return (
    <div
      className={cn(
        "space-y-3 rounded-lg border p-5 print:hidden",
        passed
          ? "border-emerald-300 bg-emerald-50/70 dark:border-emerald-500/40 dark:bg-emerald-500/10"
          : "border-red-300 bg-red-50/60 dark:border-red-500/40 dark:bg-red-500/10",
      )}
    >
      <div className="flex items-center gap-4">
        <span
          className={cn(
            "flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-lg font-bold tabular-nums text-white",
            passed ? "bg-emerald-500" : "bg-red-500",
          )}
        >
          {a.score ?? 0}%
        </span>
        <div className="min-w-0">
          <p className={cn("text-base font-semibold", passed ? "text-emerald-800 dark:text-emerald-200" : "text-red-800 dark:text-red-200")}>
            {passed ? "Passed" : "Not passed this time"}
          </p>
          <p className="text-sm text-muted-foreground">
            {a.progress.correct} of {a.progress.total} correct. The pass mark is {a.passMark}%.
            {a.round && ` ${a.round.wrongScans} wrong ${a.round.wrongScans === 1 ? "scan" : "scans"}.`}
          </p>
        </div>
      </div>
      {passed ? (
        <p className="flex items-start gap-1.5 text-sm">
          <ClipboardCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
          A Training record for {a.personName} was written on {fmtDate(a.finishedAt, true)}: {a.training?.code} v{a.trainingVersion}, with every question and answer below.
        </p>
      ) : (
        <p className="text-sm">
          This Attempt is kept as it is. Read the explanations below{canRetry ? ", then try again: you get new questions" : ""}.
        </p>
      )}
      {a.skillsRaised.length > 0 && (
        <div className="space-y-1">
          {a.skillsRaised.map((s) => (
            <p key={s.skillId} className="flex items-center gap-1.5 text-sm font-medium">
              <TrendingUp className="h-4 w-4 text-emerald-600" />
              {s.renewed ? `Skill renewed: ${s.name}, level ${s.toLevel}` : `Skill raised: ${s.name}, level ${s.fromLevel} to ${s.toLevel}`}
            </p>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button asChild size="sm" variant="outline" className="gap-1.5 bg-background">
          <Link href={`/learn/trainings/${a.trainingId}`}>
            <ArrowLeft className="h-3.5 w-3.5" /> Back to the Training
          </Link>
        </Button>
        {passed && (
          <Button asChild size="sm" variant="outline" className="gap-1.5 bg-background">
            <Link href={`/learn/people/${a.personId}`}>Skills of {a.personName.split(" ")[0]}</Link>
          </Button>
        )}
        {canRetry && (
          <Button
            size="sm"
            className="gap-1.5"
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              try {
                const id = await start({ trainingId: a.trainingId, personId: a.personId })
                navigate(`/learn/attempts/${id}`)
              } catch (err) {
                toast.error(errorText(err))
              } finally {
                setBusy(false)
              }
            }}
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
            Try again with new questions
          </Button>
        )}
      </div>
    </div>
  )
}
