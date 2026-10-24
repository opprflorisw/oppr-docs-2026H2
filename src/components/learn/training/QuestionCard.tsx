import { useEffect, useRef, useState } from "react"
import { useMutation } from "convex/react"
import { toast } from "sonner"
import {
  Camera,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleDashed,
  Flag,
  Loader2,
  Lock,
  Mic,
  Square,
  X,
  XCircle,
  ZoomIn,
} from "lucide-react"
import { api } from "../../../../convex/_generated/api"
import type { Id } from "../../../../convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { useCheckIn } from "@/lib/checkIn"
import { cn } from "@/lib/utils"
import {
  answerKind,
  errorText,
  type Grade,
  SourceChip,
  uploadBlob,
  useIsFloor,
  VERDICT_WORDS,
  whyWrongFor,
} from "./lib"

export { answerKind, whyWrongFor }

/**
 * One question as attempts.get returns it. The fields after `locked` belong
 * to open, image and photo questions, and to why-wrong feedback; they are
 * optional so Attempts made before they existed keep working.
 */
export interface AttemptQuestion {
  id: string
  objectiveId: string
  objectiveText: string | null
  stopIndex: number | null
  prompt: string
  options: string[]
  answerIndex: number | null
  answeredAt: number | null
  flag: string | null
  correctIndex: number | null
  correct: boolean | null
  explanation: string | null
  citation: {
    documentId: Id<"documents">
    namingCode: string
    version: number
    chunkId: Id<"chunks"> | null
    quote: string | null
  }
  locked: boolean
  kind?: "choice" | "open" | null
  keyPoints?: string[] | null
  imageUrl?: string | null
  answerByPhoto?: boolean | null
  answerText?: string | null
  answerMode?: "typed" | "voice" | "photo" | null
  /** The photo or voice recording given as the answer. */
  answerUrl?: string | null
  grade?: Grade | null
  /** An open answer is being checked against the source. */
  grading?: boolean
  gradeError?: string | null
  whyWrong?: string[] | null
  critical?: boolean | null
}

export type AnswerKind = "choice" | "open" | "photo"

/** Answered means committed: a tap only selects, "Check answer" commits. */
export function isAnswered(q: Pick<AttemptQuestion, "answeredAt" | "answerIndex">): boolean {
  return q.answeredAt != null || q.answerIndex != null
}

/** Right for scoring: a correct choice, or an open answer graded "Good enough". */
export function isRight(q: AttemptQuestion): boolean | null {
  if (!isAnswered(q)) return null
  if (answerKind(q) === "choice") return q.correct
  if (!q.grade) return null
  return q.grade.verdict === "good"
}

export function notReady(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err)
  if (/Could not find public function/i.test(raw)) return "This is not available yet. Ask an Engineer."
  return errorText(err)
}

// ---- The answer being prepared ------------------------------------------------------

export interface DraftMedia {
  /** Absent in the builder's preview, where nothing is uploaded. */
  storageId?: Id<"_storage">
  url: string
  seconds?: number
}

/**
 * The builder's "Preview as trainee": the card answers locally, never calls
 * a mutation, and shows its own feedback from the question's data.
 */
export interface QuestionPreview {
  onAnswer: (answer: { index?: number; text?: string }) => void
}

/** An answer committed in the preview. */
export interface LocalAnswer {
  index?: number
  text?: string
  mode: "typed" | "voice" | "photo" | null
  mediaUrl?: string
}

export interface AnswerDraft {
  kind: AnswerKind
  answered: boolean
  choice: number | null
  setChoice: (i: number) => void
  text: string
  setText: (t: string) => void
  mode: "typed" | "voice"
  setMode: (m: "typed" | "voice") => void
  /** A photo (photo questions) or a voice recording (open questions). Optional for previews that take none. */
  media?: DraftMedia | null
  setMedia?: (m: DraftMedia | null) => void
  canCheck: boolean
  /** Why "Check answer" is not available yet, in plain words. */
  waitingFor: string | null
  checking: boolean
  check: () => Promise<boolean>
  /** Preview only: the answer committed locally. */
  committed?: LocalAnswer | null
}

/**
 * The state of one question's answer before it is committed. The page owns
 * it so the sticky action bar (phone) and the card share one "Check answer".
 */
