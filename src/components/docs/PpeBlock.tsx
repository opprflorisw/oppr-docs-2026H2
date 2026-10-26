// PpeBlock — block-level row of PPE pictogram chips for procedure headers.
//
// Stores the selected PPE item slugs as a comma-separated string in
// `data-items`. Render is a horizontal flex row of pictogram + label chips. The
// block is `atom: true` so the row is treated as a single unit (you can't type
// inside it).
//
// The catalog is the configurable ppeItems table (Templates → Safety), read
// through usePpeCatalog. The picker shows active items; the read view resolves
// any stored slug (including deactivated ones). Pictograms are the bundled
// ISO-7010-style SVGs in src/lib/ppePictograms.ts.

import { useState } from "react"
import { Node, mergeAttributes, type RawCommands } from "@tiptap/core"
import {
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from "@tiptap/react"
import { Check, CornerDownLeft, HardHat, Plus, Trash2 } from "lucide-react"
import { ppeImageSrc } from "@/lib/ppeCatalog"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { usePpeCatalog } from "@/lib/ppeCatalog"

// A PPE item is now any catalog slug.
export type PpeItem = string

// Block image sizes. "lg" is deliberately modest — readable without dominating
// the page. The title-page band uses its own fixed 16px regardless of this.
export type PpeSize = "sm" | "md" | "lg"
const PICTO_PX: Record<PpeSize, number> = { sm: 18, md: 28, lg: 44 }
function normSize(v: unknown): PpeSize {
  return v === "sm" || v === "lg" ? v : "md"
}

function Pictogram({
  meta,
  size = 16,
}: {
  meta: { imageUrl?: string | null; pictogramId: string }
  size?: number
}) {
  return (
    <img
      src={ppeImageSrc(meta)}
      alt=""
      width={size}
      height={size}
      className="shrink-0 object-contain"
      draggable={false}
    />
  )
}

function parseItems(raw: string | undefined): string[] {
  if (!raw) return []
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
}

function PpeView({
  node,
  updateAttributes,
  deleteNode,
  editor,
  getPos,
  selected,
}: NodeViewProps) {
  const items = parseItems(node.attrs.items as string | undefined)
  const size = normSize(node.attrs.size)
  const editable = editor?.isEditable ?? false
  const [editOpen, setEditOpen] = useState(false)
  const { active, resolve } = usePpeCatalog()

  function toggle(slug: string) {
    const set = new Set(items)
    if (set.has(slug)) set.delete(slug)
    else set.add(slug)
    // Preserve catalog order for the active items, keep any extra stored slugs.
    const ordered = active.map((p) => p.slug).filter((s) => set.has(s))
    const extras = items.filter((s) => set.has(s) && !ordered.includes(s))
    updateAttributes({ items: [...ordered, ...extras].join(",") })
  }

  function addLineBelow() {
    if (typeof getPos !== "function") return
    const pos = getPos() + node.nodeSize
    editor
      .chain()
      .focus()
      .insertContentAt(pos, { type: "paragraph" })
      .setTextSelection(pos + 1)
      .run()
  }

  const controls = editable ? (
    <div
      contentEditable={false}
      className={cn(
        "absolute right-1 top-1 flex items-center gap-0.5 rounded-md border bg-background/95 p-0.5 shadow-sm backdrop-blur transition-opacity",
        selected ? "opacity-100" : "opacity-0 group-hover:opacity-100",
      )}
    >
      <div className="flex items-center overflow-hidden rounded border">
        {(["sm", "md", "lg"] as PpeSize[]).map((s) => (
          <button
            key={s}
            type="button"
            title={`${s === "sm" ? "Small" : s === "md" ? "Medium" : "Large"} images`}
            onClick={() => updateAttributes({ size: s })}
            className={cn(
              "h-6 w-6 text-[10px] font-semibold uppercase",
              size === s
                ? "bg-blue-600 text-white"
                : "bg-background text-muted-foreground hover:bg-muted",
            )}
          >
            {s === "sm" ? "S" : s === "md" ? "M" : "L"}
          </button>
        ))}
      </div>
      <Popover open={editOpen} onOpenChange={setEditOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            title="Add / remove PPE"
            className="inline-flex h-6 items-center gap-1 rounded px-1.5 text-[11px] hover:bg-muted"
          >
            <Plus className="h-3.5 w-3.5" />
            PPE
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" sideOffset={6} className="max-h-80 w-[300px] overflow-auto p-2">
          <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            <HardHat className="h-3 w-3" />
            Required PPE
          </div>
          <div className="grid grid-cols-2 gap-1">
            {active.map((p) => {
              const on = items.includes(p.slug)
              return (
                <button
                  key={p.slug}
                  type="button"
                  onClick={() => toggle(p.slug)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-left text-[11px] font-medium transition-colors",
                    on
                      ? "border-blue-400 bg-blue-50 text-blue-900 dark:bg-blue-500/20 dark:text-blue-100"
                      : "border-border bg-background text-muted-foreground hover:bg-muted",
                  )}
                >
                  <Pictogram meta={p} />
                  <span className="flex-1 truncate">{p.label}</span>
                  {on && <Check className="h-3 w-3" />}
                </button>
              )
            })}
          </div>
        </PopoverContent>
      </Popover>
      <button
        type="button"
        title="Add line below"
        onClick={addLineBelow}
        className="inline-flex h-6 w-6 items-center justify-center rounded hover:bg-muted"
      >
        <CornerDownLeft className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        title="Remove PPE row"
        onClick={() => deleteNode()}
        className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  ) : null

  if (!items.length) {
    return (
      <NodeViewWrapper
        as="div"
        data-ppe
        className={cn(
          "group relative my-3 flex items-center gap-2 rounded-md border border-dashed border-muted-foreground/40 bg-muted/30 px-3 py-2 text-xs text-muted-foreground",
          selected && "ring-2 ring-blue-300 ring-offset-1",
        )}
      >
        Required PPE: none yet. Use the
        <span className="font-medium"> + PPE</span> button to add.
        {controls}
      </NodeViewWrapper>
    )
  }
  return (
    <NodeViewWrapper
      as="div"
      data-ppe
      data-items={items.join(",")}
      className={cn(
        "group relative my-3 flex flex-wrap items-center gap-2 rounded-md border border-blue-300 bg-blue-50/70 px-3 py-2 dark:border-blue-500/40 dark:bg-blue-500/10",
        selected && "ring-2 ring-blue-300 ring-offset-1",
      )}
    >
      <span className="ppe-label text-[10px] font-semibold uppercase tracking-wide text-blue-900 dark:text-blue-200">
        Required PPE
      </span>
      <div className="flex flex-wrap items-end gap-1.5">
        {items.map((slug) => {
          const meta = resolve(slug)
          return (
            <span
              key={slug}
              className={cn(
                "ppe-chip border border-blue-300 bg-white font-medium text-blue-900 dark:border-blue-500/40 dark:bg-blue-950/40 dark:text-blue-100",
                size === "lg"
                  ? "inline-flex w-[88px] flex-col items-center gap-1 rounded-md px-1.5 py-1.5 text-center text-[11px]"
                  : "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px]",
              )}
              title={meta.description ?? undefined}
            >
              <Pictogram meta={meta} size={PICTO_PX[size]} />
              <span className={size === "lg" ? "leading-tight" : ""}>{meta.label}</span>
            </span>
          )
        })}
      </div>
      {controls}
    </NodeViewWrapper>
  )
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    ppe: {
      insertPpe: (items: PpeItem[]) => ReturnType
    }
  }
}

