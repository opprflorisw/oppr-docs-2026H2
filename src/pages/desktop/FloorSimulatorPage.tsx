import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useSearch } from "wouter"
import { memoryLocation } from "wouter/memory-location"
import { useMutation, useQuery } from "convex/react"
import { toast } from "sonner"
import { Footprints, Map as MapIcon, MapPin, MousePointerClick, ScanLine, Smartphone, X } from "lucide-react"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { TopBar } from "@/components/layout/TopBar"
import { PageHeader } from "@/components/layout/PageHeader"
import { FloorPlan, type PinTone } from "@/components/floor/FloorPlan"
import { PhoneFrame, type PhoneOverlay } from "@/components/floor/PhoneFrame"
import { EmbeddedMobileApp } from "@/components/floor/EmbeddedMobileApp"
import { RoundPanel } from "@/components/floor/RoundPanel"
import { errorText } from "@/components/learn/training/lib"
import type { FloorBridge } from "@/components/mobile/floorBridge"
import { useCheckIn } from "@/lib/checkIn"
import { cn } from "@/lib/utils"

// Floor simulator (CONTEXT.md): a desktop-only page that stands in for being
// in the field. The plan shows every Asset with its QR code; the phone next
// to it runs the real mobile app. Clicking an Asset walks there and Scans it.
// In Round mode a checked-in person walks a Round like a treasure hunt.

const PLANT_NAME = "Pijpwerk Noord"
const HINT_KEY = "oppr.floor.hintDismissed"
const SCAN_MS = 650

type Mode = "free" | "round"

function readHintDismissed() {
  try {
    return window.localStorage.getItem(HINT_KEY) === "1"
  } catch {
    return false
  }
}

