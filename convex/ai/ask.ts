import { v } from "convex/values"
import { GoogleGenerativeAI } from "@google/generative-ai"
import {
  ActionCtx,
  httpAction,
  internalAction,
  internalQuery,
  QueryCtx,
} from "../_generated/server"
import { internal } from "../_generated/api"
import { Doc, Id } from "../_generated/dataModel"
import { CHAT_MODEL, EMBEDDING_DIM, EMBEDDING_MODEL } from "./constants"
import { isPublished, publishedVersion } from "../lib/published"

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta"

const SYSTEM_INSTRUCTION = [
  "You are Ask, the question-answering assistant inside Oppr Knowledge, a factory's controlled knowledge base. You only know Published documents.",
  "You may receive two grounding blocks for every question:",
  "  • SCOPE OVERVIEW: a deterministic, factual summary of what exists in the current scope (only when relevant).",
  "  • PLANT BRIEFING: background about the organization, its areas, processes and the words people use (with Dutch synonyms). Use it to understand the question and the plant's words. Never cite it and never take steps, settings or limits from it; those come from EXCERPTS only.",
  "  • EXCERPTS: the chunks that are most semantically similar to the question, numbered [1], [2], …",
  "Hard rules:",
  "  • Answer the user's question directly. Be concise. Operators are on the floor.",
  "  • Never use em dashes. Use a comma, a colon or a full stop instead.",
  "  • DO NOT recite the SCOPE OVERVIEW back. DO NOT include phrases like 'Total Inventory', 'Document Scope Summary', 'Documents:', 'Assets:'. The UI already shows that data, don't restate it.",
  "  • Use EXCERPTS for specifics (steps, values, procedures). Cite each excerpt you actually use as `[1]`, `[2]`, … in plain brackets. Do not write Markdown footnotes.",
  "  • For subjective questions ('most interesting', 'best', 'recommend'), pick ONE answer with at most one short sentence of justification.",
  "  • For inventory/listing questions, answer with a tight Markdown list, no preamble, no totals paragraph.",
  "  • Format with Markdown: bold, lists, short headings. Keep entity codes (EXT-OPS-SOP-0001, EXL-201) verbatim; the UI auto-links them.",
  "  • An excerpt marked '(from the wider library, not linked to this asset)' may be used, but make clear that it comes from a document not linked to this asset.",
  "  • If two excerpts give different values or instructions for the same thing (for example a torque), give both, say which document gives which, cite both, and say that they disagree so the person checks with the document owner. Never pick one silently.",
  "  • A KNOWN CONFLICT block lists contradictions between Published documents that an Engineer has not resolved yet. If your answer touches one, give both values, name both documents by naming code, cite both if they are among the excerpts, and say plainly that the documents disagree and to check with the document owner before acting. Never pick one side.",
  "  • Copy numbers, units and codes exactly as the excerpt writes them. Keep every 'never' and 'do not' and every condition of a warning.",
  "  • For 'how long', 'how much', 'how hot' or 'how often' questions, give every condition the excerpt states with the value: temperature, time, pressure, dew point, quantity, frequency. 'At least 4 hours' is wrong when the excerpt says 'at 80 °C for at least 4 hours, dew point -40 °C or lower'.",
  "  • If neither block has the answer, say so plainly in one sentence. Do not invent facts.",
  "  • Never apologize. Never refer to 'the excerpts' or 'the scope overview'. Just answer.",
].join("\n")

export type AskScope =
  | { kind: "doc"; id: Id<"documents"> }
  | { kind: "asset"; id: Id<"assets"> }
  | { kind: "wiki"; id: Id<"wikis"> }
  | { kind: "library" }

export type ScopeArg =
  | { kind: "doc"; id: string }
  | { kind: "asset"; id: string }
  | { kind: "wiki"; id: string }
  | { kind: "library" }

