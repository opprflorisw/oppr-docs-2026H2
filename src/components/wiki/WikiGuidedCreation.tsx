import { useState } from "react"
import { useAction, useMutation, useQuery } from "convex/react"
import { useLocation } from "wouter"
import { toast } from "sonner"
import { Check, ChevronsUpDown, FileText, Info, Sparkles, X } from "lucide-react"
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
import { cn } from "@/lib/utils"

export interface WikiDraft {
  title: string
  purpose: string
  scope: {
    areas: string[]
    disciplines: string[]
    assetIds: Id<"assets">[]
    documentIds: Id<"documents">[]
  }
}

export const EMPTY_WIKI_DRAFT: WikiDraft = {
  title: "",
  purpose: "",
  scope: { areas: [], disciplines: [], assetIds: [], documentIds: [] },
}

const sameSet = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((x) => b.includes(x))

// Field labels, shared by "Changed in the draft" and the field highlights.
const F = {
  title: "Title",
  purpose: "Purpose",
  areas: "Areas",
  disciplines: "Disciplines",
  assets: "Machines",
  documents: "Documents",
} as const

export function wikiDraftChanges(a: WikiDraft, b: WikiDraft): string[] {
  const out: string[] = []
  if (a.title !== b.title) out.push(F.title)
  if (a.purpose !== b.purpose) out.push(F.purpose)
  if (!sameSet(a.scope.areas, b.scope.areas)) out.push(F.areas)
  if (!sameSet(a.scope.disciplines, b.scope.disciplines)) out.push(F.disciplines)
  if (!sameSet(a.scope.assetIds, b.scope.assetIds)) out.push(F.assets)
  if (!sameSet(a.scope.documentIds, b.scope.documentIds)) out.push(F.documents)
  return out
}

const EXAMPLES = [
  "Everything a new night-shift operator needs about changeovers on line 2",
  "Safety essentials for anyone working in Hall 2",
  "A quick overview of mixer MXR-101 for the mixing team",
]

// Guided creation for a Wiki. With `wikiId` it edits an existing Wiki's
// title, purpose and Scope (the content is always regenerated).
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
  const [, navigate] = useLocation()
  const editing = wikiId !== undefined

  return (
    <GuidedCreation<WikiDraft>
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? "Edit Wiki scope" : "New Wiki"}
      greeting={
        editing
          ? "What should change? You can also edit the draft directly."
          : "Who is this Wiki for, and what should it cover? Mention machines, areas or documents if you know them."
      }
      examples={editing ? [] : EXAMPLES}
      initialDraft={initial ?? EMPTY_WIKI_DRAFT}
      ask={(messages, draft) => guide({ messages, draft })}
      changedFields={wikiDraftChanges}
      renderDraft={(draft, setDraft, changed) => (
        <WikiDraftFields draft={draft} onChange={setDraft} changed={changed} />
      )}
      blockedReason={(d) =>
        !d.title.trim()
          ? "Give the Wiki a title."
          : d.scope.areas.length + d.scope.disciplines.length + d.scope.assetIds.length + d.scope.documentIds.length === 0
            ? "Choose at least one area, discipline, machine or document."
            : null
      }
      createLabel={editing ? "Save and rebuild" : "Create Wiki"}
      onCreate={async (d) => {
        if (editing) {
          await update({ id: wikiId, title: d.title, purpose: d.purpose, scope: d.scope })
          toast.success("Scope saved. The Wiki is being rebuilt.")
          onOpenChange(false)
        } else {
          const id = await create({ title: d.title, purpose: d.purpose, scope: d.scope })
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
          className={cn("h-8 text-sm", changed.has(F.title) && "border-primary/60")}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="wiki-purpose" className="flex items-center gap-1.5 text-xs">
          Purpose and audience <AiMark on={changed.has(F.purpose)} />
        </Label>
        <Textarea
          id="wiki-purpose"
          value={draft.purpose}
          onChange={(e) => onChange({ ...draft, purpose: e.target.value })}
          placeholder="Who is it for, and what do they need from it?"
          rows={2}
          className={cn("resize-none text-sm", changed.has(F.purpose) && "border-primary/60")}
        />
      </div>

      <div className="space-y-3 rounded-md border bg-background p-3">
        <div>
          <p className="text-xs font-semibold">Scope</p>
          <p className="text-[11px] text-muted-foreground">
            Which published knowledge the Wiki is built from.
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
          label="Machines"
          aiChanged={changed.has(F.assets)}
          options={(options?.assets ?? []).map((a) => ({ value: a._id, label: `${a.code} ${a.name}` }))}
          selected={draft.scope.assetIds}
          onToggle={(v) => setScope({ assetIds: toggle(draft.scope.assetIds, v as Id<"assets">) })}
        />
        <DocumentPicker
          options={options?.documents ?? []}
          selected={draft.scope.documentIds}
          aiChanged={changed.has(F.documents)}
          onChange={(documentIds) => setScope({ documentIds })}
        />
      </div>

      <div className="space-y-2 rounded-md border bg-background p-3">
        <p className="text-xs font-semibold">
          {preview === undefined
            ? "Checking the scope…"
            : preview.empty
              ? "Built from: nothing yet"
              : `Built from ${preview.published.length} published ${preview.published.length === 1 ? "document" : "documents"}`}
        </p>
        {preview && !preview.empty && preview.published.length === 0 && (
          <p className="text-[11px] text-amber-700 dark:text-amber-400">
            Nothing published matches this scope, so the Wiki would be empty.
          </p>
        )}
        <ul className="space-y-1">
          {preview?.published.map((d) => (
            <li key={d._id} className="flex items-center gap-1.5 text-[11px]">
              <FileText className="h-3 w-3 shrink-0 text-muted-foreground" />
              <span className="font-mono text-muted-foreground">{d.namingCode}</span>
              <span className="truncate">{d.title}</span>
              <span className="ml-auto shrink-0 text-muted-foreground">v{d.version}</span>
            </li>
          ))}
        </ul>
        {preview && preview.excluded.length > 0 && (
          <p className="flex items-start gap-1.5 border-t pt-2 text-[11px] text-muted-foreground">
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
      <p className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground" id={`chips-${label}`}>
        {label} <AiMark on={aiChanged} />
      </p>
      <div className="flex flex-wrap gap-1.5" role="group" aria-labelledby={`chips-${label}`}>
        {options.length === 0 && <span className="text-[11px] text-muted-foreground">None available</span>}
        {options.map((o) => {
          const on = selected.includes(o.value)
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => onToggle(o.value)}
              aria-pressed={on}
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] transition-colors",
                on
                  ? "border-primary bg-primary text-primary-foreground"
                  : "bg-background hover:border-primary/50",
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
      <p className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
        Specific documents <AiMark on={aiChanged} />
      </p>
      <div className="flex flex-wrap gap-1.5">
        {selected.map((id) => {
          const d = byId.get(id)
          return (
            <span
              key={id}
              className="inline-flex items-center gap-1 rounded-full border border-primary bg-primary/10 px-2.5 py-1 text-[11px]"
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
