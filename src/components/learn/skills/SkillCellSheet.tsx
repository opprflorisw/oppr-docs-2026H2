import { useEffect, useMemo, useState, type ReactNode } from "react"
import type { FunctionReturnType } from "convex/server"
import { useMutation, useQuery } from "convex/react"
import { Link } from "wouter"
import { toast } from "sonner"
import {
  ArrowRight,
  BadgeCheck,
  Eye,
  FileCheck2,
  FileText,
  GraduationCap,
  History,
  Loader2,
  RotateCcw,
  ShieldCheck,
  UserPlus,
  UserRound,
} from "lucide-react"
import { api } from "../../../../convex/_generated/api"
import type { Id } from "../../../../convex/_generated/dataModel"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useCheckIn } from "@/lib/checkIn"
import { formatDate } from "@/lib/time"
import { cn } from "@/lib/utils"
import { phoneLocation, setPhoneMode } from "@/components/phone/phoneStore"
import { AssignDialog } from "../training/AssignDialog"
import {
  errorText,
  expiryText,
  fmtDate,
  fmtScore,
  LevelDots,
  levelWords,
  sourceText,
  StatusChip,
  type SkillStatus,
} from "./skillUi"

const MIN_SEEN = 20

// One person and one Skill: where they are, how they got there, the proof
// behind it, and the practice sign-off (levels 2 and 3) with its evidence.
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
            <SheetTitle className="sr-only">Loading the Skill</SheetTitle>
            <SheetDescription className="sr-only">The level, its history and its proof.</SheetDescription>
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
          <CellBody key={`${data.person._id}-${data.skill._id}`} data={data} />
        )}
      </SheetContent>
    </Sheet>
  )
}

type CellData = NonNullable<FunctionReturnType<typeof api.skills.cell>>