const askScopeValidator = v.union(
  v.object({ kind: v.literal("doc"), id: v.id("documents") }),
  v.object({ kind: v.literal("asset"), id: v.id("assets") }),
  v.object({ kind: v.literal("wiki"), id: v.id("wikis") }),
  v.object({ kind: v.literal("library") }),
)

/**
 * Ask this Wiki: the Wiki's source documents at the versions it was built
 * from, and only while that version is still the Published one (a stale
 * source is withheld, as on the Wiki page itself).
 */
async function wikiSourceVersions(
  ctx: { db: QueryCtx["db"] },
  wikiId: Id<"wikis">,
): Promise<Map<string, number>> {
  const wiki = await ctx.db.get(wikiId)
  const out = new Map<string, number>()
  for (const s of wiki?.sources ?? []) {
    const d = await ctx.db.get(s.documentId)
    if (d && publishedVersion(d) === s.version) out.set(String(s.documentId), s.version)
  }
  return out
}

export interface CitationOut {
  documentId: string
  documentTitle: string
  chunkId: string
  pageOrSection: string | null
  excerpt: string
  origin: "asset-link" | "cross-link" | "log"
}

interface RetrievedChunk {
  _id: Id<"chunks">
  documentId: Id<"documents">
  text: string
  pageOrSection: string | null
  score: number
}

const INVENTORY_QUESTION_RE =
  /\b(list|every|all\s+(?:doc|sop|manual|asset|log|file)|how\s+many|which\s+(?:doc|sop|asset|log)|what\s+(?:doc|sop|asset|log|files?)\s+(?:do|are|exist)|inventory|catalog|summary|overview)\b/i

function shouldIncludeScopeOverview(scope: ScopeArg, question: string) {
  if (scope.kind !== "library") return true
  return INVENTORY_QUESTION_RE.test(question)
}

function topKForScope(scope: ScopeArg) {
  return scope.kind === "library" ? 5 : 6
}

// Convex vector filters take an or() of equality terms; stay well under the
// platform's expression limit for assets with very large doc sets.
const MAX_FILTER_DOCS = 64

function cleanSection(
  section: string | null,
  title: string,
  namingCode: string,
): string | null {
  if (!section) return null
  const s = section.trim()
  if (!s) return null
  const t = title.trim().toLowerCase()
  const sLower = s.toLowerCase()
  if (sLower === t) return null
  if (t && sLower.startsWith(t)) return null
  if (sLower === namingCode.trim().toLowerCase()) return null
  return s
}

async function embedQuery(text: string, apiKey: string): Promise<number[]> {
  const url = `${GEMINI_BASE}/models/${EMBEDDING_MODEL}:embedContent?key=${apiKey}`
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      content: { parts: [{ text }] },
      outputDimensionality: EMBEDDING_DIM,
    }),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => "")
    throw new Error(`Gemini embed ${res.status}: ${body.slice(0, 200)}`)
  }
  const json = (await res.json()) as { embedding?: { values?: number[] } }
  const values = json.embedding?.values
  if (!Array.isArray(values))
    throw new Error("Gemini embed response missing embedding.values")
  return values
}

