import { useEffect, useMemo, useState } from "react"
import { useMutation, useQuery } from "convex/react"
import type { FunctionReference } from "convex/server"
import { toast } from "sonner"
import { Check, ChevronsUpDown, Loader2, Users, X } from "lucide-react"
import { api } from "../../../../convex/_generated/api"
import type { Id } from "../../../../convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { useCheckIn } from "@/lib/checkIn"
import { formatDate } from "@/lib/time"
import { cn } from "@/lib/utils"
import { errorText } from "./lib"

const DAY = 24 * 60 * 60 * 1000

/**
 * The assignments API (convex/assignments.ts, lane training-backend). Typed
 * here so this file compiles before and after that module lands.
 */
export const assignmentsApi = (
  api as unknown as {
    assignments: {
      assign: FunctionReference<"mutation">
      listForTraining: FunctionReference<"query">
      remind: FunctionReference<"mutation">
    }
  }
).assignments

export type Catalogue = NonNullable<ReturnType<typeof useCatalogue>>
export function useCatalogue() {
  return useQuery(api.skills.catalogue, {})
}

/** yyyy-mm-dd for an <input type="date">, in local time. */
export function toDateInput(at: number): string {
  const d = new Date(at)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
/** End of that day, local time. */
export function fromDateInput(s: string): number | null {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return null
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 23, 59).getTime()
}

/**
 * Who: Skill profiles (each preselects its people) and named people. Shared by
 * AssignDialog and the People tab of the Training builder.
 */
