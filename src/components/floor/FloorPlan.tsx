import { useEffect, useMemo, useRef, useState } from "react"
import type { FunctionReturnType } from "convex/server"
import { CheckCircle2, FileText, Footprints, ScanLine, UserRound } from "lucide-react"
import { api } from "../../../convex/_generated/api"
import { AssetQrSvg } from "@/components/docs/AssetQrSvg"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"
import { initials, type Person } from "@/lib/checkIn"
import { cn } from "@/lib/utils"
import { makeWalker, pathLength, placeAssets, pointAt, VIEW_H, VIEW_W, type MachineShape, type Pt } from "./layout"
import { MachineGlyph, PlanDrawing } from "./PlanDrawing"

export type PlanAsset = FunctionReturnType<typeof api.floor.plan>[number]
export type PinTone = "idle" | "here" | "done" | "wrong"

// How far above the machine's centre its pin sits (plan units).
const PIN_LIFT: Record<MachineShape, number> = {
  dryer: 28,
  mixer: 34,
  extruder: 36,
  tank: 21,
  saw: 24,
  coiler: 40,
  bench: 22,
  generic: 26,
}

const pct = (p: Pt) => ({ left: `${(p.x / VIEW_W) * 100}%`, top: `${(p.y / VIEW_H) * 100}%` })

/**
 * The plant floor with every Asset and its QR code. Clicking an Asset walks
 * "you" there along the aisles (about a second), then calls onArrive: the
 * page performs the Scan on the phone.
 */
