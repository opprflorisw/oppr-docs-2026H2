import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react"
import { useQuery } from "convex/react"
import { Router } from "wouter"
import { memoryLocation } from "wouter/memory-location"
import { ArrowLeft, ArrowRight, Clock, ListChecks, RotateCcw, ShieldAlert } from "lucide-react"
import { api } from "../../../../convex/_generated/api"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { QuestionCard, type AttemptQuestion } from "./QuestionCard"
import { PresentSteps } from "./PresentSteps"
import { passRuleText, questionCount, type DraftQuestion, type TrainingDraft } from "./builderModel"

type Screen = { at: "prepare" } | { at: "steps" } | { at: "question"; index: number } | { at: "done" }

/**
 * Preview as trainee: the Operator's flow on the phone (Prepare, the steps,
 * then each question) with the real mobile components inside a phone frame.
 * Nothing is recorded: QuestionCard runs in preview mode and answers locally.
 */
export function TrainingPreview({
  draft,
  docInfo,
  onGoToQuestions,
}: {
  draft: TrainingDraft
  docInfo: Map<string, { namingCode: string; version: number }>
  onGoToQuestions: () => void
}) {
  const [screen, setScreen] = useState<Screen>({ at: "prepare" })
  const [done, setDone] = useState<Set<string>>(new Set())
  // The phone components read the location to choose their floor styling.
  const location = useMemo(() => memoryLocation({ path: "/m/preview" }), [])
  const imageIds = draft.questionBank.flatMap((q) => (q.imageId ? [q.imageId] : []))
  const imageUrls = useQuery(api.images.urlsFor, imageIds.length > 0 ? { ids: imageIds } : "skip")
  const bank = draft.questionBank
  const total = questionCount(draft)
  const critical = draft.objectives.filter((o) => o.critical).length
  const minutes = Math.max(3, Math.round(total * 0.8 + draft.breakdown.length * 0.5))

  // The phone screen is shown at real size (390 px wide, 16 px text). Its
  // height fits the builder panel; the screen scrolls like a phone does.
  const boxRef = useRef<HTMLDivElement>(null)
  const [screenH, setScreenH] = useState(640)
  useLayoutEffect(() => {
    const el = boxRef.current
    if (!el) return
    let scroller: HTMLElement | null = el.parentElement
    while (scroller && !/(auto|scroll)/.test(getComputedStyle(scroller).overflowY)) scroller = scroller.parentElement
    const fit = () => {
      const avail = (scroller?.clientHeight ?? window.innerHeight) - 48
      setScreenH(Math.max(480, Math.min(844, avail - 2 * 10)))
    }
    fit()
    const ro = new ResizeObserver(fit)
    if (scroller) ro.observe(scroller)
    return () => ro.disconnect()
  }, [])

  const reset = () => {
    setDone(new Set())
    setScreen({ at: "prepare" })
  }

  /** The question as attempts.get would return it, unanswered; the card hides the answer until checked. */
  function toAttemptQuestion(q: DraftQuestion): AttemptQuestion | null {
    const objective = draft.objectives.find((o) => o.id === q.objectiveId)
    if (!objective) return null
    const doc = docInfo.get(String(objective.documentId))
    return {
      id: q.id,
      objectiveId: q.objectiveId,
      objectiveText: objective.text,
      stopIndex: null,
      prompt: q.prompt || "(No question text yet)",
      options: q.kind === "choice" ? q.options : [],
      answerIndex: null,
      answeredAt: null,
      flag: null,
      correctIndex: q.kind === "choice" ? q.correctIndex : null,
      correct: null,
      explanation: q.explanation || null,
      citation: {
        documentId: objective.documentId,
        namingCode: doc?.namingCode ?? "Source",
        version: doc?.version ?? 1,
        chunkId: objective.chunkId ?? null,
        quote: objective.quote ?? null,
      },
      locked: false,
      kind: q.kind,
      keyPoints: q.keyPoints ?? [],
      imageUrl: q.imageId ? imageUrls?.[q.imageId] ?? null : null,
      answerByPhoto: q.answerByPhoto ?? false,
      whyWrong: q.whyWrong ?? null,
      critical: objective.critical ?? false,
    }
  }

  const steps = draft.breakdown.map((r) => ({
    id: r.id,
    step: r.step,
    keyPoints: r.keyPoints,
    keyPointKinds: r.keyPointKinds,
    reasons: r.reasons,
    objectiveIds: r.objectiveIds,
    citation: r.citation ?? null,
  }))

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_410px]">
      <div className="space-y-4">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold">Preview as trainee</h3>
          <p className="text-sm text-muted-foreground">
            Exactly what an Operator sees on the phone, with the real phone screens. Tap through it: nothing is
            recorded, and open answers get a rough preview grade instead of the AI grade.
          </p>
        </div>
        <ol className="space-y-1.5">
          <JumpRow
            label="Prepare"
            detail={
              bank.length > 0
                ? `${total} questions per Attempt, drawn from a bank of ${bank.length}; about ${minutes} minutes`
                : `${total} questions, about ${minutes} minutes`
            }
            active={screen.at === "prepare"}
            onClick={() => setScreen({ at: "prepare" })}
          />
          {steps.length > 0 && (
            <JumpRow label="The steps" detail={`${steps.length} important steps`} active={screen.at === "steps"} onClick={() => setScreen({ at: "steps" })} />
          )}
          {bank.length > total && (
            <li className="px-1 pt-2 text-xs font-medium text-muted-foreground">
              The whole bank ({bank.length}). Each Attempt shows {total} of these.
            </li>
          )}
          {bank.map((q, i) => (
            <JumpRow
              key={q.id}
              label={`Question ${i + 1}`}
              detail={q.prompt || "(no text yet)"}
              active={screen.at === "question" && screen.index === i}
              done={done.has(q.id)}
              onClick={() => setScreen({ at: "question", index: i })}
            />
          ))}
        </ol>
        {bank.length === 0 && (
          <div className="space-y-2 rounded-md border border-dashed p-4 text-sm">
            <p className="font-medium">No question bank yet</p>
            <p className="text-muted-foreground">
              Without a bank, every Attempt writes {total} fresh multiple-choice questions from the passages, so there is
              nothing fixed to preview. Write questions to control what is asked.
            </p>
            <Button size="sm" variant="outline" onClick={onGoToQuestions}>
              Go to Questions
            </Button>
          </div>
        )}
        <Button size="sm" variant="ghost" className="gap-1.5" onClick={reset}>
          <RotateCcw className="h-4 w-4" /> Start the preview again
        </Button>
      </div>

      {/* Real size: a 390 px wide phone screen in a thin bezel. */}
      <div ref={boxRef} className="mx-auto lg:sticky lg:top-0" data-preview-phone>
        <div className="rounded-[44px] bg-neutral-900 p-[10px] shadow-xl ring-1 ring-black/40">
          <div
            className="relative overflow-hidden rounded-[34px] bg-background"
            style={{ width: 390, height: screenH, transform: "translateZ(0)", "--sat": "0px", "--sab": "0px" } as CSSProperties}
          >
          <Router hook={location.hook}>
            <div className="flex h-full flex-col bg-background">
              <div className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
                <span className="truncate text-[16px] font-semibold">{draft.title || "New Training"}</span>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-4 text-[16px]">
                {screen.at === "prepare" && (
                  <div className="space-y-4">
                    <div className="space-y-2 rounded-xl border bg-card p-4">
                      <p className="text-[13px] font-medium text-muted-foreground">Before you start</p>
                      <p className="text-[18px] font-semibold leading-snug">{draft.title || "New Training"}</p>
                      {draft.purpose && <p className="text-[15px] text-muted-foreground">{draft.purpose}</p>}
                      <p className="flex items-center gap-2 text-[15px]">
                        <ListChecks className="h-4 w-4 text-primary" /> {total} {total === 1 ? "question" : "questions"}
                      </p>
                      <p className="flex items-center gap-2 text-[15px]">
                        <Clock className="h-4 w-4 text-primary" /> About {minutes} minutes
                      </p>
                      <p className="flex items-start gap-2 text-[15px]">
                        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                        To pass: {passRuleText(total, draft.passMark, critical).replace(/^./, (c) => c.toLowerCase())}
                      </p>
                      <p className="text-[14px] text-muted-foreground">You choose, then press Check answer. Then it is final.</p>
                    </div>
                  </div>
                )}
                {screen.at === "steps" && steps.length > 0 && (
                  <PresentSteps
                    steps={steps}
                    retry={false}
                    onDone={() => setScreen(bank.length > 0 ? { at: "question", index: 0 } : { at: "done" })}
                    onSkip={() => setScreen(bank.length > 0 ? { at: "question", index: 0 } : { at: "done" })}
                  />
                )}
                {screen.at === "question" && bank[screen.index] && (() => {
                  const q = bank[screen.index]
                  const view = toAttemptQuestion(q)
                  if (!view)
                    return (
                      <p className="rounded-xl border border-dashed p-4 text-[15px] text-muted-foreground">
                        This question tests a Learning objective that is no longer in the Training. Fix it under Questions.
                      </p>
                    )
                  return (
                    <QuestionCard
                      key={q.id}
                      attemptId={null}
                      personId={null}
                      question={view}
                      number={screen.index + 1}
                      total={bank.length}
                      canAnswer
                      preview={{ onAnswer: () => setDone((d) => new Set(d).add(q.id)) }}
                    />
                  )
                })()}
                {screen.at === "done" && (
                  <div className="space-y-2 rounded-xl border bg-card p-4">
                    <p className="text-[18px] font-semibold">End of the preview</p>
                    <p className="text-[15px] text-muted-foreground">
                      In a real Attempt the result shows here, with what to read again or the next step
                      {draft.tryOut?.required ? ": a try-out at the line with a trainer" : ""}.
                    </p>
                  </div>
                )}
              </div>
              <div className="flex shrink-0 gap-2 border-t p-3">
                <Button
                  variant="outline"
                  className="h-12 flex-1 gap-1.5 text-[16px]"
                  disabled={screen.at === "prepare"}
                  onClick={() => setScreen(prev(screen, steps.length > 0))}
                >
                  <ArrowLeft className="h-4 w-4" /> Back
                </Button>
                <Button
                  className="h-12 flex-1 gap-1.5 text-[16px]"
                  disabled={screen.at === "done"}
                  onClick={() => setScreen(next(screen, steps.length > 0, bank.length))}
                >
                  {screen.at === "prepare" ? "Start" : "Next"} <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </Router>
          </div>
        </div>
      </div>
    </div>
  )
}