export function useAnswerDraft(
  attemptId: Id<"trainingAttempts"> | null,
  personId: Id<"people"> | null,
  q: AttemptQuestion | null,
  canAnswer = true,
  preview?: QuestionPreview,
): AnswerDraft {
  const answer = useMutation(api.attempts.answer)
  const answerOpen = useMutation(api.attempts.answerOpen)
  const [choice, setChoice] = useState<number | null>(null)
  const [text, setText] = useState("")
  const [mode, setMode] = useState<"typed" | "voice">("typed")
  const [media, setMedia] = useState<DraftMedia | null>(null)
  const [checking, setChecking] = useState(false)
  const [committed, setCommitted] = useState<LocalAnswer | null>(null)
  const qid = q?.id ?? null
  // A new question starts with a clean answer.
  useEffect(() => {
    setChoice(null)
    setText("")
    setMode("typed")
    setMedia(null)
    setCommitted(null)
  }, [qid])

  const kind: AnswerKind = q ? answerKind(q) : "choice"
  const answered = preview ? committed !== null : q ? isAnswered(q) : false
  let waitingFor: string | null = null
  if (!q) waitingFor = "No question"
  else if (answered) waitingFor = null
  else if (!personId && !preview) waitingFor = "Check in first"
  else if (q.locked) waitingFor = "Scan this stop first"
  else if (kind === "choice" && choice === null) waitingFor = "Choose an answer first"
  else if (kind === "open" && !media && text.trim().length < 3) waitingFor = "Write or say your answer first"
  else if (kind === "photo" && !media) waitingFor = "Take the photo first"
  const canCheck = canAnswer && !answered && !checking && waitingFor === null

  async function check(): Promise<boolean> {
    if (!q || !canCheck) return false
    if (preview) {
      // Nothing is recorded: the card shows its own feedback.
      const local: LocalAnswer =
        kind === "choice"
          ? { index: choice!, mode: null }
          : kind === "photo"
            ? { mode: "photo", mediaUrl: media?.url }
            : media
              ? { mode: "voice", mediaUrl: media.url }
              : { text: text.trim(), mode: "typed" }
      setCommitted(local)
      preview.onAnswer({ index: local.index, text: local.text })
      return true
    }
    if (!personId || !attemptId) return false
    setChecking(true)
    try {
      if (kind === "choice") {
        await answer({ id: attemptId, personId, questionId: q.id, answerIndex: choice! })
      } else if (kind === "open" && media?.storageId) {
        await answerOpen({ id: attemptId, personId, questionId: q.id, mode: "voice", storageId: media.storageId })
      } else if (kind === "open") {
        await answerOpen({ id: attemptId, personId, questionId: q.id, mode: "typed", text: text.trim() })
      } else if (media?.storageId) {
        await answerOpen({ id: attemptId, personId, questionId: q.id, mode: "photo", storageId: media.storageId })
      } else {
        return false
      }
      return true
    } catch (err) {
      toast.error(notReady(err))
      return false
    } finally {
      setChecking(false)
    }
  }

  return {
    kind,
    answered,
    choice,
    setChoice,
    text,
    setText,
    mode,
    setMode,
    media,
    setMedia,
    canCheck,
    waitingFor,
    checking,
    check,
    committed,
  }
}

const LETTERS = ["A", "B", "C", "D", "E", "F"]

/**
 * A question to answer, then its feedback. The Learning objective stays
 * hidden until the answer is checked (it would give the answer away). A tap
 * selects an option; "Check answer" commits it. The feedback says why a
 * wrong choice is wrong, gives the right answer, what this checked, and the
 * Published passage it comes from. "Unclear or wrong?" works before and
 * after answering.
 *
 * Without `draft`, the card keeps its own and shows its own "Check answer"
 * (desktop). The phone passes the page's draft and shows the button in its
 * sticky action bar (`hideCheck`).
 *
 * With `preview` (the builder's "Preview as trainee") nothing is recorded:
 * the card never calls a mutation, answers locally and shows feedback from
 * the question's own data (right option, key points, explanation).
 */
