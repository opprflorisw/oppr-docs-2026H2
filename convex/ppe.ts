import { mutation, query } from "./_generated/server"
import { v } from "convex/values"
import { requireUser, requireUserId } from "./lib/auth"
import { requireEngineerOrAdmin } from "./lib/roles"

// Factory PPE catalog (20). The first eight slugs match the original hardcoded
// PPE node ids so documents authored before the configurator keep rendering.
// `mCode` is the ISO 7010 mandatory-sign code whose official pictogram is
// fetched and stored by ppeImages.ts; slugs without one fall back to the
// bundled SVG (pictogramId). labelNl is the Dutch caption for the NL/EN toggle.
export const FACTORY_PPE = [
  { slug: "hardhat", label: "Hard hat", labelNl: "Veiligheidshelm verplicht", pictogramId: "hard_hat", mCode: "M014", description: "Protects the head from falling objects and impacts.", descriptionNl: "Beschermt het hoofd tegen vallende voorwerpen en stoten." },
  { slug: "glasses", label: "Safety glasses", labelNl: "Veiligheidsbril verplicht", pictogramId: "eye_protection", mCode: "M004", description: "Eye protection from dust, splashes and debris.", descriptionNl: "Oogbescherming tegen stof, spatten en rondvliegende deeltjes." },
  { slug: "gloves", label: "Gloves", labelNl: "Veiligheidshandschoenen verplicht", pictogramId: "gloves", mCode: "M009", description: "Hand protection against cuts, abrasion and contaminants.", descriptionNl: "Handbescherming tegen snijwonden, schuren en verontreiniging." },
  { slug: "boots", label: "Safety boots", labelNl: "Veiligheidsschoenen verplicht", pictogramId: "footwear", mCode: "M008", description: "Steel-toe with anti-slip soles. Required on the floor.", descriptionNl: "Stalen neus met antislipzool. Verplicht op de werkvloer." },
  { slug: "hi-vis", label: "Hi-vis vest", labelNl: "Waarschuwingshesje verplicht", pictogramId: "hi_vis", mCode: "M015", description: "Required wherever forklifts or vehicles operate.", descriptionNl: "Verplicht waar heftrucks of voertuigen rijden." },
  { slug: "ear-pro", label: "Ear protection", labelNl: "Gehoorbescherming verplicht", pictogramId: "hearing", mCode: "M003", description: "Required in zones above 85 dB(A).", descriptionNl: "Verplicht in zones boven 85 dB(A)." },
  { slug: "mask", label: "Respirator", labelNl: "Adembescherming verplicht", pictogramId: "respirator", mCode: "M017", description: "Particulate/vapour filtration as specified per task.", descriptionNl: "Filtering van deeltjes of dampen zoals per taak voorgeschreven." },
  { slug: "dust-mask", label: "Dust mask", labelNl: "Masker verplicht", pictogramId: "face_mask", mCode: "M016", description: "Disposable mask for non-toxic particulates.", descriptionNl: "Wegwerpmasker voor niet-giftige deeltjes." },
  { slug: "clothing", label: "Protective clothing", labelNl: "Beschermende kleding verplicht", pictogramId: "protective_clothing", mCode: "M010", description: "Body-covering protective clothing for the task.", descriptionNl: "Lichaamsbedekkende beschermende kleding voor de taak." },
  { slug: "wash-hands", label: "Wash your hands", labelNl: "Handen wassen verplicht", pictogramId: "wash_hands", mCode: "M011", description: "Hand hygiene required before and after the task.", descriptionNl: "Handhygiëne verplicht voor en na de taak." },
  { slug: "face-shield", label: "Face shield", labelNl: "Gelaatsscherm verplicht", pictogramId: "face_shield", mCode: "M013", description: "Full-face protection against splashes and sparks.", descriptionNl: "Volledige gelaatsbescherming tegen spatten en vonken." },
  { slug: "harness", label: "Safety harness", labelNl: "Veiligheidsharnas verplicht", pictogramId: "harness", mCode: "M018", description: "Fall-arrest harness for work at height.", descriptionNl: "Valbeveiligingsharnas voor werken op hoogte." },
  { slug: "read-first", label: "Read the instructions", labelNl: "Gebruiksaanwijzing lezen", pictogramId: "read_instructions", mCode: "M002", description: "Read the procedure before starting.", descriptionNl: "Lees de procedure voordat je begint." },
  { slug: "handrail", label: "Use the handrail", labelNl: "Trapleuning vasthouden", pictogramId: "handrail", mCode: "M012", description: "Hold the handrail on stairs and platforms.", descriptionNl: "Houd de trapleuning vast op trappen en platforms." },
  { slug: "hair-net", label: "Hair net", labelNl: "Haarnet verplicht", pictogramId: "hair_net", mCode: null, description: "Contain hair in food or clean areas.", descriptionNl: "Bedek het haar in voedsel- of schone zones." },
  { slug: "gas-detector", label: "Use gas detector", labelNl: "Gasdetector gebruiken", pictogramId: "gas_detector", mCode: null, description: "Carry a personal gas detector in this zone.", descriptionNl: "Draag een persoonlijke gasdetector in deze zone." },
  { slug: "life-jacket", label: "Life jacket", labelNl: "Reddingsvest verplicht", pictogramId: "life_jacket", mCode: "M053", description: "Required near open water.", descriptionNl: "Verplicht nabij open water." },
  { slug: "lab-coat", label: "Lab coat", labelNl: "Laboratoriumjas verplicht", pictogramId: "lab_coat", mCode: "M010", description: "Wear a lab coat in the laboratory.", descriptionNl: "Draag een laboratoriumjas in het laboratorium." },
  { slug: "eye-ear", label: "Eye + ear protection", labelNl: "Oog- en gehoorbescherming", pictogramId: "eye_ear", mCode: null, description: "Both eye and hearing protection required.", descriptionNl: "Zowel oog- als gehoorbescherming verplicht." },
  { slug: "general", label: "General mandatory action", labelNl: "Algemeen gebod", pictogramId: "general_mandatory", mCode: "M001", description: "A mandatory action applies: see local signage.", descriptionNl: "Er geldt een verplichte handeling: zie lokale signalering." },
] as const

