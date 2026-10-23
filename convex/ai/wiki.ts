import { ConvexError, v } from "convex/values"
import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai"
import type { ResponseSchema } from "@google/generative-ai"
import { action, internalAction, internalQuery } from "../_generated/server"
import { internal } from "../_generated/api"
import { Id } from "../_generated/dataModel"
import { requireUser } from "../lib/auth"
import { CHAT_MODEL } from "./constants"
import { z } from "zod"
import { claudeConfigured, claudeJson, describeClaudeError } from "./llm"
import { checkPoint, DroppedPoint, ProvidedExcerpt, RawPoint } from "./grounding"
import { loadScopeOptions } from "../wikis"

// Wiki generation and the Guided creation assistant for Wikis.

function geminiJson(apiKey: string, system: string, schema: ResponseSchema) {
  return new GoogleGenerativeAI(apiKey).getGenerativeModel({
    model: CHAT_MODEL,
    systemInstruction: system,
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: schema,
      temperature: 0.2,
    },
  })
}

// Same shapes as WIKI_SCHEMA / GUIDE_SCHEMA, for Claude's structured output.
const WikiOut = z.object({
  sections: z.array(
    z.object({
      heading: z.string(),
      points: z.array(z.object({ text: z.string(), sources: z.array(z.string()) })),
    }),
  ),
})
const GuideOut = z.object({
  reply: z.string(),
  title: z.string(),
  purpose: z.string(),
  areas: z.array(z.string()),
  disciplines: z.array(z.string()),
  assetCodes: z.array(z.string()),
  documentCodes: z.array(z.string()),
  ready: z.boolean(),
})

// ---- Generation -------------------------------------------------------------

const WIKI_SYSTEM = [
  "You write a Wiki inside Oppr Knowledge, a factory's controlled knowledge base.",
  "A Wiki is an overview for the audience named in PURPOSE AND AUDIENCE, built ONLY from the numbered EXCERPTS of published documents you are given. Nothing else you know counts.",
  "Every point is checked by code against the excerpts it cites. A point that fails the check is deleted, so a careless point is simply lost.",
  "",
  "Writing points:",
  "- One fact or one instruction per point, in one or two short sentences, in plain language that fits the audience. Use the imperative for instructions.",
  "- Stay close to the wording of the excerpt. Paraphrase only to make it shorter or clearer, never to add meaning.",
  "- Write numbers as digits with the unit exactly as the excerpt writes it (40 Nm, 190 °C, 20 %, 170-220 °C). Copy codes such as PX-4400 or EXL-201 exactly.",
  "- Keep every prohibition and warning as strong as the excerpt says it: never turn \"never\" or \"do not\" into a permission, and never drop a condition (\"while the line is only stopped\", \"at operating temperature\").",
  "- Do not invent step numbers, reasons, consequences, tolerances or best practices that the excerpts do not state.",
  "",
  "Citing:",
  "- `sources` lists the keys of the excerpts that state what the point says (for example [\"E3\", \"E7\"]). Only use keys that appear in EXCERPTS.",
  "- Cite the excerpt that states the fact, not one that is merely about the same topic. If a point combines facts from several excerpts, cite every one of them.",
  "- If two excerpts disagree (for example two documents give different values), write ONE point that states both values, says which document gives which (by document type or title, such as \"the changeover SOP\" and \"the supplier manual\"), and cites both. Do not choose between them and do not average them.",
  "",
  "Structure:",
  "- Organise points into 2 to 6 sections with short headings that fit the purpose. Safety warnings come first where relevant. Within a procedure, keep the order of the excerpts.",
  "- Leave out what does not serve the purpose. If the excerpts do not cover something the purpose asks for, leave it out rather than fill the gap.",
  "- Do not write an introduction, a conclusion or filler.",
].join("\n")

const WIKI_SCHEMA: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    sections: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          heading: { type: SchemaType.STRING },
          points: {
            type: SchemaType.ARRAY,
            items: {
              type: SchemaType.OBJECT,
              properties: {
                text: { type: SchemaType.STRING },
                sources: {
                  type: SchemaType.ARRAY,
                  items: { type: SchemaType.STRING },
                },
              },
              required: ["text", "sources"],
            },
          },
        },
        required: ["heading", "points"],
      },
    },
  },
  required: ["sections"],
}

