// LinkedAssetBlock
//
// Inline TipTap node `linkedAsset` that points at an asset in the registry.
// Renders as a small `[# CODE]` chip the user can drop into running prose.
//
// Mirrors LaunchLogBlock structurally:
//   - `LinkedAssetNode`     — TipTap inline atom node.
//   - `LinkedAssetPicker`   — shadcn Dialog backed by `listAssets(db)`.
//
// Round-trips attrs via `data-asset-id` / `data-label` so HTML import/export
// (and the read-only sibling renderer) stay lossless.

import { useMemo, useState } from "react"
import { Node, mergeAttributes, type RawCommands } from "@tiptap/core"
import {
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from "@tiptap/react"
import { Link, useLocation } from "wouter"
import { Factory, MapPin } from "lucide-react"
import { cn } from "@/lib/utils"
import { useQuery } from "convex/react"
import { api } from "../../../convex/_generated/api"
import { toLegacyAsset } from "@/lib/convex-adapters"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import type { Asset } from "@/types"
import { useRecentlyLinkedAssets } from "./useRecentlyLinkedAssets"

function LinkedAssetNodeView({ node, selected, editor }: NodeViewProps) {
  const label = (node.attrs.label as string) || "(unknown)"
  const assetId = node.attrs.assetId as string | null
  // On the floor app (/m) the chip opens the mobile page.
  const [location] = useLocation()
  const base = location.startsWith("/m/") || location === "/m" ? "/m" : ""
  const chip = cn(
    "mx-0.5 inline-flex items-center gap-1 rounded-md border border-emerald-300 bg-emerald-50 px-1.5 py-0.5 align-baseline text-xs font-medium text-emerald-800",
    selected && "ring-2 ring-emerald-400 ring-offset-1",
  )
  // Reading: the chip opens the Asset. Editing: a plain chip.
  if (!editor.isEditable && assetId) {
    return (
      <NodeViewWrapper as="span" data-linked-asset contentEditable={false}>
        <Link
          href={`${base}/assets/${assetId}`}
          className={cn(chip, "no-underline transition-colors hover:border-emerald-500 hover:bg-emerald-100")}
        >
          <Factory className="h-3 w-3" />
          <span className="font-mono">{label}</span>
        </Link>
      </NodeViewWrapper>
    )
  }
  return (
    <NodeViewWrapper
      as="span"
      data-linked-asset
      contentEditable={false}
      className={chip}
    >
      <Factory className="h-3 w-3" />
      <span className="font-mono">{label}</span>
    </NodeViewWrapper>
  )
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    linkedAsset: {
      insertLinkedAsset: (attrs: {
        assetId: string
        label: string
      }) => ReturnType
    }
  }
}

export const LinkedAssetNode = Node.create({
  name: "linkedAsset",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      assetId: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-asset-id") ?? "",
        renderHTML: (attrs) => ({ "data-asset-id": attrs.assetId }),
      },
      label: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-label") ?? "",
        renderHTML: (attrs) => ({ "data-label": attrs.label }),
      },
    }
  },

  parseHTML() {
    return [{ tag: "span[data-linked-asset]" }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, { "data-linked-asset": "" }),
      `${HTMLAttributes["data-label"] ?? ""}`,
    ]
  },

  addNodeView() {
    return ReactNodeViewRenderer(LinkedAssetNodeView)
  },

  addCommands() {
    const commands: Partial<RawCommands> = {
      insertLinkedAsset:
        (attrs: { assetId: string; label: string }) =>
        ({ chain }) => {
          return chain()
            .focus()
            .insertContent({
              type: this.name,
              attrs,
            })
            // Drop a trailing space so the cursor escapes the atom node.
            .insertContent(" ")
            .run()
        },
    }
    return commands as RawCommands
  },
})

interface LinkedAssetPickerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (attrs: { assetId: string; label: string }) => void
}

interface AssetGroup {
  heading: string
  assets: Asset[]
}

