import { useState } from "react"
import { useMutation } from "convex/react"
import { toast } from "sonner"
import { CheckCircle2, Flag, Loader2, Lock, XCircle } from "lucide-react"
import { api } from "../../../../convex/_generated/api"
import type { Id } from "../../../../convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { errorText, SourceChip } from "./lib"

/** One question as attempts.get returns it. */
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
}

const LETTERS = ["A", "B", "C", "D", "E", "F"]

/**
 * A question to answer, then its feedback: right or wrong, why, and the
 * Published passage it comes from. "Unclear or wrong?" sends a flag to the
 * source Document's insights.
 */
export function QuestionCard({
  attemptId,
  personId,
  question: q,
  number,
  total,
  canAnswer,
  footer,
}: {
  attemptId: Id<"trainingAttempts">
  personId: Id<"people"> | null
  question: AttemptQuestion
  number: number
  total: number
  canAnswer: boolean
  footer?: React.ReactNode
}) {
  const answer = useMutation(api.attempts.answer)
  const [pending, setPending] = useState<number | null>(null)
  const answered = q.answerIndex !== null

  async function choose(i: number) {
    if (!personId || answered || pending !== null || !canAnswer || q.locked) return
    setPending(i)
    try {
      await answer({ id: attemptId, personId, questionId: q.id, answerIndex: i })
    } catch (err) {
      toast.error(errorText(err))
    } finally {
      setPending(null)
    }
  }

  return (
    <div className="space-y-4 rounded-lg border bg-card p-5">
      <div className="space-y-1">
        <p className="text-[11px] font-medium text-muted-foreground">
          Question {number} of {total}
          {q.objectiveText && <span className="font-normal"> · {q.objectiveText}</span>}
        </p>
        <p className="text-base font-medium leading-snug">{q.prompt}</p>
      </div>

      {q.locked && (
        <p className="flex items-center gap-1.5 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
          <Lock className="h-3.5 w-3.5" /> Scan this stop's Asset to open the question.
        </p>
      )}

      <div className="grid gap-2" role="radiogroup" aria-label={`Question ${number}`}>
        {q.options.map((opt, i) => {
          const isGiven = q.answerIndex === i
          const isRight = q.correctIndex === i
          return (
            <button
              key={i}
              type="button"
              role="radio"
              aria-checked={isGiven}
              disabled={answered || !canAnswer || q.locked || pending !== null}
              onClick={() => void choose(i)}
              className={cn(
                "flex items-start gap-3 rounded-md border px-3 py-2.5 text-left text-sm transition-colors",
                !answered && canAnswer && !q.locked && "hover:border-primary/60 hover:bg-primary/5",
                answered && isRight && "border-emerald-400 bg-emerald-50 dark:border-emerald-500/50 dark:bg-emerald-500/10",
                answered && isGiven && !isRight && "border-red-400 bg-red-50 dark:border-red-500/50 dark:bg-red-500/10",
                answered && !isGiven && !isRight && "opacity-60",
                pending === i && "border-primary",
              )}
            >
              <span
                className={cn(
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold",
                  answered && isRight && "border-emerald-500 bg-emerald-500 text-white",
                  answered && isGiven && !isRight && "border-red-500 bg-red-500 text-white",
                )}
              >
                {pending === i ? <Loader2 className="h-3 w-3 animate-spin" /> : LETTERS[i]}
              </span>
              <span className="min-w-0 flex-1">{opt}</span>
              {answered && isGiven && (
                <span className="shrink-0 text-[11px] font-medium text-muted-foreground">Your answer</span>
              )}
            </button>
          )
        })}
      </div>

      {answered && (
        <div
          className={cn(
            "space-y-2 rounded-md border px-3 py-2.5",
            q.correct
              ? "border-emerald-300 bg-emerald-50/60 dark:border-emerald-500/40 dark:bg-emerald-500/10"
              : "border-red-300 bg-red-50/60 dark:border-red-500/40 dark:bg-red-500/10",
          )}
          role="status"
        >
          <p className={cn("flex items-center gap-1.5 text-sm font-semibold", q.correct ? "text-emerald-700 dark:text-emerald-300" : "text-red-700 dark:text-red-300")}>
            {q.correct ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
            {q.correct ? "Correct" : "Not correct"}
          </p>
          {q.explanation && <p className="text-sm">{q.explanation}</p>}
          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <span className="shrink-0">Source:</span>
            <SourceChip
              documentId={q.citation.documentId}
              namingCode={q.citation.namingCode}
              version={q.citation.version}
              quote={q.citation.quote}
              className="mt-px shrink-0"
            />
            {q.citation.quote && <span className="italic">"{q.citation.quote}"</span>}
          </p>
          <FlagControl attemptId={attemptId} personId={personId} question={q} />
        </div>
      )}

      {footer}
    </div>
  )
}

function FlagControl({
  attemptId,
  personId,
  question: q,
}: {
  attemptId: Id<"trainingAttempts">
  personId: Id<"people"> | null
  question: AttemptQuestion
}) {
  const flag = useMutation(api.attempts.flag)
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState("")
  const [saving, setSaving] = useState(false)

  if (q.flag) {
    return (
      <p className="flex items-start gap-1.5 text-[11px] text-amber-700 dark:text-amber-300">
        <Flag className="mt-0.5 h-3 w-3 shrink-0" />
        You marked this unclear or wrong: "{q.flag}". The document owner sees it in its insights.
      </p>
    )
  }
  if (!personId) return null
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-amber-700 print:hidden"
      >
        <Flag className="h-3 w-3" /> Unclear or wrong?
      </button>
    )
  }
  return (
    <div className="space-y-1.5 print:hidden">
      <Textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        autoFocus
        placeholder="What is unclear or wrong? For example: the document at the machine says something else."
        className="resize-none bg-background text-xs"
      />
      <div className="flex gap-2">
        <Button
          size="sm"
          className="h-7 text-xs"
          disabled={saving}
          onClick={async () => {
            setSaving(true)
            try {
              await flag({ id: attemptId, personId, questionId: q.id, note })
              toast.success("Thanks. The document owner will see this.")
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
        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </div>
  )
}
