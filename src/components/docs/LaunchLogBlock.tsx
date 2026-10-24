// LaunchLogBlock
//
// TipTap custom block node `launchLog` that renders a styled pill referencing
// an operational Log (e.g. "Quality check — Extruder"). The node carries the
// originating logId, a stable anchorId (so M6's SOP→Log cycle can resolve back
// to it), and a human-readable label.
//
// Two pieces:
//   1. `LaunchLogNode` — the TipTap Node definition (used by DocumentEditor).
//   2. `LaunchLogPicker` — a shadcn Dialog that lists `listLogs(db)` and, on
//      select, inserts a node with `{ logId, anchorId, label }`.
//
// In read mode the same node renders an identical pill via `parseHTML` /
// `renderHTML` round-tripping data-* attrs, so the Reading agent's
// TiptapReadOnly will pick it up unchanged.

import { useMemo, useState } from "react"
import { Node, mergeAttributes, type RawCommands } from "@tiptap/core"
import {
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from "@tiptap/react"
import { ExternalLink, Play, Pencil } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { useQuery } from "convex/react"
import { api } from "../../../convex/_generated/api"
import { toLegacyLog } from "@/lib/convex-adapters"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import type { Log } from "@/types"

// --- Node view --------------------------------------------------------------

function LaunchLogNodeView({ node, selected, editor }: NodeViewProps) {
  const label = (node.attrs.label as string) || "(unnamed log)"
  const code = (node.attrs.code as string) || ""
  const logId = (node.attrs.logId as string) || ""
  const [open, setOpen] = useState(false)
  // Editor mode is "edit" when the editor is editable (authoring) and "read"
  // otherwise (TiptapReadOnly). The modal CTA changes accordingly.
  const mode: "edit" | "read" = editor.isEditable ? "edit" : "read"
  // Pill styling deliberately mirrors LinkedAssetBlock / ReferenceDocBlock
  // (same size/weight; sky is this pill's color).
  return (
    <NodeViewWrapper
      as="div"
      data-launch-log
      contentEditable={false}
      className={cn(
        "my-1 inline-flex items-center gap-1 rounded-md border border-sky-300 bg-sky-50 px-1.5 py-0.5 text-xs font-medium text-sky-800 transition-colors hover:bg-sky-100",
        selected && "ring-2 ring-sky-400 ring-offset-1",
      )}
    >
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault()
          setOpen(true)
        }}
        className="inline-flex items-center gap-1 text-left"
        title={mode === "edit" ? "Preview launch-log" : "Open this log"}
      >
        <Play className="h-3 w-3 fill-sky-700 text-sky-700" />
        {code && <span className="font-mono">{code}</span>}
        <span>{code ? `· ${label}` : label}</span>
      </button>
      <LaunchLogModal
        open={open}
        onOpenChange={setOpen}
        logId={logId}
        label={label}
        mode={mode}
      />
    </NodeViewWrapper>
  )
}

// --- Node definition --------------------------------------------------------

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    launchLog: {
      insertLaunchLog: (attrs: {
        logId: string
        anchorId: string
        label: string
        code?: string
      }) => ReturnType
    }
  }
}

export const LaunchLogNode = Node.create({
  name: "launchLog",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      logId: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-log-id") ?? "",
        renderHTML: (attrs) => ({ "data-log-id": attrs.logId }),
      },
      anchorId: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-anchor-id") ?? "",
        renderHTML: (attrs) => ({ "data-anchor-id": attrs.anchorId }),
      },
      label: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-label") ?? "",
        renderHTML: (attrs) => ({ "data-label": attrs.label }),
      },
      code: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-code") ?? "",
        renderHTML: (attrs) => ({ "data-code": attrs.code }),
      },
    }
  },

  parseHTML() {
    return [{ tag: "div[data-launch-log]" }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-launch-log": "" }),
      ["span", {}, `Launch log: ${HTMLAttributes["data-label"] ?? ""}`],
    ]
  },

  addNodeView() {
    return ReactNodeViewRenderer(LaunchLogNodeView)
  },

  addCommands() {
    const commands: Partial<RawCommands> = {
      insertLaunchLog:
        (attrs: {
          logId: string
          anchorId: string
          label: string
          code?: string
        }) =>
        ({ chain }) => {
          return chain()
            .focus()
            .insertContent({
              type: this.name,
              attrs,
            })
            .run()
        },
    }
    return commands as RawCommands
  },
})

// --- Picker dialog ----------------------------------------------------------

interface LaunchLogPickerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (attrs: {
    logId: string
    anchorId: string
    label: string
    code?: string
  }) => void
}