function buildPickerGroups(
  assets: Asset[],
  query: string,
  recentIds: string[],
): AssetGroup[] {
  const q = query.trim().toLowerCase()
  const filter = (a: Asset) => {
    if (!q) return true
    return (
      a.code.toLowerCase().includes(q) ||
      a.name.toLowerCase().includes(q) ||
      (a.location ?? "").toLowerCase().includes(q)
    )
  }
  const byId = new Map(assets.map((a) => [a.id, a]))
  const recent = recentIds
    .map((id) => byId.get(id))
    .filter((a): a is Asset => Boolean(a))
    .filter(filter)
    .slice(0, 5)
  const recentSet = new Set(recent.map((a) => a.id))
  const others = assets.filter((a) => !recentSet.has(a.id) && filter(a))
  const byLocation = new Map<string, Asset[]>()
  for (const a of others) {
    const key = a.location ?? "Unassigned"
    const list = byLocation.get(key) ?? []
    list.push(a)
    byLocation.set(key, list)
  }
  const groups: AssetGroup[] = []
  if (recent.length > 0) groups.push({ heading: "Recently linked", assets: recent })
  for (const [heading, list] of Array.from(byLocation.entries()).sort()) {
    list.sort((a, b) => a.code.localeCompare(b.code))
    groups.push({ heading, assets: list })
  }
  return groups
}

export function LinkedAssetPicker({
  open,
  onOpenChange,
  onSelect,
}: LinkedAssetPickerProps) {
  const raw = useQuery(api.assets.list)
  const assets = useMemo<Asset[]>(
    () => (raw ? raw.map(toLegacyAsset) : []),
    [raw],
  )
  const [query, setQuery] = useState("")
  const [labelMode, setLabelMode] = useState<"code" | "codeName">("code")
  const { recent, push } = useRecentlyLinkedAssets()

  const groups = useMemo(
    () => buildPickerGroups(assets, query, recent),
    [assets, query, recent],
  )
  const total = groups.reduce((acc, g) => acc + g.assets.length, 0)

  function pick(asset: Asset) {
    push(asset.id)
    const label =
      labelMode === "codeName" ? `${asset.code} · ${asset.name}` : asset.code
    onSelect({ assetId: asset.id, label })
    onOpenChange(false)
    setQuery("")
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Insert machine</DialogTitle>
          <DialogDescription>
            Search the site assets by code, name, or location.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-medium text-muted-foreground">
              Insert as
            </span>
            <div className="inline-flex rounded-md border p-0.5">
              <button
                type="button"
                onClick={() => setLabelMode("code")}
                className={cn(
                  "rounded px-2 py-1 text-xs transition-colors",
                  labelMode === "code"
                    ? "bg-emerald-500/15 font-medium text-emerald-700 dark:text-emerald-300"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                Code only
              </button>
              <button
                type="button"
                onClick={() => setLabelMode("codeName")}
                className={cn(
                  "rounded px-2 py-1 text-xs transition-colors",
                  labelMode === "codeName"
                    ? "bg-emerald-500/15 font-medium text-emerald-700 dark:text-emerald-300"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                Code + name
              </button>
            </div>
          </div>
          <Input
            autoFocus
            placeholder="Search by code, name, or location…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="max-h-80 space-y-3 overflow-auto pr-1">
            {total === 0 && (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                No assets match.
              </p>
            )}
            {groups.map((g) => (
              <div key={g.heading}>
                <div className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {g.heading}
                </div>
                <ul className="space-y-1">
                  {g.assets.map((asset) => (
                    <li key={asset.id}>
                      <Button
                        variant="ghost"
                        className="w-full justify-start gap-2 px-2 py-1.5 text-left"
                        onClick={() => pick(asset)}
                        type="button"
                      >
                        {asset.pin_number != null ? (
                          <span className="inline-flex h-5 w-5 items-center justify-center rounded bg-emerald-500/15 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
                            {asset.pin_number}
                          </span>
                        ) : (
                          <Factory className="h-3.5 w-3.5 text-emerald-600" />
                        )}
                        <span className="font-mono text-sm">{asset.code}</span>
                        <span className="flex-1 truncate text-muted-foreground">
                          · {asset.name}
                        </span>
                        {asset.location && (
                          <span className="hidden items-center gap-0.5 text-[10px] text-muted-foreground sm:inline-flex">
                            <MapPin className="h-2.5 w-2.5" />
                            {asset.location}
                          </span>
                        )}
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
