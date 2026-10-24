// A Training on the phone: /m/attempt/:attemptId. Prepare (what, how long,
// the pass rule), Present (the job breakdown, when the Training has one),
// then Check: one question at a time with a sticky action bar, and the
// result with the next step. Everything stays in the phone, including the
// review of every answer. Rounds have their own screen at /m/round/:id.

import { useEffect, useRef, useState } from "react"
import { Redirect, useLocation, useRoute } from "wouter"
import { useMutation, useQuery } from "convex/react"
import { toast } from "sonner"
import { AlertTriangle, ArrowLeft, ArrowRight, Award, Check, Loader2, RotateCcw, UserRound, XCircle } from "lucide-react"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useMobileShell } from "@/components/mobile/MobileShell"
import { looksLikeConvexId } from "@/components/mobile/use-mobile-prefs"
import { BottomSheet, ProofHeader, SheetButton, StickyBar } from "@/components/mobile/round/ProofChrome"
import { isAnswered, QuestionCard, useAnswerDraft } from "@/components/learn/training/QuestionCard"
import type { AttemptView } from "@/components/learn/training/AttemptReview"
import { AttemptIntro } from "@/components/learn/training/AttemptIntro"
import { PresentSteps } from "@/components/learn/training/PresentSteps"
import { AttemptResult, EveryAnswer } from "@/components/learn/training/AttemptResult"
import { errorText, ext, ProgressBar } from "@/components/learn/training/lib"
import { useCheckIn } from "@/lib/checkIn"

export function MobileAttemptPage() {
  const [, params] = useRoute<{ attemptId: string }>("/m/attempt/:attemptId")
  const [, navigate] = useLocation()
  const id = params?.attemptId ?? ""
  const valid = looksLikeConvexId(id)
  const a = useQuery(api.attempts.get, valid ? { id: id as Id<"trainingAttempts"> } : "skip")
  const { person } = useCheckIn()
  const [leaving, setLeaving] = useState(false)
  const [subtitle, setSubtitle] = useState<string | null>(null)

  if (a && a.training?.kind === "round") return <Redirect to={`/m/round/${a._id}`} replace />

  const title = a?.training?.title ?? "Training"
  const working = !!a && person?._id === a.personId && (a.status === "in_progress" || a.status === "generating")

  let body: React.ReactNode
  if (!valid || a === null) {
    body = (
      <Centered icon={<AlertTriangle className="h-6 w-6" />} title="This Training is not available">
        It may have been removed. Start a Training from Home.
      </Centered>
    )
  } else if (a === undefined) {
    body = (
      <div className="space-y-3 p-3">
        <Skeleton className="h-6 w-full rounded-lg" />
        <Skeleton className="h-72 w-full rounded-xl" />
      </div>
    )
  } else if (!person || person._id !== a.personId) {
    body = <NotYours a={a} checkedIn={!!person} />
  } else if (a.status === "passed" || a.status === "failed") {
    body = <AttemptResult a={a} personId={person._id} review={<EveryAnswer a={a} personId={person._id} />} />
  } else if (a.status === "error") {
    body = <GenerationError a={a} personId={person._id} />
  } else if (a.status === "abandoned") {
    body = (
      <Centered icon={<XCircle className="h-6 w-6" />} title="This Attempt was stopped">
        It was stopped before it was finished, so it has no score. Start the Training again from Home.
      </Centered>
    )
  } else {
    body = <Doing a={a} personId={person._id} onStage={setSubtitle} />
  }

  return (
    <div className="flex min-h-full flex-col">
      <ProofHeader
        title={title}
        subtitle={working && subtitle ? subtitle : a?.training ? `${a.training.code} · v${a.trainingVersion}` : undefined}
        onClose={() => (working ? setLeaving(true) : navigate("/m"))}
      />
      {body}
      <BottomSheet open={leaving} onClose={() => setLeaving(false)} label="Leave the Training?" title="Leave the Training?">
        <p className="pb-4 text-base text-muted-foreground">Your answers are kept. Continue later from Home.</p>
        <div className="space-y-2">
          <SheetButton tone="primary" onClick={() => setLeaving(false)}>
            Keep going
          </SheetButton>
          <SheetButton onClick={() => navigate("/m")}>Leave</SheetButton>
        </div>
      </BottomSheet>
    </div>
  )
}

// ---- Prepare, Present, Check ------------------------------------------------------

type Stage = "intro" | "present" | "questions"

