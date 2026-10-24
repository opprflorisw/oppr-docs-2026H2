import { useEffect, useMemo, useState } from "react"
import { createPortal } from "react-dom"
import { useMutation, useQuery } from "convex/react"
import { Link, useLocation, useRoute } from "wouter"
import { toast } from "sonner"
import {
  AlertOctagon,
  AlertTriangle,
  BookOpenText,
  Check,
  ChevronDown,
  Copy,
  Factory,
  FileText,
  GraduationCap,
  History,
  Loader2,
  MapPin,
  MoreHorizontal,
  Printer,
  RefreshCw,
  Share2,
  SlidersHorizontal,
  Smartphone,
  Sparkles,
  Trash2,
} from "lucide-react"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { TopBar } from "@/components/layout/TopBar"
import { PageHeader } from "@/components/layout/PageHeader"
import { WikiGuidedCreation } from "@/components/wiki/WikiGuidedCreation"
import { WikiAsk } from "@/components/wiki/WikiAsk"
import { AtAGlance, WikiSectionBlock, WikiToc } from "@/components/wiki/WikiReader"
import { WikiPrintLayout } from "@/components/wiki/WikiPrintLayout"
import { FORMAT_LABEL, sectionSlugs, type WikiView } from "@/components/wiki/wikiShared"
import { AskIdaSheet } from "@/components/ai/AskIdaSheet"
import type { AnyAskScope } from "@/components/ai/ScopeChip"
import { AssetQrSvg } from "@/components/docs/AssetQrSvg"
import {
  EMPTY_TRAINING_DRAFT,
  TrainingGuidedCreation,
} from "@/components/learn/training/TrainingGuidedCreation"
import { useCheckIn } from "@/lib/checkIn"
import { formatAgo, formatDate, formatDateTime } from "@/lib/time"
import { cn } from "@/lib/utils"

export function WikiPage() {
  const [, params] = useRoute<{ id: string }>("/wiki/:id")
  const id = params?.id as Id<"wikis"> | undefined
  const wiki = useQuery(api.wikis.get, id ? { id } : "skip")
  const recordView = useMutation(api.wikis.recordView)

  // Count one opening per Wiki per browser session (Wiki home: Most used).
  useEffect(() => {
    if (!id) return
    const key = `oppr.wikiViewed.${id}`
    try {
      if (window.sessionStorage.getItem(key)) return
      window.sessionStorage.setItem(key, "1")
    } catch {
      // Storage blocked: count it anyway.
    }
    void recordView({ id }).catch(() => {})
  }, [id, recordView])

  if (wiki === undefined) {
    return (
      <div className="flex flex-col">
        <TopBar breadcrumb={[{ label: "Wiki", href: "/wiki" }, { label: "Loading" }]} />
        <div className="mx-auto w-full max-w-6xl space-y-4 p-6" aria-busy>
          <Skeleton className="h-6 w-1/3" />
          <Skeleton className="h-24 w-full max-w-[70ch]" />
          <Skeleton className="h-4 w-2/3 max-w-[70ch]" />
          <Skeleton className="h-4 w-1/2 max-w-[70ch]" />
        </div>
      </div>
    )
  }
  if (wiki === null) {
    return (
      <div className="flex flex-col">
        <TopBar breadcrumb={[{ label: "Wiki", href: "/wiki" }, { label: "Not found" }]} />
        <div className="space-y-2 p-6">
          <h1 className="text-lg font-semibold">This Wiki no longer exists</h1>
          <p className="text-sm text-muted-foreground">It may have been deleted by an Engineer.</p>
          <Link href="/wiki" className="text-sm font-medium text-primary-strong hover:underline">
            Go to the Wiki home
          </Link>
        </div>
      </div>
    )
  }
  return <WikiReaderPage wiki={wiki} />
}

