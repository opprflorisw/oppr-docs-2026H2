import { internalMutation, mutation, MutationCtx } from "./_generated/server"

// Seeds the best-practice, multi-chapter SOP template into the templates
// table. Upserts by its key: a row with the same name, ignoring dashes,
// colons and spacing, is overwritten (so an older name is renamed). The
// knowledge reseed (seedKnowledge:run) calls `upsert`, which also takes the
// long dash out of every template name and description. No auth requirement
// on the public mutation so it can be run from the CLI
// (`npx convex run seedTemplates:seedBestPracticeSop`): it only writes
// template rows, which is harmless in this showcase.

interface JSONNode {
  type: string
  attrs?: Record<string, unknown>
  content?: JSONNode[]
  text?: string
}

const t = (s: string): JSONNode => ({ type: "text", text: s })
const p = (s: string): JSONNode => ({
  type: "paragraph",
  content: s ? [t(s)] : [],
})
const h = (level: number, s: string): JSONNode => ({
  type: "heading",
  attrs: { level },
  content: [t(s)],
})
const ppe = (items: string[]): JSONNode => ({
  type: "ppe",
  attrs: { items: items.join(",") },
})
const callout = (kind: string, body: JSONNode[]): JSONNode => ({
  type: "callout",
  attrs: { kind },
  content: body,
})
const steps = (n: number): JSONNode => ({
  type: "stepList",
  content: Array.from({ length: n }, () => ({
    type: "stepItem",
    content: [{ type: "paragraph" }],
  })),
})
const bullets = (items: string[]): JSONNode => ({
  type: "bulletList",
  content: items.map((it) => ({
    type: "listItem",
    content: [{ type: "paragraph", content: [t(it)] }],
  })),
})
const table = (rows: string[][]): JSONNode => ({
  type: "table",
  content: rows.map((row, i) => ({
    type: "tableRow",
    content: row.map((cell) => ({
      type: i === 0 ? "tableHeader" : "tableCell",
      attrs: { colspan: 1, rowspan: 1, colwidth: null },
      content: [{ type: "paragraph", content: cell ? [t(cell)] : [] }],
    })),
  })),
})

const SOP_BEST_PRACTICE: JSONNode = {
  type: "doc",
  content: [
    h(1, "Standard Operating Procedure"),

    h(2, "1. Purpose"),
    p(
      "Describe what this procedure achieves and why it exists: the outcome it guarantees and the risk it controls. One short paragraph.",
    ),

    h(2, "2. Scope"),
    p(
      "Where this SOP applies: the process, area, and equipment it covers, and who is expected to perform it.",
    ),

    h(2, "3. Safety"),
    p("Required PPE for this task:"),
    ppe(["hardhat", "glasses", "gloves", "boots"]),
    callout("warning", [
      p(
        "State the critical safety condition that must be confirmed before starting. Stop work if it cannot be met.",
      ),
    ]),

    h(2, "4. Definitions & abbreviations"),
    table([
      ["Term", "Definition"],
      ["", ""],
      ["", ""],
    ]),

    h(2, "5. Tools & equipment required"),
    bullets([
      "Tools and instruments required",
      "Materials and consumables",
      "Permits or approvals required before starting",
      "Required system / equipment state before starting",
    ]),

    h(2, "6. Procedure"),
    p(
      "Carry out the following actions in order. These are operating actions, not controlled work instructions. Detailed, controlled work instructions live in Oppr LOGS and will be linked from an action (planned).",
    ),
    steps(6),

    p(
      "Cite any related documents inline using the Reference document chip (toolbar). The References & related documents table and the Revision history are generated automatically when the document is published or exported to PDF. You don't maintain them here.",
    ),
  ],
}

const SOP_NAME = "SOP: Best practice (chapters)"
const SOP_DESCRIPTION =
  "Chaptered SOP: scope, safety, definitions, prerequisites, procedure (uncontrolled actions), references, revision history."

const LONG_DASH = /\s*[\u2013\u2014]\s*/g

/** The template's identity: its name without dashes, colons or spacing. */
const keyOf = (name: string) => name.toLowerCase().replace(/[\s:\-\u2013\u2014]+/g, "")

/** A long dash in a name becomes a colon ("SOP: Best practice"); in a description, a comma. */
function withoutLongDash(text: string, kind: "name" | "description"): string {
  return text.replace(LONG_DASH, kind === "name" ? ": " : ", ")
}

async function upsertTemplates(ctx: MutationCtx) {
  const rows = await ctx.db.query("templates").take(500)
  const key = keyOf(SOP_NAME)
  const matches = rows.filter((r) => keyOf(r.name) === key)
  // Older runs could leave a renamed copy next to the current one: keep one.
  const [keep, ...extra] = matches
  for (const r of extra) await ctx.db.delete(r._id)
  const fields = {
    name: SOP_NAME,
    type: "sop",
    description: SOP_DESCRIPTION,
    bodyJson: SOP_BEST_PRACTICE,
    updatedAt: Date.now(),
  }
  let id = keep?._id ?? null
  if (keep) await ctx.db.patch(keep._id, fields)
  else id = await ctx.db.insert("templates", fields)
  let renamed = 0
  for (const r of rows) {
    if (matches.includes(r)) continue
    const name = withoutLongDash(r.name, "name")
    const description = r.description == null ? null : withoutLongDash(r.description, "description")
    if (name !== r.name || description !== r.description) {
      await ctx.db.patch(r._id, { name, description })
      renamed++
    }
  }
  return { id, created: !keep, removedDuplicates: extra.length, renamed }
}

/** Called by the knowledge reseed (seedKnowledge:run). */
export const upsert = internalMutation({
  args: {},
  handler: async (ctx) => upsertTemplates(ctx),
})

export const seedBestPracticeSop = mutation({
  args: {},
  handler: async (ctx) => upsertTemplates(ctx),
})
