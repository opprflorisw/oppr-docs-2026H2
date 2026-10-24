import { useMemo, useState } from "react"
import { useLocation } from "wouter"
import { Microscope, Search } from "lucide-react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { TopBar } from "@/components/layout/TopBar"
import { PageHeader } from "@/components/layout/PageHeader"
import { cn } from "@/lib/utils"
import {
  ANALYSES,
  type AnalysisMeta,
  type AnalysisStatus,
} from "./analysis/registry"

const STATUS_LABEL: Record<AnalysisStatus, string> = {
  done: "Done",
  in_progress: "In progress",
  outstanding: "Outstanding",
}

const STATUS_CLASS: Record<AnalysisStatus, string> = {
  done: "bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-300",
  in_progress:
    "bg-amber-500/15 text-amber-700 hover:bg-amber-500/20 dark:text-amber-300",
  outstanding:
    "bg-red-500/15 text-red-700 hover:bg-red-500/20 dark:text-red-300",
}

export function AnalysisIndexPage() {
  const [, navigate] = useLocation()
  const [filter, setFilter] = useState("")

  const filtered = useMemo<AnalysisMeta[]>(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return ANALYSES
    return ANALYSES.filter(
      (a) =>
        a.title.toLowerCase().includes(q) ||
        a.area.toLowerCase().includes(q) ||
        a.summary.toLowerCase().includes(q),
    )
  }, [filter])

  const counts = useMemo(() => {
    const c = { done: 0, in_progress: 0, outstanding: 0 }
    for (const a of ANALYSES) c[a.status]++
    return c
  }, [])

  return (
    <div className="flex flex-col">
      <TopBar breadcrumb={[{ label: "Analysis" }]} />
      <PageHeader
        icon={Microscope}
        title="Analysis"
        subtitle="Investigations, gap analyses, and design proposals. Frozen artifacts you can argue from."
      />
      <div className="space-y-4 p-6">

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative max-w-sm flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter by title, area, or summary…"
              className="h-8 pl-8 text-xs"
            />
          </div>
          <div className="flex flex-wrap gap-1.5 text-xs">
            <Badge className={cn(STATUS_CLASS.done)}>
              {counts.done} Done
            </Badge>
            <Badge className={cn(STATUS_CLASS.in_progress)}>
              {counts.in_progress} In progress
            </Badge>
            <Badge className={cn(STATUS_CLASS.outstanding)}>
              {counts.outstanding} Outstanding
            </Badge>
          </div>
        </div>

        <div className="overflow-hidden rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[28%]">Title</TableHead>
                <TableHead className="w-[12%]">Area</TableHead>
                <TableHead>Summary</TableHead>
                <TableHead className="w-[12%]">Updated</TableHead>
                <TableHead className="w-[10%]">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="text-center text-xs text-muted-foreground"
                  >
                    No analyses match.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((a) => (
                  <TableRow
                    key={a.slug}
                    className="cursor-pointer"
                    onClick={() => navigate(`/analysis/${a.slug}`)}
                  >
                    <TableCell className="align-top text-sm font-medium">
                      {a.title}
                    </TableCell>
                    <TableCell className="align-top">
                      <Badge variant="outline" className="text-xs">
                        {a.area}
                      </Badge>
                    </TableCell>
                    <TableCell className="align-top text-xs text-muted-foreground">
                      {a.summary}
                    </TableCell>
                    <TableCell className="align-top font-mono text-xs text-muted-foreground">
                      {a.updatedAt}
                    </TableCell>
                    <TableCell className="align-top">
                      <Badge className={cn("text-xs", STATUS_CLASS[a.status])}>
                        {STATUS_LABEL[a.status]}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  )
}
