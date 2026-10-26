// Me: everything about the checked-in person on this phone. To do (every
// item, one action each), my Skills in level words with expiry and
// re-train, my Training records (opening the in-phone review), and Check out.

import { useState } from "react"
import { Link } from "wouter"
import { useQuery } from "convex/react"
import { Award, ChevronDown, ChevronRight, GraduationCap, Hourglass, ListTodo, LogOut, UserRound } from "lucide-react"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import { Skeleton } from "@/components/ui/skeleton"
import { MobileHeader } from "@/components/mobile/MobileHeader"
import { Avatar } from "@/components/mobile/MobileCheckIn"
import { FloorPrimaryButton, FloorSecondaryButton } from "@/components/mobile/MobileSheet"
import { TodoRow, attemptPath, useTodo } from "@/components/mobile/MobileTodo"
import { useMobileShell } from "@/components/mobile/MobileShell"
import { LEVEL_WORDS } from "@/components/learn/training/lib"
import { useCheckIn } from "@/lib/checkIn"
import { formatDate } from "@/lib/time"
import { cn } from "@/lib/utils"
import { useShifts } from "@/components/learn/skills/skillUi"

export function MobileMePage() {
  const { person, people, checkOut } = useCheckIn()
  const shifts = useShifts()
  const { openCheckIn } = useMobileShell()

  if (people === undefined) {
    return (
      <div className="flex flex-col">
        <MobileHeader backTo={null} title="Me" large checkIn={false} />
        <div className="flex flex-col gap-3 p-4">
          <Skeleton className="h-20 w-full rounded-2xl" />
          <Skeleton className="h-28 w-full rounded-2xl" />
        </div>
      </div>
    )
  }

  if (!person) {
    return (
      <div className="flex flex-col">
        <MobileHeader backTo={null} title="Me" large checkIn={false} />
        <div className="flex flex-col items-center gap-4 px-6 py-12 text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <UserRound className="h-8 w-8" />
          </span>
          <div>
            <p className="text-lg font-semibold">Check in to see your learning</p>
            <p className="mt-1 text-base text-muted-foreground">
              Your To do, your Skills and your Training records. Reading, Scanning and Asking work without a name.
            </p>
          </div>
          <FloorPrimaryButton onClick={openCheckIn}>Check in</FloorPrimaryButton>
        </div>
      </div>
    )
  }

  const shift = person.shift ? shifts.label(person.shift) : null

  return (
    <div className="flex flex-col">
      <MobileHeader backTo={null} title="Me" large checkIn={false} />
      <div className="flex flex-col gap-6 p-4">
        <div className="flex items-center gap-3 rounded-2xl border bg-card p-3">
          <Avatar person={person} size="lg" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-semibold leading-tight">{person.name}</p>
            <p className="text-sm leading-snug text-muted-foreground">
              {[person.role, shift && !person.role.toLowerCase().includes(shift.replace(/\s*shift$/i, "").toLowerCase()) ? shift : null].filter(Boolean).join(" · ")}
            </p>
          </div>
          <button
            type="button"
            onClick={openCheckIn}
            className="min-h-11 shrink-0 rounded-full px-3 text-sm font-semibold text-[#6E59A5]"
          >
            Not you?
          </button>
        </div>

        <TodoSection personId={person._id} />
        <SkillsSection personId={person._id} />
        <RecordsSection personId={person._id} />

        <FloorSecondaryButton onClick={checkOut}>
          <LogOut className="h-5 w-5" />
          Check out
        </FloorSecondaryButton>
      </div>
    </div>
  )
}

function Heading({ icon: Icon, children }: { icon: typeof ListTodo; children: React.ReactNode }) {
  return (
    <h2 className="flex items-center gap-1.5 px-1 text-[13px] font-semibold uppercase tracking-wide text-muted-foreground">
      <Icon className="h-4 w-4" />
      {children}
    </h2>
  )
}

function TodoSection({ personId }: { personId: Id<"people"> }) {
  const { items, loading } = useTodo(personId)
  const [showWaiting, setShowWaiting] = useState(false)
  const doable = items.filter((i) => !i.waiting)
  const waiting = items.filter((i) => i.waiting)
  return (
    <section className="flex flex-col gap-2" aria-label="To do">
      <Heading icon={ListTodo}>To do{doable.length ? ` · ${doable.length}` : ""}</Heading>
      {loading ? (
        <Skeleton className="h-28 w-full rounded-2xl" />
      ) : items.length === 0 ? (
        <p className="rounded-2xl border bg-card px-4 py-3 text-base text-muted-foreground">
          Nothing to do right now. Your Skills are up to date.
        </p>
      ) : (
        <>
          {doable.length === 0 && (
            <p className="rounded-2xl border bg-card px-4 py-3 text-base text-muted-foreground">
              Nothing you can do right now. The rest is waiting for someone else.
            </p>
          )}
          {doable.map((item, i) => (
            <TodoRow key={item.key} item={item} big={i === 0} busy={item.action?.label === "Starting"} />
          ))}
          {waiting.length > 0 && (
            <>
              <button
                type="button"
                aria-expanded={showWaiting}
                onClick={() => setShowWaiting((v) => !v)}
                className="flex min-h-12 items-center gap-2 rounded-2xl border bg-card px-4 text-left text-base font-medium"
              >
                <Hourglass className="h-5 w-5 shrink-0 text-muted-foreground" />
                <span className="flex-1">Waiting for someone ({waiting.length})</span>
                <ChevronDown className={cn("h-5 w-5 text-muted-foreground transition-transform", showWaiting && "rotate-180")} />
              </button>
              {showWaiting && waiting.map((item) => <TodoRow key={item.key} item={item} />)}
            </>
          )}
        </>
      )}
    </section>
  )
}

