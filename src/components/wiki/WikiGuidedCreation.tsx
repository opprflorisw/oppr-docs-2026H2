import { useState } from "react"
import { useAction, useMutation, useQuery } from "convex/react"
import { useLocation } from "wouter"
import { toast } from "sonner"
import { Check, ChevronsUpDown, FileText, Info, RotateCcw, Sparkles, X } from "lucide-react"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import { GuidedCreation } from "@/components/guided/GuidedCreation"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { useCheckIn } from "@/lib/checkIn"
import { cn } from "@/lib/utils"
import { FORMAT_HINT, FORMAT_LABEL, type WikiFormat } from "./wikiShared"
import { isEngineerOrAdmin } from "@/lib/roles"

export interface WikiDraft {
  title: string
  purpose: string
  format?: WikiFormat
  scope: {
    areas: string[]
    disciplines: string[]
    assetIds: Id<"assets">[]
    documentIds: Id<"documents">[]
    excludedDocumentIds?: Id<"documents">[]
  }
}

export const EMPTY_WIKI_DRAFT: WikiDraft = {
  title: "",
  purpose: "",
  format: "overview",
  scope: { areas: [], disciplines: [], assetIds: [], documentIds: [], excludedDocumentIds: [] },
}

const sameSet = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((x) => b.includes(x))

// Field labels, shared by "Changed in the draft" and the field highlights.
const F = {
  title: "Title",
  purpose: "Purpose",
  format: "Format",
  areas: "Areas",
  disciplines: "Disciplines",
  assets: "Assets",
  documents: "Documents",
  removed: "Taken out",
} as const

export function wikiDraftChanges(a: WikiDraft, b: WikiDraft): string[] {
  const out: string[] = []
  if (a.title !== b.title) out.push(F.title)
  if (a.purpose !== b.purpose) out.push(F.purpose)
  if ((a.format ?? "overview") !== (b.format ?? "overview")) out.push(F.format)
  if (!sameSet(a.scope.areas, b.scope.areas)) out.push(F.areas)
  if (!sameSet(a.scope.disciplines, b.scope.disciplines)) out.push(F.disciplines)
  if (!sameSet(a.scope.assetIds, b.scope.assetIds)) out.push(F.assets)
  if (!sameSet(a.scope.documentIds, b.scope.documentIds)) out.push(F.documents)
  if (!sameSet(a.scope.excludedDocumentIds ?? [], b.scope.excludedDocumentIds ?? [])) out.push(F.removed)
  return out
}

const EXAMPLES = [
  "Everything a new night-shift operator needs about changeovers on line 2",
  "Safety essentials for anyone working in Hall 2",
  "A quick reference of the settings of mixer MXR-101 for the mixing team",
]

// A Wiki reads well from a handful of documents; past this share of
// passages left unread, the Draft suggests narrowing the Scope.
const NARROW_BELOW = 0.6

// Guided creation for a Wiki. With `wikiId` it edits an existing Wiki's
// title, purpose, format and Scope (the content is always regenerated).
// Only a checked-in Engineer can create or change a Wiki.
export function WikiGuidedCreation({
  open,
  onOpenChange,
  wikiId,
  initial,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  wikiId?: Id<"wikis">
  initial?: WikiDraft
}) {
  const guide = useAction(api.ai.wiki.guide)
  const create = useMutation(api.wikis.create)
  const update = useMutation(api.wikis.update)
  const { person } = useCheckIn()
  const [, navigate] = useLocation()
  const editing = wikiId !== undefined
  const start = initial
    ? { ...initial, format: initial.format ?? "overview", scope: { ...initial.scope, excludedDocumentIds: initial.scope.excludedDocumentIds ?? [] } }
    : EMPTY_WIKI_DRAFT

  return (
    <GuidedCreation<WikiDraft>
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? "Edit Wiki scope" : "New Wiki"}
      greeting={
        editing
          ? "What should change? You can also edit the draft directly."
          : "Who is this Wiki for, and what should it cover? Mention Assets, areas or documents if you know them, and say if you want a step list or a quick reference."
      }
      examples={editing ? [] : EXAMPLES}
      initialDraft={start}
      ask={(messages, draft) => guide({ messages, draft })}
      changedFields={wikiDraftChanges}
      renderDraft={(draft, setDraft, changed) => (
        <WikiDraftFields draft={draft} onChange={setDraft} changed={changed} />
      )}
      renderSummary={(d) => <BuiltFromSummary scope={d.scope} />}
      blockedReason={(d) =>
        !isEngineerOrAdmin(person)
          ? "Check in as an Engineer to create or change a Wiki."
          : !d.title.trim()
            ? "Give the Wiki a title."
            : !d.purpose.trim()
              ? "Say who the Wiki is for and what they need from it."
              : d.scope.areas.length + d.scope.disciplines.length + d.scope.assetIds.length + d.scope.documentIds.length === 0
                ? "Choose at least one area, discipline, Asset or document."
                : null
      }
      createLabel={editing ? "Save and rebuild" : "Create Wiki"}
      onCreate={async (d) => {
        const scope = { ...d.scope, excludedDocumentIds: d.scope.excludedDocumentIds ?? [] }
        if (editing) {
          await update({ id: wikiId, title: d.title, purpose: d.purpose, format: d.format, scope, personId: person?._id })
          toast.success("Scope saved. The Wiki is being rebuilt.")
          onOpenChange(false)
        } else {
          const id = await create({ title: d.title, purpose: d.purpose, format: d.format, scope, personId: person?._id })
          onOpenChange(false)
          navigate(`/wiki/${id}`)
        }
      }}
    />
  )
}