function WikiReaderPage({ wiki }: { wiki: WikiView }) {
  const regenerate = useMutation(api.wikis.regenerate)
  const remove = useMutation(api.wikis.remove)
  const setStartHere = useMutation(api.wikis.setStartHere)
  const { person } = useCheckIn()
  const isEngineer = person?.kind === "engineer"
  const [, navigate] = useLocation()
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [makeTraining, setMakeTraining] = useState(false)
  const [askScope, setAskScope] = useState<AnyAskScope | null>(null)
  const [printMode, setPrintMode] = useState<"full" | "one-pager">("full")

  const building = wiki.status === "generating"
  const content = wiki.content
  const sections = useMemo(() => content?.sections ?? [], [content])
  const slugs = useMemo(() => sectionSlugs(sections), [sections])
  const pointCount = sections.reduce((n, s) => n + s.points.length, 0)

  // Jump to the #section of a shared link once the content is there.
  useEffect(() => {
    const hash = decodeURIComponent(window.location.hash.slice(1))
    if (hash) document.getElementById(hash)?.scrollIntoView({ block: "start" })
  }, [slugs])

  async function rebuild() {
    try {
      await regenerate({ id: wiki._id, personId: person?._id })
      toast.success("Rebuilding. The current version stays visible until it is done.")
    } catch (err) {
      toast.error(err instanceof Error ? err.message.replace(/^.*ConvexError: /, "") : String(err))
    }
  }

  async function onDelete() {
    try {
      await remove({ id: wiki._id, personId: person?._id })
      toast.success("Wiki deleted")
      navigate("/wiki")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    }
  }

  async function toggleStartHere() {
    try {
      await setStartHere({ id: wiki._id, on: wiki.startHere == null, personId: person?._id })
      toast.success(wiki.startHere == null ? "Added to Start here on the Wiki home" : "Taken off Start here")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    }
  }

  function print(mode: "full" | "one-pager") {
    setPrintMode(mode)
    // Let the print layout re-render in the chosen mode first.
    window.setTimeout(() => window.print(), 50)
  }

  const allCurrent = wiki.outdated.length === 0
  const builtLine = wiki.generatedAt ? `built ${formatAgo(wiki.generatedAt)}` : "not built yet"

  return (
    <div className="flex flex-col">
      <TopBar breadcrumb={[{ label: "Wiki", href: "/wiki" }, { label: wiki.title }]} />
      <PageHeader
        icon={BookOpenText}
        title={wiki.title}
        subtitle={wiki.purpose || "No purpose given"}
        actions={
          <>
            <ShareButton wikiId={wiki._id} title={wiki.title} />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" className="gap-1.5" disabled={!content}>
                  <Printer className="h-3.5 w-3.5" />
                  Print
                  <ChevronDown className="h-3 w-3 opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => print("full")}>Print the whole Wiki</DropdownMenuItem>
                <DropdownMenuItem onClick={() => print("one-pager")}>
                  Print a one-pager (At a glance and safety)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {isEngineer ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="More actions">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64">
                  <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                    As {person?.name}, Engineer
                  </DropdownMenuLabel>
                  <DropdownMenuItem onClick={() => setEditing(true)}>
                    <SlidersHorizontal className="mr-2 h-3.5 w-3.5" /> Edit scope
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => void rebuild()} disabled={building}>
                    <RefreshCw className="mr-2 h-3.5 w-3.5" /> Rebuild now
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => void toggleStartHere()}>
                    <MapPin className="mr-2 h-3.5 w-3.5" />
                    {wiki.startHere == null ? "Add to Start here" : "Take off Start here"}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setMakeTraining(true)} disabled={wiki.sources.length === 0}>
                    <GraduationCap className="mr-2 h-3.5 w-3.5" /> Make a Training from these sources
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setConfirmDelete(true)} className="text-destructive">
                    <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete Wiki
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <span className="max-w-[16rem] text-xs leading-tight text-muted-foreground">
                Check in as an Engineer to change this Wiki
              </span>
            )}
          </>
        }
      />

      <div className="mx-auto grid w-full max-w-6xl gap-10 px-6 py-6 lg:grid-cols-[minmax(0,1fr)_260px]">
        <article className="min-w-0 space-y-6">
          {/* Meta: format, size, what it covers. */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-muted-foreground">
            <span className="rounded-full border bg-background px-2 py-0.5 font-medium text-foreground">
              {FORMAT_LABEL[wiki.format]}
            </span>
            {content && (
              <span>
                {sections.length} {sections.length === 1 ? "section" : "sections"} · {pointCount}{" "}
                {pointCount === 1 ? "fact" : "facts"} · {wiki.sources.length}{" "}
                {wiki.sources.length === 1 ? "document" : "documents"} · {builtLine}
              </span>
            )}
            {wiki.areas.slice(0, 3).map((a) => (
              <span key={a.code} className="inline-flex items-center gap-1">
                <MapPin className="h-3 w-3" aria-hidden />
                {a.label}
              </span>
            ))}
            {wiki.assets.slice(0, 4).map((a) => (
              <Link
                key={a._id}
                href={`/assets/${a._id}`}
                className="inline-flex items-center gap-1 font-mono [@media(hover:hover)]:hover:text-primary-strong"
                title={a.name}
              >
                <Factory className="h-3 w-3" aria-hidden />
                {a.code}
              </Link>
            ))}
          </div>

          {building && (
            <StatusBar tone="info">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {content
                ? `Rebuilding${wiki.lastTrigger ? ` after: ${wiki.lastTrigger}` : ""}. The version below stays visible until it is done.`
                : "Building this Wiki from published documents. This usually takes under a minute; you can leave this page."}
            </StatusBar>
          )}
          {!allCurrent && (
            <StatusBar tone="warn">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              <span>
                {wiki.outdated.join(", ")} {wiki.outdated.length === 1 ? "has" : "have"} changed since this was built.
                {wiki.hiddenPoints > 0 &&
                  ` ${wiki.hiddenPoints} ${wiki.hiddenPoints === 1 ? "fact that relies on it is" : "facts that rely on them are"} hidden until the rebuild is done.`}
              </span>
              {!building && isEngineer && (
                <Button size="sm" variant="outline" className="ml-auto h-7 shrink-0 text-xs" onClick={() => void rebuild()}>
                  Rebuild now
                </Button>
              )}
            </StatusBar>
          )}
          {wiki.error && (
            <StatusBar tone="error">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              <span>{content ? `The last rebuild failed, showing the previous version. ${wiki.error}` : wiki.error}</span>
              {isEngineer && (
                <Button size="sm" variant="outline" className="ml-auto h-7 shrink-0 text-xs" onClick={() => void rebuild()}>
                  Try again
                </Button>
              )}
            </StatusBar>
          )}

          <TrustStrip wiki={wiki} onHistory={() => setHistoryOpen(true)} />

          {content && (
            <WikiAsk
              wikiId={wiki._id}
              wikiTitle={wiki.title}
              headings={sections.map((s) => s.heading)}
              onScopeChange={setAskScope}
              className="max-w-[70ch]"
            />
          )}

          {wiki.status === "empty" && (
            <Card className="max-w-[70ch]">
              <CardContent className="space-y-2 py-10 text-center">
                <p className="text-sm font-medium">Nothing published in this scope</p>
                <p className="mx-auto max-w-md text-sm text-muted-foreground">
                  A Wiki only uses published documents, and none match this scope yet. Widen the scope,
                  or publish the documents it should cover.
                </p>
                {isEngineer ? (
                  <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                    Edit scope
                  </Button>
                ) : (
                  <p className="text-xs text-muted-foreground">Check in as an Engineer to change the scope.</p>
                )}
              </CardContent>
            </Card>
          )}

          {building && !content && (
            <div className="max-w-[70ch] space-y-3 rounded-lg border bg-background p-6" aria-hidden>
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-5/6" />
              <Skeleton className="h-4 w-1/4" />
              <Skeleton className="h-3 w-full" />
            </div>
          )}

          {content && (
            <>
              <AtAGlance wiki={wiki} />
              <div className="space-y-10">
                {sections.map((s, i) => (
                  <WikiSectionBlock key={slugs[i]} wiki={wiki} section={s} index={i} slug={slugs[i]} />
                ))}
              </div>
            </>
          )}
        </article>

        <aside className="space-y-6 lg:sticky lg:top-32 lg:max-h-[calc(100vh-9rem)] lg:self-start lg:overflow-y-auto">
          <WikiToc sections={sections} slugs={slugs} />
          <BuiltFrom wiki={wiki} />
          <ScopeCard wiki={wiki} />
        </aside>
      </div>

      <HistorySheet wiki={wiki} open={historyOpen} onOpenChange={setHistoryOpen} />

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{wiki.title}"?</AlertDialogTitle>
            <AlertDialogDescription>
              The Wiki is removed for everyone. Its source documents are not changed. You can create a
              new Wiki with the same scope later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void onDelete()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete Wiki
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {isEngineer && (
        <WikiGuidedCreation
          open={editing}
          onOpenChange={setEditing}
          wikiId={wiki._id}
          initial={{ title: wiki.title, purpose: wiki.purpose, format: wiki.format, scope: wiki.scope }}
        />
      )}
      {isEngineer && makeTraining && (
        <TrainingGuidedCreation
          open={makeTraining}
          onOpenChange={setMakeTraining}
          initial={{
            ...EMPTY_TRAINING_DRAFT,
            title: wiki.title,
            purpose: wiki.purpose,
            documentIds: wiki.sources.map((s) => s.documentId),
          }}
        />
      )}
      {askScope && (
        <AskIdaSheet
          scope={askScope}
          trigger={null}
          open
          onOpenChange={(o) => {
            if (!o) setAskScope(null)
          }}
        />
      )}

      {content && createPortal(<WikiPrintLayout wiki={wiki} slugs={slugs} mode={printMode} />, document.body)}
    </div>
  )
}

