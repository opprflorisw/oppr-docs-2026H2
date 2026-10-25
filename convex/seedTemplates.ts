import { internalMutation, mutation, MutationCtx } from "./_generated/server"
import { v } from "convex/values"
import { BUILT_IN_TEMPLATES } from "../src/components/docs/DocumentTemplates"
import { addMissingFactoryTypes } from "./namingTypes"

// Keeps the built-in templates (src/components/docs/DocumentTemplates.ts) in
// the templates table, idempotently:
// - a built-in that is missing (matched by name, ignoring dashes, colons and
//   spacing) is inserted;
// - a built-in row whose body is still exactly a body we shipped is updated
//   to the current one;
// - a row a person edited is left alone. For the SOP, the current body is then
//   added next to it as "SOP (2026)" so nobody's work is overwritten.
// It also takes the long dash out of every template name and description.
// The knowledge reseed (seedKnowledge:run) calls `ensure`. No auth on the
// public mutation so it can be run from the CLI
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

// The SOP body shipped before the 2026 update: a row still carrying it was
// never edited by a person, so it may be replaced.
const LEGACY_SOP_BODY: JSONNode = {
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
const SOP_FALLBACK_NAME = "SOP (2026)"

/** Bodies we shipped earlier, per built-in name: rows still equal to one are unedited. */
const SHIPPED_BODIES: Record<string, unknown[]> = {
  [SOP_NAME]: [LEGACY_SOP_BODY],
}

const LONG_DASH = /\s*[\u2013\u2014]\s*/g

/** The template's identity: its name without dashes, colons or spacing. */
const keyOf = (name: string) => name.toLowerCase().replace(/[\s:\-\u2013\u2014]+/g, "")

/** A long dash in a name becomes a colon ("SOP: Best practice"); in a description, a comma. */
function withoutLongDash(text: string, kind: "name" | "description"): string {
  return text.replace(LONG_DASH, kind === "name" ? ": " : ", ")
}

/** JSON with sorted keys, so stored and shipped bodies compare by content. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`
  }
  return JSON.stringify(value ?? null)
}

type Outcome = "inserted" | "updated" | "unchanged" | "kept (edited by a person)"

async function ensureTemplates(ctx: MutationCtx, dryRun: boolean) {
  const rows = await ctx.db.query("templates").take(500)
  const now = Date.now()
  const result: Record<string, Outcome> = {}
  const handled = new Set<string>()
  let removedDuplicates = 0

  for (const t of BUILT_IN_TEMPLATES) {
    const key = keyOf(t.name)
    const matches = rows.filter((r) => keyOf(r.name) === key)
    for (const r of matches) handled.add(r._id)
    const fields = {
      name: t.name,
      type: t.type,
      description: t.description,
      bodyJson: t.bodyJson,
      updatedAt: now,
    }
    const [keep, ...extra] = matches
    if (!keep) {
      if (!dryRun) await ctx.db.insert("templates", fields)
      result[t.name] = "inserted"
      continue
    }
    // Older runs could leave a renamed copy next to the current one: keep one.
    for (const r of extra) {
      if (!dryRun) await ctx.db.delete(r._id)
      removedDuplicates++
    }
    const current = canonical(t.bodyJson)
    const stored = canonical(keep.bodyJson)
    if (stored === current) {
      if (keep.name !== t.name || keep.description !== t.description || keep.type !== t.type) {
        if (!dryRun) await ctx.db.patch(keep._id, fields)
        result[t.name] = "updated"
      } else result[t.name] = "unchanged"
      continue
    }
    const shipped = (SHIPPED_BODIES[t.name] ?? []).map(canonical)
    if (shipped.includes(stored)) {
      if (!dryRun) await ctx.db.patch(keep._id, fields)
      result[t.name] = "updated"
      continue
    }
    result[t.name] = "kept (edited by a person)"
    if (t.name === SOP_NAME) {
      const fallbackKey = keyOf(SOP_FALLBACK_NAME)
      const fallback = rows.find((r) => keyOf(r.name) === fallbackKey)
      if (fallback) {
        handled.add(fallback._id)
        result[SOP_FALLBACK_NAME] = canonical(fallback.bodyJson) === current ? "unchanged" : "kept (edited by a person)"
      } else {
        if (!dryRun) await ctx.db.insert("templates", { ...fields, name: SOP_FALLBACK_NAME })
        result[SOP_FALLBACK_NAME] = "inserted"
      }
    }
  }

  let renamed = 0
  for (const r of rows) {
    if (handled.has(r._id)) continue
    const name = withoutLongDash(r.name, "name")
    const description = r.description == null ? null : withoutLongDash(r.description, "description")
    if (name !== r.name || description !== r.description) {
      if (!dryRun) await ctx.db.patch(r._id, { name, description })
      renamed++
    }
  }
  // The templates use the Toolbox talk and Policy types: make sure they exist.
  const typesAdded = dryRun ? [] : await addMissingFactoryTypes(ctx)
  return { dryRun, templates: result, removedDuplicates, renamed, typesAdded }
}

/** Called by the knowledge reseed (seedKnowledge:run); also `npx convex run seedTemplates:ensure`. */
export const ensure = internalMutation({
  args: { dryRun: v.optional(v.boolean()) },
  handler: async (ctx, args) => ensureTemplates(ctx, args.dryRun ?? false),
})

export const seedBestPracticeSop = mutation({
  args: {},
  handler: async (ctx) => ensureTemplates(ctx, false),
})
