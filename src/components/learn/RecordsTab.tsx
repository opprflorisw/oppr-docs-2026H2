import { useState } from "react"
import { useQuery } from "convex/react"
import { useLocation } from "wouter"
import { ArrowRight, FileCheck2 } from "lucide-react"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { daysAgo, fmtDate, KindIcon, ScoreBadge } from "./training/lib"

const ALL = "all"

// Learn tab: Training records, the proof per person (for an auditor or labour inspector).
export function RecordsTab() {
  const people = useQuery(api.people.list)
  const trainings = useQuery(api.trainings.list, { includeArchived: true })
  const [personId, setPersonId] = useState<string>(ALL)
  const [trainingId, setTrainingId] = useState<string>(ALL)
  const [includeFailed, setIncludeFailed] = useState(false)
  const records = useQuery(api.attempts.listRecords, {
    personId: personId === ALL ? undefined : (personId as Id<"people">),
    trainingId: trainingId === ALL ? undefined : (trainingId as Id<"trainings">),
    includeFailed,
  })
  const [, navigate] = useLocation()
  const filtered = personId !== ALL || trainingId !== ALL

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Proof per person: which Training, which version, which questions and answers, and when. Open a record to see every
        question with its source.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Select value={personId} onValueChange={setPersonId}>
          <SelectTrigger className="h-8 w-[200px] text-xs" aria-label="Person">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL} className="text-xs">
              Everyone
            </SelectItem>
            {(people ?? []).map((p) => (
              <SelectItem key={p._id} value={p._id} className="text-xs">
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={trainingId} onValueChange={setTrainingId}>
          <SelectTrigger className="h-8 w-[260px] text-xs" aria-label="Training">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL} className="text-xs">
              Every Training
            </SelectItem>
            {(trainings ?? []).map((t) => (
              <SelectItem key={t._id} value={t._id} className="text-xs">
                <span className="font-mono">{t.code}</span> {t.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2 pl-1">
          <Switch id="rec-failed" checked={includeFailed} onCheckedChange={setIncludeFailed} />
          <Label htmlFor="rec-failed" className="text-xs font-normal">
            Show Attempts that did not pass
          </Label>
        </div>
        {records && (
          <span className="ml-auto text-[11px] text-muted-foreground">
            {records.filter((r) => r.passed).length} {records.filter((r) => r.passed).length === 1 ? "record" : "records"}
            {includeFailed && `, ${records.filter((r) => !r.passed).length} not passed`}
          </span>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          {records === undefined ? (
            <p className="px-4 py-6 text-xs text-muted-foreground">Loading records…</p>
          ) : records.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <FileCheck2 className="h-8 w-8 text-primary" />
              <p className="text-sm font-medium">{filtered ? "No records for this selection" : "No Training records yet"}</p>
              <p className="max-w-sm text-xs text-muted-foreground">
                A record is written each time a checked-in person passes an Attempt of a published Training.
              </p>
              {filtered ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setPersonId(ALL)
                    setTrainingId(ALL)
                  }}
                >
                  Show all records
                </Button>
              ) : (
                <Button size="sm" variant="outline" onClick={() => navigate("/learn?tab=trainings")}>
                  See the Trainings
                </Button>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Person</TableHead>
                  <TableHead className="text-xs">Training</TableHead>
                  <TableHead className="text-xs">Version</TableHead>
                  <TableHead className="text-xs">Score</TableHead>
                  <TableHead className="text-xs">Date</TableHead>
                  <TableHead className="w-8" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {records.map((r) => (
                  <TableRow
                    key={r._id}
                    className="cursor-pointer"
                    onClick={() => navigate(`/learn/attempts/${r.attemptId}`)}
                  >
                    <TableCell className="text-sm font-medium">{r.personName}</TableCell>
                    <TableCell className="text-sm">
                      <span className="flex items-center gap-1.5">
                        <KindIcon kind={r.kind} className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <span className="font-mono text-xs text-muted-foreground">{r.trainingCode}</span>
                        <span className="truncate">{r.trainingTitle}</span>
                      </span>
                    </TableCell>
                    <TableCell className="font-mono text-xs">v{r.trainingVersion}</TableCell>
                    <TableCell>
                      <span className="flex items-center gap-1.5">
                        <ScoreBadge score={r.score} passed={r.passed} />
                        {!r.passed && <span className="text-[11px] text-red-600">not passed</span>}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs">
                      {fmtDate(r.at)}
                      <span className="block text-[11px] text-muted-foreground">{daysAgo(r.at)}</span>
                    </TableCell>
                    <TableCell>
                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
