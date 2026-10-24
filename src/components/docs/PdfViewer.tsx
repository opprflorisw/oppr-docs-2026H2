import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { Document, Page, pdfjs } from "react-pdf"
import { ChevronLeft, ChevronRight, FileX, ZoomIn, ZoomOut } from "lucide-react"
import "react-pdf/dist/Page/AnnotationLayer.css"
import "react-pdf/dist/Page/TextLayer.css"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString()

const MIN_SCALE = 0.5
const MAX_SCALE = 3
const SCALE_STEP = 0.2
// Inner padding of the page well (p-4 on both sides).
const WELL_PADDING = 32

interface PdfViewerProps {
  /** Signed URL for the stored PDF. Pass null while it resolves. */
  url: string | null
  /** 1-based page number. Defaults to 1 if omitted. A new value jumps there. */
  pageNumber?: number
  className?: string
  /** Widest the page is drawn at 100% zoom; it shrinks to fit narrower screens. */
  maxPageWidth?: number
}

export function PdfViewer({ url, pageNumber = 1, className, maxPageWidth = 860 }: PdfViewerProps) {
  const [numPages, setNumPages] = useState<number | null>(null)
  const [page, setPage] = useState(pageNumber)
  const [scale, setScale] = useState(1)
  const [loadError, setLoadError] = useState<Error | null>(null)
  const [wellWidth, setWellWidth] = useState<number | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)

  // A new file (for example the stamped copy replacing the original while it
  // was being stamped) keeps the reader on the page they were reading.
  useEffect(() => {
    setNumPages(null)
    setLoadError(null)
  }, [url])

  // A new deep link (?page=N) jumps to that page.
  useEffect(() => {
    setPage(pageNumber)
  }, [pageNumber])

  // Fit the page to the available width (phones, narrow columns).
  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return
    const update = () => setWellWidth(el.clientWidth)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [url])

  if (!url) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center gap-2 rounded-md border border-dashed bg-muted/20 p-12 text-center",
          className,
        )}
      >
        <FileX className="h-8 w-8 text-muted-foreground/50" />
        <p className="text-sm font-medium">PDF not available</p>
        <p className="text-xs text-muted-foreground">
          The file isn&apos;t attached or the link couldn&apos;t be resolved.
        </p>
      </div>
    )
  }

  const total = numPages ?? 1
  const shown = Math.min(Math.max(1, page), total)
  const canPrev = shown > 1
  const canNext = shown < total
  const canZoomOut = scale > MIN_SCALE + 1e-6
  const canZoomIn = scale < MAX_SCALE - 1e-6
  const fitWidth =
    wellWidth != null ? Math.max(200, Math.min(maxPageWidth, wellWidth - WELL_PADDING)) : undefined

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/40 px-3 py-2">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            disabled={!canPrev}
            onClick={() => setPage(Math.max(1, shown - 1))}
            aria-label="Previous page"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="px-2 text-xs tabular-nums text-muted-foreground">
            Page <span className="font-medium text-foreground">{shown}</span>
            {numPages != null && <> / {numPages}</>}
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            disabled={!canNext}
            onClick={() => setPage(Math.min(total, shown + 1))}
            aria-label="Next page"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            disabled={!canZoomOut}
            onClick={() =>
              setScale((s) => Math.max(MIN_SCALE, +(s - SCALE_STEP).toFixed(2)))
            }
            aria-label="Zoom out"
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
          <div className="w-12 text-center text-xs tabular-nums text-muted-foreground">
            {Math.round(scale * 100)}%
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            disabled={!canZoomIn}
            onClick={() =>
              setScale((s) => Math.min(MAX_SCALE, +(s + SCALE_STEP).toFixed(2)))
            }
            aria-label="Zoom in"
          >
            <ZoomIn className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <div
        ref={containerRef}
        className="flex justify-center overflow-auto rounded-md border bg-muted/30 p-4"
      >
        {loadError ? (
          <div className="flex flex-col items-center justify-center gap-2 p-12 text-center">
            <FileX className="h-8 w-8 text-muted-foreground/50" />
            <p className="text-sm font-medium">Failed to load PDF</p>
            <p className="text-xs text-muted-foreground">{loadError.message}</p>
          </div>
        ) : (
          <Document
            file={url}
            onLoadSuccess={(info) => {
              setNumPages(info.numPages)
              setLoadError(null)
            }}
            onLoadError={(err) => setLoadError(err)}
            loading={
              <div className="p-12 text-sm text-muted-foreground">
                Loading PDF…
              </div>
            }
            error={
              <div className="p-12 text-sm text-muted-foreground">
                Failed to load PDF.
              </div>
            }
          >
            <Page
              pageNumber={shown}
              width={fitWidth}
              scale={scale}
              className="shadow-sm"
              renderAnnotationLayer
              renderTextLayer
            />
          </Document>
        )}
      </div>
    </div>
  )
}
