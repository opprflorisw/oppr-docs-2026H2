import { useEffect, useRef } from "react"
import { useQuery } from "convex/react"
import { api } from "../../convex/_generated/api"

// Shared phones on the floor: a checked-in person who walks away should not
// leave their name on the device. After the check-in timeout (Settings, Floor;
// IDLE_MS until it loads) without a touch the phone warns for WARN_MS
// ("I'm still here") and then checks out.
// Also remembers the last people checked in on this phone, so the check-in
// sheet can offer them first.

export const IDLE_MS = 15 * 60 * 1000
export const WARN_MS = 10 * 1000

/** The company's check-in timeout on shared phones, in minutes (Settings, Floor). */
export function useCheckInIdleMinutes(): number {
  const org = useQuery(api.orgSettings.get)
  return org?.floor.checkInIdleMinutes ?? IDLE_MS / 60_000
}

const ACTIVITY_EVENTS = ["pointerdown", "keydown", "wheel", "touchstart", "scroll"] as const

/**
 * Watches activity inside `root` (the phone app) while `active` is true.
 * Calls onWarn after the check-in timeout (or `idleMs`) of silence, and onExpire WARN_MS after that
 * unless the person touched the phone again (which calls onResume).
 */
export function useIdleCheckOut({
  root,
  active,
  onWarn,
  onResume,
  onExpire,
  idleMs,
  warnMs = WARN_MS,
}: {
  root: HTMLElement | null
  active: boolean
  onWarn: () => void
  onResume: () => void
  onExpire: () => void
  idleMs?: number
  warnMs?: number
}) {
  const minutes = useCheckInIdleMinutes()
  const idle = idleMs ?? minutes * 60_000
  const cb = useRef({ onWarn, onResume, onExpire })
  cb.current = { onWarn, onResume, onExpire }

  useEffect(() => {
    if (!active || !root) return
    let idleTimer: number | undefined
    let expireTimer: number | undefined
    let warned = false

    const arm = () => {
      window.clearTimeout(idleTimer)
      window.clearTimeout(expireTimer)
      if (warned) {
        warned = false
        cb.current.onResume()
      }
      idleTimer = window.setTimeout(() => {
        warned = true
        cb.current.onWarn()
        expireTimer = window.setTimeout(() => {
          warned = false
          cb.current.onExpire()
        }, warnMs)
      }, idle)
    }

    arm()
    for (const e of ACTIVITY_EVENTS) root.addEventListener(e, arm, { passive: true, capture: true })
    return () => {
      window.clearTimeout(idleTimer)
      window.clearTimeout(expireTimer)
      for (const e of ACTIVITY_EVENTS) root.removeEventListener(e, arm, { capture: true })
    }
  }, [root, active, idle, warnMs])
}

// ---- Recent on this phone ----------------------------------------------------

function recentKey(deviceKey: string) {
  return `${deviceKey}.recent`
}

export function readRecentCheckIns(deviceKey: string): string[] {
  try {
    const raw = window.localStorage.getItem(recentKey(deviceKey))
    const list = raw ? (JSON.parse(raw) as unknown) : []
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === "string").slice(0, 3) : []
  } catch {
    return []
  }
}

export function rememberCheckIn(deviceKey: string, personId: string) {
  try {
    const next = [personId, ...readRecentCheckIns(deviceKey).filter((id) => id !== personId)].slice(0, 3)
    window.localStorage.setItem(recentKey(deviceKey), JSON.stringify(next))
  } catch {
    // Storage blocked: the sheet just shows everyone.
  }
}
