// Public + internal CRUD for the import_jobs table.
//
// Lifecycle: create() → recordExtraction() → (action map.runMapping) →
// recordLinkResolutions() → finalize().

import { v } from "convex/values"
import { Doc, Id } from "../_generated/dataModel"
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "../_generated/server"
import { internal } from "../_generated/api"
import { requireUser, requireUserId } from "../lib/auth"
import { walkBodyAssetIds } from "../lib/assetWalker"

const targetTemplateValidator = v.union(
  v.literal("sop"),
  v.literal("workInstructionLog"),
  v.literal("manual"),
  v.literal("lmra"),
  v.literal("auto"),
)

const defaultModeValidator = v.union(
  v.literal("verbatim"),
  v.literal("improve"),
)

const stageValidator = v.union(
  v.literal("uploaded"),
  v.literal("extracted"),
  v.literal("mapped"),
  v.literal("linksResolved"),
  v.literal("finalized"),
  v.literal("failed"),
)

// Type slug references the editable namingTypes vocabulary.
const docTypeValidator = v.string()

export const create = mutation({
  args: {
    sourceStorageId: v.id("_storage"),
    sourceFilename: v.string(),
    sourceContentType: v.string(),
    sourceByteSize: v.number(),
    sourceSha256: v.union(v.string(), v.null()),
    targetTemplate: targetTemplateValidator,
    defaultMode: defaultModeValidator,
  },
  handler: async (ctx, args): Promise<Id<"importJobs">> => {
    const userId = await requireUserId(ctx)
    const id = await ctx.db.insert("importJobs", {
      sourceStorageId: args.sourceStorageId,
      sourceFilename: args.sourceFilename,
      sourceContentType: args.sourceContentType,
      sourceByteSize: args.sourceByteSize,
      sourceSha256: args.sourceSha256,
      targetTemplate: args.targetTemplate,
      defaultMode: args.defaultMode,
      stage: "uploaded",
      classification: null,
      extractedMarkdown: null,
      extractedPages: null,
      extractedImageIds: [],
      extractStats: null,
      mappedBody: null,
      mappedLogSpec: null,
      mappingNotes: null,
      linkResolutions: null,
      suggestedNamingCode: null,
      suggestedTitle: null,
      suggestedAssetIds: [],
      finalizedDocumentId: null,
      error: null,
      createdBy: userId,
      updatedAt: Date.now(),
    })
    return id
  },
})

export const get = query({
  args: { id: v.id("importJobs") },
  handler: async (ctx, args) => {
    await requireUser(ctx)
    return await ctx.db.get(args.id)
  },
})

export const getWithSourceUrl = query({
  args: { id: v.id("importJobs") },
  handler: async (ctx, args) => {
    await requireUser(ctx)
    const job = await ctx.db.get(args.id)
    if (!job) return null
    const sourceUrl = job.sourceStorageId
      ? await ctx.storage.getUrl(job.sourceStorageId)
      : null
    return { job, sourceUrl }
  },
})

export const listForUser = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx)
    const rows = await ctx.db
      .query("importJobs")
      .withIndex("by_createdBy", (q) => q.eq("createdBy", userId))
      .order("desc")
      .take(50)
    return rows
  },
})

export const recordExtraction = mutation({
  args: {
    jobId: v.id("importJobs"),
    classification: v.object({
      kind: v.union(
        v.literal("digitalPdf"),
        v.literal("scannedPdf"),
        v.literal("unsupported"),
      ),
      pageCount: v.number(),
      detectedLanguage: v.union(v.string(), v.null()),
    }),
    extractedMarkdown: v.string(),
    extractedPages: v.array(
      v.object({
        pageNumber: v.number(),
        text: v.string(),
      }),
    ),
    extractedImageIds: v.array(v.id("images")),
    extractStats: v.object({
      imagesDetected: v.number(),
      imagesExtracted: v.number(),
      imagesSkipped: v.number(),
      pageFallbackImages: v.number(),
      jpegImages: v.number(),
      pngImages: v.number(),
    }),
    structuredDoc: v.optional(v.union(v.any(), v.null())),
  },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    const job = await ctx.db.get(args.jobId)
    if (!job) throw new Error("Job not found")
    await ctx.db.patch(args.jobId, {
      classification: args.classification,
      extractedMarkdown: args.extractedMarkdown,
      extractedPages: args.extractedPages,
      extractedImageIds: args.extractedImageIds,
      extractStats: args.extractStats,
      structuredDoc: args.structuredDoc ?? null,
      stage: args.classification.kind === "unsupported" ? "failed" : "extracted",
      error:
        args.classification.kind === "unsupported"
          ? "Unsupported file type for browser-side extraction. Word/Excel/PowerPoint and scanned PDFs land in P1 (Python service)."
          : null,
      updatedAt: Date.now(),
    })
  },
})

