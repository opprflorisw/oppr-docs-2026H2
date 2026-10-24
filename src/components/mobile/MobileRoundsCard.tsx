import { useState } from "react"
import { useLocation } from "wouter"
import { useQuery } from "convex/react"
import { ChevronDown, ChevronRight, Footprints, Loader2 } from "lucide-react"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import { useCheckIn } from "@/lib/checkIn"
import { formatDate } from "@/lib/time"
import { cn } from "@/lib/utils"
import { useStartTraining } from "./MobileTodo"

type RoundRow = {
  _id: Id<"trainings">
  code: string
  title: string
  stops: unknown[]
  open: { _id: Id<"trainingAttempts">; currentStop: number } | null
  lastPassedAt: number | null
  last?: { status: string; score: number | null; at: number } | null
}

/** floor.rounds returns either a list or { forYou, other }: accept both. */
function splitRounds(data: unknown): { forYou: RoundRow[]; other: RoundRow[] } | undefined {
  if (data === undefined) return undefined
  if (Array.isArray(data)) return { forYou: data as RoundRow[], other: [] }
  const d = data as { forYou?: RoundRow[]; other?: RoundRow[] }
  return { forYou: d.forYou ?? [], other: d.other ?? [] }
}

/**
 * Rounds on Home: "For you" (by your profile and area), with the other
 * Rounds folded away. Starting needs a check-in, because a Round is proof;
 * after the check-in the Round starts right away.
 */
export function MobileRoundsCard({ exclude = [] }: { exclude?: string[] }) {
  const { person } = useCheckIn()
  const data = useQuery(api.floor.rounds, { personId: person?._id ?? null })
  const rounds = splitRounds(data)
  const [showOther, setShowOther] = useState(false)

  if (!rounds) return null
  const forYou = rounds.forYou.filter((r) => !exclude.includes(r._id))
  const other = rounds.other.filter((r) => !exclude.includes(r._id))
  if (forYou.length === 0 && other.length === 0) return null

  return (
    <section className="flex flex-col gap-2">
      <h2 className="flex items-center gap-1.5 px-1 text-[13px] font-semibold uppercase tracking-wide text-muted-foreground">
        <Footprints className="h-4 w-4" />
        {other.length > 0 ? "Rounds for you" : "Rounds"}
      </h2>
      {forYou.length === 0 && (
        <p className="px-1 text-sm text-muted-foreground">No Round is planned for you right now.</p>
      )}
      {forYou.map((r) => (
        <RoundButton key={r._id} round={r} />
      ))}
      {other.length > 0 && (
        <>
          <button
            type="button"
            aria-expanded={showOther}
            onClick={() => setShowOther((v) => !v)}
            className="flex min-h-11 items-center gap-1 px-1 text-sm font-medium text-muted-foreground"
          >
            <ChevronDown className={cn("h-4 w-4 transition-transform", showOther && "rotate-180")} />
            Other Rounds ({other.length})
          </button>
          {showOther && other.map((r) => <RoundButton key={r._id} round={r} />)}
        </>
      )}
    </section>
  )
}

function RoundButton({ round: r }: { round: RoundRow }) {
  const [, navigate] = useLocation()
  const { go, busy } = useStartTraining()
  const status = r.open
    ? `at stop ${Math.min(r.open.currentStop + 1, r.stops.length)} of ${r.stops.length}`
    : r.lastPassedAt
      ? `passed ${formatDate(r.lastPassedAt)}`
      : r.last && r.last.status === "failed"
        ? `last try ${Math.round(r.last.score ?? 0)}%, not passed`
        : `${r.stops.length} stops`
  const label = r.open ? "Continue" : r.lastPassedAt ? "Walk again" : "Walk it"
  return (
    <button
      type="button"
      disabled={busy !== null}
      onClick={() => (r.open ? navigate(`/m/round/${r.open._id}`) : go({ _id: r._id, kind: "round" }))}
      className="flex min-h-16 items-center gap-3 rounded-2xl border bg-card px-3 py-3 text-left shadow-sm transition active:scale-[0.99] disabled:opacity-70"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#6E59A5]/10 text-[#6E59A5]">
        <Footprints className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 block text-base font-semibold leading-snug">{r.title}</span>
        <span className="block text-[13px] leading-snug text-muted-foreground">
          {status.charAt(0).toUpperCase() + status.slice(1)} · <span className="font-mono">{r.code}</span>
        </span>
        <span className="mt-1 flex items-center gap-0.5 text-sm font-semibold text-[#6E59A5]">
          {busy === r._id ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {label}
          <ChevronRight className="h-4 w-4" />
        </span>
      </span>
    </button>
  )
}
