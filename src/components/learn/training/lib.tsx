import { forwardRef, useCallback, useLayoutEffect, useRef, type TextareaHTMLAttributes } from "react"
import { Link, useLocation } from "wouter"
import { Footprints, GraduationCap } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"
import { Textarea } from "@/components/ui/textarea"
import { cn, isMobilePath } from "@/lib/utils"
import { formatDate, formatDateTime } from "@/lib/time"
import type { Id } from "../../../../convex/_generated/dataModel"
import { LEVEL_NAMES } from "@/lib/skillLevelNames"

export type TrainingKind = "course" | "round"

/** A message a person can act on, without request ids or stack noise. */
export function errorText(err: unknown, fallback = "Something went wrong. Try again."): string {
  const data = (err as { data?: unknown } | null)?.data
  if (typeof data === "string" && data.trim()) return data
  const raw = err instanceof Error ? err.message : String(err)
  const uncaught = raw.match(/Uncaught (?:Error|ConvexError): (.+?)(?:\n|\s+at |$)/)
  if (uncaught) return uncaught[1]
  if (/\[Request ID|Server Error/.test(raw)) return fallback
  return raw || fallback
}

export function fmtDate(at: number | null | undefined, long = false): string {
  if (at == null) return ""
  return formatDate(at, long)
}

export function fmtDateTime(at: number | null | undefined): string {
  if (at == null) return ""
  return formatDateTime(at)
}

export function daysAgo(at: number): string {
  const d = Math.floor((Date.now() - at) / 86_400_000)
  if (d <= 0) return "today"
  if (d === 1) return "yesterday"
  if (d < 60) return `${d} days ago`
  const m = Math.round(d / 30.4)
  if (m < 24) return `${m} months ago`
  return `${Math.round(d / 365)} years ago`
}

export const KIND_LABEL: Record<TrainingKind, string> = { course: "Training", round: "Round" }

export function KindIcon({ kind, className }: { kind: TrainingKind; className?: string }) {
  const Icon = kind === "round" ? Footprints : GraduationCap
  return <Icon className={className} />
}

export function KindBadge({ kind, className }: { kind: TrainingKind; className?: string }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "h-5 gap-1 px-1.5 text-xs font-medium",
        kind === "round"
          ? "border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-500/40 dark:bg-violet-500/10 dark:text-violet-300"
          : "border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-500/40 dark:bg-sky-500/10 dark:text-sky-300",
        className,
      )}
    >
      <KindIcon kind={kind} className="h-3 w-3" />
      {KIND_LABEL[kind]}
    </Badge>
  )
}

/**
 * The link to a cited passage. Inside the phone app (/m, also in the
 * embedded phone) it stays in the phone: /m/docs/:id. Elsewhere it opens the
 * desktop reader. The passage is highlighted with ?hl=.
 */
export function docHref(
  documentId: Id<"documents">,
  opts: { version?: number | null; quote?: string | null; mobile: boolean },
): string {
  const hl = opts.quote ? opts.quote.split(" | ")[0].slice(0, 80) : ""
  const params = new URLSearchParams()
  if (opts.version != null) params.set("v", String(opts.version))
  if (hl) params.set("hl", hl)
  const qs = params.toString()
  const base = opts.mobile ? `/m/docs/${documentId}` : `/docs/${documentId}`
  return qs ? `${base}?${qs}` : base
}

/** True inside the phone app (also inside the embedded phone preview). */
export function useIsFloor(): boolean {
  const [location] = useLocation()
  return isMobilePath(location)
}

/** docHref for the surface this component renders on. */
export function useDocHref() {
  const mobile = useIsFloor()
  return (documentId: Id<"documents">, version?: number | null, quote?: string | null) =>
    docHref(documentId, { version, quote, mobile })
}

/**
 * A cited source: the naming code, with the quoted passage on hover. Opens
 * the Document with the passage highlighted. On the phone it is a large tap
 * target that opens the phone reader.
 */
