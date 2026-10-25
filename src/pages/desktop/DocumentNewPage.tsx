// DocumentNewPage
//
// Entry point for "New document", reached from the chooser:
//   /docs/new/compose?blank=1        empty editor
//   /docs/new/compose?assistant=1    empty editor with the guided writer open
//   /docs/new/compose?template=<id>  editor seeded from a DB template
//   /docs/new/import                 PDF upload, embedded as an attachment
//                                    node inside an otherwise normal doc
//
// Location and Discipline default from the last used values, then from the
// checked-in person's area.
//
// The naming code is built server-side from Location + Discipline + Type +
// auto sequence. Linked assets are derived from the body. All flows call
// documents.create.

import { useEffect, useMemo, useRef, useState } from "react"
import { useLocation } from "wouter"
import { toast } from "sonner"
import { Upload, FileText, Sparkles, X } from "lucide-react"
import * as pdfjs from "pdfjs-dist"
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url"
import { useMutation, useQuery } from "convex/react"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card"
import { DocumentEditor } from "@/components/docs/DocumentEditor"
import { TopBar } from "@/components/layout/TopBar"
import { PageHeader } from "@/components/layout/PageHeader"
import {
  MetadataPanel,
  validateMetadata,
  type MetadataValue,
} from "@/components/docs/MetadataPanel"
import {
  chunksFromPdfPages,
  chunksFromTipTap,
} from "@/components/docs/chunking"
import { walkBodyAssetIds } from "@/lib/bodyAssets"
import { walkBodyRefs } from "@/lib/bodyRefs"
import { walkBodyLogs } from "@/lib/bodyLogs"
import type { DocumentType } from "@/types"
import { useCheckIn } from "@/lib/checkIn"
import { isEngineerOrAdmin } from "@/lib/roles"
import { DocumentGuidedWriter } from "@/components/guided/DocumentGuidedWriter"
import { appendToBody } from "@/components/find/editorInsert"

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

const EMPTY_DOC = { type: "doc", content: [{ type: "paragraph" }] }
const LAST_FILING_KEY = "oppr-docs:last-filing"

function readLastFiling(): { location: string; discipline: string } {
  try {
    const raw = window.localStorage.getItem(LAST_FILING_KEY)
    const v = raw ? (JSON.parse(raw) as { location?: unknown; discipline?: unknown }) : null
    return {
      location: typeof v?.location === "string" ? v.location : "",
      discipline: typeof v?.discipline === "string" ? v.discipline : "",
    }
  } catch {
    return { location: "", discipline: "" }
  }
}

function defaultMetadata(): MetadataValue {
  const last = readLastFiling()
  return {
    title: "",
    type: "sop",
    location: last.location,
    discipline: last.discipline,
    ownerPersonId: "",
    reviewerPersonId: "",
    approverPersonId: "",
  }
}