function next(s: Screen, hasSteps: boolean, count: number): Screen {
  if (s.at === "prepare") return hasSteps ? { at: "steps" } : count > 0 ? { at: "question", index: 0 } : { at: "done" }
  if (s.at === "steps") return count > 0 ? { at: "question", index: 0 } : { at: "done" }
  if (s.at === "question") return s.index + 1 < count ? { at: "question", index: s.index + 1 } : { at: "done" }
  return s
}

function prev(s: Screen, hasSteps: boolean): Screen {
  if (s.at === "steps") return { at: "prepare" }
  if (s.at === "question") return s.index > 0 ? { at: "question", index: s.index - 1 } : hasSteps ? { at: "steps" } : { at: "prepare" }
  if (s.at === "done") return { at: "prepare" }
  return s
}

function JumpRow({
  label,
  detail,
  active,
  done,
  onClick,
}: {
  label: string
  detail: string
  active: boolean
  done?: boolean
  onClick: () => void
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "flex w-full items-center gap-3 rounded-md border px-3 py-2 text-left text-sm transition-colors",
          active ? "border-primary bg-primary/5" : "hover:bg-muted/50",
        )}
      >
        <span className={cn("h-2 w-2 shrink-0 rounded-full", done ? "bg-emerald-500" : active ? "bg-primary" : "bg-muted-foreground/30")} />
        <span className="w-24 shrink-0 font-medium">{label}</span>
        <span className="min-w-0 flex-1 truncate text-muted-foreground">{detail}</span>
      </button>
    </li>
  )
}
