import type { FunctionReturnType } from "convex/server"
import { Camera, CheckCircle2, Flag, MapPin, StickyNote, XCircle } from "lucide-react"
import { api } from "../../../../convex/_generated/api"
import { cn } from "@/lib/utils"
import { fmtDateTime, KIND_LABEL, SourceChip } from "./lib"

export type AttemptView = NonNullable<FunctionReturnType<typeof api.attempts.get>>

const LETTERS = ["A", "B", "C", "D", "E", "F"]

/**
 * The full record of an Attempt, as a labour inspector or auditor asks for
 * it: who, which Training and version, when, every question with the given
 * and the correct answer, and the Published passage each one cites.
 * Printable as it is.
 */
export function AttemptReview({ a }: { a: AttemptView }) {
  const passed = a.status === "passed"
  return (
    <div className="space-y-4">
      <div className="rounded-lg border p-4 print:border-black/30">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2 border-b pb-2">
          <p className="text-sm font-semibold">
            {passed ? "Training record" : a.status === "failed" ? "Attempt (not passed)" : "Attempt"}
          </p>
          <p className="text-[11px] text-muted-foreground">Printed from Oppr Knowledge, Pijpwerk Noord</p>
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
          <Field label="Version" value={`v${a.trainingVersion}${a.training?.liveVersion === a.trainingVersion ? " (still in use)" : ""}`} />
          <Field
            label="Result"
            value={
              <span className={cn("font-semibold", passed ? "text-emerald-700" : "text-red-700")}>
                {a.score ?? 0}%, {passed ? "passed" : a.status === "failed" ? "not passed" : a.status.replace("_", " ")} (pass mark {a.passMark}%)
              </span>
            }
          />
          <Field label="Started" value={fmtDateTime(a.startedAt)} />
          <Field label="Finished" value={a.finishedAt ? fmtDateTime(a.finishedAt) : "Not finished"} />
          <Field
            label="Questions"
            value={`${a.progress.correct} of ${a.progress.total} correct, ${a.objectives.length} Learning ${a.objectives.length === 1 ? "objective" : "objectives"} tested`}
          />
          {a.round && <Field label="Round" value={`${a.stops.length} stops visited in order, ${a.round.wrongScans} wrong ${a.round.wrongScans === 1 ? "scan" : "scans"}`} />}
        </dl>
      </div>

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
                    {e.url ? (
                      <a href={e.url} target="_blank" rel="noreferrer">
                        <img src={e.url} alt={`Photo at ${s.code}`} className="h-20 rounded border object-cover" />
                      </a>
                    ) : (
                      <span>{e.text}</span>
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
          <li key={q.id} className="space-y-2 rounded-lg border p-4 print:break-inside-avoid">
            <div className="flex items-start gap-2">
              {q.correct ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
              ) : (
                <XCircle className={cn("mt-0.5 h-4 w-4 shrink-0", q.answerIndex === null ? "text-muted-foreground" : "text-red-600")} />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-[11px] text-muted-foreground">
                  Question {n + 1}
                  {q.objectiveText && ` · Objective: ${q.objectiveText}`}
                  {q.stopIndex !== null && a.stops[q.stopIndex] && ` · at ${a.stops[q.stopIndex].code}`}
                </p>
                <p className="text-sm font-medium">{q.prompt}</p>
              </div>
            </div>
            <ul className="space-y-1 pl-6">
              {q.options.map((opt, i) => {
                const given = q.answerIndex === i
                const right = q.correctIndex === i
                return (
                  <li
                    key={i}
                    className={cn(
                      "flex items-start gap-2 rounded px-2 py-1 text-sm",
                      right && "bg-emerald-50 dark:bg-emerald-500/10",
                      given && !right && "bg-red-50 dark:bg-red-500/10",
                    )}
                  >
                    <span className="w-4 shrink-0 text-xs font-semibold text-muted-foreground">{LETTERS[i]}</span>
                    <span className="flex-1">{opt}</span>
                    {given && <span className="shrink-0 text-[11px] font-medium">Given answer</span>}
                    {right && <span className="shrink-0 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">Correct answer</span>}
                  </li>
                )
              })}
            </ul>
            {q.explanation && <p className="pl-6 text-xs">{q.explanation}</p>}
            <p className="flex items-start gap-1.5 pl-6 text-xs text-muted-foreground">
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
            {q.answeredAt && <p className="pl-6 text-[11px] text-muted-foreground">Answered {fmtDateTime(q.answeredAt)}</p>}
            {q.flag && (
              <p className="flex items-start gap-1.5 pl-6 text-[11px] text-amber-700 dark:text-amber-300">
                <Flag className="mt-0.5 h-3 w-3 shrink-0" /> Marked unclear or wrong: "{q.flag}"
              </p>
            )}
          </li>
        ))}
      </ol>
    </div>
  )
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}
