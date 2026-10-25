import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react"
import { useLocation } from "wouter"
import { MessageSquareText, Undo2 } from "lucide-react"
import { PHONE_DOCK_W, setPhoneMode, usePhoneMode } from "@/components/phone/phoneStore"
import { cn } from "@/lib/utils"
import { AskPanel, type AskPanelScope } from "./AskPanel"
import { useScopeLabel } from "./ScopeChip"

// The one Ask side panel on the desktop, mounted once by the shell. From
// 1024px it docks on the right and the page gets narrower; below that it
// slides over the page. Next to a docked phone it docks to the phone's left
// (the sidebar folds to its icon rail to make room); when even that leaves the
// page too narrow it takes the phone's place until it closes, so it never
// covers the page. Every way into Ask opens this panel: the top-bar button,
// Ctrl+J, openAsk() from Ctrl+K and the "Ask about this" entries on pages.
// Its scope follows the page.

const OPEN_KEY = "oppr.ask.open"
const WIDTH_KEY = "oppr.ask.width"
const MIN_W = 340
const MAX_W = 720
const DEFAULT_W = 420
/** Viewport width from which Ask docks instead of sliding over the page. */
const DOCK_FROM = 1024
/** The page column never gets narrower than this beside a docked Ask. */
const CONTENT_MIN = 560
/** Dragging Ask wider stops where the page column would drop below this. */
const CONTENT_COMFORT = 620
/** The desktop sidebar (DesktopShell): full from 1280px, else its icon rail. */
const SIDEBAR_FULL = 240
const SIDEBAR_RAIL = 64
const SIDEBAR_FULL_FROM = 1280

// --- Store -------------------------------------------------------------------

interface AskRequest {
  question: string | null
  scope: AskPanelScope | null
  n: number
}

let open = readOpen()
let request: AskRequest | null = null
let counter = 0
const listeners = new Set<() => void>()

function readOpen(): boolean {
  try {
    return window.sessionStorage.getItem(OPEN_KEY) === "1"
  } catch {
    return false
  }
}

function setOpen(next: boolean) {
  open = next
  try {
    window.sessionStorage.setItem(OPEN_KEY, next ? "1" : "0")
  } catch {
    // Storage blocked: Ask just starts closed after a reload.
  }
  listeners.forEach((l) => l())
}

