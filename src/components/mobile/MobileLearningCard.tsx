import { useState } from "react"
import { useLocation } from "wouter"
import { useMutation, useQuery } from "convex/react"
import { toast } from "sonner"
import { BadgeCheck, ChevronRight, GraduationCap, Loader2, RotateCcw } from "lucide-react"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import { errorText } from "@/components/learn/training/lib"
import { useCheckIn } from "@/lib/checkIn"

/**
 * My learning on mobile Home, for a checked-in person: the top Next up item
 * with one button. A Round opens on the phone; a Training (questions at a
 * screen) opens its Attempt page.
 */
export function MobileLearningCard() {
  const { person } = useCheckIn()
  if (!person) return null
  return <LearningCard personId={person._id} />
}

function LearningCard({ personId }: { personId: Id<"people"> }) {
  const [, navigate] = useLocation()
  const data = useQuery(api.skills.myLearning, { personId })
  const mine = useQuery(api.attempts.listMine, { personId })
  const start = useMutation(api.attempts.start)
  const [busy, setBusy] = useState(false)

  if (!data || data.todo.length === 0) return null
  const top = data.todo[0]
  const row = top.row
  const training = top.kind !== "signoff" ? (row.offered.find((t) => !t.passed) ?? row.offered[0] ?? null) : null
  const open = training
    ? mine?.find(
        (a) =>
          a.trainingId === training._id &&
          (a.status === "in_progress" || a.status === "generating" || a.status === "error"),
      )
    : undefined
  const note =
    top.kind === "retrain"
      ? "Re-train needed"
      : top.kind === "expired"
        ? `Level ${row.level} expired`
        : top.kind === "expiring"
          ? `Level ${row.level} runs out soon`
          : top.kind === "signoff"
            ? `Level ${row.effectiveLevel} of ${row.target}: ask an Engineer for a practice sign-off`
            : `Needed: level ${row.target}`
  const Icon = top.kind === "retrain" ? RotateCcw : top.kind === "signoff" ? BadgeCheck : GraduationCap

  function openAttempt(id: Id<"trainingAttempts">, kind: "course" | "round") {
    // Rounds have a phone screen. Question Trainings open their Attempt page.
    if (kind === "round") navigate(`/m/round/${id}`)
    else window.location.assign(`/learn/attempts/${id}`)
  }

  async function go() {
    if (!training) return
    if (open) {
      openAttempt(open._id, training.kind)
      return
    }
    setBusy(true)
    try {
      const id = await start({ trainingId: training._id, personId })
      openAttempt(id, training.kind)
    } catch (err) {
      toast.error(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  const label = open ? "Continue" : training?.kind === "round" ? "Walk the Round" : "Start Training"

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1 px-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        <GraduationCap className="h-2.5 w-2.5" />
        My learning
        {data.todo.length > 1 && (
          <span className="ml-auto font-normal normal-case tracking-normal">{data.todo.length - 1} more after this</span>
        )}
      </div>
      <div className="flex flex-col gap-1.5 rounded-md border bg-card px-2 py-2">
        <div className="flex items-start gap-2">
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-primary/10 text-primary">
            <Icon className="h-3 w-3" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[11px] font-medium leading-tight">{row.skill.name}</div>
            <div className="text-[9px] leading-snug text-muted-foreground">{note}</div>
          </div>
        </div>
        {training && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void go()}
            className="flex items-center gap-2 rounded-md bg-primary/10 px-2 py-1.5 text-left text-primary active:scale-[0.99] disabled:opacity-70"
          >
            <div className="min-w-0 flex-1">
              <div className="truncate text-[11px] font-semibold leading-tight">
                {label}: {training.title}
              </div>
              <div className="font-mono text-[9px] opacity-80">{training.code}</div>
            </div>
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <ChevronRight className="h-3 w-3" />}
          </button>
        )}
      </div>
    </div>
  )
}