export function QuestionCard({
  attemptId,
  personId,
  question,
  number,
  total,
  canAnswer,
  footer,
  draft: external,
  hideCheck = false,
  stickyPrompt = false,
  feedbackRef,
  review = false,
  preview,
}: {
  /** Null in the builder's preview, where there is no Attempt. */
  attemptId: Id<"trainingAttempts"> | null
  personId: Id<"people"> | null
  question: AttemptQuestion
  number: number
  total: number
  canAnswer: boolean
  footer?: React.ReactNode
  draft?: AnswerDraft
  hideCheck?: boolean
  /** Phone Attempt: once answered, the question text sticks under the header. */
  stickyPrompt?: boolean
  feedbackRef?: React.Ref<HTMLDivElement>
  /** Read-only review of a finished Attempt. */
  review?: boolean
  /** Preview as trainee: answer locally, never record. */
  preview?: QuestionPreview
}) {
  const own = useAnswerDraft(attemptId, personId, external && !preview ? null : question, canAnswer, preview)
  const draft = preview ? own : external ?? own
  const q = preview ? withLocalAnswer(question, draft.committed ?? null) : question
  const floor = useIsFloor()
  const answered = isAnswered(q)
  const kind = answerKind(q)
  const interactive = canAnswer && !answered && !q.locked && !review

  return (
    <div className={cn("space-y-4 rounded-xl border bg-card", floor ? "p-4" : "p-5")}>
      <div
        data-question-prompt
        className={cn(
          "space-y-1.5",
          stickyPrompt &&
            answered &&
            "sticky top-[var(--proof-header-h,61px)] z-10 -mx-4 -mt-4 rounded-t-xl border-b bg-card px-4 pb-3 pt-4",
        )}
      >
        <p className={cn("font-medium text-muted-foreground", floor ? "text-[13px]" : "text-xs")}>
          Question {number} of {total}
          {kind === "open" && " · in your own words"}
          {kind === "photo" && " · answer with a photo"}
        </p>
        <p className={cn("font-semibold leading-snug", floor ? "text-lg" : "text-base")}>{q.prompt}</p>
      </div>

      {q.imageUrl && <QuestionImage url={q.imageUrl} floor={floor} />}

      {q.locked && (
        <p className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2.5 text-sm text-muted-foreground">
          <Lock className="h-4 w-4" /> Scan this stop's Asset to open the question.
        </p>
      )}

      {kind === "choice" && <ChoiceOptions q={q} draft={draft} interactive={interactive} floor={floor} number={number} />}
      {kind === "open" && (
        <OpenAnswer q={q} draft={draft} interactive={interactive} floor={floor} local={!!preview} />
      )}
      {kind === "photo" && <PhotoAnswer q={q} draft={draft} interactive={interactive} floor={floor} local={!!preview} />}

      {interactive && !hideCheck && (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            className={cn("gap-1.5", floor ? "h-12 w-full rounded-xl text-base" : "h-10")}
            disabled={!draft.canCheck}
            onClick={() => void draft.check()}
          >
            {draft.checking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Check answer
          </Button>
          {draft.waitingFor && <span className="text-xs text-muted-foreground">{draft.waitingFor}</span>}
        </div>
      )}

      {answered &&
        (preview && kind !== "choice" && !q.grade ? (
          <PreviewCheckNote q={q} floor={floor} />
        ) : (
          <Feedback q={q} floor={floor} innerRef={feedbackRef} attemptId={attemptId ?? undefined} />
        ))}

      {!review && !preview && attemptId && (
        <FlagControl attemptId={attemptId} personId={personId} question={q} floor={floor} />
      )}

      {footer}
    </div>
  )
}

// ---- Multiple choice -----------------------------------------------------------------

function ChoiceOptions({
  q,
  draft,
  interactive,
  floor,
  number,
}: {
  q: AttemptQuestion
  draft: AnswerDraft
  interactive: boolean
  floor: boolean
  number: number
}) {
  const answered = isAnswered(q)
  const selected = answered ? q.answerIndex : draft.choice
  return (
    <div className="grid gap-3" role="radiogroup" aria-label={`Question ${number}`}>
      {q.options.map((opt, i) => {
        const isGiven = selected === i
        const isRightOption = answered && q.correctIndex === i
        const wrongGiven = answered && isGiven && !isRightOption
        return (
          <button
            key={i}
            type="button"
            role="radio"
            aria-checked={isGiven}
            data-answer-option
            disabled={!interactive}
            onClick={() => interactive && draft.setChoice(i)}
            className={cn(
              "flex min-h-14 items-center gap-3 rounded-xl border-2 px-3.5 py-3 text-left transition-colors",
              floor ? "text-base" : "text-sm",
              interactive &&
                "active:scale-[0.99] [@media(hover:hover)]:hover:border-primary/60 [@media(hover:hover)]:hover:bg-primary/5",
              !answered && isGiven && "border-primary bg-primary/10",
              !answered && !isGiven && "border-border",
              isRightOption && "border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10",
              wrongGiven && "border-red-500 bg-red-50 dark:bg-red-500/10",
              answered && !isGiven && !isRightOption && "border-border opacity-60",
              !interactive && "cursor-default",
            )}
          >
            <span
              aria-hidden
              className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-xs font-semibold",
                !answered && isGiven && "border-primary bg-primary text-primary-foreground",
                isRightOption && "border-emerald-500 bg-emerald-500 text-white",
                wrongGiven && "border-red-500 bg-red-500 text-white",
              )}
            >
              {isRightOption ? <Check className="h-4 w-4" /> : wrongGiven ? <X className="h-4 w-4" /> : LETTERS[i]}
            </span>
            <span className="min-w-0 flex-1">
              {opt}
              {answered && isGiven && <span className="mt-0.5 block text-xs font-medium text-muted-foreground">Your answer</span>}
            </span>
          </button>
        )
      })}
    </div>
  )
}