function subscribe(l: () => void) {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

function useAskRequest(): AskRequest | null {
  return useSyncExternalStore(subscribe, () => request, () => null)
}

/**
 * Opens Ask. With a question it is asked straight away; with a scope the
 * panel switches to it. A question without a scope is about the whole library.
 */
export function openAsk(question?: string, scope?: AskPanelScope) {
  const q = question?.trim() || null
  request = { question: q, scope: scope ?? (q ? { kind: "library" } : null), n: ++counter }
  setOpen(true)
}

/** Closes Ask (a tour starts from a clean screen). */
export function closeAsk() {
  setOpen(false)
}

/** True while the Ask panel is open (pages hide their own Ask starters then). */
export function useAskOpen(): boolean {
  return useSyncExternalStore(subscribe, () => open, () => false)
}

// A page can set its own scope (a tab of Learn), overriding the route's.
let pageScope: AskPanelScope | null = null
const pageListeners = new Set<() => void>()

function subscribePage(l: () => void) {
  pageListeners.add(l)
  return () => {
    pageListeners.delete(l)
  }
}

/** Sets Ask's scope while this page shows; null leaves it to the route. */
export function useAskPageScope(scope: AskPanelScope | null) {
  const key = scope ? scopeKey(scope) : null
  useEffect(() => {
    if (!scope) return
    pageScope = scope
    pageListeners.forEach((l) => l())
    return () => {
      if (pageScope && scopeKey(pageScope) === key) {
        pageScope = null
        pageListeners.forEach((l) => l())
      }
    }
    // The key stands for the scope.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
}

function usePageScope(): AskPanelScope | null {
  return useSyncExternalStore(subscribePage, () => pageScope, () => null)
}

function toggleAsk() {
  setOpen(!open)
}

// --- Scope from the route ------------------------------------------------------

function scopeForLocation(loc: string): AskPanelScope | null {
  if (loc === "/settings" || loc.startsWith("/settings/")) return null
  // The Developer section and its case files: tools, not Knowledge.
  if (loc === "/dev" || loc.startsWith("/dev/")) return null
  if (loc.startsWith("/analysis")) return null
  if (loc.startsWith("/docs/new")) return null
  if (loc.startsWith("/import")) return null
  if (loc.startsWith("/templates")) return null
  if (askBlockedAt(loc)) return null
  if (/^\/docs\/[^/]+\/edit$/.test(loc)) return null

  const docMatch = loc.match(/^\/docs\/([^/]+)$/)
  if (docMatch) return { kind: "doc", id: docMatch[1] }

  const assetMatch = loc.match(/^\/assets\/([^/]+)$/)
  if (assetMatch) return { kind: "asset", id: assetMatch[1] }

  const wikiMatch = loc.match(/^\/wiki\/([a-z0-9]{32})$/)
  if (wikiMatch) return { kind: "wiki", id: wikiMatch[1] }

  const trainingMatch = loc.match(/^\/learn\/trainings\/([a-z0-9]{32})$/)
  if (trainingMatch) return { kind: "training", id: trainingMatch[1] }

  if (loc === "/learn/skills" || loc.startsWith("/learn/skills/") || loc.startsWith("/learn/people/"))
    return { kind: "skills" }

  return { kind: "library" }
}

/**
 * Ask is never shown during an Attempt (no help in the test), on the Floor
 * simulator (its phone has its own Ask) or in the guided writer (its own chat
 * writes the Draft).
 */
function askBlockedAt(loc: string): boolean {
  return loc.startsWith("/learn/attempts") || loc.startsWith("/floor") || loc === "/docs/new/compose"
}

/** True when the Ask button shows on this route. */
export function askButtonShownAt(location: string): boolean {
  return scopeForLocation(location) !== null
}

function scopeKey(s: AskPanelScope): string {
  return s.kind === "library" || s.kind === "skills" ? s.kind : `${s.kind}:${s.id}`
}

// --- Layout --------------------------------------------------------------------

function readWidth(): number {
  try {
    const n = Number(window.localStorage.getItem(WIDTH_KEY))
    return Number.isFinite(n) && n >= MIN_W && n <= MAX_W ? n : DEFAULT_W
  } catch {
    return DEFAULT_W
  }
}

function saveWidth(w: number) {
  try {
    window.localStorage.setItem(WIDTH_KEY, String(Math.round(w)))
  } catch {
    // Storage blocked: the width resets on reload.
  }
}

function subscribeResize(l: () => void) {
  window.addEventListener("resize", l)
  return () => window.removeEventListener("resize", l)
}

function useViewportWidth(): number {
  return useSyncExternalStore(subscribeResize, () => window.innerWidth, () => 1440)
}

interface AskLayout {
  /** Ask docks beside the page (else it slides over, or takes the phone's place). */
  docked: boolean
  /** Ask sits where the docked phone is, until it closes. */
  inPhoneSlot: boolean
  /** The sidebar folds to its icon rail so Ask and the phone both fit. */
  railSidebar: boolean
  maxW: number
}

function askLayout(viewport: number, phoneDocked: boolean, shown: boolean): AskLayout {
  const free = viewport - (phoneDocked ? PHONE_DOCK_W : 0)
  const fullSidebar = viewport >= SIDEBAR_FULL_FROM
  const fits = (sidebar: number) => free - sidebar - MIN_W >= CONTENT_MIN
  const docked = viewport >= DOCK_FROM && fits(SIDEBAR_RAIL)
  const railSidebar = shown && docked && fullSidebar && !fits(SIDEBAR_FULL)
  const sidebar = fullSidebar && !railSidebar ? SIDEBAR_FULL : SIDEBAR_RAIL
  return {
    docked,
    inPhoneSlot: !docked && phoneDocked,
    railSidebar,
    maxW: Math.max(MIN_W, Math.min(MAX_W, free - sidebar - CONTENT_COMFORT)),
  }
}

/** True when an open, docked Ask needs the sidebar folded to its rail (DesktopShell). */
export function useAskFoldsSidebar(): boolean {
  const [location] = useLocation()
  const isOpen = useAskOpen()
  const phoneDocked = usePhoneMode() === "docked"
  const viewport = useViewportWidth()
  return askLayout(viewport, phoneDocked, isOpen && !askBlockedAt(location)).railSidebar
}

/** Ask and the docked phone fit side by side at this width. */
function fitsBesidePhone(viewport: number) {
  return askLayout(viewport, true, true).docked
}

// --- Top-bar button ------------------------------------------------------------

/** The Ask button in the top bar. Opens and closes the panel. */
export function AskTopBarButton() {
  const [location] = useLocation()
  const isOpen = useAskOpen()
  if (!askButtonShownAt(location)) return null
  return (
    <button
      type="button"
      onClick={() => (isOpen ? closeAsk() : openAsk())}
      aria-pressed={isOpen}
      aria-keyshortcuts="Control+J"
      data-tour="start-ask-button"
      title="Ask a question, answered from Published documents (Ctrl+J)"
      className={cn(
        "flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border px-2.5 text-xs font-medium text-primary-strong transition-colors print:hidden",
        isOpen
          ? "border-primary/60 bg-primary/15 ring-1 ring-inset ring-primary/30"
          : "border-primary/40 bg-primary/10 [@media(hover:hover)]:hover:bg-primary/15",
      )}
    >
      <MessageSquareText className="h-3.5 w-3.5" aria-hidden />
      Ask
      {!isOpen && (
        <kbd className="hidden rounded border border-primary/30 px-1 font-sans text-xs text-primary-strong/80 xl:inline">
          Ctrl J
        </kbd>
      )}
    </button>
  )
}

// --- The dock ------------------------------------------------------------------

export function AskDock() {
  const [location] = useLocation()
  const isOpen = useAskOpen()
  const req = useAskRequest()
  const phoneMode = usePhoneMode()
  const phoneDocked = phoneMode === "docked"
  const viewport = useViewportWidth()
  const blocked = askBlockedAt(location)
  const { docked, inPhoneSlot, maxW } = askLayout(viewport, phoneDocked, isOpen && !blocked)

  const declaredScope = usePageScope()
  const routeScope = blocked ? null : (declaredScope ?? scopeForLocation(location))
  const [scope, setScope] = useState<AskPanelScope>(routeScope ?? { kind: "library" })
  const scopeRef = useRef(scope)
  scopeRef.current = scope
  // The scope before the page changed it, so its thread stays one click away.
  const [prevScope, setPrevScope] = useState<AskPanelScope | null>(null)
  const [question, setQuestion] = useState<string | null>(null)
  // A link followed from inside the panel (a cited passage) keeps the scope.
  const panelNavRef = useRef<string | null>(null)

  const [width, setWidth] = useState(readWidth)
  const shownW = Math.min(width, maxW)

  // Follow the page.
  const routeKey = routeScope ? scopeKey(routeScope) : null
  useEffect(() => {
    const fromPanel = panelNavRef.current
    panelNavRef.current = null
    if (fromPanel && fromPanel === location) return
    if (!routeScope) return
    const cur = scopeRef.current
    if (scopeKey(cur) === scopeKey(routeScope)) return
    setPrevScope(open ? cur : null)
    setScope(routeScope)
    // routeScope is derived from location.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location, routeKey])

  // A request from openAsk(): switch scope and ask its question.
  useEffect(() => {
    if (!req) return
    if (req.scope) {
      setScope(req.scope)
      setPrevScope(null)
    }
    setQuestion(req.question)
  }, [req])

  // Opening Ask next to a floating phone docks the phone when both fit, so
  // both stay usable.
  useEffect(() => {
    if (isOpen && phoneMode === "popup" && fitsBesidePhone(viewport)) setPhoneMode("docked")
    // Only when Ask opens; a phone floated later stays floating.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  // Docking the phone where Ask cannot sit beside it: the phone was opened
  // last, so it gets the side and Ask closes (Ctrl+J brings it back).
  const prevPhone = useRef(phoneMode)
  useEffect(() => {
    const was = prevPhone.current
    prevPhone.current = phoneMode
    if (was !== "docked" && phoneMode === "docked" && open && !fitsBesidePhone(viewport)) closeAsk()
    // Only on a change of the phone's mode.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phoneMode])

  // Ctrl+J opens and closes Ask anywhere it is allowed.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "j") {
        if (blocked) return
        e.preventDefault()
        toggleAsk()
      } else if (e.key === "Escape" && open && !docked && !document.querySelector("[role=dialog][data-state=open]")) {
        closeAsk()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [blocked, docked])

  const onBeforeNavigate = useCallback(
    (path: string) => {
      panelNavRef.current = path.split("?")[0].split("#")[0]
      // Over the page, the panel would hide the passage: step aside.
      if (!docked && !inPhoneSlot) closeAsk()
    },
    [docked, inPhoneSlot],
  )

  // Resize by dragging the left edge; the width is remembered per browser.
  const drag = useRef<{ x: number; w: number } | null>(null)
  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { x: e.clientX, w: shownW }
  }
  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!drag.current) return
    setWidth(Math.min(maxW, Math.max(MIN_W, drag.current.w + (drag.current.x - e.clientX))))
  }
  function onPointerUp() {
    if (!drag.current) return
    drag.current = null
    saveWidth(shownW)
  }
  function onHandleKey(e: ReactKeyboardEvent<HTMLDivElement>) {
    const step = e.shiftKey ? 64 : 16
    let next: number | null = null
    if (e.key === "ArrowLeft") next = shownW + step
    else if (e.key === "ArrowRight") next = shownW - step
    if (next == null) return
    e.preventDefault()
    next = Math.min(maxW, Math.max(MIN_W, next))
    setWidth(next)
    saveWidth(next)
  }

  // Toasts (App.tsx) keep clear of whatever is docked on the right.
  const dockRight = (phoneDocked ? PHONE_DOCK_W : 0) + (isOpen && !blocked && docked ? shownW : 0)
  useEffect(() => {
    document.documentElement.style.setProperty("--dock-right", `${dockRight}px`)
  }, [dockRight])

  if (!isOpen || blocked) return null

  const panel = (
    <AskPanel
      key={scopeKey(scope)}
      scope={scope}
      onScopeChange={(next) => {
        setPrevScope(null)
        setScope(next)
      }}
      autoFocus
      initialQuestion={question}
      onInitialQuestionSent={() => setQuestion(null)}
      onClose={closeAsk}
      onBeforeNavigate={onBeforeNavigate}
      notice={
        prevScope ? (
          <ScopeFollowNotice
            prev={prevScope}
            onBack={() => {
              setScope(prevScope)
              setPrevScope(null)
            }}
          />
        ) : null
      }
      className="h-full rounded-none border-0 shadow-none"
    />
  )

  if (docked) {
    return (
      <aside
        aria-label="Ask"
        data-tour="start-ask-panel"
        className="sticky top-0 z-20 flex h-screen shrink-0 self-start border-l bg-card print:hidden"
        style={{ width: shownW }}
      >
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize Ask"
          aria-valuemin={MIN_W}
          aria-valuemax={maxW}
          aria-valuenow={Math.round(shownW)}
          tabIndex={0}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onKeyDown={onHandleKey}
          title="Drag to resize"
          className="group absolute inset-y-0 -left-1 z-10 w-2 cursor-col-resize touch-none focus-visible:outline-none"
        >
          <span className="absolute inset-y-0 left-[3px] w-0.5 bg-transparent transition-colors group-hover:bg-primary/40 group-focus-visible:bg-primary group-active:bg-primary" />
        </div>
        <div className="min-w-0 flex-1">{panel}</div>
      </aside>
    )
  }

  // Beside a docked phone with no room for both: take the phone's place, so
  // the page, its header and the top bar stay clear. Closing Ask shows the
  // phone again.
  if (inPhoneSlot) {
    return (
      <aside
        aria-label="Ask"
        data-tour="start-ask-panel"
        className="fixed inset-y-0 right-0 z-[46] flex border-l bg-card shadow-xl animate-in slide-in-from-right-8 print:hidden"
        style={{ width: PHONE_DOCK_W }}
      >
        <div className="min-w-0 flex-1">{panel}</div>
      </aside>
    )
  }

  // Not enough room to dock: slide over the page.
  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-neutral-950/30 animate-in fade-in-0 print:hidden"
        onClick={closeAsk}
        aria-hidden
      />
      <aside
        aria-label="Ask"
        data-tour="start-ask-panel"
        className="fixed inset-y-0 right-0 z-40 flex border-l bg-card shadow-xl animate-in slide-in-from-right-8 print:hidden"
        style={{ width: Math.min(DEFAULT_W, viewport - 24) }}
      >
        <div className="min-w-0 flex-1">{panel}</div>
      </aside>
    </>
  )
}

/** "Following this page", with a way back to the thread it replaced. */
function ScopeFollowNotice({ prev, onBack }: { prev: AskPanelScope; onBack: () => void }) {
  const label = useScopeLabel(prev)
  const name = label.code ?? (prev.kind === "library" ? "the library" : label.title) ?? label.kindLabel
  return (
    <div className="flex items-center gap-2 border-b bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground">
      <span className="min-w-0 flex-1">Now following this page.</span>
      <button
        type="button"
        onClick={onBack}
        className="inline-flex min-w-0 items-center gap-1 font-medium text-primary-strong hover:underline"
      >
        <Undo2 className="h-3 w-3 shrink-0" aria-hidden />
        <span className="truncate">Back to {name}</span>
      </button>
    </div>
  )
}
