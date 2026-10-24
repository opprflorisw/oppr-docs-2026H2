// A Round on the phone (CONTEXT.md: Round): a Training done in the plant
// like a treasure hunt. The hint says where to go; the Operator walks there
// and Scans the Asset's QR code. The wrong Asset gets "You're at the wrong
// machine. Go to X." The right one opens that stop's questions, one at a
// time with the source passage, and the photo or note it asks for. After the
// last stop: the result, and on a pass the Training record.
//
// Works on a real phone (Scan = tap a QR code in the scan sheet) and inside
// the Floor simulator, where clicking a machine on the plan walks there and
// opens /m/round/:id?scan=<assetId>&n=<nonce>.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { useLocation, useRoute, useSearch } from "wouter"
import { useMutation, useQuery } from "convex/react"
import { toast } from "sonner"
import {
  AlertTriangle,
  ArrowRight,
  Award,
  CheckCircle2,
  Eye,
  Footprints,
  Home,
  Loader2,
  MapPin,
  MousePointerClick,
  Navigation,
  RotateCcw,
  ScanLine,
  TriangleAlert,
  UserRound,
  XCircle,
} from "lucide-react"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { MobileHeader } from "@/components/mobile/MobileHeader"
import { useMobileShell } from "@/components/mobile/MobileShell"
import { useFloorBridge } from "@/components/mobile/floorBridge"
import { looksLikeConvexId } from "@/components/mobile/use-mobile-prefs"
import { RoundQuestion } from "@/components/mobile/round/RoundQuestion"
import { RoundEvidence } from "@/components/mobile/round/RoundEvidence"
import { ScanPickerSheet } from "@/components/mobile/round/ScanPickerSheet"
import type { AttemptView } from "@/components/learn/training/AttemptReview"
import { errorText } from "@/components/learn/training/lib"
import { useCheckIn } from "@/lib/checkIn"
import { cn } from "@/lib/utils"

type Notice =
  | { tone: "ok"; text: string }
  | { tone: "wrong"; scanned: string; expected: { code: string; name: string }; hint: string }
  | { tone: "warn"; text: string }

// Scan requests already handled (per Attempt, Asset and nonce), so a
// re-render or a remount never scans twice.
const handledScans = new Set<string>()

export function MobileRoundPage() {
  const [, params] = useRoute<{ attemptId: string }>("/m/round/:attemptId")
  const id = params?.attemptId ?? ""
  const valid = looksLikeConvexId(id)
  const a = useQuery(api.attempts.get, valid ? { id: id as Id<"trainingAttempts"> } : "skip")
  const { person } = useCheckIn()

  const title = a?.training?.title ?? "Round"
  const subtitle = a?.training ? `${a.training.code} · Round` : undefined

  let body: React.ReactNode
  if (!valid || a === null) {
    body = (
      <Centered icon={<AlertTriangle className="h-6 w-6" />} tone="warn" title="This Round is not available">
        It may have been removed. Start a Round from Home.
        <HomeButton />
      </Centered>
    )
  } else if (a === undefined) {
    body = (
      <div className="space-y-3 p-4">
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Skeleton className="h-40 w-full rounded-2xl" />
      </div>
    )
  } else if (!person || person._id !== a.personId) {
    body = <NotYours a={a} checkedIn={!!person} />
  } else if (a.status === "passed" || a.status === "failed") {
    body = <RoundResult a={a} personId={person._id} />
  } else {
    body = <RoundInProgress a={a} personId={person._id} />
  }

  return (
    <div className="flex min-h-full flex-col">
      <MobileHeader backTo="/m" title={title} subtitle={subtitle} />
      {body}
    </div>
  )
}

// ---- In progress ------------------------------------------------------------------

