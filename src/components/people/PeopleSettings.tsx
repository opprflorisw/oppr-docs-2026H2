import { useMemo, useState, type ReactNode } from "react"
import { useMutation, useQuery } from "convex/react"
import { toast } from "sonner"
import { Archive, ArchiveRestore, Pencil, Plus, Search, ShieldCheck } from "lucide-react"
import { api } from "../../../convex/_generated/api"
import type { Doc, Id } from "../../../convex/_generated/dataModel"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { initials, useCheckIn } from "@/lib/checkIn"
import { isAdmin, isEngineerOrAdmin, KIND_LABEL } from "@/lib/roles"
import { cn } from "@/lib/utils"
import { errorText, useShifts } from "@/components/learn/skills/skillUi"

type Person = Doc<"people">
type Kind = Person["kind"]
const NONE = "none"
const KINDS: Kind[] = ["operator", "engineer", "admin"]

const KIND_HINT: Record<Kind, string> = {
  operator: "Reads, Scans, Asks and does Trainings.",
  engineer: "Authors, reviews and approves Knowledge.",
  admin: "An Engineer who also looks after Settings.",
}

// Settings, People and roles: the people someone can check in as. They are
// not login accounts. An Engineer or Admin adds, edits and archives them;
// archived people keep their records but drop out of every picker.
export function PeopleSettings() {
  const people = useQuery(api.people.listAll)
  const { person: me } = useCheckIn()
  const editor = isEngineerOrAdmin(me) ? me : null
  const [query, setQuery] = useState("")
  const [kind, setKind] = useState<Kind | "all">("all")
  const [showArchived, setShowArchived] = useState(false)
  const [editing, setEditing] = useState<Person | "new" | null>(null)

  const archivedCount = people?.filter((p) => p.archived).length ?? 0
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (people ?? []).filter(
      (p) =>
        (showArchived || !p.archived) &&
        (kind === "all" || p.kind === kind) &&
        (!q || [p.name, p.role, p.area ?? "", p.team ?? "", p.email ?? ""].some((x) => x.toLowerCase().includes(q))),
    )
  }, [people, query, kind, showArchived])

  const counts = useMemo(() => {
    const active = (people ?? []).filter((p) => !p.archived)
    return {
      all: active.length,
      operator: active.filter((p) => p.kind === "operator").length,
      engineer: active.filter((p) => p.kind === "engineer").length,
      admin: active.filter((p) => p.kind === "admin").length,
    }
  }, [people])

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        They are not login accounts. An Admin passes every Engineer check. Archived people keep their records but can no
        longer check in.
      </p>
      {!editor && (
        <p className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
          Check in as an Engineer or Admin to add or change people.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a person, role, area or team"
            aria-label="Find a person"
            className="h-9 pl-8 text-sm"
          />
        </div>
        <ToggleGroup
          type="single"
          value={kind}
          onValueChange={(v) => setKind((v || "all") as Kind | "all")}
          className="rounded-md border p-0.5"
          aria-label="Kind"
          data-tour="settings-people-kinds"
        >
          <ToggleGroupItem value="all" className="h-8 px-2.5 text-xs">
            All {counts.all}
          </ToggleGroupItem>
          {KINDS.map((k) => (
            <ToggleGroupItem key={k} value={k} className="h-8 px-2.5 text-xs">
              {KIND_LABEL[k]}s {counts[k]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <Button size="sm" className="h-9 gap-1.5" disabled={!editor} onClick={() => setEditing("new")} data-tour="settings-people-add">
          <Plus className="h-4 w-4" />
          Add person
        </Button>
      </div>

      <Card data-tour="settings-people-list">
        <CardContent className="divide-y p-0">
          {people === undefined ? (
            <p className="p-4 text-sm text-muted-foreground">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">
              {people.length === 0 ? "Nobody yet. Add the first person." : "Nobody matches. Try another word or kind."}
            </p>
          ) : (
            rows.map((p) => (
              <PersonRow key={p._id} person={p} editor={editor} me={me?._id ?? null} onEdit={() => setEditing(p)} />
            ))
          )}
        </CardContent>
      </Card>

      {archivedCount > 0 && (
        <label className="flex w-fit items-center gap-2 text-sm text-muted-foreground">
          <Switch checked={showArchived} onCheckedChange={setShowArchived} aria-label="Show archived people" />
          Show archived people ({archivedCount})
        </label>
      )}

      {editing && editor && (
        <PersonDialog
          person={editing === "new" ? null : editing}
          editor={editor}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}

function PersonRow({
  person,
  editor,
  me,
  onEdit,
}: {
  person: Person
  editor: Person | null
  me: Id<"people"> | null
  onEdit: () => void
}) {
  const shifts = useShifts()
  const update = useMutation(api.people.update)
  const setArchived = useMutation(api.people.setArchived)
  const canChange = !!editor && (person.kind !== "admin" || isAdmin(editor))
  const shiftMeta = shifts.meta(person.shift)
  const fromRole = !person.shift ? shifts.normalize(person.role) : null

  async function run(fn: () => Promise<unknown>, done?: string) {
    try {
      await fn()
      if (done) toast.success(done)
    } catch (err) {
      toast.error(errorText(err))
    }
  }

  return (
    <div
      className={cn("flex flex-wrap items-center gap-3 px-4 py-2.5", person.archived && "bg-muted/30")}
      data-person={person.name}
    >
      <span
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
          person.archived ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary",
        )}
      >
        {initials(person.name)}
      </span>
      <div className="min-w-[180px] flex-1">
        <div className="flex items-center gap-2 text-sm font-medium">
          <span className={cn(person.archived && "text-muted-foreground")}>{person.name}</span>
          {person._id === me && <span className="text-xs font-normal text-muted-foreground">(you)</span>}
          {person.archived && (
            <Badge variant="outline" className="text-xs font-normal">
              Archived
            </Badge>
          )}
        </div>
        <div className="text-xs text-muted-foreground">
          {[person.role, person.area, person.team, person.email].filter(Boolean).join(" · ")}
        </div>
      </div>
      {!person.archived && (
        <Select
          value={person.shift ?? NONE}
          disabled={!canChange}
          onValueChange={(v) =>
            void run(() => update({ id: person._id, shift: v === NONE ? null : v, personId: editor!._id }))
          }
        >
          <SelectTrigger className="h-8 w-[180px] text-xs" aria-label={`Shift of ${person.name}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE} className="text-xs">
              {fromRole ? `From role: ${shifts.meta(fromRole)?.short ?? fromRole}` : "No shift"}
            </SelectItem>
            {shifts.all
              .filter((s) => s.active || s.key === person.shift)
              .map((s) => (
                <SelectItem key={s.key} value={s.key} className="text-xs">
                  {s.label} ({s.hours}){!s.active && ", off"}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      )}
      {person.archived && shiftMeta && <span className="w-[180px] text-xs text-muted-foreground">{shiftMeta.label}</span>}
      <Badge
        variant={person.kind === "operator" ? "secondary" : "default"}
        className={cn(
          "w-[84px] justify-center gap-1",
          person.kind === "admin" && "bg-foreground text-background hover:bg-foreground",
        )}
      >
        {person.kind === "admin" && <ShieldCheck className="h-3 w-3" />}
        {KIND_LABEL[person.kind]}
      </Badge>
      {person.archived ? (
        <Button
          size="sm"
          variant="outline"
          className="h-8 gap-1.5"
          disabled={!canChange}
          onClick={() =>
            void run(
              () => setArchived({ id: person._id, archived: false, personId: editor!._id }),
              `${person.name} can check in again`,
            )
          }
        >
          <ArchiveRestore className="h-3.5 w-3.5" />
          Bring back
        </Button>
      ) : (
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8"
          disabled={!canChange}
          aria-label={`Edit ${person.name}`}
          title={canChange ? `Edit ${person.name}` : editor ? "Only an Admin can change an Admin." : undefined}
          onClick={onEdit}
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  )
}

type Draft = {
  name: string
  kind: Kind
  role: string
  area: string
  shift: string
  team: string
  email: string
}

function PersonDialog({ person, editor, onClose }: { person: Person | null; editor: Person; onClose: () => void }) {
  const create = useMutation(api.people.create)
  const update = useMutation(api.people.update)
  const setArchived = useMutation(api.people.setArchived)
  const vocabulary = useQuery(api.naming.listVocabulary)
  const shifts = useShifts()
  const [d, setD] = useState<Draft>({
    name: person?.name ?? "",
    kind: person?.kind ?? "operator",
    role: person?.role ?? "",
    area: person?.area ?? NONE,
    shift: person?.shift ?? NONE,
    team: person?.team ?? "",
    email: person?.email ?? "",
  })
  const [busy, setBusy] = useState(false)
  const self = person?._id === editor._id
  const adminEditor = isAdmin(editor)

  const areas = useMemo(() => {
    const list = (vocabulary?.locations ?? []).map((l) => ({ code: l.code, label: l.label }))
    if (d.area !== NONE && !list.some((l) => l.code === d.area)) list.push({ code: d.area, label: d.area })
    return list
  }, [vocabulary, d.area])

  const blocked = !d.name.trim() ? "Write the person's name." : null

  async function save() {
    if (blocked) return
    setBusy(true)
    const fields = {
      name: d.name,
      kind: d.kind,
      role: d.role,
      area: d.area === NONE ? null : d.area,
      shift: d.shift === NONE ? null : d.shift,
      team: d.team || null,
      email: d.email || null,
      personId: editor._id,
    }
    try {
      if (person) {
        await update({ id: person._id, ...fields, kind: self ? undefined : fields.kind })
        toast.success(`${d.name.trim()} saved`)
      } else {
        await create(fields)
        toast.success(`${d.name.trim()} added. They can check in now.`)
      }
      onClose()
    } catch (err) {
      toast.error(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  async function archive() {
    if (!person) return
    setBusy(true)
    try {
      await setArchived({ id: person._id, archived: true, personId: editor._id })
      toast.success(`${person.name} is archived. Their records stay.`)
      onClose()
    } catch (err) {
      toast.error(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{person ? `Edit ${person.name}` : "Add a person"}</DialogTitle>
          <DialogDescription>
            {person ? "Changes show everywhere this person appears." : "They can check in as soon as you add them."}
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            void save()
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name" htmlFor="person-name">
              <Input
                id="person-name"
                autoFocus
                value={d.name}
                onChange={(e) => setD({ ...d, name: e.target.value })}
                placeholder="Lotte Smit"
                maxLength={60}
              />
            </Field>
            <Field label="Role" htmlFor="person-role">
              <Input
                id="person-role"
                value={d.role}
                onChange={(e) => setD({ ...d, role: e.target.value })}
                placeholder="Line operator"
                maxLength={80}
              />
            </Field>
          </div>

          <fieldset className="space-y-1.5">
            <legend className="text-sm font-medium">Kind</legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {KINDS.map((k) => {
                const locked = self || (k === "admin" && !adminEditor) || (person?.kind === "admin" && !adminEditor)
                return (
                  <button
                    key={k}
                    type="button"
                    disabled={locked && d.kind !== k}
                    onClick={() => setD({ ...d, kind: k })}
                    aria-pressed={d.kind === k}
                    className={cn(
                      "rounded-md border px-3 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                      d.kind === k ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-muted/50",
                    )}
                  >
                    <span className="flex items-center gap-1 text-sm font-medium">
                      {k === "admin" && <ShieldCheck className="h-3.5 w-3.5" />}
                      {KIND_LABEL[k]}
                    </span>
                    <span className="block text-xs text-muted-foreground">{KIND_HINT[k]}</span>
                  </button>
                )
              })}
            </div>
            {self && <p className="text-xs text-muted-foreground">You cannot change your own kind.</p>}
            {!self && !adminEditor && <p className="text-xs text-muted-foreground">Only an Admin makes someone an Admin.</p>}
          </fieldset>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Area" htmlFor="person-area">
              <Select value={d.area} onValueChange={(v) => setD({ ...d, area: v })}>
                <SelectTrigger id="person-area">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>No area</SelectItem>
                  {areas.map((a) => (
                    <SelectItem key={a.code} value={a.code}>
                      {a.code} · {a.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Shift" htmlFor="person-shift">
              <Select value={d.shift} onValueChange={(v) => setD({ ...d, shift: v })}>
                <SelectTrigger id="person-shift">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>No shift</SelectItem>
                  {shifts.all
                    .filter((s) => s.active || s.key === d.shift)
                    .map((s) => (
                      <SelectItem key={s.key} value={s.key}>
                        {s.label} ({s.hours})
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Team" htmlFor="person-team" hint="Optional">
              <Input
                id="person-team"
                value={d.team}
                onChange={(e) => setD({ ...d, team: e.target.value })}
                placeholder="EXT late"
                maxLength={60}
              />
            </Field>
            <Field label="Email" htmlFor="person-email" hint="Optional">
              <Input
                id="person-email"
                type="email"
                value={d.email}
                onChange={(e) => setD({ ...d, email: e.target.value })}
                placeholder="name@company.com"
                maxLength={120}
              />
            </Field>
          </div>

          <DialogFooter className="items-center gap-2 sm:justify-between">
            {person && !self ? (
              <Button type="button" variant="ghost" className="gap-1.5 text-muted-foreground" disabled={busy} onClick={() => void archive()}>
                <Archive className="h-4 w-4" />
                Archive
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy || !!blocked} title={blocked ?? undefined}>
                {person ? "Save" : "Add person"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string
  htmlFor: string
  hint?: string
  children: ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor} className="flex items-baseline gap-1.5">
        {label}
        {hint && <span className="text-xs font-normal text-muted-foreground">{hint}</span>}
      </Label>
      {children}
    </div>
  )
}
