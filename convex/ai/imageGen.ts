// "Create an image": a checked-in Engineer answers a few guided questions,
// sees the prompt, and the Gemini image model draws it. The result goes into
// the image library as kind "generated", with its prompt and alt text kept,
// so it can be found and reused like any other image. It is only placed in a
// Document when the person presses Insert.
import { ConvexError, v } from "convex/values"
import { action, internalMutation } from "../_generated/server"
import { internal } from "../_generated/api"
import type { Id } from "../_generated/dataModel"
import { requireUserId } from "../lib/auth"
import { requireEngineerOrAdmin } from "../lib/roles"
import { IMAGE_MODEL, imageSize, mimeOf, sha256Hex } from "../seed/media"

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta"

// Appended to every prompt so generated images fit a controlled Document.
const HOUSE_RULES =
  "Industrial manufacturing plant setting. Clear, uncluttered composition that explains one thing. No text, letters, numbers or logos in the image. No recognisable faces. People, if any, wear the correct PPE."

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function decodeBase64(data: string): Uint8Array {
  const bin = atob(data)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

async function drawImage(prompt: string, apiKey: string): Promise<{ bytes: Uint8Array; mime: string }> {
  const url = `${GEMINI_BASE}/models/${IMAGE_MODEL}:generateContent?key=${apiKey}`
  let lastError = ""
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await sleep(1500 * 2 ** (attempt - 1))
    let res: Response
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      })
    } catch (e) {
      lastError = `network: ${e instanceof Error ? e.message : String(e)}`
      continue
    }
    if (res.status === 429 || res.status >= 500) {
      lastError = `HTTP ${res.status}`
      continue
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`)
    const json = (await res.json()) as {
      candidates?: { content?: { parts?: { inlineData?: { mimeType?: string; data?: string } }[] }; finishReason?: string }[]
    }
    const part = json.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)
    if (!part?.inlineData?.data) {
      // The model sometimes answers with text only; asking again usually works.
      lastError = `no image in the response (${json.candidates?.[0]?.finishReason ?? "no reason"})`
      continue
    }
    const bytes = decodeBase64(part.inlineData.data)
    return { bytes, mime: mimeOf(bytes) ?? part.inlineData.mimeType ?? "image/png" }
  }
  throw new Error(lastError || "image generation failed")
}

export const checkAuthor = internalMutation({
  args: { personId: v.id("people") },
  handler: async (ctx, args) => {
    await requireEngineerOrAdmin(ctx, args.personId, "Check in as an Engineer to create images.")
  },
})

export const storeGenerated = internalMutation({
  args: {
    storageId: v.id("_storage"),
    contentType: v.string(),
    byteSize: v.number(),
    width: v.union(v.number(), v.null()),
    height: v.union(v.number(), v.null()),
    sha256: v.string(),
    altText: v.string(),
    prompt: v.string(),
    uploadedBy: v.id("users"),
    areaCodes: v.array(v.string()),
    assetIds: v.array(v.id("assets")),
  },
  handler: async (ctx, args): Promise<Id<"images">> => {
    const ext = args.contentType === "image/jpeg" ? "jpg" : "png"
    const slug =
      args.altText
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 40) || "image"
    return await ctx.db.insert("images", {
      source: "upload",
      storageId: args.storageId,
      externalUrl: null,
      filename: `generated-${slug}.${ext}`,
      contentType: args.contentType,
      byteSize: args.byteSize,
      width: args.width,
      height: args.height,
      sha256: args.sha256,
      altText: args.altText,
      uploadedBy: args.uploadedBy,
      createdAt: Date.now(),
      kind: "generated",
      generatedPrompt: args.prompt,
      ...(args.areaCodes.length ? { areaCodes: args.areaCodes } : {}),
      ...(args.assetIds.length ? { assetIds: args.assetIds } : {}),
    })
  },
})

export const generate = action({
  args: {
    personId: v.id("people"),
    /** The prompt as the person saw and possibly edited it. */
    prompt: v.string(),
    altText: v.string(),
    areaCodes: v.optional(v.array(v.string())),
    assetIds: v.optional(v.array(v.id("assets"))),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ imageId: Id<"images">; url: string | null; altText: string }> => {
    const userId = await requireUserId(ctx)
    await ctx.runMutation(internal.ai.imageGen.checkAuthor, { personId: args.personId })
    const prompt = args.prompt.replace(/\s+/g, " ").trim()
    const altText = args.altText.replace(/\s+/g, " ").trim().slice(0, 200)
    if (prompt.length < 10) throw new ConvexError("Describe the image in a few more words.")
    if (prompt.length > 2000) throw new ConvexError("The prompt is too long. Keep it under 2000 characters.")
    if (!altText) throw new ConvexError("Add a short caption (alt text) for the image.")
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) throw new ConvexError("Image generation is not available on this server (no AI key).")

    let img: { bytes: Uint8Array; mime: string }
    try {
      img = await drawImage(`${prompt}\n\n${HOUSE_RULES}`, apiKey)
    } catch (err) {
      console.error("image generation failed:", err)
      throw new ConvexError("The image could not be created right now. Try again, or change the description.")
    }
    const storageId = await ctx.storage.store(new Blob([img.bytes as BlobPart], { type: img.mime }))
    const size = imageSize(img.bytes)
    const imageId: Id<"images"> = await ctx.runMutation(internal.ai.imageGen.storeGenerated, {
      storageId,
      contentType: img.mime,
      byteSize: img.bytes.length,
      width: size?.width ?? null,
      height: size?.height ?? null,
      sha256: await sha256Hex(img.bytes),
      altText,
      prompt,
      uploadedBy: userId,
      areaCodes: args.areaCodes ?? [],
      assetIds: args.assetIds ?? [],
    })
    // Description, tags and the multimodal embedding, so it can be found later.
    await ctx.scheduler.runAfter(0, internal.ai.imageDescribe.describe, { imageId, thenEmbed: true })
    return { imageId, url: await ctx.storage.getUrl(storageId), altText }
  },
})
