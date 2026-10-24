import { useMemo, useState } from "react"
import { Check, LogOut, UserRound } from "lucide-react"
import { initials, useCheckIn, type Person } from "@/lib/checkIn"
import { readRecentCheckIns, rememberCheckIn } from "@/lib/checkInIdle"
import { cn } from "@/lib/utils"
import { useMobileShell } from "./MobileShell"
import { MobileSearchInput } from "./MobileSearchInput"
import { FloorPrimaryButton, FloorSecondaryButton, MobileSheet } from "./MobileSheet"

// Check-in on the floor (CONTEXT.md: Anonymous, Checked in). Anonymous is
// the default; picking your name is needed only for proof, like a Round.
// The phone preview keeps its own check-in, like a second device.

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
  const label = person ? `Checked in as ${person.name}. Change` : "Check in"

  // Anonymous: a "Check in" chip, the same words as the desktop top bar.
  if (variant === "pill" || !person) {
    return (
      <button
        type="button"
        onClick={openCheckIn}
        aria-label={label}
        className={cn(
          "flex min-h-11 max-w-[190px] shrink-0 items-center gap-2 rounded-full border pl-1.5 pr-3 text-sm font-medium transition active:scale-95",
          person ? "border-[#6E59A5]/30 bg-[#6E59A5]/5 text-foreground" : "bg-background text-foreground",
          className,
        )}
      >
        <Avatar person={person} />
        <span className="truncate">{person ? person.name.split(" ")[0] : "Check in"}</span>
      </button>
    )
  }
  return (
    <button
      type="button"
      onClick={openCheckIn}
      aria-label={label}
      title={person.name}
      className={cn(
        "flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition hover:bg-muted active:scale-95",
        className,
      )}
    >
      <Avatar person={person} />
    </button>
  )
}

export function Avatar({ person, size = "md" }: { person: Pick<Person, "name"> | null; size?: "md" | "lg" }) {
  const box = size === "lg" ? "h-11 w-11 text-base" : "h-8 w-8 text-[13px]"
  if (!person) {
    return (
      <span className={cn("flex shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground", box)}>
        <UserRound className="h-4 w-4" />
      </span>
    )
  }
  return (
    <span className={cn("flex shrink-0 items-center justify-center rounded-full bg-[#6E59A5] font-semibold text-white", box)}>
      {initials(person.name)}
    </span>
  )
}

const SHIFT_LABEL: Record<string, string> = {
  early: "early shift",
  late: "late shift",
  night: "night shift",
  day: "day shift",
}

function shiftOf(p: Person): string | null {
  const s = (p as Person & { shift?: string | null }).shift
  return typeof s === "string" ? s : null
}

/**
 * Bottom sheet with every person: search, recent on this phone, Operators
 * by shift, then Engineers. Rendered by MobileShell inside the app column,
 * so it stays inside the phone frame.
 */