export const lookupAfterSearch = internalQuery({
  args: {
    chunkIds: v.array(v.id("chunks")),
    scope: askScopeValidator,
  },
  handler: async (ctx, args) => {
    const chunks = (
      await Promise.all(args.chunkIds.map((id) => ctx.db.get(id)))
    ).filter((c): c is Doc<"chunks"> => c !== null)

    let allowedDocIds: Set<string> | null = null
    if (args.scope.kind === "wiki") {
      const pinned = await wikiSourceVersions(ctx, args.scope.id)
      allowedDocIds = new Set(pinned.keys())
    } else if (args.scope.kind === "doc") {
      allowedDocIds = new Set([args.scope.id])
    } else if (args.scope.kind === "asset") {
      const assetId = args.scope.id
      const links = await ctx.db
        .query("documentAssets")
        .withIndex("by_assetId", (q) => q.eq("assetId", assetId))
        .take(500)
      allowedDocIds = new Set(links.map((l) => l.documentId))
    }

    const filteredChunks = allowedDocIds
      ? chunks.filter((c) => allowedDocIds!.has(c.documentId))
      : chunks

    const docIds = Array.from(new Set(filteredChunks.map((c) => c.documentId)))
    const docs = (
      await Promise.all(docIds.map((id) => ctx.db.get(id)))
    ).filter((d): d is Doc<"documents"> => d !== null)
    const docById = new Map(docs.map((d) => [d._id, d]))

    // Only Published Knowledge is served (convex/lib/published.ts): the live
    // edition of a non-archived document. A never-published document and the
    // next edition being drafted are both invisible to Ask, in every scope.
    const liveChunks = filteredChunks.filter((c) => {
      const d = docById.get(c.documentId)
      if (!d) return false
      return c.version === publishedVersion(d)
    })

    return liveChunks.map((c) => {
      const d = docById.get(c.documentId)
      return {
        chunkId: c._id,
        documentId: c.documentId,
        text: c.text,
        pageOrSection: c.pageOrSection,
        documentTitle: d?.title ?? "(unknown)",
        documentNamingCode: d?.namingCode ?? "",
      }
    })
  },
})

export const buildScopeOverview = internalQuery({
  args: {
    scope: askScopeValidator,
  },
  handler: async (ctx, args) => {
    if (args.scope.kind === "wiki") {
      const w = await ctx.db.get(args.scope.id)
      if (!w) return "WIKI not found."
      const pinned = await wikiSourceVersions(ctx, w._id)
      const lines = [
        `WIKI: ${w.title}. For: ${w.purpose}`,
        `Answer only from the documents this Wiki is built from (${pinned.size}):`,
        ...w.sources
          .filter((s) => pinned.has(String(s.documentId)))
          .map((s) => `- ${s.namingCode} · ${s.title} · v${s.version}`),
        `Sections: ${(w.content?.sections ?? []).map((s) => s.heading).join("; ")}`,
      ]
      return lines.join("\n")
    }
    if (args.scope.kind === "library") {
      const docs = (await ctx.db.query("documents").take(500)).filter(
        isPublished,
      )
      const assets = await ctx.db.query("assets").take(500)
      const lines: string[] = []
      lines.push(
        `LIBRARY INVENTORY — ${docs.length} published document${docs.length === 1 ? "" : "s"}, ${assets.length} asset${assets.length === 1 ? "" : "s"}.`,
      )
      lines.push("", "Documents:")
      for (const d of docs.slice(0, 80)) {
        lines.push(
          `- ${d.namingCode} · ${d.title} · ${d.type.toUpperCase()} · v${d.liveVersion}`,
        )
      }
      lines.push("", "Assets:")
      for (const a of assets) {
        lines.push(
          `- ${a.code} · ${a.name}${a.location ? ` · ${a.location}` : ""}`,
        )
      }
      return lines.join("\n")
    }

    if (args.scope.kind === "doc") {
      const d = await ctx.db.get(args.scope.id)
      if (!d) return `DOCUMENT not found.`
      if (!isPublished(d))
        return `DOCUMENT ${d.namingCode} is not published, so it is not part of the knowledge base yet. Say that it cannot be answered from until it is published.`
      const links = await ctx.db
        .query("documentAssets")
        .withIndex("by_documentId", (q) => q.eq("documentId", d._id))
        .take(500)
      const assets = (
        await Promise.all(links.map((l) => ctx.db.get(l.assetId)))
      ).filter((a): a is Doc<"assets"> => a !== null)
      const lines: string[] = []
      lines.push(
        `DOCUMENT: ${d.namingCode} · ${d.title} · ${d.type.toUpperCase()} · published v${d.liveVersion}`,
      )
      if (d.tags.length) lines.push(`Tags: ${d.tags.join(", ")}`)
      if (assets.length)
        lines.push(
          `Linked assets: ${assets.map((a) => `${a.code} (${a.name})`).join(", ")}`,
        )
      return lines.join("\n")
    }

    const a = await ctx.db.get(args.scope.id)
    if (!a) return `ASSET not found.`
    const links = await ctx.db
      .query("documentAssets")
      .withIndex("by_assetId", (q) => q.eq("assetId", a._id))
      .take(500)
    const docs = (
      await Promise.all(links.map((l) => ctx.db.get(l.documentId)))
    ).filter((d): d is Doc<"documents"> => d !== null && isPublished(d))
    const lines: string[] = []
    lines.push(
      `ASSET: ${a.code} · ${a.name}${a.location ? ` · ${a.location}` : ""}`,
    )
    if (a.description) lines.push(`Description: ${a.description}`)
    if (docs.length) {
      lines.push(`Documents linked to this asset (${docs.length}):`)
      for (const d of docs) {
        lines.push(
          `- ${d.namingCode} · ${d.title} · ${d.type.toUpperCase()} · v${d.liveVersion}`,
        )
      }
    }
    return lines.join("\n")
  },
})

