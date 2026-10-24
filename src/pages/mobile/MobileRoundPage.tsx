// A Round on the phone (CONTEXT.md: Round): a Training done in the plant
// like a treasure hunt. A Prepare card first (why, how long, the stops, the
// pass rule). Then the clue says where to go; the Operator walks there and
// Scans the Asset's QR code. The wrong Asset gets one card: "Wrong machine:
// this is X", the clue once more, and Scan. The right one opens that stop's
// questions, one at a time, and the photo or note it asks for. A finished
// stop shows "Stop 1 done" with the next clue right under it. After the last
// stop: the result, with every answer reviewed inside the phone.
//
// Works on a real phone (Scan = tap a QR code in the scan sheet) and inside
// the Floor simulator, where clicking a machine on the plan walks there and
// opens /m/round/:id?scan=<assetId>&n=<nonce>.

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useLocation, useRoute, useSearch } from "wouter"
import { useMutation, useQuery } from "convex/react"
import { toast } from "sonner"
import {
  AlertTriangle,
  ArrowRight,
  Award,
  Check,
  CheckCircle2,
  Eye,
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
import { useMobileShell } from "@/components/mobile/MobileShell"
import { useFloorBridge } from "@/components/mobile/floorBridge"
import { looksLikeConvexId } from "@/components/mobile/use-mobile-prefs"
import { RoundQuestion } from "@/components/mobile/round/RoundQuestion"
import { RoundEvidence } from "@/components/mobile/round/RoundEvidence"
import { ScanPickerSheet } from "@/components/mobile/round/ScanPickerSheet"
import { BottomSheet, buzz, ProofHeader, SheetButton, StickyBar } from "@/components/mobile/round/ProofChrome"
import type { AttemptView } from "@/components/learn/training/AttemptReview"
import { AttemptIntro } from "@/components/learn/training/AttemptIntro"
import { AttemptResult, EveryAnswer } from "@/components/learn/training/AttemptResult"
import { isAnswered, isRight, useAnswerDraft } from "@/components/learn/training/QuestionCard"
import { errorText } from "@/components/learn/training/lib"
import { useCheckIn } from "@/lib/checkIn"
import { cn } from "@/lib/utils"

type Notice = { tone: "wrong"; scannedId: Id<"assets"> } | { tone: "warn"; text: string }

// Scan requests already handled (per Attempt, Asset and nonce), so a
// re-render or a remount never scans twice.
const handledScans = new Set<string>()

export function MobileRoundPage() {
  const [, params] = useRoute<{ attemptId: string }>("/m/round/:attemptId")
  const [, navigate] = useLocation()
  const id = params?.attemptId ?? ""
  const valid = looksLikeConvexId(id)
  const a = useQuery(api.attempts.get, valid ? { id: id as Id<"trainingAttempts"> } : "skip")
  const { person } = useCheckIn()

  const title = a?.training?.title ?? "Round"
  if (a && person && person._id === a.personId && a.status !== "passed" && a.status !== "failed") {
    return <RoundInProgress a={a} personId={person._id} title={title} />
  }

  let body: React.ReactNode
  if (!valid || a === null) {
    body = (
      <Centered icon={<AlertTriangle className="h-6 w-6" />} title="This Round is not available">
        It may have been removed. Start a Round from Home.
      </Centered>
    )
  } else if (a === undefined) {
    body = (
      <div className="space-y-3 p-3">
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    )
  } else if (!person || person._id !== a.personId) {
    body = <NotYours a={a} checkedIn={!!person} />
  } else {
    body = (
      <AttemptResult
        a={a}
        personId={person._id}
        review={
          <>
            <StopsSummary a={a} />
            <EveryAnswer a={a} personId={person._id} />
          </>
        }
      />
    )
  }
  return (
    <div className="flex min-h-full flex-col">
      <ProofHeader
        title={title}
        subtitle={a?.training ? `${a.training.code} · Round` : undefined}
        onClose={() => navigate("/m")}
      />
      {body}
    </div>
  )
}

// ---- In progress ------------------------------------------------------------------

function RoundInProgress({ a, personId, title }: { a: AttemptView; personId: Id<"people">; title: string }) {
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
  const [menu, setMenu] = useState<null | "menu" | "confirm">(null)
  // The stop whose "done" card (with the next clue) is on screen.
  const [clueAfter, setClueAfter] = useState<number | null>(null)
  const [prepared, setPrepared] = useState(() => a.stops.some((s) => s.visited) || a.questions.some(isAnswered))
  const topRef = useRef<HTMLDivElement>(null)

  const codeOf = useMemo(() => {
    const m = new Map<string, string>()
    for (const x of assets ?? []) m.set(x._id, x.code)
    return (assetId: string) => m.get(assetId) ?? "another machine"
  }, [assets])

  const current = a.round?.currentStop ?? 0
  const n = a.stops.length
  const here = a.stops[current]
  const allStopsDone = current >= n
  const showStop = viewStop ?? (here && here.visited ? current : null)
  // Standing at a stop (for example after reopening the page): keep it on
  // screen until the person moves on.
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
        setPrepared(true)
        if (r.ok) {
          setViewStop(r.stopIndex)
        } else if (r.reason === "wrong_asset" && r.expected) {
          buzz(80)
          setViewStop(null)
          setNotice({ tone: "wrong", scannedId: assetId })
        } else if (r.reason === "finish_here_first" && r.expected) {
          setNotice({ tone: "warn", text: `Finish this stop first: ${r.expected.code}.` })
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
    [a._id, personId, scanAt, recordUsage, current],
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

  // Each new screen starts at the top of the app's own scroller (never the
  // desktop page around the phone preview).
  const screenKey = `${a.status}:${prepared}:${showStop ?? "next"}:${current}:${notice?.tone ?? ""}`
  useEffect(() => {
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

  const scanButton = (
    <Button className="h-12 flex-1 gap-2 rounded-xl text-base" disabled={scanning} onClick={() => setPickerOpen(true)} data-scan>
      {scanning ? <Loader2 className="h-5 w-5 animate-spin" /> : <ScanLine className="h-5 w-5" />}
      Scan the QR code
    </Button>
  )
  const finishButton = (
    <Button className="h-12 flex-1 gap-2 rounded-xl text-base" disabled={finishing} onClick={() => void doFinish()} data-finish>
      {finishing ? <Loader2 className="h-5 w-5 animate-spin" /> : <Award className="h-5 w-5" />}
      Finish the Round
    </Button>
  )

  let subtitle = `Stop ${Math.min(current + 1, n)} of ${n}`
  let screen: React.ReactNode
  if (a.status === "error" || a.status === "abandoned") {
    const isError = a.status === "error"
    subtitle = a.training?.code ?? "Round"
    screen = (
      <>
        <Centered
          icon={isError ? <AlertTriangle className="h-6 w-6" /> : <RotateCcw className="h-6 w-6" />}
          title={isError ? "Your questions could not be prepared" : "This Round was stopped"}
        >
          {isError ? a.error || "Something went wrong while writing the questions." : "It does not count. Start it again when you are ready."}
        </Centered>
        <StickyBar>
          <Button className="h-12 flex-1 gap-2 rounded-xl text-base" disabled={retrying} onClick={() => void retry()}>
            {retrying ? <Loader2 className="h-5 w-5 animate-spin" /> : <RotateCcw className="h-5 w-5" />}
            {isError ? "Try again" : "Start again"}
          </Button>
        </StickyBar>
      </>
    )
  } else if (a.status === "generating" || !prepared) {
    const generating = a.status === "generating"
    subtitle = "Before you start"
    screen = (
      <>
        <div className="space-y-3 p-3">
          <AttemptIntro a={a} generating={generating} />
          {pending && generating && (
            <p className="rounded-lg bg-primary/5 px-3 py-2 text-sm text-primary">
              You scanned a QR code. It opens as soon as your questions are ready.
            </p>
          )}
        </div>
        <StickyBar>
          <Button className="h-12 flex-1 gap-2 rounded-xl text-base" disabled={generating} onClick={() => setPrepared(true)} data-start>
            {generating ? <Loader2 className="h-5 w-5 animate-spin" /> : <Navigation className="h-5 w-5" />}
            {generating ? "Preparing your Round" : "Go to stop 1"}
          </Button>
        </StickyBar>
      </>
    )
  } else if (showStop !== null && a.stops[showStop]) {
    // The header follows the screen: it moves on once the next clue shows.
    subtitle = clueAfter === showStop && showStop + 1 < n ? `Stop ${showStop + 2} of ${n}` : `Stop ${showStop + 1} of ${n}`
    screen = (
      <StopWork
        key={showStop}
        a={a}
        personId={personId}
        stopIndex={showStop}
        scanButton={scanButton}
        finishButton={finishButton}
        embedded={embedded && !!bridge}
        warn={notice?.tone === "warn" ? notice.text : null}
        onClueShown={setClueAfter}
      />
    )
  } else if (allStopsDone) {
    subtitle = "All stops done"
    screen = (
      <>
        <div className="p-3">
          <div className="space-y-2 rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-center dark:border-emerald-500/40 dark:bg-emerald-500/10">
            <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-600" />
            <p className="text-base font-semibold">Every stop is done</p>
            <p className="text-sm text-muted-foreground">Finish the Round to see your result.</p>
          </div>
        </div>
        <StickyBar>{finishButton}</StickyBar>
      </>
    )
  } else {
    screen = (
      <>
        <div className="space-y-3 p-3">
          <StopsTrack a={a} current={current} />
          {notice?.tone === "warn" && <WarnNotice text={notice.text} />}
          <ClueCard a={a} index={current} embedded={embedded && !!bridge} wrong={notice?.tone === "wrong" ? codeOf(notice.scannedId) : null} />
        </div>
        <StickyBar>{scanButton}</StickyBar>
      </>
    )
  }

  return (
    <div ref={topRef} className="flex min-h-full flex-col">
      <ProofHeader
        title={title}
        subtitle={subtitle}
        onClose={() => navigate("/m")}
        onMenu={() => setMenu("menu")}
        menuLabel="Round options"
      />
      <div className="flex flex-1 flex-col">{screen}</div>
      <ScanPickerSheet open={pickerOpen} onClose={() => setPickerOpen(false)} onScan={scanVia} hideNames />
      <BottomSheet
        open={menu !== null}
        onClose={() => setMenu(null)}
        label="Round options"
        title={menu === "confirm" ? "Stop this Round?" : "Round options"}
      >
        {menu === "confirm" ? (
          <>
            <p className="pb-4 text-base text-muted-foreground">It will not count. You can start it again from Home.</p>
            <div className="space-y-2">
              <SheetButton tone="danger" onClick={() => void doAbandon()}>
                Stop the Round
              </SheetButton>
              <SheetButton tone="primary" onClick={() => setMenu(null)}>
                Keep going
              </SheetButton>
            </div>
          </>
        ) : (
          <div className="space-y-2">
            <SheetButton tone="danger" onClick={() => setMenu("confirm")}>
              Stop this Round
            </SheetButton>
            <SheetButton onClick={() => setMenu(null)}>Close</SheetButton>
          </div>
        )}
      </BottomSheet>
    </div>
  )
}

/** Where the Round is: one dot per stop. Stops not reached yet stay a surprise. */
function StopsTrack({ a, current }: { a: AttemptView; current: number }) {
  const n = a.stops.length
  return (
    <ol className="flex items-center rounded-xl border bg-card px-3 py-3" aria-label="Stops">
      {a.stops.map((s, i) => {
        const state = s.done ? "done" : i === current ? "current" : "later"
        return (
          <li key={s.index} className="flex flex-1 items-center last:flex-none">
            <span
              title={state === "done" ? s.code : `Stop ${i + 1}`}
              className={cn(
                "flex h-8 min-w-8 shrink-0 items-center justify-center rounded-full px-2 text-[13px] font-semibold",
                state === "done" && "bg-emerald-600 text-white",
                state === "current" && "bg-primary text-primary-foreground ring-4 ring-primary/15",
                state === "later" && "bg-muted text-muted-foreground",
              )}
            >
              {state === "done" ? <Check className="h-4 w-4" /> : i + 1}
            </span>
            {i < n - 1 && <span className={cn("mx-1 h-0.5 flex-1 rounded-full", s.done ? "bg-emerald-500" : "bg-muted")} />}
          </li>
        )
      })}
    </ol>
  )
}

function WarnNotice({ text }: { text: string }) {
  return (
    <p className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-900 animate-in fade-in-0 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100">
      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
      {text}
    </p>
  )
}

/**
 * Where to go next: the clue. After a wrong Scan the same card says so
 * first ("Wrong machine: this is VAC-203"), so the clue shows only once.
 */
function ClueCard({ a, index, embedded, wrong }: { a: AttemptView; index: number; embedded: boolean; wrong: string | null }) {
  const stop = a.stops[index]
  const [reveal, setReveal] = useState(false)
  if (!stop) return null
  return (
    <div
      role={wrong ? "alert" : undefined}
      data-clue
      className={cn(
        "space-y-3 rounded-xl border bg-card p-4",
        wrong && "border-2 border-red-300 animate-in fade-in-0 zoom-in-95 dark:border-red-500/50",
      )}
    >
      {wrong ? (
        <p className="flex items-center gap-2 text-base font-semibold text-red-700 dark:text-red-300" data-wrong-scan>
          <XCircle className="h-5 w-5 shrink-0" />
          Wrong machine: this is {wrong}
        </p>
      ) : (
        <p className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Navigation className="h-4 w-4 text-primary" />
          {index === 0 ? "Your first stop" : `Stop ${index + 1}: your next stop`}
        </p>
      )}
      <p className="text-lg font-semibold leading-snug">{stop.hint || "Find the next Asset of the Round."}</p>
      {reveal ? (
        <p className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-base">
          <MapPin className="h-4 w-4 text-primary" />
          <span className="font-mono font-semibold">{stop.code}</span> {stop.name}
        </p>
      ) : (
        <Button variant="outline" className="h-11 w-full gap-2 rounded-xl text-sm" onClick={() => setReveal(true)}>
          <Eye className="h-4 w-4" /> Stuck? Show which machine
        </Button>
      )}
      {embedded && (
        <p className="flex items-start gap-2 rounded-lg bg-primary/5 px-3 py-2 text-sm leading-snug text-primary">
          <MousePointerClick className="mt-0.5 h-4 w-4 shrink-0" />
          Click the machine on the floor plan to walk there and scan its QR code.
        </p>
      )}
    </div>
  )
}

function StopWork({
  a,
  personId,
  stopIndex,
  scanButton,
  finishButton,
  embedded,
  warn,
  onClueShown,
}: {
  a: AttemptView
  personId: Id<"people">
  stopIndex: number
  scanButton: React.ReactNode
  finishButton: React.ReactNode
  embedded: boolean
  warn: string | null
  onClueShown: (stopIndex: number | null) => void
}) {
  const stop = a.stops[stopIndex]
  const qs = a.questions.filter((q) => q.stopIndex === stopIndex)
  const firstOpen = qs.find((q) => !isAnswered(q)) ?? null
  // The question on screen stays after it is answered, so the feedback can
  // be read, until the person taps Next.
  const [activeId, setActiveId] = useState<string | null>(() => firstOpen?.id ?? null)
  const active = activeId === "done" ? null : (qs.find((q) => q.id === activeId) ?? firstOpen)
  const draft = useAnswerDraft(a._id, personId, active)
  const feedbackRef = useRef<HTMLDivElement>(null)
  const answered = active ? isAnswered(active) : false
  const wasAnswered = useRef(answered)
  useEffect(() => {
    if (answered && !wasAnswered.current) {
      requestAnimationFrame(() => feedbackRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }))
    }
    wasAnswered.current = answered
  }, [answered])

  const needsEvidence = stop.evidence !== "none" && stop.evidenceGiven.length === 0
  const last = stopIndex === a.stops.length - 1
  const showsDone = !active && !needsEvidence
  useEffect(() => {
    onClueShown(showsDone ? stopIndex : null)
  }, [showsDone, stopIndex, onClueShown])

  const here = (
    <div className="flex items-center gap-3 rounded-xl border bg-card p-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white">
        <MapPin className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-muted-foreground">Stop {stopIndex + 1} · you are here</p>
        <p className="truncate text-base font-semibold">
          <span className="font-mono">{stop.code}</span> {stop.name}
        </p>
      </div>
    </div>
  )

  if (active) {
    const others = qs.filter((q) => q.id !== active.id && !isAnswered(q))
    const nextLabel = others.length
      ? "Next question"
      : needsEvidence
        ? stop.evidence === "photo"
          ? "Next: take a photo"
          : "Next: add a note"
        : "Done here"
    return (
      <>
        <div className="space-y-3 p-3">
          {warn && <WarnNotice text={warn} />}
          {here}
          <RoundQuestion
            key={active.id}
            attemptId={a._id}
            personId={personId}
            question={active}
            number={a.questions.findIndex((x) => x.id === active.id) + 1}
            total={a.questions.length}
            draft={draft}
            feedbackRef={feedbackRef}
          />
        </div>
        <StickyBar>
          {!answered ? (
            <Button
              className="h-12 flex-1 gap-2 rounded-xl text-base"
              disabled={!draft.canCheck}
              onClick={() => void draft.check()}
              data-check-answer
            >
              {draft.checking ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />}
              Check answer
            </Button>
          ) : (
            <Button className="h-12 flex-1 gap-2 rounded-xl text-base" onClick={() => setActiveId(others[0]?.id ?? "done")} data-next>
              {nextLabel} <ArrowRight className="h-5 w-5" />
            </Button>
          )}
        </StickyBar>
      </>
    )
  }
  if (needsEvidence && (stop.evidence === "photo" || stop.evidence === "note")) {
    return (
      <div className="space-y-3 p-3">
        {here}
        <RoundEvidence
          attemptId={a._id}
          personId={personId}
          stopIndex={stopIndex}
          kind={stop.evidence}
          assetId={stop.assetId}
          assetCode={stop.code}
        />
      </div>
    )
  }

  // Stop done: say so inline, and show the next clue right away.
  const right = qs.filter((q) => isRight(q) === true).length
  return (
    <>
      <div className="space-y-3 p-3">
        <div
          className="flex items-center gap-3 rounded-xl border border-emerald-300 bg-emerald-50 p-3 dark:border-emerald-500/40 dark:bg-emerald-500/10"
          data-stop-done
        >
          <CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-600" />
          <div className="min-w-0">
            <p className="text-base font-semibold">Stop {stopIndex + 1} done</p>
            <p className="text-sm text-muted-foreground">
              {qs.length > 0 ? `${right} of ${qs.length} right` : "No questions here"}
              {stop.evidenceGiven.length > 0 && ` · ${stop.evidence === "photo" ? "photo" : "note"} added`}
            </p>
          </div>
        </div>
        {!last && <ClueCard a={a} index={stopIndex + 1} embedded={embedded} wrong={null} />}
      </div>
      <StickyBar>{last ? finishButton : scanButton}</StickyBar>
    </>
  )
}

// ---- Finished ---------------------------------------------------------------------

function StopsSummary({ a }: { a: AttemptView }) {
  return (
    <ul className="divide-y rounded-xl border bg-card">
      {a.stops.map((s) => {
        const qs = a.questions.filter((q) => q.stopIndex === s.index)
        const ok = qs.filter((q) => isRight(q) === true).length
        return (
          <li key={s.index} className="flex min-h-12 items-center gap-3 px-3 py-2">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-[13px] font-semibold">
              {s.index + 1}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-base">
                <span className="font-mono font-semibold">{s.code}</span> {s.name}
              </span>
              <span className="block text-[13px] text-muted-foreground">
                {qs.length ? `${ok} of ${qs.length} right` : "No questions"}
                {s.evidenceGiven.length > 0 && ` · ${s.evidence === "photo" ? "photo" : "note"} added`}
              </span>
            </span>
            {qs.length > 0 && ok === qs.length ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            ) : qs.length > 0 ? (
              <XCircle className="h-5 w-5 text-red-600" />
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}

// ---- Small parts ------------------------------------------------------------------

function NotYours({ a, checkedIn }: { a: AttemptView; checkedIn: boolean }) {
  const { openCheckIn } = useMobileShell()
  return (
    <Centered icon={<UserRound className="h-6 w-6" />} title={`This is ${a.personName}'s Round`}>
      {checkedIn
        ? `A Round is proof for one person. Check in as ${a.personName} to continue it.`
        : `A Round is proof, so it needs to know who you are. Check in as ${a.personName} to continue.`}
      <Button className="mt-3 h-12 gap-2 rounded-xl px-6 text-base" onClick={openCheckIn}>
        <UserRound className="h-5 w-5" />
        Check in
      </Button>
    </Centered>
  )
}

function Centered({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-300">
        {icon}
      </div>
      <p className="text-base font-semibold">{title}</p>
      <div className="flex flex-col items-center gap-1 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </div>
  )
}
