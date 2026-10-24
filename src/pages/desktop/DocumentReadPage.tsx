import { useEffect, useMemo, useRef, useState } from "react"
import { useLocation, useRoute, useSearch } from "wouter"
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Edit,
  FileDown,
  GitBranch,
  History,
  Lock,
  Pencil,
  Printer,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Alert, AlertDescription } from "@/components/ui/alert"
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
import { toast } from "sonner"
import { useMutation, useQuery } from "convex/react"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import { toLegacyAsset, toLegacyDoc } from "@/lib/convex-adapters"
import { PdfViewer } from "@/components/docs/PdfViewer"
import { TiptapReadOnly } from "@/components/docs/TiptapReadOnly"
import { VersionHistoryDrawer } from "@/components/docs/VersionHistoryDrawer"
import { DocumentHero, extractPpeItems } from "@/components/docs/DocumentHero"
import { DocumentToc } from "@/components/docs/DocumentToc"
import { PublishToPdfDialog } from "@/components/docs/PublishToPdfDialog"
import { TopBar } from "@/components/layout/TopBar"
import { PageHeader } from "@/components/layout/PageHeader"
import { PeriodicReviewCard } from "@/components/docs/PeriodicReviewCard"
import { DocumentFindingsBanner } from "@/components/findings/DocumentFindingsBanner"
import { ProposedRevisionBanner } from "@/components/insights/ProposedRevisionBanner"
import { DocumentInsightsCard } from "@/components/insights/DocumentInsightsCard"
import { DocumentTrainingsCard } from "@/components/learn/DocumentTrainingsCard"
import { WrappedManualView } from "@/components/manuals/WrappedManualView"
import { useRecordUsage } from "@/lib/usage"
import { STATUS_LABELS } from "@/components/docs/StatusBadge"