// ---- Open answer: typed or spoken ------------------------------------------------------

function OpenAnswer({
  q,
  draft,
  interactive,
  floor,
  local = false,
}: {
  q: AttemptQuestion
  draft: AnswerDraft
  interactive: boolean
  floor: boolean
  /** Preview: a recording stays in the browser. */
  local?: boolean
}) {
  if (isAnswered(q)) {
    const voice = q.answerMode === "voice"
    return (
      <div className="space-y-2 rounded-lg border bg-muted/40 px-3.5 py-3">
        <p className="text-xs font-medium text-muted-foreground">{voice ? "Your spoken answer" : "Your answer"}</p>
        {voice && q.answerUrl && <audio controls src={q.answerUrl} className="h-10 w-full" />}
        {q.answerText ? (
          <p className={cn("whitespace-pre-wrap leading-relaxed", floor ? "text-base" : "text-sm")}>{q.answerText}</p>
        ) : (
          <p className="text-sm text-muted-foreground">{voice ? "Being written down." : "No answer"}</p>
        )}
      </div>
    )
  }
  if (!interactive) return null
  if (draft.media) {
    return (
      <div className="space-y-2 rounded-lg border bg-muted/40 p-3" data-voice-answer>
        <p className={cn("font-medium", floor ? "text-base" : "text-sm")}>
          Your spoken answer{draft.media.seconds ? `, ${draft.media.seconds}s` : ""}
        </p>
        <audio controls src={draft.media.url} className="h-10 w-full" />
        <p className="text-xs text-muted-foreground">
          {local
            ? "In the preview a recording stays in this browser."
            : "It is written down and checked after you press Check answer."}
        </p>
        <Button
          variant="outline"
          className={cn("w-full", floor ? "h-12 rounded-xl text-base" : "h-10")}
          onClick={() => draft.setMedia?.(null)}
        >
          Record again or type instead
        </Button>
      </div>
    )
  }
  return (
    <div className="space-y-3">
      <Textarea
        value={draft.text}
        onChange={(e) => draft.setText(e.target.value)}
        rows={floor ? 6 : 5}
        placeholder="Say it the way you would explain it to a new colleague."
        aria-label="Your answer"
        className={cn("min-h-[140px] resize-y bg-background leading-relaxed", floor ? "text-base" : "text-sm")}
      />
      {!draft.text.trim() && draft.setMedia && (
        <HoldToTalk floor={floor} local={local} onRecorded={(m) => draft.setMedia?.(m)} />
      )}
    </div>
  )
}

/**
 * Hold to talk: records a voice note with MediaRecorder while the button is
 * held (or while Space or Enter is held). The recording is the answer: it is
 * written down and checked after "Check answer".
 */
