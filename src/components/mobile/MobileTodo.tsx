// "What do I do now" for a checked-in person, shared by Home (top 3) and Me
// (all): Trainings and Rounds to do, try-outs waiting for a trainer, and
// for trainers the try-outs to watch. Each item has one large action, or a
// Waiting chip that says why there is none.

import { useMemo, useState } from "react"
import { useLocation } from "wouter"
import { useMutation, useQuery } from "convex/react"
import { toast } from "sonner"
import {
  BadgeCheck,
  ChevronRight,
  Clock,
  Eye,
  Footprints,
  GraduationCap,
  Hourglass,
  Loader2,
  RotateCcw,
} from "lucide-react"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import { LEVEL_WORDS, errorText } from "@/components/learn/training/lib"
import { formatAgo, formatDate } from "@/lib/time"
import { cn } from "@/lib/utils"
import { useMobileShell } from "./MobileShell"

export type TodoItem = {
  key: string
  /** The Training or Round this item starts, when there is one. */
  trainingId?: string
  icon: typeof GraduationCap
  title: string
  code?: string
  /** One plain line: why this is here, and when it is due. */
  note: string
  dueAt: number | null
  /** No action: the reason is in `note`. */
  waiting: boolean
  waitingLabel?: string
  action?: {
    label: string
    run: () => void
  }
}

type LearningItem = {
  kind: "retrain" | "expired" | "train" | "signoff" | "expiring"
  status?: string
  blockedReason?: string | null
  dueAt?: number | null
  row: {
    skill: { _id: string; name: string }
    level: number
    effectiveLevel: number
    target: number | null
    expiresAt: number | null
    offered: { _id: Id<"trainings">; code: string; title: string; kind: "course" | "round"; passed: boolean }[]
  }
  training?: { _id: Id<"trainings">; code: string; title: string; kind: "course" | "round" } | null
}

/** Opens an Attempt in the phone: a Round walks the plant, a Training asks its questions. */
export function attemptPath(id: string, kind: string) {
  return kind === "round" ? `/m/round/${id}` : `/m/attempt/${id}`
}

/**
 * Starts (or continues) a Training or Round in the phone. Starting is proof:
 * it asks "Start as <name>?" or the check-in first.
 */
export function useStartTraining() {
  const [, navigate] = useLocation()
  const { withPerson } = useMobileShell()
  const start = useMutation(api.attempts.start)
  const [busy, setBusy] = useState<string | null>(null)

  function go(training: { _id: Id<"trainings">; kind: string }) {
    withPerson(training.kind === "round" ? "Walk this Round" : "Start this Training", async (personId) => {
      setBusy(training._id)
      try {
        const id = await start({ trainingId: training._id, personId })
        navigate(attemptPath(id, training.kind))
      } catch (err) {
        toast.error(errorText(err))
      } finally {
        setBusy(null)
      }
    })
  }
  return { go, busy }
}

