import { useEffect, useState } from "react"
import { useQuery } from "convex/react"
import { api } from "../../../convex/_generated/api"
import { useCheckIn } from "@/lib/checkIn"

/** The checked-in person's recording Capture, or null. */
export function useActiveCapture() {
  const { person } = useCheckIn()
  const active = useQuery(api.captures.captures.active, person ? { personId: person._id } : "skip")
  return { person, active: person ? active : null, loading: !!person && active === undefined }
}

/** Ticks once a second while `on`. */
export function useNow(on = true, every = 1000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!on) return
    setNow(Date.now())
    const t = window.setInterval(() => setNow(Date.now()), every)
    return () => window.clearInterval(t)
  }, [on, every])
  return now
}

interface Clocked {
  startedAt: number
  pausedAt?: number | null
  pausedMs?: number | null
}

/** Recorded time of a Capture, paused stretches left out. Ticks while running. */
export function useCaptureClock(c: Clocked | null | undefined) {
  const paused = c?.pausedAt != null
  const now = useNow(!!c && !paused)
  if (!c) return { ms: 0, paused: false }
  const end = c.pausedAt ?? now
  return { ms: Math.max(0, end - c.startedAt - (c.pausedMs ?? 0)), paused }
}
