// Publish-to-PDF dialog — toggles + Preview/Download.
//
// Loads the document + version + assets via the repos, renders a print HTML
// document, opens it in a new window. The user prints to PDF from there
// (the popup has its own toolbar with Print + Close buttons).

import { useEffect, useMemo, useRef, useState } from "react"
import { FileDown, Eye, Loader2, Sparkles } from "lucide-react"
import * as pdfjs from "pdfjs-dist"
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Separator } from "@/components/ui/separator"
import { useQuery } from "convex/react"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import { toLegacyAsset, toLegacyDoc } from "@/lib/convex-adapters"
import { walkBodyImages } from "../../../convex/lib/imageWalker"
import { walkBodyRefs } from "@/lib/bodyRefs"
import { extractPpeItems } from "@/components/docs/DocumentHero"
import {
  buildPrintDoc,
  DEFAULT_PDF_OPTIONS,
  type LinkedLogInfo,
  type PdfExportOptions,
  type PrintCoverSettings,
} from "@/lib/pdf-export/buildPrintDoc"
import { loadPrintHtml, openPrintShell } from "@/lib/pdf-export/openPrintWindow"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

// Max PDF pages we rasterise into an export. Beyond this we cap to keep memory
// and print time sane.
const MAX_PDF_PAGES = 20

interface PublishToPdfDialogProps {
  documentId: string
  /** The exact edition to export — what you see is what exports. */
  version: number
  /** Optional trigger; omit when driving `open` from the parent. */
  trigger?: React.ReactNode
  /** Controlled open state (e.g. so the edit page can save first). */
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /**
   * The Operator's phone: no options dialog. One tap prints (or saves as PDF)
   * a controlled copy with fixed defaults. Renders its own button.
   */
  oneTap?: { className?: string }
}

