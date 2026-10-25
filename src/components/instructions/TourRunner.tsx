// The tour runner: walks a person through the real screens, one step at a
// time. Mounted once in the desktop shell, so it survives page changes.
// Each step opens its page, waits for the element marked data-tour="<target>",
// dims the rest of the screen around it and shows a small card next to it.
// The dimmed area blocks clicks, so nothing changes by accident; the
// highlighted part stays usable.
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { useLocation, useSearch } from "wouter"
import { ArrowLeft, ArrowRight, CheckCircle2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { findTour } from "./tours"
import type { Audience, Placement, Tour, TourStep } from "./types"
import { useTourViewer, visibleSteps } from "./audience"
import { markTourDone, nextTour, useDoneTours } from "./progress"
import { stepIndex, tourStore, useTourRun, type TourRun } from "./tourStore"
import { MISSING_TEXT, neededPlaceholders, resolveRoute, usePlaceholderValues } from "./placeholders"
import { usePhoneMode } from "@/components/phone/phoneStore"

const WAIT_MS = 5000
const POLL_MS = 100
const PAD = 6
const GAP = 12
const MARGIN = 12

type Rect = { top: number; left: number; width: number; height: number }

function reducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches
  } catch {
    return false
  }
}

/** The first element with this data-tour value that is actually on screen. */
function findTarget(target: string): HTMLElement | null {
  const all = document.querySelectorAll<HTMLElement>(`[data-tour="${CSS.escape(target)}"]`)
  for (const el of all) {
    const r = el.getBoundingClientRect()
    if (r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden") return el
  }
  return null
}

/**
 * The bottom of the sticky bars at the top of the page (the top bar and the
 * page header), which hide whatever scrolls under them.
 */
function stickyTop(target: HTMLElement): number {
  let bottom = 0
  const t = target.getBoundingClientRect()
  for (const el of document.querySelectorAll<HTMLElement>("#content .sticky")) {
    if (el.contains(target) || target.contains(el)) continue
    const r = el.getBoundingClientRect()
    // A bar beside the target (the page header next to a side panel) hides nothing of it.
    if (r.right <= t.left || r.left >= t.right) continue
    if (r.height > 0 && r.top <= 60 && r.bottom < window.innerHeight / 3 && getComputedStyle(el).position === "sticky") {
      bottom = Math.max(bottom, r.bottom)
    }
  }
  return bottom
}

/** The target, padded and clipped to the part of the screen it is seen in. */
function measure(el: HTMLElement): Rect {
  const r = el.getBoundingClientRect()
  const head = stickyTop(el)
  const minTop = r.bottom > head ? head : 0
  const top = Math.max(r.top - PAD, minTop + 2)
  const bottom = Math.min(r.bottom + PAD, window.innerHeight - 2)
  const left = Math.max(r.left - PAD, 2)
  const right = Math.min(r.right + PAD, window.innerWidth - 2)
  return { top, left, width: Math.max(0, right - left), height: Math.max(0, bottom - top) }
}

/**
 * Scrolls the target into view below the sticky header. A target that fits
 * is centred in the part of the screen below the header; a taller one is
 * scrolled so its top (its heading) sits just under the header.
 */
function bringIntoView(el: HTMLElement, smooth: boolean) {
  const head = stickyTop(el)
  const r = el.getBoundingClientRect()
  const vh = window.innerHeight
  const tall = r.height > vh - head - MARGIN * 2
  const fine = tall
    ? r.top >= head + PAD && r.top <= head + vh * 0.25
    : r.top >= head + PAD && r.bottom <= vh - PAD && r.left >= 0 && r.right <= window.innerWidth
  if (fine) return
  const prev = el.style.scrollMarginTop
  el.style.scrollMarginTop = `${head + MARGIN}px`
  el.scrollIntoView({ block: tall ? "start" : "center", inline: "nearest", behavior: smooth ? "smooth" : "auto" })
  el.style.scrollMarginTop = prev
}

/**
 * A sticky target (a side menu) does not move with scrollIntoView. When it
 * is still cut off once scrolling has settled, scroll the page by the part
 * that is hidden.
 */
function nudgeIntoView(el: HTMLElement, smooth: boolean) {
  const head = stickyTop(el)
  const r = el.getBoundingClientRect()
  const vh = window.innerHeight
  if (r.height > vh - head - MARGIN * 2) return
  let by = 0
  if (r.bottom > vh - PAD) by = r.bottom - vh + MARGIN + PAD
  else if (r.top < head) by = r.top - head - MARGIN
  if (by !== 0) window.scrollBy({ top: by, behavior: smooth ? "smooth" : "auto" })
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]'

function focusablesIn(el: HTMLElement | null): HTMLElement[] {
  if (!el || !el.isConnected) return []
  const list = [...(el.matches(FOCUSABLE) ? [el] : []), ...el.querySelectorAll<HTMLElement>(FOCUSABLE)]
  return list.filter((x) => x.getClientRects().length > 0).slice(0, 60)
}

/** A menu, select or popover opened from the page (Radix). */
function popupOpen(): boolean {
  return !!document.querySelector("[data-radix-popper-content-wrapper]")
}

/**
 * A dialog, alert or sheet the page opened (Radix), not the tour card and
 * not a popover. While one is open the tour steps aside.
 */
function pageDialogOpen(): boolean {
  for (const el of document.querySelectorAll('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]')) {
    if (el.closest("[data-tour-card], [data-radix-popper-content-wrapper]")) continue
    return true
  }
  return false
}

function usePageDialogOpen(): boolean {
  const [open, setOpen] = useState(pageDialogOpen)
  useEffect(() => {
    let frame = 0
    const check = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => setOpen(pageDialogOpen()))
    }
    check()
    const mo = new MutationObserver(check)
    mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-state"] })
    return () => {
      mo.disconnect()
      cancelAnimationFrame(frame)
    }
  }, [])
  return open
}

