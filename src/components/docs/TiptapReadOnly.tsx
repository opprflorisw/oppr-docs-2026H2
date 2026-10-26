import { useEffect, useMemo } from "react"
import { EditorContent, useEditor } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import { ImageWithRef } from "./ImageWithRef"
import Link from "@tiptap/extension-link"
import Table from "@tiptap/extension-table"
import TableRow from "@tiptap/extension-table-row"
import TableCell from "@tiptap/extension-table-cell"
import TableHeader from "@tiptap/extension-table-header"
import { cn } from "@/lib/utils"
import { LaunchLogNode } from "./LaunchLogBlock"
import { LinkedAssetNode } from "./LinkedAssetBlock"
import { ReferenceDocNode } from "./ReferenceDocBlock"
import { CalloutNode } from "./CalloutBlock"
import { PpeNode } from "./PpeBlock"
import { DiagramNode } from "./DiagramBlock"
import { StepListNode, StepItemNode } from "./StepListBlock"
import { PdfAttachmentNode } from "./PdfAttachmentBlock"

interface TiptapReadOnlyProps {
  content: unknown
  className?: string
}

/**
 * Renders a TipTap document JSON in read-only mode.
 *
 * The extension list MUST mirror DocumentEditor's — anything authored in the
 * editor that isn't loaded here gets silently stripped. That bug bit us once
 * (tables disappeared on save round-trip); don't add a new node to the
 * editor without adding it here too.
 */
export function TiptapReadOnly({ content, className }: TiptapReadOnlyProps) {
  const isValid = useMemo(() => {
    return (
      content != null &&
      typeof content === "object" &&
      (content as { type?: string }).type === "doc"
    )
  }, [content])

  const editor = useEditor(
    {
      editable: false,
      content: isValid ? (content as object) : null,
      extensions: [
        StarterKit,
        ImageWithRef.configure({ inline: false }),
        Link.configure({ openOnClick: true, autolink: true }),
        Table.configure({ resizable: false, cellMinWidth: 80 }),
        TableRow,
        TableHeader,
        TableCell,
        LaunchLogNode,
        LinkedAssetNode,
        ReferenceDocNode,
        CalloutNode,
        PpeNode,
        DiagramNode,
        StepListNode,
        StepItemNode,
        PdfAttachmentNode,
      ],
      // Read only: it is a document, not a text box.
      editorProps: { attributes: { role: "document", "aria-label": "Document body" } },
      enableContentCheck: false,
    },
    [isValid, content],
  )

  useEffect(() => {
    if (!editor) return
    if (!isValid) {
      editor.commands.clearContent()
      return
    }
    const current = editor.getJSON() as unknown
    if (current !== content) {
      editor.commands.setContent(content as never, false)
    }
  }, [editor, isValid, content])

  if (!isValid) {
    return (
      <div
        className={cn(
          "rounded-md border border-dashed bg-muted/20 p-6 text-sm text-muted-foreground",
          className,
        )}
      >
        This document has no rendered content yet.
      </div>
    )
  }

  return (
    <div className={cn("tiptap-content max-w-none", className)}>
      <EditorContent editor={editor} />
    </div>
  )
}