// Called from the action in map.ts. Stores the AI mapping output (one of
// mappedBody for tiptap or mappedLogSpec for log spec).
export const recordMapping = internalMutation({
  args: {
    jobId: v.id("importJobs"),
    mappedBody: v.union(v.any(), v.null()),
    mappedLogSpec: v.union(v.any(), v.null()),
    mappingNotes: v.union(v.string(), v.null()),
    suggestedNamingCode: v.union(v.string(), v.null()),
    suggestedTitle: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId)
    if (!job) throw new Error("Job not found")
    await ctx.db.patch(args.jobId, {
      mappedBody: args.mappedBody,
      mappedLogSpec: args.mappedLogSpec,
      mappingNotes: args.mappingNotes,
      suggestedNamingCode: args.suggestedNamingCode,
      suggestedTitle: args.suggestedTitle,
      stage: "mapped",
      error: null,
      updatedAt: Date.now(),
    })
  },
})

export const recordMappingFailure = internalMutation({
  args: { jobId: v.id("importJobs"), error: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.jobId, {
      stage: "failed",
      error: args.error,
      updatedAt: Date.now(),
    })
  },
})

// Internal getter for the action.
export const getInternal = internalQuery({
  args: { id: v.id("importJobs") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id)
  },
})

// Resolve cross-link candidates: walk the mapped output for naming codes and
// asset names, fuzzy-match against the asset and document tables, persist the
// candidate list. Mutation (deterministic — no AI).
export const resolveLinks = mutation({
  args: { jobId: v.id("importJobs") },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    const job = await ctx.db.get(args.jobId)
    if (!job) throw new Error("Job not found")
    // Permit "extracted" too — the new pipeline can advance straight to
    // links once the StructuredDoc is recorded; the explicit AI mapping
    // pass is now optional.
    if (
      job.stage !== "mapped" &&
      job.stage !== "linksResolved" &&
      job.stage !== "extracted"
    ) {
      throw new Error(`Job is not ready for link resolution (stage=${job.stage})`)
    }

    const mappedAny = (job.mappedBody ?? job.mappedLogSpec) as
      | {
          detectedAssets?: string[]
          detectedDocs?: string[]
        }
      | null
    const sd = job.structuredDoc as
      | {
          linkedAssets?: { code: string }[]
          linkedDocs?: { code?: string | null; title?: string | null }[]
        }
      | null
    // Prefer the StructuredDoc's deterministic lists; fall back to the
    // legacy detectedAssets/detectedDocs from the AI mapper for older jobs.
    const detectedAssets =
      (sd?.linkedAssets ?? []).map((a) => a.code).filter((c): c is string => Boolean(c))
        .concat((mappedAny?.detectedAssets ?? []).filter((c) => !!c))
    const detectedDocs =
      (sd?.linkedDocs ?? [])
        .map((d) => d.code ?? d.title)
        .filter((s): s is string => Boolean(s))
        .concat((mappedAny?.detectedDocs ?? []).filter((c) => !!c))

    const allDocs = await ctx.db.query("documents").take(2000)
    const allAssets = await ctx.db.query("assets").take(2000)
    const docByCode = new Map(
      allDocs.map((d) => [d.namingCode.toLowerCase(), d] as const),
    )
    const assetByCode = new Map(
      allAssets.map((a) => [a.code.toLowerCase(), a] as const),
    )

    type Resolution = {
      match: string
      kind: "document" | "asset" | "log"
      confidence: number
      targetId: string | null
      targetLabel: string | null
      accepted: boolean
    }
    const resolutions: Resolution[] = []

    for (const code of detectedDocs) {
      const exactDoc = docByCode.get(code.toLowerCase())
      if (exactDoc) {
        resolutions.push({
          match: code,
          kind: "document",
          confidence: 1,
          targetId: exactDoc._id,
          targetLabel: `${exactDoc.namingCode} · ${exactDoc.title}`,
          accepted: false,
        })
        continue
      }
      // Try a fuzzy contains match
      const candidate = allDocs.find(
        (d) =>
          d.namingCode.toLowerCase().includes(code.toLowerCase()) ||
          code.toLowerCase().includes(d.namingCode.toLowerCase()),
      )
      resolutions.push({
        match: code,
        kind: "document",
        confidence: candidate ? 0.7 : 0,
        targetId: candidate ? candidate._id : null,
        targetLabel: candidate
          ? `${candidate.namingCode} · ${candidate.title}`
          : null,
        accepted: false,
      })
    }

    for (const name of detectedAssets) {
      // Exact code match first
      const trimmed = name.trim()
      const exactCode = assetByCode.get(trimmed.toLowerCase())
      if (exactCode) {
        resolutions.push({
          match: name,
          kind: "asset",
          confidence: 1,
          targetId: exactCode._id,
          targetLabel: `${exactCode.code} · ${exactCode.name}`,
          accepted: false,
        })
        continue
      }
      // Fuzzy by name (substring)
      const candidate = allAssets.find((a) => {
        const nLower = trimmed.toLowerCase()
        return (
          a.name.toLowerCase().includes(nLower) ||
          nLower.includes(a.name.toLowerCase()) ||
          a.code.toLowerCase().includes(nLower)
        )
      })
      const conf = candidate ? similarity(trimmed, candidate.name) : 0
      resolutions.push({
        match: name,
        kind: "asset",
        confidence: conf,
        targetId: candidate ? candidate._id : null,
        targetLabel: candidate ? `${candidate.code} · ${candidate.name}` : null,
        accepted: false,
      })
    }

    // Auto-accept very-high-confidence matches.
    for (const r of resolutions) {
      if (r.confidence >= 0.9 && r.targetId) r.accepted = true
    }

    // Suggested asset IDs come from accepted asset resolutions.
    const suggestedAssetIds = resolutions
      .filter((r) => r.accepted && r.kind === "asset" && r.targetId)
      .map((r) => r.targetId as Id<"assets">)

    await ctx.db.patch(args.jobId, {
      linkResolutions: resolutions,
      suggestedAssetIds,
      stage: "linksResolved",
      updatedAt: Date.now(),
    })
  },
})

