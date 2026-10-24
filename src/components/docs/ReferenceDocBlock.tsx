// ReferenceDocBlock
//
// Inline TipTap node `referenceDoc` that points at another document in the
// library. Renders as a small chip in running prose. Mirrors LinkedAssetBlock,
// but over documents rather than assets. The set of reference chips in a body
// is what the "References & related documents" table is auto-generated from
// when the document is published / exported to PDF.

import { useMemo, useState } from "react"
import { Node, mergeAttributes, type RawCommands } from "@tiptap/core"
import {
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from "@tiptap/react"
import { Link, useLocation } from "wouter"
import { BookMarked } from "lucide-react"
import { cn } from "@/lib/utils"
import { useQuery } from "convex/react"
import { api } from "../../../convex/_generated/api"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

function ReferenceDocNodeView({ node, selected, editor }: NodeViewProps) {
  const label = (node.attrs.label as string) || "(unknown doc)"
  const docId = node.attrs.docId as string | null
  // On the floor app (/m) the chip opens the mobile page.
  const [location] = useLocation()
  const base = location.startsWith("/m/") || location === "/m" ? "/m" : ""
  const chip = cn(
    "mx-0.5 inline-flex items-center gap-1 rounded-md border border-indigo-300 bg-indigo-50 px-1.5 py-0.5 align-baseline text-xs font-medium text-indigo-800",
    selected && "ring-2 ring-indigo-400 ring-offset-1",
  )
  // Reading: the chip opens the referenced Document. Editing: a plain chip.
  if (!editor.isEditable && docId) {
    return (
      <NodeViewWrapper as="span" data-reference-doc contentEditable={false}>
        <Link
          href={`${base}/docs/${docId}`}
          className={cn(chip, "no-underline transition-colors hover:border-indigo-500 hover:bg-indigo-100")}
        >
          <BookMarked className="h-3 w-3" />
          <span>{label}</span>
        </Link>
      </NodeViewWrapper>
    )
  }
  return (
    <NodeViewWrapper
      as="span"
      data-reference-doc
      contentEditable={false}
      className={chip}
    >
      <BookMarked className="h-3 w-3" />
      <span>{label}</span>
    </NodeViewWrapper>
  )
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    referenceDoc: {
      insertReferenceDoc: (attrs: {
        docId: string
        code: string
        label: string
      }) => ReturnType
    }
  }
}

export const ReferenceDocNode = Node.create({
  name: "referenceDoc",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      docId: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-doc-id") ?? "",
        renderHTML: (attrs) => ({ "data-doc-id": attrs.docId }),
      },
      code: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-code") ?? "",
        renderHTML: (attrs) => ({ "data-code": attrs.code }),
      },
      label: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-label") ?? "",
        renderHTML: (attrs) => ({ "data-label": attrs.label }),
      },
    }
  },

  parseHTML() {
    return [{ tag: "span[data-reference-doc]" }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, { "data-reference-doc": "" }),
      `${HTMLAttributes["data-label"] ?? ""}`,
    ]
  },

  addNodeView() {
    return ReactNodeViewRenderer(ReferenceDocNodeView)
  },

  addCommands() {
    const commands: Partial<RawCommands> = {
      insertReferenceDoc:
        (attrs: { docId: string; code: string; label: string }) =>
        ({ chain }) => {
          return chain()
            .focus()
            .insertContent({ type: this.name, attrs })
            .insertContent(" ")
            .run()
        },
    }
    return commands as RawCommands
  },
})

interface ReferenceDocPickerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (attrs: { docId: string; code: string; label: string }) => void
}

export function ReferenceDocPicker({
  open,
  onOpenChange,
  onSelect,
}: ReferenceDocPickerProps) {
  const docs = useQuery(api.documents.list, {}) ?? []
  const [query, setQuery] = useState("")
  const [labelMode, setLabelMode] = useState<"code" | "codeTitle">("code")

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = q
      ? docs.filter(
          (d) =>
            d.namingCode.toLowerCase().includes(q) ||
            d.title.toLowerCase().includes(q),
        )
      : docs
    return [...list]
      .sort((a, b) => a.namingCode.localeCompare(b.namingCode))
      .slice(0, 50)
  }, [docs, query])

  function pick(d: { _id: string; namingCode: string; title: string }) {
    const label =
      labelMode === "codeTitle" ? `${d.namingCode} · ${d.title}` : d.namingCode
    onSelect({ docId: d._id, code: d.namingCode, label })
    onOpenChange(false)
    setQuery("")
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Insert reference document</DialogTitle>
          <DialogDescription>
            Reference another document by code or title. It is added to the
            References table when this document is published.
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
                    ? "bg-indigo-500/15 font-medium text-indigo-700 dark:text-indigo-300"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                Code only
              </button>
              <button
                type="button"
                onClick={() => setLabelMode("codeTitle")}
                className={cn(
                  "rounded px-2 py-1 text-xs transition-colors",
                  labelMode === "codeTitle"
                    ? "bg-indigo-500/15 font-medium text-indigo-700 dark:text-indigo-300"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                Code + title
              </button>
            </div>
          </div>
          <Input
            autoFocus
            placeholder="Search by code or title…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="max-h-80 space-y-1 overflow-auto pr-1">
            {filtered.length === 0 && (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                No documents match.
              </p>
            )}
            {filtered.map((d) => (
              <Button
                key={d._id}
                variant="ghost"
                className="w-full justify-start gap-2 px-2 py-1.5 text-left"
                onClick={() => pick(d)}
                type="button"
              >
                <BookMarked className="h-3.5 w-3.5 text-indigo-600" />
                <span className="font-mono text-sm">{d.namingCode}</span>
                <span className="flex-1 truncate text-muted-foreground">
                  · {d.title}
                </span>
              </Button>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
