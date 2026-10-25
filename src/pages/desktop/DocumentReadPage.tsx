import { useEffect, useMemo, useRef, useState } from "react"
import { useLocation, useRoute, useSearch } from "wouter"
import {
  AlertTriangle,
  Archive,
  ArrowLeft,
  ArrowRight,
  BookOpenText,
  Camera,
  Edit,
  FileDown,
  GitBranch,
  History,
  Lock,
  Pencil,
  Printer,
} from "lucide-react"
import { Link } from "wouter"
import { useElementWidth } from "@/components/layout/useElementWidth"
import { cn } from "@/lib/utils"
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
import type { FunctionReturnType } from "convex/server"
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
import { useCheckIn } from "@/lib/checkIn"
import { STATUS_LABELS } from "@/components/docs/StatusBadge"
import { SubmitForReviewDialog } from "@/components/docs/LifecycleDialogs"
import { WithdrawDocumentDialog } from "@/components/docs/DocumentActions"
import { formatDate } from "@/lib/time"
import { isEngineerOrAdmin } from "@/lib/roles"

export function DocumentReadPage() {
  const [, params] = useRoute<{ id: string }>("/docs/:id")
  const id = params?.id
  const search = useSearch()
  const [, navigate] = useLocation()
  const [historyOpen, setHistoryOpen] = useState(false)
  const [pdfOpen, setPdfOpen] = useState(false)
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
  // Viewing a version is part of the address (?v=1), so it can be shared and
  // Back returns to the version in use.
  function viewVersion(v: number | null) {
    const p = new URLSearchParams(search)
    p.delete("hl")
    if (v == null) p.delete("v")
    else p.set("v", String(v))
    const q = p.toString()
    setOverrideVersion(v)
    navigate(`/docs/${id}${q ? `?${q}` : ""}`)
  }
  const [forkOpen, setForkOpen] = useState(false)
  const [forking, setForking] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)
  // The side rail shows when the page has the room (the Ask panel takes some).
  const frameRef = useRef<HTMLDivElement>(null)
  const withRail = useElementWidth(frameRef) >= 880
  const createNewVersion = useMutation(api.documents.createNewVersion)
  const [submitOpen, setSubmitOpen] = useState(false)
  const [withdrawOpen, setWithdrawOpen] = useState(false)
  // Authoring is an Engineer's job (CONTEXT.md): only a checked-in Engineer
  // sees New version, Edit and the editor entries.
  const { person } = useCheckIn()
  const canRevise = isEngineerOrAdmin(person)

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
  // A Draft made from Captures: the Captures (and their authors) it came from.
  const captureSources = useQuery(
    api.captures.captures.sourcesForDocument,
    rawDoc?.origin === "capture"
      ? { documentId: rawDoc._id, ...(person ? { personId: person._id } : {}) }
      : "skip",
  )
  const captureAuthors = [...new Set((captureSources?.captures ?? []).map((c) => c.authorName))]
  const heroAuthorLabel =
    rawDoc?.origin === "capture" && !docResult?.roles?.author
      ? captureAuthors.length > 0
        ? `Made from Captures by ${joinNames(captureAuthors)}`
        : "Made from Captures"
      : undefined
  const liveVer = rawDoc?.liveVersion ?? null
  const workingVer = rawDoc?.currentVersion ?? 1
  const workingStatus = rawDoc?.status
  // A published edition is live; editing it forks the next draft. A working
  // draft exists when the latest edition is ahead of the live one.
  const isPublished = workingStatus === "published"
  const hasWorkingDraft = liveVer != null && workingVer > liveVer

  function goEdit() {
    if (rawDoc && canRevise) navigate(`/docs/${rawDoc._id}/edit`)
  }
  function handleEdit() {
    if (!rawDoc) return
    if (!canRevise) {
      toast.info("Check in as an Engineer to revise")
      return
    }
    // Published editions are read-only — confirm forking a new version first.
    if (isPublished) setForkOpen(true)
    else goEdit()
  }
  async function confirmFork() {
    if (!rawDoc) return
    setForking(true)
    try {
      const res = await createNewVersion({ id: rawDoc._id, ...(person ? { personId: person._id } : {}) })
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
      <div className="flex flex-col">
        <TopBar breadcrumb={[{ label: "Documents", href: "/library" }]} />
        <div className="space-y-4 p-6">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
      </div>
    )
  }

  if (!docWithAssets) {
    return (
      <div className="flex flex-col">
        <TopBar breadcrumb={[{ label: "Documents", href: "/library" }]} />
        <PageHeader title="Document not found" />
        <div className="space-y-3 p-6">
          <p className="text-sm text-muted-foreground">There is no document with this link. It may have been deleted.</p>
          <Button variant="outline" size="sm" onClick={() => navigate("/library")}>
            <ArrowLeft />
            Back to Documents
          </Button>
        </div>
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
  // A version that was Published once and is no longer the one in use is
  // Superseded: it keeps its own effective range, from its publication to the
  // publication of the next version (or the withdrawal).
  const archived = workingStatus === "archived"
  const renderedPublishedOnce = liveVer != null && renderedVersionNumber <= liveVer
  const isSuperseded =
    renderedPublishedOnce && (renderedVersionNumber < liveVer! || (archived && overrideVersion != null))
  const published = (versionList ?? []).filter((v) => liveVer != null && v.version <= liveVer)
  const renderedRow = published.find((v) => v.version === renderedVersionNumber)
  const nextRow = published
    .filter((v) => v.version > renderedVersionNumber)
    .sort((a, b) => a.version - b.version)[0]
  const superseded = isSuperseded
    ? {
        by: nextRow?.version ?? null,
        from: renderedRow?.publishedAt ?? null,
        to: nextRow?.publishedAt ?? docResult?.withdrawal?.at ?? null,
      }
    : null
  // Print and PDF of a version that is not in use are for Engineers only:
  // an Operator must never carry a draft or an old version to the floor.
  const inUse = !archived && liveVer != null && renderedVersionNumber === liveVer
  const canExport = inUse || canRevise
  const statusLine = superseded
    ? `v${renderedVersionNumber} · superseded${superseded.by != null ? ` by v${superseded.by}` : ""}`
    : archived
      ? `v${renderedVersionNumber} · withdrawn`
      : viewingDraft
        ? `v${renderedVersionNumber} · draft in progress`
        : hasWorkingDraft
          ? `v${renderedVersionNumber} · Published, in use`
          : `v${renderedVersionNumber} · ${statusLabel(docWithAssets.status).toLowerCase()}`
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
          documentTitle={docWithAssets.naming_code}
          statusLine={statusLine}
          secondary={[
            { label: "History", icon: History, onClick: () => setHistoryOpen(true), tour: "documents-history-button" },
            // A Wrapped manual has its own controlled-copy download.
            ...(!isWrapped && canExport
              ? [
                  { label: "PDF", icon: FileDown, onClick: () => setPdfOpen(true), tour: "documents-pdf-button" },
                  { label: "Print", icon: Printer, onClick: () => window.print() },
                ]
              : []),
          ]}
          menu={
            canRevise && !archived
              ? [{ label: "Withdraw", icon: Archive, destructive: true, onClick: () => setWithdrawOpen(true) }]
              : []
          }
          primary={
            archived ? undefined : canRevise ? (
              <Button
                size="sm"
                // Arriving for a periodic review, the review card is the decision.
                variant={new URLSearchParams(search).get("panel") === "review" ? "outline" : "default"}
                onClick={handleEdit}
                data-tour="documents-revise-button"
              >
                <Edit />
                {isPublished ? "New version" : "Edit"}
              </Button>
            ) : (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Lock className="h-3.5 w-3.5" />
                Check in as an Engineer to revise
              </span>
            )
          }
        />
        {!isWrapped && (
          <PublishToPdfDialog
            documentId={docWithAssets.id}
            version={renderedVersionNumber}
            open={pdfOpen}
            onOpenChange={setPdfOpen}
          />
        )}
      </div>

      <div
        ref={frameRef}
        className={cn(
          "mx-auto grid w-full max-w-7xl flex-1 gap-6 p-6 print:block print:max-w-none print:p-0",
          withRail && "grid-cols-[minmax(0,1fr)_240px]",
        )}
      >
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
                    onClick={() => viewVersion(workingVer)}
                  >
                    <GitBranch className="mr-1 h-3.5 w-3.5" />
                    View v{workingVer} draft
                  </Button>
                  {canRevise && (
                    <Button size="sm" variant="outline" onClick={goEdit}>
                      Open in editor
                    </Button>
                  )}
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
                    onClick={() => viewVersion(null)}
                  >
                    View live v{liveVer}
                  </Button>
                  {canRevise && (
                    <Button size="sm" variant="outline" onClick={goEdit}>
                      Open in editor
                    </Button>
                  )}
                </span>
              </AlertDescription>
            </Alert>
          )}
          {isViewingHistorical && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="flex items-center justify-between gap-3">
                <span>
                  {superseded
                    ? `You are viewing v${renderedVersionNumber}, a superseded version kept for the record. Do not work from it.${archived ? " This document is withdrawn." : ` The version in use is v${liveVer}.`}`
                    : `You are viewing v${renderedVersionNumber}, which is not the version in use.`}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  className="print:hidden"
                  onClick={() => viewVersion(null)}
                >
                  {archived ? "Back to the latest version" : `Back to v${servingVer}`}
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
                    ? "This document is withdrawn. It is no longer valid and is not shown to Operators, Ask or Wikis."
                    : "This document is not Published yet. It does not count as Knowledge: Operators, Ask and Wikis cannot see it."}
                </p>
                {workingStatus === "archived" && docResult?.withdrawal && (
                  <p className="text-sm">
                    {docResult.withdrawal.reason ? <>Reason: {docResult.withdrawal.reason}. </> : null}
                    {docResult.withdrawal.by ? `Withdrawn by ${docResult.withdrawal.by}` : "Withdrawn"}
                    {docResult.withdrawal.at ? ` on ${formatDate(docResult.withdrawal.at)}` : ""}.
                    {docResult.withdrawal.replacedBy && (
                      <>
                        {" "}Use{" "}
                        <Link href={`/docs/${docResult.withdrawal.replacedBy._id}`} className="font-medium underline">
                          {docResult.withdrawal.replacedBy.namingCode}
                        </Link>{" "}
                        instead.
                      </>
                    )}
                  </p>
                )}
                {workingStatus !== "archived" && rawDoc && canRevise && (
                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-amber-300/60 pt-2 print:hidden">
                    <span className="flex items-center gap-1.5 font-medium">
                      <ArrowRight className="h-3.5 w-3.5" />
                      {nextStepText(workingStatus, docResult?.assigned.reviewer?.name ?? null, docResult?.assigned.approver?.name ?? null)}
                    </span>
                    <span className="flex shrink-0 gap-2">
                      {workingStatus === "draft" && (
                        <Button size="sm" onClick={() => setSubmitOpen(true)}>
                          Submit for review
                        </Button>
                      )}
                      <Button size="sm" variant={workingStatus === "draft" ? "outline" : "default"} onClick={goEdit}>
                        Open in editor
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
            authorLabel={heroAuthorLabel}
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
            superseded={superseded}
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
            <div ref={contentRef} className="rounded-md border bg-background p-6" data-tour="documents-read-body">
              <TiptapReadOnly content={readBody} />
            </div>
          )}
        </div>

        <aside className="space-y-5 print:hidden">
          {/* The cards only, without the long contents list (Instructions). */}
          <div className="space-y-5" data-tour="documents-read-side">
            {rawDoc && (
              <PeriodicReviewCard
                doc={rawDoc}
                highlight={new URLSearchParams(search).get("panel") === "review"}
                onStartRevision={handleEdit}
              />
            )}
            {rawDoc && rawDoc.origin === "capture" && captureSources !== undefined && (
              <MadeFromCapturesCard sources={captureSources} />
            )}
            {rawDoc && <DocumentTrainingsCard documentId={rawDoc._id} published={inUse} />}
            {rawDoc && <InWikisCard documentId={rawDoc._id} />}
            {rawDoc && <DocumentInsightsCard documentId={rawDoc._id} />}
          </div>
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
              {forking ? "Creating..." : `Create v${workingVer + 1} draft`}
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
        onSelect={(v) => viewVersion(v === servingVer && !archived ? null : v)}
        open={historyOpen}
        onOpenChange={setHistoryOpen}
      />
      {rawDoc && (
        <SubmitForReviewDialog
          open={submitOpen}
          onOpenChange={setSubmitOpen}
          documentId={rawDoc._id}
          namingCode={rawDoc.namingCode}
          isNewVersion={rawDoc.liveVersion != null}
          initialReviewer={rawDoc.reviewerPersonId ?? null}
          initialApprover={rawDoc.approverPersonId ?? null}
          initialNote={docResult?.assigned.changeNote ?? null}
          onSubmitted={() => toast.success(`${rawDoc.namingCode} is submitted for review`)}
        />
      )}
      <WithdrawDocumentDialog doc={docWithAssets} open={withdrawOpen} onOpenChange={setWithdrawOpen} />
    </div>
  )
}