export const updateLinkResolution = mutation({
  args: {
    jobId: v.id("importJobs"),
    index: v.number(),
    accepted: v.boolean(),
    targetId: v.union(v.string(), v.null()),
    targetLabel: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    const job = await ctx.db.get(args.jobId)
    if (!job) throw new Error("Job not found")
    const list = job.linkResolutions ?? []
    if (args.index < 0 || args.index >= list.length)
      throw new Error("Bad index")
    const next = [...list]
    next[args.index] = {
      ...next[args.index],
      accepted: args.accepted,
      targetId: args.targetId,
      targetLabel: args.targetLabel,
    }

    const suggestedAssetIds = next
      .filter((r) => r.accepted && r.kind === "asset" && r.targetId)
      .map((r) => r.targetId as Id<"assets">)

    await ctx.db.patch(args.jobId, {
      linkResolutions: next,
      suggestedAssetIds,
      updatedAt: Date.now(),
    })
  },
})

export const updateMetadata = mutation({
  args: {
    jobId: v.id("importJobs"),
    suggestedNamingCode: v.optional(v.union(v.string(), v.null())),
    suggestedTitle: v.optional(v.union(v.string(), v.null())),
    suggestedAssetIds: v.optional(v.array(v.id("assets"))),
    stage: v.optional(stageValidator),
  },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    const job = await ctx.db.get(args.jobId)
    if (!job) throw new Error("Job not found")
    const patch: Partial<Doc<"importJobs">> = { updatedAt: Date.now() }
    if (args.suggestedNamingCode !== undefined)
      patch.suggestedNamingCode = args.suggestedNamingCode
    if (args.suggestedTitle !== undefined)
      patch.suggestedTitle = args.suggestedTitle
    if (args.suggestedAssetIds !== undefined)
      patch.suggestedAssetIds = args.suggestedAssetIds
    if (args.stage !== undefined) patch.stage = args.stage
    await ctx.db.patch(args.jobId, patch)
  },
})

