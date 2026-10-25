// Generate one Wiki block from sources, and "Use the Published wording"
// (docs/specs/wiki-upgrade.md 3.3, 3.5, 6.4). Nothing runs before a person
// presses a button; every run is one budgeted AI action (convex/lib/aiBudget)
// and every model call goes through the meter.
import { ConvexError, v } from "convex/values"
import { z } from "zod"
import { action, internalAction, internalQuery, type ActionCtx } from "../_generated/server"
import { internal } from "../_generated/api"
import type { Id } from "../_generated/dataModel"
import { requireUser } from "../lib/auth"
import { requireEngineerOrAdmin } from "../lib/roles"
import { resolveScope } from "../lib/scope"
import { publishedVersion } from "../lib/published"
import { MAX_PINNED_CHUNKS, type BlockKind, type CalloutTone, type Length, type Point, type ReadingLevel, type SourceSet } from "../lib/wikiTypes"
import { pickChunks } from "../wikis"
import { embedText, geminiConfigured } from "./gemini"
import { contentStems, splitSentences, support, withTableHeaders, type DroppedPoint } from "./grounding"
import {
  BlockOut,
  MAX_KEY_POINTS,
  alreadyOnPage,
  blockSystem,
  callJson,
  capPoints,
  currentModel,
  errorText,
  finishIntro,
  finishPage,
  fixedBlocks,
  groundItems,
  lengthCaps,
  logDrop,
  meterStub,
  numberExcerpts,
  readingLevelFor,
  rewriteSystem,
  stubBlockItems,
  stubPassages,
  type ExcerptDoc,
  type GenerationContext,
  type PageBlock,
  type RawItem,
} from "./wiki"

const ENGINEER_ONLY = "You are no longer checked in as an Engineer."
/** Passages one block generation reads (spec 6.4). */
const MAX_BLOCK_PASSAGES = 32
const VECTOR_LIMIT = 64
const MAX_FILTER_DOCS = 64

const RewriteOut = z.object({ sentences: z.array(z.object({ text: z.string(), sources: z.array(z.string()) })) })

export const assertEngineer = internalQuery({
  args: { personId: v.union(v.id("people"), v.null()) },
  handler: async (ctx, args): Promise<null> => {
    await requireEngineerOrAdmin(ctx, args.personId, ENGINEER_ONLY)
    return null
  },
})

interface SourceDoc extends ExcerptDoc {
  chunks: { chunkId: Id<"chunks">; seq: number; text: string; section: string | null }[]
}

/**
 * The live Published passages a block may read: the Wiki's Scope, or the
 * block's own Documents within it. Table rows carry their column headers,
 * exactly as the grounding check and check 5 read them.
 */
export const blockSources = internalQuery({
  args: { wikiId: v.id("wikis"), documentIds: v.union(v.null(), v.array(v.id("documents"))) },
  handler: async (ctx, args): Promise<SourceDoc[]> => {
    const wiki = await ctx.db.get(args.wikiId)
    if (!wiki) return []
    const { published } = await resolveScope(ctx, wiki.scope)
    const only = args.documentIds ? new Set<string>(args.documentIds) : null
    const out: SourceDoc[] = []
    for (const d of published) {
      if (only && !only.has(d._id)) continue
      const version = d.liveVersion as number
      const chunks = (
        await ctx.db
          .query("chunks")
          .withIndex("by_documentId_and_version", (q) => q.eq("documentId", d._id).eq("version", version))
          .take(2000)
      ).sort((a, b) => a.seq - b.seq)
      const texts = withTableHeaders(chunks.map((c) => ({ text: c.text, section: c.pageOrSection })))
      out.push({
        documentId: d._id,
        namingCode: d.namingCode,
        title: d.title,
        version,
        chunks: chunks.map((c, i) => ({ chunkId: c._id, seq: c.seq, text: texts[i], section: c.pageOrSection })),
      })
    }
    return out
  },
})

interface BlockStart {
  ticket: number
  block: {
    blockId: string
    kind: BlockKind
    tone: CalloutTone | null
    instruction: string | null
    sourceSet: SourceSet
    pinnedChunkIds: Id<"chunks">[]
    hiddenPointKeys: string[]
    readingLevel: ReadingLevel | null
    length: Length | null
  }
  section: { id: string; heading: string; instruction: string | null; safety: boolean } | null
  wiki: { title: string; purpose: string; maxDanger: number }
}

/**
 * Pinned passages first, then the vector search on the block's topic, then
 * the passages that share most words with it; at most 32, in document order.
 */