function RoundInProgress({ a, personId }: { a: AttemptView; personId: Id<"people"> }) {
  const search = useSearch()
  const [, navigate] = useLocation()
  const { embedded } = useMobileShell()
  const bridge = useFloorBridge()
  const scanAt = useMutation(api.attempts.scanAt)
  const start = useMutation(api.attempts.start)
  const abandon = useMutation(api.attempts.abandon)
  const finish = useMutation(api.attempts.finish)
  const recordUsage = useMutation(api.usage.record)
  const assets = useQuery(api.assets.list)
  const [scanning, setScanning] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [viewStop, setViewStop] = useState<number | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [finishing, setFinishing] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const [confirmStop, setConfirmStop] = useState(false)
  const topRef = useRef<HTMLDivElement>(null)

  const codeOf = useMemo(() => {
    const m = new Map<string, string>()
    for (const x of assets ?? []) m.set(x._id, `${x.code} ${x.name}`)
    return (assetId: string) => m.get(assetId) ?? "this Asset"
  }, [assets])

  const round = a.round
  const current = round?.currentStop ?? 0
  const here = a.stops[current]
  const allStopsDone = current >= a.stops.length
  const showStop = viewStop ?? (here && here.visited ? current : null)
  // Standing at a stop (for example after reopening the page): keep it on
  // screen until the person moves on, even once its last answer is in.
  useEffect(() => {
    if (viewStop === null && here?.visited && !here.done) setViewStop(current)
  }, [viewStop, here?.visited, here?.done, current])

  const doScan = useCallback(
    async (assetId: Id<"assets">) => {
      setScanning(true)
      setNotice(null)
      try {
        const r = await scanAt({ id: a._id, personId, assetId })
        recordUsage({ kind: "scan", assetId, personId, surface: "floor" }).catch(() => {})
        if (r.ok) {
          const stop = a.stops[r.stopIndex]
          setViewStop(r.stopIndex)
          setNotice({
            tone: "ok",
            text: "revisit" in r && r.revisit ? `Back at ${stop?.code ?? "this stop"}.` : `Scanned ${stop?.code ?? ""}. You found it.`,
          })
        } else if (r.reason === "wrong_asset" && r.expected) {
          const hint = a.stops.find((s) => s.assetId === r.expected!.assetId)?.hint ?? ""
          setNotice({ tone: "wrong", scanned: codeOf(assetId), expected: r.expected, hint })
        } else if (r.reason === "finish_here_first" && r.expected) {
          setNotice({ tone: "warn", text: `Finish this stop first: ${r.expected.code} ${r.expected.name}.` })
          setViewStop(current)
        } else {
          setNotice({ tone: "warn", text: "Every stop is done. Finish the Round below." })
        }
      } catch (err) {
        toast.error(errorText(err))
      } finally {
        setScanning(false)
      }
    },
    [a._id, a.stops, personId, scanAt, recordUsage, codeOf, current],
  )

  // A Scan handed over by the Floor simulator (or a deep link): ?scan=<assetId>&n=<nonce>.
  const doScanRef = useRef(doScan)
  doScanRef.current = doScan
  const pending = useMemo(() => {
    const p = new URLSearchParams(search)
    const assetId = p.get("scan")
    return assetId ? { assetId, key: `${a._id}:${assetId}:${p.get("n") ?? ""}` } : null
  }, [search, a._id])
  useEffect(() => {
    if (!pending || a.status === "generating") return
    navigate(`/m/round/${a._id}`, { replace: true })
    if (handledScans.has(pending.key)) return
    handledScans.add(pending.key)
    if (a.status !== "in_progress" || !looksLikeConvexId(pending.assetId)) return
    void doScanRef.current(pending.assetId as Id<"assets">)
  }, [pending, a.status, a._id, navigate])

  // Each new screen starts at the top.
  const screenKey = `${a.status}:${showStop ?? "next"}:${current}`
  useLayoutEffect(() => {
    // Scroll the app's own scroller only (never the desktop page around the
    // Floor simulator's phone).
    let el = topRef.current?.parentElement ?? null
    while (el && !/(auto|scroll)/.test(getComputedStyle(el).overflowY)) el = el.parentElement
    if (el) el.scrollTop = 0
  }, [screenKey])

  function scanVia(assetId: Id<"assets">) {
    if (bridge) bridge.walkTo(assetId)
    else void doScan(assetId)
  }

  async function retry() {
    setRetrying(true)
    try {
      await start({ trainingId: a.trainingId, personId })
    } catch (err) {
      toast.error(errorText(err))
    } finally {
      setRetrying(false)
    }
  }

  async function doFinish() {
    setFinishing(true)
    try {
      await finish({ id: a._id, personId })
    } catch (err) {
      toast.error(errorText(err))
    } finally {
      setFinishing(false)
    }
  }

  async function doAbandon() {
    try {
      await abandon({ id: a._id, personId })
      toast.success("Round stopped. You can start it again from Home.")
      navigate("/m")
    } catch (err) {
      toast.error(errorText(err))
    }
  }

  if (a.status === "generating") {
    return (
      <div ref={topRef} className="flex flex-col gap-3 p-3">
        <StopsTrack a={a} current={current} />
        <div className="flex flex-col items-center gap-3 rounded-2xl border bg-card px-4 py-8 text-center">
          <Loader2 className="h-7 w-7 animate-spin text-primary" />
          <div className="space-y-1">
            <p className="text-sm font-semibold">Preparing your Round</p>
            <p className="text-[12px] leading-relaxed text-muted-foreground">
              Your questions are written fresh for you from the Published documents. This takes about half a minute.
            </p>
          </div>
          {pending && (
            <p className="rounded-lg bg-primary/5 px-3 py-2 text-[11px] text-primary">
              You scanned a QR code. It opens as soon as your questions are ready.
            </p>
          )}
        </div>
        {a.stops[0] && (
          <div className="rounded-2xl border border-dashed p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Your first stop</p>
            <p className="mt-1 text-[13px] leading-snug">{a.stops[0].hint || "The first Asset of the Round."}</p>
          </div>
        )}
      </div>
    )
  }

  if (a.status === "error" || a.status === "abandoned") {
    const isError = a.status === "error"
    return (
      <div ref={topRef}>
        <Centered
          icon={isError ? <AlertTriangle className="h-6 w-6" /> : <RotateCcw className="h-6 w-6" />}
          tone="warn"
          title={isError ? "Your questions could not be prepared" : "This Round was stopped"}
        >
          {isError ? a.error || "Something went wrong while writing the questions." : "It does not count. Start it again when you are ready."}
          <Button className="mt-2 h-10 gap-1.5 rounded-xl" disabled={retrying} onClick={() => void retry()}>
            {retrying ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
            {isError ? "Try again" : "Start again"}
          </Button>
        </Centered>
      </div>
    )
  }

  return (
    <div ref={topRef} className="flex flex-col gap-3 p-3 pb-6">
      <StopsTrack a={a} current={current} />

      {notice && <NoticeCard notice={notice} />}

      {showStop !== null && a.stops[showStop] ? (
        <StopWork
          key={showStop}
          a={a}
          personId={personId}
          stopIndex={showStop}
          finishing={finishing}
          onNextStop={() => {
            setViewStop(null)
            setNotice(null)
          }}
          onFinish={() => void doFinish()}
        />
      ) : allStopsDone ? (
        <div className="space-y-3 rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-center dark:border-emerald-500/40 dark:bg-emerald-500/10">
          <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-600" />
          <div>
            <p className="text-sm font-semibold">Every stop is done</p>
            <p className="text-[12px] text-muted-foreground">Finish the Round to see your result.</p>
          </div>
          <Button className="h-11 w-full gap-1.5 rounded-xl" disabled={finishing} onClick={() => void doFinish()}>
            {finishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Award className="h-4 w-4" />}
            Finish the Round
          </Button>
        </div>
      ) : here ? (
        <NextStop
          a={a}
          index={current}
          scanning={scanning}
          embedded={embedded && !!bridge}
          onScan={() => setPickerOpen(true)}
        />
      ) : null}

      <div className="mt-2 flex justify-center">
        {confirmStop ? (
          <div className="flex items-center gap-2 text-[11px]">
            <span className="text-muted-foreground">Stop this Round? It will not count.</span>
            <Button size="sm" variant="destructive" className="h-7 text-[11px]" onClick={() => void doAbandon()}>
              Stop
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => setConfirmStop(false)}>
              Keep going
            </Button>
          </div>
        ) : (
          <button type="button" onClick={() => setConfirmStop(true)} className="text-[11px] text-muted-foreground hover:text-foreground">
            Stop this Round
          </button>
        )}
      </div>

      <ScanPickerSheet open={pickerOpen} onClose={() => setPickerOpen(false)} onScan={scanVia} />
    </div>
  )
}