export function FloorPlan({
  assets,
  plantName,
  here,
  walkTo,
  onPick,
  onArrive,
  toneOf,
  person,
  busy,
  roundMode,
}: {
  assets: PlanAsset[]
  plantName: string
  /** The Asset you stand at; null is the entrance. */
  here: string | null
  /** A walk to start; a new nonce starts a new walk. */
  walkTo: { assetId: string; nonce: number } | null
  onPick: (assetId: string) => void
  onArrive: (assetId: string) => void
  toneOf: (assetId: string) => PinTone
  person: Person | null
  busy: boolean
  roundMode: boolean
}) {
  const placed = useMemo(() => placeAssets(assets), [assets])
  const walker = useMemo(() => makeWalker(placed), [placed])
  const codes = useMemo(() => new Set(assets.map((a) => a.code)), [assets])
  const site = assets[0]?.site ?? null

  const [pos, setPos] = useState<Pt>(() => walker.standOf(here))
  const [route, setRoute] = useState<Pt[] | null>(null)
  const [walkingTo, setWalkingTo] = useState<string | null>(null)
  const fromRef = useRef<string | null>(here)
  const onArriveRef = useRef(onArrive)
  onArriveRef.current = onArrive

  // Keep the marker on its spot when the plan re-lays out (new data).
  useEffect(() => {
    if (!walkingTo) setPos(walker.standOf(fromRef.current))
  }, [walker, walkingTo])

  useEffect(() => {
    if (!walkTo) return
    const path = walker.route(fromRef.current, walkTo.assetId)
    const total = pathLength(path)
    // About 1.2 s for a typical walk; short hops are quicker, long ones capped.
    const duration = Math.max(550, Math.min(1500, 380 + total * 1.25))
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    setRoute(path)
    setWalkingTo(walkTo.assetId)
    let raf = 0
    const t0 = performance.now()
    const finish = () => {
      fromRef.current = walkTo.assetId
      setPos(path[path.length - 1])
      setWalkingTo(null)
      setRoute(null)
      onArriveRef.current(walkTo.assetId)
    }
    if (reduced || total < 1) {
      finish()
      return
    }
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / duration)
      const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
      setPos(pointAt(path, eased * total))
      if (t < 1) raf = requestAnimationFrame(step)
      else finish()
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
    // A walk starts only on a new request (nonce).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walkTo?.nonce])

  const walkingCode = walkingTo ? assets.find((a) => a._id === walkingTo)?.code : null

  return (
    <div className="relative w-full select-none" style={{ aspectRatio: `${VIEW_W} / ${VIEW_H}` }}>
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        className="absolute inset-0 h-full w-full"
        role="img"
        aria-label={`Floor plan of ${plantName}`}
      >
        <PlanDrawing plantName={plantName} siteCode={site} codes={codes} />
        {placed.map((p) => {
          const tone = toneOf(p.id)
          return (
            <g
              key={p.id}
              onClick={() => !busy && onPick(p.id)}
              className={cn(!busy && "cursor-pointer")}
              aria-hidden
            >
              <MachineGlyph shape={p.spot.shape} at={p.spot.at} tone={tone} />
            </g>
          )
        })}
        {route && (
          <polyline
            points={route.map((p) => `${p.x},${p.y}`).join(" ")}
            fill="none"
            stroke="hsl(var(--primary))"
            strokeWidth="3"
            strokeDasharray="2 9"
            strokeLinecap="round"
            opacity="0.7"
          />
        )}
      </svg>

      {/* Asset pins: code and QR code, with a hover card */}
      {placed.map((p) => {
        const a = assets.find((x) => x._id === p.id)!
        const tone = toneOf(p.id)
        const anchor = { x: p.spot.at.x, y: p.spot.at.y - PIN_LIFT[p.spot.shape] }
        return (
          <HoverCard key={p.id} openDelay={120} closeDelay={60}>
            <HoverCardTrigger asChild>
              <button
                type="button"
                disabled={busy}
                onClick={() => onPick(p.id)}
                aria-label={`${a.code} ${a.name}. Walk there and scan its QR code`}
                style={pct(anchor)}
                className={cn(
                  "absolute z-10 flex -translate-x-1/2 -translate-y-full items-center gap-1 rounded-md border bg-background py-0.5 pl-0.5 pr-1.5 shadow-sm transition",
                  "hover:z-20 hover:border-primary hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default",
                  tone === "here" && "border-primary ring-2 ring-primary/25",
                  tone === "done" && "border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10",
                  tone === "wrong" && "animate-[floor-shake_0.45s_ease-in-out] border-red-500 bg-red-50 ring-2 ring-red-500/30 dark:bg-red-500/10",
                )}
              >
                <span className="rounded-[3px] bg-white p-px ring-1 ring-black/10">
                  <AssetQrSvg value={a.qrToken} size={18} />
                </span>
                <span className="font-mono text-[10px] font-semibold leading-none">{a.code}</span>
                {tone === "done" && <CheckCircle2 className="h-3 w-3 text-emerald-600" />}
              </button>
            </HoverCardTrigger>
            <HoverCardContent side="top" align="center" className="w-64 overflow-hidden p-0">
              {a.imageUrl && <img src={a.imageUrl} alt="" className="h-28 w-full object-cover" />}
              <div className="space-y-1.5 p-3">
                <div>
                  <p className="font-mono text-[11px] text-muted-foreground">{a.code}</p>
                  <p className="text-sm font-semibold leading-tight">{a.name}</p>
                  {a.location && <p className="text-[11px] text-muted-foreground">{a.location}</p>}
                </div>
                <p className="flex items-center gap-1.5 text-xs">
                  <FileText className="h-3.5 w-3.5 text-primary" />
                  {a.publishedDocs === 0
                    ? "No Published documents yet"
                    : `${a.publishedDocs} Published ${a.publishedDocs === 1 ? "document" : "documents"}`}
                </p>
                {!roundMode && a.rounds > 0 && (
                  <p className="flex items-center gap-1.5 text-xs">
                    <Footprints className="h-3.5 w-3.5 text-violet-600" />A stop in {a.rounds}{" "}
                    {a.rounds === 1 ? "Round" : "Rounds"}
                  </p>
                )}
                <p className="flex items-center gap-1.5 border-t pt-1.5 text-[11px] text-muted-foreground">
                  <ScanLine className="h-3.5 w-3.5" />
                  {here === p.id ? "You are here. Click to scan again." : "Click to walk there and scan its QR code"}
                </p>
              </div>
            </HoverCardContent>
          </HoverCard>
        )
      })}

      {/* You */}
      <div
        className="pointer-events-none absolute z-30 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
        style={pct(pos)}
        aria-hidden
      >
        <span className="relative flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-primary text-[10px] font-semibold text-primary-foreground shadow-md">
          {!walkingTo && <span className="absolute inset-0 -z-10 animate-ping rounded-full bg-primary/40" />}
          {person ? initials(person.name) : <UserRound className="h-3.5 w-3.5" />}
        </span>
        <span className="mt-0.5 rounded bg-background/90 px-1 text-[9px] font-medium shadow-sm">
          {person ? person.name.split(" ")[0] : "You"}
        </span>
      </div>

      {walkingCode && (
        <div className="pointer-events-none absolute left-1/2 top-3 z-40 flex -translate-x-1/2 items-center gap-1.5 rounded-full border bg-background/95 px-3 py-1 text-xs font-medium shadow-md">
          <Footprints className="h-3.5 w-3.5 animate-pulse text-primary" />
          Walking to <span className="font-mono">{walkingCode}</span>
        </div>
      )}
    </div>
  )
}
