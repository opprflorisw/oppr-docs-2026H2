// Text in and out of the MCP server.
//   - tiptapToText: a Published TipTap body as readable markdown-like text
//     for an outside model (headings, numbered steps, tables as rows,
//     warnings marked).
//   - blocksToTiptap: the simple block format of oppr_import_draft
//     (tools.ts BLOCK_FORMAT) as TipTap JSON with the same node shapes the
//     editor and the seed use (convex/seed/builders.ts).
import { Node, bullets, callout, doc, h, p, ppe, steps, t, table } from "../seed/builders"

export type ImportBlock =
  | { kind: "heading"; text: string; level: 1 | 2 | 3 }
  | { kind: "paragraph"; text: string }
  | { kind: "steps"; items: string[] }
  | { kind: "bullets"; items: string[] }
  | { kind: "warning"; level: "danger" | "warning" | "caution" | "notice" | "tip"; text: string }
  | { kind: "table"; rows: string[][] }
  | { kind: "ppe"; items: string[] }

/** Collapse whitespace; the import format is plain text. */
const clean = (s: string) => s.replace(/\s+/g, " ").trim()

export function blocksToTiptap(
  blocks: ImportBlock[],
  assets: { id: string; code: string }[],
): Node {
  const content: Node[] = []
  // Asset pills make the links part of the body, which is the source of
  // truth for documentAssets when the draft is edited later (documents.ts).
  if (assets.length > 0) {
    const parts: Node[] = [t("Applies to: ")]
    assets.forEach((a, i) => {
      if (i > 0) parts.push(t(", "))
      parts.push({ type: "linkedAsset", attrs: { assetId: a.id, assetCode: a.code, label: a.code } })
    })
    content.push({ type: "paragraph", content: parts })
  }
  for (const b of blocks) {
    switch (b.kind) {
      case "heading":
        content.push(h(b.level, clean(b.text)))
        break
      case "paragraph":
        content.push(p(clean(b.text)))
        break
      case "steps":
        content.push(steps(b.items.map(clean).filter(Boolean)))
        break
      case "bullets":
        content.push(bullets(b.items.map(clean).filter(Boolean)))
        break
      case "warning":
        content.push(callout(b.level, clean(b.text)))
        break
      case "table": {
        const width = Math.max(...b.rows.map((r) => r.length))
        content.push(table(b.rows.map((r) => [...r.map(clean), ...Array(width - r.length).fill("")])))
        break
      }
      case "ppe":
        content.push(ppe([...new Set(b.items)].join(",")))
        break
    }
  }
  return doc(...content)
}

// ---- TipTap to text ---------------------------------------------------------------

interface TNode {
  type?: string
  attrs?: Record<string, unknown>
  content?: TNode[]
  text?: string
}

function inlineText(n: TNode): string {
  if (n.text != null) return n.text
  if (n.type === "linkedAsset") return String(n.attrs?.label ?? n.attrs?.assetCode ?? "")
  if (n.type === "referenceDoc") return String(n.attrs?.code ?? n.attrs?.label ?? "")
  if (n.type === "hardBreak") return " "
  return (n.content ?? []).map(inlineText).join("")
}

const CALLOUT_LABEL: Record<string, string> = {
  danger: "DANGER",
  warning: "WARNING",
  caution: "CAUTION",
  notice: "NOTICE",
  tip: "TIP",
  loto: "LOCKOUT/TAGOUT",
  hotwork: "HOT WORK",
  confined: "CONFINED SPACE",
  heights: "WORK AT HEIGHT",
  authorised: "AUTHORISED PERSONS ONLY",
  permit: "PERMIT REQUIRED",
  electrical: "ELECTRICAL",
  cryo: "CRYOGENIC",
}

/** Markdown-like text of a TipTap body. PPE slugs are mapped to labels. */
export function tiptapToText(body: unknown, ppeLabels: Map<string, string>): string {
  const lines: string[] = []
  const block = (n: TNode, indent = "") => {
    switch (n.type) {
      case "heading": {
        const level = Number(n.attrs?.level ?? 2)
        lines.push("", `${"#".repeat(Math.min(Math.max(level, 1), 3) + 1)} ${inlineText(n).trim()}`)
        return
      }
      case "paragraph": {
        const text = inlineText(n).trim()
        if (text) lines.push(`${indent}${text}`)
        return
      }
      case "stepList":
      case "orderedList":
        ;(n.content ?? []).forEach((item, i) => {
          lines.push(`${indent}${i + 1}. ${itemText(item)}`)
        })
        return
      case "bulletList":
        for (const item of n.content ?? []) lines.push(`${indent}- ${itemText(item)}`)
        return
      case "callout": {
        const kind = String(n.attrs?.kind ?? "notice")
        const label = CALLOUT_LABEL[kind] ?? kind.toUpperCase()
        const text = (n.content ?? []).map(inlineText).join(" ").trim()
        lines.push(`> [${label}] ${text}`)
        return
      }
      case "ppe": {
        const slugs = String(n.attrs?.items ?? "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
        if (slugs.length) lines.push(`[PPE required] ${slugs.map((s) => ppeLabels.get(s) ?? s).join(", ")}`)
        return
      }
      case "table":
        for (const row of n.content ?? []) {
          const cells = (row.content ?? []).map((c) => inlineText(c).trim())
          lines.push(`| ${cells.join(" | ")} |`)
        }
        return
      case "image": {
        const alt = String(n.attrs?.alt ?? "").trim()
        if (alt) lines.push(`[Figure] ${alt}`)
        return
      }
      case "blockquote":
        for (const c of n.content ?? []) block(c, "> ")
        return
      case "horizontalRule":
        lines.push("---")
        return
      case "launchLog":
        lines.push(`[Log] ${String(n.attrs?.label ?? n.attrs?.code ?? "linked log")}`)
        return
      case "pdfAttachment":
        lines.push("[Attached PDF]")
        return
      default:
        for (const c of n.content ?? []) block(c, indent)
    }
  }
  const itemText = (item: TNode) =>
    (item.content ?? [])
      .map((c) => (c.type === "paragraph" ? inlineText(c).trim() : ""))
      .filter(Boolean)
      .join(" ")
  if (body && typeof body === "object") block(body as TNode)
  return lines
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}
