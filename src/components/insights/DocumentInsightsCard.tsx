import { useState } from "react"
import { useAction, useQuery } from "convex/react"
import { toast } from "sonner"
import { Activity, ChevronDown, HelpCircle, Loader2, MessageCircleQuestion, RefreshCw } from "lucide-react"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { formatAgo } from "@/lib/time"
import { useCheckIn } from "@/lib/checkIn"
import { PrepareRevisionButton, errorText } from "./PrepareRevisionDialog"
import { isEngineerOrAdmin } from "@/lib/roles"

type Severity = "info" | "unclear" | "gap"
const SEVERITY: Record<Severity, { label: string; dot: string; text: string }> = {
  gap: { label: "Not answered", dot: "bg-red-500", text: "text-red-700 dark:text-red-300" },
  unclear: { label: "Unclear", dot: "bg-amber-500", text: "text-amber-700 dark:text-amber-300" },
  info: { label: "Interest", dot: "bg-sky-500", text: "text-sky-700 dark:text-sky-300" },
}

// Document insights (CONTEXT.md): what people Ask about this Document and
// where it seems unclear, over the last 90 days. Feeds the next revision.
export function DocumentInsightsCard({ documentId }: { documentId: Id<"documents"> }) {
  const data = useQuery(api.insights.documentInsights, { documentId })
  const refresh = useAction(api.ai.insights.refreshReport)
  const { person } = useCheckIn()
  const engineer = isEngineerOrAdmin(person)
  const [requesting, setRequesting] = useState(false)
  const [openTheme, setOpenTheme] = useState<number | null>(null)

  if (data === undefined) {
    return (
      <div className="space-y-2 rounded-lg border p-3">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    )
  }
  if (data === null) return null

  const c = data.counts
  const hasSignals = c.views + c.scans + c.questions + c.flags > 0
  const generating = requesting || data.refresh?.state === "generating"
  const top = [...data.questions].sort((a, b) => b.count - a.count || b.lastAt - a.lastAt).slice(0, 3)
  const maxWeek = Math.max(1, ...data.weeks.map((w) => w.views + w.questions))

  async function onRefresh() {
    setRequesting(true)
    try {
      await refresh({ documentId })
    } catch (err) {
      toast.error(errorText(err))
    } finally {
      setRequesting(false)
    }
  }

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div className="flex items-center gap-2">
        <Activity className="h-4 w-4 text-primary" />
        <p className="text-xs font-semibold">Document insights</p>
        <span className="ml-auto text-[10px] text-muted-foreground">last {data.windowDays} days</span>
      </div>

      {!data.published && !hasSignals ? (
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Insights start once this document is Published: views, Scans of its Assets and the questions people Ask about it.
        </p>
      ) : !hasSignals ? (
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Nobody has opened it or asked about it yet. Views, Scans and questions show up here as people use it.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-px overflow-hidden rounded-md border bg-border text-center">
            <Num value={c.views} label="views" />
            <Num value={c.scans} label="Scans" hint="Scans of its Assets" />
            <Num value={c.questions} label="questions" />
          </div>

          {/* Weekly activity, oldest left. */}
          <div className="flex h-6 items-end gap-[2px]" aria-label="Views and questions per week">
            {data.weeks.map((w, i) => (
              <div
                key={i}
                title={`${w.views} views, ${w.questions} questions`}
                className="flex-1 rounded-sm bg-primary/25"
                style={{ height: `${Math.max(6, ((w.views + w.questions) / maxWeek) * 100)}%` }}
              />
            ))}
          </div>

          {top.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[11px] font-medium">People ask</p>
              <ul className="space-y-1.5">
                {top.map((q) => (
                  <li key={q.question} className="flex items-start gap-1.5 text-[11px] leading-snug">
                    <MessageCircleQuestion
                      className={cn(
                        "mt-0.5 h-3 w-3 shrink-0",
                        q.latestUnanswered ? "text-red-500" : "text-muted-foreground",
                      )}
                    />
                    <span className="min-w-0 flex-1">
                      “{q.question}”
                      {q.count > 1 && <span className="text-muted-foreground"> ×{q.count}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {(data.unansweredQuestions.length > 0 || data.flags.length > 0) && (
            <Popover>
              <PopoverTrigger asChild>
                <button className="flex w-full items-center gap-1.5 rounded-md border border-amber-300 bg-amber-50/70 px-2 py-1.5 text-left text-[11px] text-amber-800 hover:bg-amber-100/70 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
                  <HelpCircle className="h-3.5 w-3.5 shrink-0" />
                  <span className="flex-1">
                    {c.unanswered > 0 && `${c.unanswered} not answered`}
                    {c.unanswered > 0 && c.flags > 0 && " · "}
                    {c.flags > 0 && `${c.flags} marked unclear`}
                  </span>
                  <ChevronDown className="h-3 w-3" />
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-80 space-y-3 p-3">
                {data.unansweredQuestions.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-xs font-semibold">Questions this document did not answer</p>
                    <ul className="max-h-56 space-y-1.5 overflow-y-auto pr-1">
                      {data.unansweredQuestions.map((q) => (
                        <li key={q.question} className="text-xs leading-snug">
                          “{q.question}”
                          <span className="block text-[10px] text-muted-foreground">
                            {q.unanswered === 1 ? "once" : `${q.unanswered} times`}, last {formatAgo(q.lastAt)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {data.flags.length > 0 && (
                  <div className="space-y-1.5 border-t pt-2">
                    <p className="text-xs font-semibold">Marked unclear or wrong</p>
                    <ul className="max-h-40 space-y-1.5 overflow-y-auto pr-1">
                      {data.flags.map((f) => (
                        <li key={f._id} className="text-xs leading-snug">
                          “{f.note}”
                          <span className="block text-[10px] text-muted-foreground">
                            {f.source === "attempt" ? "From an Attempt" : f.source === "ask" ? "From Ask" : "From a reader"},{" "}
                            {formatAgo(f.at)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <p className="text-[10px] text-muted-foreground">
                  Questions are anonymous unless the person was checked in. They inform the next revision.
                </p>
              </PopoverContent>
            </Popover>
          )}

          {/* Themes from the latest insight report. */}
          <div className="space-y-1.5 border-t pt-2">
            <div className="flex items-center gap-1">
              <p className="text-[11px] font-medium">Themes</p>
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto h-6 gap-1 px-1.5 text-[11px] text-muted-foreground"
                onClick={onRefresh}
                disabled={generating || c.questions + c.flags === 0}
                title="Group the recent questions and marks into themes"
              >
                {generating ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                {generating ? "Grouping" : "Refresh"}
              </Button>
            </div>
            {data.report && data.report.themes.length > 0 ? (
              <ul className="space-y-1">
                {data.report.themes.map((t, i) => {
                  const s = SEVERITY[t.severity as Severity]
                  const open = openTheme === i
                  return (
                    <li key={i}>
                      <button
                        className="flex w-full items-start gap-1.5 text-left text-[11px] leading-snug"
                        onClick={() => setOpenTheme(open ? null : i)}
                        aria-expanded={open}
                      >
                        <span className={cn("mt-1 h-1.5 w-1.5 shrink-0 rounded-full", s.dot)} />
                        <span className="flex-1 font-medium">{t.title}</span>
                        <span className={cn("shrink-0 text-[10px]", s.text)}>{s.label}</span>
                      </button>
                      {open && (
                        <div className="ml-3 mt-1 space-y-1 text-[11px] text-muted-foreground">
                          <p>{t.detail}</p>
                          {t.examples.map((e) => (
                            <p key={e} className="italic">“{e}”</p>
                          ))}
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className="text-[11px] text-muted-foreground">
                {generating
                  ? "Grouping the questions into themes..."
                  : c.questions + c.flags === 0
                    ? "Themes appear once people Ask about this document."
                    : "Press Refresh to group the questions into themes."}
              </p>
            )}
            {data.refresh?.state === "failed" && !generating && (
              <p className="text-[10px] text-red-600">Refresh failed: {data.refresh.error ?? "unknown error"}</p>
            )}
            {data.report?.generatedAt != null && (
              <p className="text-[10px] text-muted-foreground">
                Updated {formatAgo(data.report.generatedAt)}
                {data.report.newSince > 0 &&
                  ` · ${data.report.newSince} new ${data.report.newSince === 1 ? "question" : "questions"} since`}
              </p>
            )}
          </div>
        </>
      )}

      {data.openFindings > 0 && (
        <p className="text-[11px] text-red-600">
          {data.openFindings} open {data.openFindings === 1 ? "Finding" : "Findings"} about this document.
        </p>
      )}

      {engineer &&
        hasSignals &&
        c.questions + c.flags > 0 &&
        (data.proposeBlocker == null ? (
          <PrepareRevisionButton
            documentId={documentId}
            namingCode={data.namingCode}
            source={{ kind: "insight" }}
            className="h-auto w-full justify-start gap-1.5 whitespace-normal py-1.5 text-left text-xs"
          >
            Prepare a revision from these insights
          </PrepareRevisionButton>
        ) : (
          data.published && (
            <p className="text-[10px] leading-relaxed text-muted-foreground">
              {data.proposeBlocker} These insights still inform the next revision.
            </p>
          )
        ))}
    </div>
  )
}

function Num({ value, label, hint }: { value: number; label: string; hint?: string }) {
  return (
    <div className="bg-card px-1 py-1.5" title={hint}>
      <div className="text-sm font-semibold tabular-nums">{value}</div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
    </div>
  )
}
