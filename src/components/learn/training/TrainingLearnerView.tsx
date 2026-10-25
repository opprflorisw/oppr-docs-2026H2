import { useState } from "react"
import { useMutation, useQuery } from "convex/react"
import { Link, useLocation } from "wouter"
import { ArrowRight, Clock, FileText, ListChecks, Loader2, Play, ShieldCheck, Smartphone, UserCheck } from "lucide-react"
import { api } from "../../../../convex/_generated/api"
import type { Id } from "../../../../convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { useCheckIn } from "@/lib/checkIn"
import { daysAgo, errorText, KindBadge, type TrainingKind } from "./lib"

/**
 * The Training page for an Operator (or nobody checked in): what it is for,
 * how long it takes, what passing means in plain words, the source
 * documents, and one Start or Continue button. No answer key, no other
 * people's records, no Engineer warnings.
 */
export function TrainingLearnerView({
  trainingId,
  code,
  title,
  kind,
  blockedReason,
}: {
  trainingId: Id<"trainings">
  code: string
  title: string
  kind: TrainingKind
  blockedReason: string | null
}) {
  const summary = useQuery(api.trainingBuilder.learnerSummary, { trainingId })
  const { person } = useCheckIn()
  const mine = useQuery(api.attempts.listMine, person ? { personId: person._id } : "skip")
  const start = useMutation(api.attempts.start)
  const [, navigate] = useLocation()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const open = mine?.find(
    (a) => a.trainingId === trainingId && (a.status === "in_progress" || a.status === "generating" || a.status === "error"),
  )
  const last = mine?.find((a) => a.trainingId === trainingId && (a.status === "passed" || a.status === "failed"))

  async function go() {
    if (!person) return
    setBusy(true)
    setError(null)
    try {
      const id = await start({ trainingId, personId: person._id })
      navigate(`/learn/attempts/${id}`)
    } catch (err) {
      setError(errorText(err))
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-5 p-6">
      <div className="space-y-2" data-tour="learn-training-about">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="font-mono">{code}</span>
          <KindBadge kind={kind} />
        </div>
        <h1 className="text-lg font-semibold">{title}</h1>
        {summary?.purpose && <p className="text-sm text-muted-foreground">{summary.purpose}</p>}
      </div>

      {summary === undefined ? (
        <div className="h-40 animate-pulse rounded-lg bg-muted" />
      ) : summary === null || !summary.live ? (
        <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground" data-tour="learn-training-facts">
          This Training is not in use yet. Once an Engineer has published it, you can do it here.
        </div>
      ) : (
        <div className="space-y-4 rounded-lg border p-5" data-tour="learn-training-facts">
          <ul className="space-y-2.5 text-sm">
            <li className="flex items-center gap-2.5">
              <ListChecks className="h-4 w-4 shrink-0 text-primary" />
              {kind === "round"
                ? `${summary.stops} ${summary.stops === 1 ? "stop" : "stops"} in the plant, ${summary.questions} questions`
                : `${summary.questions} ${summary.questions === 1 ? "question" : "questions"}`}
              {summary.steps > 0 && `, after reading ${summary.steps} steps`}
            </li>
            <li className="flex items-center gap-2.5">
              <Clock className="h-4 w-4 shrink-0 text-primary" />
              About {kind === "round" ? Math.max(15, summary.minutes) : summary.minutes} minutes
            </li>
            <li className="flex items-start gap-2.5">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span>To pass: {summary.passRule.charAt(0).toLowerCase() + summary.passRule.slice(1)}</span>
            </li>
            {summary.tryOutRequired && (
              <li className="flex items-start gap-2.5">
                <UserCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span>After passing, a trainer watches you do the job once at the line.</span>
              </li>
            )}
          </ul>

          {summary.sources.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">It is based on</p>
              <ul className="space-y-1">
                {summary.sources.map((s) => (
                  <li key={s.documentId}>
                    <Link
                      href={`/docs/${s.documentId}?v=${s.version}`}
                      className="inline-flex items-center gap-1.5 text-sm hover:text-primary hover:underline"
                    >
                      <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="font-mono text-xs">{s.namingCode}</span> {s.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {blockedReason || summary.blockedReason ? (
            <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">{blockedReason ?? summary.blockedReason}</p>
          ) : !person ? (
            <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
              Check in first (top right). A Training record is proof, so it needs to know who you are.
            </p>
          ) : open ? (
            <Button asChild size="lg" className="w-full gap-2">
              <Link href={`/learn/attempts/${open._id}`}>
                <Play className="h-4 w-4" /> Continue{open.total > 0 ? ` (${open.answered} of ${open.total} done)` : ""}
              </Link>
            </Button>
          ) : (
            <div className="space-y-2">
              <Button size="lg" className="w-full gap-2" disabled={busy} onClick={() => void go()}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                {last ? "Start again" : "Start"}
              </Button>
              {kind === "round" && (
                <Button asChild variant="outline" className="h-auto w-full gap-2 whitespace-normal py-2">
                  <Link href={`/floor?round=${trainingId}`}>
                    <Smartphone className="h-4 w-4 shrink-0" /> Walk it in the Floor simulator
                  </Link>
                </Button>
              )}
            </div>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {last && (
            <Link
              href={`/learn/attempts/${last._id}`}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary"
            >
              Your last try: {last.status === "passed" ? "passed" : "not passed"}
              {last.finishedAt ? `, ${daysAgo(last.finishedAt)}` : ""}
              <ArrowRight className="h-3 w-3" />
            </Link>
          )}
        </div>
      )}
    </div>
  )
}