function sameRect(a: Rect | null, b: Rect | null) {
  return (
    a === b ||
    (!!a && !!b && a.top === b.top && a.left === b.left && a.width === b.width && a.height === b.height)
  )
}

const OPPOSITE: Record<Exclude<Placement, "center">, Exclude<Placement, "center">> = {
  top: "bottom",
  bottom: "top",
  left: "right",
  right: "left",
}

/** Where the card goes: next to the target per placement, flipped to stay on screen. */
function placeCard(rect: Rect | null, w: number, h: number, placement: Placement | undefined) {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(v, Math.max(min, max)))
  const center = { left: (vw - w) / 2, top: Math.max(MARGIN, (vh - h) / 2) }
  if (!rect || placement === "center") return center
  const pref = placement ?? "bottom"
  const order = [pref, OPPOSITE[pref], ...(["bottom", "top", "right", "left"] as const).filter((p) => p !== pref && p !== OPPOSITE[pref])]
  const maxTop = Math.max(MARGIN, vh - h - MARGIN)
  const maxLeft = Math.max(MARGIN, vw - w - MARGIN)
  // Next to the target on each side (pushed back on screen when needed),
  // then the four corners. The first one that covers the least of the
  // target wins, so a side with room always comes first.
  const candidates: { top: number; left: number }[] = []
  for (const p of order) {
    if (p === "bottom" || p === "top") {
      const top = p === "bottom" ? rect.top + rect.height + GAP : rect.top - GAP - h
      const left = clamp(rect.left + rect.width / 2 - w / 2, MARGIN, vw - w - MARGIN)
      candidates.push({ top: clamp(top, MARGIN, maxTop), left })
    } else {
      const left = p === "right" ? rect.left + rect.width + GAP : rect.left - GAP - w
      const top = clamp(rect.top + rect.height / 2 - h / 2, MARGIN, vh - h - MARGIN)
      candidates.push({ top, left: clamp(left, MARGIN, maxLeft) })
    }
  }
  candidates.push(
    { top: maxTop, left: maxLeft },
    { top: MARGIN, left: maxLeft },
    { top: maxTop, left: MARGIN },
    { top: MARGIN, left: MARGIN },
  )
  const covered = (c: { top: number; left: number }) => {
    const x = Math.min(c.left + w, rect.left + rect.width) - Math.max(c.left, rect.left)
    const y = Math.min(c.top + h, rect.top + rect.height) - Math.max(c.top, rect.top)
    return Math.max(0, x) * Math.max(0, y)
  }
  let best = candidates[0]
  let least = covered(best)
  for (const c of candidates.slice(1)) {
    const a = covered(c)
    if (a < least) {
      best = c
      least = a
    }
  }
  return best
}