function selectPassages(docs: SourceDoc[], pinned: Id<"chunks">[], vectorHits: string[], topic: Set<string>): ExcerptDoc[] {
  const all = docs.flatMap((d, di) =>
    d.chunks.map((c, ci) => ({ di, ci, chunkId: c.chunkId as string, seq: di * 100000 + ci, text: c.text, pageOrSection: c.section })),
  )
  const byId = new Map(all.map((x) => [x.chunkId, x]))
  const picked = new Map<string, (typeof all)[number]>()
  const add = (id: string, until: number) => {
    const x = byId.get(id)
    if (x && picked.size < until && x.text !== x.pageOrSection) picked.set(id, x)
  }
  for (const id of pinned.slice(0, MAX_PINNED_CHUNKS)) add(id, MAX_BLOCK_PASSAGES)
  for (const id of vectorHits) add(id, MAX_BLOCK_PASSAGES - 8)
  for (const x of pickChunks(all, MAX_BLOCK_PASSAGES, topic)) add(x.chunkId, MAX_BLOCK_PASSAGES)
  const chosen = [...picked.values()].sort((a, b) => a.di - b.di || a.ci - b.ci)
  return docs
    .map((d, di) => ({ ...d, chunks: chosen.filter((x) => x.di === di).map((x) => d.chunks[x.ci]) }))
    .filter((d) => d.chunks.length > 0)
}

/** The core of generateBlock: budget, ticket, retrieve, one model call, ground, save. */
async function runBlock(
  ctx: ActionCtx,
  args: { wikiId: Id<"wikis">; blockId: string; personId: Id<"people"> | null },
): Promise<{ ok: boolean; message: string | null }> {
  let actionId: Id<"aiUsage">
  try {
    actionId = await ctx.runMutation(internal.lib.aiBudget.start, {
      action: "wikiBlock",
      personId: args.personId,
      wikiId: args.wikiId,
    })
  } catch (err) {
    return { ok: false, message: errorText(err) }
  }
  const target = { kind: "wiki", id: args.wikiId as string }
  const model = currentModel()
  let begun: BlockStart | null = null
  let ok = false
  let error: string | undefined
  try {
    begun = (await ctx.runMutation(internal.wikiBlocks.beginBlockGeneration, {
      wikiId: args.wikiId,
      blockId: args.blockId,
      personId: args.personId,
    })) as BlockStart
    if (!model) throw new Error("No AI key is set on this deployment.")
    const { block, section, wiki } = begun
    const gc: GenerationContext | null = await ctx.runQuery(internal.ai.wiki.generationContext, { wikiId: args.wikiId })
    if (!gc) throw new Error("Wiki not found")

    const docs: SourceDoc[] = await ctx.runQuery(internal.ai.wikiBlock.blockSources, {
      wikiId: args.wikiId,
      documentIds: block.sourceSet === "scope" ? null : block.sourceSet.documentIds,
    })
    const topicText = [section?.heading, section?.instruction, block.instruction].filter(Boolean).join(". ")
    let vectorHits: string[] = []
    if (model.provider !== "stub" && geminiConfigured() && topicText.trim() && docs.length > 0) {
      try {
        const vector = await embedText({ ctx, feature: "wiki.block", personId: args.personId, target }, topicText)
        const ids = docs.map((d) => d.documentId).slice(0, MAX_FILTER_DOCS)
        const hits = await ctx.vectorSearch("chunks", "by_embedding", {
          vector,
          limit: VECTOR_LIMIT,
          filter: (q) => q.or(...ids.map((id) => q.eq("documentId", id))),
        })
        vectorHits = hits.map((h) => h._id as string)
      } catch (err) {
        // Words alone still find passages; the failed embed is on the meter.
        console.warn(`Wiki block ${args.blockId}: vector search failed`, errorText(err))
      }
    }
    const excerptDocs = selectPassages(docs, block.pinnedChunkIds, vectorHits, new Set(contentStems(topicText)))
    const ex = numberExcerpts(excerptDocs)
    const level = readingLevelFor(block.readingLevel, wiki.purpose)
    const others = fixedBlocks(gc.blocks.filter((b) => b.blockId !== block.blockId))

    let raw: { gap: boolean; columns: string[]; items: RawItem[] }
    if (excerptDocs.length === 0) {
      raw = { gap: true, columns: [], items: [] }
    } else if (model.provider === "stub") {
      await meterStub(ctx, "wiki.block", args.personId, target)
      const got = stubBlockItems(block.kind, topicText, stubPassages(excerptDocs, ex))
      raw = got ? { gap: false, ...got } : { gap: true, columns: [], items: [] }
    } else {
      const out = (
        await callJson(ctx, {
          feature: "wiki.block",
          personId: args.personId,
          target,
          system: blockSystem(level, block.length),
          messages: [
            {
              role: "user",
              content: [
                `WIKI TITLE: ${wiki.title}`,
                `PURPOSE AND AUDIENCE: ${wiki.purpose || "(not specified)"}`,
                `SECTION: ${section?.heading ?? "(none)"}${section?.safety ? " (safety section)" : ""}${section?.instruction ? `. ${section.instruction}` : ""}`,
                `BLOCK: kind ${block.kind}${block.tone ? `, tone ${block.tone}` : ""}`,
                `INSTRUCTION: ${block.instruction || section?.instruction || section?.heading || "(none)"}`,
                "",
                ...alreadyOnPage(others),
                "EXCERPTS:",
                ...ex.lines,
              ].join("\n"),
            },
          ],
          schema: BlockOut,
          effort: "medium",
          maxTokens: 6000,
        })
      ).value
      raw = { gap: Boolean(out.gap), columns: (out.columns ?? []).map(String), items: out.points ?? [] }
    }

    const page = groundBlock(block, raw, ex, gc, others)
    for (const d of page.dropped) logDrop(args.wikiId, d)
    await ctx.runMutation(internal.wikiBlocks.saveBlockGeneration, {
      wikiId: args.wikiId,
      blockId: args.blockId,
      ticket: begun.ticket,
      points: page.points,
      dropped: page.dropped,
      gap: page.points.length === 0,
      model: model.model,
      ...(block.kind === "table" && page.columns?.length ? { columns: page.columns } : {}),
    })
    ok = true
    return { ok: true, message: page.points.length === 0 ? "No Published passage covers this yet." : null }
  } catch (err) {
    error = errorText(err)
    if (begun)
      await ctx.runMutation(internal.wikiBlocks.saveBlockGeneration, {
        wikiId: args.wikiId,
        blockId: args.blockId,
        ticket: begun.ticket,
        points: [],
        dropped: [],
        gap: false,
        model: model?.model ?? "none",
        error,
      })
    return { ok: false, message: error }
  } finally {
    await ctx.runMutation(internal.lib.aiBudget.finish, { actionId, ok, ...(error ? { error } : {}) })
  }
}