interface GenerationDoc {
  documentId: Id<"documents">
  namingCode: string
  title: string
  version: number
  /** Passages in this version; more than chunks.length when not read in full. */
  excerptsTotal: number
  chunks: { chunkId: Id<"chunks">; text: string; section: string | null }[]
}

export const generate = internalAction({
  args: { wikiId: v.id("wikis"), ticket: v.number() },
  handler: async (ctx, args): Promise<void> => {
    const input: {
      title: string
      purpose: string
      ticket: number
      docs: GenerationDoc[]
    } | null = await ctx.runQuery(internal.wikis.loadForGeneration, {
      wikiId: args.wikiId,
    })
    // Deleted, or a newer request already took over.
    if (!input || input.ticket !== args.ticket) return

    const sources = input.docs.map((d) => ({
      documentId: d.documentId,
      namingCode: d.namingCode,
      title: d.title,
      version: d.version,
      excerptsUsed: d.chunks.length,
      excerptsTotal: d.excerptsTotal,
    }))
    const save = (fields: {
      status: "ready" | "empty" | "failed"
      content: {
        intro: string
        sections: {
          heading: string
          points: {
            text: string
            citations: {
              chunkId: Id<"chunks">
              documentId: Id<"documents">
              namingCode: string
              version: number
              section: string | null
            }[]
          }[]
        }[]
      } | null
      droppedPoints: number
      error: string | null
    }) =>
      ctx.runMutation(internal.wikis.saveGeneration, {
        wikiId: args.wikiId,
        ticket: args.ticket,
        sources,
        ...fields,
      })

    const withText = input.docs.filter((d) => d.chunks.length > 0)
    if (withText.length === 0) {
      await save({ status: "empty", content: null, droppedPoints: 0, error: null })
      return
    }

    if (aiStubEnabled()) {
      await save(stubWiki(withText))
      return
    }

    // Claude when its key is set, otherwise Gemini.
    const useClaude = claudeConfigured()
    const apiKey = process.env.GEMINI_API_KEY
    if (!useClaude && !apiKey) {
      await save({
        status: "failed",
        content: null,
        droppedPoints: 0,
        error: "No AI key is set on this deployment.",
      })
      return
    }

    // Number every excerpt with a short key the model can cite.
    const provided = new Map<string, ProvidedExcerpt>()
    const keyMeta = new Map<
      string,
      { chunkId: Id<"chunks">; doc: GenerationDoc; section: string | null }
    >()
    const blocks: string[] = []
    let n = 0
    for (const doc of withText) {
      blocks.push(`DOCUMENT ${doc.namingCode} v${doc.version}: ${doc.title}`)
      for (const c of doc.chunks) {
        n += 1
        const key = `E${n}`
        provided.set(key, {
          key,
          text: c.text,
          label: `${doc.namingCode} v${doc.version} ${doc.title}`,
        })
        keyMeta.set(key, { chunkId: c.chunkId, doc, section: c.section })
        const where = c.section ? ` (${c.section})` : ""
        blocks.push(`[${key}]${where} ${c.text}`)
      }
      blocks.push("")
    }

    const prompt = [
      `WIKI TITLE: ${input.title}`,
      `PURPOSE AND AUDIENCE: ${input.purpose || "(not specified)"}`,
      "",
      "EXCERPTS:",
      ...blocks,
    ].join("\n")

    let raw: { sections?: { heading?: string; points?: RawPoint[] }[] }
    try {
      if (useClaude) {
        raw = await claudeJson({
          system: WIKI_SYSTEM,
          messages: [{ role: "user", content: prompt }],
          schema: WikiOut,
          effort: "medium",
        })
      } else {
        const result = await geminiJson(apiKey!, WIKI_SYSTEM, WIKI_SCHEMA).generateContent(prompt)
        raw = JSON.parse(result.response.text())
      }
    } catch (err) {
      await save({
        status: "failed",
        content: null,
        droppedPoints: 0,
        error: `Generation failed: ${useClaude ? describeClaudeError(err) : err instanceof Error ? err.message : String(err)}`.slice(0, 400),
      })
      return
    }

    let dropped = 0
    const sections = []
    for (const s of raw.sections ?? []) {
      const points = []
      for (const p of s.points ?? []) {
        const checked = checkPoint(
          { text: String(p?.text ?? ""), sources: Array.isArray(p?.sources) ? p.sources.map(String) : [] },
          provided,
        )
        if (!checked.ok) {
          const why = (checked as { dropped: DroppedPoint }).dropped
          dropped += 1
          // Visible in the Convex logs, for tuning the prompt and the check.
          console.log(
            `Wiki ${args.wikiId}: dropped point (${why.reason}${why.detail ? `: ${why.detail}` : ""}): ${why.text}`,
          )
          continue
        }
        points.push({
          text: checked.point.text,
          citations: checked.point.sources.map((key) => {
            const m = keyMeta.get(key)!
            return {
              chunkId: m.chunkId,
              documentId: m.doc.documentId,
              namingCode: m.doc.namingCode,
              version: m.doc.version,
              section: m.section,
            }
          }),
        })
      }
      const heading = String(s.heading ?? "").trim()
      if (heading && points.length > 0) sections.push({ heading, points })
    }

    if (sections.length === 0) {
      await save({
        status: "failed",
        content: null,
        droppedPoints: dropped,
        error: "The model returned nothing that could be traced to a published source.",
      })
      return
    }

    const docWord = withText.length === 1 ? "document" : "documents"
    const partly = input.docs.filter((d) => d.chunks.length < d.excerptsTotal).length
    const partlyNote =
      partly > 0
        ? ` The Scope was too large to read in full: ${partly} ${partly === 1 ? "document was" : "documents were"} read in part, see Built from.`
        : ""
    await save({
      status: "ready",
      content: {
        // Written by code, not the model, so it carries no unsourced claims.
        intro: `Generated from ${withText.length} published ${docWord}. Every point links to the passage it comes from.${partlyNote}`,
        sections,
      },
      droppedPoints: dropped,
      error: null,
    })
  },
})

