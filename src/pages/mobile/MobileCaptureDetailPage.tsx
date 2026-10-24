import { useMemo, useRef, useState } from "react"
import { Redirect, useParams } from "wouter"
import { useMutation, useQuery } from "convex/react"
import { toast } from "sonner"
import { AlertTriangle, Loader2, RotateCcw, Sparkles } from "lucide-react"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { MobileHeader } from "@/components/mobile/MobileHeader"
import { useMobileShell } from "@/components/mobile/MobileShell"
import { useCheckIn } from "@/lib/checkIn"
import { formatDateTime } from "@/lib/time"
import { PhoneSheet } from "@/components/captures/PhoneSheet"
import { EntryTimeline, type EntryView } from "@/components/captures/EntryTimeline"
import { MomentList, type MomentView } from "@/components/captures/MomentList"
import { ENTRY_META, StatusPill, errorText, formatClock } from "@/components/captures/captureUi"

/** /m/capture/:id: a handed-in Capture. Processing status, then Moments and the timeline. */
export function MobileCaptureDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { person, people } = useCheckIn()
  const { openCheckIn } = useMobileShell()
  const data = useQuery(
    api.captures.captures.get,
    person ? { captureId: id as Id<"captures">, personId: person._id } : "skip",
  )
  const reprocess = useMutation(api.captures.captures.reprocess)
  const deleteMedia = useMutation(api.captures.captures.deleteEntryMedia)
  const [toDelete, setToDelete] = useState<EntryView | null>(null)
  const [busy, setBusy] = useState<null | "delete" | "retry">(null)
  const [highlight, setHighlight] = useState<Set<string>>(new Set())
  const refs = useRef(new Map<string, HTMLLIElement>())

  const entries = (data?.entries ?? []) as EntryView[]
  const moments = (data?.moments ?? []) as MomentView[]
  const entryIndex = useMemo(() => new Map(entries.map((e, i) => [e._id as string, i + 1])), [entries])

  if (people === undefined || (person && data === undefined)) {
    return (
      <div className="flex flex-col">
        <MobileHeader backTo="/m/capture" title="Capture" />
        <div className="space-y-3 p-4">
          <Skeleton className="h-20 w-full rounded-2xl" />
          <Skeleton className="h-16 w-full rounded-xl" />
          <Skeleton className="h-16 w-full rounded-xl" />
        </div>
      </div>
    )
  }

  if (!person) {
    return (
      <div className="flex flex-col">
        <MobileHeader backTo="/m/capture" title="Capture" />
        <div className="m-4 rounded-2xl border bg-card p-5 text-center">
          <p className="text-lg font-semibold">Check in to see this Capture</p>
          <p className="mt-1 text-base text-muted-foreground">Captures are visible to their author and, after hand-in, to Engineers.</p>
          <Button className="mt-4 h-12 w-full rounded-xl text-base" onClick={openCheckIn}>
            Check in
          </Button>
        </div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="flex flex-col">
        <MobileHeader backTo="/m/capture" title="Capture" />
        <div className="m-4 rounded-2xl border bg-card p-5 text-center">
          <p className="text-lg font-semibold">This Capture is not available</p>
          <p className="mt-1 text-base text-muted-foreground">
            It was discarded, or it belongs to someone else and is not handed in yet.
          </p>
        </div>
      </div>
    )
  }

  const c = data.capture
  if (c.status === "recording" && data.viewer.isAuthor) return <Redirect to="/m/capture" replace />

  const working = c.status === "handed_in" || c.status === "processing"
  const pending = entries.filter((e) => e.analysis === "pending").length

  function showEvidence(m: MomentView) {
    const ids = new Set<string>(m.entryIds)
    setHighlight(ids)
    const first = m.entryIds.find((eid) => refs.current.has(eid))
    if (first) refs.current.get(first)?.scrollIntoView({ behavior: "smooth", block: "center" })
    window.setTimeout(() => setHighlight(new Set()), 2600)
  }

  async function retry() {
    setBusy("retry")
    try {
      await reprocess({ captureId: c._id, personId: person!._id })
    } catch (err) {
      toast.error(errorText(err))
    } finally {
      setBusy(null)
    }
  }

  async function confirmDelete() {
    if (!toDelete) return
    setBusy("delete")
    try {
      await deleteMedia({ entryId: toDelete._id, personId: person!._id })
      toast.success("Deleted")
      setToDelete(null)
    } catch (err) {
      toast.error(errorText(err))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex flex-col pb-6">
      <MobileHeader
        backTo="/m/capture"
        title={c.title}
        subtitle={`${data.author?.name ?? "Unknown"} · ${formatDateTime(c.handedInAt ?? c.startedAt)}`}
      />

      <div className="space-y-4 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill status={c.status} />
          <span className="text-sm text-muted-foreground">
            {formatClock(c.recordedMs)} recorded · {entries.length} {entries.length === 1 ? "Entry" : "Entries"}
          </span>
        </div>

        {working && (
          <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <Loader2 className="mt-0.5 h-5 w-5 shrink-0 animate-spin text-amber-700" />
            <div>
              <p className="text-base font-semibold text-amber-950">Organizing your Capture</p>
              <p className="mt-0.5 text-[15px] text-amber-900">
                {pending > 0
                  ? `Listening to voice notes and looking at photos: ${pending} still to go.`
                  : "Finding the steps, safety points, tips and problems."}{" "}
                You can leave this page. It usually takes under a minute.
              </p>
            </div>
          </div>
        )}

        {c.status === "failed" && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
            <p className="flex items-center gap-2 text-base font-semibold text-red-900">
              <AlertTriangle className="h-5 w-5" />
              The AI could not organize this Capture
            </p>
            {c.error && <p className="mt-1 text-[15px] text-red-900">{c.error}</p>}
            <Button
              variant="outline"
              className="mt-3 h-12 w-full gap-2 rounded-xl bg-background text-base"
              disabled={busy === "retry"}
              onClick={() => void retry()}
            >
              {busy === "retry" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
              Try again
            </Button>
          </div>
        )}

        {c.status === "ready" && (
          <>
            {c.summary && (
              <div className="rounded-2xl border bg-card p-4">
                <p className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
                  <Sparkles className="h-4 w-4" />
                  Summary by the AI
                </p>
                <p className="mt-1 text-base leading-snug">{c.summary}</p>
                {(c.tags ?? []).length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {(c.tags ?? []).map((t) => (
                      <span key={t} className="rounded-full bg-muted px-2 py-0.5 text-[13px]">
                        {t}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
            {moments.length > 0 ? (
              <section>
                <h2 className="mb-2 text-lg font-semibold">What the AI found</h2>
                <MomentList moments={moments} entryIndex={entryIndex} onEvidence={showEvidence} variant="phone" />
              </section>
            ) : (
              <p className="text-[15px] text-muted-foreground">No Moments found in this Capture.</p>
            )}
            {data.drafts.length > 0 && (
              <p className="rounded-xl bg-muted/60 px-3 py-2 text-[15px]">
                An Engineer made a Draft from this Capture: {data.drafts.map((d) => d.namingCode).join(", ")}.
              </p>
            )}
          </>
        )}

        <section>
          <h2 className="mb-2 text-lg font-semibold">Timeline</h2>
          {entries.length === 0 ? (
            <p className="text-[15px] text-muted-foreground">No Entries.</p>
          ) : (
            <EntryTimeline
              entries={entries}
              variant="phone"
              startedAt={c.startedAt}
              highlight={highlight}
              canDeleteMedia={data.viewer.canDeleteMedia}
              onDeleteMedia={setToDelete}
              entryRef={(eid, el) => {
                if (el) refs.current.set(eid, el)
                else refs.current.delete(eid)
              }}
            />
          )}
        </section>
      </div>

      <PhoneSheet
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        title={toDelete ? `Delete this ${ENTRY_META[toDelete.kind].label.toLowerCase()}?` : ""}
        description="The file is removed for privacy. The Entry stays in the timeline with its time and any text. This cannot be undone."
        footer={
          <div className="space-y-2">
            <Button variant="destructive" className="h-12 w-full rounded-xl text-base" disabled={busy === "delete"} onClick={() => void confirmDelete()}>
              {busy === "delete" && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Delete
            </Button>
            <Button variant="outline" className="h-12 w-full rounded-xl text-base" onClick={() => setToDelete(null)}>
              Keep it
            </Button>
          </div>
        }
      />
    </div>
  )
}
