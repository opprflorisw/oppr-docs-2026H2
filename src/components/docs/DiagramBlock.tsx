// DiagramBlock — inline SVG figure node.
//
// Diagrams are authored in the model-first builder (see /analysis/diagram-builder).
// A structured DiagramModel is the source of truth, stored in data-model; its
// rendered SVG is cached in data-svg so the read view and PDF export consume it
// unchanged. Builder-made diagrams reopen for editing (the Edit button on hover).
//
// v3: the static "Presets" insert path is gone — curated starting points now
// load INTO the builder as editable templates. Legacy diagrams stored as svg
// only (no model) still render via data-svg; they're just not re-editable.
// All builder SVG is produced by renderDiagramSvg, the single trust boundary
// that XML-escapes every label.

import { errorText } from "@/lib/errorText"
import { useEffect, useState } from "react"
import { Node, mergeAttributes, type RawCommands } from "@tiptap/core"
import {
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from "@tiptap/react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { CornerDownLeft, Pencil } from "lucide-react"
import { cn } from "@/lib/utils"
import { useMutation, useQuery } from "convex/react"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import { toast } from "sonner"
import { DiagramBuilder, type AssetOption } from "./DiagramBuilder"
import {
  emptyDiagramModel,
  parseDiagramModel,
  type DiagramModel,
  type UploadedBackground,
} from "./diagramModel"
import { renderDiagramSvg } from "./renderDiagramSvg"

export interface DiagramAttrs {
  svg: string
  caption: string
  model?: DiagramModel | null
}

function DiagramView({
  node,
  editor,
  updateAttributes,
  getPos,
  selected,
}: NodeViewProps) {
  const svg = (node.attrs.svg as string) ?? ""
  const caption = (node.attrs.caption as string) ?? ""
  const model = parseDiagramModel(node.attrs.model)
  const [editOpen, setEditOpen] = useState(false)
  const canEdit = editor.isEditable && model !== null
  const editable = editor.isEditable

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
      as="figure"
      data-diagram
      className="group relative my-4 flex flex-col items-center gap-1.5 rounded-md border bg-card p-4"
    >
      {editable && (
        <div
          contentEditable={false}
          className={cn(
            "absolute right-2 top-2 z-10 flex items-center gap-1 transition-opacity",
            selected ? "opacity-100" : "opacity-0 group-hover:opacity-100",
          )}
        >
          {canEdit && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={() => setEditOpen(true)}
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 w-8 p-0"
            title="Add line below"
            onClick={addLineBelow}
          >
            <CornerDownLeft className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
      <div
        className="diagram-svg w-full max-w-2xl text-foreground"
        // SVG comes from our own renderDiagramSvg (or a legacy preset); we never
        // accept free-form input — see renderDiagramSvg, the single trust boundary.
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      {caption && (
        <figcaption className="text-xs text-muted-foreground">{caption}</figcaption>
      )}
      {canEdit && (
        <DiagramPicker
          open={editOpen}
          onOpenChange={setEditOpen}
          initialModel={model}
          initialCaption={caption}
          onSelect={(attrs) => updateAttributes(attrs)}
        />
      )}
    </NodeViewWrapper>
  )
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    diagram: {
      insertDiagram: (attrs: DiagramAttrs) => ReturnType
    }
  }
}

export const DiagramNode = Node.create({
  name: "diagram",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      svg: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-svg") ?? "",
        renderHTML: (attrs) => ({ "data-svg": attrs.svg }),
      },
      caption: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-caption") ?? "",
        renderHTML: (attrs) => ({ "data-caption": attrs.caption }),
      },
      // The structured model for builder-made diagrams. Legacy presets have no
      // model and round-trip as svg only.
      model: {
        default: null,
        parseHTML: (el) => parseDiagramModel(el.getAttribute("data-model")),
        renderHTML: (attrs) =>
          attrs.model ? { "data-model": JSON.stringify(attrs.model) } : {},
      },
    }
  },

  parseHTML() {
    return [{ tag: "figure[data-diagram]" }]
  },

  renderHTML({ HTMLAttributes }) {
    return ["figure", mergeAttributes(HTMLAttributes, { "data-diagram": "" })]
  },

  addNodeView() {
    return ReactNodeViewRenderer(DiagramView)
  },

  addCommands() {
    const commands: Partial<RawCommands> = {
      insertDiagram:
        (attrs: DiagramAttrs) =>
        ({ chain }) => {
          return chain().focus().insertContent({ type: this.name, attrs }).run()
        },
    }
    return commands as RawCommands
  },
})