function nextStepText(status: string | undefined, reviewer: string | null, approver: string | null): string {
  if (status === "draft") return "Next step: submit it for review and choose who reviews and approves it."
  if (status === "in_review")
    return reviewer ? `Next step: waiting for ${reviewer} to review and approve it.` : "Next step: the reviewer approves it in the editor."
  if (status === "approved")
    return approver ? `Next step: waiting for ${approver} to publish it.` : "Next step: the approver publishes it in the editor."
  return "Next step: finish the draft in the editor."
}

/** Rail card: the Wikis built on this document. */
function InWikisCard({ documentId }: { documentId: Id<"documents"> }) {
  const wikis = useQuery(api.documents.wikisForDocument, { id: documentId })
  if (wikis === undefined) return null
  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="flex items-center gap-2">
        <BookOpenText className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">In Wikis ({wikis.length})</h2>
      </div>
      {wikis.length === 0 ? (
        <p className="text-xs text-muted-foreground">No Wiki is built on this document yet.</p>
      ) : (
        <ul className="space-y-1">
          {wikis.map((w) => (
            <li key={w._id}>
              <Link href={`/wiki/${w._id}`} className="block truncate text-sm hover:text-primary">
                {w.title}
              </Link>
            </li>
          ))}
        </ul>
      )}
      {wikis.length > 0 && (
        <p className="text-xs text-muted-foreground">Publishing a new version rebuilds them.</p>
      )}
    </div>
  )
}

