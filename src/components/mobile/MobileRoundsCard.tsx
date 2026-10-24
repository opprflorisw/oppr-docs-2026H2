import { useState } from "react"
import { useLocation } from "wouter"
import { useMutation, useQuery } from "convex/react"
import { toast } from "sonner"
import { ChevronRight, Footprints, Loader2 } from "lucide-react"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import { errorText } from "@/components/learn/training/lib"
import { useCheckIn } from "@/lib/checkIn"
import { useMobileShell } from "./MobileShell"

/**
 * Rounds on mobile Home: the live Rounds, with "Continue" for one already
 * started. Starting needs a check-in, because a Round is proof.
 */
export function MobileRoundsCard() {
  const { person } = useCheckIn()
  const { openCheckIn } = useMobileShell()
  const [, navigate] = useLocation()
  const rounds = useQuery(api.floor.rounds, { personId: person?._id ?? null })
  const start = useMutation(api.attempts.start)
  const [starting, setStarting] = useState<Id<"trainings"> | null>(null)

  if (!rounds || rounds.length === 0) return null

  async function go(trainingId: Id<"trainings">, openId: Id<"trainingAttempts"> | null) {
    if (openId) {
      navigate(`/m/round/${openId}`)
      return
    }
    if (!person) {
      toast("Check in first: a Round is proof, so it needs to know who you are.")
      openCheckIn()
      return
    }
    setStarting(trainingId)
    try {
      const id = await start({ trainingId, personId: person._id })
      navigate(`/m/round/${id}`)
    } catch (err) {
      toast.error(errorText(err))
    } finally {
      setStarting(null)
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1 px-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        <Footprints className="h-2.5 w-2.5" />
        Rounds
      </div>
      <div className="flex flex-col gap-1">
        {rounds.map((r) => (
          <button
            key={r._id}
            type="button"
            disabled={starting !== null}
            onClick={() => void go(r._id, r.open?._id ?? null)}
            className="flex items-center gap-2 rounded-md border bg-card px-2 py-1.5 text-left active:scale-[0.99] disabled:opacity-70"
          >
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-violet-500/10 text-violet-700 dark:text-violet-300">
              <Footprints className="h-3 w-3" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[11px] font-medium leading-tight">{r.title}</div>
              <div className="truncate text-[9px] text-muted-foreground">
                <span className="font-mono">{r.code}</span> · {r.stops.length} stops
                {r.open
                  ? ` · stop ${Math.min(r.open.currentStop + 1, r.stops.length)} of ${r.stops.length}`
                  : r.lastPassedAt
                    ? " · passed before"
                    : ""}
              </div>
            </div>
            {starting === r._id ? (
              <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
            ) : (
              <span className="flex items-center gap-0.5 text-[10px] font-medium text-primary">
                {r.open ? "Continue" : "Start"}
                <ChevronRight className="h-3 w-3" />
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}
