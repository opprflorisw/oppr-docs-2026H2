// A Training (questions at a screen) on the phone: /m/attempt/:attemptId.
// The same Attempt as /learn/attempts/:id, in the mobile shell: one question
// at a time with its source passage after answering, then the result. Rounds
// have their own phone screen at /m/round/:attemptId.

import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { Redirect, useLocation, useRoute } from "wouter"
import { useMutation, useQuery } from "convex/react"
import { toast } from "sonner"
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Award,
  CheckCircle2,
  ClipboardCheck,
  Home,
  Loader2,
  RotateCcw,
  Sparkles,
  TrendingUp,
  UserRound,
  XCircle,
} from "lucide-react"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { MobileHeader } from "@/components/mobile/MobileHeader"
import { useMobileShell } from "@/components/mobile/MobileShell"
import { looksLikeConvexId } from "@/components/mobile/use-mobile-prefs"
import { QuestionCard } from "@/components/learn/training/QuestionCard"
import type { AttemptView } from "@/components/learn/training/AttemptReview"
import { errorText, fmtDate, ProgressBar } from "@/components/learn/training/lib"
import { useCheckIn } from "@/lib/checkIn"
import { cn } from "@/lib/utils"

export function MobileAttemptPage() {
  const [, params] = useRoute<{ attemptId: string }>("/m/attempt/:attemptId")
  const id = params?.attemptId ?? ""
  const valid = looksLikeConvexId(id)
  const a = useQuery(api.attempts.get, valid ? { id: id as Id<"trainingAttempts"> } : "skip")
  const { person } = useCheckIn()

  if (a && a.training?.kind === "round") return <Redirect to={`/m/round/${a._id}`} replace />

  const title = a?.training?.title ?? "Training"
  const subtitle = a?.training ? `${a.training.code} · v${a.trainingVersion}` : undefined

  let body: React.ReactNode
  if (!valid || a === null) {
    body = (
      <Centered icon={<AlertTriangle className="h-6 w-6" />} tone="warn" title="This Training is not available">
        It may have been removed. Start a Training from Home.
        <HomeButton />
      </Centered>
    )
  } else if (a === undefined) {
    body = (
      <div className="space-y-3 p-3">
        <Skeleton className="h-6 w-full rounded-lg" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    )
  } else if (!person || person._id !== a.personId) {
    body = <NotYours a={a} checkedIn={!!person} />
  } else if (a.status === "passed" || a.status === "failed") {
    body = <AttemptResult a={a} personId={person._id} />
  } else if (a.status === "generating") {
    body = <Generating startedAt={a.startedAt} />
  } else if (a.status === "error") {
    body = <GenerationError a={a} personId={person._id} />
  } else if (a.status === "abandoned") {
    body = (
      <Centered icon={<XCircle className="h-6 w-6" />} tone="warn" title="This Attempt was stopped">
        It was stopped before it was finished, so it has no score.
        <HomeButton />
      </Centered>
    )
  } else {
    body = <InProgress a={a} personId={person._id} />
  }

  return (
    <div className="flex min-h-full flex-col">
      <MobileHeader backTo="/m" title={title} subtitle={subtitle} />
      {body}
    </div>
  )
}

// ---- In progress ------------------------------------------------------------------

function InProgress({ a, personId }: { a: AttemptView; personId: Id<"people"> }) {
  const firstOpen = a.questions.findIndex((q) => q.answerIndex === null)
  const [index, setIndex] = useState(firstOpen < 0 ? Math.max(0, a.questions.length - 1) : firstOpen)
  const topRef = useRef<HTMLDivElement>(null)
  useScrollTopOn(topRef, index)

  const q = a.questions[index]
  if (!q) {
    return (
      <Centered icon={<AlertTriangle className="h-6 w-6" />} tone="warn" title="No questions">
        This Attempt has no questions.
        <HomeButton />
      </Centered>
    )
  }
  const last = index === a.questions.length - 1
  const answered = q.answerIndex !== null
  const pct = a.progress.total ? (a.progress.answered / a.progress.total) * 100 : 0

  return (
    <div ref={topRef} className="flex flex-col gap-3 p-3 pb-6">
      <div className="space-y-1">
        <div className="flex justify-between text-[11px] text-muted-foreground">
          <span>
            {a.progress.answered} of {a.progress.total} answered
          </span>
          <span>Pass mark {a.passMark}%</span>
        </div>
        <ProgressBar value={pct} />
      </div>
      <QuestionCard
        attemptId={a._id}
        personId={personId}
        question={q}
        number={index + 1}
        total={a.questions.length}
        canAnswer
      />
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          className="h-11 gap-1 rounded-xl"
          disabled={index === 0}
          onClick={() => setIndex(index - 1)}
          aria-label="Previous question"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        {!last ? (
          <Button className="h-11 flex-1 gap-1.5 rounded-xl" disabled={!answered} onClick={() => setIndex(index + 1)}>
            Next question <ArrowRight className="h-4 w-4" />
          </Button>
        ) : (
          <FinishButton a={a} personId={personId} />
        )}
      </div>
      <p className="text-center text-[11px] text-muted-foreground">
        Answers are final once chosen. Each question shows its source after you answer.
      </p>
    </div>
  )
}

