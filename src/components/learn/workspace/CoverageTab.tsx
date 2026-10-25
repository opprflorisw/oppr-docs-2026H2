import { useState } from "react"
import { useMutation, useQuery } from "convex/react"
import { toast } from "sonner"
import { Link } from "wouter"
import { AlertTriangle, ArrowDown, ArrowUp, CheckCircle2, Home as HomeIcon, Pencil, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { api } from "../../../../convex/_generated/api"
import type { Id } from "../../../../convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
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
import { errorText, useShifts, type ShiftKey } from "../skills/skillUi"
import type { Catalogue, TabProps } from "./workspaceBits"

const ANY_SHIFT = "any"

/** The questions a shift lead asks every day, shown on the Skill matrix and Home. */
export function CoverageTab({
  catalogue,
  engineerId,
  adding,
  onAddingChange: setAdding,
}: TabProps & { adding: boolean; onAddingChange: (open: boolean) => void }) {
  const shifts = useShifts()
  const questions = useQuery(api.coverageQuestions.list)
  const create = useMutation(api.coverageQuestions.create)
  const update = useMutation(api.coverageQuestions.update)
  const reorder = useMutation(api.coverageQuestions.reorder)
  const remove = useMutation(api.coverageQuestions.remove)
  const [editing, setEditing] = useState<string | null>(null)
  const [removing, setRemoving] = useState<{ _id: Id<"coverageQuestions">; label: string } | null>(null)

  async function run(fn: () => Promise<unknown>, done?: string) {
    try {
      await fn()
      if (done) toast.success(done)
      return true
    } catch (err) {
      toast.error(errorText(err))
      return false
    }
  }

  function move(index: number, dir: -1 | 1) {
    if (!questions || !engineerId) return
    const ids = questions.map((q) => q._id)
    const j = index + dir
    if (j < 0 || j >= ids.length) return
    ;[ids[index], ids[j]] = [ids[j], ids[index]]
    void run(() => reorder({ ids, engineerPersonId: engineerId }))
  }

  return (
    <section className="space-y-2" aria-label="Coverage questions">
      <p className="text-xs text-muted-foreground">
        Each question is a Skill profile and a shift. The answer is who meets every level the profile needs right now; red
        means nobody, amber means only one person. They show as buttons on the Skill matrix; the ones on Home show as
        shift cover.
      </p>
      <Card>
        <CardContent className="divide-y p-0">
          {questions === undefined ? (
            <div className="p-3">
              <Skeleton className="h-8 w-full" />
            </div>
          ) : questions.length === 0 && !adding ? (
            <p className="p-4 text-xs text-muted-foreground">
              No coverage questions yet. Add one, for example "Who can run line 2 tonight?".
            </p>
          ) : (
            questions.map((q, i) =>
              editing === q._id ? (
                <QuestionForm
                  key={q._id}
                  catalogue={catalogue}
                  initial={{ label: q.label, profileId: q.profileId, shift: q.shift, showOnHome: q.showOnHome }}
                  submitLabel="Save"
                  onCancel={() => setEditing(null)}
                  onSubmit={async (v) => {
                    if (!engineerId) return
                    const ok = await run(() =>
                      update({ id: q._id, label: v.label, profileId: v.profileId, shift: v.shift, showOnHome: v.showOnHome, engineerPersonId: engineerId }),
                    )
                    if (ok) setEditing(null)
                  }}
                />
              ) : (
                <div key={q._id} className="flex flex-wrap items-center gap-3 px-4 py-2.5" data-question={q.label}>
                  <div className="flex flex-col">
                    <Button size="icon" variant="ghost" className="h-6 w-8" aria-label={`Move ${q.label} up`} disabled={!engineerId || i === 0} onClick={() => move(i, -1)}>
                      <ArrowUp className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-8"
                      aria-label={`Move ${q.label} down`}
                      disabled={!engineerId || i === questions.length - 1}
                      onClick={() => move(i, 1)}
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <div className="min-w-[200px] flex-1">
                    <div className="text-sm font-medium">{q.label}</div>
                    <div className="text-xs text-muted-foreground">
                      {q.profileName ?? "Profile removed"} · {q.shift ? shifts.label(q.shift) : "Any shift"}
                    </div>
                  </div>
                  <Answer profileId={q.profileId} shift={q.shift} />
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Switch
                      checked={q.showOnHome}
                      disabled={!engineerId}
                      aria-label={`Show ${q.label} on Home`}
                      onCheckedChange={(on) =>
                        engineerId && void run(() => update({ id: q._id, showOnHome: on, engineerPersonId: engineerId }))
                      }
                    />
                    <HomeIcon className="h-3.5 w-3.5" />
                    On Home
                  </label>
                  <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={`Edit ${q.label}`} disabled={!engineerId} onClick={() => setEditing(q._id)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-muted-foreground hover:text-red-600"
                    aria-label={`Delete ${q.label}`}
                    disabled={!engineerId}
                    onClick={() => setRemoving({ _id: q._id, label: q.label })}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ),
            )
          )}
          {adding && (
            <QuestionForm
              catalogue={catalogue}
              initial={{ label: "", profileId: catalogue.profiles[0]?._id ?? null, shift: null, showOnHome: false }}
              submitLabel="Add question"
              onCancel={() => setAdding(false)}
              onSubmit={async (v) => {
                if (!engineerId || !v.profileId) return
                const ok = await run(
                  () => create({ label: v.label, profileId: v.profileId!, shift: v.shift, showOnHome: v.showOnHome, engineerPersonId: engineerId }),
                  "Question added",
                )
                if (ok) setAdding(false)
              }}
            />
          )}
        </CardContent>
      </Card>

      <AlertDialog open={removing !== null} onOpenChange={(o) => !o && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{removing?.label}"?</AlertDialogTitle>
            <AlertDialogDescription>
              The button goes from the Skill matrix and from Home. Skills, profiles and levels stay as they are.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 text-white hover:bg-red-700"
              onClick={() =>
                removing && engineerId && void run(() => remove({ id: removing._id, engineerPersonId: engineerId }), "Question deleted")
              }
            >
              Delete question
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}

/** Today's answer to one question, with a red, amber or green marker. */
function Answer({ profileId, shift }: { profileId: Id<"skillProfiles">; shift: ShiftKey | null }) {
  const answer = useQuery(api.skills.coverage, { profileId, shift })
  if (answer === undefined) return <Skeleton className="h-6 w-40" />
  const n = answer.count
  const names = answer.qualified.map((p) => p.name)
  const tone = n === 0 ? "red" : n === 1 ? "amber" : "green"
  const Icon = tone === "green" ? CheckCircle2 : AlertTriangle
  return (
    <Link
      href={`/learn?tab=matrix&profile=${profileId}`}
      title={names.length > 0 ? names.join(", ") : undefined}
      className={cn(
        "flex min-w-[180px] max-w-[280px] items-center gap-1.5 rounded-md border px-2 py-1 text-xs hover:underline",
        tone === "red" && "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300",
        tone === "amber" && "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300",
        tone === "green" && "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300",
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="truncate">
        {n === 0
          ? answer.requirements.length === 0
            ? "Profile needs no Skills yet"
            : "Nobody can"
          : n === 1
            ? `Only ${names[0]}`
            : `${n} people: ${names.slice(0, 2).join(", ")}${n > 2 ? ` +${n - 2}` : ""}`}
      </span>
    </Link>
  )
}

type QuestionValues = { label: string; profileId: Id<"skillProfiles"> | null; shift: ShiftKey | null; showOnHome: boolean }

function QuestionForm({
  catalogue,
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  catalogue: Catalogue
  initial: QuestionValues
  submitLabel: string
  onSubmit: (v: QuestionValues) => Promise<void>
  onCancel: () => void
}) {
  const [v, setV] = useState<QuestionValues>(initial)
  const [busy, setBusy] = useState(false)
  const shifts = useShifts()
  const profileName = catalogue.profiles.find((p) => p._id === v.profileId)?.name
  const suggestion = profileName
    ? `Who can run ${profileName.replace(/ operator$/i, "").toLowerCase()}${v.shift === "night" ? " tonight" : v.shift ? ` on the ${shifts.label(v.shift).toLowerCase()}` : ""}?`
    : ""
  const blocked = !v.profileId ? "Pick a Skill profile." : !v.label.trim() ? "Write the question." : null
  return (
    <form
      className="space-y-2 bg-muted/20 px-4 py-3"
      onSubmit={async (e) => {
        e.preventDefault()
        if (blocked) return
        setBusy(true)
        await onSubmit(v)
        setBusy(false)
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Input
          autoFocus
          value={v.label}
          onChange={(e) => setV({ ...v, label: e.target.value })}
          placeholder={suggestion || "Who can run line 2 tonight?"}
          aria-label="Question"
          className="h-9 min-w-[240px] flex-1 text-sm"
          maxLength={120}
        />
        <Select value={v.profileId ?? ""} onValueChange={(id) => setV({ ...v, profileId: id as Id<"skillProfiles"> })}>
          <SelectTrigger className="h-9 w-[200px] text-xs" aria-label="Skill profile">
            <SelectValue placeholder="Skill profile" />
          </SelectTrigger>
          <SelectContent>
            {catalogue.profiles.map((p) => (
              <SelectItem key={p._id} value={p._id} className="text-xs">
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={v.shift ?? ANY_SHIFT} onValueChange={(s) => setV({ ...v, shift: s === ANY_SHIFT ? null : s })}>
          <SelectTrigger className="h-9 w-[160px] text-xs" aria-label="Shift">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY_SHIFT} className="text-xs">
              Any shift (the next one)
            </SelectItem>
            {shifts.cover.map((m) => (
              <SelectItem key={m.key} value={m.key} className="text-xs">
                {m.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <Switch checked={v.showOnHome} onCheckedChange={(on) => setV({ ...v, showOnHome: on })} aria-label="Show on Home" />
          Show on Home as shift cover
        </label>
        {!v.label.trim() && suggestion && (
          <button type="button" className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground" onClick={() => setV({ ...v, label: suggestion })}>
            Use "{suggestion}"
          </button>
        )}
        <div className="ml-auto flex items-center gap-2">
          {blocked && <span className="text-xs text-muted-foreground">{blocked}</span>}
          <Button type="button" size="sm" variant="ghost" className="h-8 text-xs" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" size="sm" className="h-8 text-xs" disabled={!!blocked || busy}>
            {submitLabel}
          </Button>
        </div>
      </div>
    </form>
  )
}
