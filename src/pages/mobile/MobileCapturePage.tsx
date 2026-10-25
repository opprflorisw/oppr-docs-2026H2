import { useEffect, useMemo, useRef, useState } from "react"
import { Link, useLocation, useSearch } from "wouter"
import { useMutation, useQuery } from "convex/react"
import { toast } from "sonner"
import {
  ChevronRight,
  Factory,
  Image as ImageIcon,
  Loader2,
  Mic,
  MoreHorizontal,
  Pause,
  Play,
  Plus,
  ScanLine,
  ShieldCheck,
  Square,
  StickyNote,
  Trash2,
  UserRound,
  Video,
} from "lucide-react"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import type { FunctionReturnType } from "convex/server"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Skeleton } from "@/components/ui/skeleton"
import { MobileHeader } from "@/components/mobile/MobileHeader"
import { useMobileShell } from "@/components/mobile/MobileShell"
import { useCheckIn } from "@/lib/checkIn"
import { formatAgo } from "@/lib/time"
import { cn } from "@/lib/utils"
import { PhoneSheet } from "@/components/captures/PhoneSheet"
import { CAPTURE_NOTICE_POINTS } from "@/components/settings/captureNotice"
import { CaptureScanSheet } from "@/components/captures/CaptureScanSheet"
import { EntryTimeline, type EntryView } from "@/components/captures/EntryTimeline"
import {
  ENTRY_META,
  StatusPill,
  errorText,
  formatClock,
  markNoticeSeen,
  noticeSeen,
  uploadBlob,
  type EntryKind,
} from "@/components/captures/captureUi"
import { useCaptureClock } from "@/components/captures/useCapture"
import { useVoiceRecorder } from "@/components/captures/useVoiceRecorder"

/**
 * /m/capture: start a Capture, then record the work as a stream of Entries
 * while walking the floor (CONTEXT.md "Capturing work on the floor").
 */
export function MobileCapturePage() {
  const { person, people } = useCheckIn()
  const { requestCheckIn } = useMobileShell()
  const active = useQuery(api.captures.captures.active, person ? { personId: person._id } : "skip")

  if (people === undefined || (person && active === undefined)) {
    return (
      <div className="flex flex-col">
        <MobileHeader backTo={null} title="Capture" />
        <div className="space-y-3 p-4">
          <Skeleton className="h-24 w-full rounded-2xl" />
          <Skeleton className="h-12 w-full rounded-xl" />
          <Skeleton className="h-12 w-full rounded-xl" />
        </div>
      </div>
    )
  }

  if (!person) {
    return (
      <div className="flex flex-col">
        <MobileHeader backTo={null} title="Capture" />
        <div className="p-4">
          <div className="rounded-2xl border bg-card p-5 text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <UserRound className="h-6 w-6 text-muted-foreground" />
            </span>
            <p className="mt-3 text-lg font-semibold">Check in to record</p>
            <p className="mt-1 text-base text-muted-foreground">
              A Capture carries your name, so Engineers know who showed the work. Pick your name first.
            </p>
            <Button className="mt-4 h-12 w-full rounded-xl text-base" onClick={() => requestCheckIn({ reason: "Check in to record a Capture" })}>
              Check in
            </Button>
          </div>
        </div>
      </div>
    )
  }

  if (active) return <Recorder key={active._id} capture={active} personId={person._id} />
  return <StartCapture personId={person._id} />
}

// ---- Start ------------------------------------------------------------------

