import { useState } from "react"
import { useMutation, useQuery } from "convex/react"
import { toast } from "sonner"
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { useCheckIn } from "@/lib/checkIn"
import { isEngineerOrAdmin } from "@/lib/roles"
import { cn } from "@/lib/utils"
import { errorText } from "@/components/learn/skills/skillUi"

type Row = {
  key: string
  name: string
  start: string
  end: string
  active: boolean
  cover: boolean
  people: number
}

// Settings, People and roles: the plant's shifts. Names and times, whether
// a shift is in use, and whether it counts for shift cover (Home and the
// Skill matrix). People and coverage questions point at a shift.
export function ShiftsSettings() {
  const rows = useQuery(api.people.shifts.list)
  const { person: me } = useCheckIn()
  const editorId = isEngineerOrAdmin(me) ? me._id : null
  const reorder = useMutation(api.people.shifts.reorder)
  const [adding, setAdding] = useState(false)

  async function move(i: number, dir: -1 | 1) {
    if (!rows || !editorId) return
    const keys = rows.map((r) => r.key)
    const j = i + dir
    ;[keys[i], keys[j]] = [keys[j], keys[i]]
    try {
      await reorder({ keys, personId: editorId })
    } catch (err) {
      toast.error(errorText(err))
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        A night shift ends the next morning. People and coverage questions point at a shift, so turn a shift off rather
        than removing it.
      </p>
      {!editorId && (
        <p className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
          Check in as an Engineer or Admin to change shifts.
        </p>
      )}
      <Card>
        <CardContent className="p-0">
          <div className="hidden grid-cols-[56px_1fr_150px_80px_80px_72px_40px] items-center gap-3 border-b px-4 py-2 text-xs font-medium text-muted-foreground md:grid">
            <span />
            <span>Name</span>
            <span>Time</span>
            <span>On</span>
            <span>Cover</span>
            <span>People</span>
            <span />
          </div>
          {rows === undefined ? (
            <p className="p-4 text-sm text-muted-foreground">Loading…</p>
          ) : (
            <div className="divide-y">
              {rows.map((r, i) => (
                <ShiftRow
                  key={`${r.key}-${r.name}-${r.start}-${r.end}`}
                  row={r}
                  editorId={editorId}
                  first={i === 0}
                  last={i === rows.length - 1}
                  onMove={(dir) => void move(i, dir)}
                />
              ))}
            </div>
          )}
          {adding && editorId ? (
            <NewShift editorId={editorId} onDone={() => setAdding(false)} />
          ) : (
            <div className="border-t px-4 py-2.5">
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                disabled={!editorId}
                onClick={() => setAdding(true)}
              >
                <Plus className="h-4 w-4" />
                Add a shift
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function ShiftRow({
  row,
  editorId,
  first,
  last,
  onMove,
}: {
  row: Row
  editorId: Id<"people"> | null
  first: boolean
  last: boolean
  onMove: (dir: -1 | 1) => void
}) {
  const update = useMutation(api.people.shifts.update)
  const remove = useMutation(api.people.shifts.remove)
  const [name, setName] = useState(row.name)
  const [start, setStart] = useState(row.start)
  const [end, setEnd] = useState(row.end)
  const off = !editorId

  async function save(patch: { name?: string; start?: string; end?: string; active?: boolean; cover?: boolean }) {
    if (!editorId) return
    try {
      await update({ key: row.key, ...patch, personId: editorId })
    } catch (err) {
      toast.error(errorText(err))
      setName(row.name)
      setStart(row.start)
      setEnd(row.end)
    }
  }

  const blurSave = (field: "name" | "start" | "end", value: string) => {
    if (value.trim() && value.trim() !== row[field]) void save({ [field]: value.trim() })
    else if (!value.trim()) ({ name: setName, start: setStart, end: setEnd })[field](row[field])
  }

  return (
    <div
      className={cn(
        "grid grid-cols-[56px_1fr] items-center gap-x-3 gap-y-2 px-4 py-2.5 md:grid-cols-[56px_1fr_150px_80px_80px_72px_40px]",
        !row.active && "bg-muted/30",
      )}
      data-shift={row.key}
    >
      <div className="flex">
        <Button size="icon" variant="ghost" className="h-7 w-7" aria-label={`Move ${row.name} up`} disabled={off || first} onClick={() => onMove(-1)}>
          <ArrowUp className="h-3.5 w-3.5" />
        </Button>
        <Button size="icon" variant="ghost" className="h-7 w-7" aria-label={`Move ${row.name} down`} disabled={off || last} onClick={() => onMove(1)}>
          <ArrowDown className="h-3.5 w-3.5" />
        </Button>
      </div>
      <Input
        value={name}
        disabled={off}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => blurSave("name", name)}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        aria-label={`Name of ${row.name}`}
        className={cn("h-8 text-sm", !row.active && "text-muted-foreground")}
        maxLength={40}
      />
      <div className="col-start-2 flex items-center gap-1 md:col-start-auto">
        <Input
          value={start}
          disabled={off}
          onChange={(e) => setStart(e.target.value)}
          onBlur={() => blurSave("start", start)}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          aria-label={`Start of ${row.name}`}
          className="h-8 w-[64px] px-2 text-center text-sm tabular-nums"
          maxLength={5}
        />
        <span className="text-muted-foreground">-</span>
        <Input
          value={end}
          disabled={off}
          onChange={(e) => setEnd(e.target.value)}
          onBlur={() => blurSave("end", end)}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          aria-label={`End of ${row.name}`}
          className="h-8 w-[64px] px-2 text-center text-sm tabular-nums"
          maxLength={5}
        />
      </div>
      <label className="col-start-2 flex items-center gap-2 text-xs text-muted-foreground md:col-start-auto">
        <Switch checked={row.active} disabled={off} onCheckedChange={(v) => void save({ active: v })} aria-label={`${row.name} is on`} />
        <span className="md:hidden">On</span>
      </label>
      <label className="col-start-2 flex items-center gap-2 text-xs text-muted-foreground md:col-start-auto">
        <Switch
          checked={row.cover}
          disabled={off || !row.active}
          onCheckedChange={(v) => void save({ cover: v })}
          aria-label={`${row.name} counts for shift cover`}
        />
        <span className="md:hidden">Counts for shift cover</span>
      </label>
      <span className="col-start-2 text-xs tabular-nums text-muted-foreground md:col-start-auto">
        {row.people} {row.people === 1 ? "person" : "people"}
      </span>
      <Button
        size="icon"
        variant="ghost"
        className="col-start-2 h-8 w-8 text-muted-foreground md:col-start-auto"
        disabled={off}
        aria-label={`Remove ${row.name}`}
        title={row.people > 0 ? "People still work this shift. Turn it off instead, or move them first." : `Remove ${row.name}`}
        onClick={async () => {
          if (!editorId) return
          try {
            await remove({ key: row.key, personId: editorId })
            toast.success(`${row.name} removed`)
          } catch (err) {
            toast.error(errorText(err))
          }
        }}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}

function NewShift({ editorId, onDone }: { editorId: Id<"people">; onDone: () => void }) {
  const create = useMutation(api.people.shifts.create)
  const [name, setName] = useState("")
  const [start, setStart] = useState("")
  const [end, setEnd] = useState("")
  const [cover, setCover] = useState(true)
  const [busy, setBusy] = useState(false)
  const blocked = !name.trim() ? "Give the shift a name." : !start.trim() || !end.trim() ? "Set when it starts and ends." : null

  return (
    <form
      className="flex flex-wrap items-center gap-2 border-t bg-muted/20 px-4 py-3"
      onSubmit={async (e) => {
        e.preventDefault()
        if (blocked) return
        setBusy(true)
        try {
          await create({ name, start, end, cover, personId: editorId })
          toast.success(`${name.trim()} added`)
          onDone()
        } catch (err) {
          toast.error(errorText(err))
        } finally {
          setBusy(false)
        }
      }}
    >
      <Input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Weekend shift"
        aria-label="Name of the new shift"
        className="h-9 min-w-[180px] flex-1 text-sm"
        maxLength={40}
      />
      <Input
        value={start}
        onChange={(e) => setStart(e.target.value)}
        placeholder="06:00"
        aria-label="Start time"
        className="h-9 w-[76px] text-center text-sm tabular-nums"
        maxLength={5}
      />
      <span className="text-muted-foreground">-</span>
      <Input
        value={end}
        onChange={(e) => setEnd(e.target.value)}
        placeholder="18:00"
        aria-label="End time"
        className="h-9 w-[76px] text-center text-sm tabular-nums"
        maxLength={5}
      />
      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        <Switch checked={cover} onCheckedChange={setCover} aria-label="Counts for shift cover" />
        Counts for shift cover
      </label>
      <div className="ml-auto flex gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onDone} disabled={busy}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={busy || !!blocked} title={blocked ?? undefined}>
          Add shift
        </Button>
      </div>
    </form>
  )
}