type SkillRow = {
  skill: { _id: string; name: string; area?: string | null }
  level: number
  effectiveLevel: number
  target: number | null
  status: string
  expiresAt: number | null
  retrainReason?: string | null
  retrainDueAt?: number | null
}

function SkillsSection({ personId }: { personId: Id<"people"> }) {
  const data = useQuery(api.skills.myLearning, { personId })
  if (data === undefined) {
    return (
      <section className="flex flex-col gap-2">
        <Heading icon={Award}>My Skills</Heading>
        <Skeleton className="h-20 w-full rounded-2xl" />
      </section>
    )
  }
  const rows = (data?.skills ?? []) as unknown as SkillRow[]
  return (
    <section className="flex flex-col gap-2" aria-label="My Skills">
      <Heading icon={Award}>My Skills</Heading>
      {rows.length === 0 ? (
        <p className="rounded-2xl border bg-card px-4 py-3 text-base text-muted-foreground">
          No Skills recorded yet. They show here after your first Training.
        </p>
      ) : (
        <div className="flex flex-col divide-y rounded-2xl border bg-card">
          {rows.map((r) => (
            <SkillLine key={r.skill._id} row={r} />
          ))}
        </div>
      )}
    </section>
  )
}

function SkillLine({ row: r }: { row: SkillRow }) {
  const level = r.effectiveLevel
  const note =
    r.status === "retrain"
      ? `Re-train needed${r.retrainDueAt ? ` by ${formatDate(r.retrainDueAt)}` : ""}`
      : r.status === "expired"
        ? `Expired${r.expiresAt ? ` on ${formatDate(r.expiresAt)}` : ""} (was level ${r.level})`
        : r.status === "expiring" && r.expiresAt
          ? `Runs out ${formatDate(r.expiresAt)}`
          : r.target != null && level < r.target
            ? `${LEVEL_WORDS[r.target]} (level ${r.target}) needed`
            : r.expiresAt
              ? `Valid until ${formatDate(r.expiresAt)}`
              : null
  const alert = r.status === "retrain" || r.status === "expired"
  return (
    <div className="flex min-h-14 items-center gap-3 px-3 py-2.5">
      <LevelDots level={level} />
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-base font-medium leading-snug">{r.skill.name}</p>
        <p className={cn("text-[13px]", alert ? "font-medium text-red-700 dark:text-red-400" : "text-muted-foreground")}>
          Level {level}: {LEVEL_WORDS[level] ?? ""}
          {note ? ` · ${note}` : ""}
        </p>
      </div>
    </div>
  )
}

function LevelDots({ level }: { level: number }) {
  return (
    <span className="flex shrink-0 gap-1" aria-hidden>
      {[1, 2, 3].map((n) => (
        <span key={n} className={cn("h-2.5 w-2.5 rounded-full", n <= level ? "bg-[#6E59A5]" : "bg-muted-foreground/20")} />
      ))}
    </span>
  )
}

function RecordsSection({ personId }: { personId: Id<"people"> }) {
  const mine = useQuery(api.attempts.listMine, { personId })
  const [all, setAll] = useState(false)
  const done = (mine ?? []).filter((a) => a.status === "passed" || a.status === "failed")
  const shown = all ? done : done.slice(0, 5)
  return (
    <section className="flex flex-col gap-2" aria-label="My records">
      <Heading icon={GraduationCap}>My records</Heading>
      {mine === undefined ? (
        <Skeleton className="h-20 w-full rounded-2xl" />
      ) : done.length === 0 ? (
        <p className="rounded-2xl border bg-card px-4 py-3 text-base text-muted-foreground">
          No finished Trainings or Rounds yet. When you pass one, your proof shows here.
        </p>
      ) : (
        <>
          <div className="flex flex-col divide-y rounded-2xl border bg-card">
            {shown.map((a) => (
              <Link
                key={a._id}
                href={attemptPath(a._id, a.kind)}
                className="flex min-h-16 items-center gap-3 px-3 py-2.5 transition active:bg-muted"
              >
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2.5 py-1 text-[13px] font-semibold",
                    a.status === "passed"
                      ? "bg-emerald-500/10 text-emerald-800 dark:text-emerald-300"
                      : "bg-muted text-slate-600 dark:text-slate-300",
                  )}
                >
                  {a.status === "passed" ? "Passed" : "Not passed"}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 block text-base font-medium leading-snug">{a.trainingTitle}</span>
                  <span className="block truncate text-[13px] text-muted-foreground">
                    <span className="font-mono">{a.trainingCode}</span>
                    {a.finishedAt ? ` · ${formatDate(a.finishedAt)}` : ""}
                    {a.score != null ? ` · ${Math.round(a.score)}%` : ""}
                  </span>
                </span>
                <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
              </Link>
            ))}
          </div>
          {done.length > 5 && (
            <button
              type="button"
              onClick={() => setAll((v) => !v)}
              className="flex min-h-11 items-center justify-center gap-1 text-sm font-semibold text-[#6E59A5]"
            >
              <ChevronDown className={cn("h-4 w-4 transition-transform", all && "rotate-180")} />
              {all ? "Show fewer" : `Show all ${done.length}`}
            </button>
          )}
        </>
      )}
    </section>
  )
}
