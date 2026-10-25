// AI-generated seed images (document illustrations, manual figures, asset
// photos), cached in the seedMedia table so a reseed never pays twice.
// A cached image is reused while its prompt hash is unchanged and its blob
// still exists; anything else is generated with Gemini and stored.
//
//   npx convex run seed/media:ensureMedia            # fill the gaps
//   npx convex run seed/media:ensureMedia '{"keys":["asset/EXL-201"],"force":true}'
import { v } from "convex/values"
import { ActionCtx, internalAction, internalMutation, internalQuery } from "../_generated/server"
import { internal } from "../_generated/api"
import { Id } from "../_generated/dataModel"
import type { ImageSpec } from "./builders"
import { allImageSpecs } from "./content"
import { IMAGE_MODEL } from "../ai/constants"
import { geminiImage, geminiKey } from "../ai/gemini"


const STYLE = {
  illustration:
    "Clean technical illustration for an industrial work instruction: flat colours, thin dark outlines, white background, realistic proportions, safety colours where relevant, no text, no letters, no numbers, no logos, no watermark.",
  photo:
    "Realistic photograph, clean modern plastics pipe extrusion factory, natural light, no people's faces, no text, no logos.",
} as const

// Prompt corrections after reviewing the generated images (wrong subject or
// stray text). Keyed by image key; replaces the writer's prompt.
export const PROMPT_OVERRIDES: Record<string, string> = {
  // First take: a square pipe.
  "ext-ops-wi-0001/test-cut":
    "Close-up of the freshly cut end of a round black polyethylene pressure pipe with thin blue stripes along its length, seen at an angle so the circular cut face and the ring-shaped pipe wall are visible, the cut face smooth and flat, the pipe held in two hands in grey cut-resistant gloves.",
  // First take: garbled engraved characters on the flange.
  "ext-ops-wi-0002/sizing-sleeve-flange":
    "close-up of a round brass sizing sleeve flange bolted to the inlet wall of a stainless steel vacuum calibration tank on a plastic pipe extrusion line, a black plastic pipe entering the sleeve, a gloved finger pointing at a small blank rectangular plate riveted on the flange, the plate is plain and empty",
  // First take: invented zone labels under the heater bands.
  "ext-ops-sop-0002/heating-zones":
    "side view of the barrel of a single-screw plastic pipe extruder with six ceramic heater bands evenly spaced along it, each band with its own thin thermocouple cable running up to a cable tray, the feed hopper on the left and the round die head on the right, the heater bands glowing slightly orange, plain unlabelled parts",
  // First take: garbled digits on the display.
  "mix-ops-sop-0002/dew-point-display":
    "Front view of the control panel of an industrial desiccant granulate dryer: a rectangular display screen glowing plain green with no characters on it, a green status lamp, a red and a green push button and a selector switch, the stainless steel drying hopper beside the panel, in a clean industrial hall",
  // First takes: no visible cross pattern.
  "ext-ops-sop-0001/torque-pattern":
    "front view of the round flange of a plastic pipe extruder die head with eight hexagon bolts on a bolt circle, straight orange lines drawn across the flange connecting each bolt to the bolt directly opposite it, forming a star shaped crosswise tightening pattern, a click-type torque wrench on the top bolt held by a hand in an orange heat-resistant glove",
  "ext-mnt-man-0001/die-bolt-pattern":
    "front view of the flange of a round pipe extrusion die head with eight hexagon bolts evenly spaced on a bolt circle, straight orange lines connecting each bolt to the bolt directly opposite it so that the lines form an eight-pointed star across the flange, showing a crosswise tightening sequence, a torque wrench engaged on one bolt held by a hand in a grey heat-resistant glove",
  // First take: a readable label on the gel tube.
  "asset/QCL-301":
    "a handheld ultrasonic wall thickness gauge with a blank screen and a probe on a coiled cable lying on a laboratory bench next to short cut sections of black plastic pipe, a small steel step block with two steps and a plain unlabelled white bottle of couplant gel, a quality laboratory with a measuring table in the background",
}

export function promptFor(spec: ImageSpec): string {
  const subject = PROMPT_OVERRIDES[spec.key] ?? spec.prompt
  return `${subject}\n\n${STYLE[spec.style ?? "illustration"]}`
}

export async function sha256Hex(data: string | Uint8Array): Promise<string> {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

export async function promptHashFor(spec: ImageSpec): Promise<string> {
  return sha256Hex(`${IMAGE_MODEL}\n${promptFor(spec)}`)
}

/** Width and height from a PNG or JPEG header, or null. */
export function imageSize(b: Uint8Array): { width: number; height: number } | null {
  if (b.length > 24 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength)
    return { width: dv.getUint32(16), height: dv.getUint32(20) }
  }
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) {
        i++
        continue
      }
      const marker = b[i + 1]
      const len = (b[i + 2] << 8) | b[i + 3]
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { height: (b[i + 5] << 8) | b[i + 6], width: (b[i + 7] << 8) | b[i + 8] }
      }
      i += 2 + len
    }
  }
  return null
}

export function mimeOf(b: Uint8Array): "image/png" | "image/jpeg" | null {
  if (b[0] === 0x89 && b[1] === 0x50) return "image/png"
  if (b[0] === 0xff && b[1] === 0xd8) return "image/jpeg"
  return null
}

// ---- seedMedia table ------------------------------------------------------------

