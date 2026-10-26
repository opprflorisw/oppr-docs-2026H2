// Scan. On a real phone: the camera with a viewfinder (BarcodeDetector),
// and "Type the code" for a damaged or unreadable label. Where there is no
// camera to point (the desktop phone preview, the Floor simulator, a wide
// screen) the QR codes are shown to tap instead.

import { useEffect, useMemo, useRef, useState } from "react"
import { useLocation } from "wouter"
import { useQuery } from "convex/react"
import { Camera, CameraOff, Keyboard, ScanLine } from "lucide-react"
import { api } from "../../../convex/_generated/api"
import type { Doc as ConvexDoc, Id } from "../../../convex/_generated/dataModel"
import { Skeleton } from "@/components/ui/skeleton"
import { Input } from "@/components/ui/input"
import { MobileHeader } from "@/components/mobile/MobileHeader"
import { QrScanCard } from "@/components/mobile/QrScanCard"
import { FloorPrimaryButton } from "@/components/mobile/MobileSheet"
import { useMobileShell } from "@/components/mobile/MobileShell"
import { useFloorBridge } from "@/components/mobile/floorBridge"

type BarcodeDetectorLike = { detect: (src: CanvasImageSource) => Promise<{ rawValue: string }[]> }
type BarcodeDetectorCtor = new (opts?: { formats?: string[] }) => BarcodeDetectorLike

export function barcodeDetector(): BarcodeDetectorCtor | null {
  if (typeof window === "undefined") return null
  return ((window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector ?? null) as BarcodeDetectorCtor | null
}

/** Finds the Asset (or document) a scanned or typed value points at. */
export function resolveCode(
  raw: string,
  assets: ConvexDoc<"assets">[],
  docs: ConvexDoc<"documents">[] | undefined,
): { kind: "asset" | "doc"; id: string } | null {
  const v = raw.trim()
  if (!v) return null
  const lower = v.toLowerCase()
  const byToken = assets.find((a) => a.qrToken === v || a.qrToken.toLowerCase() === lower)
  if (byToken) return { kind: "asset", id: byToken._id }
  const url = v.match(/\/m\/assets\/([a-z0-9]{20,})/i) ?? v.match(/\/assets\/([a-z0-9]{20,})/i)
  if (url) return { kind: "asset", id: url[1] }
  const norm = lower.replace(/\s+/g, "")
  const byCode = assets.find((a) => a.code.toLowerCase().replace(/\s+/g, "") === norm)
  if (byCode) return { kind: "asset", id: byCode._id }
  const doc = docs?.find((d) => d.namingCode.toLowerCase() === norm)
  if (doc) return { kind: "doc", id: doc._id }
  return null
}

export function MobileScanPage() {
  const [, navigate] = useLocation()
  const bridge = useFloorBridge()
  const { embedded } = useMobileShell()
  const assets = useQuery(api.assets.list)
  const docs = useQuery(api.documents.list, { publishedOnly: true })
  const [wide] = useState(() => typeof window !== "undefined" && window.innerWidth > 600)
  // Tap-to-scan where no camera can point at a label.
  const simulated = !!bridge || embedded || wide
  const canCamera =
    !simulated && !!barcodeDetector() && typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia

  function open(hit: { kind: "asset" | "doc"; id: string }) {
    if (hit.kind === "asset" && bridge) bridge.walkTo(hit.id as Id<"assets">)
    else navigate(hit.kind === "asset" ? `/m/assets/${hit.id}` : `/m/docs/${hit.id}`)
  }

  return (
    <div className="flex min-h-full flex-col">
      <MobileHeader title="Scan" backTo="/m/find" subtitle={simulated ? "Tap a code to scan it" : "A machine's safety and tasks"} />
      <div className="flex flex-col gap-4 p-4">
        {canCamera && assets && <CameraScanner assets={assets} docs={docs} onHit={open} />}
        {/* No autofocus: the keyboard would cover the machines to tap, and
            with gloves on, tapping a machine is easier than typing. */}
        <TypeTheCode assets={assets} docs={docs} onHit={open} autoFocus={false} />
        {!simulated && !canCamera && (
          <p className="px-1 text-sm text-muted-foreground">
            This browser cannot scan. Type the code from the label on the machine, or tap the machine below.
          </p>
        )}
        {(simulated || !canCamera) && (
          <section className="flex flex-col gap-2">
            <h2 className="px-1 text-[13px] font-semibold uppercase tracking-wide text-muted-foreground">
              {simulated ? "QR codes on the machines" : "Or pick the machine"}
            </h2>
            {!assets ? (
              <>
                <Skeleton className="h-24 w-full rounded-2xl" />
                <Skeleton className="h-24 w-full rounded-2xl" />
              </>
            ) : (
              assets.map((a) => (
                <QrScanCard key={a._id} asset={a} onClick={() => open({ kind: "asset", id: a._id })} />
              ))
            )}
          </section>
        )}
      </div>
    </div>
  )
}

export function TypeTheCode({
  assets,
  docs,
  onHit,
  autoFocus,
}: {
  assets: ConvexDoc<"assets">[] | undefined
  docs: ConvexDoc<"documents">[] | undefined
  onHit: (hit: { kind: "asset" | "doc"; id: string }) => void
  autoFocus: boolean
}) {
  const [code, setCode] = useState("")
  const [miss, setMiss] = useState(false)
  function go() {
    const hit = assets ? resolveCode(code, assets, docs) : null
    if (hit) onHit(hit)
    else setMiss(true)
  }
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        go()
      }}
    >
      <label htmlFor="scan-code" className="flex items-center gap-1.5 px-1 text-[13px] font-semibold text-muted-foreground">
        <Keyboard className="h-4 w-4" />
        Type the code
      </label>
      <div className="flex gap-2">
        <Input
          id="scan-code"
          value={code}
          autoFocus={autoFocus}
          autoCapitalize="characters"
          autoComplete="off"
          enterKeyHint="go"
          onChange={(e) => {
            setCode(e.target.value)
            setMiss(false)
          }}
          placeholder="For example EXL-201"
          className="h-12 flex-1 rounded-2xl font-mono text-base uppercase placeholder:font-sans placeholder:normal-case"
        />
        <button
          type="submit"
          disabled={!code.trim() || !assets}
          className="min-h-12 shrink-0 rounded-2xl border border-[#6E59A5]/40 px-5 text-base font-semibold text-[#6E59A5] disabled:opacity-50"
        >
          Open
        </button>
      </div>
      {miss && (
        <p role="alert" className="px-1 text-sm text-red-700 dark:text-red-400">
          No machine or document has the code "{code.trim()}". Check the label, it looks like EXL-201.
        </p>
      )}
    </form>
  )
}