function HoldToTalk({
  floor,
  onRecorded,
  local = false,
}: {
  floor: boolean
  onRecorded: (m: DraftMedia) => void
  /** Preview: keep the recording in the browser, never upload it. */
  local?: boolean
}) {
  const uploadUrl = useMutation(api.files.generateUploadUrl)
  const [state, setState] = useState<"idle" | "starting" | "recording" | "saving">("idle")
  const [secs, setSecs] = useState(0)
  const [problem, setProblem] = useState<string | null>(null)
  const rec = useRef<MediaRecorder | null>(null)
  const chunks = useRef<Blob[]>([])
  const startedAt = useRef(0)
  const stopWanted = useRef(false)
  const supported = typeof window !== "undefined" && "MediaRecorder" in window && !!navigator.mediaDevices?.getUserMedia

  useEffect(() => {
    if (state !== "recording") return
    const t = setInterval(() => setSecs(Math.floor((Date.now() - startedAt.current) / 1000)), 250)
    return () => clearInterval(t)
  }, [state])
  useEffect(() => () => rec.current?.stream.getTracks().forEach((t) => t.stop()), [])

  async function begin() {
    if (state !== "idle" || !supported) return
    setProblem(null)
    stopWanted.current = false
    setState("starting")
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const r = new MediaRecorder(stream)
      chunks.current = []
      r.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.current.push(e.data)
      }
      r.onstop = () => {
        stream.getTracks().forEach((t) => t.stop())
        void save(new Blob(chunks.current, { type: r.mimeType || "audio/webm" }))
      }
      rec.current = r
      startedAt.current = Date.now()
      setSecs(0)
      r.start()
      setState("recording")
      // Let go before the microphone was ready: stop right away.
      if (stopWanted.current) end()
    } catch {
      setState("idle")
      setProblem("The microphone is not available. Allow it in the browser, or type your answer.")
    }
  }

  function end() {
    stopWanted.current = true
    if (rec.current && rec.current.state === "recording") rec.current.stop()
  }

  async function save(blob: Blob) {
    const ms = Date.now() - startedAt.current
    if (ms < 700 || blob.size < 200) {
      setState("idle")
      setProblem("Too short. Hold the button while you speak.")
      return
    }
    if (local) {
      onRecorded({ url: URL.createObjectURL(blob), seconds: Math.round(ms / 1000) })
      setState("idle")
      return
    }
    setState("saving")
    try {
      const storageId = await uploadBlob(() => uploadUrl(), blob)
      onRecorded({ storageId, url: URL.createObjectURL(blob), seconds: Math.round(ms / 1000) })
    } catch (err) {
      setProblem(errorText(err))
    } finally {
      setState("idle")
    }
  }

  if (!supported) {
    return <p className="text-xs text-muted-foreground">Speaking an answer does not work in this browser. Type it instead.</p>
  }
  const recording = state === "recording"
  return (
    <div className="space-y-1.5">
      <button
        type="button"
        data-hold-to-talk
        onPointerDown={(e) => {
          e.preventDefault()
          e.currentTarget.setPointerCapture?.(e.pointerId)
          void begin()
        }}
        onPointerUp={() => end()}
        onPointerCancel={() => end()}
        onKeyDown={(e) => {
          if ((e.key === " " || e.key === "Enter") && !e.repeat) {
            e.preventDefault()
            void begin()
          }
        }}
        onKeyUp={(e) => {
          if (e.key === " " || e.key === "Enter") end()
        }}
        onContextMenu={(e) => e.preventDefault()}
        disabled={state === "saving"}
        aria-pressed={recording}
        className={cn(
          "flex w-full touch-none select-none items-center justify-center gap-2 rounded-xl border-2 font-medium transition-colors",
          floor ? "h-14 text-base" : "h-12 text-sm",
          recording
            ? "border-red-500 bg-red-500 text-white"
            : "border-primary/40 bg-primary/5 text-foreground [@media(hover:hover)]:hover:bg-primary/10",
        )}
      >
        {state === "saving" ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin" /> Saving your recording
          </>
        ) : recording ? (
          <>
            <Square className="h-4 w-4 fill-current" /> Recording {secs}s, let go to stop
          </>
        ) : (
          <>
            <Mic className="h-5 w-5" /> Hold to talk
          </>
        )}
      </button>
      {problem && <p className="text-sm text-amber-700 dark:text-amber-300">{problem}</p>}
    </div>
  )
}

// ---- Photo answer ------------------------------------------------------------------

function PhotoAnswer({
  q,
  draft,
  interactive,
  floor,
  local = false,
}: {
  q: AttemptQuestion
  draft: AnswerDraft
  interactive: boolean
  floor: boolean
  /** Preview: show the photo, never upload it. */
  local?: boolean
}) {
  const uploadUrl = useMutation(api.files.generateUploadUrl)
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  async function upload(file: File) {
    if (local) {
      draft.setMedia?.({ url: URL.createObjectURL(file) })
      return
    }
    setUploading(true)
    try {
      const storageId = await uploadBlob(() => uploadUrl(), file)
      draft.setMedia?.({ storageId, url: URL.createObjectURL(file) })
    } catch (err) {
      toast.error(errorText(err))
    } finally {
      setUploading(false)
    }
  }

  if (isAnswered(q)) {
    return q.answerUrl ? (
      <img src={q.answerUrl} alt="Your photo answer" className="max-h-72 w-full rounded-lg border object-contain" />
    ) : (
      <p className="text-sm text-muted-foreground">Your photo is kept with the record.</p>
    )
  }
  if (!interactive) return null
  return (
    <div className="space-y-2">
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        data-photo-answer-input
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void upload(f)
          e.target.value = ""
        }}
      />
      {draft.media && <img src={draft.media.url} alt="Your photo" className="max-h-72 w-full rounded-lg border object-contain" />}
      <Button
        variant={draft.media ? "outline" : "default"}
        className={cn("w-full gap-2", floor ? "h-14 rounded-xl text-base" : "h-11")}
        disabled={uploading}
        onClick={() => fileRef.current?.click()}
      >
        {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Camera className="h-5 w-5" />}
        {draft.media ? "Take it again" : "Take the photo"}
      </Button>
    </div>
  )
}

