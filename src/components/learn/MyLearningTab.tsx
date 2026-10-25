import { useMemo, useState, type ReactNode } from "react"
import { useMutation, useQuery } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import { Link, useLocation } from "wouter"
import {
  ArrowUpRight,
  BadgeCheck,
  CalendarClock,
  CheckCircle2,
  Clock,
  FileCheck2,
  GraduationCap,
  ListTodo,
  Loader2,
  Play,
  RotateCcw,
  ShieldAlert,
  UserRound,
} from "lucide-react"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useCheckIn } from "@/lib/checkIn"
import { formatDate } from "@/lib/time"
import { cn } from "@/lib/utils"
import { SkillCellSheet } from "./skills/SkillCellSheet"
import { errorText, expiryText, fmtDate, fmtScore, LevelDots, levelWords, StatusChip, type SkillStatus } from "./skills/skillUi"
import { isEngineerOrAdmin } from "@/lib/roles"

// Learn tab: for the checked-in person, their Skill profile progress, what
// to learn next (the Training to start, or the try-out to request), re-training
// needed, Skills expiring soon, and their records.
export function MyLearningTab() {
  const { person, people } = useCheckIn()
  if (people === undefined) return <Loading />
  if (!person) return <CheckInPrompt />
  return <MyLearning personId={person._id} engineer={isEngineerOrAdmin(person)} />
}

function Loading() {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
      <div className="space-y-3">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
      <Skeleton className="h-48 w-full" />
    </div>
  )
}

function CheckInPrompt() {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
          <UserRound className="h-5 w-5" />
        </span>
        <div className="space-y-1">
          <p className="text-sm font-medium">Check in to see your learning</p>
          <p className="max-w-md text-xs text-muted-foreground">
            Pick your name with <span className="font-medium text-foreground">Check in</span> at the top right.
            You then see how far you are on your Skill profile, what to learn next, anything that needs
            re-training or runs out soon, and your Training records.
          </p>
        </div>
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          Top right of the page <ArrowUpRight className="h-3 w-3" />
        </span>
      </CardContent>
    </Card>
  )
}

type Data = NonNullable<FunctionReturnType<typeof api.skills.myLearning>>
type Todo = Data["todo"][number]
type Row = Data["skills"][number]
type TryOutRequest = FunctionReturnType<typeof api.tryOuts.mine>[number]
type RecordRow = FunctionReturnType<typeof api.attempts.listRecords>[number]

type Offer = {
  _id: Id<"trainings">
  code: string
  title: string
  kind: "course" | "round"
  passed: boolean
  status?: string
  passedAttemptId?: Id<"trainingAttempts"> | null
  openAttemptId?: Id<"trainingAttempts"> | null
  tryOutRequest?: { trainerName: string | null; since: number } | null
}

/** One to-do item, read the same way whichever shape skills.myLearning sends. */
type Item = {
  key: string
  kind: string
  row: Row | null
  training: Offer | null
  offered: Offer[]
  status: string
  blockedReason: string | null
  dueAt: number | null
}

function normalize(t: Todo): Item {
  const x = t as unknown as {
    kind: string
    row: Row | null
    training?: Offer | null
    status?: string
    blockedReason?: string | null
    dueAt?: number | null
  }
  const offered = (x.row?.offered ?? []) as unknown as Offer[]
  const training = x.training !== undefined ? x.training : (offered.find((o) => !o.passed) ?? offered[0] ?? null)
  return {
    key: [x.kind, x.row?.skill._id ?? training?._id ?? "item"].join("-"),
    kind: x.kind,
    row: x.row ?? null,
    training,
    offered,
    status: x.status ?? "startable",
    blockedReason: x.blockedReason ?? null,
    dueAt: x.dueAt ?? null,
  }
}

