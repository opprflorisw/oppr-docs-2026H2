// Putting found images, passages and guided Drafts into the Document editor.
// TipTap keeps its Editor on the ProseMirror element (`dom.editor`), so a
// panel outside DocumentEditor can insert at the person's last cursor
// position without new props on the editor. When that is not available the
// caller appends to the body instead.
import type { Id } from "../../../convex/_generated/dataModel"

export interface TNode {
  type: string
  attrs?: Record<string, unknown>
  content?: TNode[]
  text?: string
  marks?: { type: string; attrs?: Record<string, unknown> }[]
}

interface ChainLike {
  focus: () => ChainLike
  insertContent: (c: unknown) => ChainLike
  insertContentAt: (pos: number, c: unknown) => ChainLike
  run: () => boolean
}

interface EditorLike {
  isDestroyed?: boolean
  state: { doc: { content: { size: number } } }
  chain: () => ChainLike
}

/** The editor inside `root` (or the page), if TipTap exposes it. */
function findEditor(root: ParentNode | null): EditorLike | null {
  const el = (root ?? document).querySelector(".ProseMirror") as (HTMLElement & { editor?: EditorLike }) | null
  const editor = el?.editor
  return editor && !editor.isDestroyed ? editor : null
}

/**
 * Inserts at the person's cursor, or after the last block when they have not
 * placed one in this editor (`atCursor` false). Returns false when there was
 * no editor to insert into.
 */
export function insertAtCursor(root: ParentNode | null, nodes: TNode[], atCursor = true): boolean {
  const editor = findEditor(root)
  if (!editor || nodes.length === 0) return false
  if (!atCursor) {
    return editor.chain().insertContentAt(editor.state.doc.content.size, nodes).focus().run()
  }
  return editor.chain().focus().insertContent(nodes).run()
}

/** Appends to a TipTap doc; an empty body is replaced. */
export function appendToBody(body: unknown, nodes: TNode[]): TNode {
  const doc = (body && typeof body === "object" ? body : { type: "doc", content: [] }) as TNode
  const existing = doc.content ?? []
  const empty =
    existing.length === 0 ||
    (existing.length === 1 && existing[0].type === "paragraph" && !(existing[0].content ?? []).length)
  return { type: "doc", content: empty ? nodes : [...existing, ...nodes] }
}

// ---- Builders (the same node shapes as convex/seed/builders.ts) -------------------

export const text = (t: string, bold = false): TNode =>
  bold ? { type: "text", text: t, marks: [{ type: "bold" }] } : { type: "text", text: t }

export const paragraph = (...parts: (string | TNode)[]): TNode => {
  const content = parts.filter((x) => x !== "").map((x) => (typeof x === "string" ? text(x) : x))
  return content.length ? { type: "paragraph", content } : { type: "paragraph" }
}

export const heading = (level: 1 | 2 | 3, t: string): TNode => ({
  type: "heading",
  attrs: { level },
  content: [text(t)],
})

export function imageNode(img: { imageId: Id<"images">; url: string | null; altText: string }, width = 60): TNode {
  return {
    type: "image",
    attrs: { src: img.url ?? "", alt: img.altText, title: null, "data-image-id": img.imageId, width, align: "center" },
  }
}

export const calloutNode = (kind: string, t: string): TNode => ({
  type: "callout",
  attrs: { kind },
  content: [paragraph(t)],
})

export const ppeNode = (slugs: string[]): TNode => ({ type: "ppe", attrs: { items: slugs.join(",") } })

/** A Published passage as a quote with a reference to its Document. */
export function passageNodes(p: {
  documentId: Id<"documents">
  namingCode: string
  title: string
  section: string | null
  text: string
}): TNode[] {
  return [
    {
      type: "blockquote",
      content: [
        paragraph(p.text.replace(/\s+/g, " ").trim()),
        paragraph(
          "Source: ",
          { type: "referenceDoc", attrs: { docId: p.documentId, code: p.namingCode, label: p.namingCode } },
          ` ${p.title}${p.section ? `, ${p.section}` : ""}`,
        ),
      ],
    },
  ]
}