/** Where the Round is: one dot per stop. Stops not reached yet stay a surprise. */
function StopsTrack({ a, current }: { a: AttemptView; current: number }) {
  const n = a.stops.length
  const done = a.stops.filter((s) => s.done).length
  return (
    <div className="rounded-2xl border bg-card p-3">
      <div className="flex items-baseline justify-between">
        <p className="flex items-center gap-1.5 text-[12px] font-semibold">
          <Footprints className="h-3.5 w-3.5 text-primary" />
          {done >= n ? "All stops done" : `Stop ${Math.min(current + 1, n)} of ${n}`}
        </p>
        <p className="text-[10px] text-muted-foreground">
          {a.progress.answered}/{a.progress.total} questions
          {a.round && a.round.wrongScans > 0 && ` · ${a.round.wrongScans} wrong ${a.round.wrongScans === 1 ? "scan" : "scans"}`}
        </p>
      </div>
      <ol className="mt-2.5 flex items-center" aria-label="Stops">
        {a.stops.map((s, i) => {
          const state = s.done ? "done" : i === current ? "current" : "later"
          return (
            <li key={s.index} className="flex flex-1 items-center last:flex-none">
              <span
                title={state === "done" ? `${s.code} ${s.name}` : `Stop ${i + 1}`}
                className={cn(
                  "flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full px-1.5 text-[10px] font-semibold",
                  state === "done" && "bg-emerald-500 text-white",
                  state === "current" && "bg-primary text-primary-foreground ring-4 ring-primary/15",
                  state === "later" && "bg-muted text-muted-foreground",
                )}
              >
                {state === "done" ? <span className="font-mono">{s.code}</span> : i + 1}
              </span>
              {i < n - 1 && (
                <span className={cn("mx-1 h-0.5 flex-1 rounded-full", s.done ? "bg-emerald-400" : "bg-muted")} />
              )}
            </li>
          )
        })}
      </ol>
    </div>
  )
}