function MyLearning({ personId, engineer }: { personId: Id<"people">; engineer: boolean }) {
  const data = useQuery(api.skills.myLearning, { personId })
  const requests = useQuery(api.tryOuts.mine, { personId })
  const records = useQuery(api.attempts.listRecords, { personId, includeFailed: true })
  const [openSkill, setOpenSkill] = useState<Id<"skills"> | null>(null)
  // Who can watch a try-out: people at level 3 ("Can teach it") on the Skill.
  const matrix = useQuery(api.skills.matrix, {})
  const trainers = useMemo(() => {
    const out = new Map<string, string[]>()
    for (const p of matrix?.people ?? []) {
      if (p._id === personId) continue
      for (const { _id: skillId } of matrix?.skills ?? []) {
        const c = p.cells[skillId]
        if (!c || c.level < 3 || c.status === "expired") continue
        out.set(skillId, [...(out.get(skillId) ?? []), p.name])
      }
    }
    return out
  }, [matrix, personId])

  if (data === undefined) return <Loading />
  if (data === null) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-xs text-muted-foreground">
          The person you checked in as no longer exists. Check in again at the top right.
        </CardContent>
      </Card>
    )
  }

  const first = data.person.name.split(" ")[0]
  const held = data.skills.filter((s) => s.level >= 1 || (s.target ?? 0) > 0)
  // Blocked items never lead the list.
  const todo = data.todo.map(normalize).sort((a, b) => Number(a.status === "blocked") - Number(b.status === "blocked"))
  // One filled action on the page: Start on the first item that can start.
  const firstStartable = todo.find((t) => t.status === "startable" && t.kind !== "signoff" && t.training != null) ?? null

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
      <section className="space-y-5">
        {/* Profile progress */}
        {data.profiles.length === 0 ? (
          <Card>
            <CardContent className="p-4 text-xs text-muted-foreground">
              {engineer ? (
                <>
                  <span className="font-medium text-foreground">You have no Skill profile.</span>{" "}
                  <Link href="/learn?tab=setup" className="font-medium text-foreground underline underline-offset-2">
                    Assign one
                  </Link>{" "}
                  to see what you need for your role.
                </>
              ) : (
                <>
                  <span className="font-medium text-foreground">No Skill profile yet, {first}.</span> A Skill profile sets
                  the levels you need for your role. Ask an Engineer to assign one.
                </>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {data.profiles.map((p) => {
              const done = p.targets > 0 && p.atTarget === p.targets
              return (
                <Card key={p._id}>
                  <CardContent className="space-y-2 p-4">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">{p.name}</span>
                      {done && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      <span className="font-semibold tabular-nums text-foreground">
                        {p.atTarget} of {p.targets}
                      </span>{" "}
                      Skills at target
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn("h-full rounded-full", done ? "bg-emerald-500" : "bg-primary")}
                        style={{ width: `${p.targets ? Math.round((p.atTarget / p.targets) * 100) : 0}%` }}
                      />
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}

        {/* Next up */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <ListTodo className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold">Next up</h2>
            {todo.length > 0 && (
              <Badge variant="secondary" className="h-5 px-1.5 text-xs">
                {todo.length}
              </Badge>
            )}
          </div>
          {todo.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
                <CheckCircle2 className="h-8 w-8 text-emerald-500" />
                <p className="text-sm font-medium">
                  {data.profiles.length > 0 ? "You are at target on every Skill" : "Nothing to do right now"}
                </p>
                <p className="max-w-sm text-xs text-muted-foreground">
                  Gaps against your Skill profile, re-training after a significant change and Skills that run out soon
                  show up here.
                </p>
                <Button size="sm" variant="outline" className="mt-1" asChild>
                  <Link href="/learn?tab=trainings">Browse Trainings</Link>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="divide-y p-0">
                {todo.map((t) => (
                  <TodoRow
                    key={t.key}
                    todo={t}
                    personId={personId}
                    records={records ?? []}
                    requests={requests ?? []}
                    trainers={t.row ? (trainers.get(t.row.skill._id) ?? []) : []}
                    primary={t === firstStartable}
                    onOpen={() => t.row && setOpenSkill(t.row.skill._id)}
                  />
                ))}
              </CardContent>
            </Card>
          )}
        </div>

        {/* My Skills */}
        {held.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <BadgeCheck className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold">My Skills</h2>
              <Link
                href={`/learn/people/${data.person._id}`}
                className="ml-auto text-xs text-muted-foreground hover:text-foreground hover:underline"
              >
                Full history
              </Link>
            </div>
            <Card>
              <CardContent className="divide-y p-0">
                {held.map((s) => (
                  <button
                    key={s.skill._id}
                    type="button"
                    onClick={() => setOpenSkill(s.skill._id)}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-muted/50"
                  >
                    <LevelDots level={s.effectiveLevel} target={s.target} status={s.status as SkillStatus} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{s.skill.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        Level {levelWords(s.effectiveLevel)}
                        {s.target != null ? `, target ${s.target}` : ""}
                        {s.level > 0 && s.expiresAt != null ? ` · ${expiryText(s.expiresAt)}` : ""}
                      </span>
                    </span>
                    {s.status !== "ok" && s.status !== "none" && <StatusChip status={s.status as SkillStatus} />}
                  </button>
                ))}
              </CardContent>
            </Card>
          </div>
        )}
      </section>

      <aside className="space-y-3">
        <div className="flex items-center gap-2">
          <FileCheck2 className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">My Training records</h2>
        </div>
        {records === undefined ? (
          <Skeleton className="h-32 w-full" />
        ) : records.length === 0 ? (
          <div className="rounded-lg border p-3 text-xs text-muted-foreground">
            No records yet. Each Training you pass leaves a record here: which version, your score and when.
          </div>
        ) : (
          <Card>
            <CardContent className="divide-y p-0">
              {records.slice(0, 8).map((r) => (
                <Link
                  key={r._id}
                  href={`/learn/attempts/${r.attemptId}`}
                  className="block px-3 py-2 transition-colors hover:bg-muted/50"
                >
                  <div className="truncate text-xs font-medium">{r.trainingTitle}</div>
                  <div className="text-xs text-muted-foreground">
                    <span className="font-mono">
                      {r.trainingCode} v{r.trainingVersion}
                    </span>{" "}
                    · {fmtScore(r.score)} · {fmtDate(r.at)}
                  </div>
                  {!r.passed && <div className="text-xs font-medium text-red-700 dark:text-red-400">Not passed</div>}
                </Link>
              ))}
            </CardContent>
          </Card>
        )}
        {records && records.length > 8 && (
          <Link href={`/learn?tab=records&person=${personId}`} className="block text-xs text-muted-foreground hover:underline">
            All {records.length} records
          </Link>
        )}
        <p className="text-xs leading-relaxed text-muted-foreground">
          Passing a Training sets level 1 (Knows it). Level 2 (Can do it) needs a try-out: a trainer watches you do the
          work.
        </p>
      </aside>

      <SkillCellSheet
        personId={openSkill ? data.person._id : null}
        skillId={openSkill}
        onOpenChange={(o) => !o && setOpenSkill(null)}
      />
    </div>
  )
}

const KIND_META: Record<string, { icon: typeof RotateCcw; tone: "primary" | "warning" | "danger" }> = {
  retrain: { icon: RotateCcw, tone: "danger" },
  expired: { icon: ShieldAlert, tone: "danger" },
  train: { icon: GraduationCap, tone: "primary" },
  signoff: { icon: BadgeCheck, tone: "primary" },
  expiring: { icon: CalendarClock, tone: "warning" },
  assigned: { icon: GraduationCap, tone: "primary" },
}

function noteFor(item: Item): string {
  const { row, kind } = item
  const due = item.dueAt ? `Due ${formatDate(item.dueAt)}.` : ""
  if (!row) return ["Assigned to you.", due].filter(Boolean).join(" ")
  const base =
    kind === "retrain"
      ? row.retrainReason
        ? `Re-train needed: ${row.retrainReason}.`
        : "Re-train needed."
      : kind === "expired"
        ? `Level ${row.level} ${expiryText(row.expiresAt).toLowerCase()}. It counts as 0 now.`
        : kind === "train"
          ? `Needed: level ${levelWords(row.target ?? 1)}. Pass a Training for level 1.`
          : kind === "signoff"
            ? `Level ${row.effectiveLevel} of ${row.target}. Next: a try-out, where a trainer watches you do it.`
            : kind === "expiring"
              ? `Level ${row.level} ${expiryText(row.expiresAt).toLowerCase()}.`
              : "Assigned to you."
  return [base, due].filter(Boolean).join(" ")
}

function TodoRow({
  todo,
  personId,
  records,
  requests,
  trainers,
  primary,
  onOpen,
}: {
  todo: Item
  personId: Id<"people">
  records: RecordRow[]
  requests: TryOutRequest[]
  trainers: string[]
  primary: boolean
  onOpen: () => void
}) {
  const { row, status, blockedReason, training } = todo
  const start = useMutation(api.attempts.start)
  const requestTryOut = useMutation(api.tryOuts.request)
  const [, navigate] = useLocation()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const offeredIds = new Set<string>([...todo.offered.map((t) => t._id), ...(training ? [training._id] : [])])
  // A passed Attempt of a Training for this Skill: the try-out builds on it.
  const passedAttemptId =
    training?.passedAttemptId ?? records.find((r) => r.passed && offeredIds.has(r.trainingId))?.attemptId ?? null
  const openRequest =
    requests.find((r) => r.status === "open" && r.kind === "tryout" && offeredIds.has(r.trainingId)) ?? null
  const requested =
    training?.tryOutRequest ?? (openRequest ? { trainerName: openRequest.trainerName, since: openRequest.createdAt } : null)
  const meta = KIND_META[todo.kind] ?? KIND_META.assigned
  const Icon = meta.icon
  const blocked = status === "blocked"
  const title = row?.skill.name ?? training?.title ?? "Training"

  async function onStart() {
    if (!training) return
    setBusy(true)
    setError(null)
    try {
      const id = training.openAttemptId ?? (await start({ trainingId: training._id, personId }))
      navigate(`/learn/attempts/${id}`)
    } catch (err) {
      setError(errorText(err))
      setBusy(false)
    }
  }

  async function onRequest() {
    if (!passedAttemptId) return
    setBusy(true)
    setError(null)
    try {
      await requestTryOut({ attemptId: passedAttemptId, trainerId: null, personId })
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  let action: ReactNode
  if (blocked) {
    action = (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-400">
        <Clock className="h-3 w-3" />
        Waiting
      </span>
    )
  } else if (requested || status === "tryout_requested") {
    action = (
      <span className="shrink-0 text-right text-xs text-muted-foreground">
        <span className="block font-medium text-foreground">
          Requested {requested ? formatDate(requested.since).replace(/ \d{4}$/, "") : ""}
        </span>
        {requested?.trainerName ? `Waiting for ${requested.trainerName}` : "Waiting for a trainer"}
      </span>
    )
  } else if ((todo.kind === "signoff" || status === "waiting_tryout") && passedAttemptId) {
    action = (
      <Button size="sm" variant="outline" className="h-8 shrink-0 text-xs" disabled={busy} onClick={() => void onRequest()}>
        {busy && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
        Request try-out
      </Button>
    )
  } else if (todo.kind !== "signoff" && training) {
    action = (
      <div className="flex max-w-[45%] shrink-0 flex-col items-end gap-0.5">
        <Button
          size="sm"
          variant={primary ? "default" : "outline"}
          className="h-8 max-w-full gap-1.5 text-xs"
          disabled={busy}
          onClick={() => void onStart()}
          title={training.title}
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
          <span className="truncate">
            {training.openAttemptId ? "Continue" : training.kind === "round" ? "Start the Round" : "Start"}
          </span>
        </Button>
        <span className="max-w-full truncate text-xs text-muted-foreground">
          <span className="font-mono">{training.code}</span> {training.title}
        </span>
      </div>
    )
  } else {
    action = (
      <span className="max-w-[40%] shrink-0 text-right text-xs text-muted-foreground">
        {trainers.length > 0 ? (
          <>
            Ask <span className="font-medium text-foreground">{trainers.slice(0, 2).join(" or ")}</span> to watch you at
            the line
          </>
        ) : (
          "Ask an Engineer to watch you at the line"
        )}
      </span>
    )
  }

  return (
    <div className={cn("px-4 py-3", blocked && "bg-muted/30")} data-training-code={training?.code ?? undefined}>
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-md",
            blocked
              ? "bg-muted text-muted-foreground"
              : meta.tone === "primary"
                ? "bg-primary/10 text-primary"
                : meta.tone === "warning"
                  ? "bg-amber-500/10 text-amber-600"
                  : "bg-red-500/10 text-red-600",
          )}
        >
          <Icon className="h-4 w-4" />
        </span>
        {blocked || !row ? (
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{title}</span>
            <span className="block text-xs text-muted-foreground">
              {blocked
                ? (blockedReason ?? "This Training is being updated. You can do it once an Engineer has checked it.")
                : noteFor(todo)}
            </span>
          </span>
        ) : (
          <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
            <span className="block truncate text-sm font-medium hover:underline">{title}</span>
            <span className="block truncate text-xs text-muted-foreground">{noteFor(todo)}</span>
          </button>
        )}
        {action}
      </div>
      {error && (
        <p className="mt-2 rounded-md bg-red-50 px-2 py-1.5 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  )
}
