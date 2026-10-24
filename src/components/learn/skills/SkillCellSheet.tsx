import { useState, type ReactNode } from "react"
import type { FunctionReturnType } from "convex/server"
import { useMutation, useQuery } from "convex/react"
import { Link } from "wouter"
import { toast } from "sonner"
import {
  ArrowRight,
  BadgeCheck,
  FileCheck2,
  FileText,
  GraduationCap,
  History,
  Loader2,
  RotateCcw,
  ShieldCheck,
  UserRound,
} from "lucide-react"
import { api } from "../../../../convex/_generated/api"
import type { Id } from "../../../../convex/_generated/dataModel"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Skeleton } from "@/components/ui/skeleton"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { useCheckIn } from "@/lib/checkIn"
import { cn } from "@/lib/utils"
import {
  errorText,
  expiryText,
  fmtDate,
  fmtScore,
  LevelDots,
  levelName,
  sourceText,
  StatusChip,
  type SkillStatus,
} from "./skillUi"

// One person and one Skill: where they are, how they got there, the proof
// behind it, and the Engineer's sign-off on practice (levels 2 and 3).
export function SkillCellSheet({
  personId,
  skillId,
  onOpenChange,
}: {
  personId: Id<"people"> | null
  skillId: Id<"skills"> | null
  onOpenChange: (open: boolean) => void
}) {
  const open = personId !== null && skillId !== null
  const data = useQuery(api.skills.cell, open ? { personId, skillId } : "skip")

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        {data === undefined ? (
          <div className="space-y-3 pt-6">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : data === null ? (
          <SheetHeader>
            <SheetTitle>Not found</SheetTitle>
            <SheetDescription>This person or Skill no longer exists.</SheetDescription>
          </SheetHeader>
        ) : (
          <CellBody data={data} />
        )}
      </SheetContent>
    </Sheet>
  )
}

type CellData = NonNullable<FunctionReturnType<typeof api.skills.cell>>

function CellBody({ data }: { data: CellData }) {
  const { person, skill, state, events, records, documents } = data
  const status = state.status as SkillStatus
  return (
    <div className="space-y-5">
      <SheetHeader className="space-y-1 pr-6 text-left">
        <SheetDescription className="flex items-center gap-1.5 text-xs">
          <UserRound className="h-3.5 w-3.5" />
          <Link href={`/learn/people/${person._id}`} className="hover:text-foreground hover:underline">
            {person.name}
          </Link>
          <span>· {person.role}</span>
        </SheetDescription>
        <SheetTitle className="text-base">{skill.name}</SheetTitle>
        {skill.description && <p className="text-xs text-muted-foreground">{skill.description}</p>}
      </SheetHeader>

      <div className="rounded-lg border p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[11px] text-muted-foreground">Current level</div>
            <div className="text-sm font-semibold">
              {state.level} · {levelName(state.level)}
            </div>
          </div>
          <LevelDots level={state.level} target={state.target} status={status} size="lg" />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
          <Meta label="Target">
            {state.target != null ? `${state.target} · ${levelName(state.target)}` : "Not in their profile"}
          </Meta>
          <Meta label="Status">
            {status === "none" ? "Not needed" : <StatusChip status={status} />}
          </Meta>
          <Meta label="Achieved">{fmtDate(state.achievedAt)}</Meta>
          <Meta label="Validity">
            <span className={cn(status === "expired" && "font-medium text-red-600", status === "expiring" && "font-medium text-amber-700")}>
              {state.level > 0 ? expiryText(state.expiresAt) : skill.validityMonths ? `${skill.validityMonths} months` : "Does not expire"}
            </span>
          </Meta>
          {state.level > 0 && <Meta label="Source">{sourceText(state.source, state.signedOffBy)}</Meta>}
        </div>
        {state.retrainReason && (
          <p className="mt-3 flex items-start gap-1.5 rounded-md bg-red-50 px-2 py-1.5 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-400">
            <RotateCcw className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Re-train needed: {state.retrainReason}.
          </p>
        )}
      </div>

      <NextAction data={data} />
      <SignOffPanel data={data} />

      {documents.length > 0 && (
        <Section icon={FileText} title="Based on">
          <div className="flex flex-wrap gap-1.5">
            {documents.map((d) => (
              <Link
                key={d._id}
                href={`/docs/${d._id}`}
                title={d.title}
                className="rounded border bg-muted/40 px-1.5 py-0.5 font-mono text-[11px] hover:border-primary/50"
              >
                {d.namingCode}
              </Link>
            ))}
          </div>
        </Section>
      )}

      <Section icon={History} title="Level history">
        {events.length === 0 ? (
          <p className="text-xs text-muted-foreground">No changes recorded yet.</p>
        ) : (
          <ol className="relative space-y-3 border-l pl-4">
            {events.map((e) => (
              <li key={e._id} className="relative">
                <span className="absolute -left-[21px] top-1 h-2 w-2 rounded-full border-2 border-background bg-primary" />
                <div className="text-xs font-medium">
                  {e.fromLevel === e.toLevel ? `Level ${e.toLevel}` : `Level ${e.fromLevel} → ${e.toLevel}`}
                  <span className="ml-1.5 font-normal text-muted-foreground">{fmtDate(e.at)}</span>
                </div>
                <div className="text-xs text-muted-foreground">{e.reason}</div>
              </li>
            ))}
          </ol>
        )}
      </Section>

      <Section icon={FileCheck2} title="Training records">
        {records.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No Training records for this Skill yet. A passed Attempt of a linked Training shows up here as proof.
          </p>
        ) : (
          <div className="divide-y rounded-lg border">
            {records.map((r) => (
              <Link
                key={r._id}
                href={`/learn/attempts/${r.attemptId}`}
                className="flex items-center gap-2 px-3 py-2 text-xs hover:bg-muted/50"
              >
                <span className="font-mono">{r.trainingCode} v{r.trainingVersion}</span>
                <span className="min-w-0 flex-1 truncate text-muted-foreground">{r.trainingTitle}</span>
                <span className="tabular-nums text-muted-foreground">{fmtScore(r.score)}</span>
                <span className="text-muted-foreground">{fmtDate(r.passedAt)}</span>
              </Link>
            ))}
          </div>
        )}
      </Section>
    </div>
  )
}

