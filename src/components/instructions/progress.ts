// Which tours a person has finished. Kept in this browser per person
// (localStorage), so it works without an account change and without storage:
// when storage is blocked, progress simply lasts until the page reloads.
import { useCallback, useSyncExternalStore } from "react"
import type { Area, Audience, Tour } from "./types"
import { visibleTours } from "./audience"

const PREFIX = "oppr.instructions.done."
const EVENT = "oppr-instructions-progress"
const memory = new Map<string, string>()

function keyFor(personId: string | null): string {
  return PREFIX + (personId ?? "anonymous")
}

function readRaw(key: string): string {
  try {
    return window.localStorage.getItem(key) ?? memory.get(key) ?? "[]"
  } catch {
    return memory.get(key) ?? "[]"
  }
}

function parse(raw: string): string[] {
  try {
    const v: unknown = JSON.parse(raw)
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []
  } catch {
    return []
  }
}

function write(key: string, ids: string[]) {
  const raw = JSON.stringify(ids)
  memory.set(key, raw)
  try {
    window.localStorage.setItem(key, raw)
  } catch {
    // Storage blocked: keep it in memory for this visit.
  }
  window.dispatchEvent(new Event(EVENT))
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange)
  window.addEventListener("storage", onChange)
  return () => {
    window.removeEventListener(EVENT, onChange)
    window.removeEventListener("storage", onChange)
  }
}

export function markTourDone(personId: string | null, tourId: string, done = true) {
  const key = keyFor(personId)
  const ids = parse(readRaw(key)).filter((id) => id !== tourId)
  write(key, done ? [...ids, tourId] : ids)
}

/** The ids of the finished tours, for the checked-in person. */
export function useDoneTours(personId: string | null): {
  done: Set<string>
  setDone: (tourId: string, done?: boolean) => void
} {
  const key = keyFor(personId)
  // The raw string is stable between reads, so the snapshot does not loop.
  const raw = useSyncExternalStore(subscribe, () => readRaw(key), () => "[]")
  const setDone = useCallback((tourId: string, d = true) => markTourDone(personId, tourId, d), [personId])
  return { done: new Set(parse(raw)), setDone }
}

export const AREA_ORDER: Area[] = ["start", "documents", "learn", "wiki", "plant", "settings", "developer"]

export const AREA_LABEL: Record<Area, string> = {
  start: "Getting started",
  documents: "Documents",
  learn: "Learn",
  wiki: "Wiki",
  plant: "Plant",
  settings: "Settings",
  developer: "Developer",
}

/** Tours in area order, then in the order they are listed. */
export function orderedTours(tours: Tour[]): Tour[] {
  return AREA_ORDER.flatMap((a) => tours.filter((t) => t.area === a))
}

/**
 * The tour to suggest after `current`: the next unfinished one in the same
 * area, else the first unfinished one in a later area, else any unfinished.
 */
export function nextTour(current: Tour | undefined, kind: Audience, done: Set<string>): Tour | undefined {
  const list = orderedTours(visibleTours(kind)).filter((t) => t.id !== current?.id && !done.has(t.id))
  if (!current) return list[0]
  const all = orderedTours(visibleTours(kind))
  const at = all.findIndex((t) => t.id === current.id)
  const after = all.slice(at + 1).filter((t) => !done.has(t.id))
  return after[0] ?? list[0]
}