// ---- Image ---------------------------------------------------------------------------

/** A picture from the source document or Asset, large, with tap to zoom. */
export function QuestionImage({ url, floor }: { url: string; floor: boolean }) {
  const [zoom, setZoom] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setZoom(true)}
        className="relative block w-full overflow-hidden rounded-lg border bg-muted/30"
        aria-label="Zoom in on the picture"
        data-question-image
      >
        <img src={url} alt="Picture for this question" className={cn("w-full object-contain", floor ? "max-h-80" : "max-h-96")} />
        <span className="absolute bottom-2 right-2 flex items-center gap-1 rounded-full bg-black/60 px-2.5 py-1 text-xs font-medium text-white">
          <ZoomIn className="h-3.5 w-3.5" /> Tap to zoom
        </span>
      </button>
      <Dialog open={zoom} onOpenChange={setZoom}>
        <DialogContent className="max-h-[95vh] max-w-[95vw] overflow-auto p-2 sm:max-w-4xl">
          <DialogTitle className="sr-only">Picture for this question</DialogTitle>
          <img src={url} alt="Picture for this question, zoomed in" className="h-auto w-full object-contain" />
        </DialogContent>
      </Dialog>
    </>
  )
}

// ---- Feedback ------------------------------------------------------------------------

/** An open or photo answer waiting for its grade, or one that could not be graded. */
function Grading({
  q,
  attemptId,
  innerRef,
}: {
  q: AttemptQuestion
  attemptId?: Id<"trainingAttempts">
  innerRef?: React.Ref<HTMLDivElement>
}) {
  const { person } = useCheckIn()
  const retry = useMutation(api.attempts.retryGrade)
  const [busy, setBusy] = useState(false)
  if (q.gradeError) {
    return (
      <div
        ref={innerRef}
        role="status"
        data-feedback
        className="space-y-2 rounded-lg border border-amber-300 bg-amber-50/70 px-3.5 py-3 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100"
      >
        <p>Your answer could not be checked automatically. A trainer checks it and the result shows here.</p>
        {person && attemptId && (
          <Button
            variant="outline"
            className="h-11 bg-background"
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              try {
                await retry({ id: attemptId, personId: person._id, questionId: q.id })
              } catch (err) {
                toast.error(errorText(err))
              } finally {
                setBusy(false)
              }
            }}
          >
            {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Try checking again
          </Button>
        )}
      </div>
    )
  }
  return (
    <div ref={innerRef} role="status" data-feedback className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3.5 py-3 text-sm">
      <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
      Checking your answer against the source. You can go on: the result shows here when it is ready.
    </div>
  )
}


const VERDICT_TONE = {
  good: "border-emerald-300 bg-emerald-50/70 text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-200",
  partly: "border-amber-300 bg-amber-50/70 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100",
  not_yet: "border-red-300 bg-red-50/70 text-red-800 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200",
} as const