interface AskInput {
  scope: AskScope
  question: string
  history: { role: "user" | "assistant"; text: string }[]
}

// An open contradiction Finding touching a cited document (CONTEXT.md: Ask
// keeps answering, but warns and names both sources).
export interface ConflictOut {
  findingId: string
  summary: string
  a: { documentId: string; code: string; title: string; quote: string }
  b: { documentId: string; code: string; title: string; quote: string }
}

interface PreparedAsk {
  contents: { role: string; parts: { text: string }[] }[]
  citations: CitationOut[]
  conflicts: ConflictOut[]
}

async function prepareAskContext(
  ctx: ActionCtx,
  args: AskInput,
  apiKey: string,
): Promise<PreparedAsk> {
  const queryVec = await embedQuery(args.question, apiKey)

  const k = topKForScope(args.scope)
  const overFetch = args.scope.kind === "library" ? 16 : 30

  // Asset scope resolves its linked documents up front so the vector search
  // itself is sliced to them. Post-filtering a library-wide search (the old
  // approach) loses recall whenever the asset's documents don't rank in the
  // global top N — and made the cross-link origin unreachable.
  let linkedDocIds: Id<"documents">[] | null = null
  if (args.scope.kind === "asset") {
    const linked: { _id: Id<"documents"> }[] = await ctx.runQuery(
      internal.ai.ask.lookupAssetDocs,
      { assetId: args.scope.id },
    )
    linkedDocIds = linked.map((d) => d._id)
  } else if (args.scope.kind === "wiki") {
    const sources: { _id: Id<"documents"> }[] = await ctx.runQuery(
      internal.ai.ask.lookupWikiDocs,
      { wikiId: args.scope.id },
    )
    linkedDocIds = sources.map((d) => d._id)
  }

  let vectorResults: { _id: Id<"chunks">; _score: number }[] = []
  if (args.scope.kind === "doc") {
    const docScopeId = args.scope.id
    vectorResults = await ctx.vectorSearch("chunks", "by_embedding", {
      vector: queryVec,
      limit: overFetch,
      filter: (q) => q.eq("documentId", docScopeId),
    })
  } else if (linkedDocIds) {
    if (linkedDocIds.length > 0) {
      const ids = linkedDocIds.slice(0, MAX_FILTER_DOCS)
      vectorResults = await ctx.vectorSearch("chunks", "by_embedding", {
        vector: queryVec,
        limit: overFetch,
        filter: (q) => q.or(...ids.map((id) => q.eq("documentId", id))),
      })
    }
  } else {
    vectorResults = await ctx.vectorSearch("chunks", "by_embedding", {
      vector: queryVec,
      limit: overFetch,
    })
  }

  interface LookedChunk {
    chunkId: Id<"chunks">
    documentId: Id<"documents">
    text: string
    pageOrSection: string | null
    documentTitle: string
    documentNamingCode: string
  }
  const looked: LookedChunk[] = await ctx.runQuery(
    internal.ai.ask.lookupAfterSearch,
    {
      chunkIds: vectorResults.map((r) => r._id),
      scope: args.scope,
    },
  )

  const scoreById = new Map(vectorResults.map((r) => [String(r._id), r._score]))
  const candidates: RetrievedChunk[] = looked.map((c) => ({
    _id: c.chunkId,
    documentId: c.documentId,
    text: c.text,
    pageOrSection: c.pageOrSection,
    score: scoreById.get(String(c.chunkId)) ?? 0,
  }))
  candidates.sort((a, b) => b.score - a.score)
  let top = candidates.slice(0, k)
  const lookedById = new Map(looked.map((c) => [String(c.chunkId), c]))

  // Asset scope fallback: when the linked documents can't fill the answer,
  // widen to the whole library and mark every widened source as cross-link so
  // the UI shows the "Not linked" badge instead of silently dropping context.
  const crossLinkChunkIds = new Set<string>()
  if (args.scope.kind === "asset" && top.length < k) {
    const fallbackResults = await ctx.vectorSearch("chunks", "by_embedding", {
      vector: queryVec,
      limit: overFetch,
    })
    const fbLooked: LookedChunk[] = await ctx.runQuery(
      internal.ai.ask.lookupAfterSearch,
      {
        chunkIds: fallbackResults.map((r) => r._id),
        scope: { kind: "library" },
      },
    )
    const have = new Set(top.map((c) => String(c._id)))
    const linkedSet = new Set((linkedDocIds ?? []).map((id) => String(id)))
    const fbScore = new Map(
      fallbackResults.map((r) => [String(r._id), r._score]),
    )
    const fills: RetrievedChunk[] = fbLooked
      .filter(
        (c) =>
          !have.has(String(c.chunkId)) &&
          !linkedSet.has(String(c.documentId)),
      )
      .map((c) => ({
        _id: c.chunkId,
        documentId: c.documentId,
        text: c.text,
        pageOrSection: c.pageOrSection,
        score: fbScore.get(String(c.chunkId)) ?? 0,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, k - top.length)
    for (const f of fills) crossLinkChunkIds.add(String(f._id))
    for (const c of fbLooked) {
      if (!lookedById.has(String(c.chunkId)))
        lookedById.set(String(c.chunkId), c)
    }
    top = [...top, ...fills]
  }

  const includeOverview = shouldIncludeScopeOverview(args.scope, args.question)
  const overviewText: string | null = includeOverview
    ? await ctx.runQuery(internal.ai.ask.buildScopeOverview, {
        scope: args.scope,
      })
    : null

  let contextBlock = "(no excerpts available)"
  if (top.length) {
    contextBlock = top
      .map((c, i) => {
        const meta = lookedById.get(String(c._id))!
        const section = cleanSection(
          c.pageOrSection,
          meta.documentTitle,
          meta.documentNamingCode,
        )
        const loc = section ? ` — ${section}` : ""
        const header = meta.documentNamingCode
          ? `${meta.documentNamingCode} · ${meta.documentTitle}${loc}`
          : `${meta.documentTitle}${loc}`
        const crossLink = crossLinkChunkIds.has(String(c._id))
          ? " (from the wider library, not linked to this asset)"
          : ""
        return `[${i + 1}] ${header}${crossLink}\n${c.text}`
      })
      .join("\n\n")
  }

  // Open contradictions on the documents the answer draws from. Told to the
  // model so the answer warns, and returned to the UI so it can show them.
  const citedDocIds = Array.from(new Set(top.map((c) => c.documentId)))
  let conflicts: ConflictOut[] = []
  if (citedDocIds.length > 0) {
    try {
      conflicts = await ctx.runQuery(internal.findings.openConflictsForAsk, {
        documentIds: citedDocIds,
      })
    } catch (err) {
      console.warn("Ask: open Findings lookup failed", err)
    }
  }

  const promptParts: string[] = []
  try {
    const briefing: string = await ctx.runQuery(internal.plant.context.forAi, {})
    if (briefing) promptParts.push(briefing, "")
  } catch (err) {
    console.warn("Ask: plant briefing failed", err)
  }
  if (overviewText) {
    promptParts.push(`SCOPE OVERVIEW:\n${overviewText}`, "")
  }
  if (conflicts.length > 0) {
    promptParts.push(
      "KNOWN CONFLICT (open Findings of the Consistency check):",
      ...conflicts.map(
        (f) =>
          `- ${f.summary} ${f.a.code} (${f.a.title}) says: "${f.a.quote}". ${f.b.code} (${f.b.title}) says: "${f.b.quote}".`,
      ),
      "",
    )
  }
  promptParts.push(
    `EXCERPTS:\n${contextBlock}`,
    "",
    `QUESTION: ${args.question}`,
    "",
    "Answer the question directly. Cite specifics with [1], [2], etc. Do not summarize what's available — just answer.",
  )
  const userPrompt = promptParts.join("\n")

  const cleanHistory = args.history.filter((m) => {
    if (m.role !== "assistant") return true
    const t = m.text.trim()
    if (!t || t === "(stopped)" || t === "(no response)") return false
    if (t.startsWith("Error:")) return false
    return true
  })
  const trimmed = cleanHistory.slice(-6)

  const contents = [
    ...trimmed.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.text }],
    })),
    { role: "user", parts: [{ text: userPrompt }] },
  ]

  const citations: CitationOut[] = top.map((c) => {
    const meta = lookedById.get(String(c._id))!
    const origin: CitationOut["origin"] = crossLinkChunkIds.has(String(c._id))
      ? "cross-link"
      : "asset-link"
    return {
      documentId: String(c.documentId),
      documentTitle: meta.documentTitle,
      chunkId: String(c._id),
      pageOrSection: cleanSection(
        c.pageOrSection,
        meta.documentTitle,
        meta.documentNamingCode,
      ),
      excerpt: c.text.length > 320 ? `${c.text.slice(0, 320)}…` : c.text,
      origin,
    }
  })

  return { contents, citations, conflicts }
}