export function TourRunner() {
  const run = useTourRun()
  const tour = run ? findTour(run.tourId) : undefined
  const unknown = !!run && !tour
  useEffect(() => {
    if (unknown) tourStore.end()
  }, [unknown])
  if (!run || !tour) return null
  return createPortal(<ActiveRun run={run} tour={tour} />, document.body)
}

function endTour() {
  tourStore.end()
  document.getElementById("content")?.focus({ preventScroll: true })
}

function ActiveRun({ run, tour }: { run: TourRun; tour: Tour }) {
  const { kind, personId } = useTourViewer()
  const steps = useMemo(() => visibleSteps(tour, kind), [tour, kind])
  const needed = useMemo(() => neededPlaceholders(tour), [tour])
  const values = usePlaceholderValues(needed, personId)

  if (run.phase === "finished" || steps.length === 0) {
    return <FinishCard tour={tour} kind={kind} personId={personId} />
  }
  const index = stepIndex(tour.steps, steps, run.stepId)
  const step = steps[index]
  const finish = () => {
    markTourDone(personId, tour.id)
    tourStore.finish()
  }
  return (
    <StepView
      key={`${tour.id}:${index}:${step.id}`}
      tour={tour}
      step={step}
      index={index}
      total={steps.length}
      resolved={resolveRoute(routeAt(steps, index), values)}
      onBack={() => index > 0 && tourStore.go(steps[index - 1].id)}
      onNext={() => (index + 1 >= steps.length ? finish() : tourStore.go(steps[index + 1].id))}
    />
  )
}

/**
 * A step without a route happens on the page of the step before it. Looking
 * back keeps Back and a reload on the right page.
 */
function routeAt(steps: TourStep[], index: number): string | undefined {
  for (let i = index; i >= 0; i--) if (steps[i].route) return steps[i].route
  return undefined
}

type Found = "waiting" | "found" | "missing" | "none"

