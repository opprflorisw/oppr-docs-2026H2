import { useCallback, useSyncExternalStore } from "react"
import { useQuery } from "convex/react"
import { api } from "../../convex/_generated/api"
import type { Doc, Id } from "../../convex/_generated/dataModel"

// Check-in (CONTEXT.md). Exactly two modes:
//   - "anonymous"  : the default. Reading, Scanning and Asking need no name.
//   - "checked-in" : a person picked their name. Required later for anything
//                    that produces proof (Trainings, Rounds, sign-offs).
// Stored per browser. There is no PIN or badge in the showcase.

export type CheckInMode = "anonymous" | "checked-in"
export type Person = Doc<"people">

const KEY = "oppr.checkIn.personId"
const EVENT = "oppr-check-in"

function read(): string | null {
  try {
    return window.localStorage.getItem(KEY)
  } catch {
    return null
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

function write(id: string | null) {
  try {
    if (id) window.localStorage.setItem(KEY, id)
    else window.localStorage.removeItem(KEY)
  } catch {
    // Storage blocked: check-in simply does not persist.
  }
  window.dispatchEvent(new Event(EVENT))
}

export function useCheckIn(): {
  mode: CheckInMode
  person: Person | null
  people: Person[] | undefined
  checkIn: (id: Id<"people">) => void
  checkOut: () => void
} {
  const storedId = useSyncExternalStore(subscribe, read, () => null)
  const people = useQuery(api.people.list)
  const person = people?.find((p) => p._id === storedId) ?? null
  const checkIn = useCallback((id: Id<"people">) => write(id), [])
  const checkOut = useCallback(() => write(null), [])
  return {
    mode: person ? "checked-in" : "anonymous",
    person,
    people,
    checkIn,
    checkOut,
  }
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter((w) => /^[A-Z]/.test(w))
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
}