export const lookupWikiDocs = internalQuery({
  args: { wikiId: v.id("wikis") },
  handler: async (ctx, args) => {
    const pinned = await wikiSourceVersions(ctx, args.wikiId)
    return [...pinned.keys()].map((id) => ({ _id: id as Id<"documents"> }))
  },
})

export const lookupAssetDocs = internalQuery({
  args: { assetId: v.id("assets") },
  handler: async (ctx, args) => {
    const links = await ctx.db
      .query("documentAssets")
      .withIndex("by_assetId", (q) => q.eq("assetId", args.assetId))
      .take(500)
    return links.map((l) => ({ _id: l.documentId }))
  },
})

function corsHeaders(origin: string | null): Record<string, string> {
  const allow = origin && origin !== "null" ? origin : "*"
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    Vary: "Origin",
  }
}

export const askStreamOptions = httpAction(async (_ctx, req) => {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(req.headers.get("Origin")),
  })
})

interface StreamRequestBody {
  scope: AskScope
  question: string
  history: { role: "user" | "assistant"; text: string }[]
  // Checked-in person (CONTEXT.md: Checked in), or absent when Anonymous.
  personId?: string | null
  surface?: "desktop" | "floor"
}

// The model is told to say plainly when the library has no answer.
const NOT_FOUND_RE =
  /\b(not (?:in|covered|mentioned|described|found)|no information|cannot find|can't find|couldn't find|could not find|does not (?:say|mention|cover|describe)|doesn't (?:say|mention|cover)|is not available|there is nothing)\b/i

export const askStream = httpAction(async (ctx, req) => {
  const cors = corsHeaders(req.headers.get("Origin"))

  const identity = await ctx.auth.getUserIdentity()
  if (!identity) {
    return new Response(JSON.stringify({ error: "Not authenticated" }), {
      status: 401,
      headers: { "Content-Type": "application/json", ...cors },
    })
  }

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "GEMINI_API_KEY not set on deployment" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...cors },
      },
    )
  }

  let payload: StreamRequestBody
  try {
    payload = (await req.json()) as StreamRequestBody
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...cors },
    })
  }

  let prepared: PreparedAsk
  try {
    prepared = await prepareAskContext(ctx, payload, apiKey)
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : String(err),
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...cors },
      },
    )
  }

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const writeEvent = (obj: unknown) => {
        controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"))
      }

      let anyText = false
      let fullText = ""

      try {
        const client = new GoogleGenerativeAI(apiKey)
        const model = client.getGenerativeModel({
          model: CHAT_MODEL,
          systemInstruction: SYSTEM_INSTRUCTION,
        })
        const result = await model.generateContentStream({
          contents: prepared.contents,
        })
        for await (const chunk of result.stream) {
          const delta = chunk.text()
          if (delta) {
            anyText = true
            fullText += delta
            writeEvent({ type: "delta", text: delta })
          }
        }
        if (!anyText) {
          writeEvent({ type: "delta", text: "(no response)" })
        }
        writeEvent({
          type: "done",
          citations: prepared.citations,
          conflicts: prepared.conflicts,
        })
        // Append-only signal for Document insights and Knowledge health.
        // Logged server-side so it is anonymous unless checked in, and so
        // people cannot delete it with their chat history.
        try {
          await ctx.runMutation(internal.usage.logAsk, {
            // The Ask log knows documents, Assets and the library; a Wiki
            // question is logged by the documents it cited.
            scope: payload.scope.kind === "wiki" ? { kind: "library" } : payload.scope,
            question: payload.question.slice(0, 1000),
            answerFound:
              prepared.citations.length > 0 && !NOT_FOUND_RE.test(fullText.slice(0, 600)),
            citedDocumentIds: prepared.citations.map((c) => c.documentId as Id<"documents">),
            personId: payload.personId ?? null,
            surface: payload.surface === "floor" ? "floor" : "desktop",
          })
        } catch (logErr) {
          console.warn("askEvents log failed", logErr)
        }
      } catch (err) {
        writeEvent({
          type: "error",
          message: err instanceof Error ? err.message : String(err),
        })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache",
      ...cors,
    },
  })
})