// --- upload helpers ---------------------------------------------------------

async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buf)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

function probeDimensions(file: File): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight })
      URL.revokeObjectURL(url)
    }
    img.onerror = () => {
      resolve(null)
      URL.revokeObjectURL(url)
    }
    img.src = url
  })
}

// --- Builder dialog ---------------------------------------------------------

interface DiagramPickerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (attrs: DiagramAttrs) => void
  /** When set, the dialog opens pre-loaded for editing. */
  initialModel?: DiagramModel | null
  initialCaption?: string
}

export function DiagramPicker({
  open,
  onOpenChange,
  onSelect,
  initialModel,
  initialCaption,
}: DiagramPickerProps) {
  const rawAssets = useQuery(api.assets.list, open ? {} : "skip")
  const assetOptions: AssetOption[] = (rawAssets ?? []).map((a) => ({
    code: a.code,
    name: a.name,
  }))
  const generateUploadUrl = useMutation(api.files.generateUploadUrl)
  const createFromUpload = useMutation(api.images.createFromUpload)

  const [model, setModel] = useState<DiagramModel>(emptyDiagramModel())
  const [caption, setCaption] = useState("")

  useEffect(() => {
    if (!open) return
    setModel(initialModel ?? emptyDiagramModel())
    setCaption(initialCaption ?? "")
  }, [open, initialModel, initialCaption])

  async function uploadBackground(file: File): Promise<UploadedBackground | null> {
    if (!file.type.startsWith("image/")) {
      toast.error("Not an image file.")
      return null
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("The image is too large. The limit is 10 MB.")
      return null
    }
    try {
      const buf = await file.arrayBuffer()
      const sha256 = await sha256Hex(buf)
      const dims = await probeDimensions(file)
      if (!dims) {
        toast.error("Couldn't read image dimensions.")
        return null
      }
      const uploadUrl = await generateUploadUrl()
      const put = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      })
      if (!put.ok) throw new Error(`Upload failed (${put.status})`)
      const { storageId } = (await put.json()) as { storageId: Id<"_storage"> }
      const result = await createFromUpload({
        storageId,
        filename: file.name,
        contentType: file.type,
        byteSize: file.size,
        width: dims.width,
        height: dims.height,
        sha256,
        altText: "Diagram background",
      })
      if (!result.url) {
        toast.error("Upload returned no URL.")
        return null
      }
      return { url: result.url, naturalWidth: dims.width, naturalHeight: dims.height }
    } catch (err) {
      toast.error(errorText(err, "The picture could not be uploaded. Try again."))
      return null
    }
  }

  function commit() {
    onSelect({
      svg: renderDiagramSvg(model),
      caption: caption.trim() || "Diagram",
      model,
    })
    onOpenChange(false)
  }

  const isEditing = !!initialModel
  const isEmpty =
    model.nodes.length === 0 && model.arrows.length === 0 && !model.background

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit diagram" : "Diagram builder"}</DialogTitle>
          <DialogDescription>
            Drag in shapes, connect them, add arrows, or drop a background image
            (e.g. a floor plan) and overlay boxes on top. Start from a template
            to save time.
          </DialogDescription>
        </DialogHeader>

        <DiagramBuilder
          model={model}
          onChange={setModel}
          caption={caption}
          assetOptions={assetOptions}
          onUploadBackground={uploadBackground}
        />

        <div className="space-y-1">
          <label className="text-xs font-medium" htmlFor="diagram-caption">
            Caption
          </label>
          <Input
            id="diagram-caption"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="Describe the diagram (shown below it)"
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={commit} disabled={isEmpty}>
            {isEditing ? "Save diagram" : "Insert diagram"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
