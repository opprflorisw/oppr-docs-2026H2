import { useMemo, useRef, useState } from "react"
import { Link, useLocation, useParams } from "wouter"
import { useMutation, useQuery } from "convex/react"
import { toast } from "sonner"
import { AlertTriangle, Aperture, FileText, Layers, Loader2, MoreHorizontal, RotateCcw, Sparkles, Trash2 } from "lucide-react"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import { TopBar } from "@/components/layout/TopBar"
import { PageHeader } from "@/components/layout/PageHeader"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useCheckIn } from "@/lib/checkIn"
import { formatDateTime } from "@/lib/time"
import { EntryTimeline, type EntryView } from "@/components/captures/EntryTimeline"
import { MomentList, type MomentView } from "@/components/captures/MomentList"
import { MakeDraftDialog } from "@/components/captures/MakeDraftDialog"
import { ConfirmDelete, DeskNotice } from "@/components/captures/DeskBits"
import { Avatar, ENTRY_META, StatusPill, errorText, formatClock } from "@/components/captures/captureUi"

/** /library/captures/:id: the timeline of Entries beside the organized Moments. */
export function CaptureDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [, navigate] = useLocation()
  const { person, people } = useCheckIn()
  const data = useQuery(
    api.captures.captures.get,
    person ? { captureId: id as Id<"captures">, personId: person._id } : "skip",
  )
  const reprocess = useMutation(api.captures.captures.reprocess)
  const deleteMedia = useMutation(api.captures.captures.deleteEntryMedia)
  const discard = useMutation(api.captures.captures.discard)

  const [draftOpen, setDraftOpen] = useState(false)
  const [toDelete, setToDelete] = useState<EntryView | null>(null)
  const [deleteCaptureOpen, setDeleteCaptureOpen] = useState(false)
  const [busy, setBusy] = useState<null | "reprocess" | "media" | "capture">(null)
  const [highlight, setHighlight] = useState<Set<string>>(new Set())
  const [activeMoment, setActiveMoment] = useState<string | null>(null)
  const refs = useRef(new Map<string, HTMLLIElement>())

  const entries = (data?.entries ?? []) as EntryView[]
  const moments = (data?.moments ?? []) as MomentView[]
  const entryIndex = useMemo(() => new Map(entries.map((e, i) => [e._id as string, i + 1])), [entries])

  const crumbs = [
    { label: "Documents", href: "/library" },
    { label: "Captures", href: "/library/captures" },
    { label: data?.capture.title ?? "Capture" },
  ]

  if (people === undefined || (person && data === undefined)) {
    return (
      <div className="flex flex-col">
        <TopBar breadcrumb={crumbs} />
        <PageHeader icon={Aperture} title="Capture" />
        <div className="grid gap-6 p-6 lg:grid-cols-2">
          <div className="space-y-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
          <div className="space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        </div>
      </div>
    )
  }

  if (!person || !data) {
    return (
      <div className="flex flex-col">
        <TopBar breadcrumb={crumbs} />
        <PageHeader icon={Aperture} title="Capture" />
        {!person ? (
          <DeskNotice title="Check in to see this Capture" checkIn>
            A Capture is visible to its author and, after hand-in, to checked-in Engineers.
          </DeskNotice>
        ) : (
          <DeskNotice title="This Capture is not available">
            It was deleted, or it is still being recorded. Only its author sees a Capture until it is handed in.{" "}
            <Link href="/library/captures" className="text-[#6E59A5] underline">
              Back to Captures
            </Link>
          </DeskNotice>
        )}
      </div>
    )
  }

  const c = data.capture
  const v = data.viewer
  const working = c.status === "handed_in" || c.status === "processing"
  const pending = entries.filter((e) => e.analysis === "pending").length
  const draftBlocked = !v.isEngineer
    ? "Check in as an Engineer to make a Draft."
    : c.status !== "ready"
      ? "Wait until the AI has organized this Capture."
      : moments.length === 0
        ? "No Moments were found, so there is nothing to write yet. Process it again."
        : null

  function showEvidence(m: MomentView) {
    setActiveMoment(m._id)
    setHighlight(new Set<string>(m.entryIds))
    const first = m.entryIds.find((eid) => refs.current.has(eid))
    if (first) refs.current.get(first)?.scrollIntoView({ behavior: "smooth", block: "center" })
    window.setTimeout(() => setHighlight(new Set()), 3000)
  }

  async function doReprocess() {
    setBusy("reprocess")
    try {
      await reprocess({ captureId: c._id, personId: person!._id })
      toast.success("Processing again")
    } catch (err) {
      toast.error(errorText(err))
    } finally {
      setBusy(null)
    }
  }

  async function doDeleteMedia() {
    if (!toDelete) return
    setBusy("media")
    try {
      await deleteMedia({ entryId: toDelete._id, personId: person!._id })
      toast.success("Media deleted")
      setToDelete(null)
    } catch (err) {
      toast.error(errorText(err))
    } finally {
      setBusy(null)
    }
  }

  async function doDeleteCapture() {
    setBusy("capture")
    try {
      await discard({ captureId: c._id, personId: person!._id })
      toast.success(`Deleted "${c.title}"`)
      navigate("/library/captures")
    } catch (err) {
      toast.error(errorText(err))
      setBusy(null)
    }
  }

  const counts = entries.reduce<Record<string, number>>((acc, e) => ((acc[e.kind] = (acc[e.kind] ?? 0) + 1), acc), {})

  return (
    <div className="flex flex-col">
      <TopBar breadcrumb={crumbs} />
      <PageHeader
        icon={Aperture}
        title={c.title}
        subtitle={
          <span className="inline-flex flex-wrap items-center gap-x-2">
            <StatusPill status={c.status} />
            <span>{data.author?.name ?? "Unknown"}</span>
            {c.job && c.job !== c.title && <span>· {c.job}</span>}
            <span>· {formatDateTime(c.handedInAt ?? c.startedAt)}</span>
            <span>· {formatClock(c.recordedMs)} recorded</span>
          </span>
        }
        actions={
          <>
            {c.status !== "recording" && (
              <Button size="sm" variant="outline" onClick={() => void doReprocess()} disabled={busy === "reprocess" || working}>
                {busy === "reprocess" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="mr-1.5 h-3.5 w-3.5" />}
                Process again
              </Button>
            )}
            {v.isEngineer && (
              <Button size="sm" onClick={() => setDraftOpen(true)} disabled={!!draftBlocked} title={draftBlocked ?? undefined}>
                <FileText className="mr-1.5 h-3.5 w-3.5" />
                Make a Draft
              </Button>
            )}
            {(v.isAuthor || v.isEngineer) && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="outline" className="w-9 px-0" aria-label="More actions">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem className="text-red-700 focus:text-red-700" onSelect={() => setDeleteCaptureOpen(true)}>
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete Capture
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </>
        }
      />

      <div className="space-y-4 p-6">
        {v.isEngineer && draftBlocked && c.status !== "recording" && !working && (
          <p className="text-sm text-muted-foreground">Make a Draft: {draftBlocked}</p>
        )}
        {working && (
          <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            <Loader2 className="h-4 w-4 animate-spin" />
            {pending > 0
              ? `The AI is transcribing and describing media: ${pending} ${pending === 1 ? "Entry" : "Entries"} to go. Moments follow.`
              : "The AI is organizing the Entries into Moments."}
          </div>
        )}
        {c.status === "failed" && (
          <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-medium">The AI could not organize this Capture.</p>
              {c.error && <p className="mt-0.5">{c.error}</p>}
              <p className="mt-0.5">Use Process again to retry.</p>
            </div>
          </div>
        )}

        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          <section aria-labelledby="timeline-h" className="min-w-0">
            <div className="mb-3 flex items-baseline justify-between gap-2">
              <h2 id="timeline-h" className="text-base font-semibold">
                Timeline
              </h2>
              <p className="text-xs text-muted-foreground">
                {entries.length} {entries.length === 1 ? "Entry" : "Entries"}
                {Object.keys(ENTRY_META)
                  .filter((k) => counts[k])
                  .map((k) => ` · ${counts[k]} ${ENTRY_META[k as keyof typeof ENTRY_META].label.toLowerCase()}`)
                  .join("")}
              </p>
            </div>
            {entries.length === 0 ? (
              <p className="text-sm text-muted-foreground">No Entries.</p>
            ) : (
              <EntryTimeline
                entries={entries}
                variant="desk"
                startedAt={c.startedAt}
                highlight={highlight}
                canDeleteMedia={v.canDeleteMedia}
                onDeleteMedia={setToDelete}
                entryRef={(eid, el) => {
                  if (el) refs.current.set(eid, el)
                  else refs.current.delete(eid)
                }}
              />
            )}
          </section>

          <aside aria-labelledby="moments-h" className="min-w-0 space-y-4 lg:sticky lg:top-[132px] lg:max-h-[calc(100vh-150px)] lg:overflow-y-auto lg:pr-1">
            {c.summary && (
              <div className="rounded-xl border bg-card p-4">
                <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <Sparkles className="h-3.5 w-3.5" />
                  Summary by the AI
                </p>
                <p className="mt-1 text-sm">{c.summary}</p>
                {(c.tags ?? []).length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {(c.tags ?? []).map((t) => (
                      <span key={t} className="rounded-full bg-muted px-2 py-0.5 text-xs">
                        {t}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {(data.sets.length > 0 || data.drafts.length > 0) && (
              <div className="space-y-1.5 rounded-xl border bg-card p-4 text-sm">
                {data.sets.map((s) => (
                  <p key={s._id} className="flex items-center gap-2">
                    <Layers className="h-4 w-4 text-muted-foreground" />
                    In Capture set{" "}
                    <Link href={`/library/capture-sets/${s._id}`} className="font-medium text-[#6E59A5] hover:underline">
                      {s.title}
                    </Link>
                  </p>
                ))}
                {data.drafts.map((d) => (
                  <p key={d._id} className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    Draft{" "}
                    <Link href={`/docs/${d._id}`} className="font-mono font-medium text-[#6E59A5] hover:underline">
                      {d.namingCode}
                    </Link>
                    <span className="truncate text-muted-foreground">{d.title}</span>
                  </p>
                ))}
              </div>
            )}

            <div>
              <h2 id="moments-h" className="mb-3 text-base font-semibold">
                Moments
              </h2>
              {c.status === "ready" ? (
                moments.length > 0 ? (
                  <MomentList
                    moments={moments}
                    entryIndex={entryIndex}
                    onEvidence={showEvidence}
                    variant="desk"
                    activeMomentId={activeMoment}
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">No Moments were found in this Capture.</p>
                )
              ) : (
                <p className="text-sm text-muted-foreground">Moments appear here once the AI has organized the Capture.</p>
              )}
            </div>
            {data.author && (
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <Avatar id={data.author._id} name={data.author.name} />
                Recorded by {data.author.name}, {data.author.role}. A Capture is raw input, not Knowledge.
              </p>
            )}
          </aside>
        </div>
      </div>

      <MakeDraftDialog
        open={draftOpen}
        onOpenChange={setDraftOpen}
        personId={person._id}
        captureId={c._id}
        defaultTitle={c.job ?? c.title}
        blockedReason={draftBlocked}
      />
      <ConfirmDelete
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title={toDelete ? `Delete the ${ENTRY_META[toDelete.kind].label.toLowerCase()} of Entry ${entryIndex.get(toDelete._id) ?? ""}?` : ""}
        description="The file is removed for privacy. The Entry stays in the timeline with its time and any text or transcript. A Draft that already embeds this photo keeps its copy."
        action="Delete media"
        busy={busy === "media"}
        onConfirm={() => void doDeleteMedia()}
      />
      <ConfirmDelete
        open={deleteCaptureOpen}
        onOpenChange={setDeleteCaptureOpen}
        title={`Delete "${c.title}"?`}
        description={`All ${entries.length} Entries, their media and the Moments are deleted. It is also removed from any Capture set. Drafts made from it stay.`}
        action="Delete Capture"
        busy={busy === "capture"}
        onConfirm={() => void doDeleteCapture()}
      />
    </div>
  )
}
