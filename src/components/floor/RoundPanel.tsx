import { Link } from "wouter"
import type { FunctionReturnType } from "convex/server"
import {
  AlertTriangle,
  ArrowRight,
  Award,
  CheckCircle2,
  Footprints,
  Loader2,
  Navigation,
  Play,
  RotateCcw,
  Smartphone,
  UserRound,
} from "lucide-react"
import { api } from "../../../convex/_generated/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { AttemptView } from "@/components/learn/training/AttemptReview"
import { fmtDate, ProgressBar, ScoreBadge } from "@/components/learn/training/lib"
import { initials, type Person } from "@/lib/checkIn"
import { cn } from "@/lib/utils"

export type FloorRound = FunctionReturnType<typeof api.floor.rounds>["forYou"][number]

/**
 * Round mode, next to the plan: pick a published Round, check in, start.
 * While it runs it shows where the person is; the phone does the work.
 */
export function RoundPanel({
  rounds,
  selected,
  onSelect,
  person,
  people,
  onCheckIn,
  attempt,
  starting,
  onStart,
  onShowOnPhone,
  onAbandon,
  problem,
}: {
  rounds: FloorRound[] | undefined
  selected: FloorRound | null
  onSelect: (id: string) => void
  person: Person | null
  people: Person[] | undefined
  onCheckIn: (id: Person["_id"]) => void
  attempt: AttemptView | null | undefined
  starting: boolean
  onStart: () => void
  onShowOnPhone: () => void
  onAbandon: () => void
  problem: string | null
}) {
  if (rounds === undefined) {
    return (
      <Card>
        <CardContent className="space-y-3 p-4">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    )
  }

  if (rounds.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-2 p-8 text-center">
          <Footprints className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm font-medium">No published Rounds yet</p>
          <p className="max-w-sm text-xs text-muted-foreground">
            A Round is a Training walked in the plant, stop by stop. Once an Engineer publishes one, it can be walked here.
          </p>
          <Button asChild size="sm" variant="outline" className="mt-1">
            <Link href="/learn?tab=trainings">Go to Trainings</Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  const r = selected ?? rounds[0]
  const mine = attempt && person && attempt.personId === person._id ? attempt : null

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        {problem && (
          <p className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {problem}
          </p>
        )}

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-0.5">
            <p className="flex items-center gap-1.5 text-sm font-semibold">
              <Footprints className="h-4 w-4 text-violet-600" />
              {r.title}
              {r.needsReview && (
                <Badge variant="outline" className="h-5 border-amber-300 bg-amber-50 px-1.5 text-[10px] text-amber-700">
                  Review after a change
                </Badge>
              )}
            </p>
            <p className="text-xs text-muted-foreground">
              <span className="font-mono">{r.code}</span> v{r.version} · {r.stops.length} stops · {r.objectives} Learning
              objectives · pass mark {r.passMark}%
            </p>
          </div>
          {rounds.length > 1 && (
            <Select value={r._id} onValueChange={onSelect} disabled={!!mine && mine.status === "in_progress"}>
              <SelectTrigger className="h-8 w-[240px] text-xs" aria-label="Round">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {rounds.map((x) => (
                  <SelectItem key={x._id} value={x._id} className="text-xs">
                    <span className="font-mono">{x.code}</span> {x.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {!person ? (
          <CheckInPrompt people={people} onCheckIn={onCheckIn} />
        ) : !mine || mine.status === "abandoned" ? (
          <div className="space-y-2">
            {r.purpose && <p className="line-clamp-2 text-xs text-muted-foreground">{r.purpose}</p>}
            <div className="flex flex-wrap items-center gap-3">
              <Button size="sm" className="gap-1.5" disabled={starting} onClick={onStart}>
                {starting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                {r.open ? `Continue as ${person.name.split(" ")[0]}` : `Start the Round as ${person.name.split(" ")[0]}`}
              </Button>
              <p className="text-[11px] text-muted-foreground">
                {r.lastPassedAt
                  ? `${person.name} passed it on ${fmtDate(r.lastPassedAt)}. A new Attempt gets new questions.`
                  : "Questions are written fresh for this Attempt from the Published documents."}
              </p>
            </div>
          </div>
        ) : mine.status === "passed" || mine.status === "failed" ? (
          <Result a={mine} onAgain={onStart} starting={starting} />
        ) : (
          <Progress a={mine} onShowOnPhone={onShowOnPhone} onAbandon={onAbandon} />
        )}
      </CardContent>
    </Card>
  )
}

function CheckInPrompt({
  people,
  onCheckIn,
}: {
  people: Person[] | undefined
  onCheckIn: (id: Person["_id"]) => void
}) {
  const operators = (people ?? []).filter((p) => p.kind === "operator")
  return (
    <div className="space-y-2 rounded-md border border-primary/30 bg-primary/5 p-3">
      <p className="flex items-center gap-1.5 text-xs font-semibold">
        <UserRound className="h-3.5 w-3.5 text-primary" />
        Check in to walk this Round
      </p>
      <p className="text-[11px] text-muted-foreground">
        A Round is proof, so it needs to know who you are. Pick an Operator, or use the check-in at the top right or in
        the phone.
      </p>
      <div className="flex flex-wrap gap-1.5">
        {people === undefined
          ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-7 w-24 rounded-full" />)
          : operators.map((p) => (
              <button
                key={p._id}
                type="button"
                onClick={() => onCheckIn(p._id)}
                title={p.role}
                className="flex h-7 items-center gap-1.5 rounded-full border bg-background pl-0.5 pr-2.5 text-xs transition hover:border-primary hover:bg-primary/5"
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-[9px] font-semibold">
                  {initials(p.name)}
                </span>
                {p.name}
              </button>
            ))}
      </div>
    </div>
  )
}

function Progress({
  a,
  onShowOnPhone,
  onAbandon,
}: {
  a: AttemptView
  onShowOnPhone: () => void
  onAbandon: () => void
}) {
  if (a.status === "generating" || a.status === "error") {
    return (
      <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2.5 text-xs">
        {a.status === "generating" ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            <span>
              Preparing {a.personName.split(" ")[0]}'s questions from the Published documents. About half a minute.
            </span>
          </>
        ) : (
          <>
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <span>The questions could not be prepared. Try again on the phone.</span>
          </>
        )}
      </div>
    )
  }
  const current = a.round?.currentStop ?? 0
  const done = a.stops.filter((s) => s.done).length
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <div className="flex items-baseline justify-between text-xs">
          <span className="font-medium">
            {done} of {a.stops.length} stops done
          </span>
          <span className="text-muted-foreground">
            {a.progress.answered}/{a.progress.total} questions · {a.round?.wrongScans ?? 0} wrong{" "}
            {a.round?.wrongScans === 1 ? "scan" : "scans"}
          </span>
        </div>
        <ProgressBar value={(done / Math.max(1, a.stops.length)) * 100} tone="emerald" />
      </div>
      <ol className="grid gap-1.5 sm:grid-cols-2">
        {a.stops.map((s) => {
          const state = s.done ? "done" : s.index === current ? "current" : "later"
          return (
            <li
              key={s.index}
              className={cn(
                "flex items-start gap-2 rounded-md border px-2.5 py-2 text-xs",
                state === "current" && "border-primary bg-primary/5",
                state === "later" && "opacity-60",
              )}
            >
              <span
                className={cn(
                  "mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold",
                  state === "done" && "bg-emerald-500 text-white",
                  state === "current" && "bg-primary text-primary-foreground",
                  state === "later" && "bg-muted text-muted-foreground",
                )}
              >
                {state === "done" ? <CheckCircle2 className="h-3 w-3" /> : s.index + 1}
              </span>
              <span className="min-w-0">
                {state === "done" ? (
                  <>
                    <span className="block font-mono font-medium">{s.code}</span>
                    <span className="block text-muted-foreground">{s.name}</span>
                  </>
                ) : state === "current" ? (
                  <>
                    <span className="flex items-center gap-1 font-medium text-primary">
                      <Navigation className="h-3 w-3" /> {s.visited ? `At ${s.code} now` : "Next stop"}
                    </span>
                    <span className="block text-muted-foreground">{s.visited ? s.name : s.hint}</span>
                  </>
                ) : (
                  <span className="block text-muted-foreground">A later stop</span>
                )}
              </span>
            </li>
          )
        })}
      </ol>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" className="gap-1.5" onClick={onShowOnPhone}>
          <Smartphone className="h-3.5 w-3.5" />
          Show the Round on the phone
        </Button>
        <Button size="sm" variant="ghost" className="text-xs text-muted-foreground" onClick={onAbandon}>
          Stop this Round
        </Button>
      </div>
    </div>
  )
}

function Result({ a, onAgain, starting }: { a: AttemptView; onAgain: () => void; starting: boolean }) {
  const passed = a.status === "passed"
  return (
    <div
      className={cn(
        "space-y-2 rounded-md border p-3",
        passed
          ? "border-emerald-300 bg-emerald-50/60 dark:border-emerald-500/40 dark:bg-emerald-500/10"
          : "border-red-300 bg-red-50/60 dark:border-red-500/40 dark:bg-red-500/10",
      )}
    >
      <p className="flex items-center gap-2 text-sm font-semibold">
        {passed ? <Award className="h-4 w-4 text-emerald-600" /> : <AlertTriangle className="h-4 w-4 text-red-600" />}
        {a.personName} {passed ? "passed" : "did not pass"} the Round
        <ScoreBadge score={a.score} passed={passed} />
      </p>
      <p className="text-xs text-muted-foreground">
        {a.progress.correct} of {a.progress.total} correct, pass mark {a.passMark}%, {a.round?.wrongScans ?? 0} wrong{" "}
        {a.round?.wrongScans === 1 ? "scan" : "scans"}.{" "}
        {passed ? "The Training record holds every question, answer, photo and note." : "The Attempt is kept as proof of trying."}
      </p>
      {a.skillsRaised.length > 0 && (
        <p className="text-xs">
          {a.skillsRaised.map((s) => `${s.renewed ? "Skill renewed" : "Skill raised"}: ${s.name}`).join(" · ")}
        </p>
      )}
      <div className="flex flex-wrap gap-2 pt-1">
        <Button asChild size="sm" className="gap-1.5">
          <Link href={`/learn/attempts/${a._id}`}>
            {passed ? "Open the Training record" : "See every answer"}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </Button>
        <Button size="sm" variant="outline" className="gap-1.5" disabled={starting} onClick={onAgain}>
          {starting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
          Walk it again
        </Button>
      </div>
    </div>
  )
}
