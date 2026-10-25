import { useMemo, useState } from "react"
import { useQuery } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import { useLocation, useSearch } from "wouter"
import { ArrowRight, Download, FileCheck2, Printer } from "lucide-react"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useCheckIn } from "@/lib/checkIn"
import { formatDate } from "@/lib/time"
import { cn } from "@/lib/utils"
import { daysAgo, KindIcon, ScoreBadge } from "./training/lib"
import { downloadCsv, fileDate } from "./exportCsv"
import { fmtScore } from "./skills/skillUi"
import { isEngineerOrAdmin } from "@/lib/roles"

const ALL = "all"

type RecordRow = FunctionReturnType<typeof api.attempts.listRecords>[number]
type Validity = { text: string; tone: "ok" | "warn" | "danger" | "muted" }

// Learn tab: Training records, the proof per person (for an auditor or a
// labour inspector). Each record says whether it still counts: current,
// valid until, expired, or re-train needed after a change. Export and Print
// take exactly the rows on screen.
export function RecordsTab() {
  const { person: me, people: checkInPeople } = useCheckIn()
  const engineer = isEngineerOrAdmin(me)
  const search = useSearch()
  const [location, navigate] = useLocation()
  const params = new URLSearchParams(search)
  const people = useQuery(api.people.list)
  const trainings = useQuery(api.trainings.list, { includeArchived: true })
  const catalogue = useQuery(api.skills.catalogue)
  const matrix = useQuery(api.skills.matrix, {})

  // Operators see their own records first; anyone can widen to everyone.
  const urlPerson = params.get("person")
  const personId = urlPerson ?? (me && !engineer ? me._id : ALL)
  const trainingId = params.get("training") ?? ALL
  // Operators see only their own Attempts that did not pass.
  const failedAllowed = engineer || (me != null && personId === me._id)
  const includeFailed = params.get("failed") === "1" && failedAllowed
  const grouped = params.get("group") === "person"

  function setParam(key: string, value: string | null) {
    const next = new URLSearchParams(search)
    next.set("tab", "records")
    if (value === null || (value === ALL && !(key === "person" && me && !engineer))) next.delete(key)
    else next.set(key, value)
    navigate(`${location}?${next.toString()}`, { replace: true })
  }

  const records = useQuery(
    api.attempts.listRecords,
    checkInPeople === undefined
      ? "skip"
      : {
          personId: personId === ALL ? undefined : (personId as Id<"people">),
          trainingId: trainingId === ALL ? undefined : (trainingId as Id<"trainings">),
          includeFailed,
        },
  )

  // Whether a record still counts, from the Skills its Training proves.
  const validity = useMemo(() => {
    const skillsByTraining = new Map<string, string[]>()
    for (const s of catalogue?.skills ?? [])
      for (const t of s.trainingIds) skillsByTraining.set(t, [...(skillsByTraining.get(t) ?? []), s._id])
    const cells = new Map<string, NonNullable<NonNullable<typeof matrix>["people"][number]["cells"][string]>>()
    for (const p of matrix?.people ?? []) for (const [sid, c] of Object.entries(p.cells)) cells.set(`${p._id}:${sid}`, c)
    // The newest pass per person and Training is the one that counts.
    const newest = new Map<string, number>()
    for (const r of records ?? []) {
      if (!r.passed) continue
      const k = `${r.personId}:${r.trainingId}`
      newest.set(k, Math.max(newest.get(k) ?? 0, r.at))
    }
    return (r: RecordRow): Validity => {
      if (!r.passed) return { text: "Not passed", tone: "muted" }
      if ((newest.get(`${r.personId}:${r.trainingId}`) ?? r.at) > r.at) return { text: "Replaced by a later pass", tone: "muted" }
      const linked = (skillsByTraining.get(r.trainingId) ?? [])
        .map((sid) => cells.get(`${r.personId}:${sid}`))
        .filter((c): c is NonNullable<typeof c> => !!c && c.level >= 1)
      const retrain = linked.find((c) => c.status === "retrain")
      if (retrain) {
        const m = retrain.retrainReason?.match(/^(\S+ v\d+)/)
        return { text: `Re-train needed after ${m ? m[1] : "a significant change"}`, tone: "danger" }
      }
      const expired = linked.find((c) => c.status === "expired")
      if (expired?.expiresAt) return { text: `Expired ${formatDate(expired.expiresAt)}`, tone: "danger" }
      const until = linked.map((c) => c.expiresAt).filter((x): x is number => x != null).sort((a, b) => a - b)[0]
      if (until) {
        const soon = until - Date.now() < 30 * 24 * 60 * 60 * 1000
        return { text: `Valid until ${formatDate(until)}`, tone: soon ? "warn" : "ok" }
      }
      return { text: "Current", tone: "ok" }
    }
  }, [catalogue, matrix, records])

  const rows = records ?? []
  const groups = useMemo(() => {
    if (!grouped) return null
    const map = new Map<string, { name: string; rows: RecordRow[] }>()
    for (const r of rows) {
      const g = map.get(r.personId) ?? { name: r.personName, rows: [] }
      g.rows.push(r)
      map.set(r.personId, g)
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name))
  }, [grouped, rows])

  const filtered = personId !== ALL || trainingId !== ALL
  const passedCount = rows.filter((r) => r.passed).length
  const personName = personId === ALL ? "everyone" : people?.find((p) => p._id === personId)?.name ?? "person"

  function exportCsv() {
    const header = ["Person", "Training code", "Training", "Version", "Kind", "Score", "Result", "Date", "Valid until"]
    const body = (groups ? groups.flatMap((g) => g.rows) : rows).map((r) => [
      r.personName,
      r.trainingCode,
      r.trainingTitle,
      `v${r.trainingVersion}`,
      r.kind === "round" ? "Round" : "Training",
      fmtScore(r.score),
      r.passed ? "Passed" : "Not passed",
      formatDate(r.at),
      validity(r).text,
    ])
    downloadCsv(`training-records-${personName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${fileDate()}.csv`, [header, ...body])
  }

  const table = (list: RecordRow[], showPerson: boolean) => (
    <Table>
      <TableHeader>
        <TableRow>
          {showPerson && <TableHead className="text-xs">Person</TableHead>}
          <TableHead className="text-xs">Training</TableHead>
          <TableHead className="text-xs">Version</TableHead>
          <TableHead className="text-xs">Score</TableHead>
          <TableHead className="text-xs">Date</TableHead>
          <TableHead className="text-xs">Valid until</TableHead>
          <TableHead className="w-8 print:hidden" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {list.map((r) => {
          const v = validity(r)
          return (
            <TableRow key={r._id} className="cursor-pointer" onClick={() => navigate(`/learn/attempts/${r.attemptId}`)}>
              {showPerson && <TableCell className="text-sm font-medium">{r.personName}</TableCell>}
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
                  {!r.passed && <span className="text-xs text-red-600">not passed</span>}
                </span>
              </TableCell>
              <TableCell className="text-xs">
                {formatDate(r.at)}
                <span className="block text-xs text-muted-foreground print:hidden">{daysAgo(r.at)}</span>
              </TableCell>
              <TableCell
                className={cn(
                  "text-xs",
                  v.tone === "ok" && "text-emerald-700 dark:text-emerald-400",
                  v.tone === "warn" && "font-medium text-amber-700 dark:text-amber-400",
                  v.tone === "danger" && "font-medium text-red-700 dark:text-red-400",
                  v.tone === "muted" && "text-muted-foreground",
                )}
              >
                {v.text}
              </TableCell>
              <TableCell className="print:hidden">
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )

  return (
    <div className="space-y-3" id="records-print">
      <style>{PRINT_CSS}</style>
      <p className="text-xs text-muted-foreground print:hidden">
        Proof per person: which Training, which version, which questions and answers, and when. Open a record to see
        every question with its source.
      </p>
      <h2 className="hidden text-base font-semibold print:block">
        Training records: {personName}
        {trainingId !== ALL ? `, ${trainings?.find((t) => t._id === trainingId)?.code ?? ""}` : ""}
      </h2>
      <div className="flex flex-wrap items-center gap-2 print:hidden" data-tour="learn-records-filters">
        <Select value={personId} onValueChange={(v) => setParam("person", v)}>
          <SelectTrigger className="h-8 w-[200px] text-xs" aria-label="Person">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {me && (
              <SelectItem value={me._id} className="text-xs">
                Mine ({me.name})
              </SelectItem>
            )}
            <SelectItem value={ALL} className="text-xs">
              Everyone
            </SelectItem>
            {(people ?? [])
              .filter((p) => p._id !== me?._id)
              .map((p) => (
                <SelectItem key={p._id} value={p._id} className="text-xs">
                  {p.name}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
        <Select value={trainingId} onValueChange={(v) => setParam("training", v)}>
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
          <Switch
            id="rec-failed"
            checked={includeFailed}
            disabled={!failedAllowed}
            onCheckedChange={(on) => setParam("failed", on ? "1" : null)}
          />
          <Label htmlFor="rec-failed" className="text-xs font-normal" title={failedAllowed ? undefined : "Only Engineers see other people's Attempts that did not pass."}>
            Not passed too
          </Label>
        </div>
        <div className="flex items-center gap-2 pl-1">
          <Switch id="rec-group" checked={grouped} onCheckedChange={(on) => setParam("group", on ? "person" : null)} />
          <Label htmlFor="rec-group" className="text-xs font-normal">
            Group by person
          </Label>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {records && (
            <span className="text-xs text-muted-foreground">
              {passedCount} {passedCount === 1 ? "record" : "records"}
              {includeFailed && `, ${rows.length - passedCount} not passed`}
            </span>
          )}
          <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" disabled={!rows.length} onClick={exportCsv} data-tour="learn-records-export">
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </Button>
          <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" disabled={!rows.length} onClick={() => window.print()}>
            <Printer className="h-3.5 w-3.5" />
            Print
          </Button>
        </div>
      </div>
      {!failedAllowed && params.get("failed") === "1" && (
        <p className="text-xs text-muted-foreground">Only Engineers see other people's Attempts that did not pass.</p>
      )}

      {records === undefined ? (
        <Skeleton className="h-48 w-full" />
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <FileCheck2 className="h-8 w-8 text-primary" />
            <p className="text-sm font-medium">{filtered ? "No records for this selection" : "No Training records yet"}</p>
            <p className="max-w-sm text-xs text-muted-foreground">
              A record is written each time a checked-in person passes an Attempt of a published Training.
            </p>
            {filtered ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => navigate(`${location}?tab=records&person=${ALL}`, { replace: true })}
              >
                Show everyone's records
              </Button>
            ) : (
              <Button size="sm" variant="outline" onClick={() => navigate("/learn?tab=trainings")}>
                See the Trainings
              </Button>
            )}
          </CardContent>
        </Card>
      ) : groups ? (
        <div className="space-y-4">
          {groups.map((g) => (
            <section key={g.name} className="space-y-1.5 break-inside-avoid">
              <h3 className="text-sm font-semibold">
                {g.name}{" "}
                <span className="font-normal text-muted-foreground">
                  · {g.rows.filter((r) => r.passed).length} passed
                </span>
              </h3>
              <Card>
                <CardContent className="p-0">{table(g.rows, false)}</CardContent>
              </Card>
            </section>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">{table(rows, true)}</CardContent>
        </Card>
      )}
      <p className="hidden text-xs text-muted-foreground print:block">Printed {formatDate(Date.now())}</p>
    </div>
  )
}

const PRINT_CSS = `
@media print {
  @page { size: A4 landscape; margin: 12mm; }
  body * { visibility: hidden; }
  #records-print, #records-print * { visibility: visible; }
  #records-print { position: absolute; left: 0; top: 0; width: 100%; }
}
`
