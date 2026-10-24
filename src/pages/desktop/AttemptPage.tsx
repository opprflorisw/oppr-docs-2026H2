import { useState } from "react"
import { useMutation, useQuery } from "convex/react"
import { Link, useRoute } from "wouter"
import { toast } from "sonner"
import { ArrowLeft, ArrowRight, Award, CircleAlert, ClipboardCheck, Loader2, Printer, RotateCcw, XCircle } from "lucide-react"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import { TopBar } from "@/components/layout/TopBar"
import { PageHeader } from "@/components/layout/PageHeader"
import { Button } from "@/components/ui/button"
import { useCheckIn } from "@/lib/checkIn"
import { errorText, fmtDate, KindBadge, ProgressBar } from "@/components/learn/training/lib"
import { isAnswered, QuestionCard } from "@/components/learn/training/QuestionCard"
import { AttemptReview, type AttemptView } from "@/components/learn/training/AttemptReview"
import { AttemptIntro } from "@/components/learn/training/AttemptIntro"
import { PresentSteps } from "@/components/learn/training/PresentSteps"
import { AttemptResult } from "@/components/learn/training/AttemptResult"
import { RoundRunner } from "@/components/learn/training/RoundRunner"

// /learn/attempts/:id: doing (or reviewing) one Attempt. The same steps as
// on the phone: Prepare, Present (when the Training has a breakdown), Check,
// then the result with the next step and the full record.
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
          statusLine={
            <span className="flex flex-wrap items-center gap-1.5">
              <span className="font-mono">
                {a.training?.code} · v{a.trainingVersion}
              </span>
              {a.training && <KindBadge kind={a.training.kind} />}
              <span>· {a.personName}</span>
              <span>· started {fmtDate(a.startedAt)}</span>
            </span>
          }
          secondary={finished ? [{ label: "Print", icon: Printer, onClick: () => window.print() }] : undefined}
        />
      </div>
      <div className="mx-auto w-full max-w-3xl space-y-4 p-6 print:max-w-none print:p-0">
        {a.status === "generating" && <AttemptIntro a={a} generating />}
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
              <CourseFlow key={a._id} a={a} personId={person._id} />
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
            <div className="print:hidden">
              <AttemptResult a={a} personId={person?._id ?? null} />
            </div>
            <div className="flex items-baseline gap-2 pt-2 print:hidden">
              <h2 className="text-sm font-semibold">The Training record</h2>
              <span className="text-xs text-muted-foreground">What an auditor or labour inspector sees.</span>
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
  const answered = a.questions.filter(isAnswered).length
  const pct = a.progress.total ? (answered / a.progress.total) * 100 : 0
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>
          {answered} of {a.progress.total} answered
          {a.round && ` · stop ${Math.min(a.round.currentStop + 1, a.stops.length)} of ${a.stops.length}`}
        </span>
      </div>
      <ProgressBar value={pct} />
    </div>
  )
}

/** Prepare, Present (when there is a breakdown), then the questions. */
function CourseFlow({ a, personId }: { a: AttemptView; personId: Id<"people"> }) {
  const markPresentSeen = useMutation(api.attempts.markPresentSeen)
  const started = a.questions.some(isAnswered)
  const hasSteps = a.breakdown.length > 0
  const [stage, setStage] = useState<"intro" | "present" | "questions">(started ? "questions" : "intro")
  const [marking, setMarking] = useState(false)

  async function presentDone() {
    setMarking(true)
    try {
      await markPresentSeen({ id: a._id, personId })
    } catch {
      // Not recorded; the steps were still shown.
    } finally {
      setMarking(false)
      setStage("questions")
    }
  }

  if (stage === "intro") {
    return (
      <div className="space-y-3">
        <AttemptIntro a={a} generating={false} />
        <Button
          className="gap-1.5"
          onClick={() => setStage(hasSteps && a.presentSeenAt == null ? "present" : "questions")}
        >
          {hasSteps && a.presentSeenAt == null ? "Show me the steps" : "Start the questions"}
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    )
  }
  if (stage === "present") {
    return (
      <PresentSteps
        steps={a.breakdown}
        retry={a.attemptNumber > 1 || a.earlierFails > 0}
        busy={marking}
        onDone={() => void presentDone()}
        onSkip={() => void presentDone()}
      />
    )
  }
  return <CourseRunner a={a} personId={personId} />
}

function CourseRunner({ a, personId }: { a: AttemptView; personId: Id<"people"> }) {
  const firstOpen = a.questions.findIndex((q) => !isAnswered(q))
  const [index, setIndex] = useState(firstOpen < 0 ? Math.max(0, a.questions.length - 1) : firstOpen)
  const q = a.questions[index]
  if (!q) return <Notice>This Attempt has no questions.</Notice>
  const last = index === a.questions.length - 1
  const answered = isAnswered(q)
  return (
    <div className="space-y-4">
      <Progress a={a} />
      <QuestionCard
        key={q.id}
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
    </div>
  )
}

function FinishBar({ a, personId }: { a: AttemptView; personId: Id<"people"> }) {
  const ready = a.questions.every(isAnswered) && a.stops.every((s) => s.done)
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
  const open = a.questions.filter((q) => !isAnswered(q)).length
  return (
    <div className="flex items-center gap-2">
      {open > 0 && <span className="text-xs text-muted-foreground">{open} still open</span>}
      <Button
        size="sm"
        className="gap-1.5"
        disabled={busy || open > 0}
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
    </div>
  )
}