function CellBody({ data }: { data: CellData }) {
  const { person, skill, state, events, records, documents } = data
  const status = state.status as SkillStatus
  const expired = status === "expired"
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
            <div className="text-xs text-muted-foreground">{expired ? "Effective level" : "Current level"}</div>
            <div className={cn("text-sm font-semibold", expired && "text-red-700 dark:text-red-400")}>
              {expired
                ? `Effective level 0 · Expired (was ${state.level} until ${fmtDate(state.expiresAt)})`
                : levelWords(state.level)}
            </div>
          </div>
          <LevelDots level={state.effectiveLevel} target={state.target} status={status} size="lg" />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
          <Meta label="Target">{state.target != null ? levelWords(state.target) : "Not in their profile"}</Meta>
          <Meta label="Status">{status === "none" ? "Not needed" : <StatusChip status={status} />}</Meta>
          <Meta label="Achieved">{fmtDate(state.achievedAt)}</Meta>
          <Meta label="Validity">
            <span className={cn(expired && "font-medium text-red-600", status === "expiring" && "font-medium text-amber-700")}>
              {state.level > 0 ? expiryText(state.expiresAt) : skill.validityMonths ? `${skill.validityMonths} months` : "Does not expire"}
            </span>
          </Meta>
          {state.level > 0 && <Meta label="How">{sourceText(state.source, state.signedOffBy)}</Meta>}
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
                className="rounded border bg-muted/40 px-1.5 py-0.5 font-mono text-xs hover:border-primary/50"
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
                  {e.fromLevel === e.toLevel ? `Level ${e.toLevel}` : `Level ${e.fromLevel} to ${e.toLevel}`}
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
                <span className="font-mono">
                  {r.trainingCode} v{r.trainingVersion}
                </span>
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

/** Trainings for this Skill, Assign, and the open try-out to watch. */
function NextAction({ data }: { data: CellData }) {
  const { state, person, skill } = data
  const requests = useQuery(api.tryOuts.mine, { personId: person._id })
  const [assigning, setAssigning] = useState(false)
  const offered = new Set<string>(state.offered.map((t) => t._id))
  const tryOut = (requests ?? []).find((r) => r.status === "open" && r.kind === "tryout" && offered.has(r.trainingId))
  const needsTraining =
    state.status === "retrain" || state.status === "expired" || (state.target != null && state.effectiveLevel < 1)
  if (!needsTraining && !tryOut && state.offered.length === 0) return null
  const training = state.offered.find((t) => !t.passed) ?? state.offered[0] ?? null
  return (
    <Section icon={GraduationCap} title="Trainings for this Skill">
      {state.offered.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No published Training proves this Skill yet. A trainer can watch {person.name.split(" ")[0]} at the line and
          sign off below.
        </p>
      ) : (
        <div className="divide-y rounded-lg border">
          {state.offered.map((t) => (
            <Link key={t._id} href={`/learn/trainings/${t._id}`} className="flex items-center gap-2 px-3 py-2 text-xs hover:bg-muted/50">
              <span className="font-mono">{t.code}</span>
              <span className="min-w-0 flex-1 truncate">{t.title}</span>
              <span className="text-muted-foreground">{t.passed ? "Passed" : t.kind === "round" ? "Round" : "Training"}</span>
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
            </Link>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {training && (
          <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={() => setAssigning(true)}>
            <UserPlus className="h-3.5 w-3.5" />
            Assign
          </Button>
        )}
        {tryOut && (
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1.5 text-xs"
            onClick={() => {
              phoneLocation.navigate(`/m/tryout/${tryOut._id}`)
              setPhoneMode("popup")
            }}
          >
            <Eye className="h-3.5 w-3.5" />
            Watch try-out
          </Button>
        )}
      </div>
      {tryOut && (
        <p className="text-xs text-muted-foreground">
          {person.name.split(" ")[0]} asked for a try-out on {formatDate(tryOut.createdAt)}
          {tryOut.trainerName ? `, for ${tryOut.trainerName}` : ""}. The checklist opens on the phone.
        </p>
      )}
      {assigning && training && (
        <AssignDialog
          open
          onOpenChange={(o) => !o && setAssigning(false)}
          trainingId={training._id}
          personIds={[person._id]}
          skillId={skill._id}
        />
      )}
    </Section>
  )
}

type Pending = { kind: "signoff"; level: 2 | 3 } | { kind: "retrain"; level: number }

function SignOffPanel({ data }: { data: CellData }) {
  const { person, skill, state, documents } = data
  const { person: me } = useCheckIn()
  const signOff = useMutation(api.skills.signOff)
  const clearRetrain = useMutation(api.skills.clearRetrain)
  const matrix = useQuery(api.skills.matrix, {})
  const published = useQuery(api.documents.list, { publishedOnly: true })
  const assets = useQuery(api.assets.list)
  const first = person.name.split(" ")[0]
  const eff = state.effectiveLevel
  const retrain = state.status === "retrain"
  // Without a Published Training for this Skill, practice sign-off is the only route.
  const noTraining = state.offered.length === 0

  // What this sign-off would do: re-train keeps the level; else level 2, or 3 once at 2.
  const defaultPending: Pending | null = retrain
    ? { kind: "retrain", level: state.level }
    : (eff >= 1 || noTraining) && eff < 2
      ? { kind: "signoff", level: 2 }
      : eff >= 2 && eff < 3
        ? { kind: "signoff", level: 3 }
        : eff >= 3
          ? { kind: "signoff", level: 3 }
          : null
  const [pending, setPending] = useState<Pending | null>(defaultPending)

  // Evidence: what was observed (document version), where (Asset), and what was seen.
  const docOptions = useMemo(
    () =>
      documents
        .filter((d) => d.published)
        .map((d) => {
          const doc = published?.find((x) => x._id === d._id)
          return { _id: d._id, label: `${d.namingCode} v${doc?.liveVersion ?? "?"}`, title: d.title }
        }),
    [documents, published],
  )
  const [docId, setDocId] = useState<string>("")
  const [assetId, setAssetId] = useState<string>("")
  const [seen, setSeen] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (!docId && docOptions.length > 0) setDocId(docOptions[0]._id)
  }, [docId, docOptions])
  const docWithAssets = useQuery(api.documents.getWithAssets, docId ? { id: docId as Id<"documents"> } : "skip")
  const linkedAssets = docWithAssets?.assets ?? []
  useEffect(() => {
    if (!assetId && linkedAssets.length > 0) setAssetId(linkedAssets[0]._id)
  }, [assetId, linkedAssets])

  // Who may sign: never the person; an Engineer, or someone at level 3 on this Skill (level 2 only).
  const teachers = (matrix?.people ?? []).filter((p) => {
    const c = p.cells[skill._id]
    return p._id !== person._id && c && c.effectiveLevel >= 3 && c.status !== "retrain"
  })
  const myCell = matrix?.people.find((p) => p._id === me?._id)?.cells[skill._id]
  const level = pending?.level ?? 2
  const whyNot = !me
    ? `Check in to sign off ${first}'s practice. The sign-off is recorded in your name.`
    : me._id === person._id
      ? "This is your own Skill. Someone else must sign it off."
      : me.kind === "engineer"
        ? null
        : level <= 2 && (myCell?.effectiveLevel ?? 0) >= 3
          ? null
          : `Only someone at level 3 in ${skill.name} can sign this off${teachers.length ? `: ${teachers.map((t) => t.name).join(", ")}` : ""}.`

  if (eff < 1 && !retrain && !noTraining) {
    return (
      <div className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">The try-out comes after the Training.</span>{" "}
        {state.status === "expired"
          ? `${first}'s level has expired. Passing a Training for this Skill again sets level 1, then a trainer signs off the practice.`
          : `${first} needs level 1 (Knows it) first: passing a Training for this Skill sets it.`}
      </div>
    )
  }
  if (!pending) return null

  const docLabel = docOptions.find((d) => d._id === docId)?.label ?? null
  const assetRow = [...linkedAssets, ...(assets ?? [])].find((a) => a._id === assetId)
  const missing = !docLabel && docOptions.length > 0
    ? "Pick what you observed."
    : !assetRow
      ? "Pick where you watched it."
      : seen.trim().length < MIN_SEEN
        ? `Describe what you saw (${seen.trim().length} of at least ${MIN_SEEN} characters).`
        : null
  const primaryLabel =
    pending.kind === "retrain"
      ? `Confirm re-trained (level ${pending.level})`
      : `Sign off level ${pending.level} (${levelWords(pending.level).slice(2)})`

  async function confirm() {
    if (!me || !pending) return
    // Structured proof: the document version observed, where, and what was seen.
    const observed = docLabel ? published?.find((x) => x._id === docId) : undefined
    const evidence = {
      ...(observed ? { documentId: observed._id, ...(observed.liveVersion != null ? { version: observed.liveVersion } : {}) } : {}),
      ...(assetRow ? { assetId: assetRow._id } : {}),
      note: seen.trim(),
    }
    setBusy(true)
    setError(null)
    try {
      if (pending.kind === "retrain" && pending.level < 2) {
        await clearRetrain({ personId: person._id, skillId: skill._id, engineerPersonId: me._id, evidence })
        toast.success(`Re-training confirmed for ${first}`)
      } else {
        const lvl = (pending.level >= 3 ? 3 : 2) as 2 | 3
        await signOff({ personId: person._id, skillId: skill._id, level: lvl, engineerPersonId: me._id, evidence })
        toast.success(`${first} is now level ${levelWords(lvl)} on ${skill.name}`)
      }
      setSeen("")
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Section icon={ShieldCheck} title={pending.kind === "retrain" ? "Confirm re-training" : "Practice sign-off"}>
      <div className="space-y-3 rounded-lg border p-3">
        <p className="text-xs text-muted-foreground">
          {pending.kind === "retrain"
            ? `Watched ${first} do it the new way? Confirm it with what you saw.`
            : `Watched ${first} do the work? Record what you saw as proof.`}
        </p>
        <div className="space-y-1">
          <Label htmlFor="so-doc" className="text-xs">
            Observed doing
          </Label>
          {docOptions.length === 0 ? (
            <p className="text-xs text-muted-foreground">No published document is linked to this Skill.</p>
          ) : (
            <Select value={docId} onValueChange={setDocId} disabled={!!whyNot}>
              <SelectTrigger id="so-doc" className="h-9 text-xs">
                <SelectValue placeholder="Pick the document" />
              </SelectTrigger>
              <SelectContent>
                {docOptions.map((d) => (
                  <SelectItem key={d._id} value={d._id} className="text-xs">
                    <span className="font-mono">{d.label}</span> {d.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        <div className="space-y-1">
          <Label htmlFor="so-where" className="text-xs">
            Where
          </Label>
          <Select value={assetId} onValueChange={setAssetId} disabled={!!whyNot}>
            <SelectTrigger id="so-where" className="h-9 text-xs">
              <SelectValue placeholder="Pick the Asset" />
            </SelectTrigger>
            <SelectContent>
              {[...linkedAssets, ...(assets ?? []).filter((a) => !linkedAssets.some((l) => l._id === a._id))].map((a) => (
                <SelectItem key={a._id} value={a._id} className="text-xs">
                  <span className="font-mono">{a.code}</span> {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="so-seen" className="text-xs">
            What you saw
          </Label>
          <Textarea
            id="so-seen"
            value={seen}
            disabled={!!whyNot}
            onChange={(e) => setSeen(e.target.value)}
            placeholder={`For example: ${first} isolated the haul-off, tried the start button and explained why.`}
            className="min-h-[72px] text-sm"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" disabled={!!whyNot || !!missing || busy} onClick={() => void confirm()}>
            {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : pending.kind === "retrain" ? <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> : <BadgeCheck className="mr-1.5 h-3.5 w-3.5" />}
            {primaryLabel}
          </Button>
          {(pending.kind === "retrain" ? pending.level === 2 : pending.level === 2 && eff >= 2) && (
            <button type="button" className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground" onClick={() => setPending({ kind: "signoff", level: 3 })}>
              Sign off level 3 instead
            </button>
          )}
          {pending.kind === "signoff" && pending.level === 3 && eff < 3 && defaultPending?.level !== 3 && (
            <button type="button" className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground" onClick={() => setPending(defaultPending)}>
              Back to {defaultPending?.kind === "retrain" ? "re-training" : "level 2"}
            </button>
          )}
        </div>
        {(whyNot || missing) && <p className="text-xs text-muted-foreground">{whyNot ?? missing}</p>}
        {error && <p className="rounded-md bg-red-50 px-2 py-1.5 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-400">{error}</p>}
        {me && !whyNot && (
          <p className="text-xs text-muted-foreground">
            Recorded in the name of {me.name}
            {skill.validityMonths ? `, valid ${skill.validityMonths} months from today` : ""}.
          </p>
        )}
      </div>
    </Section>
  )
}

function Meta({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="truncate">{children}</div>
    </div>
  )
}

function Section({ icon: Icon, title, children }: { icon: typeof History; title: string; children: ReactNode }) {
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