export function LaunchLogPicker({
  open,
  onOpenChange,
  onSelect,
}: LaunchLogPickerProps) {
  const raw = useQuery(api.logs.list)
  const logs = useMemo<Log[]>(
    () => (raw ? raw.map(toLegacyLog) : []),
    [raw],
  )
  const [query, setQuery] = useState("")

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return logs
    return logs.filter(
      (l) =>
        l.name.toLowerCase().includes(q) ||
        l.type.toLowerCase().includes(q) ||
        (l.code ?? "").toLowerCase().includes(q),
    )
  }, [logs, query])

  function pick(log: Log) {
    onSelect({
      logId: log.id,
      anchorId: crypto.randomUUID(),
      label: log.name,
      code: log.code ?? "",
    })
    onOpenChange(false)
    setQuery("")
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Insert launch-log block</DialogTitle>
          <DialogDescription>
            Link an existing operational log. The pill hands the operator off
            to it, and the log appears under Linked logs in the document
            details.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Input
            autoFocus
            placeholder="Search logs…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <ul className="max-h-72 space-y-1 overflow-auto">
            {filtered.length === 0 && (
              <li className="px-3 py-6 text-center text-sm text-muted-foreground">
                No logs match.
              </li>
            )}
            {filtered.map((log) => (
              <li key={log.id}>
                <Button
                  variant="ghost"
                  className="w-full justify-start gap-2 px-3 py-2 text-left"
                  onClick={() => pick(log)}
                  type="button"
                >
                  <Play className="h-3.5 w-3.5 text-sky-600" />
                  {log.code && (
                    <span className="font-mono text-xs text-sky-700">
                      {log.code}
                    </span>
                  )}
                  <span className="font-medium">{log.name}</span>
                  <span className="ml-auto text-xs uppercase text-muted-foreground">
                    {log.type}
                  </span>
                </Button>
              </li>
            ))}
          </ul>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// --- Click-through modal ---------------------------------------------------

interface LaunchLogModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  logId: string
  label: string
  /** "edit" = author preview; "read" = operator handoff with deep-link CTA. */
  mode: "edit" | "read"
}

function LaunchLogModal({
  open,
  onOpenChange,
  logId,
  label,
  mode,
}: LaunchLogModalProps) {
  const raw = useQuery(api.logs.list)
  const log = useMemo<Log | null>(() => {
    if (!raw || !logId) return null
    const found = raw.find((l) => l._id === logId)
    return found ? toLegacyLog(found) : null
  }, [raw, logId])

  const title = log?.name ?? label
  const type = log?.type ?? null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-sky-500/10 text-sky-600">
              <Play className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1 text-left">
              <DialogTitle className="text-sm font-semibold">{title}</DialogTitle>
              <DialogDescription className="mt-0.5 text-xs">
                {mode === "edit"
                  ? "Preview of what the operator will see when they tap this pill."
                  : "Hand off to the Oppr LOGS module to start this log capture."}
              </DialogDescription>
              <div className="mt-1 flex items-center gap-1.5">
                {log?.code && (
                  <span className="inline-flex items-center rounded-full border border-sky-300 bg-sky-50 px-2 py-0.5 font-mono text-[10px] text-sky-700 dark:border-sky-500/40 dark:bg-sky-500/10 dark:text-sky-200">
                    {log.code}
                  </span>
                )}
                {type && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-sky-300 bg-sky-50 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-sky-700 dark:border-sky-500/40 dark:bg-sky-500/10 dark:text-sky-200">
                    {type}
                  </span>
                )}
              </div>
            </div>
          </div>
        </DialogHeader>

        <div className="rounded-md border bg-muted/30 px-4 py-3 text-sm">
          {mode === "edit" ? (
            <>
              When this SOP is published, an operator who taps{" "}
              <strong>Launch log</strong> here will see this dialog and can hand off
              to <span className="font-semibold">Oppr LOGS</span> to capture the
              data. DOCS does not capture anything itself.
            </>
          ) : (
            <>
              You're about to start <strong>{title}</strong>. Capture happens in{" "}
              <span className="font-semibold">Oppr LOGS</span>; this dialog only
              hands you off.
            </>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
          >
            {mode === "edit" ? "Close preview" : "Cancel"}
          </Button>
          {mode === "edit" ? (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={() => {
                onOpenChange(false)
                toast.message("Edit the launch-log pill via the toolbar 'Launch log' button.")
              }}
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit reference
            </Button>
          ) : (
            <Button
              size="sm"
              className="gap-1.5"
              onClick={() => {
                toast.info(
                  "Oppr LOGS is a separate module and is not bundled in this showcase build.",
                )
              }}
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Open in Oppr LOGS
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