export const PpeNode = Node.create({
  name: "ppe",
  group: "block",
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      items: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-items") ?? "",
        renderHTML: (attrs) => ({ "data-items": attrs.items }),
      },
      size: {
        default: "md",
        parseHTML: (el) => el.getAttribute("data-size") ?? "md",
        renderHTML: (attrs) => ({ "data-size": attrs.size }),
      },
    }
  },

  parseHTML() {
    return [{ tag: "div[data-ppe]" }]
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-ppe": "" })]
  },

  addNodeView() {
    return ReactNodeViewRenderer(PpeView)
  },

  addCommands() {
    const commands: Partial<RawCommands> = {
      insertPpe:
        (items: PpeItem[]) =>
        ({ chain }) => {
          return chain()
            .focus()
            .insertContent({
              type: this.name,
              attrs: { items: items.join(",") },
            })
            .run()
        },
    }
    return commands as RawCommands
  },
})

// --- Picker dialog ----------------------------------------------------------

interface PpePickerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (items: PpeItem[]) => void
  initial?: PpeItem[]
}

export function PpePicker({
  open,
  onOpenChange,
  onSelect,
  initial = [],
}: PpePickerProps) {
  const { active } = usePpeCatalog()
  const [picked, setPicked] = useState<Set<string>>(new Set(initial))

  function toggle(slug: string) {
    const next = new Set(picked)
    if (next.has(slug)) next.delete(slug)
    else next.add(slug)
    setPicked(next)
  }

  function commit() {
    onSelect(active.map((p) => p.slug).filter((s) => picked.has(s)))
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Required PPE</DialogTitle>
          <DialogDescription>
            Pick the personal protective equipment required for this procedure.
          </DialogDescription>
        </DialogHeader>
        <div className="grid max-h-[50vh] grid-cols-2 gap-2 overflow-auto py-2">
          {active.map((p) => {
            const on = picked.has(p.slug)
            return (
              <button
                key={p.slug}
                type="button"
                onClick={() => toggle(p.slug)}
                className={cn(
                  "flex items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors",
                  on
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-input hover:bg-muted",
                )}
              >
                <Pictogram meta={p} size={20} />
                <span className="flex-1">{p.label}</span>
                {on && <Check className="h-4 w-4 text-primary" />}
              </button>
            )
          })}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={commit}>Insert</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// --- Inline mini-palette (toolbar default) ---------------------------------

interface PpeQuickPaletteProps {
  /** Inserts a fresh PPE block with the toggled selection. */
  onInsert: (items: PpeItem[]) => void
  /** Custom trigger; defaults to the toolbar's hard-hat button. */
  children?: React.ReactNode
}

export function PpeQuickPalette({ onInsert, children }: PpeQuickPaletteProps) {
  const { active } = usePpeCatalog()
  const [open, setOpen] = useState(false)
  const [picked, setPicked] = useState<Set<string>>(new Set())

  function toggle(slug: string) {
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(slug)) next.delete(slug)
      else next.add(slug)
      return next
    })
  }

  function reset() {
    setPicked(new Set())
  }

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) reset()
      }}
    >
      <PopoverTrigger asChild>
        {children ?? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 gap-1 px-2 text-xs"
            title="Insert the PPE to wear: helmet, gloves, glasses and more"
          >
            <HardHat className="h-4 w-4 text-blue-600" />
            PPE
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={6} className="max-h-80 w-[320px] overflow-auto p-2">
        <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          <HardHat className="h-3 w-3" />
          Required PPE
        </div>
        <div className="grid grid-cols-2 gap-1">
          {active.map((p) => {
            const on = picked.has(p.slug)
            return (
              <button
                key={p.slug}
                type="button"
                onClick={() => toggle(p.slug)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-left text-[11px] font-medium transition-colors",
                  on
                    ? "border-blue-400 bg-blue-50 text-blue-900 dark:bg-blue-500/20 dark:text-blue-100"
                    : "border-border bg-background text-muted-foreground hover:bg-muted",
                )}
              >
                <Pictogram meta={p} />
                <span className="flex-1 truncate">{p.label}</span>
                {on && <Check className="h-3 w-3" />}
              </button>
            )
          })}
        </div>
        <div className="mt-2 flex items-center justify-between gap-2 border-t pt-2">
          <div className="text-[10px] text-muted-foreground">
            {picked.size} selected
          </div>
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-[11px]"
              onClick={() => {
                setOpen(false)
                reset()
              }}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="h-7 text-[11px]"
              disabled={picked.size === 0}
              onClick={() => {
                onInsert(active.map((p) => p.slug).filter((s) => picked.has(s)))
                setOpen(false)
                reset()
              }}
            >
              Insert PPE row
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
