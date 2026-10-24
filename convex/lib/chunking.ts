// Server-side chunkers, so the seed, Wrapped manuals and any server code cut
// text the same way. A chunk is one passage that Ask, Wikis, Trainings and the
// Consistency check can cite.

export interface ChunkInput {
  text: string
  section: string | null
}

interface Node {
  type: string
  attrs?: Record<string, unknown>
  content?: Node[]
  text?: string
}

/**
 * TipTap body → one chunk per heading, paragraph, step, list item, table row
 * and image caption, labelled with the nearest heading. Table cells are joined
 * with " | " (see grounding.withTableHeaders). Inline atoms contribute their
 * label (linkedAsset) or code (referenceDoc).
 */
export function bodyChunks(body: unknown): ChunkInput[] {
  const out: ChunkInput[] = []
  let section: string | null = null
  const textOf = (n: Node): string => {
    if (n.text != null) return n.text
    if (n.type === "linkedAsset") return String(n.attrs?.label ?? "")
    if (n.type === "referenceDoc") return String(n.attrs?.code ?? n.attrs?.label ?? "")
    if (n.type === "hardBreak") return " "
    return (n.content ?? []).map(textOf).join(n.type === "tableRow" ? " | " : "").trim()
  }
  const visit = (n: Node) => {
    if (n.type === "heading") {
      section = textOf(n)
      if (section) out.push({ text: section, section })
      return
    }
    if (n.type === "paragraph" || n.type === "stepItem" || n.type === "tableRow" || n.type === "listItem") {
      const text = textOf(n)
      if (text) out.push({ text, section })
      return
    }
    if (n.type === "image") {
      const alt = String(n.attrs?.alt ?? "").trim()
      if (alt) out.push({ text: `Figure: ${alt}`, section })
      return
    }
    for (const c of n.content ?? []) visit(c)
  }
  if (body && typeof body === "object") visit(body as Node)
  return out
}

/**
 * PDF page texts → chunks. Each page is split on blank lines into passages of
 * at most `max` characters; the section is "Page N" so a citation can open
 * the PDF at that page.
 */
export function pdfPageChunks(pages: string[], max = 800): ChunkInput[] {
  const out: ChunkInput[] = []
  pages.forEach((page, i) => {
    const section = `Page ${i + 1}`
    const paras = page
      .split(/\n\s*\n/)
      .map((t) => t.replace(/\s+/g, " ").trim())
      .filter(Boolean)
    let buf = ""
    for (const para of paras) {
      if (buf && buf.length + para.length + 1 > max) {
        out.push({ text: buf, section })
        buf = ""
      }
      if (para.length > max) {
        for (let k = 0; k < para.length; k += max) out.push({ text: para.slice(k, k + max), section })
      } else {
        buf = buf ? `${buf} ${para}` : para
      }
    }
    if (buf) out.push({ text: buf, section })
  })
  return out
}
