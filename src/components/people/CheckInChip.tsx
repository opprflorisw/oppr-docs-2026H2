import { useState } from "react"
import { Check, LogOut, UserRound } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { initials, useCheckIn, type Person } from "@/lib/checkIn"
import { cn } from "@/lib/utils"

// "Who are you?" picker. Shows the current mode at all times and lets a person
// check in by picking their name, or check out back to Anonymous.
export function CheckInChip() {
  const { mode, person, people, checkIn, checkOut } = useCheckIn()
  const operators = people?.filter((p) => p.kind === "operator") ?? []
  const engineers = people?.filter((p) => p.kind === "engineer") ?? []
  // Picking a name or checking out is the whole task: close right after,
  // so it is two clicks each way.
  const [open, setOpen] = useState(false)
  const pick = (id: Person["_id"]) => {
    checkIn(id)
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "h-7 gap-1.5 rounded-full px-2.5 text-xs",
            mode === "checked-in" && "border-primary/40 bg-primary/5",
          )}
          aria-label={person ? `Checked in as ${person.name}` : "Anonymous. Check in"}
        >
          {person ? (
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[8px] font-semibold text-primary-foreground">
              {initials(person.name)}
            </span>
          ) : (
            <UserRound className="h-3.5 w-3.5 text-muted-foreground" />
          )}
          {person ? person.name : "Anonymous"}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-0">
        <div className="border-b px-3 py-2.5">
          <p className="text-sm font-medium">Who are you?</p>
          <p className="text-[11px] text-muted-foreground">
            Reading and asking work without a name. Check in for anything that
            needs proof, like trainings and sign-offs.
          </p>
        </div>
        <div className="max-h-80 overflow-y-auto p-1">
          {people === undefined ? (
            <p className="px-2 py-3 text-xs text-muted-foreground">Loading…</p>
          ) : people.length === 0 ? (
            <p className="px-2 py-3 text-xs text-muted-foreground">
              No people yet. See Settings, People.
            </p>
          ) : (
            <>
              <Group label="Operators" people={operators} current={person} onPick={pick} />
              <Group label="Engineers" people={engineers} current={person} onPick={pick} />
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
  label: string
  people: Person[]
  current: Person | null
  onPick: (id: Person["_id"]) => void
}) {
  if (people.length === 0) return null
  return (
    <div className="py-1">
      <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
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
            <span className="block truncate text-xs font-medium">{p.name}</span>
            <span className="block truncate text-[11px] text-muted-foreground">{p.role}</span>
          </span>
          {current?._id === p._id && <Check className="h-3.5 w-3.5 text-primary" />}
        </button>
      ))}
    </div>
  )
}
