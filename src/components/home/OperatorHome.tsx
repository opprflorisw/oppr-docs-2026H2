import { useState } from "react"
import { useMutation, useQuery } from "convex/react"
import { Link, useLocation } from "wouter"
import {
  CheckCircle2,
  Clock,
  GraduationCap,
  Loader2,
  MessageSquareText,
  Play,
  ScanLine,
  Search,
  Smartphone,
} from "lucide-react"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { openAsk } from "@/components/ai/AskDock"
import { setPhoneMode } from "@/components/phone/phoneStore"
import { formatDate } from "@/lib/time"
import { cn } from "@/lib/utils"

type TodoItem = {
  key: string
  title: string
  note: string
  blocked: boolean
  training: { _id: Id<"trainings">; code: string; title: string; kind: "course" | "round"; openAttemptId?: Id<"trainingAttempts"> | null } | null
}

/**
 * Home for a checked-in Operator: their own next Training or Round, and the
 * three things they do on the floor (Scan, Ask, find a Document). The
 * Engineer's inbox of decisions is not theirs, so it is not shown.
 */
export function OperatorHome({ personId }: { personId: Id<"people"> }) {
  const data = useQuery(api.skills.myLearning, { personId })
  const start = useMutation(api.attempts.start)
  const [, navigate] = useLocation()
  const [busy, setBusy] = useState<string | null>(null)

  const items: TodoItem[] = (data?.todo ?? []).map((t, i) => {
    const training = t.training ?? null
    const blocked = t.status === "blocked"
    const due = t.dueAt ? ` Due ${formatDate(t.dueAt)}.` : ""
    return {
      key: `${t.kind}-${t.row?.skill._id ?? training?._id ?? i}`,
      title: t.row?.skill.name ?? training?.title ?? "Training",
      note: blocked
        ? (t.blockedReason ?? "On hold until an Engineer has checked it.")
        : t.status === "tryout_requested"
          ? "Try-out requested. A trainer will watch you at the line."
          : t.status === "waiting_tryout" || t.kind === "signoff"
            ? "Next: a try-out, where a trainer watches you do the work."
            : t.kind === "retrain"
              ? `Re-train needed.${due}`
              : `${training?.kind === "round" ? "A Round in the plant" : "A Training"}.${due}`,
      blocked,
      training:
        training && !blocked && t.status === "startable" && t.kind !== "signoff"
          ? { ...training, openAttemptId: (training as { openAttemptId?: Id<"trainingAttempts"> | null }).openAttemptId ?? null }
          : null,
    }
  })
  const startable = items.filter((t) => t.training)
  const first = startable[0] ?? null

  async function onStart(item: TodoItem) {
    if (!item.training) return
    setBusy(item.key)
    try {
      const id = item.training.openAttemptId ?? (await start({ trainingId: item.training._id, personId }))
      navigate(`/learn/attempts/${id}`)
    } catch {
      navigate("/learn")
    }
  }

  return (
    <section className="space-y-5" data-tour="home-work">
      <div className="space-y-2" data-tour="home-inbox">
        <div className="flex items-center gap-2">
          <GraduationCap className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">Your Trainings and Rounds</h2>
          {data && items.length > 0 && (
            <Badge variant="secondary" className="h-5 px-1.5 text-xs">
              {items.length}
            </Badge>
          )}
          <Link href="/learn" className="ml-auto text-xs text-muted-foreground hover:text-foreground hover:underline">
            My learning
          </Link>
        </div>
        {data === undefined ? (
          <Skeleton className="h-32 w-full" />
        ) : items.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
              <CheckCircle2 className="h-8 w-8 text-emerald-500" />
              <p className="text-sm font-medium">Nothing to learn right now</p>
              <p className="max-w-sm text-xs text-muted-foreground">
                Trainings an Engineer assigns you, re-training after a change and Skills that run out soon show up here.
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="divide-y p-0">
              {items.slice(0, 5).map((t) => (
                <div key={t.key} className={cn("flex items-center gap-3 px-4 py-3", t.blocked && "bg-muted/30")}>
                  <span
                    className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-md",
                      t.blocked ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary",
                    )}
                  >
                    {t.blocked ? <Clock className="h-4 w-4" /> : <GraduationCap className="h-4 w-4" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{t.title}</span>
                    <span className="block text-xs text-muted-foreground">{t.note}</span>
                  </span>
                  {t.training ? (
                    <Button
                      size="sm"
                      variant={t === first ? "default" : "outline"}
                      className="h-9 shrink-0 gap-1.5"
                      disabled={busy != null}
                      onClick={() => void onStart(t)}
                    >
                      {busy === t.key ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                      {t.training.openAttemptId ? "Continue" : t.training.kind === "round" ? "Start the Round" : "Start"}
                    </Button>
                  ) : t.blocked ? (
                    <span className="shrink-0 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-400">
                      Waiting
                    </span>
                  ) : (
                    <Button size="sm" variant="outline" className="h-9 shrink-0" asChild>
                      <Link href="/learn">Open</Link>
                    </Button>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        )}
        {data && startable.length === 0 && items.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Nothing on your list can start right now.{" "}
            <Link href="/learn?tab=trainings" className="font-medium text-foreground underline underline-offset-2">
              Browse all Trainings
            </Link>
          </p>
        )}
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-semibold">On the floor</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <FloorAction
            icon={ScanLine}
            title="Scan a machine"
            body="Open the phone app and scan the QR code on a machine: its safety, tasks and documents."
            onClick={() => setPhoneMode("popup")}
          />
          <FloorAction
            icon={MessageSquareText}
            title="Ask a question"
            body="In your own words, Dutch or English. The answer comes from Published documents, with sources."
            onClick={() => openAsk()}
          />
          <FloorAction
            icon={Search}
            title="Find a document"
            body="SOPs and work instructions in use now. Only the Published version counts."
            onClick={() => navigate("/library?status=published")}
          />
        </div>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Smartphone className="h-3.5 w-3.5" aria-hidden />
          Capture and Rounds work best on the phone app.
        </p>
      </div>
    </section>
  )
}

function FloorAction({
  icon: Icon,
  title,
  body,
  onClick,
}: {
  icon: typeof ScanLine
  title: string
  body: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[44px] flex-col gap-1 rounded-lg border bg-card p-4 text-left transition-colors hover:border-primary/50 hover:bg-muted/40"
    >
      <span className="flex items-center gap-2 text-sm font-medium">
        <Icon className="h-4 w-4 text-primary" aria-hidden />
        {title}
      </span>
      <span className="text-xs text-muted-foreground">{body}</span>
    </button>
  )
}