// ---- Guided creation --------------------------------------------------------

const GUIDE_SYSTEM = [
  "You help an engineer create a Wiki in Oppr Knowledge through a short conversation.",
  "A Wiki is an AI-generated overview of published knowledge for a specific audience. Its Scope decides which published documents it is built from.",
  "A Scope combines any of: areas (plant areas), disciplines, assets (machines) and specific documents. A document is included when it is linked to a chosen asset, chosen explicitly, or matches the chosen areas and disciplines.",
  "You work on a DRAFT with fields: title, purpose (one line: who it is for and what they need), areas, disciplines, assetCodes, documentCodes.",
  "The person sees the draft next to the conversation and can edit any field themselves. CURRENT DRAFT always holds their latest edits and wins over anything said earlier.",
  "Rules:",
  "- Always return the COMPLETE next draft. Copy every field from CURRENT DRAFT unchanged unless the latest MESSAGE asks to change it. Never clear a field the person set.",
  "- Only use codes that appear in OPTIONS. Never invent codes. If nothing in OPTIONS fits the request, keep the Scope as it is, say so, and name the closest options.",
  "- Choose the narrowest Scope that covers what they asked for. Prefer assets and areas over listing many documents.",
  "- Fill in title and purpose yourself from what they said. A title is 2 to 6 words, names the subject and does not contain the word Wiki.",
  "- `reply` is at most two short sentences, in the language of the person's message. Do not list the draft field by field: the screen already shows which fields changed. Mention a choice only when it is not obvious.",
  "- Ask at most ONE question, and only when you cannot fill a fitting Scope or the audience without it. If you can make a reasonable draft, make it and do not ask.",
  "- Set `ready` to true once the draft has a title, a purpose and a non-empty Scope that fits the request. Then end the reply with: Check the draft and press Create, or tell me what to change.",
  "- You never create the Wiki yourself and never say it was created. The person presses Create.",
].join("\n")