type CaptureSources = FunctionReturnType<typeof api.captures.captures.sourcesForDocument>

/** Rail card on a Draft made from Captures: where it came from. */
function MadeFromCapturesCard({ sources }: { sources: CaptureSources }) {
  const captures = sources?.captures ?? []
  const lockedCount = captures.filter((c) => !c.canOpen).length
  return (
    <div className="space-y-2 rounded-lg border p-3" data-testid="made-from-captures">
      <div className="flex items-center gap-2">
        <Camera className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">Made from Captures</h2>
      </div>
      {sources?.set && (
        <Link href={`/library/capture-sets/${sources.set._id}`} className="block text-sm font-medium hover:text-primary">
          Capture set: {sources.set.title}
        </Link>
      )}
      {captures.length > 0 ? (
        <ul className="space-y-1">
          {captures.map((c) => {
            const meta = [c.authorName, c.handedInAt != null ? formatDate(c.handedInAt) : null].filter(Boolean).join(", ")
            return (
              <li key={c._id}>
                {c.canOpen ? (
                  <Link href={`/library/captures/${c._id}`} className="block text-sm hover:text-primary">
                    <span className="block truncate">{c.title}</span>
                    <span className="block text-xs text-muted-foreground">{meta}</span>
                  </Link>
                ) : (
                  <div className="text-sm">
                    <span className="block truncate">{c.title}</span>
                    <span className="block text-xs text-muted-foreground">{meta}</span>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">The Captures it came from are no longer available.</p>
      )}
      {lockedCount > 0 && (
        <p className="text-xs text-muted-foreground">Check in as an Engineer to open the Captures.</p>
      )}
    </div>
  )
}

function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? ""
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`
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