/**
 * Dev check (wiki lane): Ask with scope "wiki" retrieves only from the Wiki's
 * own source documents. Uses the real embedding call, no answer generation.
 * Run: npx convex run ai/ask:testWikiScope '{"question":"How do I calibrate the UT-200?"}'
 */
export const testWikiScope = internalAction({
  args: { question: v.string(), wikiId: v.optional(v.id("wikis")) },
  handler: async (ctx, args) => {
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) return { ok: false, reason: "no GEMINI_API_KEY" }
    const wikis: { _id: Id<"wikis">; title: string; sourceIds: string[] }[] = await ctx.runQuery(
      internal.ai.ask.wikisForTest,
      {},
    )
    const wiki = args.wikiId ? wikis.find((w) => w._id === args.wikiId) : wikis[0]
    if (!wiki) return { ok: false, reason: "no Wiki" }
    const prepared = await prepareAskContext(
      ctx,
      { scope: { kind: "wiki", id: wiki._id }, question: args.question, history: [] },
      apiKey,
    )
    const allowed = new Set(wiki.sourceIds)
    const cited = prepared.citations.map((c) => c.documentId)
    return {
      ok: cited.length > 0 && cited.every((id) => allowed.has(id)),
      wiki: wiki.title,
      citations: cited.length,
      outside: cited.filter((id) => !allowed.has(id)),
    }
  },
})

export const wikisForTest = internalQuery({
  args: {},
  handler: async (ctx) =>
    (await ctx.db.query("wikis").take(50)).map((w) => ({
      _id: w._id,
      title: w.title,
      sourceIds: w.sources.map((s) => String(s.documentId)),
    })),
})
