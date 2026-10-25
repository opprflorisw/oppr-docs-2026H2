import { useMemo, useState, useSyncExternalStore } from "react"
import { Check, LogOut, Search, UserRound } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Skeleton } from "@/components/ui/skeleton"
import { initials, PHONE_CHECK_IN_KEY, useCheckIn, type Person } from "@/lib/checkIn"
import { cn } from "@/lib/utils"
import { isEngineerOrAdmin } from "@/lib/roles"

// The desktop check-in key (src/lib/checkIn.ts KEY). Read here only to know
// whether a check-in is pending, never written.
const DESKTOP_CHECK_IN_KEY = "oppr.checkIn.personId"
const EVENT = "oppr-check-in"

function anyStoredCheckIn(): boolean {
  try {
    return (
      !!window.localStorage.getItem(DESKTOP_CHECK_IN_KEY) ||
      !!window.localStorage.getItem(PHONE_CHECK_IN_KEY)
    )
  } catch {
    return false
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange)
  window.addEventListener("storage", onChange)
  return () => {
    window.removeEventListener(EVENT, onChange)
    window.removeEventListener("storage", onChange)
  }
}

/**
 * True once the check-in is known. The stored person id is read
 * synchronously, but the person record arrives with the people query; until
 * then a checked-in person would look Anonymous for a moment. Check-in
 * dependent empty states ("Check in to see your learning") wait for this, so
 * a checked-in person never sees them flash.
 */
export function useCheckInReady(): boolean {
  const { people } = useCheckIn()
  const stored = useSyncExternalStore(subscribe, anyStoredCheckIn, () => false)
  return !stored || people !== undefined
}

// "Who are you?" picker. Shows the current mode at all times and lets a person
// check in by picking their name, or check out back to Anonymous.
export function CheckInChip() {
  const { mode, person, people, checkIn, checkOut } = useCheckIn()
  const ready = useCheckInReady()
  // Picking a name or checking out is the whole task: close right after,
  // so it is two clicks each way.
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState("")
  const showFilter = (people?.length ?? 0) > 8

  // Operators far outnumber Engineers, so the list shows one side at a time;
  // typing a name searches both.
  const [side, setSide] = useState<"operators" | "engineers">(() =>
    isEngineerOrAdmin(person) ? "engineers" : "operators",
  )

  const { operators, engineers, allOperators, allEngineers } = useMemo(() => {
    const q = filter.trim().toLowerCase()
    // A name matches when one of its words starts with what was typed, so a
    // single letter narrows the list instead of matching almost everyone. Roles
    // join in from the second letter ("ext" finds the extrusion operators).
    const words = (s: string) => s.toLowerCase().split(/[\s,.()/-]+/)
    const match = (p: Person) =>
      !q ||
      p.name.toLowerCase().startsWith(q) ||
      words(p.name).some((w) => w.startsWith(q)) ||
      (q.length > 1 && words(p.role ?? "").some((w) => w.startsWith(q)))
    const all = people ?? []
    const list = all.filter(match)
    return {
      operators: list.filter((p) => p.kind === "operator"),
      engineers: list.filter((p) => isEngineerOrAdmin(p)),
      allOperators: all.filter((p) => p.kind === "operator").length,
      allEngineers: all.filter((p) => isEngineerOrAdmin(p)).length,
    }
  }, [people, filter])
  const searching = filter.trim() !== ""
  const hasAdmins = (people ?? []).some((p) => p.kind === "admin")
  const engineersLabel = hasAdmins ? "Engineers and Admins" : "Engineers"

  const pick = (id: Person["_id"]) => {
    checkIn(id)
    setOpen(false)
  }

  if (!ready) {
    return <Skeleton className="h-7 w-28 rounded-full" aria-label="Loading check-in" />
  }

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) setFilter("")
        if (o) setSide(isEngineerOrAdmin(person) ? "engineers" : "operators")
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "h-7 gap-1.5 rounded-full px-2.5 text-xs",
            mode === "checked-in" && "border-primary/40 bg-primary/5",
          )}
          aria-label={person ? `Checked in as ${person.name}` : "Anonymous. Check in"}
          title={person ? undefined : "You are anonymous. Check in for Trainings, Rounds and sign-offs."}
          data-tour="start-check-in"
        >
          {person ? (
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] font-semibold text-primary-foreground">
              {initials(person.name)}
            </span>
          ) : (
            <UserRound className="h-3.5 w-3.5 text-muted-foreground" />
          )}
          {person ? person.name : "Check in"}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-0">
        <div className="border-b px-3 py-2.5">
          <p className="text-sm font-medium">Who are you?</p>
          <p className="text-xs text-muted-foreground">
            Reading and asking work without a name. Check in for anything that
            needs proof, like Trainings and sign-offs.
          </p>
        </div>
        {showFilter && (
          <div className="flex items-center gap-2 border-b px-3">
            <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
            <input
              autoFocus
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const only = [...operators, ...engineers]
                  if (only.length === 1) pick(only[0]._id)
                }
              }}
              placeholder="Type a name"
              aria-label="Filter people"
              className="h-9 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
        )}
        {!searching && allOperators > 0 && allEngineers > 0 && (
          <div role="group" aria-label="Show" className="flex gap-1 border-b p-1.5">
            {(
              [
                ["operators", "Operators", allOperators],
                ["engineers", "Engineers", allEngineers],
              ] as const
            ).map(([key, label, count]) => (
              <button
                key={key}
                type="button"
                aria-pressed={side === key}
                title={key === "engineers" ? engineersLabel : undefined}
                onClick={() => setSide(key)}
                className={cn(
                  "flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors",
                  side === key ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                )}
              >
                {label}
                <span className="tabular-nums text-muted-foreground">{count}</span>
              </button>
            ))}
          </div>
        )}
        <div className="max-h-80 overflow-y-auto p-1">
          {people === undefined ? (
            <div className="space-y-2 p-2">
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-full" />
            </div>
          ) : people.length === 0 ? (
            <p className="px-2 py-3 text-xs text-muted-foreground">
              No people yet. Add them in Settings, People.
            </p>
          ) : operators.length + engineers.length === 0 ? (
            <p className="px-2 py-3 text-xs text-muted-foreground">
              Nobody matches "{filter}".
            </p>
          ) : (
            <>
              {(searching || side === "operators") && (
                <Group label={searching ? "Operators" : undefined} people={operators} current={person} onPick={pick} />
              )}
              {(searching || side === "engineers") && (
                <Group label={searching ? engineersLabel : undefined} people={engineers} current={person} onPick={pick} />
              )}
            </>
          )}
        </div>
        {person && (
          <div className="border-t p-1">
            <button
              type="button"
              onClick={() => {
                checkOut()
                setOpen(false)
              }}
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <LogOut className="h-3.5 w-3.5" />
              Check out, continue anonymously
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}

function Group({
  label,
  people,
  current,
  onPick,
}: {
  label?: string
  people: Person[]
  current: Person | null
  onPick: (id: Person["_id"]) => void
}) {
  if (people.length === 0) return null
  return (
    <div className="py-1">
      {label && <p className="px-2 pb-1 text-xs font-semibold text-muted-foreground">{label}</p>}
      {people.map((p) => (
        <button
          key={p._id}
          type="button"
          onClick={() => onPick(p._id)}
          className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left hover:bg-muted"
        >
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold">
            {initials(p.name)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{p.name}</span>
            <span className="block truncate text-xs text-muted-foreground">{p.role}</span>
          </span>
          {current?._id === p._id && <Check className="h-3.5 w-3.5 text-primary" />}
        </button>
      ))}
    </div>
  )
}