const GUIDE_SCHEMA: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    reply: { type: SchemaType.STRING },
    title: { type: SchemaType.STRING },
    purpose: { type: SchemaType.STRING },
    areas: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
    disciplines: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
    assetCodes: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
    documentCodes: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
    ready: { type: SchemaType.BOOLEAN },
  },
  required: [
    "reply",
    "title",
    "purpose",
    "areas",
    "disciplines",
    "assetCodes",
    "documentCodes",
    "ready",
  ],
}

export const guideOptions = internalQuery({
  args: {},
  handler: async (ctx) => loadScopeOptions(ctx),
})

const draftValidator = v.object({
  title: v.string(),
  purpose: v.string(),
  scope: v.object({
    areas: v.array(v.string()),
    disciplines: v.array(v.string()),
    assetIds: v.array(v.id("assets")),
    documentIds: v.array(v.id("documents")),
  }),
})

type Options = Awaited<ReturnType<typeof loadScopeOptions>>

export const guide = action({
  args: {
    messages: v.array(
      v.object({
        role: v.union(v.literal("user"), v.literal("assistant")),
        text: v.string(),
      }),
    ),
    draft: draftValidator,
  },
  handler: async (ctx, args) => {
    await requireUser(ctx)
    const options: Options = await ctx.runQuery(internal.ai.wiki.guideOptions, {})
    if (aiStubEnabled()) return stubGuide(args.messages, args.draft, options)

    const useClaude = claudeConfigured()
    const apiKey = process.env.GEMINI_API_KEY
    if (!useClaude && !apiKey) {
      throw new ConvexError(
        "The assistant is not available on this server (no AI key). Fill in the draft yourself.",
      )
    }

    const assetCode = new Map(options.assets.map((a) => [String(a._id), a.code]))
    const docCode = new Map(options.documents.map((d) => [String(d._id), d.namingCode]))

    const optionsText = [
      "AREAS:",
      ...options.areas.map((a) => `- ${a.code}: ${a.label}`),
      "DISCIPLINES:",
      ...options.disciplines.map((d) => `- ${d.code}: ${d.label}`),
      "ASSETS:",
      ...options.assets.map((a) => `- ${a.code}: ${a.name}${a.location ? ` (${a.location})` : ""}`),
      "PUBLISHED DOCUMENTS:",
      ...options.documents.map(
        (d) => `- ${d.namingCode}: ${d.title} [area ${d.area ?? "-"}, discipline ${d.discipline ?? "-"}]`,
      ),
    ].join("\n")

    const currentDraft = JSON.stringify({
      title: args.draft.title,
      purpose: args.draft.purpose,
      areas: args.draft.scope.areas,
      disciplines: args.draft.scope.disciplines,
      assetCodes: args.draft.scope.assetIds.map((id) => assetCode.get(String(id))).filter(Boolean),
      documentCodes: args.draft.scope.documentIds.map((id) => docCode.get(String(id))).filter(Boolean),
    })

    // Gemini expects alternating turns that start with the person: skip a
    // leading assistant turn and merge runs from the same side (a retry after
    // a failed answer leaves two person turns in a row).
    const history: { role: "user" | "assistant"; text: string }[] = []
    for (const m of args.messages.slice(-12)) {
      const prev = history[history.length - 1]
      if (!prev && m.role === "assistant") continue
      if (prev && prev.role === m.role) prev.text = `${prev.text}\n${m.text}`
      else history.push({ role: m.role, text: m.text })
    }
    const latest = history[history.length - 1]
    if (!latest || latest.role !== "user") throw new ConvexError("There is no message to answer.")
    const contents = [
      {
        role: "user",
        parts: [{ text: `OPTIONS:\n${optionsText}` }],
      },
      { role: "model", parts: [{ text: "Understood. I will only use these codes." }] },
      ...history.slice(0, -1).map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.text }],
      })),
      {
        role: "user",
        parts: [{ text: `CURRENT DRAFT: ${currentDraft}\n\nMESSAGE: ${latest.text}` }],
      },
    ]

    let out: {
      reply?: string
      title?: string
      purpose?: string
      areas?: string[]
      disciplines?: string[]
      assetCodes?: string[]
      documentCodes?: string[]
      ready?: boolean
    }
    try {
      if (useClaude) {
        // Claude takes alternating user/assistant turns; the OPTIONS block
        // and the current Draft ride along on the person's turns.
        out = await claudeJson({
          system: `${GUIDE_SYSTEM}

OPTIONS:
${optionsText}`,
          messages: [
            ...history.slice(0, -1).map((m) => ({ role: m.role, content: m.text })),
            { role: "user" as const, content: `CURRENT DRAFT: ${currentDraft}

MESSAGE: ${latest.text}` },
          ],
          schema: GuideOut,
          effort: "low",
          maxTokens: 4000,
        })
      } else {
        const result = await geminiJson(apiKey!, GUIDE_SYSTEM, GUIDE_SCHEMA).generateContent({ contents })
        out = JSON.parse(result.response.text())
      }
    } catch (err) {
      console.error("Wiki guide failed:", useClaude ? describeClaudeError(err) : err)
      throw new ConvexError(
        "The assistant is not responding right now. Your draft is kept, and you can fill it in yourself.",
      )
    }

    // Map codes back to ids, dropping anything not in OPTIONS.
    const areaSet = new Set(options.areas.map((a) => a.code))
    const discSet = new Set(options.disciplines.map((d) => d.code))
    const assetByCode = new Map(options.assets.map((a) => [a.code.toUpperCase(), a._id]))
    const docByCode = new Map(options.documents.map((d) => [d.namingCode.toUpperCase(), d._id]))
    const uniq = <T,>(xs: T[]) => Array.from(new Set(xs))
    const scope = {
      areas: uniq((out.areas ?? []).map((s) => s.toUpperCase()).filter((s) => areaSet.has(s))),
      disciplines: uniq((out.disciplines ?? []).map((s) => s.toUpperCase()).filter((s) => discSet.has(s))),
      assetIds: uniq(
        (out.assetCodes ?? [])
          .map((c) => assetByCode.get(c.toUpperCase()))
          .filter((x): x is Id<"assets"> => x !== undefined),
      ),
      documentIds: uniq(
        (out.documentCodes ?? [])
          .map((c) => docByCode.get(c.toUpperCase()))
          .filter((x): x is Id<"documents"> => x !== undefined),
      ),
    }
    const scopeEmpty =
      scope.areas.length + scope.disciplines.length + scope.assetIds.length + scope.documentIds.length === 0
    // An empty title or purpose from the model never wipes what the person had.
    const title = String(out.title ?? "").trim() || args.draft.title
    const purpose = String(out.purpose ?? "").trim() || args.draft.purpose

    return {
      reply: String(out.reply ?? "").trim() || "I've updated the draft.",
      draft: { title, purpose, scope },
      ready: Boolean(out.ready) && !scopeEmpty && title.trim() !== "",
    }
  },
})