function StartCapture({ personId }: { personId: Id<"people"> }) {
  const [, navigate] = useLocation()
  const start = useMutation(api.captures.captures.start)
  const mine = useQuery(api.captures.captures.mine, { personId })
  const known = useQuery(api.captures.captures.knownJobs, { personId })
  const [title, setTitle] = useState("")
  const [showTitle, setShowTitle] = useState(false)
  // null: not chosen yet (the last used job is preselected once known).
  const [job, setJob] = useState<string | null>(null)
  const [otherOpen, setOtherOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [noticeOpen, setNoticeOpen] = useState(false)
  // The company's own notice and retention (Settings, Floor), shown with the standard points.
  const floorSettings = useQuery(api.orgSettings.get)?.floor
  const [noticeDone, setNoticeDone] = useState(() => noticeSeen())

  const jobs = known ?? []
  const lastJob = jobs.find((j) => j.mine)?.job ?? null
  const chosen = job ?? (otherOpen ? "" : (lastJob ?? ""))
  const typingOther = otherOpen || (known !== undefined && jobs.length === 0)

  const handedIn = (mine ?? []).filter((c) => c.status !== "recording")

  async function begin() {
    const t = title.trim() || chosen.trim()
    if (!t) return
    setBusy(true)
    try {
      await start({ personId, title: t, job: chosen.trim() || undefined })
      markNoticeSeen()
      navigate("/m/capture", { replace: true })
    } catch (err) {
      toast.error(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-full flex-col">
      <MobileHeader backTo={null} title="Capture" subtitle="Show how you do the work" />
      <div className="flex-1 space-y-5 p-4">
        {!noticeDone && (
          <div className="flex min-h-12 items-center gap-2 rounded-xl border border-[#9b87f5]/40 bg-[#9b87f5]/10 py-1 pl-3 pr-1">
            <ShieldCheck className="h-5 w-5 shrink-0 text-[#6E59A5]" />
            <p className="min-w-0 flex-1 text-sm leading-snug">Only you see a Capture until you hand it in.</p>
            <button
              type="button"
              onClick={() => setNoticeOpen(true)}
              className="min-h-11 shrink-0 rounded-lg px-3 text-sm font-semibold text-[#6E59A5]"
            >
              Read
            </button>
          </div>
        )}

        <fieldset className="space-y-2">
          <legend className="pb-2 text-[15px] font-medium">Which job?</legend>
          {known === undefined ? (
            <Skeleton className="h-12 w-full rounded-xl" />
          ) : (
            <div className="flex flex-col gap-2" role="radiogroup" aria-label="Which job?">
              {jobs.map((j) => {
                const on = !otherOpen && chosen === j.job
                return (
                  <button
                    key={j.job}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => {
                      setOtherOpen(false)
                      setJob(j.job)
                    }}
                    className={cn(
                      "flex min-h-12 items-center gap-3 rounded-xl border px-3 py-2 text-left",
                      on ? "border-[#6E59A5] bg-[#9b87f5]/10" : "bg-card",
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2",
                        on ? "border-[#6E59A5]" : "border-muted-foreground/40",
                      )}
                    >
                      {on && <span className="h-2.5 w-2.5 rounded-full bg-[#6E59A5]" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-base leading-snug">{j.job}</span>
                      <span className="block text-[13px] text-muted-foreground">
                        {j.job === lastJob ? "Your last job" : j.mine ? "You recorded this before" : `${j.count} ${j.count === 1 ? "Capture" : "Captures"} by others`}
                      </span>
                    </span>
                  </button>
                )
              })}
              {jobs.length > 0 && !typingOther && (
                <button
                  type="button"
                  onClick={() => {
                    setOtherOpen(true)
                    setJob("")
                  }}
                  className="flex min-h-12 items-center gap-2 rounded-xl border border-dashed px-3 text-left text-base text-muted-foreground"
                >
                  <Plus className="h-5 w-5" />
                  Another job
                </button>
              )}
              {typingOther && (
                <Input
                  id="capture-job"
                  autoFocus={otherOpen}
                  value={chosen}
                  onChange={(e) => setJob(e.target.value)}
                  placeholder="For example: Start-up of line 2 after a stop"
                  aria-label="Name the job"
                  className="h-12 rounded-xl text-base"
                />
              )}
            </div>
          )}
        </fieldset>

        {showTitle ? (
          <div className="space-y-2">
            <label htmlFor="capture-title" className="text-[15px] font-medium">
              Title <span className="font-normal text-muted-foreground">(optional)</span>
            </label>
            <Input
              id="capture-title"
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={chosen.trim() ? chosen.trim() : "For example: Night shift start-up"}
              className="h-12 rounded-xl text-base"
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowTitle(true)}
            className="min-h-11 text-sm font-semibold text-[#6E59A5]"
          >
            Add a title (optional)
          </button>
        )}

        {handedIn.length > 0 && (
          <section className="space-y-2 pt-2">
            <h2 className="text-[15px] font-semibold">Your Captures</h2>
            <ul className="divide-y rounded-2xl border bg-card">
              {handedIn.slice(0, 8).map((c) => (
                <li key={c._id}>
                  <Link href={`/m/capture/${c._id}`} className="flex min-h-14 items-center gap-3 px-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-medium">{c.title}</p>
                      <p className="truncate text-[13px] text-muted-foreground">
                        {formatAgo(c.handedInAt ?? c.startedAt)}
                        {c.job && c.job !== c.title ? ` · ${c.job}` : ""}
                      </p>
                    </div>
                    <StatusPill status={c.status} />
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <div className="sticky bottom-0 border-t bg-background/95 p-3 backdrop-blur">
        {!(title.trim() || chosen.trim()) && (
          <p className="mb-2 text-center text-[13px] text-muted-foreground">Pick or name the job first, so your Capture can be grouped with others.</p>
        )}
        <Button
          className="h-14 w-full gap-2 rounded-xl text-base"
          disabled={busy || !(title.trim() || chosen.trim())}
          onClick={() => void begin()}
        >
          {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <span className="h-3 w-3 rounded-full bg-red-500" />}
          Start Capture
        </Button>
      </div>

      <PhoneSheet
        open={noticeOpen}
        onClose={() => setNoticeOpen(false)}
        title="Before you start"
        footer={
          <Button
            className="h-12 w-full rounded-xl text-base"
            onClick={() => {
              markNoticeSeen()
              setNoticeDone(true)
              setNoticeOpen(false)
            }}
          >
            Got it
          </Button>
        }
      >
        <ul className="list-disc space-y-2 pl-5 text-base leading-snug">
          {CAPTURE_NOTICE_POINTS.map((p) => (
            <li key={p}>{p}</li>
          ))}
          {floorSettings?.captureRetentionDays != null && (
            <li>Photos, video and voice notes are removed {floorSettings.captureRetentionDays} days after hand-in.</li>
          )}
        </ul>
        {floorSettings?.captureNotice && (
          <p className="mt-3 whitespace-pre-line rounded-xl bg-muted/60 p-3 text-base leading-snug" data-testid="capture-company-notice">
            {floorSettings.captureNotice}
          </p>
        )}
      </PhoneSheet>
    </div>
  )
}

// ---- Recording ----------------------------------------------------------------

type Busy = null | EntryKind | "pause" | "handin" | "discard"

type ActiveCapture = NonNullable<FunctionReturnType<typeof api.captures.captures.active>>

function Recorder({ capture, personId }: { capture: ActiveCapture; personId: Id<"people"> }) {
  const [, navigate] = useLocation()
  const search = useSearch()
  const detail = useQuery(api.captures.captures.get, { captureId: capture._id, personId })
  const addEntry = useMutation(api.captures.captures.addEntry)
  const genUrl = useMutation(api.captures.captures.generateUploadUrl)
  const handIn = useMutation(api.captures.captures.handIn)
  const discard = useMutation(api.captures.captures.discard)
  const pauseFn = useMutation(api.captures.captures.pause)
  const resumeFn = useMutation(api.captures.captures.resume)
  const assets = useQuery(api.assets.list)
  const { ms, paused } = useCaptureClock(capture)

  const [busy, setBusy] = useState<Busy>(null)
  const [noteOpen, setNoteOpen] = useState(false)
  const [noteText, setNoteText] = useState("")
  const [scanOpen, setScanOpen] = useState(false)
  const [handInOpen, setHandInOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [discardOpen, setDiscardOpen] = useState(false)
  const photoRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLInputElement>(null)
  const listEndRef = useRef<HTMLDivElement>(null)
  const voice = useVoiceRecorder()
  // Voice: tap to start, tap to stop. Holding the button is a shortcut:
  // after 400ms it becomes push-to-talk and releasing sends the note.
  const [voiceMode, setVoiceMode] = useState<"tap" | "hold">("tap")
  const pressRef = useRef<{ timer: number; hold: boolean } | null>(null)

  const entries = (detail?.entries ?? []) as EntryView[]
  const assetById = useMemo(() => new Map((assets ?? []).map((a) => [a._id as string, a])), [assets])
  const currentAsset = capture.currentAsset

  // New Entries scroll into view.
  const count = entries.length
  useEffect(() => {
    if (count > 0) listEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })
  }, [count])

  // A Scan handed over by the Floor simulator (?scan=<assetId>).
  const pendingScan = new URLSearchParams(search).get("scan")
  const handled = useRef<string | null>(null)
  useEffect(() => {
    if (!pendingScan || handled.current === search) return
    handled.current = search
    navigate("/m/capture", { replace: true })
    if (assetById.size === 0 || assetById.has(pendingScan)) void add("scan", { assetId: pendingScan as Id<"assets"> })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingScan, search])

  async function add(
    kind: EntryKind,
    fields: { text?: string; blob?: Blob; mimeType?: string; durationMs?: number; assetId?: Id<"assets"> },
  ): Promise<boolean> {
    if (paused) {
      toast("Resume the Capture to add Entries")
      return false
    }
    setBusy(kind)
    try {
      let storageId: Id<"_storage"> | undefined
      if (fields.blob) storageId = await uploadBlob(await genUrl(), fields.blob)
      await addEntry({
        captureId: capture._id,
        personId,
        kind,
        text: fields.text,
        storageId,
        mimeType: fields.mimeType ?? fields.blob?.type ?? undefined,
        sizeBytes: fields.blob?.size,
        durationMs: fields.durationMs,
        assetId: fields.assetId,
      })
      if (kind === "scan") {
        const a = fields.assetId ? assetById.get(fields.assetId) : null
        toast.success(a ? `At ${a.code}. Next Entries are tagged with it.` : "Scan added")
      }
      return true
    } catch (err) {
      toast.error(errorText(err))
      return false
    } finally {
      setBusy(null)
    }
  }

  async function voiceDown() {
    if (paused || (busy && voice.state !== "recording")) return
    if (voice.state === "recording") {
      // Tap mode: the second tap stops and adds the note.
      await finishVoice()
      return
    }
    if (voice.state !== "idle") return
    setVoiceMode("tap")
    const press = {
      hold: false,
      timer: window.setTimeout(() => {
        press.hold = true
        setVoiceMode("hold")
      }, 400),
    }
    pressRef.current = press
    await voice.start()
  }
  async function voiceUp() {
    const press = pressRef.current
    if (!press) return
    pressRef.current = null
    window.clearTimeout(press.timer)
    if (press.hold) await finishVoice()
  }
  async function finishVoice() {
    setVoiceMode("tap")
    const clip = await voice.stop()
    if (!clip) return
    const ok = await add("voice", { blob: clip.blob, mimeType: clip.mimeType, durationMs: clip.durationMs })
    if (ok) toast.success(`Voice note added (${formatClock(clip.durationMs)})`)
  }

  async function onFile(kind: "photo" | "video", file: File | undefined) {
    if (!file) return
    let durationMs: number | undefined
    if (kind === "video") durationMs = await videoDuration(file)
    const ok = await add(kind, { blob: file, mimeType: file.type, durationMs })
    if (ok) toast.success(kind === "photo" ? "Photo added" : "Video added")
  }

  async function togglePause() {
    setBusy("pause")
    try {
      if (paused) await resumeFn({ captureId: capture._id, personId })
      else {
        if (voice.state === "recording") voice.cancel()
        await pauseFn({ captureId: capture._id, personId })
      }
    } catch (err) {
      toast.error(errorText(err))
    } finally {
      setBusy(null)
    }
  }

  async function doHandIn() {
    setBusy("handin")
    try {
      await handIn({ captureId: capture._id, personId })
      setHandInOpen(false)
      toast.success("Handed in. The AI is organizing your Capture.")
      navigate(`/m/capture/${capture._id}`, { replace: true })
    } catch (err) {
      toast.error(errorText(err))
    } finally {
      setBusy(null)
    }
  }

  async function doDiscard() {
    setBusy("discard")
    try {
      await discard({ captureId: capture._id, personId })
      setDiscardOpen(false)
      toast("Capture discarded")
      navigate("/m/capture", { replace: true })
    } catch (err) {
      toast.error(errorText(err))
    } finally {
      setBusy(null)
    }
  }

  const counts = useMemo(() => {
    const c: Record<EntryKind, number> = { note: 0, voice: 0, photo: 0, video: 0, scan: 0 }
    for (const e of entries) c[e.kind]++
    return c
  }, [entries])

  const recording = voice.state !== "idle"
  const disabled = paused || busy !== null

  return (
    <div className="flex min-h-full flex-col">
      <MobileHeader
        backTo={null}
        title={capture.title}
        subtitle={capture.job && capture.job !== capture.title ? capture.job : undefined}
        right={
          <button
            type="button"
            aria-label="More"
            onClick={() => setMenuOpen(true)}
            className="flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
          >
            <MoreHorizontal className="h-5 w-5" />
          </button>
        }
      />

      {/* Status strip: clock, pause, hand in. */}
      <div className="sticky top-[57px] z-[9] flex items-center gap-2 border-b bg-background/95 px-3 py-2 backdrop-blur">
        <div className={cn("flex items-center gap-2 rounded-full px-3 py-1.5", paused ? "bg-slate-100" : "bg-red-50")}>
          {paused ? <Pause className="h-4 w-4 text-slate-600" /> : <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-600" />}
          <span className={cn("font-mono text-base font-semibold tabular-nums", paused ? "text-slate-700" : "text-red-700")}>{formatClock(ms)}</span>
          <span className="sr-only">{paused ? "Paused" : "Recording"}</span>
        </div>
        <Button
          variant="outline"
          className="h-11 gap-1.5 rounded-xl px-3 text-[15px]"
          disabled={busy === "pause" || recording}
          onClick={() => void togglePause()}
        >
          {paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
          {paused ? "Resume" : "Pause"}
        </Button>
        <Button
          className="ml-auto h-11 rounded-xl px-4 text-[15px]"
          disabled={busy !== null || recording || entries.length === 0}
          onClick={() => setHandInOpen(true)}
          title={entries.length === 0 ? "Add at least one Entry first" : undefined}
        >
          Hand in
        </Button>
      </div>

      {/* Current Asset */}
      <div className="px-3 pt-3">
        <button
          type="button"
          onClick={() => setScanOpen(true)}
          disabled={disabled}
          className="flex min-h-12 w-full items-center gap-2.5 rounded-xl border bg-card px-3 py-2 text-left disabled:opacity-60"
        >
          <Factory className="h-5 w-5 shrink-0 text-muted-foreground" />
          {currentAsset ? (
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] text-muted-foreground">Entries are tagged with</span>
              <span className="block truncate text-[15px] font-medium">
                <span className="font-mono">{currentAsset.code}</span> {currentAsset.name}
              </span>
            </span>
          ) : (
            <span className="min-w-0 flex-1 text-[15px] text-muted-foreground">No Asset yet. Scan the machine you are at.</span>
          )}
          <span className="text-sm font-medium text-[#6E59A5]">{currentAsset ? "Change" : "Scan"}</span>
        </button>
      </div>

      {/* Live timeline */}
      <div className="flex-1 px-3 py-3">
        {detail === undefined ? (
          <div className="space-y-2">
            <Skeleton className="h-16 w-full rounded-xl" />
            <Skeleton className="h-16 w-full rounded-xl" />
          </div>
        ) : entries.length === 0 ? (
          <div className="rounded-2xl border border-dashed p-5 text-center">
            <p className="text-base font-medium">Nothing recorded yet</p>
            <p className="mt-1 text-[15px] text-muted-foreground">
              Scan the first machine, then talk, snap and note as you work. Every Entry gets a time.
            </p>
          </div>
        ) : (
          <EntryTimeline entries={entries} variant="phone" startedAt={capture.startedAt} />
        )}
        {busy && busy !== "pause" && busy !== "handin" && busy !== "discard" && (
          <div className="mt-2 flex items-center gap-2 rounded-xl border bg-muted/40 px-3 py-2.5 text-[15px] text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Adding {ENTRY_META[busy].label.toLowerCase()}
          </div>
        )}
        <div ref={listEndRef} />
      </div>

      {/* One-handed controls */}
      <div className="sticky bottom-0 z-[9] space-y-2 border-t bg-background/95 p-3 backdrop-blur">
        {paused && (
          <p className="rounded-lg bg-slate-100 px-3 py-2 text-center text-[15px] text-slate-700">
            Paused. Tap Resume to add Entries.
          </p>
        )}
        {voice.error && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-[15px] text-amber-900" role="alert">
            {voice.error}
          </p>
        )}
        <div className="grid grid-cols-4 gap-2">
          <ActionTile icon={StickyNote} label="Note" disabled={disabled || recording} onClick={() => setNoteOpen(true)} />
          <ActionTile icon={ImageIcon} label="Photo" disabled={disabled || recording} onClick={() => photoRef.current?.click()} />
          <ActionTile icon={Video} label="Video" disabled={disabled || recording} onClick={() => videoRef.current?.click()} />
          <ActionTile icon={ScanLine} label="Scan" disabled={disabled || recording} onClick={() => setScanOpen(true)} />
        </div>
        <button
          type="button"
          disabled={paused || (busy !== null && !recording)}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture?.(e.pointerId)
            void voiceDown()
          }}
          onPointerUp={() => void voiceUp()}
          onPointerCancel={() => void voiceUp()}
          onContextMenu={(e) => e.preventDefault()}
          onKeyDown={(e) => {
            if ((e.key === " " || e.key === "Enter") && !e.repeat) {
              e.preventDefault()
              void voiceDown()
            }
          }}
          onKeyUp={(e) => {
            if (e.key === " " || e.key === "Enter") void voiceUp()
          }}
          aria-label={
            recording
              ? voiceMode === "hold"
                ? "Recording. Release to send"
                : "Recording. Tap to stop and add the voice note"
              : "Record voice note"
          }
          className={cn(
            "relative flex h-16 w-full select-none items-center justify-center gap-3 overflow-hidden rounded-2xl text-lg font-semibold transition active:scale-[0.99] disabled:opacity-50",
            recording ? "bg-red-600 text-white" : "bg-[#6E59A5] text-white",
          )}
          style={{ touchAction: "none", WebkitUserSelect: "none" }}
        >
          {recording && (
            <span
              aria-hidden
              className="absolute inset-y-0 left-0 bg-white/20 transition-[width] duration-75"
              style={{ width: `${Math.round(voice.level * 100)}%` }}
            />
          )}
          {voice.state === "starting" ? (
            <Loader2 className="relative h-6 w-6 animate-spin" />
          ) : recording ? (
            <Square className="relative h-5 w-5 fill-white" />
          ) : (
            <Mic className="relative h-6 w-6" />
          )}
          <span className="relative tabular-nums">
            {recording
              ? voiceMode === "hold"
                ? `Release to send · ${formatClock(voice.elapsed)}`
                : `Recording ${formatClock(voice.elapsed)} · tap to stop`
              : "Record voice note"}
          </span>
        </button>
      </div>

      <input
        ref={photoRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        data-testid="capture-photo-input"
        onChange={(e) => {
          void onFile("photo", e.target.files?.[0])
          e.target.value = ""
        }}
      />
      <input
        ref={videoRef}
        type="file"
        accept="video/*"
        capture="environment"
        className="hidden"
        data-testid="capture-video-input"
        onChange={(e) => {
          void onFile("video", e.target.files?.[0])
          e.target.value = ""
        }}
      />

      <PhoneSheet
        open={noteOpen}
        onClose={() => setNoteOpen(false)}
        title="Add a note"
        description={currentAsset ? `Tagged with ${currentAsset.code}` : undefined}
        footer={
          <Button
            className="h-12 w-full rounded-xl text-base"
            disabled={!noteText.trim() || busy !== null}
            onClick={async () => {
              const ok = await add("note", { text: noteText.trim() })
              if (ok) {
                setNoteText("")
                setNoteOpen(false)
                toast.success("Note added")
              }
            }}
          >
            {busy === "note" && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Add note
          </Button>
        }
      >
        <Textarea
          autoFocus
          value={noteText}
          onChange={(e) => setNoteText(e.target.value)}
          rows={4}
          placeholder="What do you do, check or watch out for here?"
          className="resize-none text-base"
        />
      </PhoneSheet>

      <CaptureScanSheet
        open={scanOpen}
        onClose={() => setScanOpen(false)}
        onScan={(assetId) => void add("scan", { assetId })}
      />

      <PhoneSheet
        open={handInOpen}
        onClose={() => setHandInOpen(false)}
        title="Hand in this Capture?"
        description="The AI then organizes your Entries into steps, safety points, tips and problems. Engineers can see it after hand-in."
        footer={
          <div className="space-y-2">
            <Button className="h-12 w-full rounded-xl text-base" disabled={busy === "handin"} onClick={() => void doHandIn()}>
              {busy === "handin" && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Hand in
            </Button>
            <Button variant="outline" className="h-12 w-full rounded-xl text-base" onClick={() => setHandInOpen(false)}>
              Keep recording
            </Button>
          </div>
        }
      >
        <div className="rounded-xl border bg-card p-3">
          <p className="text-[15px]">
            <span className="font-semibold">{formatClock(ms)}</span> recorded, {entries.length} {entries.length === 1 ? "Entry" : "Entries"}
          </p>
          <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5">
            {(Object.keys(ENTRY_META) as EntryKind[]).map((k) => {
              const Icon = ENTRY_META[k].icon
              return (
                <li key={k} className={cn("flex items-center gap-2 text-[15px]", counts[k] === 0 && "text-muted-foreground")}>
                  <Icon className="h-4 w-4" />
                  {counts[k]} {k === "scan" ? (counts[k] === 1 ? "Scan" : "Scans") : ENTRY_META[k].label.toLowerCase() + (counts[k] === 1 ? "" : "s")}
                </li>
              )
            })}
          </ul>
        </div>
        {counts.scan === 0 && (
          <p className="mt-2 text-sm text-muted-foreground">No Scans yet. Moments will not be linked to an Asset.</p>
        )}
      </PhoneSheet>

      <PhoneSheet open={menuOpen} onClose={() => setMenuOpen(false)} title={capture.title}>
        <div className="space-y-2 pb-2">
          <button
            type="button"
            onClick={() => {
              setMenuOpen(false)
              setDiscardOpen(true)
            }}
            className="flex min-h-12 w-full items-center gap-3 rounded-xl border px-3 text-left text-base text-red-700"
          >
            <Trash2 className="h-5 w-5" />
            Discard this Capture
          </button>
        </div>
      </PhoneSheet>

      <PhoneSheet
        open={discardOpen}
        onClose={() => setDiscardOpen(false)}
        title={`Discard "${capture.title}"?`}
        description={`All ${entries.length} ${entries.length === 1 ? "Entry" : "Entries"}, with their photos, videos and voice notes, are deleted. This cannot be undone.`}
        footer={
          <div className="space-y-2">
            <Button
              variant="destructive"
              className="h-12 w-full rounded-xl text-base"
              disabled={busy === "discard"}
              onClick={() => void doDiscard()}
            >
              {busy === "discard" && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Discard Capture
            </Button>
            <Button variant="outline" className="h-12 w-full rounded-xl text-base" onClick={() => setDiscardOpen(false)}>
              Keep it
            </Button>
          </div>
        }
      />
    </div>
  )
}

function ActionTile({
  icon: Icon,
  label,
  onClick,
  disabled,
}: {
  icon: typeof Mic
  label: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex h-[72px] flex-col items-center justify-center gap-1 rounded-2xl border bg-card text-[15px] font-medium transition active:scale-[0.97] active:bg-muted disabled:opacity-50"
    >
      <Icon className="h-6 w-6" />
      {label}
    </button>
  )
}

function videoDuration(file: File): Promise<number | undefined> {
  return new Promise((resolve) => {
    try {
      const url = URL.createObjectURL(file)
      const v = document.createElement("video")
      v.preload = "metadata"
      const done = (ms?: number) => {
        URL.revokeObjectURL(url)
        resolve(ms)
      }
      v.onloadedmetadata = () => done(Number.isFinite(v.duration) ? Math.round(v.duration * 1000) : undefined)
      v.onerror = () => done(undefined)
      window.setTimeout(() => done(undefined), 3000)
      v.src = url
    } catch {
      resolve(undefined)
    }
  })
}