export function DocumentNewPage() {
  const [pathname, setLocation] = useLocation()
  const search =
    typeof window !== "undefined" ? window.location.search : ""
  const params = new URLSearchParams(search)
  const templateId = params.get("template")
  const kind: "pdf" | "tiptap" = pathname.endsWith("/import") ? "pdf" : "tiptap"

  const create = useMutation(api.documents.create)
  const generateUploadUrl = useMutation(api.files.generateUploadUrl)
  const template = useQuery(
    api.templates.get,
    templateId ? { id: templateId as Id<"templates"> } : "skip",
  )
  const assetsRaw = useQuery(api.assets.list)
  const docsRaw = useQuery(api.documents.list, {})
  const logsRaw = useQuery(api.logs.list)
  const vocab = useQuery(api.naming.listVocabulary)
  const { person } = useCheckIn()

  const [meta, setMeta] = useState<MetadataValue>(() => defaultMetadata())
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [body, setBody] = useState<unknown>(() => EMPTY_DOC)
  const [templateApplied, setTemplateApplied] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [pdfPreview, setPdfPreview] = useState<{
    pages: number
    bytes: Uint8Array
  } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  // "Write with the assistant" from New document: the writer opens straight
  // away and its Draft lands in this editor; the person then checks the
  // details and creates the document as usual.
  const [writerOpen, setWriterOpen] = useState(() => kind === "tiptap" && params.get("assistant") === "1")

  // Seed the body + type from the chosen template, once.
  useEffect(() => {
    if (kind !== "tiptap" || templateApplied || !templateId || !template) return
    setBody(template.bodyJson)
    setMeta((m) => ({ ...m, type: template.type as DocumentType }))
    setTemplateApplied(true)
  }, [kind, templateApplied, templateId, template])

  // Default the owner to the checked-in Engineer, and the location to the
  // person's area when nothing was used before. Both stay editable.
  const peopleSeeded = useRef(false)
  useEffect(() => {
    if (peopleSeeded.current || !person || !vocab) return
    peopleSeeded.current = true
    const area = (person.area ?? "").trim().toLowerCase()
    const areaLocation = area
      ? vocab.locations.find((l) => l.code.toLowerCase() === area || l.label.toLowerCase() === area)?.code
      : undefined
    setMeta((m) => ({
      ...m,
      ownerPersonId: m.ownerPersonId || (isEngineerOrAdmin(person) ? person._id : ""),
      location: m.location || areaLocation || "",
    }))
  }, [person, vocab])

  // Why Create is not possible yet, said next to the button.
  const createBlocker =
    kind === "pdf" && !pdfPreviewReady()
      ? "Choose a PDF first."
      : !meta.title.trim()
        ? "Give it a title."
        : !meta.location || !meta.discipline
          ? "Choose a location and a discipline."
          : null
  function pdfPreviewReady() {
    return pdfPreview != null
  }

  const derivedAssets = useMemo(() => {
    const ids = walkBodyAssetIds(body)
    const byId = new Map((assetsRaw ?? []).map((a) => [a._id as string, a]))
    return ids
      .map((id) => byId.get(id))
      .filter((a): a is NonNullable<typeof a> => Boolean(a))
      .map((a) => ({ id: a._id as string, code: a.code, name: a.name }))
  }, [body, assetsRaw])

  const derivedRefs = useMemo(() => {
    const refs = walkBodyRefs(body)
    const byId = new Map((docsRaw ?? []).map((d) => [d._id as string, d]))
    return refs.map((r) => {
      const d = byId.get(r.docId)
      return {
        id: r.docId,
        code: d?.namingCode ?? r.code,
        title: d?.title ?? "(missing document)",
      }
    })
  }, [body, docsRaw])

  const derivedLogs = useMemo(() => {
    const logs = walkBodyLogs(body)
    const byId = new Map((logsRaw ?? []).map((l) => [l._id as string, l]))
    return logs.map((r) => {
      const l = byId.get(r.logId)
      return {
        id: r.logId,
        code: l?.code ?? r.code,
        name: l?.name ?? r.label ?? "(missing log)",
      }
    })
  }, [body, logsRaw])

  async function handlePdfFile(file: File) {
    setPdfFile(file)
    try {
      const buf = await file.arrayBuffer()
      const bytes = new Uint8Array(buf)
      const pdf = await pdfjs.getDocument({ data: bytes.slice() }).promise
      setPdfPreview({ pages: pdf.numPages, bytes })
      if (!meta.title) {
        setMeta((m) => ({ ...m, title: file.name.replace(/\.pdf$/i, "") }))
      }
    } catch (err) {
      console.error("PDF parse failed", err)
      toast.error("Could not read that PDF")
      setPdfFile(null)
      setPdfPreview(null)
    }
  }

  async function extractPdfText(bytes: Uint8Array): Promise<string[]> {
    const pdf = await pdfjs.getDocument({ data: bytes.slice() }).promise
    const pages: string[] = []
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i)
      const content = await page.getTextContent()
      pages.push(
        content.items
          .map((it) => ("str" in it ? (it as { str: string }).str : ""))
          .join(" "),
      )
    }
    return pages
  }

  async function submit() {
    const validation = validateMetadata(meta)
    if (kind === "pdf" && !pdfPreview) {
      toast.error("Drop a PDF file first")
      return
    }
    if (!validation.ok) {
      setErrors(validation.errors)
      toast.error("Fix the details marked in the panel first")
      return
    }
    setErrors({})
    try {
      window.localStorage.setItem(
        LAST_FILING_KEY,
        JSON.stringify({ location: meta.location, discipline: meta.discipline }),
      )
    } catch {
      // Storage blocked: the defaults are simply not remembered.
    }
    const roles = {
      ownerPersonId: (meta.ownerPersonId || null) as Id<"people"> | null,
      reviewerPersonId: (meta.reviewerPersonId || null) as Id<"people"> | null,
      approverPersonId: (meta.approverPersonId || null) as Id<"people"> | null,
      ...(person ? { personId: person._id } : {}),
    }
    setSubmitting(true)
    try {
      if (kind === "pdf") {
        if (!pdfPreview || !pdfFile) throw new Error("PDF missing")
        const uploadUrl = await generateUploadUrl()
        const uploadRes = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": pdfFile.type || "application/pdf" },
          body: pdfPreview.bytes.slice(),
        })
        if (!uploadRes.ok) {
          throw new Error(`Upload failed: ${uploadRes.status} ${uploadRes.statusText}`)
        }
        const { storageId } = (await uploadRes.json()) as {
          storageId: Id<"_storage">
        }
        const pages = await extractPdfText(pdfPreview.bytes)
        const raw = chunksFromPdfPages(pages)
        // Embed the PDF as an attachment node inside an editable document.
        const pdfBody = {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: `Imported from ${pdfFile.name}.` }],
            },
            {
              type: "pdfAttachment",
              attrs: {
                storageId,
                filename: pdfFile.name,
                pageCount: pdfPreview.pages,
              },
            },
          ],
        }
        const docId = await create({
          location: meta.location,
          discipline: meta.discipline,
          title: meta.title.trim(),
          type: meta.type,
          ...roles,
          body: pdfBody,
          chunks: raw.map((r) => ({ text: r.text, section: r.section })),
          pdfStorageId: storageId,
        })
        toast.success(`Imported ${pdfFile.name}`)
        setLocation(`/docs/${docId}/edit`)
        return
      }

      const raw = chunksFromTipTap(body)
      const docId = await create({
        location: meta.location,
        discipline: meta.discipline,
        title: meta.title.trim(),
        type: meta.type,
        ...roles,
        body,
        chunks: raw.map((r) => ({ text: r.text, section: r.section })),
      })
      toast.success("Document created")
      setLocation(`/docs/${docId}/edit`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "The document could not be created.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex flex-col">
      <TopBar
        breadcrumb={[
          { label: "Documents", href: "/library" },
          { label: "New document", href: "/library?new=1" },
          { label: kind === "pdf" ? "Import PDF" : "Compose" },
        ]}
      />
      <PageHeader
        title={`New ${kind === "pdf" ? "PDF import" : "document"}`}
        statusLine={
          kind === "pdf"
            ? "Choose a PDF, fill in the details and create. The PDF is embedded so you can write around it."
            : "Write the body, fill in the details and create."
        }
        secondary={
          kind === "tiptap"
            ? [{ label: "Write with the assistant", icon: Sparkles, onClick: () => setWriterOpen(true), tour: "documents-compose-assistant" }]
            : undefined
        }
        primary={
          <span className="flex items-center gap-2">
            {createBlocker && <span className="text-xs text-muted-foreground">{createBlocker}</span>}
            <Button onClick={() => void submit()} disabled={submitting || createBlocker != null} size="sm" data-tour="documents-compose-create">
              {submitting ? "Creating..." : kind === "pdf" ? "Import PDF" : "Create document"}
            </Button>
          </span>
        }
      />

      <div className="grid grid-cols-1 gap-6 p-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-4">
          {kind === "pdf" ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <FileText className="h-4 w-4 text-primary" />
                  Source PDF
                </CardTitle>
                <CardDescription>
                  Read in your browser, stored with the document and embedded as an attachment.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {pdfPreview && pdfFile ? (
                  <div className="flex items-center justify-between rounded-md border bg-muted/30 p-3">
                    <div className="flex items-center gap-3">
                      <FileText className="h-5 w-5 text-primary" />
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">
                          {pdfFile.name}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {pdfPreview.pages} page
                          {pdfPreview.pages === 1 ? "" : "s"} ·{" "}
                          {(pdfPreview.bytes.byteLength / 1024).toFixed(1)} KB
                        </div>
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setPdfFile(null)
                        setPdfPreview(null)
                        if (fileInputRef.current) fileInputRef.current.value = ""
                      }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <label
                    htmlFor="pdf-file"
                    className="flex h-40 cursor-pointer flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed border-muted-foreground/30 bg-muted/20 transition-colors hover:bg-muted/40"
                  >
                    <Upload className="h-6 w-6 text-muted-foreground" />
                    <span className="text-sm font-medium">
                      Drop a PDF or click to choose
                    </span>
                    <span className="text-xs text-muted-foreground">PDF files only</span>
                  </label>
                )}
                <input
                  id="pdf-file"
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) void handlePdfFile(f)
                  }}
                />
              </CardContent>
            </Card>
          ) : (
            <Card data-tour="documents-compose-body">
              <CardHeader>
                <CardTitle className="text-base">Body</CardTitle>
                <CardDescription>
                  Get started here. You can keep editing after you create it.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <DocumentEditor
                  content={body}
                  onChange={(json) => setBody(json)}
                  placeholder="Write the first paragraph. Type / for blocks"
                  toolbarTopOffset={104}
                />
              </CardContent>
            </Card>
          )}
        </div>

        <div className="lg:sticky lg:top-6 lg:self-start" data-tour="documents-compose-details">
          <MetadataPanel
            value={meta}
            onChange={setMeta}
            errors={errors}
            derivedAssets={derivedAssets}
            derivedRefs={derivedRefs}
            derivedLogs={derivedLogs}
          />
        </div>
      </div>

      {kind === "tiptap" && (
        <DocumentGuidedWriter
          open={writerOpen}
          onOpenChange={setWriterOpen}
          context={{
            documentType: meta.type,
            title: meta.title,
            areaCode: meta.location || null,
            assetIds: derivedAssets.map((a) => a.id as Id<"assets">),
            whereSuggestions: derivedAssets.map((a) => `At ${a.code} ${a.name}`),
          }}
          onInsert={(nodes, draft) => {
            setBody((b: unknown) => appendToBody(b, nodes))
            if (draft.title.trim()) setMeta((m) => (m.title.trim() ? m : { ...m, title: draft.title.trim() }))
            toast.success("The draft is in the editor. Check the details on the right, then create the document.")
          }}
        />
      )}
    </div>
  )
}