export function useTodo(personId: Id<"people"> | null) {
  const [, navigate] = useLocation()
  const { go, busy } = useStartTraining()
  const learning = useQuery(api.skills.myLearning, personId ? { personId } : "skip")
  const mine = useQuery(api.attempts.listMine, personId ? { personId } : "skip")
  const myRequests = useQuery(api.tryOuts.mine, personId ? { personId } : "skip")
  const inbox = useQuery(api.tryOuts.inbox, personId ? { personId } : "skip")

  const loading = !!personId && (learning === undefined || mine === undefined)

  const items = useMemo<TodoItem[]>(() => {
    if (!learning) return []
    const watch: TodoItem[] = []
    const out: TodoItem[] = []

    // Trainers first: someone is standing at the line waiting.
    for (const r of inbox ?? []) {
      watch.push({
        key: `inbox-${r._id}`,
        icon: Eye,
        title: `${r.personName} is ready for a ${r.kind === "walkthrough" ? "walk-through" : "try-out"}`,
        code: r.trainingCode,
        note: `${r.trainingTitle} · asked ${formatAgo(r.createdAt)}`,
        dueAt: null,
        waiting: false,
        action: { label: "Watch now", run: () => navigate(`/m/tryout/${r._id}`) },
      })
    }

    const openRequests = (myRequests ?? []).filter((r) => r.status === "open")
    const seenTrainings = new Set<string>()
    for (const raw of learning.todo as unknown as LearningItem[]) {
      const row = raw.row
      const training =
        raw.training ?? (raw.kind !== "signoff" ? (row.offered.find((t) => !t.passed) ?? row.offered[0] ?? null) : null)
      const open = training
        ? mine?.find(
            (a) =>
              a.trainingId === training._id &&
              (a.status === "in_progress" || a.status === "generating" || a.status === "error"),
          )
        : undefined
      const request = training ? openRequests.find((r) => r.trainingId === training._id) : undefined
      const due = raw.dueAt ?? (raw.kind === "expiring" ? row.expiresAt : null)
      const dueText = due ? ` · due ${formatDate(due)}` : ""
      const why =
        raw.kind === "retrain"
          ? "Re-train needed after a change"
          : raw.kind === "expired"
            ? `Level ${row.level} expired`
            : raw.kind === "expiring"
              ? `Level ${row.level} runs out soon`
              : raw.kind === "signoff"
                ? `Next: a sign-off at the line (level ${row.effectiveLevel} of ${row.target})`
                : row.target != null
                  ? `${LEVEL_WORDS[row.target] ?? "Level"} (level ${row.target}) needed`
                  : "Needed for your work"
      const Icon = raw.kind === "retrain" ? RotateCcw : raw.kind === "signoff" ? BadgeCheck : training?.kind === "round" ? Footprints : GraduationCap
      const key = `todo-${row.skill._id}-${raw.kind}`

      // One row per Training: a Training that proves several Skills, or
      // several try-out requests for it, still shows once.
      if (training) {
        if (seenTrainings.has(training._id)) continue
        seenTrainings.add(training._id)
      }

      if (raw.status === "blocked") {
        out.push({
          key,
          icon: Hourglass,
          title: training?.title ?? row.skill.name,
          code: training?.code,
          note: raw.blockedReason ?? "This Training is being updated. You can do it once an Engineer has checked it.",
          dueAt: due,
          waiting: true,
          waitingLabel: "Waiting",
        })
        continue
      }
      if (request || raw.status === "tryout_requested" || raw.status === "waiting_tryout") {
        const who = request?.trainerName ?? "a trainer"
        out.push({
          key,
          icon: Clock,
          title: training?.title ?? row.skill.name,
          code: training?.code,
          note: request
            ? `Waiting for ${who} for the try-out, asked ${formatAgo(request.createdAt)}`
            : "Passed. Ask a trainer for the try-out at the line.",
          dueAt: due,
          waiting: !!request,
          waitingLabel: "Waiting",
          action: request
            ? undefined
            : open
              ? { label: "Request try-out", run: () => navigate(attemptPath(open._id, open.kind)) }
              : undefined,
        })
        continue
      }
      if (!training) {
        out.push({
          key,
          icon: Icon,
          title: row.skill.name,
          note: why + dueText,
          dueAt: due,
          waiting: true,
          waitingLabel: "At the line",
        })
        continue
      }
      out.push({
        key,
        trainingId: training._id,
        icon: Icon,
        title: training.title,
        code: training.code,
        note: `${why}${row.skill.name !== training.title ? ` · ${row.skill.name}` : ""}${dueText}`,
        dueAt: due,
        waiting: false,
        action: open
          ? { label: "Continue", run: () => navigate(attemptPath(open._id, training.kind)) }
          : {
              label: busy === training._id ? "Starting" : training.kind === "round" ? "Walk the Round" : "Start",
              run: () => go(training),
            },
      })
    }

    // By due date; never a waiting item on top when something can be done.
    const actionable = out.filter((i) => !i.waiting)
    const waiting = out.filter((i) => i.waiting)
    const byDue = (a: TodoItem, b: TodoItem) => (a.dueAt ?? Infinity) - (b.dueAt ?? Infinity)
    return [...watch, ...actionable.sort(byDue), ...waiting.sort(byDue)]
  }, [learning, mine, myRequests, inbox, navigate, go, busy])

  return { items, loading, busy }
}

export function TodoRow({ item, big = false, busy = false }: { item: TodoItem; big?: boolean; busy?: boolean }) {
  const Icon = item.icon
  return (
    <div className="flex flex-col gap-3 rounded-2xl border bg-card p-3 shadow-sm">
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
            item.waiting ? "bg-muted text-slate-500" : "bg-[#6E59A5]/10 text-[#6E59A5]",
          )}
        >
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-base font-semibold leading-snug">{item.title}</p>
          <p className="mt-0.5 text-sm leading-snug text-muted-foreground">
            {item.code && <span className="font-mono text-[13px]">{item.code} · </span>}
            {item.note}
          </p>
        </div>
        {item.waiting && (
          <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-[13px] font-medium text-slate-600 dark:text-slate-300">
            {item.waitingLabel ?? "Waiting"}
          </span>
        )}
      </div>
      {item.action && (
        <button
          type="button"
          onClick={item.action.run}
          disabled={busy}
          className={cn(
            "flex min-h-12 items-center justify-center gap-2 rounded-xl px-4 text-base font-semibold transition active:scale-[0.99] disabled:opacity-60",
            big
              ? "bg-[#6E59A5] text-white shadow-sm"
              : "border border-[#6E59A5]/40 bg-background text-[#6E59A5]",
          )}
        >
          {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
          {item.action.label}
          {!busy && <ChevronRight className="h-5 w-5" />}
        </button>
      )}
    </div>
  )
}