function NoticeCard({ notice }: { notice: Notice }) {
  if (notice.tone === "ok") {
    return (
      <p className="flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-[12px] font-medium text-emerald-800 animate-in fade-in-0 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-200">
        <CheckCircle2 className="h-4 w-4 shrink-0" />
        {notice.text}
      </p>
    )
  }
  if (notice.tone === "warn") {
    return (
      <p className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-[12px] text-amber-900 animate-in fade-in-0 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100">
        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
        {notice.text}
      </p>
    )
  }
  return (
    <div
      role="alert"
      className="space-y-1.5 rounded-2xl border-2 border-red-300 bg-red-50 p-3 animate-in fade-in-0 zoom-in-95 dark:border-red-500/50 dark:bg-red-500/10"
    >
      <p className="flex items-center gap-2 text-[14px] font-semibold text-red-700 dark:text-red-300">
        <XCircle className="h-5 w-5 shrink-0" />
        You're at the wrong machine.
      </p>
      <p className="text-[13px] leading-snug text-red-900 dark:text-red-100">
        Go to{" "}
        <span className="font-semibold">
          <span className="font-mono">{notice.expected.code}</span> {notice.expected.name}
        </span>
        .
      </p>
      <p className="text-[11px] text-red-800/80 dark:text-red-200/80">You scanned {notice.scanned}.</p>
      {notice.hint && <p className="rounded-lg bg-background/70 px-2.5 py-1.5 text-[12px] italic leading-snug">{notice.hint}</p>}
    </div>
  )
}

