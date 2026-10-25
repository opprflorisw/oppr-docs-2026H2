import { useSyncExternalStore } from "react"

// The plant's names for Skill levels 0-3 (Settings, People and roles). One
// live array: useCheckIn keeps it in step with the server, so every label
// that reads LEVEL_NAMES or levelName() shows the plant's own words.

export const DEFAULT_LEVEL_NAMES = ["Not trained", "Knows it", "Can do it", "Can teach it"] as const

/** Mutated in place when the names change; index = level. */
export const LEVEL_NAMES: string[] = [...DEFAULT_LEVEL_NAMES]

let version = 0
const listeners = new Set<() => void>()

/** Idempotent: safe to call during render with the latest server names. */
export function applyLevelNames(names: readonly string[] | undefined) {
  if (!names || names.length !== 4) return
  if (names.every((n, i) => n === LEVEL_NAMES[i])) return
  LEVEL_NAMES.splice(0, 4, ...names)
  version++
  queueMicrotask(() => listeners.forEach((l) => l()))
}

function subscribe(l: () => void) {
  listeners.add(l)
  return () => listeners.delete(l)
}

/** Re-renders the caller when the names change; returns them, level 0 first. */
export function useLevelNames(): readonly string[] {
  useSyncExternalStore(subscribe, () => version, () => version)
  return LEVEL_NAMES
}
