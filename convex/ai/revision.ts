// Proposed revisions (CONTEXT.md: Proposed revision; ADR 0003).
// The AI suggests minimal edits to the live version of a Published Document
// from a signal (a Finding, the Document's insights, or Knowledge health).
// Code checks every edit; convex/revisions.ts turns the survivors into a
// normal draft version. The AI never approves or publishes.
import { v } from "convex/values"
import { z } from "zod"
import { action, internalAction } from "../_generated/server"
import { internal } from "../_generated/api"
import { Id } from "../_generated/dataModel"
import { requireUserId } from "../lib/auth"
import { claudeConfigured, claudeJson, describeClaudeError } from "./llm"
import { checkPoint, ProvidedExcerpt } from "./grounding"
import type { BodyBlock, PlannedChange } from "../revisions"

/**
 * Starts a Proposed revision for a Published Document from a signal (an open
 * Finding, the Document's insights, or Knowledge health). Returns the new
 * proposedRevisions id at once; generation runs in the background. The AI
 * only prepares a draft version: it never approves or publishes.
 */
export const propose = action({
  args: {
    documentId: v.id("documents"),
    source: v.object({
      kind: v.union(v.literal("finding"), v.literal("insight"), v.literal("health")),
      findingId: v.optional(v.id("findings")),
      note: v.string(),
    }),
  },
  handler: async (ctx, args): Promise<Id<"proposedRevisions">> => {
    const userId = await requireUserId(ctx)
    return await ctx.runMutation(internal.revisions.start, {
      documentId: args.documentId,
      source: args.source,
      userId,
    })
  },
})

const Out = z.object({
  summary: z.string(),
  changes: z.array(
    z.object({
      block: z.string(),
      before: z.string(),
      after: z.string(),
      reason: z.string(),
    }),
  ),
})

const SYSTEM = [
  "You prepare a Proposed revision of a controlled document in Oppr Knowledge, a factory's knowledge base under ISO 9001 control.",
  "An Engineer reviews your proposal and decides. You never publish anything. Your job is the smallest set of precise edits that answers the SIGNAL.",
  "",
  "The document is given as numbered BLOCKS (B1, B2, ...). Each block is one paragraph, heading, procedure step, list item, callout or table cell.",
  "",
  "Each change:",
  "- block: the key of the block you edit.",
  "- before: text copied character for character from that block. Either the whole block or one contiguous part of it (a sentence). Never paraphrase it.",
  "- after: the replacement text for exactly that part. Keep the document's voice, terms, units and formatting conventions. Keep warnings at least as strong.",
  "- reason: one short sentence that ties the change to the signal, for example quoting the question operators ask or naming the other document of the Finding.",
  "- To remove a block completely, set before to the whole block and after to an empty string. Use this only to remove duplicated text.",
  "",
  "Hard rules (code checks them; a change that breaks one is thrown away):",
  "- Never introduce a number, value, unit or code that is not already in the document or in the OTHER DOCUMENT passage of the signal.",
  "- Do not add new rules, instructions or safety measures of your own. Add only what the document or the OTHER DOCUMENT already says; anything else the signal asks for becomes a bracketed placeholder.",
  "- When the right value or fact is not known from these texts, do not guess. Write a placeholder in square brackets for the Engineer, for example \"[Engineer to confirm: maximum time in the hopper]\".",
  "- Change as little as possible: 1 to 6 changes, each focused. Do not rewrite blocks that the signal does not concern. Do not reorder or renumber steps.",
  "- Plain language, no em dashes.",
  "",
  "By kind of signal:",
  "- Contradiction Finding: edit only the passages of this document that disagree. Align with the other document when it is the authority for that fact (a supplier manual for machine limits, torque and calibration intervals). If it is not clear which side is right, keep the value, add a reference to the other document and a bracketed placeholder for the Engineer to confirm.",
  "- Duplicate Finding: make the library smaller. Replace the duplicated passage in this document with one short sentence that refers to the other document by its naming code, or remove repeated blocks, keeping anything that only this document says.",
  "- Insights (questions people Ask, unanswered questions, unclear marks): clarify the passage people ask about so the answer is easy to find. Use facts already elsewhere in the document; for a fact the document does not give, add a bracketed placeholder so the Engineer fills it in.",
  "",
  "summary: one sentence (at most 30 words) for the Engineer saying what the revision changes and why.",
].join("\n")

