import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react"
import { BatteryFull, Footprints, SignalHigh, Wifi } from "lucide-react"
import { AssetQrSvg } from "@/components/docs/AssetQrSvg"

// A phone of 390 x 844 logical pixels (an iPhone-sized screen), scaled down
// to fit next to the plan. The app area is a containing block for
// position:fixed (transform), so the mobile app's floating buttons and
// overlays stay inside the screen.

const SCREEN_W = 390
const SCREEN_H = 844
const BEZEL = 12
const STATUS_H = 44
const HOME_H = 20
const FRAME_W = SCREEN_W + BEZEL * 2
const FRAME_H = SCREEN_H + BEZEL * 2

export type PhoneOverlay =
  | { kind: "walking"; code: string }
  | { kind: "scanning"; code: string; qrToken: string }
  | null

export function PhoneFrame({ children, overlay }: { children: ReactNode; overlay: PhoneOverlay }) {
  const boxRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0.8)

  useLayoutEffect(() => {
    const el = boxRef.current
    if (!el) return
    const fit = () => {
      // The column is sticky below the page header, so its top is at most ~140px.
      const top = Math.min(Math.max(el.getBoundingClientRect().top, 0), 140)
      const availH = window.innerHeight - top - 16
      const availW = el.clientWidth
      setScale(Math.max(0.55, Math.min(1, availH / FRAME_H, availW / FRAME_W)))
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    window.addEventListener("resize", fit)
    return () => {
      ro.disconnect()
      window.removeEventListener("resize", fit)
    }
  }, [])

  return (
    <div ref={boxRef} className="flex w-full justify-center">
      <div style={{ width: FRAME_W * scale, height: FRAME_H * scale }} className="relative shrink-0">
        <div
          className="absolute left-0 top-0 origin-top-left rounded-[58px] bg-neutral-900 shadow-2xl ring-1 ring-black/40"
          style={{ width: FRAME_W, height: FRAME_H, padding: BEZEL, transform: `scale(${scale})` }}
        >
          {/* side buttons */}
          <span className="absolute -left-[3px] top-[150px] h-12 w-[3px] rounded-l bg-neutral-700" />
          <span className="absolute -left-[3px] top-[215px] h-12 w-[3px] rounded-l bg-neutral-700" />
          <span className="absolute -right-[3px] top-[190px] h-20 w-[3px] rounded-r bg-neutral-700" />

          <div className="relative flex h-full w-full flex-col overflow-hidden rounded-[46px] bg-background">
            <StatusBar />
            <div
              className="relative min-h-0 flex-1 overflow-hidden"
              style={{ transform: "translateZ(0)", height: SCREEN_H - STATUS_H - HOME_H }}
            >
              {children}
              <ScanOverlay overlay={overlay} />
            </div>
            <div className="flex shrink-0 items-center justify-center bg-background" style={{ height: HOME_H }}>
              <span className="h-[5px] w-32 rounded-full bg-foreground/80" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function StatusBar() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 20_000)
    return () => window.clearInterval(t)
  }, [])
  const time = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false })
  return (
    <div className="relative flex shrink-0 items-center justify-between bg-background px-7 text-foreground" style={{ height: STATUS_H }}>
      <span className="text-[14px] font-semibold tabular-nums">{time}</span>
      <span className="absolute left-1/2 top-[10px] h-[26px] w-[104px] -translate-x-1/2 rounded-full bg-neutral-900" />
      <span className="flex items-center gap-1">
        <SignalHigh className="h-4 w-4" />
        <Wifi className="h-4 w-4" />
        <BatteryFull className="h-5 w-5" />
      </span>
    </div>
  )
}

/** The "walking there" and "scanning" moments, drawn over the app. */
function ScanOverlay({ overlay }: { overlay: PhoneOverlay }) {
  if (!overlay) return null
  if (overlay.kind === "walking") {
    return (
      <div className="pointer-events-none absolute inset-x-0 top-3 z-[90] flex justify-center">
        <span className="flex items-center gap-1.5 rounded-full bg-neutral-900/85 px-3 py-1.5 text-[12px] font-medium text-white shadow-lg animate-in fade-in-0 slide-in-from-top-2">
          <Footprints className="h-3.5 w-3.5 animate-pulse" />
          Walking to <span className="font-mono">{overlay.code}</span>
        </span>
      </div>
    )
  }
  return (
    <div className="absolute inset-0 z-[90] flex flex-col items-center justify-center gap-4 bg-neutral-950/90 text-white animate-in fade-in-0 duration-150">
      <div className="relative rounded-2xl p-3">
        {/* viewfinder corners */}
        <span className="absolute left-0 top-0 h-7 w-7 rounded-tl-2xl border-l-4 border-t-4 border-white" />
        <span className="absolute right-0 top-0 h-7 w-7 rounded-tr-2xl border-r-4 border-t-4 border-white" />
        <span className="absolute bottom-0 left-0 h-7 w-7 rounded-bl-2xl border-b-4 border-l-4 border-white" />
        <span className="absolute bottom-0 right-0 h-7 w-7 rounded-br-2xl border-b-4 border-r-4 border-white" />
        <div className="relative overflow-hidden rounded-lg bg-white p-2">
          <AssetQrSvg value={overlay.qrToken} size={170} />
          <span className="floor-scanline absolute inset-x-0 top-0 h-0.5 bg-primary shadow-[0_0_12px_2px_hsl(var(--primary))]" />
        </div>
      </div>
      <p className="text-[14px] font-medium">
        Scanning <span className="font-mono">{overlay.code}</span>
      </p>
    </div>
  )
}