export function Feedback({
  q,
  floor,
  innerRef,
  sourceOpen = false,
  attemptId,
}: {
  q: AttemptQuestion
  attemptId?: Id<"trainingAttempts">
  floor: boolean
  innerRef?: React.Ref<HTMLDivElement>
  sourceOpen?: boolean
}) {
  const kind = answerKind(q)
  const body = floor ? "text-base" : "text-sm"

  if (kind !== "choice" && !q.grade) {
    return <Grading q={q} attemptId={attemptId} innerRef={innerRef} />
  }

  let head: React.ReactNode
  let tone: string
  if (kind === "choice") {
    const ok = q.correct === true
    tone = ok ? VERDICT_TONE.good : VERDICT_TONE.not_yet
    const why = whyWrongFor(q, q.answerIndex)
    head = (
      <>
        <p className={cn("flex items-center gap-2 font-semibold", floor ? "text-base" : "text-sm")}>
          {ok ? <CheckCircle2 className="h-5 w-5" /> : <XCircle className="h-5 w-5" />}
          {ok ? "Correct." : "Not correct."}
        </p>
        {!ok && why && <p className={cn("text-foreground", body)}>{why}</p>}
        {!ok && q.correctIndex != null && (
          <p className={cn("text-foreground", body)}>
            <span className="font-medium">The right answer: </span>
            {q.options[q.correctIndex]}
          </p>
        )}
        {q.explanation && <p className={cn("text-foreground", body)}>{q.explanation}</p>}
      </>
    )
  } else {
    const g = q.grade!
    tone = VERDICT_TONE[g.verdict]
    head = (
      <>
        <p className={cn("flex items-center gap-2 font-semibold", floor ? "text-base" : "text-sm")}>
          {g.verdict === "good" ? (
            <CheckCircle2 className="h-5 w-5" />
          ) : g.verdict === "partly" ? (
            <CircleDashed className="h-5 w-5" />
          ) : (
            <XCircle className="h-5 w-5" />
          )}
          {VERDICT_WORDS[g.verdict]}
          {g.gradedBy === "engineer" && <span className="text-xs font-normal opacity-80">(checked by an Engineer)</span>}
        </p>
        {g.feedback && <p className={cn("text-foreground", body)}>{g.feedback}</p>}
        {(g.matched.length > 0 || g.missing.length > 0) && (
          <ul className={cn("space-y-1 text-foreground", floor ? "text-[15px]" : "text-sm")}>
            {g.matched.map((k, i) => (
              <li key={`m${i}`} className="flex items-start gap-2">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                <span>{k}</span>
              </li>
            ))}
            {g.missing.map((k, i) => (
              <li key={`x${i}`} className="flex items-start gap-2">
                <X className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                <span>
                  <span className="font-medium">Missing: </span>
                  {k}
                </span>
              </li>
            ))}
          </ul>
        )}
        {g.misconception && (
          <p className={cn("rounded-md bg-background/70 px-2.5 py-2 text-foreground", floor ? "text-[15px]" : "text-sm")}>
            <span className="font-medium">Watch out: </span>
            {g.misconception}
          </p>
        )}
      </>
    )
  }

  return (
    <div ref={innerRef} role="status" data-feedback className={cn("scroll-mb-24 scroll-mt-20 space-y-2.5 rounded-lg border px-3.5 py-3 animate-in fade-in-0", tone)}>
      {head}
      {q.objectiveText && (
        <p className={cn("text-muted-foreground", floor ? "text-sm" : "text-xs")}>
          <span className="font-medium">This checked: </span>
          {q.objectiveText}
        </p>
      )}
      <SourceBlock q={q} floor={floor} defaultOpen={sourceOpen} />
    </div>
  )
}

function SourceBlock({ q, floor, defaultOpen }: { q: AttemptQuestion; floor: boolean; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="rounded-md bg-background/70 print:bg-transparent">
      <button
        type="button"
        onClick={() => setOpen((x) => !x)}
        aria-expanded={open}
        className={cn(
          "flex w-full items-center gap-1.5 px-2.5 text-left font-medium text-muted-foreground print:hidden",
          floor ? "min-h-11 text-sm" : "min-h-9 text-xs",
        )}
      >
        <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
        Source: {q.citation.namingCode} v{q.citation.version}
      </button>
      <div className={cn("space-y-2 px-2.5 pb-2.5", !open && "hidden print:block")}>
        {q.citation.quote && (
          <p className={cn("italic leading-relaxed text-foreground/85", floor ? "text-[15px]" : "text-xs")}>"{q.citation.quote}"</p>
        )}
        <SourceChip
          documentId={q.citation.documentId}
          namingCode={q.citation.namingCode}
          version={q.citation.version}
          quote={q.citation.quote}
        />
      </div>
    </div>
  )
}

// ---- Preview as trainee ----------------------------------------------------------------

/** The question as it looks after a local answer in the preview (nothing recorded). */
function withLocalAnswer(q: AttemptQuestion, a: LocalAnswer | null): AttemptQuestion {
  const open: AttemptQuestion = {
    ...q,
    answerIndex: null,
    answeredAt: null,
    correct: null,
    answerText: null,
    answerMode: null,
    answerUrl: null,
    grade: null,
    grading: false,
    gradeError: null,
    locked: false,
  }
  if (!a) return open
  const kind = answerKind(q)
  return {
    ...open,
    answeredAt: Date.now(),
    answerIndex: kind === "choice" ? a.index ?? null : null,
    correct: kind === "choice" ? a.index === q.correctIndex : null,
    answerText: a.text ?? null,
    answerMode: a.mode,
    answerUrl: a.mediaUrl ?? null,
    grade: kind === "open" && a.mode === "typed" ? previewGrade(a.text ?? "", q.keyPoints ?? []) : null,
  }
}