/** Grounds one block's output and runs the page-level steps against the rest of the Wiki. */
function groundBlock(
  block: BlockStart["block"],
  raw: { gap: boolean; columns: string[]; items: RawItem[] },
  ex: ReturnType<typeof numberExcerpts>,
  gc: GenerationContext,
  others: PageBlock[],
): PageBlock {
  const own = gc.blocks.find((b) => b.blockId === block.blockId)
  const columns = own?.columns?.length ? own.columns : raw.columns
  const g = raw.gap ? { points: [] as Point[], dropped: [] as DroppedPoint[] } : groundItems(raw.items, block.kind, columns, ex)
  let points = g.points
  if (block.kind === "intro") {
    const headings = [gc.title, ...(gc.outline?.sections ?? []).map((s) => s.heading).filter((h) => h.toLowerCase() !== "introduction")]
    points = finishIntro(points, g.dropped, headings)
  }
  if (block.kind === "keyPoints") points = capPoints(points, MAX_KEY_POINTS, g.dropped)
  if (block.kind === "callout") points = capPoints(points, 3, g.dropped)
  points = capPoints(points, lengthCaps(block.length ?? gc.settings.length).points, g.dropped)
  const page: PageBlock = {
    ref: block.blockId,
    kind: block.kind,
    tone: block.tone ?? undefined,
    ...(block.kind === "table" && columns.length ? { columns } : {}),
    points,
    dropped: g.dropped,
    hidden: block.hiddenPointKeys,
  }
  // The block's tone belongs to people; compose applies the danger cap.
  finishPage([...others, page], { findings: gc.findings, maxDanger: null })
  return page
}

/** Generates one block. Resolves when the block is saved (or failed); `message` is for the person. */
export const generateBlock = action({
  args: { wikiId: v.id("wikis"), blockId: v.string(), personId: v.optional(v.id("people")) },
  handler: async (ctx, args): Promise<{ ok: boolean; message: string | null }> => {
    await requireUser(ctx)
    const personId = args.personId ?? null
    try {
      await ctx.runQuery(internal.ai.wikiBlock.assertEngineer, { personId })
    } catch (err) {
      return { ok: false, message: errorText(err) }
    }
    return await runBlock(ctx, { wikiId: args.wikiId, blockId: args.blockId, personId })
  },
})

/** A system rebuild of a block with its own sources (spec 6.4), scheduled by the full build. */
export const regenerateBlock = internalAction({
  args: { wikiId: v.id("wikis"), blockId: v.string() },
  handler: async (ctx, args): Promise<null> => {
    const r = await runBlock(ctx, { wikiId: args.wikiId, blockId: args.blockId, personId: null })
    if (!r.ok) console.warn(`Wiki ${args.wikiId} block ${args.blockId}: ${r.message}`)
    return null
  },
})