export function DocumentReadPage() {
  const [, params] = useRoute<{ id: string }>("/docs/:id")
  const id = params?.id
  const search = useSearch()
  const [, navigate] = useLocation()
  const [historyOpen, setHistoryOpen] = useState(false)
  const [overrideVersion, setOverrideVersion] = useState<number | null>(() => {
    const v = new URLSearchParams(
      typeof window !== "undefined" ? window.location.search : "",
    ).get("v")
    const n = v ? parseInt(v, 10) : NaN
    return Number.isFinite(n) && n > 0 ? n : null
  })
  // Keep the version in step with ?v= (links from banners within this page).
  useEffect(() => {
    const n = parseInt(new URLSearchParams(search).get("v") ?? "", 10)
    setOverrideVersion(Number.isFinite(n) && n > 0 ? n : null)
  }, [search])
  const [forkOpen, setForkOpen] = useState(false)
  const [forking, setForking] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)
  const createNewVersion = useMutation(api.documents.createNewVersion)
  const submitForReview = useMutation(api.documents.submitForReview)
  const [submitting, setSubmitting] = useState(false)

  const initialPage = useMemo(() => {
    const p = new URLSearchParams(search).get("page")
    if (!p) return 1
    const n = parseInt(p, 10)
    return Number.isFinite(n) && n > 0 ? n : 1
  }, [search])

  const docResult = useQuery(
    api.documents.getWithAssets,
    id ? { id: id as Id<"documents"> } : "skip",
  )
  const servingVersion = useQuery(
    api.documents.getServingVersion,
    id ? { documentId: id as Id<"documents"> } : "skip",
  )
  // The version override actually swaps the rendered body — viewing v2 of a
  // doc whose live edition is v1 fetches v2, and the PDF export follows suit.
  const overrideRow = useQuery(
    api.documents.getVersionByNumber,
    id && overrideVersion != null
      ? { documentId: id as Id<"documents">, version: overrideVersion }
      : "skip",
  )
  const currentVersion =
    overrideVersion != null ? (overrideRow ?? null) : servingVersion
  const pdfUrl = useQuery(
    api.files.getUrl,
    currentVersion?.pdfStorageId
      ? { storageId: currentVersion.pdfStorageId }
      : "skip",
  )
  // Every version with its sign-offs resolved to named Engineers: the hero
  // shows the sign-offs of the version on screen.
  const versionList = useQuery(
    api.documents.listVersions,
    id ? { documentId: id as Id<"documents"> } : "skip",
  )
  const ready = docResult !== undefined
  useRecordUsage({ kind: "view", documentId: id as Id<"documents"> | undefined })

  const docWithAssets = useMemo(() => {
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

  const owner = null

  // The title already heads the page and the hero: in read mode, drop the
  // body's opening H1 when it only repeats it.
  const readBody = useMemo(
    () => withoutTitleHeading(version?.body_json, docResult?.doc.title ?? ""),
    [version?.body_json, docResult?.doc.title],
  )

  const rawDoc = docResult?.doc
  const isWrapped = rawDoc?.origin === "wrapped"
  const liveVer = rawDoc?.liveVersion ?? null
  const workingVer = rawDoc?.currentVersion ?? 1
  const workingStatus = rawDoc?.status
  // A published edition is live; editing it forks the next draft. A working
  // draft exists when the latest edition is ahead of the live one.
  const isPublished = workingStatus === "published"
  const hasWorkingDraft = liveVer != null && workingVer > liveVer

  function goEdit() {
    if (rawDoc) navigate(`/docs/${rawDoc._id}/edit`)
  }
  function handleEdit() {
    if (!rawDoc) return
    // Published editions are read-only — confirm forking a new version first.
    if (isPublished) setForkOpen(true)
    else goEdit()
  }
  async function handleSubmitForReview() {
    if (!rawDoc) return
    setSubmitting(true)
    try {
      await submitForReview({ id: rawDoc._id })
      toast.success("Submitted for review")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't submit for review")
    } finally {
      setSubmitting(false)
    }
  }
  async function confirmFork() {
    if (!rawDoc) return
    setForking(true)
    try {
      const res = await createNewVersion({ id: rawDoc._id })
      toast.success(`Started v${res.version} draft`)
      setForkOpen(false)
      navigate(`/docs/${rawDoc._id}/edit`)
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Couldn't create a new version",
      )
    } finally {
      setForking(false)
    }
  }

  // ?hl=<passage start> (from a Wiki source) highlights and scrolls to the
  // cited passage once the body has rendered.
  const highlight = useMemo(() => new URLSearchParams(search).get("hl"), [search])
  // Arriving from a Wiki citation: the breadcrumb leads back to that Wiki.
  const wikiParam = new URLSearchParams(search).get("wiki")
  // Only a well-formed id reaches the query; a hand-edited URL falls back to Documents.
  const fromWikiId = wikiParam && /^[a-z0-9]{32}$/.test(wikiParam) ? (wikiParam as Id<"wikis">) : null
  const fromWiki = useQuery(api.wikis.get, fromWikiId ? { id: fromWikiId } : "skip")
  const bodyKey = currentVersion?._id ?? null
  useEffect(() => {
    if (!highlight || !bodyKey) return
    const needle = normaliseText(highlight).slice(0, 60)
    if (!needle) return
    let target: HTMLElement | null = null
    let observer: ResizeObserver | null = null
    let userScrolled = false
    const timers: number[] = []
    const centre = (behavior: ScrollBehavior) => {
      if (target && !userScrolled) target.scrollIntoView({ behavior, block: "center" })
    }
    // Images, PPE pictograms and the banners above the body keep moving the
    // passage while they load: re-centre on every layout change for about
    // two seconds, unless the reader starts scrolling themselves.
    const stopFollowing = () => {
      userScrolled = true
    }
    const find = () => {
      const root = contentRef.current
      if (!root) return false
      const blocks = root.querySelectorAll<HTMLElement>("p, li, td, th, h1, h2, h3, h4")
      const hit = Array.from(blocks).find((el) => normaliseText(el.textContent ?? "").includes(needle))
      if (!hit) return false
      target = hit.closest<HTMLElement>("li, tr") ?? hit
      target.classList.add("wiki-cited-passage")
      centre("smooth")
      observer = new ResizeObserver(() => centre("auto"))
      observer.observe(root)
      observer.observe(document.body)
      window.addEventListener("wheel", stopFollowing, { passive: true })
      window.addEventListener("touchmove", stopFollowing, { passive: true })
      window.addEventListener("keydown", stopFollowing)
      timers.push(window.setTimeout(() => observer?.disconnect(), 2000))
      return true
    }
    // The body renders lazily: try until it is there (up to ~3 s).
    let tries = 0
    const attempt = () => {
      if (find() || ++tries > 12) return
      timers.push(window.setTimeout(attempt, 250))
    }
    timers.push(window.setTimeout(attempt, 350))
    return () => {
      timers.forEach((t) => window.clearTimeout(t))
      observer?.disconnect()
      window.removeEventListener("wheel", stopFollowing)
      window.removeEventListener("touchmove", stopFollowing)
      window.removeEventListener("keydown", stopFollowing)
      target?.classList.remove("wiki-cited-passage")
    }
  }, [highlight, bodyKey])

  if (!ready) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  if (!docWithAssets) {
    return (
      <div className="space-y-3 p-6">
        <Button variant="ghost" size="sm" onClick={() => navigate("/library")} className="-ml-2">
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back to documents
        </Button>
        <h1 className="text-xl font-semibold">Document not found</h1>
        <p className="text-sm text-muted-foreground">
          We couldn't find a document with id <code>{id}</code>.
        </p>
      </div>
    )
  }

  const servingVer = liveVer ?? workingVer
  const viewingDraft = hasWorkingDraft && overrideVersion === workingVer
  const isViewingHistorical =
    overrideVersion != null && !viewingDraft && overrideVersion !== servingVer
  const renderedVersionNumber = version?.version ?? docWithAssets.current_version
  const ppeItems =
    version?.body_kind === "tiptap" ? extractPpeItems(version.body_json) : []
  const renderedSigners =
    versionList?.find((v) => v.version === renderedVersionNumber)?.signers
  // A role is awaited only on the working version that has not been published.
  const onWorkingVersion =
    renderedVersionNumber === workingVer && (liveVer == null || workingVer > liveVer)
  const statusLabel = (s: typeof workingStatus) => (s ? STATUS_LABELS[s] : "")

  return (
    <div className="flex h-full flex-col print:block">
      <div className="sticky top-0 z-30 print:hidden">
        <TopBar
          breadcrumb={[
            ...(fromWiki
              ? [
                  { label: "Wiki", href: "/wiki" },
                  { label: fromWiki.title, href: `/wiki/${fromWiki._id}` },
                ]
              : [{ label: "Documents", href: "/library" }]),
            { label: `${docWithAssets.naming_code} · ${docWithAssets.title}` },
          ]}
        />
        <PageHeader
          title={`${docWithAssets.naming_code} · ${docWithAssets.title}`}
          subtitle={
            viewingDraft
              ? `v${renderedVersionNumber} · draft in progress`
              : hasWorkingDraft
                ? `v${renderedVersionNumber} · published, in use`
                : `v${renderedVersionNumber} · ${statusLabel(docWithAssets.status).toLowerCase()}`
          }
          actions={
            <>
              {/* A Wrapped manual has its own controlled-copy download. */}
              {!isWrapped && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => window.print()}
                >
                  <Printer className="mr-1 h-3.5 w-3.5" />
                  Print
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={() => setHistoryOpen(true)}
              >
                <History className="mr-1 h-3.5 w-3.5" />
                History
              </Button>
              {!isWrapped && <PublishToPdfDialog
                documentId={docWithAssets.id}
                version={renderedVersionNumber}
                trigger={
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    title={`Export v${renderedVersionNumber}, the version you are viewing, as a PDF`}
                  >
                    <FileDown className="h-3.5 w-3.5" />
                    PDF
                  </Button>
                }
              />}
              <Button
                size="sm"
                // Arriving for a periodic review, the review card is the decision.
                variant={new URLSearchParams(search).get("panel") === "review" ? "outline" : "default"}
                onClick={handleEdit}
              >
                <Edit className="mr-1 h-3.5 w-3.5" />
                {isPublished ? "New version" : "Edit"}
              </Button>
            </>
          }
        />
      </div>

      <div className="mx-auto grid w-full max-w-7xl flex-1 gap-6 p-6 lg:grid-cols-[minmax(0,1fr)_240px] print:block print:max-w-none print:p-0">
        <div className="min-w-0 space-y-4">
          {hasWorkingDraft && !isViewingHistorical && !viewingDraft && (
            <Alert className="border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100 print:hidden">
              <GitBranch className="h-4 w-4" />
              <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
                <span>
                  You are viewing the live v{liveVer}. A newer edition (v
                  {workingVer}
                  {workingStatus ? ` · ${statusLabel(workingStatus)}` : ""}) is in progress
                  and will replace it once published.
                </span>
                <span className="flex shrink-0 gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setOverrideVersion(workingVer)}
                  >
                    <GitBranch className="mr-1 h-3.5 w-3.5" />
                    View v{workingVer} draft
                  </Button>
                  <Button size="sm" variant="outline" onClick={goEdit}>
                    Open in editor
                  </Button>
                </span>
              </AlertDescription>
            </Alert>
          )}
          {viewingDraft && (
            <Alert className="border-sky-300 bg-sky-50 text-sky-900 dark:border-sky-500/40 dark:bg-sky-500/10 dark:text-sky-100 print:hidden">
              <GitBranch className="h-4 w-4" />
              <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
                <span>
                  You are viewing the v{workingVer} draft
                  {workingStatus ? ` (${statusLabel(workingStatus).toLowerCase()})` : ""}. Operators still
                  see the live v{liveVer}. The PDF button exports this draft.
                </span>
                <span className="flex shrink-0 gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setOverrideVersion(null)}
                  >
                    View live v{liveVer}
                  </Button>
                  <Button size="sm" variant="outline" onClick={goEdit}>
                    Open in editor
                  </Button>
                </span>
              </AlertDescription>
            </Alert>
          )}
          {isViewingHistorical && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="flex items-center justify-between gap-3">
                <span>
                  {liveVer != null && renderedVersionNumber < liveVer
                    ? `You are viewing v${renderedVersionNumber}, a superseded version kept for the record. Do not work from it. The version in use is v${liveVer}.`
                    : `You are viewing v${renderedVersionNumber}, which is not the version in use.`}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  className="print:hidden"
                  onClick={() => setOverrideVersion(null)}
                >
                  Back to v{servingVer}
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {overrideVersion == null && (workingStatus === "archived" || liveVer == null) && (
            <Alert className="border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="space-y-2">
                <p>
                  {workingStatus === "archived"
                    ? "This document is archived. It is no longer valid and is not shown to Operators, Ask or Wikis."
                    : "This document is not published yet. It does not count as knowledge: Operators, Ask and Wikis cannot see it."}
                </p>
                {workingStatus !== "archived" && rawDoc && (
                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-amber-300/60 pt-2 print:hidden">
                    <span className="flex items-center gap-1.5 font-medium">
                      <ArrowRight className="h-3.5 w-3.5" />
                      {nextStepText(workingStatus, Boolean(rawDoc.reviewerId), Boolean(rawDoc.approverId))}
                    </span>
                    <span className="flex shrink-0 gap-2">
                      {workingStatus === "draft" && rawDoc.reviewerId && (
                        <Button size="sm" onClick={() => void handleSubmitForReview()} disabled={submitting}>
                          {submitting ? "Submitting…" : "Submit for review"}
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant={workingStatus === "draft" && rawDoc.reviewerId ? "outline" : "default"}
                        onClick={goEdit}
                      >
                        {workingStatus === "draft" && !rawDoc.reviewerId
                          ? "Assign reviewer"
                          : "Open in editor"}
                      </Button>
                    </span>
                  </div>
                )}
              </AlertDescription>
            </Alert>
          )}

          {rawDoc && <DocumentFindingsBanner documentId={rawDoc._id} />}
          {rawDoc && <ProposedRevisionBanner documentId={rawDoc._id} />}

          <DocumentHero
            doc={docWithAssets}
            assets={docWithAssets.assets}
            owner={owner}
            versionNumber={renderedVersionNumber}
            ppeItems={ppeItems}
            roles={docResult?.roles}
            signers={renderedSigners}
            assigned={{
              reviewer: onWorkingVersion && Boolean(rawDoc?.reviewerId),
              approver: onWorkingVersion && Boolean(rawDoc?.approverId),
            }}
            effectiveAt={docResult?.effectiveAt ?? null}
            createdAt={docResult?.createdAt}
            statusOverride={
              hasWorkingDraft && !isViewingHistorical ? "published" : undefined
            }
          />

          {version == null ? (
            <div className="rounded-md border border-dashed p-12 text-center text-sm text-muted-foreground">
              No published version yet.
            </div>
          ) : version.body_kind === "pdf" && rawDoc?.origin === "wrapped" ? (
            <WrappedManualView
              documentId={rawDoc._id}
              version={version.version}
              initialPage={initialPage}
            />
          ) : version.body_kind === "pdf" ? (
            <PdfViewer url={pdfUrl ?? null} pageNumber={initialPage} />
          ) : (
            <div ref={contentRef} className="rounded-md border bg-background p-6">
              <TiptapReadOnly content={readBody} />
            </div>
          )}
        </div>

        <aside className="space-y-5 print:hidden">
          {rawDoc && (
            <PeriodicReviewCard
              doc={rawDoc}
              highlight={new URLSearchParams(search).get("panel") === "review"}
              onStartRevision={handleEdit}
            />
          )}
          {rawDoc && <DocumentTrainingsCard documentId={rawDoc._id} />}
          {rawDoc && <DocumentInsightsCard documentId={rawDoc._id} />}
          {version?.body_kind === "tiptap" && (
            <div className="sticky top-28">
              <DocumentToc body={readBody} contentRef={contentRef} />
            </div>
          )}
        </aside>
      </div>

      <AlertDialog open={forkOpen} onOpenChange={setForkOpen}>
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <GitBranch className="h-4 w-4 text-primary" />
              Create version v{workingVer + 1}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This document is published. A new draft edition forks from the
              live v{liveVer ?? workingVer}; the live version stays online for
              operators until v{workingVer + 1} is reviewed, approved, and
              published.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1.5 rounded-md border border-sky-200 bg-sky-50/60 p-3 dark:border-sky-900/40 dark:bg-sky-950/20">
              <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-sky-700 dark:text-sky-300">
                <Pencil className="h-3 w-3" />
                Carried over, editable in v{workingVer + 1}
              </p>
              <ul className="list-disc space-y-0.5 pl-4 text-xs text-sky-900/90 dark:text-sky-100/90">
                {isWrapped ? (
                  <>
                    <li>The supplier PDF (replace it in the editor with Replace PDF)</li>
                    <li>Linked Assets</li>
                    <li>Title, supplier, reviewer and approver</li>
                  </>
                ) : (
                  <>
                    <li>Body content (copied from the live version)</li>
                    <li>Linked Assets, logs &amp; references (follow the body)</li>
                    <li>Title, reviewer and approver assignments</li>
                  </>
                )}
              </ul>
            </div>
            <div className="space-y-1.5 rounded-md border bg-muted/40 p-3">
              <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                <Lock className="h-3 w-3" />
                Fixed, never changes
              </p>
              <ul className="list-disc space-y-0.5 pl-4 text-xs text-muted-foreground">
                <li>
                  Naming code{" "}
                  <span className="font-mono">{docWithAssets.naming_code}</span>
                </li>
                <li>Type, location &amp; discipline (part of the code)</li>
                <li>
                  v{liveVer ?? workingVer} history and sign-offs: the live
                  version keeps serving operators, QR codes, Ask and Wikis
                </li>
              </ul>
            </div>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={forking}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                void confirmFork()
              }}
              disabled={forking}
            >
              {forking ? "Creating…" : `Create v${workingVer + 1} draft`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <VersionHistoryDrawer
        documentId={docWithAssets.id}
        currentVersion={docWithAssets.current_version}
        liveVersion={liveVer}
        archived={workingStatus === "archived"}
        workingStatus={workingStatus}
        selectedVersion={overrideVersion ?? servingVer}
        onSelect={(v) =>
          setOverrideVersion(v === servingVer ? null : v)
        }
        open={historyOpen}
        onOpenChange={setHistoryOpen}
      />
    </div>
  )
}

function nextStepText(
  status: string | undefined,
  hasReviewer: boolean,
  hasApprover: boolean,
): string {
  if (status === "draft")
    return hasReviewer
      ? "Next step: submit it for review."
      : "Next step: assign a reviewer in the editor, then submit it for review."
  if (status === "in_review")
    return hasApprover
      ? "Next step: the reviewer approves it in the editor."
      : "Next step: assign an approver in the editor, then the reviewer approves it."
  if (status === "approved") return "Next step: publish it in the editor."
  return "Next step: finish the draft in the editor."
}

type BodyNode = { type?: string; attrs?: Record<string, unknown>; content?: BodyNode[]; text?: string }

function textOf(n: BodyNode): string {
  return n.text ?? (n.content ?? []).map(textOf).join("")
}

/** The body without its first H1 when that heading repeats the title. */
function withoutTitleHeading(body: unknown, title: string): unknown {
  const root = body as BodyNode | null
  if (!root || root.type !== "doc" || !root.content?.length || !title) return body
  const first = root.content[0]
  if (first.type !== "heading" || Number(first.attrs?.level) !== 1) return body
  if (normaliseText(textOf(first)) !== normaliseText(title)) return body
  return { ...root, content: root.content.slice(1) }
}

function normaliseText(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase()
}