export function AudiencePicker({
  catalogue,
  profileIds,
  personIds,
  onChange,
  excludePersonIds = [],
}: {
  catalogue: Catalogue | undefined
  profileIds: Id<"skillProfiles">[]
  personIds: Id<"people">[]
  onChange: (next: { profileIds: Id<"skillProfiles">[]; personIds: Id<"people">[] }) => void
  excludePersonIds?: Id<"people">[]
}) {
  const [open, setOpen] = useState(false)
  const people = (catalogue?.people ?? []).filter((p) => !excludePersonIds.includes(p._id))
  const byId = new Map(people.map((p) => [p._id, p]))
  const fromProfiles = useMemo(() => {
    const set = new Set<string>()
    for (const p of catalogue?.profiles ?? []) {
      if (!profileIds.includes(p._id)) continue
      for (const x of p.people) set.add(String(x._id))
    }
    return set
  }, [catalogue, profileIds])
  const toggleProfile = (id: Id<"skillProfiles">) =>
    onChange({
      profileIds: profileIds.includes(id) ? profileIds.filter((x) => x !== id) : [...profileIds, id],
      personIds,
    })
  const togglePerson = (id: Id<"people">) =>
    onChange({
      profileIds,
      personIds: personIds.includes(id) ? personIds.filter((x) => x !== id) : [...personIds, id],
    })
  const total = new Set([...fromProfiles, ...personIds.map(String)]).size

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <p className="text-sm font-medium">Skill profiles</p>
        <p className="text-xs text-muted-foreground">Everyone measured against the profile gets it.</p>
        <div className="flex flex-wrap gap-1.5">
          {(catalogue?.profiles ?? []).map((p) => {
            const on = profileIds.includes(p._id)
            return (
              <button
                key={p._id}
                type="button"
                aria-pressed={on}
                onClick={() => toggleProfile(p._id)}
                className={cn(
                  "inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors",
                  on ? "border-primary bg-primary/10 text-foreground" : "bg-background text-muted-foreground hover:border-primary/50",
                )}
              >
                {on && <Check className="h-3.5 w-3.5 text-primary" />}
                {p.name}
                <span className="text-xs text-muted-foreground">{p.people.length}</span>
              </button>
            )
          })}
          {catalogue && catalogue.profiles.length === 0 && (
            <p className="text-xs text-muted-foreground">No Skill profiles yet. Add them in Learn, Skills.</p>
          )}
        </div>
      </div>
      <div className="space-y-1.5">
        <p className="text-sm font-medium">Named people</p>
        <div className="flex flex-wrap items-center gap-1.5">
          {personIds.map((id) => (
            <span key={id} className="inline-flex min-h-8 items-center gap-1 rounded-full border bg-muted/50 px-2.5 text-sm">
              {byId.get(id)?.name ?? "Unknown person"}
              <button type="button" aria-label={`Remove ${byId.get(id)?.name ?? "person"}`} onClick={() => togglePerson(id)} className="rounded p-0.5 text-muted-foreground hover:text-foreground">
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button type="button" variant="outline" size="sm" className="gap-1.5">
                Add people <ChevronsUpDown className="h-3.5 w-3.5" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-0" align="start">
              <Command>
                <CommandInput placeholder="Search people" />
                <CommandList>
                  <CommandEmpty>Nobody found.</CommandEmpty>
                  <CommandGroup>
                    {people.map((p) => (
                      <CommandItem key={p._id} value={`${p.name} ${p.role}`} onSelect={() => togglePerson(p._id)}>
                        <Check className={cn("mr-2 h-3.5 w-3.5", personIds.includes(p._id) ? "opacity-100" : "opacity-0")} />
                        <span className="truncate">{p.name}</span>
                        <span className="ml-auto truncate pl-2 text-xs text-muted-foreground">{p.role}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>
      </div>
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Users className="h-3.5 w-3.5" />
        {total === 0 ? "Nobody chosen yet." : `${total} ${total === 1 ? "person" : "people"} in total.`}
      </p>
    </div>
  )
}

/** The people a profile and person selection adds up to. */
export function resolveAudience(
  catalogue: Catalogue | undefined,
  profileIds: Id<"skillProfiles">[],
  personIds: Id<"people">[],
): Id<"people">[] {
  const out = new Set<Id<"people">>(personIds)
  for (const p of catalogue?.profiles ?? []) {
    if (!profileIds.includes(p._id)) continue
    for (const x of p.people) out.add(x._id)
  }
  return [...out]
}

/**
 * Assign a Training to people with a due date. With no `trainingId` it shows
 * a Training picker (published Trainings only).
 */
export function AssignDialog({
  open,
  onOpenChange,
  trainingId,
  personIds: initialPeople,
  skillId,
  defaultDueAt,
  reason,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  trainingId?: Id<"trainings">
  personIds?: Id<"people">[]
  skillId?: Id<"skills">
  defaultDueAt?: number
  reason?: string
}) {
  const catalogue = useCatalogue()
  const { person } = useCheckIn()
  const assign = useMutation(assignmentsApi.assign)
  // The company's default due days (Settings, Training).
  const dueDays = useQuery(api.orgSettings.get)?.training.dueDays ?? 14
  const [pickedTraining, setPickedTraining] = useState<Id<"trainings"> | null>(trainingId ?? null)
  const [profileIds, setProfileIds] = useState<Id<"skillProfiles">[]>([])
  const [personIds, setPersonIds] = useState<Id<"people">[]>(initialPeople ?? [])
  const [due, setDue] = useState(toDateInput(defaultDueAt ?? Date.now() + dueDays * DAY))
  const [note, setNote] = useState(reason ?? "")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setPickedTraining(trainingId ?? null)
    setProfileIds([])
    setPersonIds(initialPeople ?? [])
    setDue(toDateInput(defaultDueAt ?? Date.now() + dueDays * DAY))
    setNote(reason ?? "")
    setError(null)
    // Reset only when the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const trainings = useMemo(() => {
    const all = (catalogue?.trainings ?? []).filter((t) => t.published)
    if (!skillId) return all
    const skill = catalogue?.skills.find((s) => s._id === skillId)
    const linked = new Set((skill?.trainingIds ?? []).map(String))
    return [...all].sort((a, b) => Number(linked.has(String(b._id))) - Number(linked.has(String(a._id))))
  }, [catalogue, skillId])
  const training = catalogue?.trainings.find((t) => t._id === pickedTraining)
  const people = resolveAudience(catalogue, profileIds, personIds)
  const dueAt = fromDateInput(due)

  const blocked = !person
    ? "Check in first (top right). An assignment is made in your name."
    : !pickedTraining
      ? "Choose a Training."
      : people.length === 0
        ? "Choose at least one person."
        : dueAt == null || dueAt < Date.now()
          ? "Pick a due date in the future."
          : null

  async function submit() {
    if (blocked || !person || !pickedTraining || dueAt == null) return
    setSaving(true)
    setError(null)
    try {
      await assign({ trainingId: pickedTraining, personIds: people, dueAt, reason: note.trim() || null, personId: person._id })
      toast.success(`Assigned to ${people.length} ${people.length === 1 ? "person" : "people"}, due ${formatDate(dueAt)}`)
      onOpenChange(false)
    } catch (err) {
      setError(errorText(err, "Could not assign. Try again."))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Assign {training ? training.code : "a Training"}</DialogTitle>
          <DialogDescription>
            {training ? training.title : "Choose who must do it and by when. They see it on Home and on the phone, sorted by due date."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {!trainingId && (
            <div className="space-y-1.5">
              <Label htmlFor="assign-training">Training</Label>
              <select
                id="assign-training"
                value={pickedTraining ?? ""}
                onChange={(e) => setPickedTraining((e.target.value || null) as Id<"trainings"> | null)}
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              >
                <option value="">Choose a published Training</option>
                {trainings.map((t) => (
                  <option key={t._id} value={t._id}>
                    {t.code} {t.title}
                  </option>
                ))}
              </select>
            </div>
          )}

          <AudiencePicker
            catalogue={catalogue}
            profileIds={profileIds}
            personIds={personIds}
            onChange={(n) => {
              setProfileIds(n.profileIds)
              setPersonIds(n.personIds)
            }}
          />

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="assign-due">Due</Label>
              <Input id="assign-due" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="assign-reason">Reason (optional)</Label>
              <Input id="assign-reason" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. New on line 2" />
            </div>
          </div>
        </div>

        <DialogFooter className="items-center gap-2 sm:justify-between">
          <p className={cn("text-xs", error ? "text-destructive" : "text-muted-foreground")} role={error ? "alert" : undefined}>
            {error ?? blocked ?? (dueAt ? `Due ${formatDate(dueAt)}.` : "")}
          </p>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={() => void submit()} disabled={Boolean(blocked) || saving}>
              {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Assign {people.length > 0 ? `to ${people.length}` : ""}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
