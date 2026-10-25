// The running tour: which tour, which step, or the finish card. Kept in
// sessionStorage so a reload continues where the person was; it never
// outlives the browser tab.
import { useSyncExternalStore } from "react"
import type { TourStep } from "./types"

export type TourRun = {
  tourId: string
  /**
   * The id of the current step, or null for the first one. An id, not an
   * index, so checking in or out mid-tour (which changes the steps a person
   * sees) keeps the person on the same step.
   */
  stepId: string | null
  phase: "running" | "finished"
}

const KEY = "oppr.instructions.run"
let current: TourRun | null = load()
const listeners = new Set<() => void>()

function load(): TourRun | null {
  try {
    const raw = window.sessionStorage.getItem(KEY)
    if (!raw) return null
    const v = JSON.parse(raw) as Partial<TourRun>
    if (typeof v.tourId !== "string") return null
    return {
      tourId: v.tourId,
      stepId: typeof v.stepId === "string" ? v.stepId : null,
      phase: v.phase === "finished" ? "finished" : "running",
    }
  } catch {
    return null
  }
}

function set(next: TourRun | null) {
  current = next
  try {
    if (next) window.sessionStorage.setItem(KEY, JSON.stringify(next))
    else window.sessionStorage.removeItem(KEY)
  } catch {
    // Storage blocked: the tour runs, it just does not survive a reload.
  }
  listeners.forEach((l) => l())
}

function subscribe(l: () => void) {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

export function useTourRun(): TourRun | null {
  return useSyncExternalStore(subscribe, () => current, () => null)
}

/**
 * Where the run's step sits in the steps this person sees. A step that is
 * no longer visible (the person checked in or out) moves on to the next
 * visible step of the tour.
 */
export function stepIndex(all: TourStep[], visible: TourStep[], stepId: string | null): number {
  if (visible.length === 0 || !stepId) return 0
  const at = visible.findIndex((s) => s.id === stepId)
  if (at >= 0) return at
  const pos = all.findIndex((s) => s.id === stepId)
  if (pos < 0) return 0
  const after = all.slice(pos + 1).find((s) => visible.includes(s))
  return after ? visible.indexOf(after) : visible.length - 1
}

export const tourStore = {
  get: () => current,
  start(tourId: string) {
    set({ tourId, stepId: null, phase: "running" })
  },
  go(stepId: string) {
    if (current) set({ ...current, stepId, phase: "running" })
  },
  finish() {
    if (current) set({ ...current, phase: "finished" })
  },
  end() {
    set(null)
  },
}