// slug → ISO 7010 mandatory code, consumed by ppeImages.ts to fetch artwork.
export const PPE_MCODE: Record<string, string> = Object.fromEntries(
  FACTORY_PPE.filter((p) => p.mCode).map((p) => [p.slug, p.mCode as string]),
)

const LANG_KEY = "ppe_language"

export const getLanguage = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx)
    const row = await ctx.db
      .query("meta")
      .withIndex("by_key", (q) => q.eq("key", LANG_KEY))
      .unique()
    return row?.value === "nl" ? "nl" : "en"
  },
})

export const setLanguage = mutation({
  args: { language: v.union(v.literal("en"), v.literal("nl")), personId: v.optional(v.id("people")) },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    await requireEngineerOrAdmin(ctx, args.personId)
    const row = await ctx.db
      .query("meta")
      .withIndex("by_key", (q) => q.eq("key", LANG_KEY))
      .unique()
    if (row) await ctx.db.patch(row._id, { value: args.language })
    else await ctx.db.insert("meta", { key: LANG_KEY, value: args.language })
  },
})

export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx)
    const rows = await ctx.db.query("ppeItems").take(200)
    rows.sort((a, b) => a.sortOrder - b.sortOrder)
    return await Promise.all(
      rows.map(async (r) => ({
        ...r,
        imageUrl: r.storageId ? await ctx.storage.getUrl(r.storageId) : null,
      })),
    )
  },
})

