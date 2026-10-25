// AI description, alt text, tags and kind for a library image, with the cheap
// chat model (CHAT_MODEL). The AI only fills in what a person did not write:
// an existing description or alt text is kept unless `overwrite` is set, and
// tags are merged. After describing, the image is (re-)embedded.
import { v } from "convex/values"
import { internalAction, internalMutation, internalQuery, mutation } from "../_generated/server"
import { internal } from "../_generated/api"
import { requireUser } from "../lib/auth"
import { requireEngineerOrAdmin } from "../lib/roles"
import { embeddableMime, loadImageBytes } from "./imageEmbed"
import { geminiConfigured, geminiText, toBase64 } from "./gemini"

const KINDS = ["photo", "illustration", "diagram", "safety", "generated"] as const
type Kind = (typeof KINDS)[number]

/** An image's kind (images.kind in the schema). */
export const imageKindValidator = v.union(
  v.literal("photo"),
  v.literal("illustration"),
  v.literal("diagram"),
  v.literal("safety"),
  v.literal("generated"),
)

const PROMPT = `You catalogue images for a factory's knowledge base (SOPs, work instructions, Trainings).
Look at the image and answer in JSON with:
- "altText": one short sentence (max 15 words) that says what the image shows, for screen readers.
- "description": two or three plain sentences: what is shown, which equipment or parts, and what a reader of a work instruction would use it for. No guesses about brands.
- "tags": 3 to 8 lowercase English keywords (equipment, task, part, hazard, PPE). Single words or short phrases.
- "kind": one of "photo" (a real photograph), "illustration" (a drawn or rendered picture), "diagram" (schematic, chart, labelled drawing), "safety" (a pictogram, sign or PPE symbol).
Plain words, no em dashes.`

export const getForDescribe = internalQuery({
  args: { imageId: v.id("images") },
  handler: async (ctx, { imageId }) => {
    const row = await ctx.db.get(imageId)
    if (!row) return null
    const assets = await Promise.all((row.assetIds ?? []).map((id) => ctx.db.get(id)))
    return {
      storageId: row.storageId,
      externalUrl: row.externalUrl,
      contentType: row.contentType,
      filename: row.filename,
      altText: row.altText,
      assetNames: assets.filter((a) => a !== null).map((a) => `${a.code} ${a.name}`),
    }
  },
})

export const applyDescription = internalMutation({
  args: {
    imageId: v.id("images"),
    altText: v.string(),
    description: v.string(),
    tags: v.array(v.string()),
    kind: v.optional(imageKindValidator),
    overwrite: v.boolean(),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.imageId)
    if (!row) return
    const tags = Array.from(new Set([...(row.tags ?? []), ...args.tags.map(normTag).filter(Boolean)])).slice(0, 16)
    await ctx.db.patch(args.imageId, {
      description: args.overwrite || !row.description ? args.description : row.description,
      altText: args.overwrite || !row.altText.trim() ? args.altText : row.altText,
      tags,
      ...(args.kind && (!row.kind || args.overwrite) && row.kind !== "generated" ? { kind: args.kind } : {}),
      describedAt: Date.now(),
    })
  },
})

export function normTag(t: string): string {
  return t.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 40)
}

export const describe = internalAction({
  args: { imageId: v.id("images"), overwrite: v.optional(v.boolean()), thenEmbed: v.optional(v.boolean()) },
  handler: async (ctx, args): Promise<{ ok: boolean; error?: string }> => {
    let result: { ok: boolean; error?: string } = { ok: false, error: "GEMINI_API_KEY is not set" }
    if (geminiConfigured()) {
      try {
        const row = await ctx.runQuery(internal.ai.imageDescribe.getForDescribe, { imageId: args.imageId })
        if (!row) return { ok: false, error: "not found" }
        const loaded = await loadImageBytes(ctx, row)
        if (!loaded || !embeddableMime(loaded.mime)) throw new Error("This image type cannot be described")
        const context = [
          `File name: ${row.filename}`,
          row.altText ? `Current alt text: ${row.altText}` : "",
          row.assetNames.length ? `Linked Assets: ${row.assetNames.join(", ")}` : "",
        ]
          .filter(Boolean)
          .join("\n")
        const text = await geminiText(
          { ctx, feature: "image.describe", personId: null, target: { kind: "image", id: args.imageId } },
          [{ inline_data: { mime_type: loaded.mime, data: toBase64(loaded.bytes) } }, { text: `${PROMPT}\n\n${context}` }],
          { json: true, maxOutputTokens: 800 },
        )
        const parsed = JSON.parse(text) as { altText?: string; description?: string; tags?: string[]; kind?: string }
        const kind = KINDS.includes(parsed.kind as Kind) ? (parsed.kind as Kind) : undefined
        await ctx.runMutation(internal.ai.imageDescribe.applyDescription, {
          imageId: args.imageId,
          altText: clean(parsed.altText ?? "").slice(0, 200),
          description: clean(parsed.description ?? "").slice(0, 800),
          tags: Array.isArray(parsed.tags) ? parsed.tags.filter((t) => typeof t === "string").slice(0, 8) : [],
          kind,
          overwrite: args.overwrite ?? false,
        })
        result = { ok: true }
      } catch (e) {
        result = { ok: false, error: e instanceof Error ? e.message : String(e) }
        console.warn(`describe ${args.imageId} failed:`, result.error)
      }
    }
    if (args.thenEmbed !== false) {
      await ctx.scheduler.runAfter(0, internal.ai.imageEmbed.embedImage, { imageId: args.imageId })
    }
    return result
  },
})

function clean(s: string): string {
  return s.replace(/\s*[—–]\s*/g, ", ").trim()
}

/** "Describe with AI" on selected images (library bulk action). Engineer or Admin only. */
export const requestDescribe = mutation({
  args: {
    ids: v.array(v.id("images")),
    personId: v.optional(v.id("people")),
    overwrite: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireUser(ctx)
    await requireEngineerOrAdmin(ctx, args.personId)
    const ids = args.ids.slice(0, 100)
    for (const [i, imageId] of ids.entries()) {
      await ctx.scheduler.runAfter(i * 1500, internal.ai.imageDescribe.describe, {
        imageId,
        overwrite: args.overwrite ?? false,
        thenEmbed: true,
      })
    }
    return { scheduled: ids.length }
  },
})