function WikiDraftFields({
  draft,
  onChange,
  changed,
}: {
  draft: WikiDraft
  onChange: (d: WikiDraft) => void
  changed: ReadonlySet<string>
}) {
  const options = useQuery(api.wikis.scopeOptions)
  const preview = useQuery(api.wikis.previewScope, { scope: draft.scope })

  const setScope = (patch: Partial<WikiDraft["scope"]>) =>
    onChange({ ...draft, scope: { ...draft.scope, ...patch } })
  const toggle = <T,>(list: T[], value: T) =>
    list.includes(value) ? list.filter((x) => x !== value) : [...list, value]
  const removed = draft.scope.excludedDocumentIds ?? []
  const format = draft.format ?? "overview"

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="wiki-title" className="flex items-center gap-1.5 text-xs">
          Title <AiMark on={changed.has(F.title)} />
        </Label>
        <Input
          id="wiki-title"
          value={draft.title}
          onChange={(e) => onChange({ ...draft, title: e.target.value })}
          placeholder="e.g. Line 2 changeover essentials"
          className={cn("h-9 text-sm", changed.has(F.title) && "border-primary/60")}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="wiki-purpose" className="flex items-center gap-1.5 text-xs">
          Who it is for <AiMark on={changed.has(F.purpose)} />
        </Label>
        <Textarea
          id="wiki-purpose"
          value={draft.purpose}
          onChange={(e) => onChange({ ...draft, purpose: e.target.value })}
          placeholder="For night-shift operators who run changeovers on line 2"
          rows={2}
          className={cn("resize-none text-sm", changed.has(F.purpose) && "border-primary/60")}
        />
      </div>

      <div className="space-y-1.5">
        <p className="flex items-center gap-1.5 text-xs font-medium" id="wiki-format">
          Format <AiMark on={changed.has(F.format)} />
        </p>
        <div role="radiogroup" aria-labelledby="wiki-format" className="grid grid-cols-3 gap-2">
          {(["overview", "steps", "reference"] as const).map((f) => (
            <button
              key={f}
              type="button"
              role="radio"
              aria-checked={format === f}
              onClick={() => onChange({ ...draft, format: f })}
              className={cn(
                "rounded-md border px-2.5 py-2 text-left transition-colors",
                format === f ? "border-primary-strong bg-primary/10" : "bg-background [@media(hover:hover)]:hover:border-primary/50",
              )}
            >
              <span className="flex items-center gap-1 text-xs font-semibold">
                {format === f && <Check className="h-3 w-3 text-primary-strong" />}
                {FORMAT_LABEL[f]}
              </span>
              <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">{FORMAT_HINT[f]}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3 rounded-md border bg-background p-3">
        <div>
          <p className="text-xs font-semibold">Scope</p>
          <p className="text-xs text-muted-foreground">
            {preview?.sentence ?? "Which Published documents the Wiki is built from."}
          </p>
        </div>

        <ChipGroup
          label="Areas"
          aiChanged={changed.has(F.areas)}
          options={(options?.areas ?? []).map((a) => ({ value: a.code, label: a.label }))}
          selected={draft.scope.areas}
          onToggle={(v) => setScope({ areas: toggle(draft.scope.areas, v) })}
        />
        <ChipGroup
          label="Disciplines"
          aiChanged={changed.has(F.disciplines)}
          options={(options?.disciplines ?? []).map((d) => ({ value: d.code, label: d.label }))}
          selected={draft.scope.disciplines}
          onToggle={(v) => setScope({ disciplines: toggle(draft.scope.disciplines, v) })}
        />
        <ChipGroup
          label="Assets"
          aiChanged={changed.has(F.assets)}
          options={(options?.assets ?? []).map((a) => ({ value: a._id, label: `${a.code} ${a.name}` }))}
          selected={draft.scope.assetIds}
          onToggle={(v) => setScope({ assetIds: toggle(draft.scope.assetIds, v as Id<"assets">) })}
        />
        <DocumentPicker
          options={options?.documents ?? []}
          selected={draft.scope.documentIds}
          aiChanged={changed.has(F.documents)}
          onChange={(documentIds) =>
            setScope({ documentIds, excludedDocumentIds: removed.filter((id) => !documentIds.includes(id)) })
          }
        />
      </div>

      <div className="space-y-2 rounded-md border bg-background p-3">
        <div className="flex items-baseline gap-2">
          <p className="text-xs font-semibold">
            {preview === undefined
              ? "Checking the scope"
              : preview.empty
                ? "Built from: nothing yet"
                : `Built from ${preview.published.length} published ${preview.published.length === 1 ? "document" : "documents"}`}
          </p>
          {preview && preview.published.length > 0 && <CoverageMeter share={preview.coverage.readShare} />}
        </div>
        {preview && preview.published.length > 0 && preview.coverage.readShare < NARROW_BELOW && (
          <p className="rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-900 dark:bg-amber-500/10 dark:text-amber-100">
            {preview.published.length} documents, {Math.round(preview.coverage.readShare * 100)}% read. Narrow the
            Scope: pick an Asset instead of a whole area, or take out documents that do not fit with ×. A Wiki reads
            best from about 3 to 8 documents.
          </p>
        )}
        {preview && !preview.empty && preview.published.length === 0 && (
          <p className="text-xs text-amber-700 dark:text-amber-400">
            Nothing published matches this scope, so the Wiki would be empty.
          </p>
        )}
        <ul className="space-y-1">
          {preview?.published.map((d) => (
            <li key={d._id} className="group flex items-center gap-1.5 text-xs">
              <FileText className="h-3 w-3 shrink-0 text-muted-foreground" />
              <span className="font-mono text-muted-foreground">{d.namingCode}</span>
              <span className="min-w-0 truncate">{d.title}</span>
              <span className="ml-auto shrink-0 text-muted-foreground">{d.reason}</span>
              {!d.picked && (
                <button
                  type="button"
                  aria-label={`Take ${d.namingCode} out of the scope`}
                  title="Take out of the scope"
                  onClick={() => setScope({ excludedDocumentIds: [...removed, d._id] })}
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground [@media(hover:hover)]:hover:bg-muted [@media(hover:hover)]:hover:text-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
              {d.picked && (
                <button
                  type="button"
                  aria-label={`Remove ${d.namingCode}`}
                  title="Remove the pick"
                  onClick={() => setScope({ documentIds: draft.scope.documentIds.filter((x) => x !== d._id) })}
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground [@media(hover:hover)]:hover:bg-muted [@media(hover:hover)]:hover:text-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </li>
          ))}
        </ul>
        {preview && preview.removed.length > 0 && (
          <div className="space-y-1 border-t pt-2">
            <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              Taken out by hand <AiMark on={changed.has(F.removed)} />
            </p>
            {preview.removed.map((d) => (
              <p key={d._id} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="font-mono line-through">{d.namingCode}</span>
                <span className="min-w-0 truncate">{d.title}</span>
                <button
                  type="button"
                  onClick={() => setScope({ excludedDocumentIds: removed.filter((x) => x !== d._id) })}
                  className="ml-auto inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 font-medium text-primary-strong [@media(hover:hover)]:hover:bg-primary/10"
                >
                  <RotateCcw className="h-3 w-3" /> Put back
                </button>
              </p>
            ))}
          </div>
        )}
        {preview && preview.excluded.length > 0 && (
          <p className="flex items-start gap-1.5 border-t pt-2 text-xs text-muted-foreground">
            <Info className="mt-0.5 h-3 w-3 shrink-0" />
            {preview.excluded.length} more in this scope {preview.excluded.length === 1 ? "is" : "are"} not
            published ({preview.excluded.map((d) => d.namingCode).join(", ")}) and will not be used until
            {preview.excluded.length === 1 ? " it is" : " they are"} published.
          </p>
        )}
      </div>
    </div>
  )
}

/** How much of the Scope one build can read. */
function CoverageMeter({ share }: { share: number }) {
  const pct = Math.round(share * 100)
  return (
    <span className="ml-auto inline-flex items-center gap-1.5 text-xs text-muted-foreground" title="Share of the passages one build can read">
      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
        <span
          className={cn("block h-full rounded-full", share >= NARROW_BELOW ? "bg-emerald-500" : "bg-amber-500")}
          style={{ width: `${Math.max(4, pct)}%` }}
        />
      </span>
      {pct}% read
    </span>
  )
}

/**
 * The "Built from" count in one line, next to the Create button, so it is
 * visible at small window heights without scrolling the Draft. Same query as
 * the full list in the Draft, so Convex serves both from one subscription.
 */
function BuiltFromSummary({ scope }: { scope: WikiDraft["scope"] }) {
  const preview = useQuery(api.wikis.previewScope, { scope })
  if (preview === undefined) return <span className="text-muted-foreground">Checking the scope</span>
  if (preview.empty) return <span className="text-muted-foreground">Built from: nothing chosen yet</span>
  const n = preview.published.length
  const skipped = preview.excluded.length
  return (
    <span className="inline-flex items-center gap-1.5">
      <FileText className="h-3 w-3 text-muted-foreground" />
      <span className={cn("font-medium", n === 0 && "text-amber-700 dark:text-amber-400")}>
        {n === 0
          ? "Built from 0 published documents: the Wiki would be empty"
          : `Built from ${n} published ${n === 1 ? "document" : "documents"}`}
      </span>
      {n > 0 && preview.coverage.readShare < 1 && (
        <span className="text-muted-foreground">· {Math.round(preview.coverage.readShare * 100)}% read</span>
      )}
      {skipped > 0 && <span className="text-muted-foreground">· {skipped} not published, not used</span>}
    </span>
  )
}

/** Marks a field the AI changed on its last turn. */
function AiMark({ on }: { on: boolean }) {
  if (!on) return null
  return (
    <span className="inline-flex items-center gap-0.5 rounded-full bg-primary/10 px-1.5 py-px text-xs font-medium text-primary-strong">
      <Sparkles className="h-2.5 w-2.5" />
      Just changed
    </span>
  )
}

function ChipGroup({
  label,
  aiChanged,
  options,
  selected,
  onToggle,
}: {
  label: string
  aiChanged: boolean
  options: { value: string; label: string }[]
  selected: string[]
  onToggle: (value: string) => void
}) {
  return (
    <div className="space-y-1.5">
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground" id={`chips-${label}`}>
        {label} <AiMark on={aiChanged} />
      </p>
      <div className="flex flex-wrap gap-1.5" role="group" aria-labelledby={`chips-${label}`}>
        {options.length === 0 && <span className="text-xs text-muted-foreground">None available</span>}
        {options.map((o) => {
          const on = selected.includes(o.value)
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => onToggle(o.value)}
              aria-pressed={on}
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors",
                on
                  ? "border-primary-strong bg-primary-strong text-white"
                  : "bg-background [@media(hover:hover)]:hover:border-primary/50",
              )}
            >
              {on && <Check className="h-3 w-3" />}
              {o.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function DocumentPicker({
  options,
  selected,
  aiChanged,
  onChange,
}: {
  options: { _id: Id<"documents">; namingCode: string; title: string }[]
  selected: Id<"documents">[]
  aiChanged: boolean
  onChange: (ids: Id<"documents">[]) => void
}) {
  const [open, setOpen] = useState(false)
  const byId = new Map(options.map((d) => [d._id, d]))
  return (
    <div className="space-y-1.5">
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        Picked documents <AiMark on={aiChanged} />
      </p>
      <div className="flex flex-wrap gap-1.5">
        {selected.map((id) => {
          const d = byId.get(id)
          return (
            <span
              key={id}
              className="inline-flex items-center gap-1 rounded-full border border-primary bg-primary/10 px-2.5 py-1 text-xs"
            >
              <span className="font-mono">{d?.namingCode ?? "Not published"}</span>
              <button
                type="button"
                aria-label={`Remove ${d?.namingCode ?? "document"}`}
                onClick={() => onChange(selected.filter((x) => x !== id))}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          )
        })}
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-full border border-dashed px-2.5 py-1 text-xs text-muted-foreground hover:border-primary/50 hover:text-foreground"
            >
              Add document
              <ChevronsUpDown className="h-3 w-3" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-80 p-0" align="start">
            <Command>
              <CommandInput placeholder="Search Published documents" className="text-xs" />
              <CommandList>
                <CommandEmpty>No Published document found.</CommandEmpty>
                <CommandGroup>
                  {options.map((d) => (
                    <CommandItem
                      key={d._id}
                      value={`${d.namingCode} ${d.title}`}
                      onSelect={() => {
                        onChange(selected.includes(d._id) ? selected.filter((x) => x !== d._id) : [...selected, d._id])
                      }}
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
    </div>
  )
}
