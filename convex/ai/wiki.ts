import { v } from "convex/values"
import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai"
import type { ResponseSchema } from "@google/generative-ai"
import { action, internalAction, internalQuery } from "../_generated/server"
import { internal } from "../_generated/api"
import { Id } from "../_generated/dataModel"
import { requireUser } from "../lib/auth"
import { CHAT_MODEL } from "./constants"
import { checkPoint, ProvidedExcerpt, RawPoint } from "./grounding"
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

// ---- Generation -------------------------------------------------------------

const WIKI_SYSTEM = [
  "You write a Wiki inside Oppr Knowledge, a factory's controlled knowledge base.",
  "A Wiki is an overview for a specific audience, built ONLY from the numbered EXCERPTS of published documents you are given.",
  "Rules:",
  "- Every point states one fact or one instruction in one short sentence, in plain language for people on the shop floor.",
  "- Every point lists the excerpt keys it is based on in `sources` (for example [\"E3\", \"E7\"]). Only use keys that appear in EXCERPTS.",
  "- Never add knowledge that is not in the cited excerpts. Copy numbers, units, temperatures, torques and codes exactly as written.",
  "- Do not invent step numbers. Do not mention a number unless the cited excerpt contains it.",
  "- If two excerpts disagree, write one point that states both values and cite both.",
  "- Organise points into 2 to 6 sections with short, useful headings that fit the Wiki's purpose. Leave out what is irrelevant to the purpose.",
  "- Prefer what the audience needs to act safely and correctly. Safety warnings come first where relevant.",
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

    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      await save({
        status: "failed",
        content: null,
        droppedPoints: 0,
        error: "GEMINI_API_KEY is not set on this deployment.",
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
        provided.set(key, { key, text: c.text })
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
      const result = await geminiJson(apiKey, WIKI_SYSTEM, WIKI_SCHEMA).generateContent(prompt)
      raw = JSON.parse(result.response.text())
    } catch (err) {
      await save({
        status: "failed",
        content: null,
        droppedPoints: 0,
        error: `Generation failed: ${err instanceof Error ? err.message : String(err)}`.slice(0, 400),
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
          dropped += 1
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
    await save({
      status: "ready",
      content: {
        // Written by code, not the model, so it carries no unsourced claims.
        intro: `Generated from ${withText.length} published ${docWord}. Every point links to the passage it comes from.`,
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
  "Rules:",
  "- Always return the COMPLETE next draft. Keep every field the person already set unless they ask to change it.",
  "- Only use codes that appear in OPTIONS. Never invent codes.",
  "- Choose the narrowest Scope that covers what they asked for. Prefer assets and areas over listing many documents.",
  "- `reply` is one or two short sentences: say what you set, and ask at most ONE follow-up question only if something essential is unclear (usually the audience).",
  "- Set `ready` to true once the draft has a title, a purpose and a non-empty Scope that fits the request.",
  "- You never create the Wiki yourself. The person presses Create.",
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

    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) throw new Error("GEMINI_API_KEY is not set on this deployment.")

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

    const history = args.messages.slice(-12)
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
        parts: [
          {
            text: `CURRENT DRAFT: ${currentDraft}\n\nMESSAGE: ${history[history.length - 1]?.text ?? ""}`,
          },
        ],
      },
    ]

    const result = await geminiJson(apiKey, GUIDE_SYSTEM, GUIDE_SCHEMA).generateContent({
      contents,
    })
    const out = JSON.parse(result.response.text()) as {
      reply: string
      title: string
      purpose: string
      areas: string[]
      disciplines: string[]
      assetCodes: string[]
      documentCodes: string[]
      ready: boolean
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

    return {
      reply: String(out.reply ?? "").trim() || "I've updated the draft.",
      draft: {
        title: String(out.title ?? "").trim(),
        purpose: String(out.purpose ?? "").trim(),
        scope,
      },
      ready: Boolean(out.ready) && !scopeEmpty && String(out.title ?? "").trim() !== "",
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
  const said = messages
    .filter((m) => m.role === "user")
    .map((m) => m.text)
    .join(" ")
  const last = messages.filter((m) => m.role === "user").at(-1)?.text ?? ""
  const hay = said.toLowerCase()
  const words = (s: string) =>
    s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3)
  const mentions = (code: string, label: string) =>
    hay.includes(code.toLowerCase()) ||
    words(label).some((w) => !["hall", "line", "with"].includes(w) && hay.includes(w))
  const uniq = <T,>(xs: T[]) => Array.from(new Set(xs))

  const areas = uniq([
    ...draft.scope.areas,
    ...options.areas.filter((a) => mentions(a.code, a.label)).map((a) => a.code),
  ])
  const disciplines = uniq([
    ...draft.scope.disciplines,
    ...options.disciplines.filter((d) => hay.includes(d.label.toLowerCase())).map((d) => d.code),
  ])
  const assetIds = uniq([
    ...draft.scope.assetIds,
    ...options.assets.filter((a) => mentions(a.code, a.name)).map((a) => a._id),
  ])
  const documentIds = uniq([
    ...draft.scope.documentIds,
    ...options.documents
      .filter(
        (d) =>
          hay.includes(d.namingCode.toLowerCase()) ||
          words(d.title).some((w) => w.length >= 6 && hay.includes(w)),
      )
      .map((d) => d._id),
  ])
  const scope = { areas, disciplines, assetIds, documentIds }
  const scopeSize = areas.length + disciplines.length + assetIds.length + documentIds.length

  const title = draft.title || last.replace(/^(make|create|build|i want|i need)( me)?( a)?( wiki)?( (about|on|for))?\s*/i, "").replace(/\s+/g, " ").trim().slice(0, 70)
  const titleCased = title ? title.charAt(0).toUpperCase() + title.slice(1) : ""
  const purpose = draft.purpose || (last.length > 20 ? last.trim() : "")
  const ready = scopeSize > 0 && titleCased !== ""

  return {
    reply: ready
      ? `${STUB_INTRO_PREFIX} I matched your words to the Scope on the right. Check it and press Create, or adjust any field.`
      : `${STUB_INTRO_PREFIX} I could not match an area, machine or document yet. Name one, or pick it on the right.`,
    draft: { title: titleCased, purpose, scope },
    ready,
  }
}
