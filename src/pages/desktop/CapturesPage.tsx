import { useEffect, useMemo, useState } from "react"
import { Link, useLocation, useSearch } from "wouter"
import { useMutation, useQuery } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import { toast } from "sonner"
import { Aperture, ArrowLeft, Image as ImageIcon, Layers, Loader2, Merge, Search, Smartphone, Sparkles, X } from "lucide-react"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import { TopBar } from "@/components/layout/TopBar"
import { PageHeader } from "@/components/layout/PageHeader"
import { DocumentsTabs } from "@/components/docs/DocumentsTabs"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Skeleton } from "@/components/ui/skeleton"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useCheckIn } from "@/lib/checkIn"
import { formatDate, formatDateTime } from "@/lib/time"
import { cn } from "@/lib/utils"
import { setPhoneMode } from "@/components/phone/phoneStore"
import { DeskNotice } from "@/components/captures/DeskBits"
import { Avatar, StatusPill, errorText } from "@/components/captures/captureUi"
import { isEngineerOrAdmin } from "@/lib/roles"

type CaptureRow = FunctionReturnType<typeof api.captures.captures.list>[number]
type SetRow = FunctionReturnType<typeof api.captures.sets.list>[number]

const ALL = "__all__"

/**
 * /library/captures: what Operators recorded on the floor (raw input, never
 * Knowledge), and the Capture sets Engineers combined from them.
 */
export function CapturesPage() {
  const [, navigate] = useLocation()
  const urlSearch = useSearch()
  const tab = new URLSearchParams(urlSearch).get("tab") === "sets" ? "sets" : "captures"
  const { person, people } = useCheckIn()
  const engineer = isEngineerOrAdmin(person)

  const captures = useQuery(api.captures.captures.list, person ? { personId: person._id } : "skip")
  const sets = useQuery(api.captures.sets.list, person && engineer ? { personId: person._id } : "skip")
  const suggestions = useQuery(api.captures.sets.suggestSets, person && engineer ? { personId: person._id } : "skip")

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [combineOpen, setCombineOpen] = useState(false)

  // Selection only makes sense for the person who is checked in now.
  useEffect(() => setSelected(new Set()), [person?._id])

  const selectedRows = useMemo(
    () => (captures ?? []).filter((c) => selected.has(c._id)),
    [captures, selected],
  )
  const combineBlocked =
    selected.size < 2
      ? "Select 2 or more to combine."
      : selected.size > 12
        ? "A Capture set holds at most 12 Captures."
        : selectedRows.some((c) => c.status === "recording")
          ? "A Capture that is still recording cannot be combined."
          : null

  const crumbs = [{ label: "Documents", href: "/library" }, { label: "Captures" }]

  return (
    <div className="flex flex-col">
      <TopBar breadcrumb={crumbs} />
      <PageHeader
        icon={Aperture}
        title="Captures"
        statusLine="How Operators do the work, recorded on the phone. Raw input, not Knowledge: an Engineer turns it into a Draft."
        primary={
          engineer && tab === "captures" && selected.size > 0
            ? {
                label: selected.size > 0 ? `Combine into a Capture set (${selected.size})` : "Combine into a Capture set",
                icon: Merge,
                onClick: () => setCombineOpen(true),
                disabled: !!combineBlocked,
                disabledReason: combineBlocked ?? undefined,
              }
            : undefined
        }
        menu={[{ label: "Record on the phone", icon: Smartphone, onClick: () => setPhoneMode("popup") }]}
      />
      <DocumentsTabs />

      <div className="space-y-4 p-6">
        {engineer && tab === "sets" && (
          <Link href="/library/captures" className="inline-flex items-center gap-1 text-sm font-medium text-[#6E59A5] hover:underline">
            <ArrowLeft className="h-4 w-4" />
            All Captures
          </Link>
        )}

        {people === undefined ? (
          <TableSkeleton />
        ) : !person ? (
          <DeskNotice title="Check in to see Captures" checkIn>
            Engineers see every handed-in Capture. Operators see their own.
          </DeskNotice>
        ) : tab === "sets" && engineer ? (
          <SetsTable sets={sets} />
        ) : (
          <>
            {engineer && suggestions && suggestions.length > 0 && (
              <Suggestions
                suggestions={suggestions}
                onSelect={(ids) => {
                  setSelected(new Set(ids))
                  toast(`${ids.length} Captures selected. Check them, then Combine.`)
                }}
              />
            )}
            <CapturesTable
              rows={captures}
              selectable={engineer}
              selected={selected}
              onToggle={(id) =>
                setSelected((s) => {
                  const next = new Set(s)
                  if (next.has(id)) next.delete(id)
                  else next.add(id)
                  return next
                })
              }
              onSetSelected={setSelected}
              engineer={engineer}
              setCount={sets?.length ?? 0}
              selectHint={engineer ? (selected.size === 0 ? "Select 2 or more to combine into a Capture set." : combineBlocked) : null}
            />
          </>
        )}
      </div>

      {person && engineer && (
        <CombineDialog
          open={combineOpen}
          onOpenChange={setCombineOpen}
          personId={person._id}
          rows={selectedRows}
          onDone={(setId) => {
            setSelected(new Set())
            navigate(`/library/capture-sets/${setId}`)
          }}
        />
      )}
    </div>
  )
}

function TableSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  )
}

// ---- Captures table -----------------------------------------------------------------

function CapturesTable({
  rows,
  selectable,
  selected,
  onToggle,
  onSetSelected,
  engineer,
  setCount,
  selectHint,
}: {
  rows: CaptureRow[] | undefined
  selectable: boolean
  selected: Set<string>
  onToggle: (id: string) => void
  onSetSelected: (s: Set<string>) => void
  engineer: boolean
  setCount: number
  selectHint: string | null
}) {
  const [, navigate] = useLocation()
  const [q, setQ] = useState("")
  const [job, setJob] = useState(ALL)
  const [author, setAuthor] = useState(ALL)

  const jobs = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of rows ?? []) if (r.job) m.set(r.job, (m.get(r.job) ?? 0) + 1)
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [rows])
  const authors = useMemo(() => {
    const m = new Map<string, string>()
    for (const r of rows ?? []) if (r.author) m.set(r.author._id, r.author.name)
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [rows])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return (rows ?? []).filter(
      (r) =>
        (job === ALL || r.job === job) &&
        (author === ALL || r.author?._id === author) &&
        (!needle ||
          r.title.toLowerCase().includes(needle) ||
          (r.job ?? "").toLowerCase().includes(needle) ||
          (r.author?.name ?? "").toLowerCase().includes(needle) ||
          r.tags.some((t) => t.toLowerCase().includes(needle))),
    )
  }, [rows, q, job, author])

  if (rows === undefined) return <TableSkeleton />

  const selectableIds = filtered.filter((r) => r.status !== "recording").map((r) => r._id as string)
  const allOn = selectableIds.length > 0 && selectableIds.every((id) => selected.has(id))

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[260px] max-w-sm flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search title, job, person or tag" className="pl-8 text-sm" />
        </div>
        <Select value={job} onValueChange={setJob}>
          <SelectTrigger className="w-[260px]" aria-label="Filter by job">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All jobs</SelectItem>
            {jobs.map(([j, n]) => (
              <SelectItem key={j} value={j}>
                {j} ({n})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={author} onValueChange={setAuthor}>
          <SelectTrigger className="w-[200px]" aria-label="Filter by author">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Everyone</SelectItem>
            {authors.map(([id, name]) => (
              <SelectItem key={id} value={id}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {(q || job !== ALL || author !== ALL) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setQ("")
              setJob(ALL)
              setAuthor(ALL)
            }}
          >
            <X className="mr-1 h-3.5 w-3.5" />
            Clear
          </Button>
        )}
        <span className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
          {filtered.length} {filtered.length === 1 ? "Capture" : "Captures"}
          {engineer && (
            <Link href="/library/captures?tab=sets" className="inline-flex items-center gap-1 text-sm font-medium text-[#6E59A5] hover:underline">
              <Layers className="h-4 w-4" />
              Capture sets ({setCount})
            </Link>
          )}
        </span>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed p-8 text-center">
          <p className="text-sm font-medium">No Captures yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            {engineer
              ? "Captures show up here once an Operator hands one in. Open the phone app and choose Capture to record one."
              : "Open the phone app and choose Capture to record how you do a job."}
          </p>
          <Button size="sm" variant="outline" className="mt-3" onClick={() => setPhoneMode("popup")}>
            <Smartphone className="mr-1.5 h-3.5 w-3.5" />
            Open the phone app
          </Button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          No Captures match these filters.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border">
          {selectable && selectHint && (
            <p className="border-b bg-muted/20 px-3 py-1.5 text-xs text-muted-foreground">{selectHint}</p>
          )}
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                {selectable && (
                  <th className="w-10 px-3 py-2">
                    <Checkbox
                      checked={allOn}
                      onCheckedChange={(on) => onSetSelected(new Set(on ? selectableIds : []))}
                      aria-label="Select all shown Captures"
                    />
                  </th>
                )}
                <th className="px-3 py-2 font-medium">Capture</th>
                <th className="px-3 py-2 font-medium">Job</th>
                <th className="px-3 py-2 font-medium">Recorded by</th>
                <th className="px-3 py-2 font-medium">Handed in</th>
                <th className="px-3 py-2 text-right font-medium">Entries</th>
                <th className="px-3 py-2 text-right font-medium">Moments</th>
                <th className="px-3 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((r) => {
                const on = selected.has(r._id)
                return (
                  <tr
                    key={r._id}
                    onClick={() => navigate(`/library/captures/${r._id}`)}
                    className={cn("h-14 cursor-pointer transition-colors hover:bg-muted/40", on && "bg-[#9b87f5]/10 hover:bg-[#9b87f5]/15")}
                  >
                    {selectable && (
                      <td className="px-3" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={on}
                          disabled={r.status === "recording"}
                          onCheckedChange={() => onToggle(r._id)}
                          aria-label={`Select ${r.title}`}
                        />
                      </td>
                    )}
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-3">
                        <span className="flex h-10 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted">
                          {r.thumbnailUrl ? (
                            <img src={r.thumbnailUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                          ) : (
                            <ImageIcon className="h-4 w-4 text-muted-foreground" />
                          )}
                        </span>
                        <div className="min-w-0">
                          <Link
                            href={`/library/captures/${r._id}`}
                            onClick={(e) => e.stopPropagation()}
                            className="block truncate font-medium hover:underline"
                          >
                            {r.title}
                          </Link>
                          {r.assets.length > 0 && (
                            <p className="truncate font-mono text-xs text-muted-foreground">
                              {r.assets.map((a) => a.code).join(" · ")}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="max-w-[240px] truncate px-3 py-2 text-muted-foreground">{r.job ?? ""}</td>
                    <td className="px-3 py-2">
                      {r.author && (
                        <span className="flex items-center gap-2">
                          <Avatar id={r.author._id} name={r.author.name} />
                          <span className="truncate">{r.author.name}</span>
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-muted-foreground" title={r.handedInAt ? formatDateTime(r.handedInAt) : undefined}>
                      {r.handedInAt ? formatDate(r.handedInAt) : "Not yet"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.entryCount}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.status === "ready" ? r.momentCount : ""}</td>
                    <td className="px-3 py-2">
                      <StatusPill status={r.status} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ---- Suggestions ----------------------------------------------------------------------

function Suggestions({
  suggestions,
  onSelect,
}: {
  suggestions: FunctionReturnType<typeof api.captures.sets.suggestSets>
  onSelect: (ids: string[]) => void
}) {
  const shown = suggestions.filter((s) => s.newSinceSet > 0 || s.existingSetId).slice(0, 3)
  if (shown.length === 0) return null
  return (
    <div className="space-y-2">
      {shown.map((s) => (
        <div key={s.job} className="flex flex-wrap items-center gap-3 rounded-xl border border-[#9b87f5]/40 bg-[#9b87f5]/5 px-4 py-3">
          <Sparkles className="h-4 w-4 shrink-0 text-[#6E59A5]" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">
              {s.captureIds.length} Captures of "{s.job}" by {s.authorCount} {s.authorCount === 1 ? "person" : "people"}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {s.existingSetId
                ? s.newSinceSet > 0
                  ? `${s.newSinceSet} new since the Capture set was made.`
                  : "Already combined in a Capture set."
                : `Combine them to see one step list and where people do it differently.`}{" "}
              {[...new Set<string>(s.captures.map((c) => c.authorName))].join(", ")}
            </p>
          </div>
          <div className="flex shrink-0 -space-x-1.5">
            {[...new Set<string>(s.captures.map((c) => c.authorName))].slice(0, 6).map((n) => (
              <Avatar key={n} id={n} name={n} />
            ))}
          </div>
          {s.existingSetId && (
            <Button size="sm" variant="outline" asChild>
              <Link href={`/library/capture-sets/${s.existingSetId}`}>Open the Capture set</Link>
            </Button>
          )}
          {(!s.existingSetId || s.newSinceSet > 0) && (
            <Button size="sm" variant="outline" onClick={() => onSelect(s.captureIds)}>
              Select these {s.captureIds.length}
            </Button>
          )}
        </div>
      ))}
    </div>
  )
}

// ---- Combine dialog ---------------------------------------------------------------------

function CombineDialog({
  open,
  onOpenChange,
  personId,
  rows,
  onDone,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  personId: Id<"people">
  rows: CaptureRow[]
  onDone: (setId: Id<"captureSets">) => void
}) {
  const create = useMutation(api.captures.sets.create)
  const combine = useMutation(api.captures.sets.combine)
  const commonJob = useMemo(() => {
    const counts = new Map<string, number>()
    for (const r of rows) if (r.job) counts.set(r.job, (counts.get(r.job) ?? 0) + 1)
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? ""
  }, [rows])
  const [title, setTitle] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setTitle(commonJob)
      setError(null)
    }
  }, [open, commonJob])

  const jobs = new Set(rows.map((r) => r.job ?? ""))
  const notReady = rows.filter((r) => r.status !== "ready")

  async function submit() {
    setBusy(true)
    setError(null)
    try {
      const setId = await create({
        personId,
        title: title.trim() || commonJob || "Capture set",
        job: commonJob || undefined,
        captureIds: rows.map((r) => r._id),
      })
      if (notReady.length === 0) {
        try {
          await combine({ setId, personId })
        } catch (err) {
          toast.error(errorText(err))
        }
      }
      onOpenChange(false)
      onDone(setId)
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Combine into a Capture set</DialogTitle>
          <DialogDescription>
            The AI lines up the {rows.length} Captures into one step list, shows which Captures support each step, and marks
            Variations and conflicts with Published Knowledge. You decide the standard.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="set-title">Name</Label>
            <Input id="set-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="For example: Start-up of line 2 after a stop" />
          </div>
          <ul className="max-h-56 divide-y overflow-y-auto rounded-lg border text-sm">
            {rows.map((r) => (
              <li key={r._id} className="flex items-center gap-2 px-3 py-2">
                {r.author && <Avatar id={r.author._id} name={r.author.name} />}
                <span className="min-w-0 flex-1 truncate">{r.title}</span>
                <span className="text-xs text-muted-foreground">{r.author?.name}</span>
              </li>
            ))}
          </ul>
          {jobs.size > 1 && (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              These Captures are about different jobs. Combining works best for one job done by several people.
            </p>
          )}
          {notReady.length > 0 && (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {notReady.length} {notReady.length === 1 ? "Capture is" : "Captures are"} not organized yet. The set is made now; combine it once
              they are ready.
            </p>
          )}
          {error && (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900" role="alert">
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={busy || rows.length < 2}>
            {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            {notReady.length === 0 ? "Combine" : "Make the set"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---- Sets table ---------------------------------------------------------------------------

function SetsTable({ sets }: { sets: SetRow[] | undefined }) {
  const [, navigate] = useLocation()
  const [q, setQ] = useState("")
  if (sets === undefined) return <TableSkeleton />
  const needle = q.trim().toLowerCase()
  const filtered = sets.filter((s) => !needle || s.title.toLowerCase().includes(needle) || (s.job ?? "").toLowerCase().includes(needle))

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="relative min-w-[260px] max-w-sm flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search Capture sets" className="pl-8 text-sm" />
        </div>
        <span className="ml-auto text-xs text-muted-foreground">
          {filtered.length} {filtered.length === 1 ? "Capture set" : "Capture sets"}
        </span>
      </div>
      {sets.length === 0 ? (
        <div className="rounded-xl border border-dashed p-8 text-center">
          <Layers className="mx-auto h-6 w-6 text-muted-foreground" />
          <p className="mt-2 text-sm font-medium">No Capture sets yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            On the Captures tab, select two or more Captures of the same job and choose Combine into a Capture set.
          </p>
          <Button size="sm" variant="outline" className="mt-3" asChild>
            <Link href="/library/captures">Go to Captures</Link>
          </Button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Capture set</th>
                <th className="px-3 py-2 text-right font-medium">Captures</th>
                <th className="px-3 py-2 text-right font-medium">Steps</th>
                <th className="px-3 py-2 font-medium">To decide</th>
                <th className="px-3 py-2 font-medium">Drafts</th>
                <th className="px-3 py-2 font-medium">Made</th>
                <th className="px-3 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((s) => (
                <tr key={s._id} onClick={() => navigate(`/library/capture-sets/${s._id}`)} className="h-14 cursor-pointer hover:bg-muted/40">
                  <td className="px-3 py-2">
                    <Link href={`/library/capture-sets/${s._id}`} className="font-medium hover:underline" onClick={(e) => e.stopPropagation()}>
                      {s.title}
                    </Link>
                    {s.job && s.job !== s.title && <p className="truncate text-xs text-muted-foreground">{s.job}</p>}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {s.captureCount}
                    <span className="ml-1 text-xs text-muted-foreground">by {s.authorCount}</span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{s.stepCount || ""}</td>
                  <td className="px-3 py-2">
                    {s.openDecisions > 0 ? (
                      <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-900">
                        {s.openDecisions} {s.openDecisions === 1 ? "Variation" : "Variations"}
                      </span>
                    ) : s.combinedAt ? (
                      <span className="text-xs text-muted-foreground">All decided</span>
                    ) : null}
                    {s.conflictCount > 0 && (
                      <span className="ml-1.5 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-800">
                        {s.conflictCount} {s.conflictCount === 1 ? "conflict" : "conflicts"}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 tabular-nums text-muted-foreground">{s.draftCount || ""}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                    {formatDate(s.createdAt)} · {s.createdBy}
                  </td>
                  <td className="px-3 py-2">
                    <SetStatus status={s.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export function SetStatus({ status }: { status: SetRow["status"] }) {
  const m = {
    idle: { label: "Not combined", tone: "border-slate-200 bg-slate-50 text-slate-700" },
    combining: { label: "Combining", tone: "border-amber-200 bg-amber-50 text-amber-800" },
    ready: { label: "Combined", tone: "border-emerald-200 bg-emerald-50 text-emerald-800" },
    failed: { label: "Could not combine", tone: "border-red-200 bg-red-50 text-red-700" },
  }[status]
  return <span className={`inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium ${m.tone}`}>{m.label}</span>
}