export function CameraScanner({
  assets,
  docs,
  onHit,
}: {
  assets: ConvexDoc<"assets">[]
  docs: ConvexDoc<"documents">[] | undefined
  onHit: (hit: { kind: "asset" | "doc"; id: string }) => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [state, setState] = useState<"idle" | "starting" | "on" | "denied" | "unknown">("idle")
  const [lastMiss, setLastMiss] = useState<string | null>(null)
  const detector = useMemo(() => {
    const Ctor = barcodeDetector()
    try {
      return Ctor ? new Ctor({ formats: ["qr_code"] }) : null
    } catch {
      return null
    }
  }, [])
  const hitRef = useRef(onHit)
  hitRef.current = onHit

  useEffect(() => {
    if (state !== "starting" && state !== "on") return
    let stream: MediaStream | null = null
    let raf = 0
    let stopped = false
    let busy = false
    ;(async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false })
        if (stopped) return
        const v = videoRef.current
        if (!v) return
        v.srcObject = stream
        await v.play().catch(() => {})
        setState("on")
        const tick = async () => {
          if (stopped) return
          if (!busy && detector && v.readyState >= 2) {
            busy = true
            try {
              const codes = await detector.detect(v)
              for (const c of codes) {
                const hit = resolveCode(c.rawValue, assets, docs)
                if (hit) {
                  navigator.vibrate?.(60)
                  stopped = true
                  hitRef.current(hit)
                  return
                }
                setLastMiss(c.rawValue)
              }
            } catch {
              // a frame that could not be read: try the next one
            }
            busy = false
          }
          raf = window.setTimeout(() => void tick(), 200) as unknown as number
        }
        void tick()
      } catch (err) {
        setState((err as { name?: string })?.name === "NotAllowedError" ? "denied" : "unknown")
      }
    })()
    return () => {
      stopped = true
      window.clearTimeout(raf)
      stream?.getTracks().forEach((t) => t.stop())
    }
    // Start once; the asset list does not restart the camera.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state === "idle" ? "idle" : "running", detector])

  if (state === "idle") {
    return (
      <div className="flex flex-col items-center gap-4 rounded-2xl border bg-card px-4 py-8 text-center">
        <ScanLine className="h-12 w-12 text-[#6E59A5]" />
        <p className="text-base text-muted-foreground">Point the camera at the QR code on the machine.</p>
        <FloorPrimaryButton onClick={() => setState("starting")}>
          <Camera className="h-5 w-5" />
          Start the camera
        </FloorPrimaryButton>
      </div>
    )
  }
  if (state === "denied" || state === "unknown") {
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-6 text-center text-amber-950 dark:bg-amber-500/10 dark:text-amber-100">
        <CameraOff className="h-8 w-8" />
        <p className="text-base font-semibold">
          {state === "denied" ? "The camera is not allowed for this app" : "The camera did not start"}
        </p>
        <p className="text-sm">
          {state === "denied"
            ? "Allow the camera in the browser settings, or type the code from the label below."
            : "Type the code from the label below."}
        </p>
      </div>
    )
  }
  return (
    <div className="relative overflow-hidden rounded-2xl bg-black">
      <video ref={videoRef} playsInline muted className="aspect-[3/4] w-full object-cover" aria-label="Camera" />
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="relative h-56 w-56">
          <span className="absolute left-0 top-0 h-8 w-8 rounded-tl-2xl border-l-4 border-t-4 border-white" />
          <span className="absolute right-0 top-0 h-8 w-8 rounded-tr-2xl border-r-4 border-t-4 border-white" />
          <span className="absolute bottom-0 left-0 h-8 w-8 rounded-bl-2xl border-b-4 border-l-4 border-white" />
          <span className="absolute bottom-0 right-0 h-8 w-8 rounded-br-2xl border-b-4 border-r-4 border-white" />
        </div>
      </div>
      <p className="absolute inset-x-0 bottom-0 bg-black/60 px-4 py-3 text-center text-sm text-white">
        {state === "starting"
          ? "Starting the camera..."
          : lastMiss
            ? "That code is not a machine here. Try the label on the machine."
            : "Hold the QR code inside the frame"}
      </p>
    </div>
  )
}
