import { useMemo, useState } from "react"
import { useAction, useMutation, useQuery } from "convex/react"
import { useLocation } from "wouter"
import { toast } from "sonner"
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronsUpDown,
  FileText,
  MapPin,
  Plus,
  Quote,
  Sparkles,
  Trash2,
  X,
} from "lucide-react"
import { api } from "../../../../convex/_generated/api"
import type { Id } from "../../../../convex/_generated/dataModel"
import { GuidedCreation } from "@/components/guided/GuidedCreation"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useCheckIn } from "@/lib/checkIn"
import { cn } from "@/lib/utils"
import { KindIcon, type TrainingKind } from "./lib"

export interface TrainingDraft {
  title: string
  kind: TrainingKind
  area: string | null
  purpose: string
  documentIds: Id<"documents">[]
  objectives: {
    id: string
    text: string
    documentId: Id<"documents">
    chunkId: Id<"chunks"> | null
    quote: string
  }[]
  stops: {
    assetId: Id<"assets">
    objectiveIds: string[]
    hint: string
    evidence: "none" | "photo" | "note"
  }[]
  passMark: number
  questionsPerObjective: number
}

export const EMPTY_TRAINING_DRAFT: TrainingDraft = {
  title: "",
  kind: "course",
  area: null,
  purpose: "",
  documentIds: [],
  objectives: [],
  stops: [],
  passMark: 80,
  questionsPerObjective: 1,
}

const F = {
  title: "Title",
  kind: "Kind",
  area: "Area",
  purpose: "Purpose",
  documents: "Source documents",
  objectives: "Learning objectives",
  stops: "Stops",
  passMark: "Pass mark",
  questions: "Questions per objective",
} as const

const sameSet = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((x) => b.includes(x))

export function trainingDraftChanges(a: TrainingDraft, b: TrainingDraft): string[] {
  const out: string[] = []
  if (a.title !== b.title) out.push(F.title)
  if (a.kind !== b.kind) out.push(F.kind)
  if (a.area !== b.area) out.push(F.area)
  if (a.purpose !== b.purpose) out.push(F.purpose)
  if (!sameSet(a.documentIds, b.documentIds)) out.push(F.documents)
  if (JSON.stringify(a.objectives) !== JSON.stringify(b.objectives)) out.push(F.objectives)
  if (JSON.stringify(a.stops) !== JSON.stringify(b.stops)) out.push(F.stops)
  if (a.passMark !== b.passMark) out.push(F.passMark)
  if (a.questionsPerObjective !== b.questionsPerObjective) out.push(F.questions)
  return out
}

export function trainingDraftBlocked(d: TrainingDraft): string | null {
  if (!d.title.trim()) return "Give the Training a title."
  if (d.objectives.length === 0) return "Add at least one Learning objective."
  const noText = d.objectives.findIndex((o) => !o.text.trim())
  if (noText >= 0) return `Learning objective ${noText + 1} needs a text.`
  const noSource = d.objectives.findIndex((o) => !o.chunkId)
  if (noSource >= 0) return `Learning objective ${noSource + 1} needs a source passage.`
  if (d.kind === "round") {
    if (d.stops.length === 0) return "A Round needs at least one stop."
    const covered = new Set(d.stops.flatMap((s) => s.objectiveIds))
    const loose = d.objectives.findIndex((o) => !covered.has(o.id))
    if (loose >= 0) return `Learning objective ${loose + 1} is not tested at any stop.`
  }
  return null
}

/** What the server stores: the Draft without the assistant's document list. */
function toServerDraft(d: TrainingDraft) {
  return {
    title: d.title,
    kind: d.kind,
    area: d.area,
    purpose: d.purpose,
    objectives: d.objectives,
    stops: d.kind === "round" ? d.stops : [],
    passMark: d.passMark,
    questionsPerObjective: d.questionsPerObjective,
  }
}

