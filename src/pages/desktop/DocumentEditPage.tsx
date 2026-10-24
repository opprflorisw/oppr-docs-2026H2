// DocumentEditPage
//
// Authoring surface with a sticky page header + togglable metadata panel.
//
// Lifecycle is gated server-side. The action bar exposes only the transitions
// valid for the current status; each one persists the current content first
// (a new version) and then advances the state:
//   draft      -> Save, Submit for review (dialog: reviewer, approver, change note)
//   in_review  -> Save, Approve (named reviewer only), Send back to draft
//   approved   -> Save, Publish (named approver only, change kind + impact)
//   published  -> read-only; this page redirects to the reader. Editing a
//                published doc forks a new draft via documents.createNewVersion.

import { useEffect, useLayoutEffect, useMemo, useState } from "react"
import { useLocation, useRoute, useSearch } from "wouter"
import { toast } from "sonner"
import { Eye, EyeOff, FileDown, LayoutTemplate, Lightbulb, RotateCcw, X } from "lucide-react"
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
import { useCheckIn } from "@/lib/checkIn"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import type { DocumentType } from "@/types"
import { WrappedManualEditor } from "@/components/manuals/WrappedManualEditor"
import { PublishDocumentDialog, SubmitForReviewDialog, serverMessage } from "@/components/docs/LifecycleDialogs"
import { formatDateTime } from "@/lib/time"

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
  const approveDoc = useMutation(api.documents.approve)
  const { person } = useCheckIn()
  const engineer = person?.kind === "engineer" ? person : null
  const [signOff, setSignOff] = useState<"approve" | null>(null)
  const [submitOpen, setSubmitOpen] = useState(false)
  const [publishOpen, setPublishOpen] = useState(false)
  // "Open v2 and add this fix" from a Finding: show what to fix while editing.
  const search = useSearch()
  const fixFindingId = new URLSearchParams(search).get("finding")
  const findings = useQuery(api.findings.list, fixFindingId ? { status: "open" } : "skip")
  const fixFinding = findings?.find((f) => f._id === fixFindingId) ?? null
  const [fixDismissed, setFixDismissed] = useState(false)
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
      ownerPersonId: d.ownerPersonId ?? "",
      reviewerPersonId: d.reviewerPersonId ?? "",
      approverPersonId: d.approverPersonId ?? "",
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
    // A Wrapped manual's body is its supplier PDF: nothing to autosave.
    if (versionResult?.bodyKind === "pdf") return
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
  }, [body, bodyHydrated, scratchKey, versionResult?.bodyKind])

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
  async function persist(roles?: { reviewerPersonId: string; approverPersonId: string }): Promise<boolean> {
    if (!meta || !docResult) return false
    const m = roles ? { ...meta, ...roles } : meta
    const validation = validateMetadata(m)
    if (!validation.ok) {
      setErrors(validation.errors)
      toast.error("Fix the details marked in the panel first")
      return false
    }
    setErrors({})
    if (roles) setMeta(m)
    const raw = chunksFromTipTap(body)
    await saveContent({
      id: docResult.doc._id,
      title: m.title.trim(),
      type: m.type,
      location: m.location,
      discipline: m.discipline,
      ownerPersonId: (m.ownerPersonId || null) as Id<"people"> | null,
      reviewerPersonId: (m.reviewerPersonId || null) as Id<"people"> | null,
      approverPersonId: (m.approverPersonId || null) as Id<"people"> | null,
      ...(person ? { personId: person._id } : {}),
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
        name: `${meta.title?.trim() || "Untitled"} (template)`,
        type: meta.type,
        description: "Created from a document. Trim the specifics.",
        bodyJson: body,
      })
      toast.success("Template created. Trim the specifics and save.")
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
        toast.success("Draft saved. Exporting the version on screen.")
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

    // Submitting and publishing are decisions with their own dialog.
    if (action === "submit") {
      setSubmitOpen(true)
      return
    }
    if (action === "publish") {
      setPublishOpen(true)
      return
    }
    // Approving is a sign-off: a checked-in Engineer confirms it explicitly,
    // and it applies to the saved version as it is.
    if (action === "approve" && signOff !== action) {
      if (!engineer) {
        toast.error("Check in as an Engineer (top right) to sign this off.")
        return
      }
      setSignOff("approve")
      return
    }

    setRunning(action)
    try {
      if (action === "revert") {
        await revertToDraft({ id, ...(person ? { personId: person._id } : {}) })
        toast.success("Sent back to draft")
        return
      }
      if (action === "approve") {
        if (!engineer) return
        await approveDoc({ id, personId: engineer._id })
        toast.success(`Approved by ${engineer.name}`)
        return
      }
      const ok = await persist()
      if (ok) toast.success("Draft saved")
    } catch (err) {
      toast.error(serverMessage(err, "That did not work. Try again."))
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
  // A Wrapped manual has no body to edit: its supplier PDF is only replaced.
  if (docResult.doc.origin === "wrapped") {
    return <WrappedManualEditor doc={docResult.doc} assets={docResult.assets} />
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
  // Four-eyes in the UI: only the named reviewer approves and only the named
  // approver publishes. Everyone else sees who it waits for.
  const assigned = docResult.assigned
  const waitingFor =
    status === "in_review" && assigned.reviewer && assigned.reviewer._id !== person?._id
      ? assigned.reviewer.name
      : status === "approved" && assigned.approver && assigned.approver._id !== person?._id
        ? assigned.approver.name
        : null
  const isNewVersion = doc.liveVersion != null

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
            <span className="font-mono text-xs">v{doc.currentVersion}</span>
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
              variant="ghost"
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
              variant="outline"
              className="gap-1.5"
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
              {running === "save" ? "Saving..." : "Save"}
            </Button>

            {(status === "in_review" || status === "approved") && (
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => void run("revert")}
              >
                {running === "revert" ? "Sending back..." : "Send back to draft"}
              </Button>
            )}

            {status === "draft" && (
              <Button size="sm" disabled={busy} onClick={() => void run("submit")}>
                Submit for review
              </Button>
            )}
            {(status === "in_review" || status === "approved") && waitingFor && (
              <span className="text-sm text-muted-foreground">Waiting for {waitingFor}</span>
            )}
            {status === "in_review" && !waitingFor && (
              <Button size="sm" disabled={busy} onClick={() => void run("approve")}>
                {running === "approve" ? "Approving..." : "Approve"}
              </Button>
            )}
            {status === "approved" && !waitingFor && (
              <Button size="sm" disabled={busy} onClick={() => void run("publish")}>
                Publish
              </Button>
            )}
          </>
        }
      />

      {(status === "in_review" || status === "approved") && (
        <DecisionStrip
          status={status}
          missingApprover={status === "in_review" && !meta.approverPersonId && !doc.approverId}
          waitingFor={waitingFor}
          onShowMeta={() => setMetaVisible(true)}
        />
      )}

      {fixFinding && !fixDismissed && (
        <div className="mx-6 mt-3 flex items-start gap-3 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
          <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <div className="min-w-0 flex-1 space-y-1">
            <p className="font-medium">Add this fix to v{doc.currentVersion}: {fixFinding.summary}</p>
            {[fixFinding.a, fixFinding.b].map((s) => (
              <p key={s.documentId} className="text-xs text-muted-foreground">
                <span className="font-mono">{s.namingCode}</span>: "{s.quote}"
              </p>
            ))}
          </div>
          <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Hide" onClick={() => setFixDismissed(true)}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      {recovered && (
        <div className="mx-6 mt-3 flex items-center gap-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100">
          <RotateCcw className="h-4 w-4 shrink-0" />
          <span className="flex-1">
            Unsaved changes from {formatDateTime(recovered.at)} were recovered.
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
            placeholder="Continue writing. Type / for blocks"
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
        <>
        <AlertDialog open={signOff !== null} onOpenChange={(o) => !o && setSignOff(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Approve {namingCode} v{doc.currentVersion}?
              </AlertDialogTitle>
              <AlertDialogDescription>
                This records your review of the saved version. It is not published yet: the approver
                does that next. Unsaved edits are not included: save first if you changed something
                (saving changed text sends it back to draft). The sign-off is recorded in the name of{" "}
                {engineer?.name ?? "the checked-in Engineer"}.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => signOff && void run(signOff)}>
                Approve as {engineer?.name.split(" ")[0] ?? "Engineer"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <SubmitForReviewDialog
          open={submitOpen}
          onOpenChange={setSubmitOpen}
          documentId={doc._id}
          namingCode={namingCode}
          isNewVersion={isNewVersion}
          initialReviewer={meta.reviewerPersonId || null}
          initialApprover={meta.approverPersonId || null}
          initialNote={assigned.changeNote}
          beforeSubmit={async (roles) => {
            try {
              return await persist(roles)
            } catch (err) {
              toast.error(serverMessage(err, "The draft could not be saved."))
              return false
            }
          }}
          onSubmitted={() => toast.success(`${namingCode} is submitted for review`)}
        />
        <PublishDocumentDialog
          open={publishOpen}
          onOpenChange={setPublishOpen}
          documentId={doc._id}
          namingCode={namingCode}
          version={doc.currentVersion}
          initialNote={assigned.changeNote}
          onPublished={() => {
            toast.success(`${namingCode} v${doc.currentVersion} is Published`)
            setLocation(`/docs/${doc._id}`)
          }}
        />
        <RefileDocumentDialog
          open={refileOpen}
          onOpenChange={setRefileOpen}
          docId={doc._id}
          currentCode={namingCode}
          currentLocation={meta.location}
          currentDiscipline={meta.discipline}
          currentType={meta.type}
        />
        </>
      )}
    </div>
  )
}

// The decision this document is waiting for, stated in words, with its one
// action. People arrive here from the Home inbox; this is what they came for.
function DecisionStrip({
  status,
  missingApprover,
  waitingFor,
  onShowMeta,
}: {
  status: "in_review" | "approved"
  missingApprover: boolean
  waitingFor: string | null
  onShowMeta: () => void
}) {
  const review = status === "in_review"
  return (
    <div
      role="status"
      className="mx-6 mt-3 flex flex-wrap items-center gap-3 rounded-md border border-primary/30 bg-primary/5 px-3 py-2"
    >
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-medium">
          {review ? "Waiting for review and approval" : "Approved, ready to publish"}
        </p>
        <p className="text-xs text-muted-foreground">
          {waitingFor
            ? `Waiting for ${waitingFor}. Only the named ${review ? "reviewer approves" : "approver publishes"} it. Editing the text sends it back to draft.`
            : review
              ? missingApprover
                ? "Choose an approver in the details panel, then approve. Approving does not publish yet."
                : "Read it through and fix what is needed, then approve. Approving does not publish yet."
              : "Publishing makes this version Knowledge: Operators, Ask and Wikis start using it."}
        </p>
      </div>
      {!waitingFor && review && missingApprover && (
        <Button size="sm" variant="outline" onClick={onShowMeta}>
          Choose approver
        </Button>
      )}
    </div>
  )
}
