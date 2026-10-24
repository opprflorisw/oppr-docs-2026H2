// The document reader on the floor. Built for one hand at the machine:
// a sticky section bar (Safety, Steps, Checks, If wrong) that opens an SOP
// at its Steps, a "Step by step" mode with one step per screen, and a
// sticky bottom bar with Ask and Step by step. Share, PDF and Copy code
// live in the header's "..." sheet.

import {
  Component,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { useLocation, useRoute, useSearch } from "wouter"
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Copy,
  Home,
  ListOrdered,
  Maximize2,
  MessageSquare,
  MoreHorizontal,
  Share2,
  Star,
  X,
} from "lucide-react"
import { useQuery } from "convex/react"
import { toast } from "sonner"
import { useRecordUsage } from "@/lib/usage"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import { toLegacyAsset, toLegacyDoc } from "@/lib/convex-adapters"
import { Skeleton } from "@/components/ui/skeleton"
import { MobileHeader } from "@/components/mobile/MobileHeader"
import { MobileDocSummary } from "@/components/mobile/MobileDocSummary"
import { FloorPrimaryButton, FloorSecondaryButton, MobileSheet } from "@/components/mobile/MobileSheet"
import { extractPpeItems } from "@/components/docs/DocumentHero"
import { PublishToPdfDialog } from "@/components/docs/PublishToPdfDialog"
import { looksLikeConvexId, usePinned, useRecentlyViewed } from "@/components/mobile/use-mobile-prefs"
import { cn } from "@/lib/utils"
import { formatDate } from "@/lib/time"

const PdfViewer = lazy(() => import("@/components/docs/PdfViewer").then((m) => ({ default: m.PdfViewer })))
// A Wrapped manual shows its stamped Published PDF (the controlled copy).
const WrappedManualMobile = lazy(() => import("@/components/manuals/WrappedManualMobile"))
const TiptapReadOnly = lazy(() =>
  import("@/components/docs/TiptapReadOnly").then((m) => ({
    default: m.TiptapReadOnly,
  })),
)

class ViewerErrorBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false }
  static getDerivedStateFromError() {
    return { hasError: true }
  }
  componentDidCatch(error: unknown) {
    console.warn("[oppr-docs] Viewer failed to load:", error)
  }
  render() {
    if (this.state.hasError) return this.props.fallback
    return this.props.children
  }
}

const VIEWER_FALLBACK = <div className="p-6 text-base text-muted-foreground">Opening the document...</div>
const VIEWER_UNAVAILABLE = <div className="p-6 text-base text-muted-foreground">This document cannot be shown here.</div>

// ---- Sections and steps found in the rendered body ----------------------------

type SectionKey = "safety" | "steps" | "checks" | "wrong"
const SECTION_LABEL: Record<SectionKey, string> = {
  safety: "Safety",
  steps: "Steps",
  checks: "Checks",
  wrong: "If wrong",
}
const SECTION_RULES: [SectionKey, RegExp][] = [
  ["wrong", /\b(if (something|it) (goes|is) wrong|troubleshoot|problem|fault|deviation|what to do if|error|abnormal|if wrong)/i],
  ["safety", /\b(safety|ppe|hazard|risk|lmra|warning|danger|lockout|loto|protective)/i],
  ["checks", /\b(check|inspect|verif|quality|control|acceptance|criteria|measure)/i],
  ["steps", /\b(steps?|procedure|instruction|method|how to|work sequence|execution|activities|start-?up|changeover)\b/i],
]

type Found = { key: SectionKey; el: HTMLElement }

function findSections(root: HTMLElement): Found[] {
  const out: Found[] = []
  const seen = new Set<SectionKey>()
  for (const h of Array.from(root.querySelectorAll<HTMLElement>("h1, h2, h3"))) {
    const text = h.textContent ?? ""
    const rule = SECTION_RULES.find(([, re]) => re.test(text))
    if (!rule || seen.has(rule[0])) continue
    seen.add(rule[0])
    h.style.scrollMarginTop = "128px"
    out.push({ key: rule[0], el: h })
  }
  const order: SectionKey[] = ["safety", "steps", "checks", "wrong"]
  return out.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key))
}

function findSteps(root: HTMLElement): string[] {
  const items = Array.from(root.querySelectorAll<HTMLElement>("[data-step-item]"))
  if (items.length > 0) {
    return items.map((li) => (li.querySelector(".step-item-body") ?? li).innerHTML)
  }
  // Plain numbered lists: their top-level items, in order.
  return Array.from(root.querySelectorAll<HTMLElement>("ol > li"))
    .filter((li) => !li.parentElement?.closest("li"))
    .map((li) => li.innerHTML)
}