export function SourceChip({
  documentId,
  namingCode,
  version,
  section,
  quote,
  className,
}: {
  documentId: Id<"documents">
  namingCode: string
  version?: number | null
  section?: string | null
  quote: string | null
  className?: string
}) {
  const floor = useIsFloor()
  const href = docHref(documentId, { version, quote, mobile: floor })
  if (floor) {
    return (
      <Link
        href={href}
        data-source-chip
        className={cn(
          "inline-flex min-h-11 items-center gap-1 rounded-lg border bg-background px-3 font-mono text-[13px] text-foreground active:bg-muted",
          className,
        )}
      >
        {namingCode}
        {version != null && <span className="opacity-70">v{version}</span>}
      </Link>
    )
  }
  return (
    <HoverCard openDelay={150}>
      <HoverCardTrigger asChild>
        <Link
          href={href}
          data-source-chip
          className={cn(
            "inline-flex items-center rounded border bg-muted/60 px-1.5 py-0 align-baseline font-mono text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary print:border-0 print:bg-transparent print:p-0",
            className,
          )}
        >
          {namingCode}
          {version != null && <span className="ml-1">v{version}</span>}
        </Link>
      </HoverCardTrigger>
      <HoverCardContent className="w-80 space-y-1.5 text-xs" align="start">
        <span className="block font-mono text-xs text-muted-foreground">
          {namingCode}
          {version != null ? ` · v${version}` : ""}
          {section ? ` · ${section}` : ""}
        </span>
        <span className="block leading-relaxed">{quote ?? "The passage shows once you have answered."}</span>
        <span className="block text-xs text-primary">Click to open it in the document</span>
      </HoverCardContent>
    </HoverCard>
  )
}

/** Skill levels in the plant's words (Settings, People and roles); a live array. */
export const LEVEL_WORDS: Record<number, string> = LEVEL_NAMES

export function levelWords(level: number): string {
  return `level ${level} (${LEVEL_WORDS[level] ?? "level " + level})`
}

/** An AI or Engineer grade of an open answer, in plain words. */
export const VERDICT_WORDS = { good: "Good enough", partly: "Partly right", not_yet: "Not yet" } as const

/** Thin progress bar (there is no Progress primitive in the UI kit). */
export function ProgressBar({ value, className, tone = "primary" }: { value: number; className?: string; tone?: "primary" | "emerald" }) {
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-muted", className)}>
      <div
        className={cn("h-full rounded-full transition-all", tone === "emerald" ? "bg-emerald-500" : "bg-primary")}
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  )
}

export function ScoreBadge({ score, passed }: { score: number | null; passed: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-semibold tabular-nums",
        passed
          ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
          : "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300",
      )}
    >
      {score ?? 0}%
    </span>
  )
}

// ---- Taking a Training: shared shapes ------------------------------------------

export type Verdict = "good" | "partly" | "not_yet"

export interface Grade {
  verdict: Verdict
  score: number
  matched: string[]
  missing: string[]
  misconception?: string | null
  feedback: string
  gradedBy: "ai" | "engineer"
  gradedAt: number
  overriddenBy?: Id<"people"> | null
  overriddenByName?: string | null
}

/** Fields of a question beyond plain multiple choice (open, image, photo answers). */
export interface QuestionExtras {
  kind?: "choice" | "open" | null
  keyPoints?: string[] | null
  imageUrl?: string | null
  imageCaption?: string | null
  answerText?: string | null
  answerMode?: "typed" | "voice" | "photo" | null
  answerByPhoto?: boolean | null
  answerPhotoUrl?: string | null
  grade?: Grade | null
  gradeError?: string | null
  whyWrong?: string[] | null
  critical?: boolean | null
  source?: "model" | "fallback" | "bank" | null
}

export interface BreakdownStep {
  id: string
  step: string
  keyPoints: string[]
  keyPointKinds?: ("safety" | "quality" | "knack")[] | null
  reasons: string[]
  objectiveIds?: string[]
  citation?: {
    documentId: Id<"documents">
    namingCode: string
    version: number
    quote?: string | null
  } | null
  imageUrl?: string | null
}

export interface PersonRef {
  _id: Id<"people">
  name: string
  role?: string | null
  kind?: "operator" | "engineer" | "admin"
  level?: number | null
}