function NextStop({
  a,
  index,
  scanning,
  embedded,
  onScan,
}: {
  a: AttemptView
  index: number
  scanning: boolean
  embedded: boolean
  onScan: () => void
}) {
  const stop = a.stops[index]
  const [reveal, setReveal] = useState(false)
  return (
    <div className="space-y-3 rounded-2xl border bg-card p-4">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Navigation className="h-4 w-4" />
        </span>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {index === 0 ? "Your first stop" : "Your next stop"}
        </p>
      </div>
      <p className="text-[17px] font-semibold leading-snug">{stop.hint || "Find the next Asset of the Round."}</p>
      {reveal ? (
        <p className="flex items-center gap-1.5 rounded-lg bg-muted px-2.5 py-1.5 text-[12px]">
          <MapPin className="h-3.5 w-3.5 text-primary" />
          <span className="font-mono font-semibold">{stop.code}</span> {stop.name}
        </p>
      ) : (
        <button
          type="button"
          onClick={() => setReveal(true)}
          className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
        >
          <Eye className="h-3 w-3" /> Stuck? Show which machine
        </button>
      )}
      {embedded && (
        <p className="flex items-start gap-1.5 rounded-lg bg-primary/5 px-2.5 py-2 text-[11px] leading-snug text-primary">
          <MousePointerClick className="mt-px h-3.5 w-3.5 shrink-0" />
          Click the machine on the floor plan to walk there and scan its QR code.
        </p>
      )}
      <Button className="h-11 w-full gap-1.5 rounded-xl" disabled={scanning} onClick={onScan}>
        {scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanLine className="h-4 w-4" />}
        {scanning ? "Scanning…" : "Scan the QR code"}
      </Button>
    </div>
  )
}