// Convert the imported TipTap mapping into a real `documents` row. The work-
// instruction-log path does NOT call this — it just exposes the spec for the
// engineer to copy into the LOGS configurator.
export const finalizeDocument = mutation({
  args: {
    jobId: v.id("importJobs"),
    namingCode: v.string(),
    title: v.string(),
    type: docTypeValidator,
    assetIds: v.array(v.id("assets")),
    body: v.any(),
    chunks: v.array(
      v.object({
        text: v.string(),
        section: v.union(v.string(), v.null()),
      }),
    ),
  },
  handler: async (ctx, args): Promise<Id<"documents">> => {
    const userId = await requireUserId(ctx)
    const job = await ctx.db.get(args.jobId)
    if (!job) throw new Error("Job not found")

    // Imports land as PRE-DRAFT: no naming code is claimed (empty string), so
    // the per-triplet counter is never burned on an import that might be
    // discarded. The code is allocated when the user opens it, sets location +
    // discipline, and saves (promoting it to draft). We also do NOT auto-link
    // assets — suggested links are surfaced for the user to apply by hand.
    const now = Date.now()
    const docId = await ctx.db.insert("documents", {
      namingCode: "",
      location: null,
      discipline: null,
      title: args.title.trim(),
      type: args.type,
      status: "pre_draft",
      currentVersion: 1,
      ownerId: userId,
      authorId: userId,
      tags: ["imported"],
      updatedAt: now,
    })

    await ctx.db.insert("documentVersions", {
      documentId: docId,
      version: 1,
      bodyKind: "tiptap",
      bodyJson: args.body,
      pdfStorageId: null,
      publishedAt: now,
    })

    for (const [i, c] of args.chunks.entries()) {
      await ctx.db.insert("chunks", {
        documentId: docId,
        version: 1,
        seq: i + 1,
        text: c.text,
        pageOrSection: c.section,
        embeddingModel: null,
      })
    }

    // Link only what the body actually references (none, for a fresh import) —
    // never the AI's suggested asset list.
    for (const raw of walkBodyAssetIds(args.body)) {
      const typed = ctx.db.normalizeId("assets", raw)
      if (typed) await ctx.db.insert("documentAssets", { documentId: docId, assetId: typed })
    }

    await ctx.runMutation(internal.images.recomputeUsagesForVersion, {
      documentId: docId,
      documentVersion: 1,
      body: args.body,
    })

    await ctx.scheduler.runAfter(0, internal.ai.embed.embedMissingInternal, {
      documentId: docId,
    })

    await ctx.db.patch(args.jobId, {
      stage: "finalized",
      finalizedDocumentId: docId,
      updatedAt: Date.now(),
    })

    return docId
  },
})

export const remove = mutation({
  args: { id: v.id("importJobs") },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    const job = await ctx.db.get(args.id)
    if (!job) return
    if (job.sourceStorageId) {
      try {
        await ctx.storage.delete(job.sourceStorageId)
      } catch {
        // best-effort
      }
    }
    await ctx.db.delete(args.id)
  },
})

// Trivial similarity score over short strings. Good enough for "Extruder 8C"
// vs "EXTRUDER_8C" matches at the import stage. Returns [0,1].
function similarity(a: string, b: string): number {
  const x = a.trim().toLowerCase().replace(/[\s_-]+/g, "")
  const y = b.trim().toLowerCase().replace(/[\s_-]+/g, "")
  if (x === y) return 1
  if (x.length === 0 || y.length === 0) return 0
  if (x.includes(y) || y.includes(x)) {
    return Math.min(x.length, y.length) / Math.max(x.length, y.length)
  }
  // Fall back to bigram overlap.
  const bg = (s: string) => {
    const out = new Set<string>()
    for (let i = 0; i < s.length - 1; i++) out.add(s.slice(i, i + 2))
    return out
  }
  const bx = bg(x)
  const by = bg(y)
  let inter = 0
  for (const t of bx) if (by.has(t)) inter += 1
  const union = bx.size + by.size - inter
  return union === 0 ? 0 : inter / union
}
