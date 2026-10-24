import { Link, useLocation } from "wouter"
import { ChevronRight, Pause } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatClock } from "./captureUi"
import { useActiveCapture, useCaptureClock } from "./useCapture"

/**
 * "Capture running 12:34": shown on every phone page while the checked-in
 * person has a Capture recording, so they can walk away and come back with
 * one tap. Hidden on the recording screen itself. The mobile shell docks it
 * as a full-width strip right above the tab bar, so it never covers content.
 */
export function CaptureRunningPill({ className }: { className?: string }) {
  const [location] = useLocation()
  const { active } = useActiveCapture()
  const capture = active ?? null
  const { ms, paused } = useCaptureClock(capture)

  if (!capture) return null
  if (location === "/m/capture" || location.startsWith("/m/capture?")) return null

  return (
    <Link
      href="/m/capture"
      aria-label={`Capture ${paused ? "paused" : "running"} ${formatClock(ms)}. Back to the Capture`}
      className={cn(
        "flex min-h-11 w-full items-center gap-2 px-4 text-sm font-semibold text-white transition active:opacity-90",
        paused ? "bg-slate-700" : "bg-red-600",
        className,
      )}
    >
      {paused ? (
        <Pause className="h-4 w-4 shrink-0" />
      ) : (
        <span className="relative flex h-2.5 w-2.5 shrink-0">
          <span className="absolute inline-flex h-full w-full rounded-full bg-white/70 motion-safe:animate-ping" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-white" />
        </span>
      )}
      <span className="truncate">{paused ? "Capture paused" : "Capture running"}</span>
      <span className="font-mono tabular-nums">{formatClock(ms)}</span>
      <span className="ml-auto flex items-center gap-0.5 text-[13px] font-medium opacity-90">
        Back to it
        <ChevronRight className="h-4 w-4 shrink-0" />
      </span>
    </Link>
  )
}
