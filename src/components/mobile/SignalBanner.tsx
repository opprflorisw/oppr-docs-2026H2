// The connection line at the top of the floor app. A hall often has Wi-Fi
// that is "connected" but carries nothing, so `navigator.onLine` alone is not
// enough: we also watch the Convex connection and how long a request waits.

import { useEffect, useState } from "react"
import { useConvexConnectionState } from "convex/react"
import { SignalLow, WifiOff } from "lucide-react"
import { useOnline } from "./use-mobile-prefs"

/** Seconds without a connection, or with a request waiting, before we say so. */
const LOST_AFTER_MS = 4000
const SLOW_AFTER_MS = 6000

export function SignalBanner() {
  const online = useOnline()
  const conn = useConvexConnectionState()
  const [now, setNow] = useState(() => Date.now())
  const [lostSince, setLostSince] = useState<number | null>(null)

  const disconnected = conn.hasEverConnected && !conn.isWebSocketConnected
  useEffect(() => {
    if (disconnected) setLostSince((t) => t ?? Date.now())
    else setLostSince(null)
  }, [disconnected])

  // Tick while something might cross a threshold; idle otherwise.
  const watching = disconnected || conn.hasInflightRequests
  useEffect(() => {
    if (!watching) return
    const t = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(t)
  }, [watching])

  const lost = !online || (lostSince !== null && now - lostSince > LOST_AFTER_MS)
  const oldest = conn.timeOfOldestInflightRequest?.getTime() ?? null
  const slow = !lost && oldest !== null && now - oldest > SLOW_AFTER_MS
  if (!lost && !slow) return null

  return (
    <div
      role="status"
      className="flex shrink-0 items-center justify-center gap-1.5 bg-amber-500/15 px-3 pb-1.5 text-center text-[13px] font-medium text-amber-950 dark:text-amber-100"
      style={{ paddingTop: "max(6px, var(--sat, env(safe-area-inset-top, 0px)))" }}
    >
      {lost ? <WifiOff className="h-4 w-4 shrink-0" aria-hidden /> : <SignalLow className="h-4 w-4 shrink-0" aria-hidden />}
      {lost
        ? "No signal. Open pages still work. Saving waits for the signal."
        : "Weak signal. Still working on it, keep this page open."}
    </div>
  )
}