function StepView({
  tour,
  step,
  index,
  total,
  resolved,
  onBack,
  onNext,
}: {
  tour: Tour
  step: TourStep
  index: number
  total: number
  resolved: ReturnType<typeof resolveRoute>
  onBack: () => void
  onNext: () => void
}) {
  const [location, navigate] = useLocation()
  const search = useSearch()
  const navigated = useRef(false)
  const [found, setFound] = useState<Found>(step.target ? "waiting" : "none")
  const [rect, setRect] = useState<Rect | null>(null)
  // A short grace period before the card shows while the target is looked
  // for, so it does not jump from the centre to the target at once.
  const [patient, setPatient] = useState(false)
  const card = useRef<HTMLDivElement>(null)
  const nextButton = useRef<HTMLButtonElement>(null)
  const [size, setSize] = useState({ w: 352, h: 200 })
  const titleId = useId()
  const reduce = useMemo(reducedMotion, [])
  const targetEl = useRef<HTMLElement | null>(null)
  // A dialog the page opened (from the highlighted part) goes first: the
  // tour hides until it closes. So does the phone preview when it opens over
  // the page (docked beside the page it leaves the tour alone).
  const dialogOpen = usePageDialogOpen()
  const phonePopup = usePhoneMode() === "popup"
  const paused = dialogOpen || phonePopup
  // Next pressed on an "opens" step before its target was found: pressed
  // again as soon as the target shows up (or is given up on).
  const [queued, setQueued] = useState(false)
  const queuedRef = useRef(false)
  const nextRef = useRef<(gaveUp?: boolean) => void>(() => {})

  const routeReady = resolved.kind !== "loading"
  const missingRoute = resolved.kind === "missing" ? resolved.placeholder : null

  // 1. Open the step's page once.
  useEffect(() => {
    if (resolved.kind !== "route" || navigated.current) return
    navigated.current = true
    const here = location + (search ? `?${search}` : "")
    if (resolved.route !== here) navigate(resolved.route)
  }, [resolved, location, search, navigate])

  // 2. Look for the target for up to five seconds, then keep it measured.
  useEffect(() => {
    if (!step.target || !routeReady) return
    if (missingRoute) {
      setFound("missing")
      return
    }
    const target = step.target
    // Set once the target is first seen; measuring only starts after that.
    let el: HTMLElement | null = null
    let frame = 0
    let foundAt = 0
    let nudged = false
    const started = Date.now()
    const update = () => {
      if (!el) return
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        // The page may have re-rendered the element: look it up again.
        if (el && !el.isConnected) el = findTarget(target) ?? el
        targetEl.current = el && el.isConnected ? el : null
        const next = el && el.isConnected ? measure(el) : null
        setRect((prev) => (sameRect(prev, next) ? prev : next))
      })
    }
    const poll = window.setInterval(() => {
      if (el) {
        // Once scrolling has settled, fix a target that is still cut off.
        if (!nudged && Date.now() - foundAt > 800) {
          nudged = true
          if (el.isConnected) nudgeIntoView(el, !reduce)
        }
        // Found: re-measure now and then, for layout that shifts by itself.
        update()
        return
      }
      el = findTarget(target)
      if (el) {
        foundAt = Date.now()
        targetEl.current = el
        bringIntoView(el, !reduce)
        setFound("found")
        update()
        if (queuedRef.current) nextRef.current()
      } else if (Date.now() - started > WAIT_MS) {
        setFound("missing")
        if (queuedRef.current) nextRef.current(true)
      }
    }, POLL_MS)
    window.addEventListener("resize", update)
    window.addEventListener("scroll", update, true)
    return () => {
      window.clearInterval(poll)
      cancelAnimationFrame(frame)
      targetEl.current = null
      window.removeEventListener("resize", update)
      window.removeEventListener("scroll", update, true)
    }
  }, [step.target, routeReady, missingRoute, reduce])

  useEffect(() => {
    const t = window.setTimeout(() => setPatient(true), 700)
    return () => window.clearTimeout(t)
  }, [])

  // The card's size, for placing it.
  useLayoutEffect(() => {
    const el = card.current
    if (!el) return
    const read = () => setSize((s) => (s.w === el.offsetWidth && s.h === el.offsetHeight ? s : { w: el.offsetWidth, h: el.offsetHeight }))
    read()
    const ro = new ResizeObserver(read)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Focus moves into the card on every step.
  useEffect(() => {
    nextButton.current?.focus({ preventScroll: true })
  }, [])

  // A step that opens something the next steps need (the Ask panel, the
  // Wiki editor): Next presses the highlighted part when the person did not.
  const next = (gaveUp = false) => {
    if (step.opens && step.target) {
      const el = targetEl.current?.isConnected ? targetEl.current : findTarget(step.target)
      if (!el && !gaveUp && found === "waiting" && !missingRoute) {
        queuedRef.current = true
        setQueued(true)
        return
      }
      if (el && !findTarget(step.opens)) el.click()
    }
    queuedRef.current = false
    onNext()
  }
  useLayoutEffect(() => {
    nextRef.current = next
  })

  useTourKeys(card, {
    onNext: next,
    onBack: index > 0 ? onBack : undefined,
    onEnd: endTour,
    target: targetEl,
    paused,
  })

  // Back on the card once a dialog the page opened has closed.
  useEffect(() => {
    if (!paused && card.current && !card.current.contains(document.activeElement)) {
      nextButton.current?.focus({ preventScroll: true })
    }
  }, [paused])

  if (paused) return null

  const spot = found === "found" ? rect : null
  const pos = placeCard(spot, size.w, size.h, step.placement)
  const visible = found !== "waiting" || patient
  const last = index + 1 >= total

  let note: string | null = null
  if (missingRoute) note = MISSING_TEXT[missingRoute]
  else if (found === "missing") note = "This part is not on screen right now. Press Next to go on."

  return (
    <Overlay spot={spot} reduce={reduce}>
      <div
        ref={card}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-tour-card=""
        style={{ top: pos.top, left: pos.left }}
        className={cn(
          "pointer-events-auto fixed z-[202] w-[min(22rem,calc(100vw-24px))] rounded-lg border bg-popover p-4 text-popover-foreground shadow-xl outline-none",
          !reduce && "transition-[top,left,opacity] duration-200 ease-out",
          visible ? "opacity-100" : "opacity-0",
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <p className="min-w-0 truncate text-xs text-muted-foreground">
            Tour: {tour.title}
          </p>
          <button
            type="button"
            onClick={endTour}
            aria-label="End tour"
            title="End tour (Esc)"
            className="-m-1 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <div
          className="mt-2 h-1 w-full overflow-hidden rounded-full bg-muted"
          aria-hidden
        >
          <div className="h-full rounded-full bg-primary" style={{ width: `${((index + 1) / total) * 100}%` }} />
        </div>
        <p className="mt-2 text-xs font-medium text-muted-foreground">
          Step {index + 1} of {total}
        </p>
        <h2 id={titleId} className="mt-1 text-base font-semibold leading-snug">
          {step.title}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{step.body}</p>
        {note && (
          <p className="mt-2 rounded-md bg-muted px-2.5 py-1.5 text-xs text-muted-foreground">{note}</p>
        )}
        <div className="mt-4 flex items-center justify-between gap-2">
          <Button size="sm" variant="outline" onClick={onBack} disabled={index === 0}>
            <ArrowLeft aria-hidden /> Back
          </Button>
          <Button ref={nextButton} size="sm" onClick={() => next()} disabled={queued}>
            {last ? (
              <>
                <CheckCircle2 aria-hidden /> Finish
              </>
            ) : (
              <>
                Next <ArrowRight aria-hidden />
              </>
            )}
          </Button>
        </div>
      </div>
      <p className="sr-only" aria-live="polite">
        {`Step ${index + 1} of ${total}: ${step.title}`}
      </p>
    </Overlay>
  )
}

/**
 * Dims the screen, with a cut-out around the target. The dimmed area blocks
 * clicks; the highlighted part stays usable, so a step can say "click Ask
 * now" or "press Edit this Wiki".
 */
function Overlay({ spot, reduce, children }: { spot: Rect | null; reduce: boolean; children: ReactNode }) {
  const block = (e: React.SyntheticEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }
  const blockers: CSSProperties[] = spot
    ? [
        { top: 0, left: 0, right: 0, height: Math.max(0, spot.top) },
        { top: spot.top + spot.height, left: 0, right: 0, bottom: 0 },
        { top: spot.top, left: 0, width: Math.max(0, spot.left), height: spot.height },
        { top: spot.top, left: spot.left + spot.width, right: 0, height: spot.height },
      ]
    : [{ inset: 0 }]
  return (
    <div className="pointer-events-none fixed inset-0 z-[200] print:hidden" data-tour-overlay="">
      {/* A menu or popover opened from the highlighted part shows above the dimming. */}
      <style>{"[data-radix-popper-content-wrapper]{z-index:203 !important}"}</style>
      {blockers.map((style, i) => (
        <div
          key={i}
          aria-hidden
          data-tour-blocker=""
          className="pointer-events-auto fixed"
          style={style}
          onMouseDown={block}
          onClick={block}
          onPointerDown={block}
          onContextMenu={block}
        />
      ))}
      {spot ? (
        <div
          aria-hidden
          className={cn(
            "pointer-events-none fixed z-[201] rounded-lg ring-2 ring-primary ring-offset-2 ring-offset-background",
            !reduce && "transition-all duration-200 ease-out",
          )}
          style={{
            top: spot.top,
            left: spot.left,
            width: spot.width,
            height: spot.height,
            boxShadow: "0 0 0 9999px rgb(0 0 0 / 0.6)",
          }}
        />
      ) : (
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-black/60" />
      )}
      {children}
    </div>
  )
}

/**
 * Keys while a tour runs. Right: next, Left: back, Enter: next when focus is
 * on the card (or nowhere), Escape: end. They leave text fields, menus and
 * other widgets on the page alone, and an open menu or dialog gets Escape
 * first. Tab moves between the card and the highlighted part only.
 * Ctrl+K search waits until the tour ends.
 */
function useTourKeys(
  card: React.RefObject<HTMLDivElement | null>,
  {
    onNext,
    onBack,
    onEnd,
    target,
    paused = false,
  }: {
    onNext: () => void
    onBack?: () => void
    onEnd: () => void
    target?: React.RefObject<HTMLElement | null>
    paused?: boolean
  },
) {
  const handlers = useRef({ onNext, onBack, onEnd, paused })
  useLayoutEffect(() => {
    handlers.current = { onNext, onBack, onEnd, paused }
  })
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const h = handlers.current
      // A dialog the page opened has the keys until it closes.
      if (h.paused) return
      const el = e.target instanceof HTMLElement ? e.target : null
      const inCard = !!card.current && !!el && card.current.contains(el)
      const onControl = inCard && !!el && !!el.closest("button, a")
      const nowhere = !el || el === document.body || el === document.documentElement || el.id === "content"
      const typing =
        !inCard &&
        !!el &&
        (el.isContentEditable || !!el.closest('input, textarea, select, [role="textbox"], [role="combobox"]'))
      const widget =
        !inCard &&
        !!el &&
        !!el.closest(
          '[role="menu"], [role="menubar"], [role="listbox"], [role="tablist"], [role="radiogroup"], [role="slider"], [role="grid"], [role="tree"]',
        )
      const stop = () => {
        e.preventDefault()
        e.stopPropagation()
      }
      if (e.key === "Escape") {
        // An open menu or select closes first.
        if (popupOpen()) return
        stop()
        h.onEnd()
      } else if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        if (typing || widget || popupOpen()) return
        stop()
        if (e.key === "ArrowRight") h.onNext()
        else h.onBack?.()
      } else if (e.key === "Enter") {
        // A focused button in the card handles Enter itself; Enter anywhere
        // on the page belongs to the page.
        if (onControl || !(inCard || nowhere)) return
        stop()
        h.onNext()
      } else if (e.key === "Tab") {
        if (popupOpen()) return
        const items = card.current?.querySelectorAll<HTMLElement>("button:not([disabled]), a[href]")
        if (!items || items.length === 0) return
        const list = [...items, ...focusablesIn(target?.current ?? null)]
        const at = list.indexOf(document.activeElement as HTMLElement)
        stop()
        // Cycle focus through the card and the highlighted element.
        let next: number
        if (e.shiftKey) next = at <= 0 ? list.length - 1 : at - 1
        else next = at === -1 || at === list.length - 1 ? 0 : at + 1
        list[next].focus()
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        stop()
      }
    }
    window.addEventListener("keydown", onKey, true)
    return () => window.removeEventListener("keydown", onKey, true)
  }, [card])
}