function StopWork({
  a,
  personId,
  stopIndex,
  finishing,
  onNextStop,
  onFinish,
}: {
  a: AttemptView
  personId: Id<"people">
  stopIndex: number
  finishing: boolean
  onNextStop: () => void
  onFinish: () => void
}) {
  const stop = a.stops[stopIndex]
  const qs = a.questions.filter((q) => q.stopIndex === stopIndex)
  const firstOpen = qs.find((q) => q.answerIndex === null) ?? null
  // The question on screen stays there after it is answered, so the
  // feedback can be read, until the person taps Next.
  const [activeId, setActiveId] = useState<string | null>(null)
  useEffect(() => {
    if (activeId === null && firstOpen) setActiveId(firstOpen.id)
  }, [activeId, firstOpen])
  const active = activeId === "done" ? null : (qs.find((q) => q.id === activeId) ?? firstOpen)
  const needsEvidence = stop.evidence !== "none" && stop.evidenceGiven.length === 0
  const next = a.stops[stopIndex + 1]
  const isCurrent = stopIndex === (a.round?.currentStop ?? 0) || stop.done

  let content: React.ReactNode
  if (active) {
    const others = qs.filter((q) => q.id !== active.id && q.answerIndex === null)
    const nextLabel = others.length
      ? "Next question"
      : needsEvidence
        ? stop.evidence === "photo"
          ? "Next: take a photo"
          : "Next: add a note"
        : "Done here"
    content = (
      <RoundQuestion
        key={active.id}
        attemptId={a._id}
        personId={personId}
        question={active}
        number={a.questions.findIndex((x) => x.id === active.id) + 1}
        total={a.questions.length}
        nextLabel={nextLabel}
        onNext={() => setActiveId(others[0]?.id ?? "done")}
      />
    )
  } else if (needsEvidence && (stop.evidence === "photo" || stop.evidence === "note")) {
    content = (
      <RoundEvidence
        attemptId={a._id}
        personId={personId}
        stopIndex={stopIndex}
        kind={stop.evidence}
        assetId={stop.assetId}
        assetCode={stop.code}
      />
    )
  } else {
    content = (
      <div className="space-y-3 rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-center dark:border-emerald-500/40 dark:bg-emerald-500/10">
        <CheckCircle2 className="mx-auto h-7 w-7 text-emerald-600" />
        <p className="text-sm font-semibold">Stop {stopIndex + 1} done</p>
        {stop.evidenceGiven.length > 0 && (
          <p className="text-[11px] text-muted-foreground">
            {stop.evidence === "photo" ? "Photo" : "Note"} added to your record.
          </p>
        )}
        {next && isCurrent ? (
          <Button className="h-11 w-full gap-1.5 rounded-xl" onClick={onNextStop}>
            Go to the next stop
            <ArrowRight className="h-4 w-4" />
          </Button>
        ) : !next ? (
          <Button className="h-11 w-full gap-1.5 rounded-xl" disabled={finishing} onClick={onFinish}>
            {finishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Award className="h-4 w-4" />}
            Finish the Round
          </Button>
        ) : (
          <Button variant="outline" className="h-11 w-full rounded-xl" onClick={onNextStop}>
            Back to the Round
          </Button>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2.5 rounded-2xl border bg-card p-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
          <MapPin className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Stop {stopIndex + 1} · you are here
          </p>
          <p className="truncate text-[13px] font-semibold">
            <span className="font-mono">{stop.code}</span> {stop.name}
          </p>
        </div>
      </div>
      {content}
    </div>
  )
}

// ---- Finished ---------------------------------------------------------------------

function RoundResult({ a, personId }: { a: AttemptView; personId: Id<"people"> }) {
  const [, navigate] = useLocation()
  const start = useMutation(api.attempts.start)
  const [starting, setStarting] = useState(false)
  const passed = a.status === "passed"
  const { correct, total } = a.progress

  async function again() {
    setStarting(true)
    try {
      const next = await start({ trainingId: a.trainingId, personId })
      navigate(`/m/round/${next}`)
    } catch (err) {
      toast.error(errorText(err))
    } finally {
      setStarting(false)
    }
  }

  return (
    <div className="flex flex-col gap-3 p-3 pb-6">
      <div
        className={cn(
          "flex flex-col items-center gap-2 rounded-2xl border p-5 text-center",
          passed
            ? "border-emerald-300 bg-emerald-50 dark:border-emerald-500/40 dark:bg-emerald-500/10"
            : "border-red-300 bg-red-50 dark:border-red-500/40 dark:bg-red-500/10",
        )}
      >
        <span
          className={cn(
            "flex h-20 w-20 flex-col items-center justify-center rounded-full text-white shadow-sm",
            passed ? "bg-emerald-500" : "bg-red-500",
          )}
        >
          <span className="text-2xl font-bold tabular-nums leading-none">{a.score ?? 0}%</span>
        </span>
        <p className="text-base font-semibold">{passed ? "Round passed" : "Not passed this time"}</p>
        <p className="text-[12px] text-muted-foreground">
          {correct} of {total} correct · pass mark {a.passMark}%
          {a.round ? ` · ${a.round.wrongScans} wrong ${a.round.wrongScans === 1 ? "scan" : "scans"}` : ""}
        </p>
      </div>

      {passed ? (
        <div className="space-y-2 rounded-2xl border bg-card p-3">
          <p className="flex items-center gap-1.5 text-[13px] font-semibold">
            <Award className="h-4 w-4 text-emerald-600" />
            Training record written
          </p>
          <p className="text-[11px] leading-snug text-muted-foreground">
            Proof that {a.personName} passed {a.training?.code} v{a.trainingVersion}: every question, every answer, the
            photos and notes, and when.
          </p>
          {a.skillsRaised.length > 0 && (
            <ul className="space-y-1">
              {a.skillsRaised.map((s) => (
                <li key={s.skillId} className="flex items-center gap-1.5 text-[12px]">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                  {s.renewed ? "Skill renewed" : "Skill raised"}: <span className="font-medium">{s.name}</span>
                  {!s.renewed && <span className="text-muted-foreground">(level {s.toLevel})</span>}
                </li>
              ))}
            </ul>
          )}
          <a
            href={`/learn/attempts/${a._id}`}
            className="flex h-10 w-full items-center justify-center gap-1.5 rounded-xl border bg-background text-[13px] font-medium hover:bg-muted"
          >
            Open the Training record
            <ArrowRight className="h-4 w-4" />
          </a>
        </div>
      ) : (
        <div className="space-y-2 rounded-2xl border bg-card p-3">
          <p className="text-[12px] leading-snug text-muted-foreground">
            The Attempt is kept as it is. A new Attempt gets new questions on the same things.
          </p>
          <Button className="h-10 w-full gap-1.5 rounded-xl" disabled={starting} onClick={() => void again()}>
            {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
            Walk the Round again
          </Button>
          <a
            href={`/learn/attempts/${a._id}`}
            className="block text-center text-[11px] text-muted-foreground hover:text-foreground"
          >
            See every answer
          </a>
        </div>
      )}

      <ul className="divide-y rounded-2xl border bg-card">
        {a.stops.map((s) => {
          const qs = a.questions.filter((q) => q.stopIndex === s.index)
          const ok = qs.filter((q) => q.correct).length
          return (
            <li key={s.index} className="flex items-center gap-2.5 px-3 py-2">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold">
                {s.index + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12px]">
                  <span className="font-mono font-semibold">{s.code}</span> {s.name}
                </span>
                <span className="block text-[10px] text-muted-foreground">
                  {qs.length ? `${ok} of ${qs.length} correct` : "No questions"}
                  {s.evidenceGiven.length > 0 && ` · ${s.evidence === "photo" ? "photo" : "note"} added`}
                </span>
              </span>
              {qs.length > 0 && ok === qs.length ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              ) : qs.length > 0 ? (
                <XCircle className="h-4 w-4 text-red-500" />
              ) : null}
            </li>
          )
        })}
      </ul>

      <Button variant="outline" className="h-10 gap-1.5 rounded-xl" onClick={() => navigate("/m")}>
        <Home className="h-4 w-4" />
        Back to Home
      </Button>
    </div>
  )
}

// ---- Small parts ------------------------------------------------------------------

function NotYours({ a, checkedIn }: { a: AttemptView; checkedIn: boolean }) {
  const { openCheckIn } = useMobileShell()
  return (
    <Centered icon={<UserRound className="h-6 w-6" />} tone="primary" title={`This is ${a.personName}'s Round`}>
      {checkedIn
        ? `A Round is proof for one person. Check in as ${a.personName} to continue it.`
        : `A Round is proof, so it needs to know who you are. Check in as ${a.personName} to continue.`}
      <Button className="mt-2 h-10 gap-1.5 rounded-xl" onClick={openCheckIn}>
        <UserRound className="h-4 w-4" />
        Check in
      </Button>
    </Centered>
  )
}

function Centered({
  icon,
  tone,
  title,
  children,
}: {
  icon: React.ReactNode
  tone: "warn" | "primary"
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
      <div
        className={cn(
          "flex h-12 w-12 items-center justify-center rounded-full",
          tone === "warn" ? "bg-amber-500/10 text-amber-700 dark:text-amber-300" : "bg-primary/10 text-primary",
        )}
      >
        {icon}
      </div>
      <p className="text-sm font-semibold">{title}</p>
      <div className="flex flex-col items-center gap-1 text-[12px] leading-relaxed text-muted-foreground">{children}</div>
    </div>
  )
}

function HomeButton() {
  const [, navigate] = useLocation()
  return (
    <Button size="sm" className="mt-2 gap-1.5" onClick={() => navigate("/m")}>
      <Home className="h-3.5 w-3.5" />
      Back to Home
    </Button>
  )
}
