import {
  Component,
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { useLocation, useRoute, useSearch } from "wouter"
import {
  AlertTriangle,
  Copy,
  Home,
  Maximize2,
  Share2,
  Star,
  X,
} from "lucide-react"
import { useQuery } from "convex/react"
import { useRecordUsage } from "@/lib/usage"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import { toLegacyAsset, toLegacyDoc } from "@/lib/convex-adapters"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { MobileHeader } from "@/components/mobile/MobileHeader"
import { MobileDocSummary } from "@/components/mobile/MobileDocSummary"
import { AskFloatingButton } from "@/components/mobile/AskFloatingButton"
import { extractPpeItems } from "@/components/docs/DocumentHero"
import { PublishToPdfDialog } from "@/components/docs/PublishToPdfDialog"
import {
  looksLikeConvexId,
  usePinned,
  useRecentlyViewed,
} from "@/components/mobile/use-mobile-prefs"
import { cn } from "@/lib/utils"
import { formatDate } from "@/lib/time"
import { toast } from "sonner"

const PdfViewer = lazy(() =>
  import("@/components/docs/PdfViewer").then((m) => ({ default: m.PdfViewer })),
)
// A Wrapped manual shows its stamped Published PDF (the controlled copy).
const WrappedManualMobile = lazy(() => import("@/components/manuals/WrappedManualMobile"))
const TiptapReadOnly = lazy(() =>
  import("@/components/docs/TiptapReadOnly").then((m) => ({
    default: m.TiptapReadOnly,
  })),
)

interface ViewerErrorBoundaryProps {
  fallback: ReactNode
  children: ReactNode
}
interface ViewerErrorBoundaryState {
  hasError: boolean
}

class ViewerErrorBoundary extends Component<
  ViewerErrorBoundaryProps,
  ViewerErrorBoundaryState
> {
  state: ViewerErrorBoundaryState = { hasError: false }
  static getDerivedStateFromError(): ViewerErrorBoundaryState {
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

const VIEWER_FALLBACK = (
  <div className="p-6 text-sm text-muted-foreground">Loading viewer…</div>
)

const VIEWER_UNAVAILABLE = (
  <div className="p-6 text-sm text-muted-foreground">
    Document viewer not yet available.
  </div>
)

export function MobileDocPage() {
  const [, params] = useRoute<{ id: string }>("/m/docs/:id")
  const id = params?.id ?? ""
  const search = useSearch()
  const [, navigate] = useLocation()
  const { isPinned, togglePin, removePin } = usePinned()
  const { pushRecent, removeRecent } = useRecentlyViewed()
  const [fullscreen, setFullscreen] = useState(false)

  // Defensive pre-check — pre-Convex localStorage entries (doc-1, asset-2, …)
  // would otherwise crash Convex's v.id() validator with an
  // ArgumentValidationError that escapes the inner Suspense boundary and
  // blanks the page. Skip the queries (they require typed ids) and render
  // the recovery UI in the return below.
  const idIsConvexShaped = looksLikeConvexId(id)
  useEffect(() => {
    if (!idIsConvexShaped && id) {
      removePin("doc", id)
      removeRecent("doc", id)
    }
  }, [idIsConvexShaped, id, removePin, removeRecent])

  const initialPage = useMemo(() => {
    const p = new URLSearchParams(search).get("page")
    if (!p) return 1
    const n = parseInt(p, 10)
    return Number.isFinite(n) && n > 0 ? n : 1
  }, [search])

  // ?hl=<passage start> (from an Ask citation) scrolls to and highlights the
  // cited passage once the body has rendered.
  const highlight = useMemo(() => new URLSearchParams(search).get("hl"), [search])
  const bodyRef = useRef<HTMLDivElement>(null)

  useRecordUsage({
    kind: "view",
    documentId: id && idIsConvexShaped ? (id as Id<"documents">) : undefined,
  })
  const docResult = useQuery(
    api.documents.getWithAssets,
    id && idIsConvexShaped ? { id: id as Id<"documents"> } : "skip",
  )
  const ready = idIsConvexShaped ? docResult !== undefined : true
  const currentVersion = useQuery(
    api.documents.getPublishedVersion,
    id && idIsConvexShaped ? { documentId: id as Id<"documents"> } : "skip",
  )
  const pdfUrl = useQuery(
    api.files.getUrl,
    currentVersion?.pdfStorageId
      ? { storageId: currentVersion.pdfStorageId }
      : "skip",
  )

  const doc = useMemo(() => {
    if (!docResult) return null
    return {
      ...toLegacyDoc(docResult.doc),
      assets: docResult.assets.map(toLegacyAsset),
    }
  }, [docResult])

  const version = useMemo(() => {
    if (!currentVersion) return null
    return {
      id: currentVersion._id,
      document_id: currentVersion.documentId,
      version: currentVersion.version,
      body_kind: currentVersion.bodyKind,
      body_json: currentVersion.bodyJson,
      pdf_blob_id: currentVersion.pdfStorageId,
      published_at: new Date(currentVersion.publishedAt).toISOString(),
    }
  }, [currentVersion])

  const bodyReady = version?.body_kind === "tiptap" && version.body_json != null
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

  // Source of back navigation: previous asset page if present, else /m/docs.
  const backTo = doc?.assets?.[0]
    ? `/m/assets/${doc.assets[0].id}`
    : "/m/docs"

  useEffect(() => {
    if (!doc) return
    pushRecent({
      kind: "doc",
      id: doc.id,
      label: doc.title,
      sublabel: doc.naming_code,
    })
  }, [doc, pushRecent])

  if (!idIsConvexShaped) {
    return (
      <div className="flex h-full flex-col">
        <MobileHeader backTo="/m" title="Document not found" />
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-300">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <div className="text-sm font-semibold">
            This document is no longer available
          </div>
          <div className="text-xs text-muted-foreground">
            Removed from Pinned and Recently viewed.
          </div>
          <Button
            size="sm"
            className="mt-2 gap-1.5"
            onClick={() => navigate("/m")}
          >
            <Home className="h-3.5 w-3.5" />
            Back to home
          </Button>
        </div>
      </div>
    )
  }

  if (!ready) {
    return (
      <div className="flex flex-col">
        <MobileHeader backTo="/m/docs" title="Loading…" />
        <div className="space-y-3 p-4">
          <Skeleton className="h-32 w-full rounded-2xl" />
          <Skeleton className="h-64 w-full rounded-2xl" />
        </div>
      </div>
    )
  }

  if (!doc) {
    return (
      <div className="flex h-full flex-col">
        <MobileHeader backTo="/m" title="Document not found" />
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-300">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <div className="text-sm font-semibold">
            This document is no longer available
          </div>
          <div className="text-xs text-muted-foreground">
            It may have been deleted since you last opened it.
          </div>
          <Button
            size="sm"
            className="mt-2 gap-1.5"
            onClick={() => {
              if (id) {
                removePin("doc", id)
                removeRecent("doc", id)
              }
              navigate("/m")
            }}
          >
            <Home className="h-3.5 w-3.5" />
            Back to home
          </Button>
        </div>
      </div>
    )
  }

  function handleCopy() {
    if (!doc) return
    navigator.clipboard
      .writeText(doc.naming_code)
      .then(() => toast.success(`Copied ${doc.naming_code}`))
      .catch(() => toast.error("Failed to copy"))
  }

  async function handleShare() {
    if (!doc) return
    const shareData = {
      title: doc.title,
      text: `${doc.naming_code} · ${doc.title}`,
    }
    if (typeof navigator.share === "function") {
      try {
        await navigator.share(shareData)
      } catch {
        // user cancelled — ignore
      }
    } else {
      handleCopy()
      toast.message("Sharing is not supported here. The naming code is copied instead.")
    }
  }

  const pinned = isPinned("doc", doc.id)

  return (
    <div className="flex flex-col">
      <MobileHeader
        backTo={backTo}
        title={doc.title}
        subtitle={doc.naming_code}
        right={
          <Button
            variant="ghost"
            size="icon"
            aria-label={pinned ? "Unpin document" : "Pin document"}
            className="h-9 w-9"
            onClick={() =>
              togglePin({
                kind: "doc",
                id: doc.id,
                label: doc.title,
                sublabel: doc.naming_code,
              })
            }
          >
            <Star
              className={cn(
                "h-4 w-4",
                pinned ? "fill-amber-500 text-amber-500" : "",
              )}
            />
          </Button>
        }
      />

      {/* Quick actions */}
      <div className="sticky top-[44px] z-[5] flex items-center gap-0.5 border-b bg-background/95 px-1.5 py-1 backdrop-blur">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1 px-1.5 text-[10px]"
          onClick={handleCopy}
        >
          <Copy className="h-3 w-3" />
          Copy code
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1 px-1.5 text-[10px]"
          onClick={() => setFullscreen(true)}
        >
          <Maximize2 className="h-3 w-3" />
          Full
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1 px-1.5 text-[10px]"
          onClick={handleShare}
        >
          <Share2 className="h-3 w-3" />
          Share
        </Button>
        {version && docResult?.doc.origin !== "wrapped" && (
          <PublishToPdfDialog
            documentId={doc.id}
            version={version.version}
            oneTap={{
              className:
                "h-7 gap-1 px-1.5 text-[10px] text-orange-600 hover:bg-orange-50 hover:text-orange-700",
            }}
          />
        )}
      </div>

      <div className="flex flex-col p-3 pb-20">
        {version && docResult?.doc.origin !== "wrapped" && (
          <p className="mb-2 text-[11px] text-muted-foreground">
            <span className="font-medium text-emerald-700 dark:text-emerald-400">
              Published v{version.version}
            </span>
            {" · "}effective {formatDate(currentVersion!.publishedAt)}
          </p>
        )}
        <MobileDocSummary
          assets={doc.assets}
          ppeItems={
            version?.body_kind === "tiptap"
              ? extractPpeItems(version.body_json)
              : []
          }
        />
        {currentVersion === undefined ? null : !version ? (
          <div className="rounded-2xl border bg-card p-6 text-center text-sm text-muted-foreground">
            {doc.status === "archived"
              ? "This document is archived. It is no longer valid, so do not work from it."
              : "This document is not published yet, so it cannot be used on the floor."}
          </div>
        ) : version.body_kind === "pdf" ? (
          <ViewerErrorBoundary fallback={VIEWER_UNAVAILABLE}>
            <Suspense fallback={VIEWER_FALLBACK}>
              {docResult?.doc.origin === "wrapped" ? (
                <WrappedManualMobile
                  documentId={docResult.doc._id}
                  version={version.version}
                  initialPage={initialPage}
                />
              ) : (
                <PdfViewer url={pdfUrl ?? null} pageNumber={initialPage} />
              )}
            </Suspense>
          </ViewerErrorBoundary>
        ) : version.body_kind === "tiptap" ? (
          version.body_json == null ? (
            <div className="rounded-2xl border bg-card p-6 text-center text-sm text-muted-foreground">
              Document body is empty.
            </div>
          ) : (
            <ViewerErrorBoundary fallback={VIEWER_UNAVAILABLE}>
              <Suspense fallback={VIEWER_FALLBACK}>
                <div ref={bodyRef}>
                  <TiptapReadOnly content={version.body_json} />
                </div>
              </Suspense>
            </ViewerErrorBoundary>
          )
        ) : (
          <div className="rounded-2xl border bg-card p-6 text-center text-sm text-muted-foreground">
            Unknown document body type.
          </div>
        )}
      </div>

      {fullscreen && (
        <FullscreenViewer
          title={doc.title}
          subtitle={doc.naming_code}
          onClose={() => setFullscreen(false)}
        >
          {version?.body_kind === "pdf" ? (
            <ViewerErrorBoundary fallback={VIEWER_UNAVAILABLE}>
              <Suspense fallback={VIEWER_FALLBACK}>
                {docResult?.doc.origin === "wrapped" ? (
                  <WrappedManualMobile
                    documentId={docResult.doc._id}
                    version={version.version}
                    initialPage={initialPage}
                  />
                ) : (
                  <PdfViewer url={pdfUrl ?? null} pageNumber={initialPage} />
                )}
              </Suspense>
            </ViewerErrorBoundary>
          ) : version?.body_kind === "tiptap" && version.body_json != null ? (
            <ViewerErrorBoundary fallback={VIEWER_UNAVAILABLE}>
              <Suspense fallback={VIEWER_FALLBACK}>
                <TiptapReadOnly content={version.body_json} />
              </Suspense>
            </ViewerErrorBoundary>
          ) : (
            <div className="p-6 text-center text-sm text-muted-foreground">
              Nothing to display.
            </div>
          )}
        </FullscreenViewer>
      )}

      <AskFloatingButton to={`/m/ask?scope=doc:${doc.id}`} />
    </div>
  )
}

function FullscreenViewer({
  title,
  subtitle,
  children,
  onClose,
}: {
  title: string
  subtitle?: string
  children: ReactNode
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-background">
      <header className="flex items-center gap-2 border-b bg-background/95 px-3 py-3 backdrop-blur">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close fullscreen"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-foreground transition hover:bg-muted active:scale-95"
        >
          <X className="h-5 w-5" />
        </button>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="truncate text-base font-semibold leading-tight">
            {title}
          </div>
          {subtitle && (
            <div className="truncate font-mono text-[11px] text-muted-foreground">
              {subtitle}
            </div>
          )}
        </div>
      </header>
      <div className="flex-1 overflow-y-auto p-3">{children}</div>
    </div>
  )
}

function normaliseText(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase()
}