/** Fields of an Attempt beyond the first version of attempts.get. */
export interface AttemptExtras {
  presentSeenAt?: number | null
  missesReviewedAt?: number | null
  mustBeRightMissed?: string[] | null
  mustBeRightCount?: number | null
  breakdown?: BreakdownStep[] | null
  failStreak?: number | null
  attemptNumber?: number | null
  earlierFails?: number | null
  /** Not passed this many times in a row asks for a walk-through (Settings, Training). */
  walkthroughAfter?: number | null
  refresher?: boolean | null
  ppe?: string[] | null
  tryOutRequired?: boolean | null
  tryOutChecklist?: string[] | null
  tryOut?: {
    result: "passed" | "again"
    signedBy?: Id<"people"> | null
    signedByName?: string | null
    trainerLevel?: number | null
    at: number
    checked?: string[] | null
    note?: string | null
    items?: { label: string; result: "ok" | "coach"; note?: string | null }[] | null
    assetCode?: string | null
    assetName?: string | null
    photoUrl?: string | null
  } | null
  tryOutRequest?: {
    _id: Id<"tryOutRequests">
    status: "open" | "done" | "cancelled"
    trainerName?: string | null
    createdAt: number
    kind?: "tryout" | "walkthrough" | null
  } | null
  trainers?: PersonRef[] | null
  walkThroughWith?: string | null
  approvals?: { role: "author" | "reviewer" | "approver"; name: string | null; at: number }[] | null
  sources?: { documentId: Id<"documents">; namingCode: string; version: number; title?: string | null }[] | null
  objectivesFull?: { id: string; text: string; critical?: boolean | null }[] | null
}

/** Reads the newer Attempt fields without fighting the generated types. */
export function ext<T>(a: T): AttemptExtras {
  return a as unknown as AttemptExtras
}

export function qext<T>(q: T): QuestionExtras {
  return q as unknown as QuestionExtras
}

/** The kind of answer a question wants. */
export function answerKind(q: QuestionExtras): "choice" | "open" | "photo" {
  if (q.answerByPhoto) return "photo"
  return q.kind === "open" ? "open" : "choice"
}

/** Why the chosen wrong option is wrong. whyWrong skips the correct option. */
export function whyWrongFor(
  q: { options: string[]; correctIndex: number | null } & QuestionExtras,
  chosen: number | null,
): string | null {
  const list = q.whyWrong
  if (!list || chosen === null || q.correctIndex === null || chosen === q.correctIndex) return null
  if (list.length === q.options.length) return list[chosen] || null
  const i = chosen < q.correctIndex ? chosen : chosen - 1
  return list[i] || null
}

/** Uploads a blob to Convex storage and returns its id. */
export async function uploadBlob(getUrl: () => Promise<string>, blob: Blob): Promise<Id<"_storage">> {
  const url = await getUrl()
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": blob.type || "application/octet-stream" },
    body: blob,
  })
  if (!res.ok) throw new Error("The upload did not go through. Check the connection and try again.")
  const { storageId } = (await res.json()) as { storageId: Id<"_storage"> }
  return storageId
}

/** The plain-words pass rule: must-be-right first, then the pass mark. */
export function passRuleWords(passMark: number, mustBeRight: number): string {
  if (mustBeRight > 0)
    return `All ${mustBeRight} safety ${mustBeRight === 1 ? "question" : "questions"} right, and ${passMark}% overall.`
  return `${passMark}% of the questions right.`
}


/**
 * A textarea that grows with its text, so nothing in the builder is cut off
 * (answer options, reasons, key points). Starts at one line.
 */
export const GrowTextarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function GrowTextarea({ className, value, ...props }, ref) {
    const inner = useRef<HTMLTextAreaElement | null>(null)
    const setRefs = useCallback(
      (el: HTMLTextAreaElement | null) => {
        inner.current = el
        if (typeof ref === "function") ref(el)
        else if (ref) ref.current = el
      },
      [ref],
    )
    useLayoutEffect(() => {
      const el = inner.current
      if (!el) return
      el.style.height = "auto"
      el.style.height = `${el.scrollHeight + 2}px`
    }, [value])
    return (
      <Textarea
        ref={setRefs}
        rows={1}
        value={value}
        className={cn("min-h-9 resize-none overflow-hidden py-1.5 leading-snug", className)}
        {...props}
      />
    )
  },
)