export function PublishToPdfDialog({
  documentId,
  version,
  trigger,
  open: controlledOpen,
  onOpenChange,
  oneTap,
}: PublishToPdfDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false)
  const dialogOpen = controlledOpen ?? internalOpen
  // One tap needs the data before the tap, so it loads up front.
  const open = dialogOpen || oneTap != null
  const setOpen = onOpenChange ?? setInternalOpen
  const [options, setOptions] = useState<PdfExportOptions>(DEFAULT_PDF_OPTIONS)
  const [preparing, setPreparing] = useState(false)

  const docResult = useQuery(
    api.documents.getWithAssets,
    open ? { id: documentId as Id<"documents"> } : "skip",
  )
  const versionResult = useQuery(
    api.documents.getVersionByNumber,
    open ? { documentId: documentId as Id<"documents">, version } : "skip",
  )
  const coverSettings = useQuery(api.coverSettings.get, open ? {} : "skip")
  const versionsList = useQuery(
    api.documents.listVersions,
    open ? { documentId: documentId as Id<"documents"> } : "skip",
  )
  const allDocs = useQuery(api.documents.list, open ? {} : "skip")
  const docTypes = useQuery(api.namingTypes.list, open ? {} : "skip")
  const ppeCatalog = useQuery(api.ppe.list, open ? {} : "skip")
  const ppeLanguage = useQuery(api.ppe.getLanguage, open ? {} : "skip")

  const resolved = useMemo(() => {
    if (!docResult || !versionResult) return null
    const doc = {
      ...toLegacyDoc(docResult.doc),
      assets: docResult.assets.map(toLegacyAsset),
    }
    const version = {
      id: versionResult._id,
      document_id: versionResult.documentId,
      version: versionResult.version,
      body_kind: versionResult.bodyKind,
      body_json: versionResult.bodyJson,
      pdf_blob_id: versionResult.pdfStorageId,
      published_at: new Date(versionResult.publishedAt).toISOString(),
    }
    const ppeOnDoc =
      version.body_kind === "tiptap" ? extractPpeItems(version.body_json) : []
    return { doc, version, ppeOnDoc }
  }, [docResult, versionResult])

  const isLiveExport =
    docResult?.doc.liveVersion != null && docResult.doc.liveVersion === version
  const exportStatus = !docResult
    ? null
    : isLiveExport
      ? "published"
      : version === docResult.doc.currentVersion
        ? docResult.doc.status
        : "superseded"

  // Seed the watermark once per dialog open: non-live editions default to
  // "Draft"; published exports honor the configured default watermark.
  const watermarkSeeded = useRef(false)
  useEffect(() => {
    if (!open) {
      watermarkSeeded.current = false
      return
    }
    if (watermarkSeeded.current || !docResult || coverSettings === undefined)
      return
    if (oneTap) return
    const def: PdfExportOptions["watermark"] = isLiveExport
      ? (coverSettings?.defaultWatermark ?? "controlled")
      : "draft"
    setOptions((o) => ({ ...o, watermark: def }))
    watermarkSeeded.current = true
  }, [open, docResult, coverSettings, isLiveExport, oneTap])

  const imageIds = useMemo<Id<"images">[]>(() => {
    if (!resolved || resolved.version.body_kind !== "tiptap") return []
    const refs = walkBodyImages(resolved.version.body_json)
    const ids = new Set<string>()
    for (const r of refs) if (r.imageId) ids.add(r.imageId)
    return Array.from(ids) as Id<"images">[]
  }, [resolved])

  const imageUrlMap = useQuery(
    api.images.urlsFor,
    open && imageIds.length > 0 ? { ids: imageIds } : "skip",
  )

  // referenceDoc id → title, resolved from the document list (chip labels may
  // be code-only and are never trusted for the title column).
  const refTitleById = useMemo(() => {
    const map: Record<string, string> = {}
    for (const d of allDocs ?? []) map[d._id] = d.title
    return map
  }, [allDocs])

  // pdfAttachment storage ids present in the body.
  const pdfStorageIds = useMemo<Id<"_storage">[]>(() => {
    if (!resolved || resolved.version.body_kind !== "tiptap") return []
    const ids = new Set<string>()
    const visit = (n: unknown) => {
      if (!n || typeof n !== "object") return
      const node = n as { type?: string; attrs?: Record<string, unknown>; content?: unknown[] }
      if (node.type === "pdfAttachment" && node.attrs?.storageId) {
        ids.add(String(node.attrs.storageId))
      }
      if (Array.isArray(node.content)) node.content.forEach(visit)
    }
    visit(resolved.version.body_json)
    return Array.from(ids) as Id<"_storage">[]
  }, [resolved])

  const pdfUrlMap = useQuery(
    api.files.getUrls,
    open && pdfStorageIds.length > 0 ? { ids: pdfStorageIds } : "skip",
  )

  // launchLog nodes in the body drive the linked-logs overview table.
  const launchLogCount = useMemo(() => {
    if (!resolved || resolved.version.body_kind !== "tiptap") return 0
    let n = 0
    const visit = (x: unknown) => {
      if (!x || typeof x !== "object") return
      const node = x as { type?: string; content?: unknown[] }
      if (node.type === "launchLog") n += 1
      if (Array.isArray(node.content)) node.content.forEach(visit)
    }
    visit(resolved.version.body_json)
    return n
  }, [resolved])

  const logsList = useQuery(
    api.logs.list,
    open && launchLogCount > 0 ? {} : "skip",
  )
  const logsById = useMemo(() => {
    const map: Record<string, LinkedLogInfo> = {}
    for (const l of logsList ?? []) {
      // `code` is a recent addition to the logs table; tolerate rows without it.
      map[l._id] = {
        name: l.name,
        code: (l as { code?: string | null }).code ?? null,
      }
    }
    return map
  }, [logsList])

  // Diagram background images live inside the cached SVG as remote storage
  // URLs. Collect them (from the structured model when present, else from the
  // svg markup) so they can be inlined as data URLs before the window opens.
  const diagramBgUrls = useMemo<string[]>(() => {
    if (!resolved || resolved.version.body_kind !== "tiptap") return []
    const urls = new Set<string>()
    const addIfRemote = (u: unknown) => {
      if (typeof u === "string" && /^https?:\/\//.test(u)) urls.add(u)
    }
    const visit = (x: unknown) => {
      if (!x || typeof x !== "object") return
      const node = x as {
        type?: string
        attrs?: Record<string, unknown>
        content?: unknown[]
      }
      if (node.type === "diagram" && node.attrs) {
        let model = node.attrs.model
        if (typeof model === "string") {
          try {
            model = JSON.parse(model)
          } catch {
            model = null
          }
        }
        const bg = (model as { background?: { url?: unknown } | null } | null)
          ?.background
        addIfRemote(bg?.url)
        const svg = String(node.attrs.svg ?? "")
        for (const m of svg.matchAll(/<image[^>]*\shref="([^"]+)"/g)) {
          addIfRemote(m[1].replace(/&amp;/g, "&").replace(/&quot;/g, '"'))
        }
      }
      if (Array.isArray(node.content)) node.content.forEach(visit)
    }
    visit(resolved.version.body_json)
    return Array.from(urls)
  }, [resolved])

  // Fetch each background and base64 it. The print popup auto-prints shortly
  // after load, which races remote image loads — inlining makes the export
  // self-contained. Failures fall back to the original remote URL.
  async function inlineDiagramBackgrounds(): Promise<Record<string, string>> {
    const out: Record<string, string> = {}
    await Promise.all(
      diagramBgUrls.map(async (url) => {
        try {
          const res = await fetch(url)
          if (!res.ok) return
          const blob = await res.blob()
          out[url] = await new Promise<string>((resolve, reject) => {
            const fr = new FileReader()
            fr.onload = () => resolve(String(fr.result))
            fr.onerror = () => reject(fr.error)
            fr.readAsDataURL(blob)
          })
        } catch {
          // keep the remote URL in the svg
        }
      }),
    )
    return out
  }

  // Rasterise every embedded PDF's pages into data URLs so they render in the
  // export. Page-capped; failures fall back to the attachment note.
  async function rasterisePdfs(): Promise<Record<string, string[]>> {
    if (pdfStorageIds.length === 0 || !pdfUrlMap) return {}
    const out: Record<string, string[]> = {}
    for (const sid of pdfStorageIds) {
      const url = pdfUrlMap[sid]
      if (!url) continue
      try {
        const pdf = await pdfjs.getDocument({ url }).promise
        const count = Math.min(pdf.numPages, MAX_PDF_PAGES)
        const pages: string[] = []
        for (let i = 1; i <= count; i++) {
          const page = await pdf.getPage(i)
          const viewport = page.getViewport({ scale: 1.5 })
          const canvas = document.createElement("canvas")
          canvas.width = viewport.width
          canvas.height = viewport.height
          const ctx = canvas.getContext("2d")
          if (!ctx) continue
          await page.render({ canvasContext: ctx, viewport, canvas }).promise
          pages.push(canvas.toDataURL("image/jpeg", 0.72))
        }
        out[sid] = pages
      } catch (err) {
        console.error("PDF rasterise failed", err)
      }
    }
    return out
  }

  // Fetch the configured logo and base64 it so the popup never races a remote
  // image load. Falls back to the remote URL when the fetch fails.
  async function inlineLogo(): Promise<string | null> {
    const url = coverSettings?.logoUrl
    if (!url) return null
    try {
      const res = await fetch(url)
      if (!res.ok) return url
      const blob = await res.blob()
      return await new Promise<string>((resolve, reject) => {
        const fr = new FileReader()
        fr.onload = () => resolve(String(fr.result))
        fr.onerror = () => reject(fr.error)
        fr.readAsDataURL(blob)
      })
    } catch {
      return url
    }
  }

  // Fetch each PPE pictogram from Convex storage and base64 it, keyed by slug.
  // The print popup auto-prints shortly after load and races remote loads, so
  // images must be self-contained. Items without a stored image are skipped and
  // fall back to the bundled SVG in buildPrintDoc.
  async function inlinePpeImages(): Promise<Record<string, string>> {
    const out: Record<string, string> = {}
    await Promise.all(
      (ppeCatalog ?? [])
        .filter((p) => p.imageUrl)
        .map(async (p) => {
          try {
            const res = await fetch(p.imageUrl as string)
            if (!res.ok) return
            const blob = await res.blob()
            out[p.slug] = await new Promise<string>((resolve, reject) => {
              const fr = new FileReader()
              fr.onload = () => resolve(String(fr.result))
              fr.onerror = () => reject(fr.error)
              fr.readAsDataURL(blob)
            })
          } catch {
            // fall back to the SVG pictogram
          }
        }),
    )
    return out
  }

  function buildHtml(
    pdfPagesByStorageId: Record<string, string[]>,
    diagramBgDataUrls: Record<string, string>,
    logoDataUrl: string | null,
    ppeImageBySlug: Record<string, string>,
    opts: PdfExportOptions,
  ): string | null {
    if (!resolved) return null
    if (resolved.version.body_kind === "pdf") {
      toast.error(
        "Legacy PDF-backed documents can't be re-exported. Open the PDF and use the browser's Save-as.",
      )
      return null
    }
    const cover: PrintCoverSettings | null = coverSettings
      ? {
          companyName: coverSettings.companyName,
          headerText: coverSettings.headerText,
          footerText: coverSettings.footerText,
          titleSize: coverSettings.titleSize,
          logoDataUrl,
          showPageNumbers: coverSettings.showPageNumbers,
          confidentialityLabel: coverSettings.confidentialityLabel,
          accentColor: coverSettings.accentColor,
        }
      : null
    const typeLabel = docTypes?.find((t) => t.slug === resolved.doc.type)?.label
    const lang = ppeLanguage === "nl" ? "nl" : "en"
    const ppeEntries = (ppeCatalog ?? []).map((p) => ({
      slug: p.slug,
      label:
        (lang === "nl" ? p.labelNl || p.label : p.labelEn || p.label) || p.label,
      pictogramId: p.pictogramId,
      imageDataUrl: ppeImageBySlug[p.slug],
    }))
    return buildPrintDoc({
      doc: resolved.doc,
      version: resolved.version,
      assets: resolved.doc.assets,
      ownerName: docResult?.roles?.owner ?? null,
      options: opts,
      ppeOnDoc: resolved.ppeOnDoc,
      typeLabel,
      ppeCatalog: ppeEntries,
      imageUrlMap: imageUrlMap ?? undefined,
      versions: versionsList
        ? versionsList.map((v) => ({ version: v.version, publishedAt: v.publishedAt }))
        : undefined,
      refTitleById,
      pdfPagesByStorageId,
      logsById,
      diagramBgDataUrls,
      cover,
    })
  }

  async function openExport(autoPrint: boolean, opts: PdfExportOptions = options) {
    // The window must open synchronously inside the click handler — the async
    // prep below outlives the user activation, and a window.open after it
    // would be popup-blocked for real. Navigate the shell once prep is done.
    const win = openPrintShell()
    if (!win) {
      toast.error("Couldn't open the window. Check your popup blocker.")
      return
    }
    setPreparing(true)
    try {
      const [pages, bgMap, logoDataUrl, ppeImageBySlug] = await Promise.all([
        rasterisePdfs(),
        inlineDiagramBackgrounds(),
        inlineLogo(),
        inlinePpeImages(),
      ])
      const html = buildHtml(pages, bgMap, logoDataUrl, ppeImageBySlug, opts)
      if (!html) {
        win.close()
        return
      }
      const finalHtml = autoPrint
        ? html.replace(
            "</body>",
            `<script>window.addEventListener('load', function () { setTimeout(function () { window.print() }, 350) })</script></body>`,
          )
        : html
      loadPrintHtml(win, finalHtml)
      setOpen(false)
    } finally {
      setPreparing(false)
    }
  }

  const hasFrontMatter =
    options.revisionBlock ||
    options.referencesBlock ||
    (options.logsBlock && launchLogCount > 0) ||
    (options.machinesBlock && (resolved?.doc.assets.length ?? 0) > 0)
  const estimatedPages = estimatePageCount(resolved?.version.body_json, options)
  const busy =
    preparing ||
    coverSettings === undefined ||
    versionResult === undefined ||
    versionResult === null ||
    (pdfStorageIds.length > 0 && pdfUrlMap === undefined) ||
    (launchLogCount > 0 && logsList === undefined)

  if (oneTap) {
    // Fixed defaults: the Published edition is a controlled copy, anything
    // else says it is not for use.
    const fixed: PdfExportOptions = {
      ...DEFAULT_PDF_OPTIONS,
      watermark: isLiveExport ? "controlled" : "draft",
    }
    return (
      <Button
        variant="ghost"
        size="sm"
        className={oneTap.className}
        onClick={() => void openExport(true, fixed)}
        disabled={busy}
        title={isLiveExport ? "A controlled copy of the Published version" : undefined}
      >
        {preparing ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileDown className="h-3 w-3" />}
        Print or save as PDF
      </Button>
    )
  }

  return (
    <Dialog open={dialogOpen} onOpenChange={setOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileDown className="h-4 w-4 text-orange-600" />
            Export to PDF
          </DialogTitle>
          {docResult && (
            <div className="flex items-center gap-1.5 text-xs">
              <span className="rounded border bg-muted/50 px-1.5 py-0.5 font-mono font-medium">
                {docResult.doc.namingCode}
              </span>
              <span className="text-muted-foreground">·</span>
              <span className="font-medium">v{version}</span>
              {exportStatus && (
                <>
                  <span className="text-muted-foreground">·</span>
                  <span
                    className={cn(
                      "capitalize",
                      exportStatus === "published"
                        ? "text-emerald-700"
                        : "text-muted-foreground",
                    )}
                  >
                    {exportStatus.replace("_", " ")}
                  </span>
                </>
              )}
            </div>
          )}
          <DialogDescription>
            Exports exactly this edition. Recurring header, footer, and the
            controlled-copy stamp follow the PDF cover settings.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <OptionGroup title="Cover & structure">
            <ToggleRow
              id="title-page"
              label="Title page"
              sublabel="One-page cover with type, doc ID, owner, dates."
              value={options.titlePage}
              onChange={(v) => setOptions((o) => ({ ...o, titlePage: v }))}
            />
            <ToggleRow
              id="show-ppe"
              label="Show required PPE"
              sublabel="Small PPE band on the title page. In the body it stays large."
              value={options.showPpe}
              onChange={(v) => setOptions((o) => ({ ...o, showPpe: v }))}
            />
          </OptionGroup>

          <OptionGroup title="Document overview">
            <ToggleRow
              id="rev-block"
              label="Revision history"
              sublabel="Version table, generated from publish history."
              value={options.revisionBlock}
              onChange={(v) => setOptions((o) => ({ ...o, revisionBlock: v }))}
            />
            <ToggleRow
              id="machines-block"
              label="Linked Assets"
              sublabel="Machines linked to this document."
              value={options.machinesBlock}
              onChange={(v) => setOptions((o) => ({ ...o, machinesBlock: v }))}
            />
            <ToggleRow
              id="references-block"
              label="References table"
              sublabel="Built from the reference-document chips in the body."
              value={options.referencesBlock}
              onChange={(v) => setOptions((o) => ({ ...o, referencesBlock: v }))}
            />
            {launchLogCount > 0 && (
              <ToggleRow
                id="logs-block"
                label="Linked logs"
                sublabel="Launch logs referenced in the body."
                value={options.logsBlock}
                onChange={(v) => setOptions((o) => ({ ...o, logsBlock: v }))}
              />
            )}
            {pdfStorageIds.length > 0 && (
              <div className="flex items-start gap-2 rounded-md bg-muted/40 px-2 py-1.5 text-[11px] text-muted-foreground">
                <FileDown className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  {pdfStorageIds.length} embedded PDF
                  {pdfStorageIds.length === 1 ? "" : "s"} will be rendered into
                  the export (up to {MAX_PDF_PAGES} pages each).
                </span>
              </div>
            )}
          </OptionGroup>

          <div>
            <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Watermark
            </Label>
            <RadioGroup
              className="mt-1.5 grid grid-cols-2 gap-1.5"
              value={options.watermark}
              onValueChange={(v) =>
                setOptions((o) => ({ ...o, watermark: v as PdfExportOptions["watermark"] }))
              }
            >
              <WmOption value="none" label="None" />
              <WmOption value="controlled" label="Controlled copy" />
              <WmOption value="draft" label="Draft" />
              <WmOption value="review" label="Under review" />
            </RadioGroup>
          </div>

          <Separator />

          <div className="rounded-md border border-dashed bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
            Estimated <strong>{estimatedPages}</strong> page
            {estimatedPages === 1 ? "" : "s"}
            {options.titlePage ? " · title page" : ""}
            {hasFrontMatter ? " · overview" : ""}
            {pdfStorageIds.length > 0 ? " · + embedded PDF pages" : ""}
          </div>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={preparing}>
            Cancel
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => void openExport(false)}
            disabled={busy}
          >
            {preparing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
            Preview
          </Button>
          <Button
            size="sm"
            className="gap-1.5 bg-orange-600 text-white hover:bg-orange-700"
            onClick={() => void openExport(true)}
            disabled={busy}
          >
            {preparing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            Print or save as PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function OptionGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </div>
      <div className="rounded-md border bg-card p-1">{children}</div>
    </div>
  )
}

function ToggleRow({
  id,
  label,
  sublabel,
  value,
  onChange,
}: {
  id: string
  label: string
  sublabel: string
  value: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-start gap-3 rounded-md px-1 py-1">
      <Switch id={id} checked={value} onCheckedChange={onChange} className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <Label htmlFor={id} className="cursor-pointer text-sm font-medium">
          {label}
        </Label>
        <div className="text-[11px] text-muted-foreground">{sublabel}</div>
      </div>
    </div>
  )
}

function WmOption({ value, label }: { value: string; label: string }) {
  return (
    <Label
      htmlFor={`wm-${value}`}
      className="flex cursor-pointer items-center gap-2 rounded-md border bg-card px-2.5 py-1.5 text-xs hover:bg-muted/40"
    >
      <RadioGroupItem id={`wm-${value}`} value={value} />
      {label}
    </Label>
  )
}

function estimatePageCount(body: unknown, opts: PdfExportOptions): number {
  let pages = 0
  // The overview tables now live on the title page, so they don't add a page.
  if (opts.titlePage) pages += 1
  // Naive: count headings / paragraphs and divide. The browser's actual
  // pagination is what matters; this is a rough estimate for the dialog hint.
  const blocks = countBlocks(body)
  pages += Math.max(1, Math.ceil(blocks / 18))
  return pages
}

function countBlocks(body: unknown): number {
  if (!body || typeof body !== "object") return 0
  const node = body as { type?: string; content?: unknown[] }
  let n = 0
  const walk = (x: unknown) => {
    if (!x || typeof x !== "object") return
    const v = x as { type?: string; content?: unknown[] }
    if (
      v.type === "paragraph" ||
      v.type === "heading" ||
      v.type === "stepItem" ||
      v.type === "blockquote" ||
      v.type === "callout" ||
      v.type === "diagram" ||
      v.type === "table"
    ) {
      n += 1
    }
    if (Array.isArray(v.content)) v.content.forEach(walk)
  }
  walk(node)
  return n
}
