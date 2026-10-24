import { Check, LogOut, UserRound, X } from "lucide-react"
import { initials, useCheckIn, type Person } from "@/lib/checkIn"
import { cn } from "@/lib/utils"
import { useMobileShell } from "./MobileShell"

// Check-in on the floor (CONTEXT.md: Anonymous, Checked in). Anonymous is
// the default; picking your name is needed only for proof, like a Round.
// Shares the same per-browser check-in as the desktop, so the Floor
// simulator's phone and the desktop top bar always agree.

/** The "who are you" control in the mobile header and on Home. */
export function MobileCheckInButton({
  variant = "icon",
  className,
}: {
  variant?: "icon" | "pill"
  className?: string
}) {
  const { person } = useCheckIn()
  const { openCheckIn } = useMobileShell()
  const label = person ? `Checked in as ${person.name}` : "Anonymous. Check in"

  if (variant === "pill") {
    return (
      <button
        type="button"
        onClick={openCheckIn}
        aria-label={label}
        className={cn(
          "flex h-8 max-w-[170px] items-center gap-1.5 rounded-full border px-2 text-[11px] font-medium transition active:scale-95",
          person ? "border-primary/40 bg-primary/5 text-foreground" : "bg-background text-muted-foreground",
          className,
        )}
      >
        <Avatar person={person} />
        <span className="truncate">{person ? person.name : "Anonymous"}</span>
      </button>
    )
  }
  return (
    <button
      type="button"
      onClick={openCheckIn}
      aria-label={label}
      title={person ? person.name : "Anonymous"}
      className={cn(
        "flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition hover:bg-muted active:scale-95",
        className,
      )}
    >
      <Avatar person={person} large />
    </button>
  )
}

function Avatar({ person, large }: { person: Person | null; large?: boolean }) {
  const size = large ? "h-6 w-6 text-[9px]" : "h-5 w-5 text-[8px]"
  if (!person) {
    return (
      <span className={cn("flex shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground", size)}>
        <UserRound className={large ? "h-3.5 w-3.5" : "h-3 w-3"} />
      </span>
    )
  }
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-primary font-semibold text-primary-foreground",
        size,
      )}
    >
      {initials(person.name)}
    </span>
  )
}

/**
 * Bottom sheet with every person, grouped. Rendered by MobileShell inside the
 * app column, so it stays inside the phone frame in the Floor simulator.
 */
export function MobileCheckInSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { person, people, checkIn, checkOut } = useCheckIn()
  if (!open) return null
  const operators = people?.filter((p) => p.kind === "operator") ?? []
  const engineers = people?.filter((p) => p.kind === "engineer") ?? []
  const pick = (id: Person["_id"]) => {
    checkIn(id)
    onClose()
  }
  return (
    <div className="absolute inset-0 z-[70] flex flex-col justify-end" role="dialog" aria-label="Who are you?">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/40 animate-in fade-in-0"
      />
      <div className="relative flex max-h-[85%] flex-col rounded-t-2xl bg-background shadow-xl animate-in slide-in-from-bottom-8 duration-200">
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-muted-foreground/30" />
        <div className="flex items-start gap-2 border-b px-4 pb-3 pt-2">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">Who are you?</p>
            <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
              Reading, Scanning and Asking work without a name. Check in for a Round or a Training: that is proof, so it
              needs to know who you are.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-1.5 text-muted-foreground hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          <button
            type="button"
            onClick={() => {
              checkOut()
              onClose()
            }}
            className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left hover:bg-muted"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
              {person ? <LogOut className="h-4 w-4" /> : <UserRound className="h-4 w-4" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-medium">
                {person ? "Check out, continue anonymously" : "Anonymous"}
              </span>
              <span className="block text-[11px] text-muted-foreground">Read, Scan and Ask without a name</span>
            </span>
            {!person && <Check className="h-4 w-4 text-primary" />}
          </button>
          {people === undefined ? (
            <p className="px-2 py-3 text-xs text-muted-foreground">Loading people…</p>
          ) : (
            <>
              <Group label="Operators" people={operators} current={person} onPick={pick} />
              <Group label="Engineers" people={engineers} current={person} onPick={pick} />
            </>
          )}
        </div>
      </div>
    </div>
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
    <div className="pt-2">
      <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      {people.map((p) => (
        <button
          key={p._id}
          type="button"
          onClick={() => onPick(p._id)}
          className={cn(
            "flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left hover:bg-muted",
            current?._id === p._id && "bg-primary/5",
          )}
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold">
            {initials(p.name)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-medium">{p.name}</span>
            <span className="block truncate text-[11px] text-muted-foreground">{p.role}</span>
          </span>
          {current?._id === p._id && <Check className="h-4 w-4 text-primary" />}
        </button>
      ))}
    </div>
  )
}
