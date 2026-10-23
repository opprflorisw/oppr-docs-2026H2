// DocumentEditPage
//
// Authoring surface with a sticky page header + togglable metadata panel.
//
// Lifecycle is gated server-side. The action bar exposes only the transitions
// valid for the current status; each one persists the current content first
// (a new version) and then advances the state:
//   draft      → Save · Submit for review (needs reviewer)
//   in_review  → Save · Approve (needs approver) · Revert to draft
//   approved   → Save · Publish · Revert to draft
//   published  → read-only; this page redirects to the reader. Editing a
//                published doc forks a new draft via documents.createNewVersion.

import { useEffect, useLayoutEffect, useMemo, useState } from "react"
import { useLocation, useRoute } from "wouter"
import { toast } from "sonner"
import { Eye, EyeOff, FileDown, LayoutTemplate, RotateCcw, X } from "lucide-react"
import { useMutation, useQuery } from "convex/react"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { StatusBadge } from "@/components/docs/StatusBadge"
import { TypeBadge } from "@/components/docs/TypeBadge"
import { DocumentEditor } from "@/components/docs/DocumentEditor"
import { PublishToPdfDialog } from "@/components/docs/PublishToPdfDialog"
import { TopBar } from "@/components/layout/TopBar"
import { PageHeader } from "@/components/layout/PageHeader"
import {
  MetadataPanel,
  validateMetadata,
  type MetadataValue,
} from "@/components/docs/MetadataPanel"
import { chunksFromTipTap } from "@/components/docs/chunking"
import { RefileDocumentDialog } from "@/components/docs/RefileDocumentDialog"
import { parseNamingCode } from "@/lib/namingCode"
import { walkBodyAssetIds } from "@/lib/bodyAssets"
import { walkBodyRefs } from "@/lib/bodyRefs"
import { walkBodyLogs } from "@/lib/bodyLogs"
import { cn } from "@/lib/utils"
import type { DocumentType } from "@/types"

const EMPTY_DOC = { type: "doc", content: [{ type: "paragraph" }] }
const META_VISIBLE_KEY = "oppr-docs:edit-metadata-visible"
// Sticky stack: TopBar (top-0, h-12 = 48px) + PageHeader. The ribbon and the
// metadata panel dock GAP px below the header so the top padding is preserved
// when scrolling, instead of sliding up flush against it.
const TOPBAR_H = 48
const STICKY_GAP = 16
const PAGE_HEADER_ID = "edit-page-header"

function readMetaVisible(): boolean {
  if (typeof window === "undefined") return true
  try {
    const v = window.localStorage.getItem(META_VISIBLE_KEY)
    return v === null ? true : v === "1"
  } catch {
    return true
  }
}
function writeMetaVisible(visible: boolean) {
  try {
    window.localStorage.setItem(META_VISIBLE_KEY, visible ? "1" : "0")
  } catch {
    /* ignore */
  }
}

type Action = "save" | "submit" | "approve" | "publish" | "revert"

