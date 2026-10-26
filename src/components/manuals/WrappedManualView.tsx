// Reader for one version of a Wrapped manual (CONTEXT.md): the stamped PDF,
// opened at the cited page, with the supplier original next to it.

import { errorText } from "@/lib/errorText"
import { useState } from "react"
import { useSearch } from "wouter"
import { useMutation, useQuery } from "convex/react"
import { toast } from "sonner"
import { BookLock, Download, FileText, Loader2, RefreshCw } from "lucide-react"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { PdfViewer } from "@/components/docs/PdfViewer"
import { cn } from "@/lib/utils"
import { downloadFile, useWrappedManual } from "./useWrappedManual"

export function WrappedManualView({
  documentId,
  version,
  initialPage,
}: {
  documentId: Id<"documents">
  version: number
  initialPage: number
}) {
  const { data, late } = useWrappedManual(documentId, version)
  const page = useCitedPage(documentId, version, initialPage)

  if (data === undefined) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-[600px] w-full" />
      </div>
    )
  }
  if (data === null) {
    return (
      <div className="rounded-md border border-dashed p-12 text-center text-sm text-muted-foreground">
        This version of the manual could not be found.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <WrappedManualStrip documentId={documentId} data={data} late={late} />
      <PdfViewer url={data.stampedUrl ?? data.sourceUrl} pageNumber={page} />
    </div>
  )
}

type Wrapped = NonNullable<ReturnType<typeof useWrappedManual>["data"]>

/** The outline Oppr puts around the supplier PDF: who made it, what the stamp says. */
export function WrappedManualStrip({
  documentId,
  data,
  late,
  compact,
}: {
  documentId: Id<"documents">
  data: Wrapped
  late: boolean
  compact?: boolean
}) {
  const restamp = useMutation(api.manuals.restamp)
  const [retrying, setRetrying] = useState(false)
  const published = data.stampStatus === "published"
  const pages = data.pageCount != null ? `${data.pageCount} ${data.pageCount === 1 ? "page" : "pages"}` : null

  async function retry() {
    setRetrying(true)
    try {
      await restamp({ documentId, version: data.version })
      toast.success("Stamping again")
    } catch (err) {
      toast.error(errorText(err, "Could not start stamping. Try again."))
    } finally {
      setRetrying(false)
    }
  }

  return (
    <div className="rounded-lg border bg-card">
      <div className={cn("flex flex-wrap items-center gap-3", compact ? "p-3" : "px-4 py-3")}>
        <BookLock className="h-5 w-5 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">
            Supplier document{data.supplier ? ` by ${data.supplier}` : ""}, wrapped unchanged
          </p>
          {(data.supplierDocNo || data.supplierRevision) && (
            <p className="text-xs text-muted-foreground">
              {data.supplierDocNo && <>Supplier document no. <span className="font-mono">{data.supplierDocNo}</span></>}
              {data.supplierDocNo && data.supplierRevision && " · "}
              {data.supplierRevision && <>Supplier revision <span className="font-mono">{data.supplierRevision}</span></>}
            </p>
          )}
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span
              className={cn(
                "rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold",
                published
                  ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300"
                  : "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
              )}
            >
              {data.namingCode} · {data.stampLabel ?? data.expectedLabel ?? `v${data.version}`}
            </span>
            {pages && <span>{pages}</span>}
            <span>Every page carries this stamp</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            className="gap-1.5"
            variant={published ? "default" : "outline"}
            disabled={!data.stampedUrl || data.stamping || data.stampError != null}
            onClick={() => data.stampedUrl && void downloadFile(data.stampedUrl, data.stampedFilename)}
            data-tour="documents-pdf-button"
            title={
              published
                ? "The PDF with naming code, version and status on every page"
                : "Not the controlled copy: every page is stamped not for use"
            }
          >
            {data.stamping ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}
            {data.stamping ? "Stamping…" : `Download ${data.copyKind}`}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            disabled={!data.sourceUrl}
            onClick={() => data.sourceUrl && void downloadFile(data.sourceUrl, data.sourceFilename)}
            title="The file exactly as the supplier delivered it, without the Oppr stamp"
          >
            <FileText className="h-3.5 w-3.5" />
            Supplier original
          </Button>
        </div>
      </div>
      {data.stamping && (
        <div className="flex flex-wrap items-center gap-2 border-t bg-amber-50 px-4 py-2 text-xs text-amber-900 dark:bg-amber-500/10 dark:text-amber-100">
          {!late && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          <span className="flex-1">
            {late
              ? "The stamp is taking longer than expected."
              : data.stampedUrl
                ? `Updating the stamp to "${data.expectedLabel}" on every page.`
                : `Stamping "${data.expectedLabel ?? `v${data.version}`}" on every page. Showing the supplier original until it is ready.`}
          </span>
          {late && (
            <Button size="sm" variant="outline" className="h-7 gap-1" disabled={retrying} onClick={() => void retry()}>
              <RefreshCw className="h-3 w-3" />
              Try again
            </Button>
          )}
        </div>
      )}
      {data.stampError != null && (
        <div className="flex flex-wrap items-center gap-2 border-t bg-red-50 px-4 py-2 text-xs text-red-900 dark:bg-red-500/10 dark:text-red-100">
          <span className="flex-1">Stamping failed: {data.stampError}</span>
          <Button size="sm" variant="outline" className="h-7 gap-1" disabled={retrying} onClick={() => void retry()}>
            <RefreshCw className="h-3 w-3" />
            Try again
          </Button>
        </div>
      )}
      {data.stampStatus === "superseded" && (
        <div className="border-t px-4 py-2 text-xs text-muted-foreground">
          A newer version replaced this one. Every page of this copy is stamped not for use.
        </div>
      )}
    </div>
  )
}

/**
 * The page to open: ?page=N from Ask citations, or, for Wiki sources that
 * cite a passage by its text (?hl=), the page that holds that passage.
 */
function useCitedPage(documentId: Id<"documents">, version: number, initialPage: number) {
  const search = useSearch()
  const params = new URLSearchParams(search)
  const hl = params.has("page") ? null : params.get("hl")
  const found = useQuery(
    api.manuals.findPage,
    hl ? { documentId, version, text: hl } : "skip",
  )
  return found ?? initialPage
}
