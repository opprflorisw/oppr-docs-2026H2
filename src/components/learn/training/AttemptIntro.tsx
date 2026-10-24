// The Prepare card (TWI step 1, prepare the learner): why this matters, how
// long it takes, the pass rule in plain words, the PPE and how answering
// works. Shown while the questions are written, so the wait becomes reading
// time, and before question 1.

import { useEffect, useState } from "react"
import { Clock, HardHat, Hand, ListChecks, Loader2, ShieldCheck, Sparkles, Target } from "lucide-react"
import type { AttemptView } from "./AttemptReview"
import { answerKind, ext, passRuleWords, qext, useIsFloor } from "./lib"
import { cn } from "@/lib/utils"

export function mustBeRightCount(a: AttemptView): number {
  return a.mustBeRight?.length ?? a.objectives.filter((o) => o.critical).length
}

export function AttemptIntro({ a, generating }: { a: AttemptView; generating: boolean }) {
  const floor = useIsFloor()
  const x = ext(a)
  const round = a.training?.kind === "round"
  const count = a.questions.length || Math.max(a.objectives.length, 1)
  const minutes = round ? Math.max(10, a.stops.length * 4) : (a.minutes ?? Math.max(2, Math.ceil(count * 0.75)))
  const hasOpen = a.questions.some((q) => answerKind(qext(q)) === "open")
  const hasPhoto = a.questions.some((q) => answerKind(qext(q)) === "photo")
  const mbr = mustBeRightCount(a)
  const rows: { icon: typeof Clock; label: string; text: React.ReactNode }[] = [
    {
      icon: Clock,
      label: "How long",
      text: round
        ? `${a.stops.length} ${a.stops.length === 1 ? "stop" : "stops"} in the plant, about ${minutes} minutes`
        : `${a.questions.length ? count : "About " + count} ${count === 1 ? "question" : "questions"}, about ${minutes} minutes`,
    },
    { icon: Target, label: "To pass", text: a.passRule || passRuleWords(a.passMark, mbr) },
  ]
  if (x.ppe && x.ppe.length > 0) rows.push({ icon: HardHat, label: "Wear", text: x.ppe.join(", ") })
  rows.push({
    icon: Hand,
    label: "How to answer",
    text: (
      <>
        Tap your answer, then press <span className="font-semibold">Check answer</span>. Then it is final.
        {hasOpen && " Some questions you answer in your own words: type, or hold to talk."}
        {hasPhoto && " Some ask for a photo of what you see."}
      </>
    ),
  })
  if (round) rows.push({ icon: ListChecks, label: "At each stop", text: "Scan the QR code on the machine. Its questions open there." })

  return (
    <div className={cn("space-y-4 rounded-xl border bg-card", floor ? "p-4" : "p-5")} data-attempt-intro>
      <div className="space-y-1.5">
        <p className={cn("flex items-center gap-1.5 font-medium text-primary", floor ? "text-sm" : "text-xs")}>
          <ShieldCheck className="h-4 w-4" /> {x.refresher ? "Refresher" : "Before you start"}
        </p>
        <p className={cn("font-semibold leading-snug", floor ? "text-xl" : "text-lg")}>{a.training?.title ?? "Training"}</p>
        {a.purpose && <p className={cn("leading-relaxed text-muted-foreground", floor ? "text-base" : "text-sm")}>{a.purpose}</p>}
      </div>
      <dl className="space-y-3">
        {rows.map((r) => (
          <div key={r.label} className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <r.icon className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <dt className={cn("font-medium text-muted-foreground", floor ? "text-[13px]" : "text-xs")}>{r.label}</dt>
              <dd className={cn("leading-snug", floor ? "text-base" : "text-sm")}>{r.text}</dd>
            </div>
          </div>
        ))}
      </dl>
      {generating && <Preparing startedAt={a.startedAt} floor={floor} />}
    </div>
  )
}

function Preparing({ startedAt, floor }: { startedAt: number; floor: boolean }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  const secs = Math.max(0, Math.floor((now - startedAt) / 1000))
  return (
    <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-3" role="status" data-preparing>
      <p className={cn("flex items-center gap-2 font-medium", floor ? "text-base" : "text-sm")}>
        <span className="relative flex h-5 w-5 items-center justify-center">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          <Loader2 className="absolute h-5 w-5 animate-spin text-primary/50" />
        </span>
        Preparing your questions
        <span className="ml-auto text-xs tabular-nums text-muted-foreground">{secs}s</span>
      </p>
      <div className="space-y-1.5" aria-hidden>
        <div className="h-2.5 w-full animate-pulse rounded bg-primary/15" />
        <div className="h-2.5 w-4/5 animate-pulse rounded bg-primary/15" />
      </div>
      <p className={cn("text-muted-foreground", floor ? "text-sm" : "text-xs")}>
        Usually under a minute. You can leave, we keep it ready on Home.
      </p>
    </div>
  )
}
