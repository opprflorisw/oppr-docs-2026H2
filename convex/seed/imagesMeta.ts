// Seed module: tags, descriptions, kinds and Asset/area links for the seeded
// images (images lane). Called by seedKnowledge after the other modules.
// Running it again replaces what it made. No AI calls: descriptions come from
// the prompts the images were generated from, tags from their keys and the
// Documents they illustrate. Embeddings are NOT made here; run the backfill
// on dev afterwards (npx convex run ai/imageEmbed:backfill).
//
// Also puts the seeded Asset photos into the library (sharing the cached
// seedMedia blob, which the wipe keeps), so a picker for an Asset finds them.
import { internalMutation } from "../_generated/server"
import type { MutationCtx } from "../_generated/server"
import type { Doc, Id } from "../_generated/dataModel"
import { ASSETS, AREAS, SEED_DOCS } from "./content"
import { PROMPT_OVERRIDES } from "./media"
import type { ImageSpec } from "./builders"

const DAY = 86_400_000
const STOP = new Set(["and", "the", "with", "for", "of", "on", "in", "a", "to", "at", "step", "view", "close", "up", "top", "side", "front"])
const SAFETY_WORDS = ["ppe", "loto", "lockout", "guard", "hazard", "warning", "burn", "hot", "gloves", "emergency", "stop", "lmra", "danger"]
const TYPE_TAG: Record<string, string> = {
  sop: "sop",
  work_instruction: "work instruction",
  lmra: "lmra",
  manual: "manual",
}
// Collections the seed makes; images join them by area or kind.
const COLLECTIONS = [
  { name: "Line 2 extrusion", match: (m: Meta) => m.areaCodes.includes("EXT") },
  { name: "Mixing and drying", match: (m: Meta) => m.areaCodes.includes("MIX") },
  { name: "Safety pictures", match: (m: Meta) => m.kind === "safety" },
  { name: "Asset photos", match: (m: Meta) => m.isAssetPhoto },
]
// A few favourites so the picker's Favorites tab is not empty on a fresh seed.
const FAVORITES = new Set(["asset/EXL-201", "asset/VAC-203", "ext-ops-sop-0001/torque-pattern"])

type Meta = {
  key: string
  kind: Doc<"images">["kind"]
  tags: string[]
  description: string
  areaCodes: string[]
  assetIds: Id<"assets">[]
  isAssetPhoto: boolean
}

function firstSentences(s: string, max = 320): string {
  const clean = s.replace(/\s+/g, " ").trim()
  const sentence = clean.charAt(0).toUpperCase() + clean.slice(1)
  if (sentence.length <= max) return sentence.endsWith(".") ? sentence : `${sentence}.`
  const cut = sentence.slice(0, max)
  return `${cut.slice(0, cut.lastIndexOf(",") > 120 ? cut.lastIndexOf(",") : cut.lastIndexOf(" "))}.`
}

function keyWords(key: string): string[] {
  const name = key.split("/").pop() ?? key
  return name
    .toLowerCase()
    .split("-")
    .filter((w) => w.length > 2 && !STOP.has(w))
}

function kindFor(spec: ImageSpec, tags: string[], docType?: string): Doc<"images">["kind"] {
  if (spec.style === "photo") return "photo"
  if (docType === "lmra" || tags.some((t) => SAFETY_WORDS.some((w) => t.includes(w)))) return "safety"
  if (/(pattern|layout|diagram|sequence|zones|flow)/.test(spec.key)) return "diagram"
  return "illustration"
}

async function assetsByCode(ctx: MutationCtx): Promise<Map<string, Doc<"assets">>> {
  const out = new Map<string, Doc<"assets">>()
  for (const a of ASSETS) {
    const row = await ctx.db
      .query("assets")
      .withIndex("by_code", (q) => q.eq("code", a.code))
      .first()
    if (row) out.set(a.code, row)
  }
  return out
}

