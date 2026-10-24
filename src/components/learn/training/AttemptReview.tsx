import { useState } from "react"
import { useMutation } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import { toast } from "sonner"
import { Camera, CheckCircle2, Flag, MapPin, StickyNote, Wrench, XCircle } from "lucide-react"
import { api } from "../../../../convex/_generated/api"
import { Button } from "@/components/ui/button"
import { useCheckIn } from "@/lib/checkIn"
import { cn } from "@/lib/utils"
import { answerKind, Feedback, isAnswered, isRight, QuestionImage } from "./QuestionCard"
import { errorText, fmtDate, fmtDateTime, KIND_LABEL, LEVEL_WORDS, SourceChip, VERDICT_WORDS, type Verdict } from "./lib"

export type AttemptView = NonNullable<FunctionReturnType<typeof api.attempts.get>>

const LETTERS = ["A", "B", "C", "D", "E", "F"]
const ROLE_WORDS = { author: "Written by", reviewer: "Reviewed by", approver: "Approved by" } as const

/**
 * The full record of an Attempt, as a labour inspector or auditor asks for
 * it: who, which Training version and who approved it, the sources with
 * their versions, which attempt this was, the must-be-right outcome, the
 * try-out at the line, every question with the given and the right answer,
 * and the Published passage each one cites. Printable as it is, with the
 * record id, page x of y and the print date on every page.
 */
