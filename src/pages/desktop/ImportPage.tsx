// External-document importer. One screen, two outcomes decided by the file:
//
//   - Digital PDF (has a text layer)  → extract text + images, build a TipTap
//     body (headings + paragraphs + trailing figures), commit the images to
//     the library, and create a PRE-DRAFT document straight in the editor.
//   - Scan / no text layer            → stop. Offer to attach the original as a
//     scrollable PDF element inside a new draft instead of faking an extract.
//
// There is no AI-mapping step, no cross-link step, and no naming-code gate. The
// naming code, asset links, and structure refinements are all done by hand in
// the editor afterwards. Extracted images are held client-side and only land in
// the library when the document is actually created — a discarded import (or a
// scan the user cancels) leaves no library junk.
//
// Audit: the source PDF and the extraction record are still persisted to an
// importJobs row, and the document is created through importer.finalizeDocument
// (which gives us pre_draft + chunks + image-usage recompute for free).

import { useEffect, useState } from "react"
import { Link, useLocation, useRoute } from "wouter"
import { ArrowRight, FileText, Loader2, ScanLine, Upload, X } from "lucide-react"
import { useMutation, useQuery } from "convex/react"
import { toast } from "sonner"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import { TopBar } from "@/components/layout/TopBar"
import { PageHeader } from "@/components/layout/PageHeader"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { cn } from "@/lib/utils"
import { extractPdf } from "@/lib/import/extractPdf"
import { promoteImages } from "@/lib/import/promoteImages"
import { buildTiptapFromLayout } from "@/lib/import/buildTiptap"
import { chunksFromTipTap } from "@/components/docs/chunking"

export function ImportPage() {
  const [, params] = useRoute<{ jobId: string }>("/import/:jobId")
  const jobId = params?.jobId as Id<"importJobs"> | undefined

  return (
    <div className="flex flex-1 flex-col">
      <TopBar
        breadcrumb={[
          { label: "Documents", href: "/library" },
          { label: "Import external" },
        ]}
      />
      {jobId ? <RedirectJob jobId={jobId} /> : <NewImport />}
    </div>
  )
}

// Old multi-stage wizard URLs (/import/:jobId) no longer have a UI. Send any
// stale bookmark to the finalized document if there is one, else the library.
function RedirectJob({ jobId }: { jobId: Id<"importJobs"> }) {
  const [, navigate] = useLocation()
  const job = useQuery(api.importer.jobs.get, { id: jobId })

  useEffect(() => {
    if (job === undefined) return
    if (job?.finalizedDocumentId) {
      navigate(`/docs/${job.finalizedDocumentId}/edit`)
    } else {
      navigate("/library")
    }
  }, [job, navigate])

  return (
    <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
    </div>
  )
}

// ---------------------------------------------------------------------------

interface ScanState {
  jobId: Id<"importJobs">
  storageId: Id<"_storage">
  filename: string
  pageCount: number
}

