// Present (TWI step 2): the job broken down into important steps, each with
// its key points (safety in red) and the reasons, from the cited passage.
// One card at a time; swipe or use the buttons. Then "I have read this, test
// me". On a retry the steps can be skipped.

import { useEffect, useRef, useState } from "react"
import { ArrowLeft, ArrowRight, Gem, Info, ShieldAlert, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { StickyBar } from "@/components/mobile/round/ProofChrome"
import { cn } from "@/lib/utils"
import { type BreakdownStep, SourceChip, useIsFloor } from "./lib"

const KIND = {
  safety: { label: "Safety", icon: ShieldAlert, tone: "border-red-300 bg-red-50 text-red-800 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200" },
  quality: { label: "Quality", icon: Gem, tone: "border-sky-300 bg-sky-50 text-sky-900 dark:border-sky-500/40 dark:bg-sky-500/10 dark:text-sky-100" },
  knack: { label: "Knack", icon: Sparkles, tone: "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100" },
} as const

export function PresentSteps({
  steps,
  retry,
  busy,
  onDone,
  onSkip,
}: {
  steps: BreakdownStep[]
  retry: boolean
  busy?: boolean
  onDone: () => void
  onSkip: () => void
}) {
  const floor = useIsFloor()
  const [index, setIndex] = useState(0)
  const track = useRef<HTMLDivElement>(null)
  const last = index >= steps.length - 1

  // Keep the visible card and the index in step when the person swipes.
  useEffect(() => {
    const el = track.current
    if (!el) return
    const onScroll = () => {
      const i = Math.round(el.scrollLeft / Math.max(1, el.clientWidth))
      setIndex((cur) => (cur === i ? cur : Math.min(Math.max(i, 0), steps.length - 1)))
    }
    el.addEventListener("scroll", onScroll, { passive: true })
    return () => el.removeEventListener("scroll", onScroll)
  }, [steps.length])

  function go(i: number) {
    const el = track.current
    setIndex(i)
    el?.scrollTo({ left: i * el.clientWidth, behavior: "smooth" })
  }

  const primary = last ? (
    <Button className={cn("flex-1 gap-1.5", floor && "h-12 rounded-xl text-base")} disabled={busy} onClick={onDone}>
      I have read this, test me
    </Button>
  ) : (
    <Button className={cn("flex-1 gap-1.5", floor && "h-12 rounded-xl text-base")} onClick={() => go(index + 1)}>
      Next step <ArrowRight className="h-4 w-4" />
    </Button>
  )
  const back = (
    <Button
      variant="outline"
      className={cn(floor && "h-12 w-12 rounded-xl")}
      disabled={index === 0}
      onClick={() => go(index - 1)}
      aria-label="Previous step"
    >
      <ArrowLeft className="h-4 w-4" />
    </Button>
  )

  return (
    <div className={cn("flex flex-col", floor && "min-h-full flex-1")} data-present-steps>
      <div className={cn("space-y-3", floor ? "p-3" : "")}>
        <div className="flex items-baseline justify-between gap-2">
          <p className={cn("font-semibold", floor ? "text-base" : "text-sm")}>How the job is done</p>
          <p className={cn("tabular-nums text-muted-foreground", floor ? "text-sm" : "text-xs")}>
            Step {index + 1} of {steps.length}
          </p>
        </div>
        <div className="flex gap-1.5" aria-hidden>
          {steps.map((s, i) => (
            <span key={s.id} className={cn("h-1.5 flex-1 rounded-full", i <= index ? "bg-primary" : "bg-muted")} />
          ))}
        </div>
        <div
          ref={track}
          className="flex snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {steps.map((s, i) => (
            <section
              key={s.id}
              aria-label={`Step ${i + 1}`}
              aria-hidden={i !== index}
              className="w-full shrink-0 snap-start px-0.5"
            >
              <StepCard step={s} n={i + 1} floor={floor} />
            </section>
          ))}
        </div>
        {retry && (
          <button
            type="button"
            onClick={onSkip}
            disabled={busy}
            className={cn("min-h-11 w-full text-center text-muted-foreground underline-offset-2 [@media(hover:hover)]:hover:underline", floor ? "text-sm" : "text-xs")}
          >
            Skip the steps
          </button>
        )}
      </div>
      {floor ? (
        <StickyBar>
          {back}
          {primary}
        </StickyBar>
      ) : (
        <div className="mt-3 flex items-center gap-2">
          {back}
          {primary}
        </div>
      )}
    </div>
  )
}

function StepCard({ step, n, floor }: { step: BreakdownStep; n: number; floor: boolean }) {
  const kinds = step.keyPointKinds ?? []
  return (
    <div className={cn("space-y-3 rounded-xl border bg-card", floor ? "p-4" : "p-5")}>
      <p className={cn("font-semibold leading-snug", floor ? "text-lg" : "text-base")}>
        <span className="mr-1.5 text-primary">{n}.</span>
        {step.step}
      </p>
      {step.imageUrl && <img src={step.imageUrl} alt="" className="max-h-64 w-full rounded-lg border object-contain" />}
      {step.keyPoints.length > 0 && (
        <div className="space-y-2">
          <p className={cn("font-medium text-muted-foreground", floor ? "text-[13px]" : "text-xs")}>Key points</p>
          <ul className="space-y-2">
            {step.keyPoints.map((k, i) => {
              const kind = KIND[kinds[i] ?? "knack"] ?? KIND.knack
              const known = !!kinds[i]
              return (
                <li
                  key={i}
                  className={cn(
                    "flex items-start gap-2 rounded-lg border px-3 py-2",
                    known ? kind.tone : "border-border",
                    floor ? "text-base" : "text-sm",
                  )}
                >
                  {known && <kind.icon className="mt-0.5 h-4 w-4 shrink-0" aria-label={kind.label} />}
                  <span>{k}</span>
                </li>
              )
            })}
          </ul>
        </div>
      )}
      {step.reasons.length > 0 && (
        <div className={cn("flex items-start gap-2 rounded-lg bg-muted/50 px-3 py-2", floor ? "text-[15px]" : "text-sm")}>
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <p>
            <span className="font-medium">Why: </span>
            {step.reasons.join(" ")}
          </p>
        </div>
      )}
      {step.citation && (
        <SourceChip
          documentId={step.citation.documentId}
          namingCode={step.citation.namingCode}
          version={step.citation.version}
          quote={step.citation.quote ?? null}
        />
      )}
    </div>
  )
}
