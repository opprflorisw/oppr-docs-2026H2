// "Propose from documents" (docs/adr/0006). Claude reads the Published
// documents and proposes Plant items and glossary terms that are missing.
// Proposals wait as pending until an Engineer accepts or rejects each one;
// nothing is added to the Plant without that (docs/adr/0003).
import { ConvexError, v } from "convex/values"
import { z } from "zod"
import { action } from "../_generated/server"
import { internal } from "../_generated/api"
import type { Id } from "../_generated/dataModel"
import { requireUser } from "../lib/auth"
import { claudeConfigured, claudeJson, describeClaudeError } from "./llm"

const PER_DOC_CHARS = 6000
const TOTAL_CHARS = 120_000
const MAX_PROPOSALS = 25
// Proposals wait for an Engineer; past this many, check those first.
const MAX_PENDING = 40

const Out = z.object({
  proposals: z.array(
    z.object({
      kind: z.enum(["line", "process", "product", "material", "hazard", "role", "team", "term"]),
      name: z.string(),
      description: z.string(),
      areaCode: z.string().nullable(),
      synonyms: z.array(z.string()),
      reason: z.string(),
      sourceCodes: z.array(z.string()),
    }),
  ),
})

const SYSTEM = [
  "You help an Engineer build the Plant ontology of a factory inside Oppr Knowledge: its lines, processes, products, materials, hazards, roles, teams and a glossary of the words people use.",
  "You get the factory's Published documents (each with its naming code) and the list of items the Plant already has or that were already proposed or rejected.",
  `Propose at most ${MAX_PROPOSALS} NEW items that the documents clearly support and that are missing from KNOWN. Prefer what an Operator or a new starter would look up.`,
  "",
  "Each proposal:",
  "- kind: line, process, product, material, hazard, role, team or term (a glossary word or abbreviation).",
  "- name: the plain name as the documents use it, for example \"Screen pack change\" or \"Melt pressure\". For a term, the word itself.",
  "- description: one or two plain sentences, only what the documents say. No values that are not in the documents.",
  "- areaCode: one of the AREAS codes when the item clearly belongs to one area, else null.",
  "- synonyms: abbreviations and other words for the same thing found in the documents, and the usual Dutch word when you are sure of it. May be empty.",
  "- reason: one short sentence on where the documents show this, for the Engineer.",
  "- sourceCodes: the naming codes of the documents it comes from (at least one).",
  "",
  "Never repeat an item from KNOWN, also not under another spelling. No machines as items (machines are Assets). Plain language, no em dashes.",
].join("\n")

/** Ask Claude for proposals. Returns how many new ones are waiting. */
export const propose = action({
  args: { personId: v.id("people") },
  handler: async (ctx, args): Promise<{ added: number; read: number }> => {
    await requireUser(ctx)
    await ctx.runMutation(internal.plant.plant.checkEditor, { personId: args.personId })
    if (!claudeConfigured()) {
      throw new ConvexError("Proposing needs the Claude key on this server. Add items yourself for now.")
    }
    const input: {
      sources: { id: Id<"documents">; code: string; title: string; text: string }[]
      known: string[]
      areas: { code: string; label: string }[]
      pendingCount: number
    } = await ctx.runQuery(internal.plant.plant.proposalInput, {})
    const room = MAX_PENDING - input.pendingCount
    if (room <= 0) {
      throw new ConvexError(`${input.pendingCount} proposals are still waiting. Accept or reject those first.`)
    }
    if (input.sources.length === 0) throw new ConvexError("There are no Published documents to read yet.")

    const blocks: string[] = []
    let total = 0
    let read = 0
    for (const s of input.sources) {
      if (total >= TOTAL_CHARS) break
      const text = s.text.slice(0, PER_DOC_CHARS)
      total += text.length
      read += 1
      blocks.push(`DOCUMENT ${s.code}: ${s.title}\n${text}`)
    }
    const prompt = [
      "AREAS:",
      ...input.areas.map((a) => `- ${a.code}: ${a.label}`),
      "",
      "KNOWN:",
      ...(input.known.length ? input.known.map((k) => `- ${k}`) : ["(nothing yet)"]),
      "",
      "PUBLISHED DOCUMENTS:",
      blocks.join("\n\n"),
    ].join("\n")

    let out: z.infer<typeof Out>
    try {
      out = await claudeJson({
        meter: { ctx, feature: "plant", personId: args.personId },
        system: SYSTEM,
        messages: [{ role: "user", content: prompt }],
        schema: Out,
        effort: "low",
        maxTokens: 8000,
      })
    } catch (err) {
      console.error("Plant proposals failed:", describeClaudeError(err))
      throw new ConvexError(`No proposals this time. ${describeClaudeError(err)}`.slice(0, 300))
    }

    const byCode = new Map(input.sources.map((s) => [s.code, s.id]))
    const proposals = out.proposals.slice(0, Math.min(MAX_PROPOSALS, room)).flatMap((p) => {
      const sourceDocumentIds = p.sourceCodes
        .map((c) => byCode.get(c.trim()))
        .filter((x): x is Id<"documents"> => !!x)
      // A proposal must trace back to a Published document.
      if (sourceDocumentIds.length === 0) return []
      return [
        {
          kind: p.kind,
          name: p.name,
          description: p.description,
          areaCode: p.areaCode,
          synonyms: p.synonyms,
          reason: p.reason,
          sourceDocumentIds: Array.from(new Set(sourceDocumentIds)),
        },
      ]
    })
    const added: number = await ctx.runMutation(internal.plant.plant.storeProposals, { proposals })
    return { added, read }
  },
})
