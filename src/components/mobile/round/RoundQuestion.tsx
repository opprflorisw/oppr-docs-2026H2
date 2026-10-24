import { useState } from "react"
import { useMutation } from "convex/react"
import { toast } from "sonner"
import { ArrowRight, CheckCircle2, Flag, Loader2, XCircle } from "lucide-react"
import { api } from "../../../../convex/_generated/api"
import type { Id } from "../../../../convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import type { AttemptQuestion } from "@/components/learn/training/QuestionCard"
import { errorText } from "@/components/learn/training/lib"
import { cn } from "@/lib/utils"

const LETTERS = ["A", "B", "C", "D", "E", "F"]

/**
 * One Round question on the phone: tap an option, see right or wrong at once
 * with the Published passage it comes from, then move on.
 */
export function RoundQuestion({
  attemptId,
  personId,
  question: q,
  number,
  total,
  nextLabel,
  onNext,
}: {
  attemptId: Id<"trainingAttempts">
  personId: Id<"people">
  question: AttemptQuestion
  number: number
  total: number
  nextLabel: string
  onNext: () => void
}) {
  const answer = useMutation(api.attempts.answer)
  const [pending, setPending] = useState<number | null>(null)
  const answered = q.answerIndex !== null

  async function choose(i: number) {
    if (answered || pending !== null) return
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
    <div className="flex flex-col gap-3">
      <div className="space-y-1">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Question {number} of {total}
        </p>
        <p className="text-[15px] font-semibold leading-snug">{q.prompt}</p>
      </div>

      <div className="flex flex-col gap-2" role="radiogroup" aria-label={`Question ${number}`}>
        {q.options.map((opt, i) => {
          const given = q.answerIndex === i
          const right = q.correctIndex === i
          return (
            <button
              key={i}
              type="button"
              role="radio"
              aria-checked={given}
              disabled={answered || pending !== null}
              onClick={() => void choose(i)}
              className={cn(
                "flex items-start gap-2.5 rounded-xl border bg-card px-3 py-2.5 text-left text-[13px] leading-snug transition active:scale-[0.99]",
                !answered && "hover:border-primary/60",
                answered && right && "border-emerald-400 bg-emerald-50 dark:border-emerald-500/50 dark:bg-emerald-500/10",
                answered && given && !right && "border-red-400 bg-red-50 dark:border-red-500/50 dark:bg-red-500/10",
                answered && !given && !right && "opacity-55",
                pending === i && "border-primary",
              )}
            >
              <span
                className={cn(
                  "mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold",
                  answered && right && "border-emerald-500 bg-emerald-500 text-white",
                  answered && given && !right && "border-red-500 bg-red-500 text-white",
                )}
              >
                {pending === i ? <Loader2 className="h-3 w-3 animate-spin" /> : LETTERS[i]}
              </span>
              <span className="min-w-0 flex-1">{opt}</span>
            </button>
          )
        })}
      </div>

      {answered && (
        <div
          role="status"
          className={cn(
            "space-y-2 rounded-xl border px-3 py-2.5 animate-in fade-in-0 slide-in-from-bottom-1",
            q.correct
              ? "border-emerald-300 bg-emerald-50/70 dark:border-emerald-500/40 dark:bg-emerald-500/10"
              : "border-red-300 bg-red-50/70 dark:border-red-500/40 dark:bg-red-500/10",
          )}
        >
          <p
            className={cn(
              "flex items-center gap-1.5 text-[13px] font-semibold",
              q.correct ? "text-emerald-700 dark:text-emerald-300" : "text-red-700 dark:text-red-300",
            )}
          >
            {q.correct ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
            {q.correct ? "Correct" : "Not correct"}
          </p>
          {q.explanation && <p className="text-[12px] leading-relaxed">{q.explanation}</p>}
          <div className="space-y-1 rounded-lg bg-background/70 px-2.5 py-2">
            <p className="font-mono text-[10px] text-muted-foreground">
              Source: {q.citation.namingCode} v{q.citation.version}
            </p>
            {q.citation.quote && (
              <p className="text-[11px] italic leading-relaxed text-foreground/80">"{q.citation.quote}"</p>
            )}
          </div>
          <FlagControl attemptId={attemptId} personId={personId} question={q} />
        </div>
      )}

      {answered && (
        <Button className="h-11 gap-1.5 rounded-xl" onClick={onNext}>
          {nextLabel}
          <ArrowRight className="h-4 w-4" />
        </Button>
      )}
    </div>
  )
}

function FlagControl({
  attemptId,
  personId,
  question: q,
}: {
  attemptId: Id<"trainingAttempts">
  personId: Id<"people">
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
        Sent: "{q.flag}". The document owner sees it in its insights.
      </p>
    )
  }
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-amber-700"
      >
        <Flag className="h-3 w-3" /> Unclear or wrong?
      </button>
    )
  }
  return (
    <div className="space-y-1.5">
      <Textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        autoFocus
        placeholder="What is unclear or wrong? For example: the machine shows something else."
        className="resize-none bg-background text-xs"
      />
      <div className="flex gap-2">
        <Button
          size="sm"
          className="h-8 text-xs"
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
        <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </div>
  )
}
