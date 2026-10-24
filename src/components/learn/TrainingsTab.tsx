import { useState } from "react"
import { useQuery } from "convex/react"
import { Link } from "wouter"
import { AlertTriangle, ListChecks, Plus, Search } from "lucide-react"
import { api } from "../../../convex/_generated/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { StatusBadge } from "@/components/docs/StatusBadge"
import { cn } from "@/lib/utils"
import { KindBadge, KindIcon } from "./training/lib"
import { TrainingGuidedCreation } from "./training/TrainingGuidedCreation"

type KindFilter = "all" | "course" | "round"
type StatusFilter = "all" | "published" | "work" | "review"

const KIND_FILTERS: { value: KindFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "course", label: "Courses" },
  { value: "round", label: "Rounds" },
]
const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "Any status" },
  { value: "published", label: "In use (published)" },
  { value: "work", label: "Draft, in review or approved" },
  { value: "review", label: "Needs review after a change" },
]

// Learn tab: the Trainings library (courses and Rounds), with Guided creation of a new Training.
export function TrainingsTab() {
  const trainings = useQuery(api.trainings.list, {})
  const [creating, setCreating] = useState(false)
  const [kind, setKind] = useState<KindFilter>("all")
  const [status, setStatus] = useState<StatusFilter>("all")
  const [q, setQ] = useState("")

  const needle = q.trim().toLowerCase()
  const rows = (trainings ?? []).filter((t) => {
    if (kind !== "all" && t.kind !== kind) return false
    if (status === "published" && t.liveVersion == null) return false
    if (status === "work" && t.status === "published") return false
    if (status === "review" && !t.needsReview) return false
    if (needle && !`${t.code} ${t.title} ${t.documentCodes.join(" ")}`.toLowerCase().includes(needle)) return false
    return true
  })
  const needsReview = (trainings ?? []).filter((t) => t.needsReview).length

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-md border p-0.5" role="group" aria-label="Kind">
          {KIND_FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              aria-pressed={kind === f.value}
              onClick={() => setKind(f.value)}
              className={cn(
                "rounded px-2.5 py-1 text-xs transition-colors",
                kind === f.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
          <SelectTrigger className="h-8 w-[210px] text-xs" aria-label="Status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_FILTERS.map((f) => (
              <SelectItem key={f.value} value={f.value} className="text-xs">
                {f.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="relative min-w-[180px] flex-1 sm:max-w-xs">
          <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search code, title or document"
            className="h-8 pl-7 text-xs"
          />
        </div>
        {needsReview > 0 && status !== "review" && (
          <button
            type="button"
            onClick={() => setStatus("review")}
            className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-800 hover:bg-amber-100 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200"
          >
            <AlertTriangle className="h-3 w-3" />
            {needsReview} {needsReview === 1 ? "needs" : "need"} review after a change
          </button>
        )}
        <Button size="sm" className="ml-auto gap-1.5" onClick={() => setCreating(true)}>
          <Plus className="h-3.5 w-3.5" />
          New Training
        </Button>
      </div>

      {trainings === undefined ? (
        <Card>
          <CardContent className="divide-y p-0">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3">
                <div className="h-8 w-8 animate-pulse rounded-md bg-muted" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
                  <div className="h-2.5 w-1/2 animate-pulse rounded bg-muted" />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : trainings.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <ListChecks className="h-8 w-8 text-primary" />
            <p className="text-sm font-medium">No Trainings yet</p>
            <p className="max-w-sm text-xs text-muted-foreground">
              A Training says what a person must prove, with Learning objectives taken from published
              documents. Describe one and the assistant drafts it for you.
            </p>
            <Button size="sm" variant="outline" className="mt-1 gap-1.5" onClick={() => setCreating(true)}>
              <Plus className="h-3.5 w-3.5" /> New Training
            </Button>
          </CardContent>
        </Card>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
            <Search className="h-6 w-6 text-muted-foreground" />
            <p className="text-sm font-medium">No Training matches these filters</p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setKind("all")
                setStatus("all")
                setQ("")
              }}
            >
              Clear filters
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="divide-y p-0">
            {rows.map((t) => (
              <Link
                key={t._id}
                href={`/learn/trainings/${t._id}`}
                className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50"
              >
                <span
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-md",
                    t.kind === "round" ? "bg-violet-500/10 text-violet-600" : "bg-sky-500/10 text-sky-600",
                  )}
                >
                  <KindIcon kind={t.kind} className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1 space-y-0.5">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="truncate text-sm font-medium">{t.title}</span>
                    <KindBadge kind={t.kind} />
                    <StatusBadge status={t.status} className="h-5 px-1.5 text-[10px]" />
                    {t.liveVersion != null && t.currentVersion !== t.liveVersion && (
                      <span className="text-[10px] text-muted-foreground">v{t.liveVersion} in use</span>
                    )}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    <span className="font-mono">
                      {t.code} · v{t.currentVersion}
                    </span>
                    {" · "}
                    {t.objectives} {t.objectives === 1 ? "objective" : "objectives"}
                    {t.kind === "round" && ` · ${t.stops} ${t.stops === 1 ? "stop" : "stops"}`}
                    {t.documentCodes.length > 0 && (
                      <>
                        {" · from "}
                        <span className="font-mono">{t.documentCodes.join(", ")}</span>
                      </>
                    )}
                  </span>
                  {t.needsReview && (
                    <span className="flex items-center gap-1 text-[11px] font-medium text-amber-700 dark:text-amber-300">
                      <AlertTriangle className="h-3 w-3 shrink-0" />
                      Review after change: {t.needsReviewReason ?? "a source document changed"}
                    </span>
                  )}
                </span>
                <span className="hidden w-28 shrink-0 text-right sm:block">
                  <span className="block text-sm font-semibold tabular-nums">
                    {t.stats.passRate == null ? "–" : `${t.stats.passRate}%`}
                  </span>
                  <span className="block text-[11px] text-muted-foreground">
                    {t.stats.finished === 0
                      ? "No Attempts yet"
                      : `pass rate · ${t.stats.records} ${t.stats.records === 1 ? "record" : "records"}`}
                  </span>
                </span>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      <TrainingGuidedCreation open={creating} onOpenChange={setCreating} />
    </div>
  )
}