/** A rough grade by word match, clearly labelled as a preview. */
function previewGrade(text: string, keyPoints: string[]): Grade {
  const words = (s: string) =>
    new Set(
      s
        .toLowerCase()
        .split(/[^a-z0-9°%.]+/)
        .filter((w) => w.length > 3),
    )
  const answer = words(text)
  const matched: string[] = []
  const missing: string[] = []
  for (const k of keyPoints) {
    const kw = [...words(k)]
    const hit = kw.length > 0 && kw.filter((w) => answer.has(w)).length / kw.length >= 0.5
    if (hit) matched.push(k)
    else missing.push(k)
  }
  const score = keyPoints.length > 0 ? Math.round((matched.length / keyPoints.length) * 100) : 0
  return {
    verdict: score >= 80 ? "good" : score >= 40 ? "partly" : "not_yet",
    score,
    matched,
    missing,
    feedback:
      "Preview grade by word match. In a real Attempt the AI grades the answer against the key points and the cited passage.",
    gradedBy: "ai",
    gradedAt: Date.now(),
  }
}

/** Preview of a spoken or photo answer: what a real Attempt checks it against. */
function PreviewCheckNote({ q, floor }: { q: AttemptQuestion; floor: boolean }) {
  const photo = q.answerMode === "photo"
  const keyPoints = q.keyPoints ?? []
  return (
    <div role="status" data-feedback className="space-y-2.5 rounded-lg border bg-muted/40 px-3.5 py-3">
      <p className={cn("text-foreground", floor ? "text-base" : "text-sm")}>
        {photo
          ? "In a real Attempt the photo is checked against these key points. When that is unclear, a trainer looks at it."
          : "In a real Attempt the recording is written down and checked against these key points."}
      </p>
      {keyPoints.length > 0 && (
        <ul className={cn("space-y-1 text-foreground", floor ? "text-[15px]" : "text-sm")}>
          {keyPoints.map((k, i) => (
            <li key={i} className="flex items-start gap-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <span>{k}</span>
            </li>
          ))}
        </ul>
      )}
      {q.objectiveText && (
        <p className={cn("text-muted-foreground", floor ? "text-sm" : "text-xs")}>
          <span className="font-medium">This checked: </span>
          {q.objectiveText}
        </p>
      )}
      <SourceBlock q={q} floor={floor} defaultOpen={false} />
    </div>
  )
}

// ---- Unclear or wrong? -----------------------------------------------------------------

export function FlagControl({
  attemptId,
  personId,
  question: q,
  floor,
}: {
  attemptId: Id<"trainingAttempts">
  personId: Id<"people"> | null
  question: AttemptQuestion
  floor: boolean
}) {
  const flag = useMutation(api.attempts.flag)
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState("")
  const [saving, setSaving] = useState(false)

  if (q.flag) {
    return (
      <p className="flex items-start gap-1.5 text-sm text-amber-700 dark:text-amber-300">
        <Flag className="mt-0.5 h-4 w-4 shrink-0" />
        You marked this unclear or wrong: "{q.flag}". The Training owner and the document owner see it.
      </p>
    )
  }
  if (!personId) return null
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="-ml-2 flex min-h-11 items-center gap-1.5 rounded-md px-2 text-sm text-muted-foreground [@media(hover:hover)]:hover:text-amber-700 print:hidden"
      >
        <Flag className="h-4 w-4" /> Unclear or wrong?
      </button>
    )
  }
  return (
    <div className="space-y-2 print:hidden">
      <Textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        autoFocus
        placeholder="What is unclear or wrong? For example: the machine shows something else."
        className={cn("resize-none bg-background", floor ? "text-base" : "text-sm")}
      />
      <div className="flex gap-2">
        <Button
          className="h-11 px-4 text-sm"
          disabled={saving}
          onClick={async () => {
            setSaving(true)
            try {
              await flag({ id: attemptId, personId, questionId: q.id, note })
              toast.success("Thanks. The Training owner will see this.")
              setOpen(false)
            } catch (err) {
              toast.error(errorText(err))
            } finally {
              setSaving(false)
            }
          }}
        >
          Send
        </Button>
        <Button variant="ghost" className="h-11 px-4 text-sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </div>
  )
}