// ---- Offline stand-in -------------------------------------------------------
// Dev-only fallback for when no working Gemini key is available. Enabled with
// `npx convex env set OPPR_AI_STUB 1`. It uses no AI: Wiki points are the
// source passages themselves (so they are grounded by construction) and the
// guide matches the message against the Scope options by keyword. The UI says
// so whenever it is used. Never enable it on production.

export function aiStubEnabled(): boolean {
  return process.env.OPPR_AI_STUB === "1"
}

export const STUB_INTRO_PREFIX = "Offline stand-in, no AI:"

function stubWiki(docs: GenerationDoc[]) {
  const provided = new Map<string, ProvidedExcerpt>()
  const sections = []
  for (const d of docs) {
    const points = []
    for (const c of d.chunks) {
      if (c.text === c.section) continue // headings
      const key = String(c.chunkId)
      provided.set(key, { key, text: c.text })
      const checked = checkPoint({ text: c.text, sources: [key] }, provided)
      if (!checked.ok) continue
      points.push({
        text: c.text,
        citations: [
          {
            chunkId: c.chunkId,
            documentId: d.documentId,
            namingCode: d.namingCode,
            version: d.version,
            section: c.section,
          },
        ],
      })
      if (points.length >= 6) break
    }
    if (points.length) sections.push({ heading: d.title, points })
  }
  return {
    status: "ready" as const,
    content: {
      intro: `${STUB_INTRO_PREFIX} the AI key is not working, so this Wiki lists passages from ${docs.length} published ${docs.length === 1 ? "document" : "documents"} as they are. Every point links to its source.`,
      sections,
    },
    droppedPoints: 0,
    error: null,
  }
}