function NextAction({ data }: { data: CellData }) {
  const { state } = data
  const needsTraining =
    state.status === "retrain" || state.status === "expired" || (state.target != null && state.effectiveLevel < 1)
  if (!needsTraining) return null
  return (
    <Section icon={GraduationCap} title="Trainings for this Skill">
      {state.offered.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No published Training covers this Skill yet. An Engineer can train and sign off in practice.
        </p>
      ) : (
        <div className="divide-y rounded-lg border">
          {state.offered.map((t) => (
            <Link
              key={t._id}
              href={`/learn/trainings/${t._id}`}
              className="flex items-center gap-2 px-3 py-2 text-xs hover:bg-muted/50"
            >
              <span className="font-mono">{t.code}</span>
              <span className="min-w-0 flex-1 truncate">{t.title}</span>
              <span className="text-muted-foreground">{t.kind === "round" ? "Round" : "Training"}</span>
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
            </Link>
          ))}
        </div>
      )}
    </Section>
  )
}

type Pending = { kind: "signoff"; level: 2 | 3 } | { kind: "retrain" }

function SignOffPanel({ data }: { data: CellData }) {
  const { person, skill, state } = data
  const { person: me } = useCheckIn()
  const engineer = me?.kind === "engineer" ? me : null
  const signOff = useMutation(api.skills.signOff)
  const clearRetrain = useMutation(api.skills.clearRetrain)
  const [note, setNote] = useState("")
  const [pending, setPending] = useState<Pending | null>(null)
  const [busy, setBusy] = useState(false)
  const first = person.name.split(" ")[0]
  const eff = state.effectiveLevel
  const isSelf = engineer?._id === person._id

  // Which sign-offs make sense from here.
  // Without a Published Training for this Skill, practice sign-off is the only route.
  const noTraining = state.offered.length === 0
  const canLevel2 = (eff >= 1 || noTraining) && eff <= 2
  const canLevel3 = eff >= 2
  const retrain = state.status === "retrain"

  async function run(p: Pending) {
    if (!engineer) return
    setBusy(true)
    try {
      if (p.kind === "signoff") {
        await signOff({
          personId: person._id,
          skillId: skill._id,
          level: p.level,
          engineerPersonId: engineer._id,
          note: note.trim() || undefined,
        })
        toast.success(`${first} is now level ${p.level} on ${skill.name}`)
      } else {
        await clearRetrain({
          personId: person._id,
          skillId: skill._id,
          engineerPersonId: engineer._id,
          note: note.trim(),
        })
        toast.success(`Re-training confirmed for ${first}`)
      }
      setNote("")
    } catch (err) {
      toast.error(errorText(err))
    } finally {
      setBusy(false)
      setPending(null)
    }
  }

  function ask(p: Pending) {
    if (!engineer) {
      toast.error("Check in as an Engineer (top right) to sign this off.")
      return
    }
    if (p.kind === "retrain" && !note.trim()) {
      toast.error("Add a note saying how the change was explained.")
      return
    }
    setPending(p)
  }

  if (eff < 1 && !retrain && !noTraining) {
    return (
      <div className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">Practice sign-off comes after training.</span>{" "}
        {state.status === "expired"
          ? `${first}'s level has expired. Passing a Training for this Skill again sets level 1, then an Engineer signs off practice.`
          : `${first} needs level 1 first: passing a Training for this Skill sets it automatically.`}
      </div>
    )
  }

  return (
    <Section icon={ShieldCheck} title="Engineer sign-off">
      {!engineer ? (
        <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
          Check in as an Engineer (top right) to sign off {first}'s practice. The sign-off is recorded in
          your name as proof.
        </p>
      ) : isSelf ? (
        <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
          This is your own Skill. Another Engineer must sign it off.
        </p>
      ) : (
        <div className="space-y-2 rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">
            Watched {first} do this in practice? Sign it off as{" "}
            <span className="font-medium text-foreground">{engineer.name}</span>.
          </p>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={retrain ? "How was the change explained? (required to confirm re-training)" : "Note (optional), for example what you watched"}
            className="min-h-[60px] text-xs"
          />
          <div className="flex flex-wrap gap-2">
            {canLevel2 && (
              <Button size="sm" variant={state.target === 2 || eff === 1 ? "default" : "outline"} disabled={busy} onClick={() => ask({ kind: "signoff", level: 2 })}>
                <BadgeCheck className="mr-1.5 h-3.5 w-3.5" />
                {eff >= 2 ? "Confirm level 2" : "Sign off level 2"}
              </Button>
            )}
            {canLevel3 && (
              <Button size="sm" variant="outline" disabled={busy} onClick={() => ask({ kind: "signoff", level: 3 })}>
                <BadgeCheck className="mr-1.5 h-3.5 w-3.5" />
                {eff >= 3 ? "Confirm level 3" : "Sign off level 3"}
              </Button>
            )}
            {retrain && (
              <Button size="sm" variant="outline" disabled={busy} onClick={() => ask({ kind: "retrain" })}>
                {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="mr-1.5 h-3.5 w-3.5" />}
                Confirm re-training
              </Button>
            )}
          </div>
          {retrain && (
            <p className="text-[11px] text-muted-foreground">
              A sign-off also clears re-train needed. So does passing a Training for this Skill again.
            </p>
          )}
        </div>
      )}

      <AlertDialog open={pending !== null} onOpenChange={(o) => !o && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pending?.kind === "retrain"
                ? `Confirm ${first}'s re-training on ${skill.name}?`
                : `Sign off ${first} at level ${pending?.kind === "signoff" ? pending.level : ""} on ${skill.name}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pending?.kind === "retrain"
                ? `This clears re-train needed and keeps level ${state.level}.`
                : pending?.kind === "signoff" && pending.level === 3
                  ? `This records that ${first} can train others on this Skill.`
                  : `This records that ${first} is qualified: you watched them do the work in practice.`}{" "}
              {skill.validityMonths && pending?.kind === "signoff"
                ? `The level is valid for ${skill.validityMonths} months from today. `
                : ""}
              The sign-off is recorded in the name of {engineer?.name ?? "the checked-in Engineer"}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => pending && void run(pending)}>
              {pending?.kind === "retrain" ? "Confirm" : "Sign off"} as {engineer?.name.split(" ")[0] ?? "Engineer"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Section>
  )
}

function Meta({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="truncate">{children}</div>
    </div>
  )
}

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof History
  title: string
  children: ReactNode
}) {
  return (
    <section className="space-y-2">
      <h3 className="flex items-center gap-1.5 text-xs font-semibold">
        <Icon className="h-3.5 w-3.5 text-primary" />
        {title}
      </h3>
      {children}
    </section>
  )
}