export function FloorSimulatorPage() {
  const search = useSearch()
  const deepRound = useMemo(() => new URLSearchParams(search).get("round"), [search])
  const { person, people, checkIn } = useCheckIn()
  const assets = useQuery(api.floor.plan)
  const rounds = useQuery(api.floor.rounds, { personId: person?._id ?? null })
  const startAttempt = useMutation(api.attempts.start)
  const abandonAttempt = useMutation(api.attempts.abandon)

  const [mode, setMode] = useState<Mode>(deepRound ? "round" : "free")
  const [roundId, setRoundId] = useState<string | null>(deepRound)
  const [phone] = useState(() => memoryLocation({ path: "/m" }))
  const [here, setHere] = useState<string | null>(null)
  const [walk, setWalk] = useState<{ assetId: string; nonce: number } | null>(null)
  const [overlay, setOverlay] = useState<PhoneOverlay>(null)
  const [flash, setFlash] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  const [hintDismissed, setHintDismissed] = useState(readHintDismissed)
  // The Attempt last started here, so its result stays on screen after finish.
  const [started, setStarted] = useState<{ key: string; id: Id<"trainingAttempts"> } | null>(null)

  const selected = rounds?.find((r) => r._id === roundId) ?? rounds?.[0] ?? null
  const problem =
    deepRound && rounds && !rounds.some((r) => r._id === deepRound)
      ? "That Training is not a published Round, so it cannot be walked yet. Pick a published Round instead."
      : null
  const startKey = `${person?._id ?? ""}:${selected?._id ?? ""}`
  const attemptId = selected?.open?._id ?? (started?.key === startKey ? started.id : null)
  const attemptRaw = useQuery(api.attempts.get, attemptId ? { id: attemptId } : "skip")
  const attempt = attemptId ? attemptRaw : null
  const roundOpen =
    !!attempt &&
    !!person &&
    attempt.personId === person._id &&
    (attempt.status === "in_progress" || attempt.status === "generating")

  // Where the phone is, so a Scan while it shows the Round goes to the Round.
  const phonePath = useRef("/m")
  const onPhoneLocation = useCallback((path: string) => {
    phonePath.current = path
  }, [])

  // Latest values for the timed scan.
  const live = useRef({ roundOpen, mode, attemptId, assets })
  live.current = { roundOpen, mode, attemptId, assets }

  // A deep link to a Round (from the Training page) shows that Round's
  // screen on the phone as soon as the person has one open.
  const shownDeepLink = useRef(false)
  useEffect(() => {
    if (!deepRound || shownDeepLink.current || !attempt || !person) return
    if (attempt.personId !== person._id || attempt.trainingId !== deepRound) return
    if (attempt.status === "in_progress" || attempt.status === "generating" || attempt.status === "error") {
      shownDeepLink.current = true
      phone.navigate(`/m/round/${attempt._id}`)
    }
  }, [deepRound, attempt, person, phone])

  const busy = walk !== null || overlay?.kind === "scanning"
  const assetById = useMemo(() => new Map((assets ?? []).map((a) => [a._id as string, a])), [assets])

  const pick = useCallback(
    (assetId: string) => {
      if (walk !== null || overlay?.kind === "scanning") return
      const a = assetById.get(assetId)
      if (!a) return
      setOverlay(assetId === here ? null : { kind: "walking", code: a.code })
      setWalk({ assetId, nonce: Date.now() })
    },
    [walk, overlay, assetById, here],
  )
  const pickRef = useRef(pick)
  pickRef.current = pick
  const bridge = useMemo<FloorBridge>(() => ({ walkTo: (id) => pickRef.current(id) }), [])

  const arrive = useCallback(
    (assetId: string) => {
      setWalk(null)
      setHere(assetId)
      const a = live.current.assets?.find((x) => x._id === assetId)
      setOverlay(a ? { kind: "scanning", code: a.code, qrToken: a.qrToken } : null)
      window.setTimeout(() => {
        setOverlay(null)
        const { roundOpen: open, mode: m, attemptId: id } = live.current
        const onRoundScreen = !!id && phonePath.current === `/m/round/${id}`
        if (open && id && (m === "round" || onRoundScreen))
          phone.navigate(`/m/round/${id}?scan=${assetId}&n=${Date.now()}`)
        else phone.navigate(`/m/assets/${assetId}`)
      }, SCAN_MS)
    },
    [phone],
  )

  // A wrong machine during a Round: the pin shakes red.
  const wrongScans = attempt?.round?.wrongScans ?? 0
  const prevWrong = useRef<{ id: string | null; n: number }>({ id: null, n: 0 })
  useEffect(() => {
    const prev = prevWrong.current
    prevWrong.current = { id: attemptId, n: wrongScans }
    if (prev.id === attemptId && wrongScans > prev.n && here) {
      setFlash(here)
      const t = window.setTimeout(() => setFlash(null), 1600)
      return () => window.clearTimeout(t)
    }
  }, [attemptId, wrongScans, here])

  const toneOf = useCallback(
    (assetId: string): PinTone => {
      if (flash === assetId) return "wrong"
      if (mode === "round" && attempt && attempt.status !== "abandoned") {
        if (attempt.stops.some((s) => s.assetId === assetId && s.done)) return "done"
      }
      if (here === assetId) return "here"
      return "idle"
    },
    [flash, mode, attempt, here],
  )

  function switchMode(next: Mode) {
    if (next === mode) return
    setMode(next)
    if (next === "free") {
      phone.navigate("/m")
    } else if (attempt && person && attempt.personId === person._id && attempt.status !== "abandoned") {
      phone.navigate(`/m/round/${attempt._id}`)
    }
  }

  async function start() {
    if (!person || !selected) return
    setStarting(true)
    try {
      const id = await startAttempt({ trainingId: selected._id, personId: person._id })
      setStarted({ key: `${person._id}:${selected._id}`, id })
      phone.navigate(`/m/round/${id}`)
    } catch (err) {
      toast.error(errorText(err))
    } finally {
      setStarting(false)
    }
  }

  async function abandon() {
    if (!person || !attempt) return
    try {
      await abandonAttempt({ id: attempt._id, personId: person._id })
      setStarted(null)
      phone.navigate("/m")
      toast.success("Round stopped. It does not count.")
    } catch (err) {
      toast.error(errorText(err))
    }
  }

  function dismissHint() {
    setHintDismissed(true)
    try {
      window.localStorage.setItem(HINT_KEY, "1")
    } catch {
      // Not remembered; it shows again next time.
    }
  }

  function openFloorView() {
    window.open(`${window.location.origin}/m`, "oppr-floor", "width=390,height=844,resizable=yes,scrollbars=yes")
  }

  const hereAsset = here ? assetById.get(here) : null

  return (
    <div className="flex flex-col">
      <style>{FLOOR_KEYFRAMES}</style>
      <TopBar breadcrumb={[{ label: "Assets", href: "/assets" }, { label: "Floor simulator" }]} />
      <PageHeader
        icon={MapIcon}
        title="Floor simulator"
        subtitle="Walk the plant and see what an Operator sees on the phone after a Scan."
        actions={
          <Button size="sm" variant="outline" className="gap-1.5" onClick={openFloorView}>
            <Smartphone className="h-3.5 w-3.5" />
            Open the phone app in a window
          </Button>
        }
      />

      <div className="grid gap-6 p-6 xl:grid-cols-[minmax(0,1fr)_minmax(320px,440px)]">
        <div className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex rounded-lg border bg-muted/50 p-0.5" role="tablist" aria-label="Mode">
              <ModeButton active={mode === "free"} onClick={() => switchMode("free")} icon={ScanLine} label="Free walk" />
              <ModeButton active={mode === "round"} onClick={() => switchMode("round")} icon={Footprints} label="Round" />
            </div>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <MapPin className="h-3.5 w-3.5" />
              {hereAsset ? (
                <>
                  You are at <span className="font-mono font-medium text-foreground">{hereAsset.code}</span>{" "}
                  {hereAsset.name}
                </>
              ) : (
                "You are at the entrance"
              )}
            </p>
          </div>

          {!hintDismissed && (
            <div className="flex items-start gap-2.5 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2.5 text-sm">
              <MousePointerClick className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <p className="font-medium">Click a machine to walk there and scan its QR code.</p>
                <p className="text-xs text-muted-foreground">
                  The phone shows what an Operator sees: Published documents only, and Ask. Anonymous unless you check
                  in. Switch to Round to walk a Round like a treasure hunt.
                </p>
              </div>
              <button
                type="button"
                onClick={dismissHint}
                aria-label="Dismiss"
                className="rounded-md p-1 text-muted-foreground hover:bg-muted"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          <Card>
            <CardContent className="p-3">
              {assets === undefined ? (
                <Skeleton className="aspect-[1000/600] w-full rounded-md" />
              ) : assets.length === 0 ? (
                <div className="flex aspect-[1000/600] flex-col items-center justify-center gap-2 text-center">
                  <MapIcon className="h-8 w-8 text-muted-foreground" />
                  <p className="text-sm font-medium">No Assets yet</p>
                  <p className="max-w-xs text-xs text-muted-foreground">
                    Assets added under Assets appear on the plan with their QR code.
                  </p>
                </div>
              ) : (
                <FloorPlan
                  assets={assets}
                  plantName={PLANT_NAME}
                  here={here}
                  walkTo={walk}
                  onPick={pick}
                  onArrive={arrive}
                  toneOf={toneOf}
                  person={person}
                  busy={busy}
                  roundMode={mode === "round"}
                />
              )}
            </CardContent>
          </Card>

          {mode === "round" ? (
            <RoundPanel
              rounds={rounds}
              selected={selected}
              onSelect={(id) => setRoundId(id)}
              person={person}
              people={people}
              onCheckIn={checkIn}
              attempt={attempt}
              starting={starting}
              onStart={() => void start()}
              onShowOnPhone={() => attempt && phone.navigate(`/m/round/${attempt._id}`)}
              onAbandon={() => void abandon()}
              problem={problem}
            />
          ) : (
            <AssetStrip assets={assets} here={here} onPick={pick} busy={busy} />
          )}
        </div>

        <div className="xl:sticky xl:top-[7.5rem] xl:self-start">
          <PhoneFrame overlay={overlay}>
            <EmbeddedMobileApp location={phone} bridge={bridge} onLocation={onPhoneLocation} />
          </PhoneFrame>
          <p className="mt-2 text-center text-[11px] text-muted-foreground">
            The real Operator app. On the floor it opens from the QR code on each machine.
          </p>
        </div>
      </div>
    </div>
  )
}

function ModeButton({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean
  onClick: () => void
  icon: typeof ScanLine
  label: string
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "flex h-7 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition",
        active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  )
}

/** Every Asset as a small card: what a Scan there shows. */
function AssetStrip({
  assets,
  here,
  onPick,
  busy,
}: {
  assets: { _id: string; code: string; name: string; publishedDocs: number; rounds: number }[] | undefined
  here: string | null
  onPick: (id: string) => void
  busy: boolean
}) {
  if (!assets || assets.length === 0) return null
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
      {assets.map((a) => (
        <button
          key={a._id}
          type="button"
          disabled={busy}
          onClick={() => onPick(a._id)}
          className={cn(
            "flex flex-col items-start rounded-lg border bg-card px-3 py-2 text-left transition hover:border-primary/60 hover:bg-primary/5 disabled:cursor-default",
            here === a._id && "border-primary bg-primary/5",
          )}
        >
          <span className="font-mono text-[11px] text-muted-foreground">{a.code}</span>
          <span className="w-full truncate text-xs font-medium">{a.name}</span>
          <span className="mt-0.5 text-[11px] text-muted-foreground">
            {a.publishedDocs} Published {a.publishedDocs === 1 ? "document" : "documents"}
            {a.rounds > 0 && ` · ${a.rounds} ${a.rounds === 1 ? "Round" : "Rounds"}`}
          </span>
        </button>
      ))}
    </div>
  )
}

const FLOOR_KEYFRAMES = `
@keyframes floor-shake {
  0%, 100% { transform: translate(-50%, -100%); }
  20% { transform: translate(calc(-50% - 4px), -100%); }
  40% { transform: translate(calc(-50% + 4px), -100%); }
  60% { transform: translate(calc(-50% - 3px), -100%); }
  80% { transform: translate(calc(-50% + 3px), -100%); }
}
@keyframes floor-scan {
  0% { top: 4%; }
  50% { top: 94%; }
  100% { top: 4%; }
}
.floor-scanline { animation: floor-scan 1.1s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) {
  .floor-scanline { animation: none; top: 50%; }
}
`