// grounding reports values in canonical form ("3 H", "45 NM"); show them as people write them.
const readable = (detail: string | undefined) =>
  detail
    ? detail
        .replace(/#([A-Z]+)/g, (_, w: string) => w.toLowerCase())
        .replace(/\bNM\b/g, "Nm")
        .replace(/\b(H|MIN|S|DAY|WEEK|MONTH|KG|G|MM|CM|M|L|BAR|MBAR|RPM|KW|V|HZ|M\/MIN|KG\/H)\b/g, (u) => u.toLowerCase())
    : "a value"

const clean = (s: string) => s.replace(/\s*[—–]\s*/g, ", ").replace(/\s+/g, " ").trim()

export const generate = internalAction({
  args: { proposedRevisionId: v.id("proposedRevisions") },
  handler: async (ctx, args): Promise<void> => {
    const input = await ctx.runQuery(internal.revisions.loadForGeneration, args)
    if (!input) return
    const fail = async (error: string, summary?: string) => {
      await ctx.runMutation(internal.revisions.markFailed, {
        proposedRevisionId: args.proposedRevisionId,
        error,
        summary,
      })
    }

    if (!claudeConfigured()) return fail("No AI key is set on this deployment, so no revision can be prepared.")
    if (input.blocks.length === 0) return fail("The Published version has no text to revise.")
    const kind = input.proposal.source.kind
    if (kind === "finding" && !input.finding) return fail("The Finding behind this request no longer exists.")
    if (
      kind !== "finding" &&
      input.questions.length === 0 &&
      input.flags.length === 0 &&
      input.themes.length === 0 &&
      !input.proposal.source.note.trim()
    ) {
      return fail("There are no questions or marks about this document yet, so there is nothing to revise from.")
    }

    const blocks: BodyBlock[] = input.blocks
    const docLine = `${input.doc.namingCode} v${input.proposal.baseVersion} · ${input.doc.title}`
    const blockText = blocks
      .map(
        (b) =>
          `${b.key} [${b.label}${b.section && b.kind !== "heading" ? `, section "${b.section}"` : ""}]: ${b.text}`,
      )
      .join("\n")

    let signal = ""
    if (kind === "finding" && input.finding) {
      const f = input.finding
      signal = [
        `KIND: ${f.kind} Finding from the Consistency check.`,
        `FINDING: ${f.summary}`,
        `THIS DOCUMENT SAYS (${input.doc.namingCode}${f.mine.section ? `, ${f.mine.section}` : ""}): "${f.mine.quote}"`,
        `OTHER DOCUMENT (${f.other.namingCode} v${f.other.version} · ${f.other.title}${f.other.section ? `, ${f.other.section}` : ""}) SAYS: "${f.other.quote}"`,
      ].join("\n")
    } else {
      const unanswered = input.questions.filter((q) => !q.answered)
      const answered = input.questions.filter((q) => q.answered)
      signal = [
        `KIND: Document insights${kind === "health" ? " (from Knowledge health)" : ""}.`,
        input.themes.length
          ? `THEMES:\n${input.themes.map((t) => `- [${t.severity}] ${t.title}: ${t.detail}`).join("\n")}`
          : "",
        unanswered.length
          ? `QUESTIONS THE DOCUMENT DID NOT ANSWER:\n${unanswered
              .slice(0, 20)
              .map((q) => `- ${q.question}`)
              .join("\n")}`
          : "",
        answered.length
          ? `OTHER QUESTIONS PEOPLE ASK:\n${answered
              .slice(0, 20)
              .map((q) => `- ${q.question}`)
              .join("\n")}`
          : "",
        input.flags.length ? `MARKED UNCLEAR OR WRONG:\n${input.flags.map((n) => `- ${n}`).join("\n")}` : "",
      ]
        .filter(Boolean)
        .join("\n\n")
    }
    const note = input.proposal.source.note.trim()
    const prompt = [
      `DOCUMENT: ${docLine}`,
      "",
      `SIGNAL:\n${signal}`,
      note ? `\nENGINEER'S NOTE: ${note}` : "",
      "",
      `BLOCKS:\n${blockText}`,
    ].join("\n")

    let out: z.infer<typeof Out>
    try {
      out = await claudeJson({
        system: SYSTEM,
        messages: [{ role: "user", content: prompt }],
        schema: Out,
        effort: "medium",
        maxTokens: 8000,
      })
    } catch (err) {
      return fail(describeClaudeError(err))
    }

    // ---- Checks in code ------------------------------------------------------
    // Sources a number or code may come from: the document itself, and for a
    // Finding the other side's quoted passage.
    const provided = new Map<string, ProvidedExcerpt>()
    for (const b of blocks) provided.set(b.key, { key: b.key, text: b.text, label: docLine })
    if (input.finding) {
      const o = input.finding.other
      provided.set("F1", { key: "F1", text: o.quote, label: `${o.namingCode} v${o.version} · ${o.title}` })
      provided.set("F2", { key: "F2", text: input.finding.mine.quote, label: docLine })
    }
    const allKeys = Array.from(provided.keys())
    const byKey = new Map(blocks.map((b) => [b.key, b]))

    const kept: PlannedChange[] = []
    const dropped: string[] = []
    for (const c of out.changes.slice(0, 8)) {
      const before = c.before.trim()
      const after = clean(c.after)
      let block = byKey.get(c.block.trim())
      if (!block || !block.text.includes(before)) {
        // The model may have named the wrong block; accept the passage only
        // when it occurs verbatim in exactly one block.
        const hits = blocks.filter((b) => b.text.includes(before))
        block = hits.length === 1 ? hits[0] : undefined
      }
      if (!before || !block) {
        dropped.push("its original text is not in the document word for word")
        console.warn(`[revision] dropped, before not found: ${before.slice(0, 120)}`)
        continue
      }
      if (after === before) continue
      if (after === "" && before !== block.text.trim()) {
        dropped.push("it removed part of a passage without replacing it")
        continue
      }
      const checkable = after.replace(/\[[^\]]*\]/g, " ").trim()
      if (checkable) {
        const res = checkPoint({ text: checkable, sources: allKeys }, provided)
        const miss = "dropped" in res ? res.dropped : null
        if (miss && miss.reason === "unsupported-token") {
          dropped.push(`${readable(miss.detail)} is not stated in the document${input.finding ? " or the Finding" : ""}`)
          console.warn(`[revision] dropped, unsupported ${miss.detail}: ${after.slice(0, 120)}`)
          continue
        }
      }
      const blockKey = block.key
      if (kept.some((k) => k.blockKey === blockKey && (k.before.includes(before) || before.includes(k.before)))) {
        dropped.push("it overlapped another change")
        continue
      }
      kept.push({ blockKey, before, after, reason: clean(c.reason) })
    }

    const summary = clean(out.summary) || "Proposed edits from the signal."
    const reasons = Array.from(new Set(dropped)).join("; ")
    if (kept.length === 0) {
      return fail(
        `No change could be verified against the Published text.${reasons ? ` Every suggested change failed a check: ${reasons}.` : ""}`,
        summary,
      )
    }
    const droppedNote = dropped.length
      ? `${dropped.length} suggested ${dropped.length === 1 ? "change was" : "changes were"} left out because ${reasons}.`
      : null
    await ctx.runMutation(internal.revisions.applyProposal, {
      proposedRevisionId: args.proposedRevisionId,
      summary,
      changes: kept,
      droppedNote,
    })
  },
})
