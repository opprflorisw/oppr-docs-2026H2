// The floor (mobile) reader of a Wrapped manual: the stamped Published PDF,
// opened at the cited page. Callers pass the Published version only.

import { BookLock, Download, Loader2 } from "lucide-react"
import type { Id } from "../../../convex/_generated/dataModel"
import { PdfViewer } from "@/components/docs/PdfViewer"
import { downloadFile, useWrappedManual } from "./useWrappedManual"

export default function WrappedManualMobile({
  documentId,
  version,
  initialPage,
}: {
  documentId: Id<"documents">
  version: number
  initialPage: number
}) {
  const { data } = useWrappedManual(documentId, version)
  if (data === undefined) {
    return <div className="h-96 animate-pulse rounded-2xl border bg-muted/30" />
  }
  if (data === null) {
    return (
      <div className="rounded-2xl border bg-card p-6 text-center text-sm text-muted-foreground">
        This manual could not be loaded.
      </div>
    )
  }
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 rounded-2xl border bg-card px-3 py-2">
        <BookLock className="h-4 w-4 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium">
            {data.supplier ? `By ${data.supplier}` : "Supplier document"}, wrapped unchanged
          </p>
          <p className="truncate font-mono text-[10px] text-muted-foreground">
            {data.namingCode} · {data.stampLabel ?? data.expectedLabel}
          </p>
        </div>
        {data.stampedUrl && !data.stamping ? (
          <button
            type="button"
            aria-label={`Download ${data.copyKind}`}
            onClick={() => data.stampedUrl && void downloadFile(data.stampedUrl, data.stampedFilename)}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-primary transition hover:bg-muted active:scale-95"
          >
            <Download className="h-4 w-4" />
          </button>
        ) : data.stampError != null ? null : (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
        )}
      </div>
      <PdfViewer url={data.stampedUrl ?? data.sourceUrl} pageNumber={initialPage} />
    </div>
  )
}