function Doing({ a, personId, onStage }: { a: AttemptView; personId: Id<"people">; onStage: (s: string | null) => void }) {
  const x = ext(a)
  const markPresentSeen = useMutation(api.attempts.markPresentSeen)
  const anyAnswered = a.questions.some(isAnswered)
  const hasSteps = (x.breakdown?.length ?? 0) > 0
  const retry = (x.attemptNumber ?? 1) > 1 || (x.earlierFails ?? 0) > 0
  const [stage, setStage] = useState<Stage>(() => (anyAnswered ? "questions" : "intro"))
  const [marking, setMarking] = useState(false)

  useEffect(() => {
    if (stage !== "questions") onStage(stage === "intro" ? "Before you start" : "How the job is done")
  }, [stage, onStage])
  useEffect(() => () => onStage(null), [onStage])

  function afterIntro() {
    setStage(hasSteps && x.presentSeenAt == null ? "present" : "questions")
  }
  async function presentDone() {
    setMarking(true)
    try {
      await markPresentSeen({ id: a._id, personId })
    } catch {
      // Not recorded: the steps were still shown. Go on.
    } finally {
      setMarking(false)
      setStage("questions")
    }
  }

  if (a.status === "generating" || stage === "intro") {
    const generating = a.status === "generating"
    return (
      <div className="flex flex-1 flex-col">
        <div className="p-3">
          <AttemptIntro a={a} generating={generating} />
        </div>
        <StickyBar>
          <Button className="h-12 flex-1 gap-1.5 rounded-xl text-base" disabled={generating} onClick={afterIntro} data-start>
            {generating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Preparing your questions
              </>
            ) : (
              <>
                {hasSteps && x.presentSeenAt == null ? "Show me the steps" : "Start the questions"}
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </Button>
        </StickyBar>
      </div>
    )
  }
  if (stage === "present" && x.breakdown) {
    return (
      <div className="flex flex-1 flex-col">
        <PresentSteps
          steps={x.breakdown}
          retry={retry}
          busy={marking}
          onDone={() => void presentDone()}
          onSkip={() => void presentDone()}
        />
      </div>
    )
  }
  return <Questions a={a} personId={personId} onStage={onStage} />
}

function Questions({ a, personId, onStage }: { a: AttemptView; personId: Id<"people">; onStage: (s: string | null) => void }) {
  const firstOpen = a.questions.findIndex((q) => !isAnswered(q))
  const [index, setIndex] = useState(firstOpen < 0 ? Math.max(0, a.questions.length - 1) : firstOpen)
  const topRef = useRef<HTMLDivElement>(null)
  const feedbackRef = useRef<HTMLDivElement>(null)
  const q = a.questions[index] ?? null
  const draft = useAnswerDraft(a._id, personId, q)
  const answered = q ? isAnswered(q) : false

  useEffect(() => {
    onStage(`Question ${index + 1} of ${a.questions.length}`)
  }, [index, a.questions.length, onStage])
  useScrollTopOn(topRef, index)
  // Once the answer is checked, scroll so the feedback starts right under
  // the (sticky) question text, which stays readable above it.
  const wasAnswered = useRef(answered)
  useEffect(() => {
    if (answered && !wasAnswered.current) {
      requestAnimationFrame(() => scrollFeedbackIntoView(topRef.current, feedbackRef.current))
    }
    wasAnswered.current = answered
  }, [answered])

  if (!q) {
    return (
      <Centered icon={<AlertTriangle className="h-6 w-6" />} title="No questions">
        This Attempt has no questions.
      </Centered>
    )
  }
  const last = index === a.questions.length - 1
  const pct = a.progress.total ? (a.questions.filter(isAnswered).length / a.progress.total) * 100 : 0

  return (
    <div ref={topRef} className="flex flex-1 flex-col">
      <div className="space-y-3 p-3">
        <ProgressBar value={pct} />
        <QuestionCard
          attemptId={a._id}
          personId={personId}
          question={q}
          number={index + 1}
          total={a.questions.length}
          canAnswer
          draft={draft}
          hideCheck
          stickyPrompt
          feedbackRef={feedbackRef}
        />
      </div>
      <StickyBar>
        {/* Back only before the answer is checked: after that it is final. */}
        {!answered && index > 0 && (
          <Button
            variant="outline"
            className="h-12 w-12 shrink-0 rounded-xl"
            onClick={() => setIndex(index - 1)}
            aria-label="Previous question"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
        )}
        {!answered ? (
          <Button
            className="h-12 flex-1 gap-1.5 rounded-xl text-base"
            disabled={!draft.canCheck}
            onClick={() => void draft.check()}
            data-check-answer
          >
            {draft.checking ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />}
            Check answer
          </Button>
        ) : !last ? (
          <Button className="h-12 flex-1 gap-1.5 rounded-xl text-base" onClick={() => setIndex(index + 1)} data-next>
            Next question <ArrowRight className="h-5 w-5" />
          </Button>
        ) : (
          <FinishButton a={a} personId={personId} onGoTo={setIndex} />
        )}
      </StickyBar>
    </div>
  )
}

function FinishButton({ a, personId, onGoTo }: { a: AttemptView; personId: Id<"people">; onGoTo: (i: number) => void }) {
  const finish = useMutation(api.attempts.finish)
  const [busy, setBusy] = useState(false)
  const firstOpen = a.questions.findIndex((q) => !isAnswered(q))
  if (firstOpen >= 0) {
    return (
      <Button className="h-12 flex-1 gap-1.5 rounded-xl text-base" onClick={() => onGoTo(firstOpen)} data-next>
        Go to question {firstOpen + 1} <ArrowRight className="h-5 w-5" />
      </Button>
    )
  }
  return (
    <Button
      className="h-12 flex-1 gap-1.5 rounded-xl text-base"
      disabled={busy}
      data-next
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
      {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Award className="h-5 w-5" />}
      See your result
    </Button>
  )
}

// ---- Errors -------------------------------------------------------------------------

function GenerationError({ a, personId }: { a: AttemptView; personId: Id<"people"> }) {
  const start = useMutation(api.attempts.start)
  const [, navigate] = useLocation()
  const [busy, setBusy] = useState(false)
  return (
    <div className="flex flex-1 flex-col">
      <Centered icon={<XCircle className="h-6 w-6" />} title="The questions could not be prepared">
        {a.error ?? "Something went wrong while preparing the questions."}
      </Centered>
      <StickyBar>
        <Button
          className="h-12 flex-1 gap-1.5 rounded-xl text-base"
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
          {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <RotateCcw className="h-5 w-5" />}
          Try again
        </Button>
      </StickyBar>
    </div>
  )
}

// ---- Small parts ------------------------------------------------------------------

/** The app's own scroller (never the page around the phone preview). */
function scrollerOf(node: HTMLElement | null): HTMLElement | null {
  let el = node?.parentElement ?? null
  while (el && !/(auto|scroll)/.test(getComputedStyle(el).overflowY)) el = el.parentElement
  return el
}

/** Scroll so the feedback starts just under the sticky header and question text. */
function scrollFeedbackIntoView(top: HTMLElement | null, feedback: HTMLElement | null) {
  const scroller = scrollerOf(top)
  if (!scroller || !feedback) return
  const header = scroller.querySelector("header")
  const prompt = top?.querySelector<HTMLElement>("[data-question-prompt]")
  const covered = (header?.getBoundingClientRect().height ?? 0) + (prompt?.getBoundingClientRect().height ?? 0) + 8
  const delta = feedback.getBoundingClientRect().top - scroller.getBoundingClientRect().top - covered
  if (delta > 0) scroller.scrollBy({ top: delta, behavior: "smooth" })
}

/** Scroll the app's own scroller (never the page around the phone preview) to the top. */
function useScrollTopOn(ref: React.RefObject<HTMLDivElement | null>, key: unknown) {
  useEffect(() => {
    const el = scrollerOf(ref.current)
    if (el) el.scrollTop = 0
  }, [ref, key])
}

function NotYours({ a, checkedIn }: { a: AttemptView; checkedIn: boolean }) {
  const { openCheckIn } = useMobileShell()
  return (
    <Centered icon={<UserRound className="h-6 w-6" />} title={`This is ${a.personName}'s Training`}>
      {checkedIn
        ? `A Training is proof for one person. Check in as ${a.personName} to continue it.`
        : `A Training is proof, so it needs to know who you are. Check in as ${a.personName} to continue.`}
      <Button className="mt-3 h-12 gap-1.5 rounded-xl px-6 text-base" onClick={openCheckIn}>
        <UserRound className="h-5 w-5" />
        Check in
      </Button>
    </Centered>
  )
}

function Centered({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-300">
        {icon}
      </div>
      <p className="text-base font-semibold">{title}</p>
      <div className="flex flex-col items-center gap-1 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </div>
  )
}