export const run = internalMutation({
  args: {},
  handler: async (ctx) => {
    const assets = await assetsByCode(ctx)
    const rows = await ctx.db.query("images").take(2000)
    const byStem = new Map<string, Doc<"images">>()
    for (const r of rows) byStem.set(r.filename.replace(/\.[a-z0-9]+$/i, ""), r)

    const metas: { row: Doc<"images">; meta: Meta }[] = []

    // 1. Document illustrations.
    for (const d of SEED_DOCS) {
      const areaLabel = AREAS.find((a) => a.code === d.area)?.label.toLowerCase()
      for (const spec of d.images) {
        const row = byStem.get(spec.key.replace(/\//g, "-"))
        if (!row) continue
        const tags = Array.from(
          new Set(
            [...keyWords(spec.key), TYPE_TAG[d.type], areaLabel, ...(d.tags ?? []).map((t) => t.toLowerCase())].filter(
              (t): t is string => Boolean(t),
            ),
          ),
        ).slice(0, 10)
        metas.push({
          row,
          meta: {
            key: spec.key,
            kind: kindFor(spec, tags, d.type),
            tags,
            description: firstSentences(PROMPT_OVERRIDES[spec.key] ?? spec.prompt),
            areaCodes: [d.area],
            assetIds: d.assets.map((c) => assets.get(c)?._id).filter((x): x is Id<"assets"> => Boolean(x)),
            isAssetPhoto: false,
          },
        })
      }
    }

    // 2. Asset photos: one library row per Asset, sharing the Asset's blob.
    let assetPhotos = 0
    for (const a of ASSETS) {
      const asset = assets.get(a.code)
      if (!asset?.imageStorageId) continue
      const stem = `asset-${a.code}`
      let row = byStem.get(stem)
      if (!row) {
        const media = await ctx.db
          .query("seedMedia")
          .withIndex("by_key", (q) => q.eq("key", a.photo.key))
          .first()
        const contentType = media?.contentType ?? "image/png"
        const ext = contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg"
        const id = await ctx.db.insert("images", {
          source: "upload",
          storageId: asset.imageStorageId,
          externalUrl: null,
          filename: `${stem}.${ext}`,
          contentType,
          byteSize: media?.byteSize ?? null,
          width: null,
          height: null,
          sha256: null,
          altText: `${a.name} (${a.code})`,
          uploadedBy: null,
          createdAt: (media?.createdAt ?? Date.now()) - 30 * DAY,
        })
        row = (await ctx.db.get(id))!
        assetPhotos++
      }
      const areaLabel = AREAS.find((x) => x.code === a.area)?.label.toLowerCase()
      const nameWords = a.name
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 2 && !STOP.has(w))
      metas.push({
        row,
        meta: {
          key: a.photo.key,
          kind: "photo",
          tags: Array.from(new Set([...nameWords, a.code.toLowerCase(), areaLabel, "asset photo"])).filter(
            (t): t is string => Boolean(t),
          ),
          description: firstSentences(PROMPT_OVERRIDES[a.photo.key] ?? a.photo.prompt),
          areaCodes: [a.area],
          assetIds: [asset._id],
          isAssetPhoto: true,
        },
      })
    }

    // 3. Collections (upsert by name), then patch every row.
    const collectionIds = new Map<string, Id<"imageCollections">>()
    for (const c of COLLECTIONS) {
      const existing = await ctx.db
        .query("imageCollections")
        .withIndex("by_name", (q) => q.eq("name", c.name))
        .first()
      collectionIds.set(
        c.name,
        existing?._id ?? (await ctx.db.insert("imageCollections", { name: c.name, createdAt: Date.now() })),
      )
    }

    for (const { row, meta } of metas) {
      const usages = await ctx.db
        .query("imageUsages")
        .withIndex("by_imageId", (q) => q.eq("imageId", row._id))
        .take(50)
      await ctx.db.patch(row._id, {
        kind: meta.kind,
        tags: meta.tags,
        description: meta.description,
        areaCodes: meta.areaCodes,
        assetIds: meta.assetIds,
        collectionIds: COLLECTIONS.filter((c) => c.match(meta)).map((c) => collectionIds.get(c.name)!),
        favorite: FAVORITES.has(meta.key) || undefined,
        useCount: usages.length || undefined,
        lastUsedAt: usages.length ? row.createdAt + 7 * DAY : undefined,
      })
    }

    return { described: metas.length, assetPhotos, collections: collectionIds.size }
  },
})