function StatusBar({ tone, children }: { tone: "info" | "warn" | "error"; children: React.ReactNode }) {
  const styles = {
    info: "border-primary/30 bg-primary/5 text-primary-strong",
    warn: "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100",
    error: "border-destructive/40 bg-destructive/5 text-destructive",
  }[tone]
  return (
    <div className={`flex max-w-[70ch] items-center gap-2 rounded-md border px-3 py-2 text-sm ${styles}`} data-print="hide">
      {children}
    </div>
  )
}

/**
 * Trust layer: open contradictions, overdue reviews, facts left out, and
 * what the last rebuild changed.
 */
function TrustStrip({ wiki, onHistory }: { wiki: WikiView; onHistory: () => void }) {
  const h = wiki.health
  const parts: { text: string; tone: "red" | "amber" | "muted"; href?: string }[] = []
  if (h.openFindings > 0)
    parts.push({
      text: `${h.openFindings} open ${h.openFindings === 1 ? "contradiction" : "contradictions"}`,
      tone: "red",
      href: "/library/findings",
    })
  if (h.reviewsOverdue > 0)
    parts.push({ text: `${h.reviewsOverdue} ${h.reviewsOverdue === 1 ? "review" : "reviews"} overdue`, tone: "amber" })
  if (h.leftOut > 0)
    parts.push({
      text: `${h.leftOut} ${h.leftOut === 1 ? "fact" : "facts"} left out because ${h.leftOut === 1 ? "it" : "they"} could not be traced to a source`,
      tone: "muted",
    })
  const d = wiki.diff
  const recent = d && Date.now() - d.builtAt < 14 * 24 * 3600 * 1000 && (d.added.length > 0 || d.removed.length > 0)
  if (parts.length === 0 && !recent && wiki.builds.length < 2) return null
  return (
    <div className="max-w-[70ch] space-y-2" data-print="hide">
      {h.pointsWithFinding > 0 && (
        <p className="flex items-center gap-2 text-sm font-medium text-red-800 dark:text-red-200">
          <AlertOctagon className="h-4 w-4 shrink-0" aria-hidden />
          {h.pointsWithFinding} {h.pointsWithFinding === 1 ? "fact rests" : "facts rest"} on an open contradiction
          between the sources. Check with the document owner before acting on {h.pointsWithFinding === 1 ? "it" : "them"}.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        {parts.length > 0 && (
          <span>
            Sources:{" "}
            {parts.map((p, i) => (
              <span key={i}>
                {i > 0 && " · "}
                {p.href ? (
                  <Link href={p.href} className="font-medium text-red-700 underline-offset-2 hover:underline dark:text-red-300">
                    {p.text}
                  </Link>
                ) : (
                  <span className={cn(p.tone === "amber" && "font-medium text-amber-700 dark:text-amber-300")}>{p.text}</span>
                )}
              </span>
            ))}
          </span>
        )}
        {recent && d && (
          <span>
            Changed on {formatDate(d.builtAt)}
            {d.changedSources.length > 0 ? ` after ${d.changedSources.join(", ")}` : d.trigger ? ` (${d.trigger})` : ""}:{" "}
            <span className="font-medium text-foreground">
              {d.added.length} new, {d.removed.length} removed
            </span>
          </span>
        )}
        {wiki.builds.length > 0 && (
          <button type="button" onClick={onHistory} className="ml-auto inline-flex items-center gap-1 font-medium text-primary-strong hover:underline">
            <History className="h-3.5 w-3.5" aria-hidden /> History
          </button>
        )}
      </div>
    </div>
  )
}

/** "Built from 11 documents · all current · built 4 min ago", opens to the list. */
function BuiltFrom({ wiki }: { wiki: WikiView }) {
  const [open, setOpen] = useState(false)
  const allCurrent = wiki.outdated.length === 0
  const n = wiki.sources.length
  if (n === 0) return null
  return (
    <div className="space-y-2 text-xs">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-start gap-2 text-left">
        <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
        <span className="min-w-0 flex-1 leading-5 text-muted-foreground">
          Built from {n} {n === 1 ? "document" : "documents"} ·{" "}
          <span className={cn(allCurrent ? "text-emerald-700 dark:text-emerald-300" : "font-medium text-amber-700 dark:text-amber-300")}>
            {allCurrent ? "all current" : `${wiki.outdated.length} changed`}
          </span>
          {wiki.generatedAt ? ` · built ${formatAgo(wiki.generatedAt)}` : ""}
        </span>
        <ChevronDown className={cn("mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {open && (
        <ul className="space-y-2 border-l pl-3">
          {wiki.sources.map((s) => (
            <li key={s.documentId}>
              <Link href={`/docs/${s.documentId}?wiki=${wiki._id}`} className="block [@media(hover:hover)]:hover:text-primary-strong">
                <span className="block font-mono text-muted-foreground">
                  {s.namingCode} v{s.version}
                  {s.publishedAt ? ` · ${formatDate(s.publishedAt)}` : ""}
                </span>
                <span className="block truncate">{s.title}</span>
                {s.excerptsUsed !== undefined && s.excerptsTotal !== undefined && s.excerptsUsed < s.excerptsTotal && (
                  <span className="block text-muted-foreground">
                    {s.excerptsUsed === 0
                      ? "Not read: the scope has more documents than one Wiki can read"
                      : `Most relevant passages: ${s.excerptsUsed} of ${s.excerptsTotal}`}
                  </span>
                )}
                {s.outdated && (
                  <span className="block font-medium text-amber-700 dark:text-amber-300">
                    {s.outdated.reason === "newer_version"
                      ? `Outdated: v${s.outdated.liveVersion} is now published`
                      : s.outdated.reason === "archived"
                        ? "Outdated: archived"
                        : s.outdated.reason === "deleted"
                          ? "Outdated: deleted"
                          : s.outdated.reason === "out_of_scope"
                            ? "No longer in scope"
                            : "Outdated: no longer published"}
                  </span>
                )}
              </Link>
            </li>
          ))}
          {wiki.generatedAt && <li className="text-muted-foreground">Built {formatDateTime(wiki.generatedAt)}</li>}
        </ul>
      )}
    </div>
  )
}

function ScopeCard({ wiki }: { wiki: WikiView }) {
  const lines: [string, string[]][] = [
    ["Areas", wiki.scopeLabels.areas],
    ["Disciplines", wiki.scopeLabels.disciplines],
    ["Assets", wiki.scopeLabels.assets],
    ["Documents", wiki.scopeLabels.documents],
    ["Taken out", wiki.scopeLabels.removed],
  ]
  return (
    <details className="group text-xs">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-muted-foreground">
        <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden />
        <span className="flex-1">Scope and rebuilds</span>
        <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="mt-2 space-y-1.5 border-l pl-3 leading-5">
        {lines
          .filter(([, items]) => items.length > 0)
          .map(([label, items]) => (
            <p key={label}>
              <span className="text-muted-foreground">{label}: </span>
              {items.join(", ")}
            </p>
          ))}
        <p className="text-muted-foreground">
          Rebuilt automatically when a document in scope is published, archived or deleted, and every night.
        </p>
      </div>
    </details>
  )
}

function HistorySheet({ wiki, open, onOpenChange }: { wiki: WikiView; open: boolean; onOpenChange: (o: boolean) => void }) {
  const d = wiki.diff
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>History of this Wiki</SheetTitle>
          <SheetDescription>The last {wiki.builds.length} builds. A Wiki is rebuilt when its sources change.</SheetDescription>
        </SheetHeader>
        {d && (d.added.length > 0 || d.removed.length > 0) && (
          <div className="mt-5 space-y-3">
            <p className="text-sm font-semibold">What the last build changed</p>
            {d.added.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-emerald-700 dark:text-emerald-300">{d.added.length} new</p>
                <ul className="space-y-1.5 text-sm">
                  {d.added.slice(0, 12).map((p, i) => (
                    <li key={i} className="rounded-md border-l-2 border-emerald-500 bg-emerald-50/60 px-2 py-1 dark:bg-emerald-500/10">
                      <span className="block text-xs text-muted-foreground">{p.heading}</span>
                      {p.text}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {d.removed.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-red-700 dark:text-red-300">{d.removed.length} removed</p>
                <ul className="space-y-1.5 text-sm">
                  {d.removed.slice(0, 12).map((p, i) => (
                    <li key={i} className="rounded-md border-l-2 border-red-400 bg-red-50/60 px-2 py-1 text-muted-foreground line-through decoration-red-400/60 dark:bg-red-500/10">
                      <span className="block text-xs no-underline">{p.heading}</span>
                      {p.text}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
        <ol className="mt-6 space-y-3 border-l pl-4">
          {wiki.builds.map((b, i) => (
            <li key={b._id} className="relative text-sm">
              <span className={cn("absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-background", i === 0 ? "bg-primary-strong" : "bg-muted-foreground/40")} />
              <p className="font-medium">
                {formatDateTime(b.builtAt)}
                {i === 0 && <span className="ml-2 text-xs font-normal text-muted-foreground">Current</span>}
              </p>
              <p className="text-xs text-muted-foreground">
                {b.trigger ? `${b.trigger.charAt(0).toUpperCase()}${b.trigger.slice(1)} · ` : ""}
                {b.points} facts from {b.sources.length} {b.sources.length === 1 ? "document" : "documents"}
              </p>
              <p className="mt-0.5 font-mono text-xs text-muted-foreground">{b.sources.join(", ")}</p>
            </li>
          ))}
        </ol>
      </SheetContent>
    </Sheet>
  )
}

function ShareButton({ wikiId, title }: { wikiId: string; title: string }) {
  const [copied, setCopied] = useState(false)
  const link = `${window.location.origin}/wiki/${wikiId}`
  const phoneLink = `${window.location.origin}/m/wiki/${wikiId}`
  async function copy() {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      toast.error("Copying is blocked in this browser. Select the link and copy it.")
    }
  }
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1.5">
          <Share2 className="h-3.5 w-3.5" />
          Share
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 space-y-3">
        <p className="text-sm font-semibold">Share "{title}"</p>
        <div className="flex items-center gap-2">
          <input readOnly value={link} onFocus={(e) => e.currentTarget.select()} className="h-8 min-w-0 flex-1 rounded-md border bg-muted/40 px-2 font-mono text-xs" aria-label="Link to this Wiki" />
          <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => void copy()}>
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
        <div className="flex items-center gap-3 rounded-md border p-3">
          <AssetQrSvg value={phoneLink} size={88} />
          <div className="space-y-1 text-xs text-muted-foreground">
            <p className="flex items-center gap-1 font-medium text-foreground">
              <Smartphone className="h-3.5 w-3.5" /> On the phone
            </p>
            <p>Scan to open this Wiki in the floor app, for example from a printed copy at the machine.</p>
          </div>
        </div>
        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <Sparkles className="mt-0.5 h-3 w-3 shrink-0" />
          Everyone with access to Oppr Knowledge can read it. It always shows the latest build.
        </p>
      </PopoverContent>
    </Popover>
  )
}