function FinishCard({ tour, kind, personId }: { tour: Tour; kind: Audience; personId: string | null }) {
  const [, navigate] = useLocation()
  const { done } = useDoneTours(personId)
  const next = nextTour(tour, kind, done)
  const card = useRef<HTMLDivElement>(null)
  const first = useRef<HTMLButtonElement>(null)
  const titleId = useId()
  useEffect(() => {
    first.current?.focus({ preventScroll: true })
  }, [])
  const go = (path: string) => {
    tourStore.end()
    navigate(path)
  }
  useTourKeys(card, {
    onNext: () => go(next ? `/instructions/${next.id}` : "/instructions"),
    onEnd: endTour,
  })
  return (
    <Overlay spot={null} reduce={reducedMotion()}>
      <div
        ref={card}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-tour-card=""
        className="pointer-events-auto fixed left-1/2 top-1/2 z-[202] w-[min(24rem,calc(100vw-24px))] -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-popover p-5 text-popover-foreground shadow-xl"
      >
        <div className="flex items-start justify-between gap-3">
          <CheckCircle2 className="h-6 w-6 shrink-0 text-status-published" aria-hidden />
          <button
            type="button"
            onClick={endTour}
            aria-label="Close"
            className="-m-1 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <h2 id={titleId} className="mt-2 text-base font-semibold">
          Tour done
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          You finished "{tour.title}". It is marked as done in Instructions.
        </p>
        <div className="mt-4 flex flex-col gap-2">
          {next && (
            <Button ref={first} size="sm" className="w-full justify-between" onClick={() => go(`/instructions/${next.id}`)}>
              <span className="truncate">Next tour: {next.title}</span>
              <ArrowRight aria-hidden />
            </Button>
          )}
          <Button
            ref={next ? undefined : first}
            size="sm"
            variant={next ? "outline" : "default"}
            className="w-full"
            onClick={() => go("/instructions")}
          >
            Back to Instructions
          </Button>
        </div>
        <p className="sr-only" aria-live="polite">
          {`Tour done: ${tour.title}`}
        </p>
      </div>
    </Overlay>
  )
}