export function MobileCheckInSheet({
  reason,
  deviceKey,
  onClose,
  onPicked,
}: {
  reason?: string
  deviceKey: string
  onClose: () => void
  onPicked: (id: Person["_id"]) => void
}) {
  const { person, people, checkIn, checkOut } = useCheckIn()
  const [query, setQuery] = useState("")
  const recentIds = useMemo(() => readRecentCheckIns(deviceKey), [deviceKey])

  const q = query.trim().toLowerCase()
  const matches = (p: Person) => !q || p.name.toLowerCase().includes(q) || p.role.toLowerCase().includes(q)
  const list = (people ?? []).filter(matches)
  const recent = q ? [] : recentIds.map((id) => list.find((p) => p._id === id)).filter((p): p is Person => !!p)
  const operators = list.filter((p) => p.kind === "operator")
  const engineers = list.filter((p) => p.kind === "engineer")

  const groups: { label: string; people: Person[] }[] = []
  if (recent.length > 0) groups.push({ label: "Recent on this phone", people: recent })
  const byShift = new Map<string, Person[]>()
  for (const p of operators) {
    const key = shiftOf(p) ?? ""
    byShift.set(key, [...(byShift.get(key) ?? []), p])
  }
  for (const key of ["early", "late", "night", "day", ""]) {
    const ps = byShift.get(key)
    if (!ps?.length) continue
    groups.push({
      label: key ? `Operators, ${SHIFT_LABEL[key] ?? key}` : byShift.size > 1 ? "Other Operators" : "Operators",
      people: ps,
    })
  }
  if (engineers.length > 0) groups.push({ label: "Engineers", people: engineers })

  const pick = (id: Person["_id"]) => {
    checkIn(id)
    rememberCheckIn(deviceKey, id)
    onPicked(id)
  }

  return (
    <MobileSheet
      title={reason ?? "Who are you?"}
      description={
        reason
          ? "This is proof, so it needs to know who you are."
          : "Reading, Scanning and Asking work without a name. Check in for a Round, a Training or a Capture."
      }
      onClose={onClose}
      className="h-[88%]"
    >
      <div className="px-2 pb-1">
        <MobileSearchInput value={query} onChange={setQuery} placeholder="Find your name" />
      </div>
      {!reason && !q && (
        <button
          type="button"
          onClick={() => {
            checkOut()
            onClose()
          }}
          className="mt-2 flex min-h-14 w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-muted"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
            {person ? <LogOut className="h-5 w-5" /> : <UserRound className="h-5 w-5" />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-base font-medium">{person ? "Check out" : "Stay anonymous"}</span>
            <span className="block text-[13px] text-muted-foreground">Read, Scan and Ask without a name</span>
          </span>
          {!person && <Check className="h-5 w-5 text-[#6E59A5]" />}
        </button>
      )}
      {people === undefined ? (
        <p className="px-2 py-3 text-sm text-muted-foreground">Loading people...</p>
      ) : groups.length === 0 ? (
        <p className="px-2 py-6 text-center text-sm text-muted-foreground">Nobody called "{query}". Check the spelling.</p>
      ) : (
        groups.map((g) => <Group key={g.label} label={g.label} people={g.people} current={person} onPick={pick} />)
      )}
    </MobileSheet>
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
  return (
    <div className="pt-3">
      <p className="px-2 pb-1 text-[13px] font-semibold text-muted-foreground">{label}</p>
      {people.map((p) => (
        <button
          key={p._id}
          type="button"
          onClick={() => onPick(p._id)}
          className={cn(
            "flex min-h-14 w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-muted",
            current?._id === p._id && "bg-[#6E59A5]/5",
          )}
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold">
            {initials(p.name)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-base font-medium">{p.name}</span>
            <span className="line-clamp-2 block text-[13px] leading-snug text-muted-foreground">{p.role}</span>
          </span>
          {current?._id === p._id && <Check className="h-5 w-5 text-[#6E59A5]" />}
        </button>
      ))}
    </div>
  )
}

/** Before proof: "Walk this Round as Ahmed Yilmaz?" with "Not you?". */
export function MobileConfirmPersonSheet({
  person,
  action,
  onConfirm,
  onNotYou,
  onClose,
}: {
  person: Person
  action: string
  onConfirm: () => void
  onNotYou: () => void
  onClose: () => void
}) {
  return (
    <MobileSheet
      title={`${action} as ${person.name}?`}
      description="What you do here is recorded under this name."
      onClose={onClose}
      footer={
        <>
          <FloorPrimaryButton onClick={onConfirm}>Yes, I am {person.name.split(" ")[0]}</FloorPrimaryButton>
          <FloorSecondaryButton onClick={onNotYou}>Not you? Check in</FloorSecondaryButton>
        </>
      }
    >
      <div className="flex items-center gap-3 px-2 py-3">
        <Avatar person={person} size="lg" />
        <div className="min-w-0">
          <p className="truncate text-base font-semibold">{person.name}</p>
          <p className="line-clamp-2 text-sm leading-snug text-muted-foreground">{person.role}</p>
        </div>
      </div>
    </MobileSheet>
  )
}

/** After an Attempt, Round or Try-out: "Done, Lotte. Check out?" */
export function MobileCheckOutSheet({
  person,
  onCheckOut,
  onClose,
}: {
  person: Person
  onCheckOut: () => void
  onClose: () => void
}) {
  const first = person.name.split(" ")[0]
  return (
    <MobileSheet
      title={`Done, ${first}. Check out?`}
      description="On a shared phone, check out so the next person does not work under your name."
      onClose={onClose}
      footer={
        <>
          <FloorPrimaryButton onClick={onCheckOut}>
            <LogOut className="h-5 w-5" />
            Check out
          </FloorPrimaryButton>
          <FloorSecondaryButton onClick={onClose}>Stay checked in</FloorSecondaryButton>
        </>
      }
    />
  )
}