export function AttemptReview({ a }: { a: AttemptView }) {
  const passed = a.status === "passed"
  const { person } = useCheckIn()
  const printedAt = fmtDateTime(Date.now())
  const recordId = a.recordId ?? a._id
  const critical = a.questions.filter((q) => q.critical)
  const criticalRight = critical.filter((q) => isRight(q) === true).length
  const earlier = a.earlierFails ?? 0
  const t = a.tryOut

  return (
    <div className="space-y-4">
      <style>{`@media print { @page { margin: 16mm 14mm 18mm; @bottom-left { content: "Record ${recordId} · printed ${printedAt.replace(/"/g, "")}"; font-size: 8pt; color: #555; } @bottom-right { content: "Page " counter(page) " of " counter(pages); font-size: 8pt; color: #555; } } }`}</style>
      <div className="rounded-lg border p-4 print:border-black/30">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2 border-b pb-2">
          <p className="text-sm font-semibold">{passed ? "Training record" : a.status === "failed" ? "Attempt (not passed)" : "Attempt"}</p>
          <p className="text-xs text-muted-foreground">
            <span className="print:hidden">Oppr Knowledge, Pijpwerk Noord</span>
            <span className="hidden print:inline">
              Printed {printedAt}
              {person ? ` by ${person.name}` : ""} from Oppr Knowledge, Pijpwerk Noord
            </span>
          </p>
        </div>
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <Field label="Person" value={`${a.personName}${a.personRole ? `, ${a.personRole}` : ""}`} />
          <Field
            label="Training"
            value={
              <>
                <span className="font-mono">{a.training?.code}</span> {a.training?.title} ({KIND_LABEL[a.training?.kind ?? "course"]})
              </>
            }
          />
          <Field
            label="Version"
            value={`v${a.trainingVersion}${a.training?.liveVersion === a.trainingVersion ? " (still in use)" : ""}`}
          />
          <Field
            label="Result"
            value={
              <span className={cn("font-semibold", passed ? "text-emerald-700" : "text-red-700")}>
                {a.score ?? 0}%, {passed ? "passed" : a.status === "failed" ? "not passed" : a.status.replace("_", " ")}
                {a.attemptNumber > 1 &&
                  ` on attempt ${a.attemptNumber}${earlier > 0 ? ` (${earlier} earlier not passed)` : ""}`}
              </span>
            }
          />
          <Field label="Pass rule" value={a.passRule} />
          {critical.length > 0 && (
            <Field
              label="Must be right"
              value={
                <span className={criticalRight === critical.length ? "text-emerald-700" : "text-red-700"}>
                  {criticalRight} of {critical.length} right
                  {a.mustBeRightMissed.length > 0 &&
                    `: missed ${a.mustBeRightMissed.map((id) => a.objectives.find((o) => o.id === id)?.text ?? id).join("; ")}`}
                </span>
              }
            />
          )}
          <Field label="Started" value={fmtDateTime(a.startedAt)} />
          <Field label="Finished" value={a.finishedAt ? fmtDateTime(a.finishedAt) : "Not finished"} />
          <Field
            label="Questions"
            value={`${a.progress.correct} of ${a.progress.total} right, ${a.objectives.length} Learning ${a.objectives.length === 1 ? "objective" : "objectives"} tested`}
          />
          <Field label={a.recordId ? "Record ID" : "Attempt ID"} value={<span className="font-mono text-xs">{recordId}</span>} />
          {a.round && <Field label="Round" value={`${a.stops.length} stops visited in order`} />}
        </dl>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 print:grid-cols-2">
        <div className="space-y-2 rounded-lg border p-4 print:break-inside-avoid">
          <p className="text-xs font-semibold">Training version v{a.trainingVersion}</p>
          {a.signoffs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No sign-offs recorded.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {a.signoffs.map((s, i) => (
                <li key={i}>
                  {ROLE_WORDS[s.role]} {s.name ?? "an unknown person"}, {fmtDate(s.at)}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="space-y-2 rounded-lg border p-4 print:break-inside-avoid">
          <p className="text-xs font-semibold">Sources</p>
          <ul className="flex flex-wrap gap-1.5">
            {a.sources.map((s) => (
              <li key={s.documentId}>
                <SourceChip documentId={s.documentId} namingCode={s.namingCode} version={s.version} quote={null} />
              </li>
            ))}
          </ul>
        </div>
      </div>

      {(t || a.tryOutRequired) && (
        <div className="space-y-2 rounded-lg border p-4 print:break-inside-avoid">
          <p className="text-xs font-semibold">Try-out at the line</p>
          {!t ? (
            <p className="text-sm text-muted-foreground">
              {a.tryOutRequest?.status === "open"
                ? `Requested on ${fmtDate(a.tryOutRequest.createdAt)}${a.tryOutRequest.trainerName ? `, waiting for ${a.tryOutRequest.trainerName}` : ""}.`
                : "Not done yet. Needed before the person may do the job on their own (level 2)."}
            </p>
          ) : (
            <>
              <p className={cn("text-sm font-medium", t.result === "passed" ? "text-emerald-700" : "text-amber-700")}>
                {t.result === "passed" ? "Passed" : "Coach and try again"}, signed by {t.signedByName ?? "a trainer"}
                {t.trainerLevel != null && ` (${t.trainerLevel >= 3 ? `level 3, ${LEVEL_WORDS[3]}` : `level ${t.trainerLevel}`})`} on{" "}
                {fmtDateTime(t.at)}
                {t.asset && ` at ${t.asset.code} ${t.asset.name}`}
              </p>
              {(t.items ?? t.checked.map((label) => ({ label, result: "ok" as const, note: undefined }))).length > 0 && (
                <ul className="space-y-1">
                  {(t.items ?? t.checked.map((label) => ({ label, result: "ok" as const, note: undefined }))).map((i, n) => (
                    <li key={n} className="flex items-start gap-2 text-sm">
                      {i.result === "ok" ? (
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                      ) : (
                        <Wrench className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                      )}
                      <span>
                        {i.label}
                        {i.note && <span className="text-muted-foreground">: {i.note}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {t.note && <p className="text-sm">Note: {t.note}</p>}
              {t.photoUrl && <img src={t.photoUrl} alt="Photo with the try-out" className="h-28 rounded border object-cover" />}
            </>
          )}
        </div>
      )}

      {a.round && a.stops.length > 0 && (
        <div className="space-y-2 rounded-lg border p-4 print:break-inside-avoid">
          <p className="text-xs font-semibold">Stops</p>
          <ol className="space-y-1.5">
            {a.stops.map((s) => (
              <li key={s.index} className="flex flex-wrap items-start gap-2 text-sm">
                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="font-mono text-xs">{s.code}</span>
                <span>{s.name}</span>
                <span className="text-xs text-muted-foreground">{s.visited ? "scanned" : "not reached"}</span>
                {s.evidenceGiven.map((e, i) => (
                  <span key={i} className="flex w-full items-start gap-1.5 pl-6 text-xs text-muted-foreground">
                    {e.kind === "photo" ? <Camera className="mt-0.5 h-3 w-3" /> : <StickyNote className="mt-0.5 h-3 w-3" />}
                    {e.kind === "photo" ? (
                      <span className="space-y-1">
                        <span className="block">Photo recorded at this stop</span>
                        {e.url && (
                          <a href={e.url} target="_blank" rel="noreferrer" className="block">
                            <img src={e.url} alt={`Photo recorded at ${s.code}`} className="h-20 rounded border object-cover" />
                          </a>
                        )}
                      </span>
                    ) : (
                      <span>Note recorded at this stop: {e.text}</span>
                    )}
                    <span className="ml-auto shrink-0">{fmtDateTime(e.at)}</span>
                  </span>
                ))}
              </li>
            ))}
          </ol>
        </div>
      )}

      <ol className="space-y-3">
        {a.questions.map((q, n) => (
          <ReviewQuestion key={q.id} a={a} q={q} n={n} />
        ))}
      </ol>
    </div>
  )
}

type Q = AttemptView["questions"][number]

function ReviewQuestion({ a, q, n }: { a: AttemptView; q: Q; n: number }) {
  const kind = answerKind(q)
  const right = isRight(q)
  return (
    <li className="space-y-2 rounded-lg border p-4 print:break-inside-avoid">
      <div className="flex items-start gap-2">
        {right ? (
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
        ) : (
          <XCircle className={cn("mt-0.5 h-4 w-4 shrink-0", isAnswered(q) ? "text-red-600" : "text-muted-foreground")} />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground">
            Question {n + 1}
            {q.critical && " · must be right"}
            {q.stopIndex !== null && a.stops[q.stopIndex] && ` · at ${a.stops[q.stopIndex].code}`}
            {q.answeredAt && ` · answered ${fmtDateTime(q.answeredAt)}`}
          </p>
          <p className="text-sm font-medium">{q.prompt}</p>
        </div>
      </div>
      {q.imageUrl && (
        <div className="pl-6">
          <QuestionImage url={q.imageUrl} floor={false} />
        </div>
      )}
      {kind === "choice" ? (
        <ul className="space-y-1 pl-6">
          {q.options.map((opt, i) => {
            const given = q.answerIndex === i
            const isRightOption = q.correctIndex === i
            return (
              <li
                key={i}
                className={cn(
                  "flex items-start gap-2 rounded px-2 py-1 text-sm",
                  isRightOption && "bg-emerald-50 dark:bg-emerald-500/10",
                  given && !isRightOption && "bg-red-50 dark:bg-red-500/10",
                )}
              >
                <span className="w-4 shrink-0 text-xs font-semibold text-muted-foreground">{LETTERS[i]}</span>
                <span className="flex-1">{opt}</span>
                {given && <span className="shrink-0 text-xs font-medium">Given answer</span>}
                {isRightOption && <span className="shrink-0 text-xs font-medium text-emerald-700 dark:text-emerald-300">Right answer</span>}
              </li>
            )
          })}
        </ul>
      ) : (
        <div className="space-y-1 pl-6 text-sm">
          <p className="text-xs text-muted-foreground">
            Given answer ({q.answerMode === "voice" ? "spoken" : q.answerMode === "photo" ? "photo" : "typed"})
          </p>
          {q.answerMode === "photo" && q.answerUrl ? (
            <img src={q.answerUrl} alt="Photo answer" className="h-32 rounded border object-cover" />
          ) : (
            <p className="whitespace-pre-wrap rounded bg-muted/40 px-2 py-1.5">{q.answerText || "No answer"}</p>
          )}
          {q.keyPoints.length > 0 && (
            <p className="text-xs text-muted-foreground">Key points: {q.keyPoints.join("; ")}</p>
          )}
        </div>
      )}
      <div className="pl-6">
        <Feedback q={q} floor={false} attemptId={a._id} sourceOpen />
      </div>
      {kind !== "choice" && isAnswered(q) && <GradeOverride a={a} q={q} />}
      {q.flag && (
        <p className="flex items-start gap-1.5 pl-6 text-xs text-amber-700 dark:text-amber-300">
          <Flag className="mt-0.5 h-3 w-3 shrink-0" /> Marked unclear or wrong: "{q.flag}"
        </p>
      )}
    </li>
  )
}

/** An Engineer (never the person themselves) can grade an open answer by hand. */
function GradeOverride({ a, q }: { a: AttemptView; q: Q }) {
  const { person } = useCheckIn()
  const override = useMutation(api.attempts.overrideGrade)
  const [busy, setBusy] = useState<Verdict | null>(null)
  if (!person || person.kind !== "engineer" || person._id === a.personId) return null
  return (
    <div className="flex flex-wrap items-center gap-2 pl-6 print:hidden">
      <span className="text-xs text-muted-foreground">{q.grade ? "Change the grade:" : "Grade it:"}</span>
      {(["good", "partly", "not_yet"] as const).map((v) => (
        <Button
          key={v}
          size="sm"
          variant={q.grade?.verdict === v ? "default" : "outline"}
          disabled={busy !== null || q.grade?.verdict === v}
          onClick={async () => {
            setBusy(v)
            try {
              await override({ id: a._id, personId: person._id, questionId: q.id, verdict: v })
              toast.success(`Graded "${VERDICT_WORDS[v]}"`)
            } catch (err) {
              toast.error(errorText(err))
            } finally {
              setBusy(null)
            }
          }}
        >
          {VERDICT_WORDS[v]}
        </Button>
      ))}
      {q.grade?.gradedBy === "engineer" && q.grade.overriddenByName && (
        <span className="text-xs text-muted-foreground">Graded by {q.grade.overriddenByName}</span>
      )}
    </div>
  )
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}
