import { v } from "convex/values"
import { GoogleGenerativeAI } from "@google/generative-ai"
import {
  ActionCtx,
  httpAction,
  internalQuery,
} from "../_generated/server"
import { internal } from "../_generated/api"
import { Doc, Id } from "../_generated/dataModel"
import { CHAT_MODEL, EMBEDDING_DIM, EMBEDDING_MODEL } from "./constants"
import { isPublished, publishedVersion } from "../lib/published"

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta"

const SYSTEM_INSTRUCTION = [
  "You are Ask, the question-answering assistant inside Oppr Knowledge, a factory's controlled knowledge base. You only know Published documents.",
  "You may receive two grounding blocks for every question:",
  "  • SCOPE OVERVIEW — a deterministic, factual summary of what exists in the current scope (only when relevant).",
  "  • EXCERPTS — the chunks that are most semantically similar to the question, numbered [1], [2], …",
  "Hard rules:",
  "  • Answer the user's question directly. Be concise. Operators are on the floor.",
  "  • DO NOT recite the SCOPE OVERVIEW back. DO NOT include phrases like 'Total Inventory', 'Document Scope Summary', 'Documents:', 'Assets:'. The UI already shows that data — don't restate it.",
  "  • Use EXCERPTS for specifics (steps, values, procedures). Cite each excerpt you actually use as `[1]`, `[2]`, … in plain brackets. Do not write Markdown footnotes.",
  "  • For subjective questions ('most interesting', 'best', 'recommend'), pick ONE answer with at most one short sentence of justification.",
  "  • For inventory/listing questions, answer with a tight Markdown list — no preamble, no totals paragraph.",
  "  • Format with Markdown: bold, lists, short headings. Keep entity codes (HOL-OPS-SOP-0001, RMR-101, HOL-OPS-LOG-0001) verbatim — the UI auto-links them.",
  "  • An excerpt marked '(from the wider library — not linked to this asset)' may be used, but make clear that it comes from a document not linked to this asset.",
  "  • If two excerpts give different values or instructions for the same thing (for example a torque), give both, say which document gives which, cite both, and say that they disagree so the person checks with the document owner. Never pick one silently.",
  "  • Copy numbers, units and codes exactly as the excerpt writes them. Keep every 'never' and 'do not' and every condition of a warning.",
  "  • If neither block has the answer, say so plainly in one sentence. Do not invent facts.",
  "  • Never apologize. Never refer to 'the excerpts' or 'the scope overview'. Just answer.",
].join("\n")

export type AskScope =
  | { kind: "doc"; id: Id<"documents"> }
  | { kind: "asset"; id: Id<"assets"> }
  | { kind: "library" }

export type ScopeArg =
  | { kind: "doc"; id: string }
  | { kind: "asset"; id: string }
  | { kind: "library" }

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
    scope: v.union(
      v.object({ kind: v.literal("doc"), id: v.id("documents") }),
      v.object({ kind: v.literal("asset"), id: v.id("assets") }),
      v.object({ kind: v.literal("library") }),
    ),
  },
  handler: async (ctx, args) => {
    const chunks = (
      await Promise.all(args.chunkIds.map((id) => ctx.db.get(id)))
    ).filter((c): c is Doc<"chunks"> => c !== null)

    let allowedDocIds: Set<string> | null = null
    if (args.scope.kind === "doc") {
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
    scope: v.union(
      v.object({ kind: v.literal("doc"), id: v.id("documents") }),
      v.object({ kind: v.literal("asset"), id: v.id("assets") }),
      v.object({ kind: v.literal("library") }),
    ),
  },
  handler: async (ctx, args) => {
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

interface PreparedAsk {
  contents: { role: string; parts: { text: string }[] }[]
  citations: CitationOut[]
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
          ? " (from the wider library — not linked to this asset)"
          : ""
        return `[${i + 1}] ${header}${crossLink}\n${c.text}`
      })
      .join("\n\n")
  }

  const promptParts: string[] = []
  if (overviewText) {
    promptParts.push(`SCOPE OVERVIEW:\n${overviewText}`, "")
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

  return { contents, citations }
}

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
}

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
            writeEvent({ type: "delta", text: delta })
          }
        }
        if (!anyText) {
          writeEvent({ type: "delta", text: "(no response)" })
        }
        writeEvent({ type: "done", citations: prepared.citations })
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