// ---- Use the Published wording (spec 3.5) ---------------------------------------

/** The claim of a check and its passages, at their live Published version only. */
export const claimPassages = internalQuery({
  args: { checkId: v.id("wikiChecks"), claimIndex: v.number() },
  handler: async (ctx, args): Promise<{ wikiId: Id<"wikis"> | null; text: string; docs: ExcerptDoc[] } | null> => {
    const check = await ctx.db.get(args.checkId)
    const claim = check?.claims[args.claimIndex]
    if (!check || !claim) return null
    const docs: ExcerptDoc[] = []
    const wanted = new Map<string, Set<string>>()
    for (const p of claim.passages) {
      const key = `${p.documentId}@${p.version}`
      wanted.set(key, (wanted.get(key) ?? new Set()).add(p.chunkId))
    }
    for (const [key, chunkIds] of wanted) {
      const [documentId, version] = [key.split("@")[0] as Id<"documents">, Number(key.split("@")[1])]
      const doc = await ctx.db.get(documentId)
      if (!doc || publishedVersion(doc) !== version) continue
      const chunks = (
        await ctx.db
          .query("chunks")
          .withIndex("by_documentId_and_version", (q) => q.eq("documentId", documentId).eq("version", version))
          .take(2000)
      ).sort((a, b) => a.seq - b.seq)
      const texts = withTableHeaders(chunks.map((c) => ({ text: c.text, section: c.pageOrSection })))
      docs.push({
        documentId,
        namingCode: doc.namingCode,
        title: doc.title,
        version,
        chunks: chunks
          .map((c, i) => ({ chunkId: c._id, text: texts[i], section: c.pageOrSection }))
          .filter((c) => chunkIds.has(c.chunkId)),
      })
    }
    return { wikiId: check.wikiId ?? null, text: claim.text, docs: docs.filter((d) => d.chunks.length > 0) }
  },
})

/**
 * "Use the Published wording": the claim rewritten from its live Published
 * passages, then grounded sentence by sentence. Null when nothing passes.
 */
export const rewriteFromPassage = action({
  args: { checkId: v.id("wikiChecks"), claimIndex: v.number(), personId: v.optional(v.id("people")) },
  handler: async (ctx, args): Promise<{ text: string; points: Point[] } | null> => {
    await requireUser(ctx)
    const personId = args.personId ?? null
    await ctx.runQuery(internal.ai.wikiBlock.assertEngineer, { personId })
    const claim: { wikiId: Id<"wikis"> | null; text: string; docs: ExcerptDoc[] } | null = await ctx.runQuery(
      internal.ai.wikiBlock.claimPassages,
      { checkId: args.checkId, claimIndex: args.claimIndex },
    )
    if (!claim || claim.docs.length === 0) return null
    const model = currentModel()
    if (!model) throw new ConvexError("No AI key is set on this deployment.")
    const actionId = await ctx.runMutation(internal.lib.aiBudget.start, { action: "wikiBlock", personId, wikiId: claim.wikiId })
    const target = claim.wikiId ? { kind: "wiki", id: claim.wikiId as string } : undefined
    let ok = false
    let error: string | undefined
    try {
      const ex = numberExcerpts(claim.docs)
      let items: RawItem[]
      if (model.provider === "stub") {
        await meterStub(ctx, "wiki.rewrite", personId, target)
        items = stubRewrite(claim.text, [...ex.provided.values()])
      } else {
        const out = (
          await callJson(ctx, {
            feature: "wiki.rewrite",
            personId,
            target,
            system: rewriteSystem(),
            messages: [{ role: "user", content: [`CLAIM: ${claim.text}`, "", "EXCERPTS:", ...ex.lines].join("\n") }],
            schema: RewriteOut,
            effort: "low",
            maxTokens: 2000,
          })
        ).value
        items = out.sentences ?? []
      }
      const g = groundItems(items, "prose", [], ex)
      ok = true
      return g.points.length ? { text: g.points.map((p) => p.text).join(" "), points: g.points } : null
    } catch (err) {
      error = errorText(err)
      throw new ConvexError(`The rewrite did not run: ${error}`)
    } finally {
      await ctx.runMutation(internal.lib.aiBudget.finish, { actionId, ok, ...(error ? { error } : {}) })
    }
  },
})

/** Stub: the passage sentence that shares most words with the claim, verbatim. */
function stubRewrite(claim: string, excerpts: { key: string; text: string }[]): RawItem[] {
  let best: { text: string; key: string; s: number } | null = null
  for (const e of excerpts)
    for (const s of splitSentences(e.text)) {
      const score = support(claim, s)
      if (!best || score > best.s) best = { text: s, key: e.key, s: score }
    }
  return best ? [{ text: best.text, sources: [best.key] }] : []
}