const EXAMPLES = [
  "A short course for new line 2 operators on changeovers",
  "A safety Round along line 2: lockout, the hot die and the saw",
  "Wall thickness measurement for quality lab technicians",
]

/**
 * Guided creation of a Training (CONTEXT.md). The assistant proposes the
 * Draft, with every Learning objective tied to a Published passage; the
 * person adjusts it and presses Create. With `trainingId` it edits the
 * working version of an existing Training.
 */
export function TrainingGuidedCreation({
  open,
  onOpenChange,
  trainingId,
  initial,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  trainingId?: Id<"trainings">
  initial?: TrainingDraft
}) {
  const guide = useAction(api.ai.training.guide)
  const create = useMutation(api.trainings.create)
  const update = useMutation(api.trainings.update)
  const { person } = useCheckIn()
  const [, navigate] = useLocation()
  const editing = trainingId !== undefined

  return (
    <GuidedCreation<TrainingDraft>
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? "Edit Training" : "New Training"}
      greeting={
        editing
          ? "What should change? You can also edit the draft directly."
          : "Who is this Training for, and what must they be able to do? I'll pick the published documents and propose Learning objectives that each trace to a passage."
      }
      examples={editing ? [] : EXAMPLES}
      initialDraft={initial ?? EMPTY_TRAINING_DRAFT}
      ask={(messages, draft) => guide({ messages, draft })}
      changedFields={trainingDraftChanges}
      renderDraft={(draft, setDraft, changed) => (
        <TrainingDraftFields draft={draft} onChange={setDraft} changed={changed} />
      )}
      renderSummary={(d) => (
        <span className="inline-flex items-center gap-1.5">
          <KindIcon kind={d.kind} className="h-3 w-3 text-muted-foreground" />
          <span className="font-medium">
            {d.objectives.length} {d.objectives.length === 1 ? "objective" : "objectives"}
            {d.kind === "round" && ` · ${d.stops.length} ${d.stops.length === 1 ? "stop" : "stops"}`}
          </span>
          <span className="text-muted-foreground">
            · {d.objectives.length * d.questionsPerObjective} questions per Attempt · pass at {d.passMark}%
          </span>
        </span>
      )}
      blockedReason={trainingDraftBlocked}
      createLabel={editing ? "Save draft" : "Create draft"}
      onCreate={async (d) => {
        if (editing) {
          const res = await update({ id: trainingId, draft: toServerDraft(d), personId: person?._id })
          toast.success(res.backToDraft ? "Saved. The Training is back in draft and needs review again." : "Draft saved")
          onOpenChange(false)
        } else {
          const id = await create({ draft: toServerDraft(d), personId: person?._id })
          toast.success("Draft created. Send it for review when it is ready.")
          onOpenChange(false)
          navigate(`/learn/trainings/${id}`)
        }
      }}
    />
  )
}

// ---- Draft fields ----------------------------------------------------------------

type Options = NonNullable<ReturnType<typeof useDraftOptions>>
function useDraftOptions() {
  return useQuery(api.trainings.draftOptions)
}

