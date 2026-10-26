// CalloutBlock — typed coloured box for procedure annotations.
//
// Each callout has a `kind` attribute that round-trips through parseHTML /
// renderHTML (data-kind). The kind drives the icon + colour + label. Four
// hue families (danger / warning / notice / tip) cover 13 callout types so
// the visual language stays scannable; the icon does the per-type lifting.
//
// Safety subtypes (loto, hotwork, electrical, …) were added on 2026-05-06 to
// move site-critical content out of free-text into structured blocks. They
// chunk identically to the original callout kinds.

import { Node, mergeAttributes, type RawCommands } from "@tiptap/core"
import { NodeViewWrapper, ReactNodeViewRenderer, NodeViewContent, type NodeViewProps } from "@tiptap/react"
import {
  AlertTriangle,
  AlertOctagon,
  Check,
  CornerDownLeft,
  Flame,
  Info,
  Lightbulb,
  Lock,
  Mountain,
  PlugZap,
  Pyramid,
  Settings2,
  ShieldAlert,
  ShieldCheck,
  Snowflake,
  Tag,
  Trash2,
} from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

export type CalloutKind =
  | "warning"
  | "caution"
  | "notice"
  | "tip"
  | "danger"
  | "loto"
  | "hotwork"
  | "confined"
  | "heights"
  | "authorised"
  | "permit"
  | "electrical"
  | "cryo"

type Tone = "danger" | "warning" | "notice" | "tip"

const TONE_CLS: Record<Tone, string> = {
  danger:
    "border-red-400 bg-red-50 text-red-900 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-100",
  warning:
    "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100",
  notice:
    "border-sky-300 bg-sky-50 text-sky-900 dark:border-sky-500/40 dark:bg-sky-500/10 dark:text-sky-100",
  tip:
    "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-100",
}

interface CalloutMeta {
  label: string
  icon: typeof Info
  tone: Tone
}

export const CALLOUT_META: Record<CalloutKind, CalloutMeta> = {
  warning: { label: "Warning", icon: AlertTriangle, tone: "warning" },
  caution: { label: "Caution", icon: ShieldAlert, tone: "warning" },
  notice: { label: "Notice", icon: Info, tone: "notice" },
  tip: { label: "Tip", icon: Lightbulb, tone: "tip" },
  danger: { label: "Danger", icon: AlertOctagon, tone: "danger" },
  loto: { label: "Lockout / Tagout", icon: Lock, tone: "danger" },
  hotwork: { label: "Hot work", icon: Flame, tone: "danger" },
  electrical: { label: "Electrical hazard", icon: PlugZap, tone: "danger" },
  heights: { label: "Working at heights", icon: Mountain, tone: "warning" },
  confined: { label: "Confined space", icon: Pyramid, tone: "warning" },
  authorised: { label: "Authorised personnel only", icon: ShieldCheck, tone: "notice" },
  permit: { label: "Permit required", icon: Tag, tone: "notice" },
  cryo: { label: "Cryogenic / cold hazard", icon: Snowflake, tone: "notice" },
}

// Order of kinds shown in the change-type menu.
const KIND_ORDER: CalloutKind[] = [
  "warning",
  "caution",
  "notice",
  "tip",
  "danger",
  "loto",
  "hotwork",
  "electrical",
  "heights",
  "confined",
  "authorised",
  "permit",
  "cryo",
]

function CalloutView({
  node,
  updateAttributes,
  deleteNode,
  editor,
  getPos,
  selected,
}: NodeViewProps) {
  const kind = (node.attrs.kind as CalloutKind) ?? "notice"
  const meta = CALLOUT_META[kind] ?? CALLOUT_META.notice
  const Icon = meta.icon
  const editable = editor?.isEditable ?? false

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

  return (
    <NodeViewWrapper
      as="div"
      data-callout
      data-kind={kind}
      className={cn(
        "group relative my-3 flex gap-3 rounded-md border-l-4 px-4 py-3 text-sm leading-relaxed",
        TONE_CLS[meta.tone],
        selected && "ring-2 ring-offset-1 ring-current",
      )}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="callout-label mb-0.5 text-[10px] font-semibold uppercase tracking-wide opacity-80">
          {meta.label}
        </div>
        <NodeViewContent className="callout-body" />
      </div>

      {editable && (
        <div
          contentEditable={false}
          className={cn(
            "absolute right-1 top-1 flex items-center gap-0.5 rounded-md border bg-background/95 p-0.5 text-foreground shadow-sm backdrop-blur transition-opacity",
            selected ? "opacity-100" : "opacity-0 group-hover:opacity-100",
          )}
        >
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                title="Change type"
                className="inline-flex h-6 items-center gap-1 rounded px-1.5 text-[11px] hover:bg-muted"
              >
                <Settings2 className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-72 overflow-auto">
              <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Change type
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {KIND_ORDER.map((k) => {
                const m = CALLOUT_META[k]
                const KIcon = m.icon
                return (
                  <DropdownMenuItem
                    key={k}
                    onClick={() => updateAttributes({ kind: k })}
                    className="gap-2 text-xs"
                  >
                    <KIcon className="h-3.5 w-3.5" />
                    <span className="flex-1">{m.label}</span>
                    {k === kind && <Check className="h-3.5 w-3.5 text-primary" />}
                  </DropdownMenuItem>
                )
              })}
            </DropdownMenuContent>
          </DropdownMenu>
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
            title="Remove callout"
            onClick={() => deleteNode()}
            className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </NodeViewWrapper>
  )
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    callout: {
      insertCallout: (kind: CalloutKind) => ReturnType
    }
  }
}

export const CalloutNode = Node.create({
  name: "callout",
  group: "block",
  content: "block+",
  defining: true,

  addAttributes() {
    return {
      kind: {
        default: "notice",
        parseHTML: (el) => el.getAttribute("data-kind") ?? "notice",
        renderHTML: (attrs) => ({ "data-kind": attrs.kind }),
      },
    }
  },

  parseHTML() {
    return [{ tag: "div[data-callout]" }]
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-callout": "" }), 0]
  },

  addNodeView() {
    return ReactNodeViewRenderer(CalloutView)
  },

  addCommands() {
    const commands: Partial<RawCommands> = {
      insertCallout:
        (kind: CalloutKind) =>
        ({ chain }) => {
          return chain()
            .focus()
            .insertContent({
              type: this.name,
              attrs: { kind },
              content: [{ type: "paragraph" }],
            })
            .run()
        },
    }
    return commands as RawCommands
  },
})