function NewImport() {
  const [, navigate] = useLocation()
  const [busy, setBusy] = useState(false)
  const [busyMsg, setBusyMsg] = useState("")
  const [scan, setScan] = useState<ScanState | null>(null)
  const [dragOver, setDragOver] = useState(false)

  const generateUploadUrl = useMutation(api.files.generateUploadUrl)
  const createFromUpload = useMutation(api.images.createFromUpload)
  const createJob = useMutation(api.importer.jobs.create)
  const recordExtraction = useMutation(api.importer.jobs.recordExtraction)
  const finalizeDocument = useMutation(api.importer.jobs.finalizeDocument)

  function pickFile(f: File | null) {
    if (!f || busy) return
    const isPdf = f.type.includes("pdf") || f.name.toLowerCase().endsWith(".pdf")
    if (!isPdf) {
      toast.error("Only PDF is supported. Word/Excel/PowerPoint land in a later release.")
      return
    }
    if (f.size > 50 * 1024 * 1024) {
      toast.error("File too large. Limit is 50 MB.")
      return
    }
    void handleStart(f)
  }

  async function handleStart(file: File) {
    setBusy(true)
    setScan(null)
    const tid = toast.loading(`Processing ${file.name}…`)
    try {
      setBusyMsg("Reading PDF · extracting text + images")
      const result = await extractPdf(file)
      if (result.classification.kind === "unsupported") {
        toast.error("That file isn't a readable PDF.", { id: tid })
        return
      }

      // Upload the source for audit (and so a scan can be attached).
      setBusyMsg("Uploading source file")
      const sourceUploadUrl = await generateUploadUrl()
      const put = await fetch(sourceUploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type || "application/pdf" },
        body: file,
      })
      if (!put.ok) throw new Error(`Source upload failed (${put.status})`)
      const { storageId } = (await put.json()) as { storageId: Id<"_storage"> }
      const sourceSha = await sha256Hex(await file.arrayBuffer())

      const jobId = await createJob({
        sourceStorageId: storageId,
        sourceFilename: file.name,
        sourceContentType: file.type || "application/pdf",
        sourceByteSize: file.size,
        sourceSha256: sourceSha,
        targetTemplate: "auto",
        defaultMode: "verbatim",
      })

      // Scan / no usable text layer: do not extract. Stop and offer attach.
      if (result.classification.kind !== "digitalPdf") {
        await recordExtraction({
          jobId,
          classification: result.classification,
          extractedMarkdown: result.markdown,
          extractedPages: result.pages,
          extractedImageIds: [],
          extractStats: result.stats,
          structuredDoc: null,
        })
        toast.warning("Looks like a scan: no text to extract.", { id: tid })
        setScan({
          jobId,
          storageId,
          filename: file.name,
          pageCount: result.classification.pageCount,
        })
        return
      }

      // Digital PDF: commit images now (only on a real create), build the body.
      setBusyMsg(
        result.images.length > 0
          ? `Adding ${result.images.length} image${result.images.length === 1 ? "" : "s"} to the library`
          : "Building document",
      )
      const imageIds =
        result.images.length > 0
          ? await promoteImages(result.images, { generateUploadUrl, createFromUpload })
          : []

      setBusyMsg("Building document")
      const body = buildTiptapFromLayout({
        pageLayouts: result.pageLayouts,
        images: result.images,
        imageIdsByOrder: imageIds.map(String),
      })
      const chunks = chunksFromTipTap(body).map((c) => ({
        text: c.text,
        section: c.section,
      }))

      await recordExtraction({
        jobId,
        classification: result.classification,
        extractedMarkdown: result.markdown,
        extractedPages: result.pages,
        extractedImageIds: imageIds,
        extractStats: result.stats,
        structuredDoc: null,
      })

      const docId = await finalizeDocument({
        jobId,
        namingCode: "",
        title: deriveTitle(file.name),
        type: "sop",
        assetIds: [],
        body,
        chunks,
      })
      toast.success(`Imported ${file.name}. Opening the editor.`, { id: tid })
      navigate(`/docs/${docId}/edit`)
    } catch (err) {
      console.error(err)
      toast.error(err instanceof Error ? err.message : "Import failed", { id: tid })
    } finally {
      setBusy(false)
      setBusyMsg("")
    }
  }

  async function attachAsScan() {
    if (!scan || busy) return
    setBusy(true)
    const tid = toast.loading("Creating document…")
    try {
      const body = {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: `Imported from ${scan.filename}: a scanned PDF with no text to extract. Annotate around the attachment below.`,
              },
            ],
          },
          {
            type: "pdfAttachment",
            attrs: {
              storageId: scan.storageId,
              filename: scan.filename,
              pageCount: scan.pageCount,
            },
          },
        ],
      }
      const docId = await finalizeDocument({
        jobId: scan.jobId,
        namingCode: "",
        title: deriveTitle(scan.filename),
        type: "sop",
        assetIds: [],
        body,
        chunks: [],
      })
      toast.success("Attached. Opening the editor.", { id: tid })
      navigate(`/docs/${docId}/edit`)
    } catch (err) {
      console.error(err)
      toast.error(err instanceof Error ? err.message : "Attach failed", { id: tid })
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <PageHeader
        icon={Upload}
        title="Import external document"
        subtitle="Drop a PDF. We pull the text and images straight into the editor as a new draft. Scanned PDFs are attached as-is."
      />
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto max-w-2xl space-y-4">
          {scan ? (
            <ScanCard
              scan={scan}
              busy={busy}
              onAttach={attachAsScan}
              onCancel={() => setScan(null)}
            />
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Import a PDF</CardTitle>
                <CardDescription className="text-xs">
                  Digital PDFs are extracted to text + images and opened in the
                  editor. No template, no AI, no naming code up front: you set
                  all of that in the editor. The source PDF is kept for audit.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <button
                  type="button"
                  onClick={() =>
                    !busy && document.getElementById("import-file-input")?.click()
                  }
                  onDragOver={(e) => {
                    e.preventDefault()
                    if (!busy) setDragOver(true)
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault()
                    setDragOver(false)
                    pickFile(e.dataTransfer.files?.[0] ?? null)
                  }}
                  disabled={busy}
                  className={cn(
                    "flex w-full flex-col items-center gap-2 rounded-md border-2 border-dashed p-10 text-center transition-colors",
                    busy
                      ? "cursor-default border-primary/40 bg-primary/5"
                      : dragOver
                        ? "border-primary bg-primary/10"
                        : "bg-muted/20 hover:bg-muted/40",
                  )}
                >
                  {busy ? (
                    <>
                      <Loader2 className="h-7 w-7 animate-spin text-primary" />
                      <div className="text-sm font-medium">
                        {busyMsg || "Working…"}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Don't close this tab.
                      </div>
                    </>
                  ) : (
                    <>
                      <Upload className="h-7 w-7 text-muted-foreground" />
                      <div className="text-sm font-medium">
                        Drop a PDF, or click to browse
                      </div>
                      <div className="text-xs text-muted-foreground">
                        PDF up to 50 MB
                      </div>
                    </>
                  )}
                </button>
                <input
                  id="import-file-input"
                  type="file"
                  accept=".pdf,application/pdf"
                  className="hidden"
                  onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
                />
                <div className="mt-3 flex items-center justify-between gap-2 border-t pt-3">
                  <Link
                    href="/library"
                    className="text-xs text-muted-foreground hover:underline"
                  >
                    Cancel
                  </Link>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </>
  )
}

function ScanCard({
  scan,
  busy,
  onAttach,
  onCancel,
}: {
  scan: ScanState
  busy: boolean
  onAttach: () => void
  onCancel: () => void
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ScanLine className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          This looks like a scan
        </CardTitle>
        <CardDescription className="text-xs">{scan.filename}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Alert className="border-amber-500/40 bg-amber-500/5">
          <ScanLine className="h-4 w-4" />
          <AlertTitle>No extractable text</AlertTitle>
          <AlertDescription className="text-sm leading-relaxed">
            We couldn't find a selectable text layer in this PDF ({scan.pageCount}{" "}
            page{scan.pageCount === 1 ? "" : "s"}), so there's nothing to extract.
            You can attach it as a scrollable PDF inside a new draft and
            annotate around it. (OCR for scans is planned for a later release.)
          </AlertDescription>
        </Alert>
        <div className="flex items-center justify-between gap-2 border-t pt-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline disabled:opacity-50"
          >
            <X className="h-3.5 w-3.5" /> Choose a different file
          </button>
          <Button size="sm" onClick={onAttach} disabled={busy}>
            {busy ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <FileText className="mr-1.5 h-3.5 w-3.5" />
            )}
            Attach as PDF
            <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------

async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", buf)
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

// Strip the extension and any leading naming-code-ish prefix for a clean title.
function deriveTitle(filename: string): string {
  const base = filename.replace(/\.[^.]+$/, "").trim()
  return base.length > 0 ? base : "Imported document"
}
