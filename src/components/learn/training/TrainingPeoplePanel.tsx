import { useState } from "react"
import { useMutation, useQuery } from "convex/react"
import { Link } from "wouter"
import { toast } from "sonner"
import { Bell, Loader2, UserPlus, UserRound } from "lucide-react"
import { api } from "../../../../convex/_generated/api"
import type { Id } from "../../../../convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { useCheckIn } from "@/lib/checkIn"
import { cn } from "@/lib/utils"
import { daysAgo, errorText, fmtDate } from "./lib"
import { AssignDialog } from "./AssignDialog"

const STATE: Record<"passed" | "in_progress" | "not_passed" | "not_started", { label: string; tone: string }> = {
  passed: { label: "Passed", tone: "bg-emerald-50 text-emerald-800 border-emerald-300 dark:bg-emerald-500/10 dark:text-emerald-200 dark:border-emerald-500/40" },
  in_progress: { label: "In progress", tone: "bg-sky-50 text-sky-800 border-sky-300 dark:bg-sky-500/10 dark:text-sky-200 dark:border-sky-500/40" },
  not_passed: { label: "Not passed", tone: "bg-red-50 text-red-800 border-red-300 dark:bg-red-500/10 dark:text-red-200 dark:border-red-500/40" },
  not_started: { label: "Not started", tone: "bg-muted text-muted-foreground border-border" },
}

/**
 * Who must do this Training and how far they are: assigned, passed, not
 * started, overdue, with Remind and "Assign more".
 */
export function TrainingPeoplePanel({ trainingId, isLive }: { trainingId: Id<"trainings">; isLive: boolean }) {
  const data = useQuery(api.assignments.listForTraining, { trainingId })
  const records = useQuery(api.attempts.listRecords, { trainingId, includeFailed: true })
  const remind = useMutation(api.assignments.remind)
  const { person } = useCheckIn()
  const engineer = person?.kind === "engineer" ? person : null
  const [assigning, setAssigning] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)

  async function doRemind(assignmentId?: Id<"trainingAssignments">) {
    if (!engineer) return
    setBusy(assignmentId ?? "all")
    try {
      const r = await remind({ assignmentId, trainingId: assignmentId ? undefined : trainingId, personId: engineer._id })
      toast.success(r.reminded === 0 ? "Nobody to remind." : `Reminded ${r.reminded} ${r.reminded === 1 ? "person" : "people"}.`)
    } catch (err) {
      toast.error(errorText(err))
    } finally {
      setBusy(null)
    }
  }

  const s = data?.summary
  const assignedIds = new Set((data?.people ?? []).map((p) => String(p.personId)))
  const others = (records ?? []).filter((r) => !assignedIds.has(String(r.personId)))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {s ? (
          <p className="text-sm">
            <span className="font-semibold">Assigned {s.assigned}</span>
            <span className="text-muted-foreground">
              {" "}
              · Passed {s.passed} · In progress {s.inProgress} · Not started {s.notStarted}
              {s.notPassed > 0 ? ` · Not passed ${s.notPassed}` : ""} ·{" "}
            </span>
            <span className={cn(s.overdue > 0 ? "font-semibold text-red-700 dark:text-red-300" : "text-muted-foreground")}>
              Overdue {s.overdue}
            </span>
          </p>
        ) : (
          <div className="h-5 w-72 animate-pulse rounded bg-muted" />
        )}
        <div className="flex gap-2">
          {s && s.assigned - s.passed > 0 && (
            <Button size="sm" variant="outline" className="gap-1.5" disabled={!engineer || busy !== null} onClick={() => void doRemind()}>
              {busy === "all" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bell className="h-4 w-4" />}
              Remind everyone open
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            disabled={!isLive || !engineer}
            title={!isLive ? "Publish the Training first" : !engineer ? "Check in as an Engineer" : undefined}
            onClick={() => setAssigning(true)}
          >
            <UserPlus className="h-4 w-4" /> Assign more
          </Button>
        </div>
      </div>
      {!engineer && <p className="text-xs text-muted-foreground">Check in as an Engineer to assign people or send reminders.</p>}
      {!isLive && <p className="text-xs text-muted-foreground">People can be assigned once the Training is published. Set who must do it in the builder, under People.</p>}

      <div className="overflow-hidden rounded-lg border">
        {data === undefined ? (
          <div className="h-24 animate-pulse bg-muted" />
        ) : data.people.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <p className="text-sm font-medium">Nobody is assigned yet</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
              Assign people with a due date. They see it on Home and on the phone, sorted by due date.
            </p>
          </div>
        ) : (
          <ul className="divide-y">
            {data.people.map((p) => (
              <li key={p.assignmentId} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                <UserRound className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1">
                  <Link href={`/learn/people/${p.personId}`} className="font-medium hover:text-primary hover:underline">
                    {p.name}
                  </Link>
                  <span className="ml-2 text-xs text-muted-foreground">{p.role}</span>
                </span>
                <span className={cn("rounded-full border px-2 py-0.5 text-xs font-medium", STATE[p.state].tone)}>
                  {STATE[p.state].label}
                  {p.lastScore != null && p.state !== "not_started" ? ` · ${p.lastScore}%` : ""}
                </span>
                <span className={cn("w-36 text-right text-xs", p.overdue ? "font-semibold text-red-700 dark:text-red-300" : "text-muted-foreground")}>
                  {p.state === "passed" && p.doneAt ? `Done ${fmtDate(p.doneAt)}` : `${p.overdue ? "Overdue since" : "Due"} ${fmtDate(p.dueAt)}`}
                </span>
                {p.state !== "passed" && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="gap-1"
                    disabled={!engineer || busy !== null}
                    onClick={() => void doRemind(p.assignmentId)}
                    title={p.lastRemindedAt ? `Last reminded ${daysAgo(p.lastRemindedAt)}` : undefined}
                  >
                    {busy === p.assignmentId ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bell className="h-4 w-4" />}
                    Remind
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {others.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Also did it, without an assignment</p>
          <ul className="divide-y rounded-lg border">
            {others.slice(0, 20).map((r) => (
              <li key={r._id}>
                <Link href={`/learn/attempts/${r.attemptId}`} className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-muted/50">
                  <UserRound className="h-4 w-4 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{r.personName}</span>
                  <span className={cn("text-xs", r.passed ? "text-emerald-700 dark:text-emerald-300" : "text-red-700 dark:text-red-300")}>
                    {r.passed ? "Passed" : "Not passed"} · {r.score}%
                  </span>
                  <span className="w-28 text-right text-xs text-muted-foreground">{fmtDate(r.at)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <AssignDialog open={assigning} onOpenChange={setAssigning} trainingId={trainingId} />
    </div>
  )
}