export const listMedia = internalQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("seedMedia").take(1000)
    const out = []
    for (const r of rows) {
      const file = await ctx.db.system.get(r.storageId)
      out.push({
        key: r.key,
        promptHash: r.promptHash,
        storageId: r.storageId,
        contentType: r.contentType,
        byteSize: r.byteSize,
        exists: file !== null,
      })
    }
    return out
  },
})

export const upsertMedia = internalMutation({
  args: {
    key: v.string(),
    promptHash: v.string(),
    storageId: v.id("_storage"),
    contentType: v.string(),
    byteSize: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("seedMedia")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .take(10)
    // The old blob may still be referenced by seeded rows until the next
    // reseed (the seed wipe deletes it then); otherwise delete it now.
    const inUse = new Set<string>()
    for (const img of await ctx.db.query("images").take(2000)) if (img.storageId) inUse.add(img.storageId)
    for (const a of await ctx.db.query("assets").take(500)) if (a.imageStorageId) inUse.add(a.imageStorageId)
    for (const ver of await ctx.db.query("documentVersions").take(2000)) {
      if (ver.sourcePdfStorageId) inUse.add(ver.sourcePdfStorageId)
      if (ver.pdfStorageId) inUse.add(ver.pdfStorageId)
    }
    for (const row of existing) {
      if (row.storageId !== args.storageId && !inUse.has(row.storageId)) {
        try {
          await ctx.storage.delete(row.storageId)
        } catch {
          // Already gone.
        }
      }
      await ctx.db.delete(row._id)
    }
    await ctx.db.insert("seedMedia", { ...args, createdAt: Date.now() })
  },
})

// ---- Generation -------------------------------------------------------------------

export function decodeBase64(data: string): Uint8Array {
  const bin = atob(data)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

export interface MediaEntry {
  key: string
  storageId: Id<"_storage">
  contentType: string
  byteSize: number
}

export interface EnsureMediaResult {
  generated: number
  reused: number
  failed: { key: string; error: string }[]
  media: MediaEntry[]
}

/** Shared by the ensureMedia action and the seed. */
export async function ensureMediaImpl(
  ctx: ActionCtx,
  opts: { keys?: string[]; force?: boolean },
): Promise<EnsureMediaResult> {
  const specs = allImageSpecs().filter((s) => !opts.keys || opts.keys.includes(s.key))
  const cached = new Map(
    (await ctx.runQuery(internal.seed.media.listMedia, {})).map((r) => [r.key, r]),
  )
  const result: EnsureMediaResult = { generated: 0, reused: 0, failed: [], media: [] }
  const todo: { spec: ImageSpec; hash: string }[] = []
  for (const spec of specs) {
    const hash = await promptHashFor(spec)
    const row = cached.get(spec.key)
    if (row && row.exists && row.promptHash === hash && !opts.force) {
      result.reused++
      result.media.push({ key: row.key, storageId: row.storageId, contentType: row.contentType, byteSize: row.byteSize })
    } else {
      todo.push({ spec, hash })
    }
  }
  if (todo.length > 0) {
    geminiKey()
    console.log(`seed media: ${result.reused} cached, generating ${todo.length}`)
    let next = 0
    const worker = async () => {
      while (next < todo.length) {
        const { spec, hash } = todo[next++]
        try {
          const drawn = await geminiImage(
            { ctx, feature: "image.generate", personId: null, target: { kind: "seed", id: spec.key } },
            promptFor(spec),
            { attempts: 5, baseDelayMs: 2000 },
          )
          const img = { bytes: drawn.bytes, mime: mimeOf(drawn.bytes) ?? drawn.mimeType ?? "image/png" }
          const storageId = await ctx.storage.store(new Blob([img.bytes as BlobPart], { type: img.mime }))
          await ctx.runMutation(internal.seed.media.upsertMedia, {
            key: spec.key,
            promptHash: hash,
            storageId,
            contentType: img.mime,
            byteSize: img.bytes.length,
          })
          result.generated++
          result.media.push({ key: spec.key, storageId, contentType: img.mime, byteSize: img.bytes.length })
          console.log(`seed media: generated ${spec.key} (${Math.round(img.bytes.length / 1024)} kB, ${result.generated}/${todo.length})`)
        } catch (e) {
          const error = e instanceof Error ? e.message : String(e)
          result.failed.push({ key: spec.key, error })
          console.error(`seed media: FAILED ${spec.key}: ${error}`)
          // Keep an older image for this key rather than none at all.
          const old = cached.get(spec.key)
          if (old?.exists)
            result.media.push({ key: old.key, storageId: old.storageId, contentType: old.contentType, byteSize: old.byteSize })
        }
      }
    }
    await Promise.all([worker(), worker(), worker()])
  }
  return result
}

export const ensureMedia = internalAction({
  args: { keys: v.optional(v.array(v.string())), force: v.optional(v.boolean()) },
  handler: async (ctx, args): Promise<{ generated: number; reused: number; failed: { key: string; error: string }[] }> => {
    const r = await ensureMediaImpl(ctx, args)
    return { generated: r.generated, reused: r.reused, failed: r.failed }
  },
})

/** Storage URLs for a few keys, for looking at the images. */
export const mediaUrls = internalQuery({
  args: { keys: v.optional(v.array(v.string())) },
  handler: async (ctx, args) => {
    const rows = await ctx.db.query("seedMedia").take(1000)
    const out: { key: string; url: string | null; contentType: string }[] = []
    for (const r of rows) {
      if (args.keys && !args.keys.includes(r.key)) continue
      out.push({ key: r.key, url: await ctx.storage.getUrl(r.storageId), contentType: r.contentType })
    }
    return out
  },
})