function TrainingDraftFields({
  draft,
  onChange,
  changed,
}: {
  draft: TrainingDraft
  onChange: (d: TrainingDraft) => void
  changed: ReadonlySet<string>
}) {
  const options = useDraftOptions()
  const docById = useMemo(() => new Map((options?.documents ?? []).map((d) => [d._id, d])), [options])
  const set = (patch: Partial<TrainingDraft>) => onChange({ ...draft, ...patch })

  const nextId = () => {
    let n = draft.objectives.length + 1
    while (draft.objectives.some((o) => o.id === `o${n}`)) n += 1
    return `o${n}`
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="trn-title" className="flex items-center gap-1.5 text-xs">
          Title <AiMark on={changed.has(F.title)} />
        </Label>
        <Input
          id="trn-title"
          value={draft.title}
          onChange={(e) => set({ title: e.target.value })}
          placeholder="e.g. Line 2 changeover"
          className={cn("h-8 text-sm", changed.has(F.title) && "border-primary/60")}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <p className="flex items-center gap-1.5 text-xs font-medium">
            Kind <AiMark on={changed.has(F.kind)} />
          </p>
          <div className="flex gap-1.5" role="group" aria-label="Kind">
            {(["course", "round"] as const).map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={draft.kind === k}
                onClick={() => set({ kind: k })}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs transition-colors",
                  draft.kind === k ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:border-primary/50",
                )}
              >
                <KindIcon kind={k} className="h-3.5 w-3.5" />
                {k === "course" ? "Course" : "Round"}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground">
            {draft.kind === "course" ? "Done at a desk or on a phone." : "Walked in the plant: Scan each Asset in order."}
          </p>
        </div>
        <div className="space-y-1.5">
          <p className="flex items-center gap-1.5 text-xs font-medium">
            Area <AiMark on={changed.has(F.area)} />
          </p>
          <Select value={draft.area ?? ""} onValueChange={(v) => set({ area: v || null })}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Choose an area" />
            </SelectTrigger>
            <SelectContent>
              {(options?.areas ?? []).map((a) => (
                <SelectItem key={a.code} value={a.code} className="text-xs">
                  <span className="font-mono">{a.code}</span> {a.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground">Sets the code: {draft.area ?? "AREA"}-TRN-…</p>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="trn-purpose" className="flex items-center gap-1.5 text-xs">
          Purpose and audience <AiMark on={changed.has(F.purpose)} />
        </Label>
        <Textarea
          id="trn-purpose"
          value={draft.purpose}
          onChange={(e) => set({ purpose: e.target.value })}
          placeholder="Who is it for, and what must they be able to do afterwards?"
          rows={2}
          className={cn("resize-none text-sm", changed.has(F.purpose) && "border-primary/60")}
        />
      </div>

      <DocumentChips
        options={options?.documents ?? []}
        selected={draft.documentIds}
        aiChanged={changed.has(F.documents)}
        onChange={(documentIds) => set({ documentIds })}
      />

      {/* Objectives */}
      <div className="space-y-2 rounded-md border bg-background p-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="flex items-center gap-1.5 text-xs font-semibold">
              Learning objectives <AiMark on={changed.has(F.objectives)} />
            </p>
            <p className="text-[11px] text-muted-foreground">
              Each one is tested in every Attempt and traces to a published passage.
            </p>
          </div>
          <PassagePicker
            documents={options?.documents ?? []}
            preferred={draft.documentIds[0] ?? draft.objectives.at(-1)?.documentId ?? null}
            onPick={(p) =>
              set({
                objectives: [...draft.objectives, { id: nextId(), text: "", ...p }],
                documentIds: draft.documentIds.includes(p.documentId) ? draft.documentIds : [...draft.documentIds, p.documentId],
              })
            }
          >
            <Button size="sm" variant="outline" className="h-7 shrink-0 gap-1 text-xs">
              <Plus className="h-3 w-3" /> Add objective
            </Button>
          </PassagePicker>
        </div>
        {draft.objectives.length === 0 ? (
          <p className="rounded-md border border-dashed px-3 py-4 text-center text-[11px] text-muted-foreground">
            No objectives yet. Describe the Training on the left, or add one from a published passage.
          </p>
        ) : (
          <ol className="space-y-2">
            {draft.objectives.map((o, i) => {
              const doc = docById.get(o.documentId)
              return (
                <li key={o.id} className="space-y-1.5 rounded-md border bg-muted/20 p-2">
                  <div className="flex items-start gap-2">
                    <span className="mt-1.5 w-4 shrink-0 text-right text-[11px] font-semibold tabular-nums text-muted-foreground">
                      {i + 1}
                    </span>
                    <Textarea
                      value={o.text}
                      onChange={(e) =>
                        set({ objectives: draft.objectives.map((x) => (x.id === o.id ? { ...x, text: e.target.value } : x)) })
                      }
                      placeholder="What must the person know or do?"
                      rows={1}
                      aria-label={`Learning objective ${i + 1}`}
                      className="min-h-[32px] resize-none py-1.5 text-xs"
                    />
                    <button
                      type="button"
                      aria-label={`Remove objective ${i + 1}`}
                      onClick={() =>
                        set({
                          objectives: draft.objectives.filter((x) => x.id !== o.id),
                          stops: draft.stops.map((s) => ({ ...s, objectiveIds: s.objectiveIds.filter((x) => x !== o.id) })),
                        })
                      }
                      className="mt-1 rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="ml-6 flex items-start gap-1.5 text-[11px] text-muted-foreground">
                    <Quote className="mt-0.5 h-3 w-3 shrink-0" />
                    <span className="min-w-0 flex-1">
                      <span className="font-mono text-foreground/80">{doc?.namingCode ?? "Not published"}</span>{" "}
                      <span className="line-clamp-2 italic">"{o.quote}"</span>
                    </span>
                    <PassagePicker
                      documents={options?.documents ?? []}
                      preferred={o.documentId}
                      onPick={(p) =>
                        set({
                          objectives: draft.objectives.map((x) => (x.id === o.id ? { ...x, ...p } : x)),
                          documentIds: draft.documentIds.includes(p.documentId)
                            ? draft.documentIds
                            : [...draft.documentIds, p.documentId],
                        })
                      }
                    >
                      <button type="button" className="shrink-0 font-medium text-primary hover:underline">
                        Change
                      </button>
                    </PassagePicker>
                  </div>
                </li>
              )
            })}
          </ol>
        )}
      </div>

      {draft.kind === "round" && (
        <StopsEditor
          draft={draft}
          assets={options?.assets ?? []}
          aiChanged={changed.has(F.stops)}
          onChange={(stops) => set({ stops })}
        />
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="trn-pass" className="flex items-center gap-1.5 text-xs">
            Pass mark <AiMark on={changed.has(F.passMark)} />
          </Label>
          <div className="flex items-center gap-1.5">
            <Input
              id="trn-pass"
              type="number"
              min={50}
              max={100}
              step={5}
              value={draft.passMark}
              onChange={(e) => set({ passMark: Math.max(50, Math.min(100, Number(e.target.value) || 80)) })}
              className="h-8 w-20 text-sm"
            />
            <span className="text-xs text-muted-foreground">% of questions right</span>
          </div>
        </div>
        <div className="space-y-1.5">
          <p className="flex items-center gap-1.5 text-xs font-medium">
            Questions per objective <AiMark on={changed.has(F.questions)} />
          </p>
          <Select
            value={String(draft.questionsPerObjective)}
            onValueChange={(v) => set({ questionsPerObjective: Number(v) })}
          >
            <SelectTrigger className="h-8 w-20 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[1, 2, 3].map((n) => (
                <SelectItem key={n} value={String(n)} className="text-xs">
                  {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  )
}

function StopsEditor({
  draft,
  assets,
  aiChanged,
  onChange,
}: {
  draft: TrainingDraft
  assets: Options["assets"]
  aiChanged: boolean
  onChange: (stops: TrainingDraft["stops"]) => void
}) {
  const stops = draft.stops
  const used = new Set(stops.map((s) => s.assetId))
  const free = assets.filter((a) => !used.has(a._id))
  const patch = (i: number, p: Partial<TrainingDraft["stops"][number]>) =>
    onChange(stops.map((s, j) => (j === i ? { ...s, ...p } : s)))
  const move = (i: number, d: -1 | 1) => {
    const next = [...stops]
    const [s] = next.splice(i, 1)
    next.splice(i + d, 0, s)
    onChange(next)
  }
  return (
    <div className="space-y-2 rounded-md border bg-background p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="flex items-center gap-1.5 text-xs font-semibold">
            Stops <AiMark on={aiChanged} />
          </p>
          <p className="text-[11px] text-muted-foreground">The Assets to visit, in walking order, and what is tested at each.</p>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-7 shrink-0 gap-1 text-xs"
          disabled={free.length === 0}
          onClick={() => onChange([...stops, { assetId: free[0]._id, objectiveIds: [], hint: "", evidence: "none" }])}
        >
          <Plus className="h-3 w-3" /> Add stop
        </Button>
      </div>
      {stops.length === 0 && (
        <p className="rounded-md border border-dashed px-3 py-4 text-center text-[11px] text-muted-foreground">
          No stops yet. A Round needs at least one Asset to walk to.
        </p>
      )}
      <ol className="space-y-2">
        {stops.map((s, i) => (
          <li key={`${s.assetId}-${i}`} className="space-y-2 rounded-md border bg-muted/20 p-2">
            <div className="flex items-center gap-1.5">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
                {i + 1}
              </span>
              <Select value={s.assetId} onValueChange={(v) => patch(i, { assetId: v as Id<"assets"> })}>
                <SelectTrigger className="h-7 flex-1 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {assets
                    .filter((a) => a._id === s.assetId || !used.has(a._id))
                    .map((a) => (
                      <SelectItem key={a._id} value={a._id} className="text-xs">
                        <span className="font-mono">{a.code}</span> {a.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <Select value={s.evidence} onValueChange={(v) => patch(i, { evidence: v as "none" | "photo" | "note" })}>
                <SelectTrigger className="h-7 w-[118px] text-xs" aria-label="Evidence at this stop">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none" className="text-xs">No evidence</SelectItem>
                  <SelectItem value="photo" className="text-xs">Ask a photo</SelectItem>
                  <SelectItem value="note" className="text-xs">Ask a note</SelectItem>
                </SelectContent>
              </Select>
              <div className="flex">
                <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)} className="rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-30">
                  <ArrowUp className="h-3 w-3" />
                </button>
                <button type="button" aria-label="Move down" disabled={i === stops.length - 1} onClick={() => move(i, 1)} className="rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-30">
                  <ArrowDown className="h-3 w-3" />
                </button>
                <button type="button" aria-label={`Remove stop ${i + 1}`} onClick={() => onChange(stops.filter((_, j) => j !== i))} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive">
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            </div>
            <Input
              value={s.hint}
              onChange={(e) => patch(i, { hint: e.target.value })}
              placeholder="How to find it, e.g. at the end of line 2"
              className="h-7 text-xs"
              aria-label={`Hint for stop ${i + 1}`}
            />
            <div className="flex flex-wrap items-center gap-1">
              <span className="mr-1 text-[11px] text-muted-foreground">Tests objectives:</span>
              {draft.objectives.length === 0 && <span className="text-[11px] text-muted-foreground">none yet</span>}
              {draft.objectives.map((o, k) => {
                const on = s.objectiveIds.includes(o.id)
                return (
                  <button
                    key={o.id}
                    type="button"
                    title={o.text}
                    aria-pressed={on}
                    onClick={() =>
                      patch(i, { objectiveIds: on ? s.objectiveIds.filter((x) => x !== o.id) : [...s.objectiveIds, o.id] })
                    }
                    className={cn(
                      "h-6 min-w-6 rounded-full border px-1.5 text-[11px] tabular-nums transition-colors",
                      on ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:border-primary/50",
                    )}
                  >
                    {k + 1}
                  </button>
                )
              })}
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}

/** Choose a published document, then one of its passages. */
function PassagePicker({
  documents,
  preferred,
  onPick,
  children,
}: {
  documents: Options["documents"]
  preferred: Id<"documents"> | null
  onPick: (p: { documentId: Id<"documents">; chunkId: Id<"chunks">; quote: string }) => void
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [docId, setDocId] = useState<Id<"documents"> | null>(null)
  const current = docId ?? preferred ?? documents[0]?._id ?? null
  const data = useQuery(api.trainings.passages, open && current ? { documentId: current } : "skip")
  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) setDocId(null)
      }}
    >
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-[420px] p-0" align="end">
        <div className="border-b p-2">
          <Select value={current ?? ""} onValueChange={(v) => setDocId(v as Id<"documents">)}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Choose a published document" />
            </SelectTrigger>
            <SelectContent>
              {documents.map((d) => (
                <SelectItem key={d._id} value={d._id} className="text-xs">
                  <span className="font-mono">{d.namingCode}</span> {d.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Command>
          <CommandInput placeholder="Search passages…" className="text-xs" />
          <CommandList className="max-h-72">
            <CommandEmpty>{data === undefined ? "Loading passages…" : "No passage matches."}</CommandEmpty>
            {data && (
              <CommandGroup heading={`${data.namingCode} v${data.version}, published`}>
                {data.passages.map((p) => (
                  <CommandItem
                    key={p.chunkId}
                    value={`${p.section ?? ""} ${p.text}`}
                    onSelect={() => {
                      onPick({ documentId: data.documentId, chunkId: p.chunkId, quote: p.text })
                      setOpen(false)
                    }}
                    className="flex-col items-start gap-0.5 text-xs"
                  >
                    {p.section && <span className="text-[10px] text-muted-foreground">{p.section}</span>}
                    <span className="line-clamp-3">{p.text}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

function DocumentChips({
  options,
  selected,
  aiChanged,
  onChange,
}: {
  options: Options["documents"]
  selected: Id<"documents">[]
  aiChanged: boolean
  onChange: (ids: Id<"documents">[]) => void
}) {
  const [open, setOpen] = useState(false)
  const byId = new Map(options.map((d) => [d._id, d]))
  return (
    <div className="space-y-1.5">
      <p className="flex items-center gap-1.5 text-xs font-medium">
        Source documents <AiMark on={aiChanged} />
      </p>
      <div className="flex flex-wrap gap-1.5">
        {selected.map((id) => {
          const d = byId.get(id)
          return (
            <span
              key={id}
              title={d?.title}
              className="inline-flex items-center gap-1 rounded-full border border-primary bg-primary/10 px-2.5 py-1 text-[11px]"
            >
              <FileText className="h-3 w-3 text-primary" />
              <span className="font-mono">{d?.namingCode ?? "Not published"}</span>
              <button type="button" aria-label={`Remove ${d?.namingCode ?? "document"}`} onClick={() => onChange(selected.filter((x) => x !== id))}>
                <X className="h-3 w-3" />
              </button>
            </span>
          )
        })}
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-full border border-dashed px-2.5 py-1 text-[11px] text-muted-foreground hover:border-primary/50 hover:text-foreground"
            >
              Add document
              <ChevronsUpDown className="h-3 w-3" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-80 p-0" align="start">
            <Command>
              <CommandInput placeholder="Search published documents…" className="text-xs" />
              <CommandList>
                <CommandEmpty>No published document found.</CommandEmpty>
                <CommandGroup>
                  {options.map((d) => (
                    <CommandItem
                      key={d._id}
                      value={`${d.namingCode} ${d.title}`}
                      onSelect={() =>
                        onChange(selected.includes(d._id) ? selected.filter((x) => x !== d._id) : [...selected, d._id])
                      }
                      className="text-xs"
                    >
                      <Check className={cn("mr-1.5 h-3 w-3", selected.includes(d._id) ? "opacity-100" : "opacity-0")} />
                      <span className="font-mono text-muted-foreground">{d.namingCode}</span>
                      <span className="ml-1.5 truncate">{d.title}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>
      <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
        <MapPin className="h-3 w-3" />
        Only published documents can be used. The assistant reads their passages to propose objectives.
      </p>
    </div>
  )
}

/** Marks a field the AI changed on its last turn. */
function AiMark({ on }: { on: boolean }) {
  if (!on) return null
  return (
    <span className="inline-flex items-center gap-0.5 rounded-full bg-primary/10 px-1.5 py-px text-[10px] font-medium text-primary">
      <Sparkles className="h-2.5 w-2.5" />
      Just changed
    </span>
  )
}
