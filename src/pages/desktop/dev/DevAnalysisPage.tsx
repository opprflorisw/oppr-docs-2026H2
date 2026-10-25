// Analysis (/dev/analysis): every case file in analysis/registry.ts,
// newest first, searchable and filterable by area and status. Each opens at
// /analysis/:slug. /analysis redirects here.
import { useMemo, useState } from "react"
import { Link } from "wouter"
import { Search } from "lucide-react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { DevPage } from "@/components/dev/DevFrame"
import { DEV_TOOL } from "@/components/dev/devTools"
import { Choice } from "@/components/dev/embeddings/LabBits"
import { cn } from "@/lib/utils"
import { ANALYSES, type AnalysisArea, type AnalysisStatus } from "../analysis/registry"

const STATUS_LABEL: Record<AnalysisStatus, string> = {
  done: "Done",
  in_progress: "In progress",
  outstanding: "Outstanding",
}

const STATUS_CLASS: Record<AnalysisStatus, string> = {
  done: "bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-300",
  in_progress: "bg-amber-500/15 text-amber-700 hover:bg-amber-500/20 dark:text-amber-300",
  outstanding: "bg-red-500/15 text-red-700 hover:bg-red-500/20 dark:text-red-300",
}

const AREAS = [...new Set(ANALYSES.map((a) => a.area))].sort() as AnalysisArea[]
const NEWEST_FIRST = [...ANALYSES].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))

export function DevAnalysisPage() {
  const [filter, setFilter] = useState("")
  const [area, setArea] = useState<AnalysisArea | "all">("all")
  const [status, setStatus] = useState<AnalysisStatus | "all">("all")

  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase()
    return NEWEST_FIRST.filter(
      (a) =>
        (area === "all" || a.area === area) &&
        (status === "all" || a.status === status) &&
        (!q ||
          a.title.toLowerCase().includes(q) ||
          a.slug.includes(q) ||
          a.area.toLowerCase().includes(q) ||
          a.summary.toLowerCase().includes(q)),
    )
  }, [filter, area, status])

  const count = (s: AnalysisStatus) => ANALYSES.filter((a) => a.status === s).length

  return (
    <DevPage
      tool={DEV_TOOL.analysis}
      statusLine={`${ANALYSES.length} case files: investigations, gap analyses and design proposals, newest first.`}
    >
      <div className="flex flex-wrap items-center gap-3" data-tour="developer-analysis-filters">
        <div className="relative w-full max-w-sm" data-tour="developer-analysis-search">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 z-10 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search titles and summaries"
            aria-label="Search case files"
            className="h-9 pl-8 text-sm"
          />
        </div>
        <Choice
          label="Status"
          value={status}
          onChange={setStatus}
          options={[
            { value: "all", label: `All ${ANALYSES.length}` },
            { value: "outstanding", label: `Outstanding ${count("outstanding")}` },
            { value: "in_progress", label: `In progress ${count("in_progress")}` },
            { value: "done", label: `Done ${count("done")}` },
          ]}
        />
        <Choice
          label="Area"
          value={area}
          onChange={setArea}
          options={[{ value: "all" as const, label: "All" }, ...AREAS.map((a) => ({ value: a, label: a }))]}
        />
      </div>

      <div className="overflow-x-auto rounded-md border" data-tour="developer-analysis-table">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[30%]">Title</TableHead>
              <TableHead className="w-[10%]">Area</TableHead>
              <TableHead>Summary</TableHead>
              <TableHead className="w-[10%]">Updated</TableHead>
              <TableHead className="w-[10%]">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-xs text-muted-foreground">
                  No case files match.
                </TableCell>
              </TableRow>
            ) : (
              shown.map((a) => (
                <TableRow key={a.slug} className="relative">
                  <TableCell className="align-top text-sm font-medium">
                    {/* The link covers the row, so the whole row opens the case file. */}
                    <Link href={`/analysis/${a.slug}`} className="after:absolute after:inset-0 hover:underline">
                      {a.title}
                    </Link>
                  </TableCell>
                  <TableCell className="align-top">
                    <Badge variant="outline" className="text-xs">
                      {a.area}
                    </Badge>
                  </TableCell>
                  <TableCell className="align-top text-xs text-muted-foreground">
                    <span className="line-clamp-3">{a.summary}</span>
                  </TableCell>
                  <TableCell className="whitespace-nowrap align-top font-mono text-xs text-muted-foreground">
                    {a.updatedAt}
                  </TableCell>
                  <TableCell className="align-top">
                    <Badge className={cn("whitespace-nowrap text-xs", STATUS_CLASS[a.status])}>{STATUS_LABEL[a.status]}</Badge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </DevPage>
  )
}
