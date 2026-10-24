import {
  AlertTriangle,
  CircleHelp,
  Footprints,
  Image as ImageIcon,
  Lightbulb,
  Mic,
  ScanLine,
  ShieldAlert,
  StickyNote,
  Video,
  BadgeCheck,
  type LucideIcon,
} from "lucide-react"
import { ConvexError } from "convex/values"
import type { Doc, Id } from "../../../convex/_generated/dataModel"

// Shared vocabulary for the Capture screens (CONTEXT.md "Capturing work on
// the floor"): Entry kinds, Moment kinds and Capture statuses, with the words
// and icons every Capture page uses.

export type EntryKind = Doc<"captureEntries">["kind"]
export type MomentKind = Doc<"captureMoments">["kind"]
export type CaptureStatus = Doc<"captures">["status"]

export const ENTRY_META: Record<EntryKind, { label: string; icon: LucideIcon }> = {
  note: { label: "Note", icon: StickyNote },
  voice: { label: "Voice note", icon: Mic },
  photo: { label: "Photo", icon: ImageIcon },
  video: { label: "Video", icon: Video },
  scan: { label: "Scan", icon: ScanLine },
}

export const MOMENT_ORDER: MomentKind[] = ["step", "safety", "quality", "tip", "problem", "question"]

export const MOMENT_META: Record<
  MomentKind,
  { label: string; plural: string; icon: LucideIcon; tone: string; dot: string }
> = {
  step: { label: "Step", plural: "Steps", icon: Footprints, tone: "border-slate-200 bg-slate-50 text-slate-700", dot: "bg-slate-500" },
  safety: { label: "Safety", plural: "Safety points", icon: ShieldAlert, tone: "border-red-200 bg-red-50 text-red-800", dot: "bg-red-600" },
  quality: { label: "Quality check", plural: "Quality checks", icon: BadgeCheck, tone: "border-blue-200 bg-blue-50 text-blue-800", dot: "bg-blue-600" },
  tip: { label: "Tip", plural: "Tips", icon: Lightbulb, tone: "border-emerald-200 bg-emerald-50 text-emerald-800", dot: "bg-emerald-600" },
  problem: { label: "Problem", plural: "Problems", icon: AlertTriangle, tone: "border-amber-200 bg-amber-50 text-amber-900", dot: "bg-amber-500" },
  question: { label: "Open question", plural: "Open questions", icon: CircleHelp, tone: "border-violet-200 bg-violet-50 text-violet-800", dot: "bg-violet-500" },
}

export const STATUS_META: Record<CaptureStatus, { label: string; tone: string }> = {
  recording: { label: "Recording", tone: "border-red-200 bg-red-50 text-red-700" },
  handed_in: { label: "Handed in", tone: "border-amber-200 bg-amber-50 text-amber-800" },
  processing: { label: "Organizing", tone: "border-amber-200 bg-amber-50 text-amber-800" },
  ready: { label: "Ready", tone: "border-emerald-200 bg-emerald-50 text-emerald-800" },
  failed: { label: "Could not organize", tone: "border-red-200 bg-red-50 text-red-700" },
}

export function StatusPill({ status, className = "" }: { status: CaptureStatus; className?: string }) {
  const m = STATUS_META[status]
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium ${m.tone} ${className}`}>
      {status === "recording" && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-600" />}
      {m.label}
    </span>
  )
}

/** "12:34" or "1:02:03". */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const ss = String(s).padStart(2, "0")
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`
}

/** "0:42" for media durations. */
export function formatDuration(ms: number | undefined): string | null {
  if (!ms || ms <= 0) return null
  return formatClock(ms)
}

export function errorText(err: unknown, fallback = "That did not work. Try again."): string {
  // A ConvexError carries the server's plain-words message in .data; the
  // message itself is only "Server Error" outside dev.
  if (err instanceof ConvexError) {
    const data: unknown = err.data
    if (typeof data === "string" && data.trim()) return data.trim()
    if (data && typeof data === "object" && "message" in data && typeof data.message === "string" && data.message.trim()) {
      return data.message.trim()
    }
  }
  if (err instanceof Error) {
    if (/^\s*(\[[^\]]*\]\s*)?Server Error\s*$/i.test(err.message)) return fallback
    // Convex wraps server errors as "[CONVEX M(...)] Uncaught Error: <message> at ..."
    const m = /Uncaught (?:Convex)?Error: (.*?)(?:\n|\s+at\s|$)/s.exec(err.message)
    return (m?.[1] ?? err.message).trim() || fallback
  }
  return fallback
}

export function personInitials(name: string | undefined | null): string {
  if (!name) return "?"
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase())
    .slice(0, 2)
    .join("")
}

const AVATAR_TONES = [
  "bg-violet-100 text-violet-800",
  "bg-sky-100 text-sky-800",
  "bg-emerald-100 text-emerald-800",
  "bg-amber-100 text-amber-900",
  "bg-rose-100 text-rose-800",
  "bg-teal-100 text-teal-800",
  "bg-indigo-100 text-indigo-800",
  "bg-lime-100 text-lime-900",
]

/** A stable colour per person, so the same author reads the same everywhere. */
export function avatarTone(id: string): string {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0
  return AVATAR_TONES[Math.abs(h) % AVATAR_TONES.length]!
}

export function Avatar({
  id,
  name,
  size = "sm",
  title,
}: {
  id: string
  name: string | undefined | null
  size?: "sm" | "md"
  title?: string
}) {
  return (
    <span
      title={title ?? name ?? undefined}
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold ring-2 ring-background ${avatarTone(id)} ${
        size === "sm" ? "h-6 w-6 text-[10px]" : "h-8 w-8 text-xs"
      }`}
    >
      {personInitials(name)}
    </span>
  )
}

// ---- Upload ---------------------------------------------------------------

export async function uploadBlob(uploadUrl: string, blob: Blob): Promise<Id<"_storage">> {
  const res = await fetch(uploadUrl, {
    method: "POST",
    headers: { "Content-Type": blob.type || "application/octet-stream" },
    body: blob,
  })
  if (!res.ok) throw new Error("The file could not be uploaded. Check the connection and try again.")
  const { storageId } = (await res.json()) as { storageId: Id<"_storage"> }
  return storageId
}

const NOTICE_KEY = "oppr.capture.noticeSeen"

export function noticeSeen(): boolean {
  try {
    return window.localStorage.getItem(NOTICE_KEY) === "1"
  } catch {
    return false
  }
}

export function markNoticeSeen() {
  try {
    window.localStorage.setItem(NOTICE_KEY, "1")
  } catch {
    // ignore
  }
}
