import { createContext, useCallback, useContext, useSyncExternalStore } from "react"
import { useQuery } from "convex/react"
import { api } from "../../convex/_generated/api"
import type { Doc, Id } from "../../convex/_generated/dataModel"

// Check-in (CONTEXT.md). Exactly two modes:
//   - "anonymous"  : the default. Reading, Scanning and Asking need no name.
//   - "checked-in" : a person picked their name. Required later for anything
//                    that produces proof (Trainings, Rounds, sign-offs).
// Stored per browser. There is no PIN or badge in the showcase.
// The phone preview is a second device: it keeps its own check-in under its
// own key, so an Engineer on desktop and an Operator on the phone can work
// side by side.

export type CheckInMode = "anonymous" | "checked-in"
export type Person = Doc<"people">

const KEY = "oppr.checkIn.personId"
export const PHONE_CHECK_IN_KEY = "oppr.checkIn.phone.personId"
const EVENT = "oppr-check-in"

const CheckInKeyContext = createContext(KEY)
/** Gives everything below it its own check-in, stored under `value`. */
export const CheckInDevice = CheckInKeyContext.Provider

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
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

function write(key: string, id: string | null) {
  try {
    if (id) window.localStorage.setItem(key, id)
    else window.localStorage.removeItem(key)
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
  const key = useContext(CheckInKeyContext)
  const storedId = useSyncExternalStore(subscribe, () => read(key), () => null)
  const people = useQuery(api.people.list)
  const person = people?.find((p) => p._id === storedId) ?? null
  const checkIn = useCallback((id: Id<"people">) => write(key, id), [key])
  const checkOut = useCallback(() => write(key, null), [key])
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
