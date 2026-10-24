import { useMemo, useState } from "react"
import { useQuery } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import { Link } from "wouter"
import {
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  CalendarClock,
  CheckCircle2,
  FileCheck2,
  GraduationCap,
  ListTodo,
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
import { cn } from "@/lib/utils"
import { SkillCellSheet } from "./skills/SkillCellSheet"
import { expiryText, fmtDate, fmtScore, LevelDots, levelName, StatusChip, type SkillStatus } from "./skills/skillUi"

// Learn tab: for the checked-in person, their Skill profile progress, what
// to learn next (the Training to take, or the practice sign-off to ask for),
// re-training needed, Skills expiring soon, and their records.
export function MyLearningTab() {
  const { person } = useCheckIn()
  if (!person) return <CheckInPrompt />
  return <MyLearning personId={person._id} />
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
            You then see how far you are on your Skill profile, what to learn next and which Training to
            take, anything that needs re-training or runs out soon, and your Training records.
          </p>
        </div>
        <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
          Top right of the page <ArrowUpRight className="h-3 w-3" />
        </span>
      </CardContent>
    </Card>
  )
}

type Data = NonNullable<FunctionReturnType<typeof api.skills.myLearning>>
type Todo = Data["todo"][number]

function MyLearning({ personId }: { personId: Id<"people"> }) {
  const data = useQuery(api.skills.myLearning, { personId })
  const [openSkill, setOpenSkill] = useState<Id<"skills"> | null>(null)
  // Who can sign off practice: the Engineers at level 3 ("can train others").
  const matrix = useQuery(api.skills.matrix, {})
  const trainers = useMemo(() => {
    const out = new Map<string, string[]>()
    for (const p of matrix?.people ?? []) {
      if (p._id === personId || p.kind !== "engineer") continue
      for (const { _id: skillId } of matrix?.skills ?? []) {
        const c = p.cells[skillId]
        if (!c || c.level < 3 || c.status === "expired") continue
        out.set(skillId, [...(out.get(skillId) ?? []), p.name])
      }
    }
    return out
  }, [matrix, personId])

  if (data === undefined) {
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

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
      <section className="space-y-5">
        {/* Profile progress */}
        {data.profiles.length === 0 ? (
          <Card>
            <CardContent className="p-4 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">No Skill profile yet, {first}.</span> A Skill
              profile sets the levels you need for your role. An Engineer can assign one in Settings, on
              the Skills tab.
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
            {data.todo.length > 0 && (
              <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                {data.todo.length}
              </Badge>
            )}
          </div>
          {data.todo.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
                <CheckCircle2 className="h-8 w-8 text-emerald-500" />
                <p className="text-sm font-medium">
                  {data.profiles.length > 0 ? "You are at target on every Skill" : "Nothing to do right now"}
                </p>
                <p className="max-w-sm text-xs text-muted-foreground">
                  Gaps against your Skill profile, re-training after a significant change and Skills that run
                  out soon show up here.
                </p>
                <Button size="sm" variant="outline" className="mt-1" asChild>
                  <Link href="/learn?tab=trainings">Browse Trainings</Link>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="divide-y p-0">
                {data.todo.map((t) => (
                  <TodoRow
                    key={`${t.kind}-${t.row.skill._id}`}
                    todo={t}
                    trainers={trainers.get(t.row.skill._id) ?? []}
                    onOpen={() => setOpenSkill(t.row.skill._id)}
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
                    <LevelDots level={s.level} target={s.target} status={s.status as SkillStatus} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{s.skill.name}</span>
                      <span className="block truncate text-[11px] text-muted-foreground">
                        Level {s.level} · {levelName(s.level)}
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
        {data.records.length === 0 ? (
          <div className="rounded-lg border p-3 text-xs text-muted-foreground">
            No records yet. Each Training you pass leaves a record here: which version, your score and when.
          </div>
        ) : (
          <Card>
            <CardContent className="divide-y p-0">
              {data.records.slice(0, 6).map((r) => (
                <Link
                  key={r._id}
                  href={`/learn/attempts/${r.attemptId}`}
                  className="block px-3 py-2 transition-colors hover:bg-muted/50"
                >
                  <div className="truncate text-xs font-medium">{r.trainingTitle}</div>
                  <div className="text-[11px] text-muted-foreground">
                    <span className="font-mono">
                      {r.trainingCode} v{r.trainingVersion}
                    </span>{" "}
                    · {fmtScore(r.score)} · {fmtDate(r.passedAt)}
                  </div>
                </Link>
              ))}
            </CardContent>
          </Card>
        )}
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Passing a Training sets level 1. Levels 2 and 3 need an Engineer who watched you do the work.
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

function TodoRow({ todo, trainers, onOpen }: { todo: Todo; trainers: string[]; onOpen: () => void }) {
  const { row } = todo
  const training = row.offered.find((t) => !t.passed) ?? row.offered[0] ?? null
  const meta = {
    retrain: { icon: RotateCcw, tone: "danger", note: row.retrainReason ? `Re-train needed: ${row.retrainReason}` : "Re-train needed" },
    expired: { icon: ShieldAlert, tone: "danger", note: `Level ${row.level} ${expiryText(row.expiresAt).toLowerCase()}` },
    train: {
      icon: GraduationCap,
      tone: "primary",
      note: `Needed: level ${row.target}. Start with level 1 by passing a Training.`,
    },
    signoff: {
      icon: BadgeCheck,
      tone: "primary",
      note: `Level ${row.effectiveLevel} of ${row.target}. Ask an Engineer for a practice sign-off.`,
    },
    expiring: { icon: CalendarClock, tone: "warning", note: `Level ${row.level} ${expiryText(row.expiresAt).toLowerCase()}` },
  }[todo.kind]
  const Icon = meta.icon
  const wantsTraining = todo.kind !== "signoff" && training
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <span
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-md",
          meta.tone === "primary" && "bg-primary/10 text-primary",
          meta.tone === "warning" && "bg-amber-500/10 text-amber-600",
          meta.tone === "danger" && "bg-red-500/10 text-red-600",
        )}
      >
        <Icon className="h-4 w-4" />
      </span>
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
        <span className="block truncate text-sm font-medium hover:underline">{row.skill.name}</span>
        <span className="block truncate text-xs text-muted-foreground">{meta.note}</span>
      </button>
      {wantsTraining ? (
        <div className="flex max-w-[45%] shrink-0 flex-col items-end gap-0.5">
          <Button size="sm" variant="outline" className="h-7 max-w-full gap-1 text-xs" asChild>
            <Link href={`/learn/trainings/${training._id}`} title={training.title}>
              <span className="truncate">
                {training.kind === "round" ? "Walk the Round" : "Start Training"}: {training.title}
              </span>
              <ArrowRight className="h-3 w-3 shrink-0" />
            </Link>
          </Button>
          <span className="font-mono text-[10px] text-muted-foreground">{training.code}</span>
        </div>
      ) : (
        <span className="max-w-[40%] shrink-0 text-right text-[11px] text-muted-foreground">
          {trainers.length > 0 ? (
            <>
              Ask <span className="font-medium text-foreground">{trainers.slice(0, 2).join(" or ")}</span>
              <span className="block text-[10px]">
                {trainers.length > 1 ? "Engineers" : "Engineer"} at level 3 on this Skill
              </span>
            </>
          ) : (
            "Ask an Engineer"
          )}
        </span>
      )}
    </div>
  )
}