export function DocumentEditPage() {
  const [, params] = useRoute<{ id: string }>("/docs/:id/edit")
  const [, setLocation] = useLocation()

  const docId = params?.id ?? ""
  const saveContent = useMutation(api.documents.saveContent)
  const submitForReview = useMutation(api.documents.submitForReview)
  const approveDoc = useMutation(api.documents.approve)
  const publishDoc = useMutation(api.documents.publish)
  const revertToDraft = useMutation(api.documents.revertToDraft)
  const createTemplate = useMutation(api.templates.create)

  const docResult = useQuery(
    api.documents.getWithAssets,
    docId ? { id: docId as Id<"documents"> } : "skip",
  )
  const versionResult = useQuery(
    api.documents.getCurrentVersion,
    docId ? { documentId: docId as Id<"documents"> } : "skip",
  )
  const assetsRaw = useQuery(api.assets.list)
  const docsRaw = useQuery(api.documents.list, {})
  const logsRaw = useQuery(api.logs.list)
  const ready = docResult !== undefined

  const [meta, setMeta] = useState<MetadataValue | null>(null)
  const [body, setBody] = useState<unknown>(EMPTY_DOC)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [running, setRunning] = useState<Action | null>(null)
  const [bodyHydrated, setBodyHydrated] = useState(false)
  const [metaVisible, setMetaVisible] = useState<boolean>(() => readMetaVisible())
  const [pdfOpen, setPdfOpen] = useState(false)
  const [refileOpen, setRefileOpen] = useState(false)
  // Recovered local-scratch body from a previous session (autosave), pending
  // the user's restore / dismiss choice.
  const [recovered, setRecovered] = useState<{ body: unknown; at: number } | null>(
    null,
  )
  const [savingTemplate, setSavingTemplate] = useState(false)

  // Where the ribbon + metadata panel dock when scrolling: GAP px below the
  // sticky page header, measured so it survives button/title wrapping.
  const [stickyTop, setStickyTop] = useState(TOPBAR_H + 60 + STICKY_GAP)
  useLayoutEffect(() => {
    const el = document.getElementById(PAGE_HEADER_ID)
    if (!el) return
    const update = () => setStickyTop(TOPBAR_H + el.offsetHeight + STICKY_GAP)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [ready])

  const scratchKey = docId ? `oppr-docs:scratch:${docId}` : ""

  function toggleMeta() {
    setMetaVisible((prev) => {
      const next = !prev
      writeMetaVisible(next)
      return next
    })
  }

  // A published edition is read-only. Editing must fork a new draft via the
  // read page's "New version" action, so bounce direct edit-URL hits back there.
  useEffect(() => {
    if (docResult && docResult.doc.status === "published") {
      setLocation(`/docs/${docResult.doc._id}`)
    }
  }, [docResult, setLocation])

  // Hydrate metadata from the loaded doc once. Older documents predate the
  // location/discipline fields — derive them from the naming code so the
  // panel is never half-empty and saves don't fail validation.
  useEffect(() => {
    if (!docResult || meta) return
    const d = docResult.doc
    const parsed = d.namingCode ? parseNamingCode(d.namingCode) : null
    setMeta({
      title: d.title,
      type: d.type as DocumentType,
      location: d.location ?? parsed?.location ?? "",
      discipline: d.discipline ?? parsed?.discipline ?? "",
      ownerId: d.ownerId ?? "",
      reviewerId: d.reviewerId ?? "",
      approverId: d.approverId ?? "",
    })
  }, [docResult, meta])

  // Hydrate body once. Also surface any local-scratch autosave from a previous
  // session if it differs from the saved version.
  useEffect(() => {
    if (bodyHydrated || !versionResult) return
    const serverBody =
      versionResult.bodyKind === "tiptap" && versionResult.bodyJson
        ? versionResult.bodyJson
        : EMPTY_DOC
    setBody(serverBody)
    if (scratchKey) {
      try {
        const raw = window.localStorage.getItem(scratchKey)
        if (raw) {
          const parsed = JSON.parse(raw) as { body: unknown; at: number }
          if (
            parsed?.body &&
            JSON.stringify(parsed.body) !== JSON.stringify(serverBody)
          ) {
            setRecovered({ body: parsed.body, at: parsed.at })
          }
        }
      } catch {
        /* ignore malformed scratch */
      }
    }
    setBodyHydrated(true)
  }, [versionResult, bodyHydrated, scratchKey])

  // Local-scratch autosave (Google-Docs-style). Debounced; localStorage only;
  // never bumps a version. Explicit Save clears it.
  useEffect(() => {
    if (!bodyHydrated || !scratchKey) return
    const t = setTimeout(() => {
      try {
        window.localStorage.setItem(
          scratchKey,
          JSON.stringify({ body, at: Date.now() }),
        )
      } catch {
        /* quota / serialization — non-fatal */
      }
    }, 1000)
    return () => clearTimeout(t)
  }, [body, bodyHydrated, scratchKey])

  function clearScratch() {
    if (scratchKey) {
      try {
        window.localStorage.removeItem(scratchKey)
      } catch {
        /* ignore */
      }
    }
    setRecovered(null)
  }

  useEffect(() => {
    if (Object.keys(errors).length > 0 && !metaVisible) {
      setMetaVisible(true)
      writeMetaVisible(true)
    }
  }, [errors, metaVisible])

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

  // Persist current content + roles as a new version. Returns false if the
  // metadata is invalid.
  async function persist(): Promise<boolean> {
    if (!meta || !docResult) return false
    const validation = validateMetadata(meta)
    if (!validation.ok) {
      setErrors(validation.errors)
      toast.error("Please fix the metadata errors")
      return false
    }
    setErrors({})
    const raw = chunksFromTipTap(body)
    await saveContent({
      id: docResult.doc._id,
      title: meta.title.trim(),
      type: meta.type,
      location: meta.location,
      discipline: meta.discipline,
      ownerId: (meta.ownerId || null) as Id<"users"> | null,
      reviewerId: (meta.reviewerId || null) as Id<"users"> | null,
      approverId: (meta.approverId || null) as Id<"users"> | null,
      body,
      chunks: raw.map((r) => ({ text: r.text, section: r.section })),
    })
    clearScratch()
    return true
  }

  async function saveAsTemplate() {
    if (!meta) return
    setSavingTemplate(true)
    try {
      const id = await createTemplate({
        name: `${meta.title?.trim() || "Untitled"} — template`,
        type: meta.type,
        description: "Created from a document. Trim the specifics.",
        bodyJson: body,
      })
      toast.success("Template created — trim the specifics and save")
      setLocation(`/templates/${id}/edit`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't create template")
    } finally {
      setSavingTemplate(false)
    }
  }

  // Persist current edits, then open the PDF dialog so the export always
  // matches what's on screen (the dialog reads the saved version).
  async function openPdf() {
    if (running) return
    setRunning("save")
    try {
      const ok = await persist()
      if (ok) {
        toast.success("Draft saved — exporting the version on screen")
        setPdfOpen(true)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed")
    } finally {
      setRunning(null)
    }
  }

  async function run(action: Action) {
    if (!meta || !docResult) return
    const id = docResult.doc._id

    // Client-side guard rails so the user gets a friendly message before the
    // server rejects the transition.
    if (action === "submit" && !meta.reviewerId) {
      setErrors({})
      toast.error("Assign a reviewer before submitting for review.")
      setMetaVisible(true)
      return
    }
    if (action === "approve" && !meta.approverId) {
      toast.error("Assign an approver before approving.")
      setMetaVisible(true)
      return
    }

    setRunning(action)
    try {
      if (action === "revert") {
        await revertToDraft({ id })
        toast.success("Reverted to draft")
        return
      }
      const ok = await persist()
      if (!ok) return
      if (action === "save") {
        toast.success("Draft saved")
      } else if (action === "submit") {
        await submitForReview({ id })
        toast.success("Submitted for review")
      } else if (action === "approve") {
        await approveDoc({ id })
        toast.success("Approved")
      } else if (action === "publish") {
        await publishDoc({ id })
        toast.success("Published")
        setLocation(`/docs/${id}`)
      }
    } catch (err) {
      console.error(err)
      toast.error(err instanceof Error ? err.message : "Action failed")
    } finally {
      setRunning(null)
    }
  }

  if (!ready) {
    return <div className="p-6 text-sm text-muted-foreground">Loading…</div>
  }
  if (!docResult) {
    return (
      <div className="space-y-2 p-6">
        <h1 className="text-lg font-semibold">Document not found</h1>
        <Button variant="outline" size="sm" onClick={() => setLocation("/library")}>
          Back to library
        </Button>
      </div>
    )
  }
  if (!meta) {
    return <div className="p-6 text-sm text-muted-foreground">Loading…</div>
  }

  const doc = docResult.doc
  const status = doc.status
  const busy = running !== null
  const errorCount = Object.keys(errors).length
  const namingCode = doc.namingCode
  const displayCode = namingCode || "Pre-draft"

  return (
    <div className="flex flex-col">
      <TopBar
        breadcrumb={[
          { label: "Documents", href: "/library" },
          {
            label: `${displayCode} · ${meta.title || "Untitled"}`,
            href: `/docs/${doc._id}`,
          },
          { label: "Edit" },
        ]}
      />
      <PageHeader
        id={PAGE_HEADER_ID}
        title={`${displayCode} · ${meta.title || "Untitled document"}`}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <TypeBadge type={meta.type} />
            <StatusBadge status={status} />
            <span className="font-mono text-[10px]">v{doc.currentVersion}</span>
          </span>
        }
        actions={
          <>
            <Button
              variant="ghost"
              size="sm"
              className="relative"
              onClick={toggleMeta}
              title={metaVisible ? "Hide metadata panel" : "Show metadata panel"}
            >
              {metaVisible ? (
                <EyeOff className="mr-1.5 h-3.5 w-3.5" />
              ) : (
                <Eye className="mr-1.5 h-3.5 w-3.5" />
              )}
              <span className="hidden md:inline">
                {metaVisible ? "Hide metadata" : "Show metadata"}
              </span>
              {!metaVisible && errorCount > 0 && (
                <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-destructive" />
              )}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setLocation(`/docs/${doc._id}`)}
            >
              View
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={savingTemplate}
              title="Create a reusable template from this document"
              onClick={() => void saveAsTemplate()}
            >
              <LayoutTemplate className="h-3.5 w-3.5" />
              {savingTemplate ? "Saving…" : "Save as template"}
            </Button>
            <Button
              size="sm"
              className="gap-1.5 bg-orange-600 text-white hover:bg-orange-700"
              title="Save and publish to PDF"
              disabled={busy}
              onClick={() => void openPdf()}
            >
              <FileDown className="h-3.5 w-3.5" />
              PDF
            </Button>
            <PublishToPdfDialog
              documentId={doc._id}
              open={pdfOpen}
              onOpenChange={setPdfOpen}
              version={doc.currentVersion}
            />

            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => void run("save")}
            >
              {running === "save" ? "Saving…" : "Save"}
            </Button>

            {(status === "in_review" || status === "approved") && (
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => void run("revert")}
              >
                {running === "revert" ? "Reverting…" : "Revert to draft"}
              </Button>
            )}

            {status === "draft" && (
              <Button
                size="sm"
                disabled={busy}
                onClick={() => void run("submit")}
                title={!meta.reviewerId ? "Assign a reviewer first" : undefined}
              >
                {running === "submit" ? "Submitting…" : "Submit for review"}
              </Button>
            )}
            {status === "in_review" && (
              <Button
                size="sm"
                disabled={busy}
                onClick={() => void run("approve")}
                title={!meta.approverId ? "Assign an approver first" : undefined}
              >
                {running === "approve" ? "Approving…" : "Approve"}
              </Button>
            )}
            {status === "approved" && (
              <Button
                size="sm"
                disabled={busy}
                onClick={() => void run("publish")}
              >
                {running === "publish" ? "Publishing…" : "Publish"}
              </Button>
            )}
          </>
        }
      />

      {recovered && (
        <div className="mx-6 mt-3 flex items-center gap-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100">
          <RotateCcw className="h-4 w-4 shrink-0" />
          <span className="flex-1">
            Unsaved changes from {new Date(recovered.at).toLocaleString()} were
            recovered.
          </span>
          <Button
            size="sm"
            variant="outline"
            className="h-7"
            onClick={() => {
              setBody(recovered.body)
              setRecovered(null)
            }}
          >
            Restore
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            title="Dismiss"
            onClick={clearScratch}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      <div
        className={cn(
          "grid grid-cols-1 gap-6 px-6 pb-6 pt-4",
          metaVisible && "lg:grid-cols-[minmax(0,1fr)_320px]",
        )}
      >
        <div className="min-w-0">
          <DocumentEditor
            content={body}
            onChange={(json) => setBody(json)}
            placeholder="Continue writing… type / for blocks"
            toolbarTopOffset={stickyTop}
          />
        </div>
        {metaVisible && (
          <div className="lg:sticky lg:self-start" style={{ top: stickyTop }}>
            <MetadataPanel
              value={meta}
              onChange={setMeta}
              errors={errors}
              fixedNamingCode={namingCode || undefined}
              onRequestRefile={
                namingCode ? () => setRefileOpen(true) : undefined
              }
              derivedAssets={derivedAssets}
              derivedRefs={derivedRefs}
              derivedLogs={derivedLogs}
            />
          </div>
        )}
      </div>

      {namingCode && (
        <RefileDocumentDialog
          open={refileOpen}
          onOpenChange={setRefileOpen}
          docId={doc._id}
          currentCode={namingCode}
          currentLocation={meta.location}
          currentDiscipline={meta.discipline}
          currentType={meta.type}
        />
      )}
    </div>
  )
}