export const seedIfEmpty = mutation({
  args: {},
  handler: async (ctx) => {
    await requireUserId(ctx)
    const existing = await ctx.db.query("ppeItems").take(1)
    if (existing.length > 0) return { ok: true, seeded: false }
    for (let i = 0; i < FACTORY_PPE.length; i++) {
      const p = FACTORY_PPE[i]
      await ctx.db.insert("ppeItems", {
        slug: p.slug,
        label: p.label,
        labelEn: p.label,
        labelNl: p.labelNl,
        description: p.description,
        descriptionNl: p.descriptionNl,
        pictogramId: p.pictogramId,
        storageId: null,
        active: true,
        builtIn: true,
        sortOrder: i,
      })
    }
    return { ok: true, seeded: true }
  },
})

// For custom PPE items the author can upload their own pictogram image.
export const generateUploadUrl = mutation({
  args: { personId: v.optional(v.id("people")) },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    await requireEngineerOrAdmin(ctx, args.personId)
    return await ctx.storage.generateUploadUrl()
  },
})

function slugify(label: string): string {
  return label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

export const add = mutation({
  args: {
    label: v.string(),
    labelNl: v.optional(v.string()),
    description: v.optional(v.string()),
    descriptionNl: v.optional(v.string()),
    pictogramId: v.string(),
    storageId: v.optional(v.id("_storage")),
    personId: v.optional(v.id("people")),
  },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    await requireEngineerOrAdmin(ctx, args.personId)
    const label = args.label.trim()
    if (!label) throw new Error("Label is required")
    let slug = slugify(label)
    if (!slug) throw new Error("Label must contain letters or numbers")
    const clash = await ctx.db
      .query("ppeItems")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique()
    if (clash) slug = `${slug}-${Date.now().toString(36).slice(-4)}`
    const all = await ctx.db.query("ppeItems").take(200)
    const maxOrder = all.reduce((m, p) => Math.max(m, p.sortOrder), -1)
    return await ctx.db.insert("ppeItems", {
      slug,
      label,
      labelEn: label,
      labelNl: args.labelNl?.trim() || null,
      description: args.description?.trim() || null,
      descriptionNl: args.descriptionNl?.trim() || null,
      pictogramId: args.pictogramId,
      storageId: args.storageId ?? null,
      active: true,
      builtIn: false,
      sortOrder: maxOrder + 1,
    })
  },
})

export const update = mutation({
  args: {
    id: v.id("ppeItems"),
    label: v.optional(v.string()),
    labelNl: v.optional(v.string()),
    description: v.optional(v.string()),
    descriptionNl: v.optional(v.string()),
    pictogramId: v.optional(v.string()),
    personId: v.optional(v.id("people")),
  },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    await requireEngineerOrAdmin(ctx, args.personId)
    const row = await ctx.db.get(args.id)
    if (!row) throw new Error("PPE item not found")
    const patch: Record<string, unknown> = {}
    if (args.label !== undefined && args.label.trim()) {
      patch.label = args.label.trim()
      patch.labelEn = args.label.trim()
    }
    if (args.labelNl !== undefined) patch.labelNl = args.labelNl.trim() || null
    if (args.description !== undefined)
      patch.description = args.description.trim() || null
    if (args.descriptionNl !== undefined)
      patch.descriptionNl = args.descriptionNl.trim() || null
    if (args.pictogramId !== undefined) patch.pictogramId = args.pictogramId
    await ctx.db.patch(args.id, patch)
  },
})

export const setActive = mutation({
  args: { id: v.id("ppeItems"), active: v.boolean(), personId: v.optional(v.id("people")) },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    await requireEngineerOrAdmin(ctx, args.personId)
    const row = await ctx.db.get(args.id)
    if (!row) throw new Error("PPE item not found")
    await ctx.db.patch(args.id, { active: args.active })
  },
})

export const remove = mutation({
  args: { id: v.id("ppeItems"), personId: v.optional(v.id("people")) },
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    await requireEngineerOrAdmin(ctx, args.personId)
    const row = await ctx.db.get(args.id)
    if (!row) throw new Error("PPE item not found")
    if (row.builtIn)
      throw new Error("Built-in PPE can't be deleted. Deactivate it instead.")
    await ctx.db.delete(args.id)
  },
})