function stubGuide(
  messages: { role: "user" | "assistant"; text: string }[],
  draft: {
    title: string
    purpose: string
    scope: {
      areas: string[]
      disciplines: string[]
      assetIds: Id<"assets">[]
      documentIds: Id<"documents">[]
    }
  },
  options: Options,
) {
  // Only the latest message adds to the Draft. The Draft already holds what
  // earlier turns matched plus the person's own edits, so a chip they removed
  // by hand is not put back by something they said before.
  const last = messages.filter((m) => m.role === "user").at(-1)?.text ?? ""
  const hay = last.toLowerCase()
  const words = (s: string) =>
    s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3)
  // "line 2" and "hall 2" only count as a whole phrase, never as the bare word.
  const phrases = (s: string): string[] => s.toLowerCase().match(/\b(?:line|hall)\s*\d+\b/g) ?? []
  const mentions = (code: string, label: string) =>
    hay.includes(code.toLowerCase()) ||
    phrases(label).some((p) => phrases(hay).includes(p)) ||
    words(label).some((w) => !["hall", "line", "with"].includes(w) && hay.includes(w))
  const uniq = <T,>(xs: T[]) => Array.from(new Set(xs))

  const newAreas = options.areas.filter((a) => mentions(a.code, a.label))
  const newDisciplines = options.disciplines.filter((d) => hay.includes(d.label.toLowerCase()))
  const newAssets = options.assets.filter((a) => mentions(a.code, a.name))
  const newDocs = options.documents.filter(
    (d) =>
      hay.includes(d.namingCode.toLowerCase()) ||
      words(d.title).some((w) => w.length >= 6 && hay.includes(w)),
  )
  const scope = {
    areas: uniq([...draft.scope.areas, ...newAreas.map((a) => a.code)]),
    disciplines: uniq([...draft.scope.disciplines, ...newDisciplines.map((d) => d.code)]),
    assetIds: uniq([...draft.scope.assetIds, ...newAssets.map((a) => a._id)]),
    documentIds: uniq([...draft.scope.documentIds, ...newDocs.map((d) => d._id)]),
  }
  const scopeSize =
    scope.areas.length + scope.disciplines.length + scope.assetIds.length + scope.documentIds.length
  const matched = [
    ...newAreas.map((a) => a.label),
    ...newDisciplines.map((d) => d.label),
    ...newAssets.map((a) => a.code),
    ...newDocs.map((d) => d.namingCode),
  ]

  const title = draft.title || last.replace(/^(make|create|build|i want|i need)( me)?( a)?( wiki)?( (about|on|for))?\s*/i, "").replace(/\s+/g, " ").trim().slice(0, 70)
  const titleCased = title ? title.charAt(0).toUpperCase() + title.slice(1) : ""
  const purpose = draft.purpose || (last.length > 20 ? last.trim() : "")
  const ready = scopeSize > 0 && titleCased !== ""

  let reply: string
  if (options.documents.length === 0) {
    reply = "Nothing is published yet, so a Wiki would have nothing to draw from. Publish a document first."
  } else if (matched.length > 0) {
    reply = `I matched your words to: ${matched.join(", ")}. Check the draft and press Create, or adjust any field.`
  } else if (ready) {
    reply = "I found nothing new to match in that message. Change any field in the draft yourself, or press Create."
  } else {
    reply = "I could not match an area, machine or document in your words. Name one, or pick it in the draft."
  }
  return {
    reply: `${STUB_INTRO_PREFIX} ${reply}`,
    draft: { title: titleCased, purpose, scope },
    ready,
  }
}