export function MobileDocPage() {
  const [, params] = useRoute<{ id: string }>("/m/docs/:id")
  const id = params?.id ?? ""
  const search = useSearch()
  const [, navigate] = useLocation()
  const { isPinned, togglePin, removePin } = usePinned()
  const { pushRecent, removeRecent } = useRecentlyViewed()
  const [fullscreen, setFullscreen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [stepIndex, setStepIndex] = useState<number | null>(null)
  const [sections, setSections] = useState<Found[]>([])
  const [steps, setSteps] = useState<string[]>([])
  const [activeSection, setActiveSection] = useState<SectionKey | null>(null)

  // Pre-Convex localStorage entries (doc-1, ...) would crash the id
  // validator: skip the queries and show the recovery screen.
  const idIsConvexShaped = looksLikeConvexId(id)
  useEffect(() => {
    if (!idIsConvexShaped && id) {
      removePin("doc", id)
      removeRecent("doc", id)
    }
  }, [idIsConvexShaped, id, removePin, removeRecent])

  const initialPage = useMemo(() => {
    const p = new URLSearchParams(search).get("page")
    const n = p ? parseInt(p, 10) : 1
    return Number.isFinite(n) && n > 0 ? n : 1
  }, [search])

  // ?hl=<passage start> (from an Ask citation or a Training source) scrolls
  // to and highlights the cited passage once the body has rendered.
  const highlight = useMemo(() => new URLSearchParams(search).get("hl"), [search])
  const bodyRef = useRef<HTMLDivElement>(null)

  useRecordUsage({
    kind: "view",
    documentId: id && idIsConvexShaped ? (id as Id<"documents">) : undefined,
  })
  const docResult = useQuery(api.documents.getWithAssets, id && idIsConvexShaped ? { id: id as Id<"documents"> } : "skip")
  const ready = idIsConvexShaped ? docResult !== undefined : true
  const currentVersion = useQuery(
    api.documents.getPublishedVersion,
    id && idIsConvexShaped ? { documentId: id as Id<"documents"> } : "skip",
  )
  const pdfUrl = useQuery(api.files.getUrl, currentVersion?.pdfStorageId ? { storageId: currentVersion.pdfStorageId } : "skip")

  const doc = useMemo(() => {
    if (!docResult) return null
    return { ...toLegacyDoc(docResult.doc), assets: docResult.assets.map(toLegacyAsset) }
  }, [docResult])

  const bodyKind = currentVersion?.bodyKind
  const bodyJson = currentVersion?.bodyJson
  const bodyReady = bodyKind === "tiptap" && bodyJson != null

  // Find sections and steps once the lazy body has rendered.
  useEffect(() => {
    if (!bodyReady) return
    let tries = 0
    const t = window.setInterval(() => {
      tries += 1
      const root = bodyRef.current
      if (root && root.querySelector(".ProseMirror, p, li, h1, h2, h3")) {
        setSections(findSections(root))
        setSteps(findSteps(root))
        window.clearInterval(t)
      } else if (tries > 40) window.clearInterval(t)
    }, 150)
    return () => window.clearInterval(t)
  }, [bodyReady, bodyJson])

  // An SOP opens at its Steps (the PPE summary stays one swipe up).
  const openedAtSteps = useRef(false)
  useEffect(() => {
    if (openedAtSteps.current || highlight || doc?.type !== "sop") return
    const s = sections.find((x) => x.key === "steps")
    if (!s) return
    openedAtSteps.current = true
    window.setTimeout(() => s.el.scrollIntoView({ block: "start" }), 50)
  }, [sections, doc?.type, highlight])

  // Which section is on screen, for the section bar.
  useEffect(() => {
    if (sections.length === 0 || typeof IntersectionObserver === "undefined") return
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            const hit = sections.find((s) => s.el === e.target)
            if (hit) setActiveSection(hit.key)
          }
        }
      },
      { rootMargin: "-130px 0px -60% 0px" },
    )
    for (const s of sections) io.observe(s.el)
    return () => io.disconnect()
  }, [sections])

  useEffect(() => {
    if (!highlight || !bodyReady) return
    const needle = normaliseText(highlight).slice(0, 60)
    if (!needle) return
    // The body is lazy and its images load late, so look again for a while
    // and re-centre once the layout has settled.
    let tries = 0
    let found: HTMLElement | null = null
    let removeTimer: number | undefined
    const timer = window.setInterval(() => {
      tries += 1
      const root = bodyRef.current
      if (!found && root) {
        const blocks = root.querySelectorAll<HTMLElement>("p, li, td, th, h1, h2, h3, h4")
        const hit = Array.from(blocks).find((el) => normaliseText(el.textContent ?? "").includes(needle))
        if (hit) {
          found = hit.closest<HTMLElement>("li, tr") ?? hit
          found.classList.add("wiki-cited-passage")
          removeTimer = window.setTimeout(() => found?.classList.remove("wiki-cited-passage"), 8000)
        }
      }
      if (found && (tries <= 3 || tries % 4 === 0)) {
        found.scrollIntoView({ behavior: tries <= 1 ? "auto" : "smooth", block: "center" })
      }
      if (tries >= 12) window.clearInterval(timer)
    }, 250)
    return () => {
      window.clearInterval(timer)
      if (removeTimer) window.clearTimeout(removeTimer)
    }
  }, [highlight, bodyReady])

  useEffect(() => {
    if (!doc) return
    pushRecent({ kind: "doc", id: doc.id, label: doc.title, sublabel: doc.naming_code })
  }, [doc, pushRecent])

  const handleCopy = useCallback(() => {
    if (!doc) return
    navigator.clipboard
      .writeText(doc.naming_code)
      .then(() => toast.success(`Copied ${doc.naming_code}`))
      .catch(() => toast.error("Could not copy. Read the code from the top of the page."))
  }, [doc])

  if (!idIsConvexShaped || (ready && !doc)) {
    return (
      <div className="flex h-full flex-col">
        <MobileHeader backTo="/m/find?in=docs" title="Document not found" />
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-300">
            <AlertTriangle className="h-7 w-7" />
          </div>
          <div className="text-lg font-semibold">This document is no longer available</div>
          <div className="text-base text-muted-foreground">It may have been removed since you last opened it.</div>
          <FloorPrimaryButton
            className="mt-2"
            onClick={() => {
              if (id) {
                removePin("doc", id)
                removeRecent("doc", id)
              }
              navigate("/m")
            }}
          >
            <Home className="h-5 w-5" />
            Back to Home
          </FloorPrimaryButton>
        </div>
      </div>
    )
  }

  if (!ready || !doc) {
    return (
      <div className="flex flex-col">
        <MobileHeader backTo="/m/find?in=docs" title="Loading" />
        <div className="space-y-3 p-4">
          <Skeleton className="h-24 w-full rounded-2xl" />
          <Skeleton className="h-64 w-full rounded-2xl" />
        </div>
      </div>
    )
  }

  async function handleShare() {
    if (!doc) return
    const shareData = { title: doc.title, text: `${doc.naming_code} · ${doc.title}` }
    if (typeof navigator.share === "function") {
      try {
        await navigator.share(shareData)
      } catch {
        // cancelled
      }
    } else {
      handleCopy()
      toast.message("Sharing is not available here. The code is copied instead.")
    }
  }

  const saved = isPinned("doc", doc.id)
  const wrapped = docResult?.doc.origin === "wrapped"
  const backTo = doc.assets[0] ? `/m/assets/${doc.assets[0].id}` : "/m/find?in=docs"
  const askHref = `/m/ask?scope=doc:${doc.id}`

  const body =
    currentVersion === undefined ? (
      <Skeleton className="h-64 w-full rounded-2xl" />
    ) : !currentVersion ? (
      <div className="rounded-2xl border bg-card p-6 text-center text-base text-muted-foreground">
        {doc.status === "archived"
          ? "This document is archived. It is no longer valid, so do not work from it."
          : "This document is not Published yet, so it cannot be used on the floor."}
      </div>
    ) : bodyKind === "pdf" ? (
      <ViewerErrorBoundary fallback={VIEWER_UNAVAILABLE}>
        <Suspense fallback={VIEWER_FALLBACK}>
          {wrapped ? (
            <WrappedManualMobile documentId={docResult!.doc._id} version={currentVersion.version} initialPage={initialPage} />
          ) : (
            <PdfViewer url={pdfUrl ?? null} pageNumber={initialPage} />
          )}
        </Suspense>
      </ViewerErrorBoundary>
    ) : bodyKind === "tiptap" ? (
      bodyJson == null ? (
        <div className="rounded-2xl border bg-card p-6 text-center text-base text-muted-foreground">This document is empty.</div>
      ) : (
        <ViewerErrorBoundary fallback={VIEWER_UNAVAILABLE}>
          <Suspense fallback={VIEWER_FALLBACK}>
            <div ref={bodyRef} className="floor-doc-body [&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto">
              <TiptapReadOnly content={bodyJson} />
            </div>
          </Suspense>
        </ViewerErrorBoundary>
      )
    ) : (
      <div className="rounded-2xl border bg-card p-6 text-center text-base text-muted-foreground">This document cannot be shown here.</div>
    )

  return (
    <div className="flex min-h-full flex-col">
      <div className="sticky top-0 z-10">
        <MobileHeader
          backTo={backTo}
          title={doc.title}
          subtitle={<span className="font-mono">{doc.naming_code}</span>}
          checkIn={false}
          right={
            <>
              <button
                type="button"
                aria-pressed={saved}
                aria-label={saved ? "Saved. Remove from Saved" : "Save this document"}
                className="flex h-11 w-11 items-center justify-center rounded-full"
                onClick={() => togglePin({ kind: "doc", id: doc.id, label: doc.title, sublabel: doc.naming_code })}
              >
                <Star className={cn("h-6 w-6", saved ? "fill-amber-500 text-amber-500" : "text-muted-foreground")} />
              </button>
              <button
                type="button"
                aria-label="More: share, PDF, copy code"
                className="flex h-11 w-11 items-center justify-center rounded-full"
                onClick={() => setMenuOpen(true)}
              >
                <MoreHorizontal className="h-6 w-6" />
              </button>
            </>
          }
        />
        {sections.length > 1 && (
          <nav aria-label="Sections" className="flex gap-2 overflow-x-auto border-b bg-background/95 px-3 py-2 backdrop-blur">
            {sections.map((s) => (
              <button
                key={s.key}
                type="button"
                aria-current={activeSection === s.key ? "true" : undefined}
                onClick={() => s.el.scrollIntoView({ behavior: "smooth", block: "start" })}
                className={cn(
                  "min-h-11 shrink-0 rounded-full border px-4 text-sm font-medium transition",
                  activeSection === s.key
                    ? "border-[#6E59A5] bg-[#6E59A5] text-white"
                    : s.key === "safety"
                      ? "border-red-200 bg-red-50 text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300"
                      : "bg-background text-foreground",
                )}
              >
                {SECTION_LABEL[s.key]}
              </button>
            ))}
          </nav>
        )}
      </div>

      <div className="flex flex-1 flex-col p-4">
        {currentVersion && !wrapped && (
          <p className="mb-3 text-[13px] text-muted-foreground">
            Version {currentVersion.version} · in use since {formatDate(currentVersion.publishedAt)}
          </p>
        )}
        <MobileDocSummary assets={doc.assets} ppeItems={bodyKind === "tiptap" ? extractPpeItems(bodyJson) : []} />
        {body}
      </div>

      {/* Sticky actions: Ask, and Step by step when the document has steps. */}
      <div
        className="sticky bottom-0 z-10 flex gap-2 border-t bg-background/95 px-4 pt-2 backdrop-blur"
        style={{ paddingBottom: "max(8px, var(--sab, env(safe-area-inset-bottom, 0px)))" }}
      >
        <FloorSecondaryButton className={steps.length > 0 ? "w-auto flex-1" : ""} onClick={() => navigate(askHref)}>
          <MessageSquare className="h-5 w-5" />
          Ask
        </FloorSecondaryButton>
        {steps.length > 0 && (
          <FloorPrimaryButton className="w-auto flex-[2]" onClick={() => setStepIndex(0)}>
            <ListOrdered className="h-5 w-5" />
            Step by step
          </FloorPrimaryButton>
        )}
      </div>

      {menuOpen && (
        <MobileSheet title={doc.title} description={<span className="font-mono">{doc.naming_code}</span>} onClose={() => setMenuOpen(false)}>
          <div className="flex flex-col pb-2">
            <MenuRow icon={Share2} label="Share" onClick={() => void handleShare().then(() => setMenuOpen(false))} />
            <MenuRow
              icon={Copy}
              label="Copy code"
              onClick={() => {
                handleCopy()
                setMenuOpen(false)
              }}
            />
            <MenuRow
              icon={Maximize2}
              label="Full screen"
              onClick={() => {
                setMenuOpen(false)
                setFullscreen(true)
              }}
            />
            {currentVersion && !wrapped && (
              <div className="px-1 py-1 [&_button]:min-h-14 [&_button]:w-full [&_button]:justify-start [&_button]:gap-3 [&_button]:rounded-xl [&_button]:px-3 [&_button]:text-base [&_button]:font-medium [&_svg]:h-5 [&_svg]:w-5">
                <PublishToPdfDialog documentId={doc.id} version={currentVersion.version} oneTap={{ className: "" }} />
              </div>
            )}
          </div>
        </MobileSheet>
      )}

      {stepIndex !== null && steps.length > 0 && (
        <StepByStep
          title={doc.title}
          steps={steps}
          index={stepIndex}
          onIndex={setStepIndex}
          onClose={() => setStepIndex(null)}
          onAsk={() => navigate(askHref)}
        />
      )}

      {fullscreen && (
        <div className="absolute inset-0 z-[60] flex flex-col bg-background">
          <header
            className="flex items-center gap-2 border-b bg-background/95 px-2 pb-2 backdrop-blur"
            style={{ paddingTop: "max(8px, var(--sat, env(safe-area-inset-top, 0px)))" }}
          >
            <button
              type="button"
              onClick={() => setFullscreen(false)}
              aria-label="Close full screen"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
            >
              <X className="h-6 w-6" />
            </button>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[17px] font-semibold leading-tight">{doc.title}</div>
              <div className="truncate font-mono text-[13px] text-muted-foreground">{doc.naming_code}</div>
            </div>
          </header>
          <div className="flex-1 overflow-y-auto p-3">
            {bodyKind === "tiptap" && bodyJson != null ? (
              <ViewerErrorBoundary fallback={VIEWER_UNAVAILABLE}>
                <Suspense fallback={VIEWER_FALLBACK}>
                  <TiptapReadOnly content={bodyJson} />
                </Suspense>
              </ViewerErrorBoundary>
            ) : (
              body
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function MenuRow({ icon: Icon, label, onClick }: { icon: typeof Copy; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-14 items-center gap-3 rounded-xl px-3 text-left text-base font-medium active:bg-muted"
    >
      <Icon className="h-5 w-5 text-muted-foreground" />
      {label}
    </button>
  )
}

/** One step per screen, with Back and Next in a sticky bar. */
function StepByStep({
  title,
  steps,
  index,
  onIndex,
  onClose,
  onAsk,
}: {
  title: string
  steps: string[]
  index: number
  onIndex: (i: number) => void
  onClose: () => void
  onAsk: () => void
}) {
  const last = index === steps.length - 1
  const scroller = useRef<HTMLDivElement>(null)
  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 })
  }, [index])
  return (
    <div className="absolute inset-0 z-[60] flex flex-col bg-background" role="dialog" aria-label={`Step by step: ${title}`}>
      <header
        className="flex items-center gap-1 border-b px-2 pb-2"
        style={{ paddingTop: "max(8px, var(--sat, env(safe-area-inset-top, 0px)))" }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close step by step"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
        >
          <X className="h-6 w-6" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[17px] font-semibold leading-tight">
            Step {index + 1} of {steps.length}
          </div>
          <div className="truncate text-[13px] text-muted-foreground">{title}</div>
        </div>
        <button
          type="button"
          onClick={onAsk}
          className="flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-[#6E59A5]"
        >
          <MessageSquare className="h-5 w-5" />
          Ask
        </button>
      </header>
      <div className="h-1.5 w-full bg-muted">
        <div className="h-full bg-[#6E59A5] transition-all" style={{ width: `${((index + 1) / steps.length) * 100}%` }} />
      </div>
      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto px-5 py-6">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#6E59A5] text-xl font-bold text-white">
          {index + 1}
        </div>
        <div
          key={index}
          className="floor-step prose prose-lg max-w-none text-[19px] leading-relaxed dark:prose-invert motion-safe:animate-in motion-safe:fade-in-0 [&_img]:rounded-xl"
          dangerouslySetInnerHTML={{ __html: steps[index] }}
        />
      </div>
      <div
        className="flex gap-2 border-t px-4 pt-2"
        style={{ paddingBottom: "max(8px, var(--sab, env(safe-area-inset-bottom, 0px)))" }}
      >
        <FloorSecondaryButton className="w-auto flex-1" disabled={index === 0} onClick={() => onIndex(index - 1)}>
          <ChevronLeft className="h-5 w-5" />
          Back
        </FloorSecondaryButton>
        <FloorPrimaryButton className="w-auto flex-[2]" onClick={() => (last ? onClose() : onIndex(index + 1))}>
          {last ? "Done" : "Next step"}
          {!last && <ChevronRight className="h-5 w-5" />}
        </FloorPrimaryButton>
      </div>
    </div>
  )
}

function normaliseText(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase()
}