function FinishButton({ a, personId }: { a: AttemptView; personId: Id<"people"> }) {
  const finish = useMutation(api.attempts.finish)
  const [busy, setBusy] = useState(false)
  const open = a.progress.total - a.progress.answered
  return (
    <Button
      className="h-11 flex-1 gap-1.5 rounded-xl"
      disabled={busy || open > 0}
      onClick={async () => {
        setBusy(true)
        try {
          await finish({ id: a._id, personId })
        } catch (err) {
          toast.error(errorText(err))
        } finally {
          setBusy(false)
        }
      }}
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Award className="h-4 w-4" />}
      {open > 0 ? `${open} still open` : "See your result"}
    </Button>
  )
}

// ---- Result -----------------------------------------------------------------------

function AttemptResult({ a, personId }: { a: AttemptView; personId: Id<"people"> }) {
  const [, navigate] = useLocation()
  const start = useMutation(api.attempts.start)
  const [starting, setStarting] = useState(false)
  const topRef = useRef<HTMLDivElement>(null)
  useScrollTopOn(topRef, a.status)
  const passed = a.status === "passed"
  const canRetry = !passed && a.training?.liveVersion != null && a.training.status !== "archived"

  async function again() {
    setStarting(true)
    try {
      const next = await start({ trainingId: a.trainingId, personId })
      navigate(`/m/attempt/${next}`)
    } catch (err) {
      toast.error(errorText(err))
    } finally {
      setStarting(false)
    }
  }

  return (
    <div ref={topRef} className="flex flex-col gap-3 p-3 pb-6">
      <div
        className={cn(
          "flex flex-col items-center gap-2 rounded-2xl border p-5 text-center",
          passed
            ? "border-emerald-300 bg-emerald-50 dark:border-emerald-500/40 dark:bg-emerald-500/10"
            : "border-red-300 bg-red-50 dark:border-red-500/40 dark:bg-red-500/10",
        )}
      >
        <span
          className={cn(
            "flex h-20 w-20 items-center justify-center rounded-full text-white shadow-sm",
            passed ? "bg-emerald-500" : "bg-red-500",
          )}
        >
          <span className="text-2xl font-bold tabular-nums leading-none">{a.score ?? 0}%</span>
        </span>
        <p className="text-base font-semibold">{passed ? "Training passed" : "Not passed this time"}</p>
        <p className="text-[12px] text-muted-foreground">
          {a.progress.correct} of {a.progress.total} correct · pass mark {a.passMark}%
        </p>
      </div>

      {passed ? (
        <div className="space-y-2 rounded-2xl border bg-card p-3">
          <p className="flex items-center gap-1.5 text-[13px] font-semibold">
            <ClipboardCheck className="h-4 w-4 text-emerald-600" />
            Training record written
          </p>
          <p className="text-[11px] leading-snug text-muted-foreground">
            Proof that {a.personName} passed {a.training?.code} v{a.trainingVersion} on {fmtDate(a.finishedAt, true)}, with
            every question and answer below.
          </p>
          {a.skillsRaised.length > 0 && (
            <ul className="space-y-1">
              {a.skillsRaised.map((s) => (
                <li key={s.skillId} className="flex items-center gap-1.5 text-[12px]">
                  <TrendingUp className="h-3.5 w-3.5 text-emerald-600" />
                  {s.renewed ? "Skill renewed" : "Skill raised"}: <span className="font-medium">{s.name}</span>
                  {!s.renewed && <span className="text-muted-foreground">(level {s.toLevel})</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div className="space-y-2 rounded-2xl border bg-card p-3">
          <p className="text-[12px] leading-snug text-muted-foreground">
            The Attempt is kept as it is. Read the explanations below
            {canRetry ? ", then try again: a new Attempt gets new questions on the same things." : "."}
          </p>
          {canRetry && (
            <Button className="h-11 w-full gap-1.5 rounded-xl" disabled={starting} onClick={() => void again()}>
              {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
              Try again with new questions
            </Button>
          )}
        </div>
      )}

      <Button variant="outline" className="h-11 gap-1.5 rounded-xl" onClick={() => navigate("/m")}>
        <Home className="h-4 w-4" />
        Back to Home
      </Button>

      <div className="flex items-center gap-1.5 px-0.5 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        <CheckCircle2 className="h-3 w-3" />
        Every question and answer
      </div>
      {a.questions.map((q, i) => (
        <QuestionCard
          key={q.id}
          attemptId={a._id}
          personId={personId}
          question={q}
          number={i + 1}
          total={a.questions.length}
          canAnswer={false}
        />
      ))}
    </div>
  )
}

// ---- Preparing, errors --------------------------------------------------------------

function Generating({ startedAt }: { startedAt: number }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  const secs = Math.max(0, Math.floor((now - startedAt) / 1000))
  return (
    <Centered
      icon={
        <span className="relative flex items-center justify-center">
          <Sparkles className="h-5 w-5" />
          <Loader2 className="absolute h-10 w-10 animate-spin opacity-40" />
        </span>
      }
      tone="primary"
      title="Preparing your questions"
    >
      They are written fresh for you from the Published documents, and each is checked against the passage it cites.
      <span className="tabular-nums">{secs}s · usually under a minute</span>
    </Centered>
  )
}

function GenerationError({ a, personId }: { a: AttemptView; personId: Id<"people"> }) {
  const start = useMutation(api.attempts.start)
  const [, navigate] = useLocation()
  const [busy, setBusy] = useState(false)
  return (
    <Centered icon={<XCircle className="h-6 w-6" />} tone="warn" title="The questions could not be prepared">
      {a.error ?? "Something went wrong while preparing the questions."}
      <Button
        className="mt-2 h-10 gap-1.5 rounded-xl"
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          try {
            const next = await start({ trainingId: a.trainingId, personId })
            if (next !== a._id) navigate(`/m/attempt/${next}`)
          } catch (err) {
            toast.error(errorText(err))
          } finally {
            setBusy(false)
          }
        }}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
        Try again
      </Button>
    </Centered>
  )
}

// ---- Small parts ------------------------------------------------------------------

/** Scroll the app's own scroller (never the page around the Floor simulator's phone) to the top. */
function useScrollTopOn(ref: React.RefObject<HTMLDivElement | null>, key: unknown) {
  useLayoutEffect(() => {
    let el = ref.current?.parentElement ?? null
    while (el && !/(auto|scroll)/.test(getComputedStyle(el).overflowY)) el = el.parentElement
    if (el) el.scrollTop = 0
  }, [ref, key])
}

function NotYours({ a, checkedIn }: { a: AttemptView; checkedIn: boolean }) {
  const { openCheckIn } = useMobileShell()
  return (
    <Centered icon={<UserRound className="h-6 w-6" />} tone="primary" title={`This is ${a.personName}'s Training`}>
      {checkedIn
        ? `A Training is proof for one person. Check in as ${a.personName} to continue it.`
        : `A Training is proof, so it needs to know who you are. Check in as ${a.personName} to continue.`}
      <Button className="mt-2 h-10 gap-1.5 rounded-xl" onClick={openCheckIn}>
        <UserRound className="h-4 w-4" />
        Check in
      </Button>
    </Centered>
  )
}

function Centered({
  icon,
  tone,
  title,
  children,
}: {
  icon: React.ReactNode
  tone: "warn" | "primary"
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
      <div
        className={cn(
          "flex h-12 w-12 items-center justify-center rounded-full",
          tone === "warn" ? "bg-amber-500/10 text-amber-700 dark:text-amber-300" : "bg-primary/10 text-primary",
        )}
      >
        {icon}
      </div>
      <p className="text-sm font-semibold">{title}</p>
      <div className="flex flex-col items-center gap-1 text-[12px] leading-relaxed text-muted-foreground">{children}</div>
    </div>
  )
}

function HomeButton() {
  const [, navigate] = useLocation()
  return (
    <Button size="sm" className="mt-2 gap-1.5" onClick={() => navigate("/m")}>
      <Home className="h-3.5 w-3.5" />
      Back to Home
    </Button>
  )
}
