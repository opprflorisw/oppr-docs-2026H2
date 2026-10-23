import { internalMutation } from "./_generated/server"
import { internal } from "./_generated/api"
import { Id } from "./_generated/dataModel"
import { counterKey } from "./naming"
import { FACTORY_PPE } from "./ppe"
import { DEFAULT_REVIEW_MONTHS } from "./documents"
import { requestGeneration } from "./wikis"

// Fresh, minimal seed for Oppr Knowledge (CONTEXT.md: "fresh, minimal seed").
// One small fictional plant, Pijpwerk Noord, that makes plastic pipe:
//   2 areas, 3 disciplines, 3 Assets, 6 Documents, 5 people, 1 Wiki.
// Small on purpose: every flow can be tested end to end on it.
//
// Built-in test fixtures (see docs/test-set.md):
//   - EXT-OPS-SOP-0001 is Published v1 with a newer v2 draft. The draft
//     switches purge compound PX-4400 to PX-9917. "PX-9917" must never appear
//     in Ask or a Wiki until v2 is published.
//   - MIX-OPS-SOP-0001 is a never-published draft mentioning paddle tool
//     MT-5521. "MT-5521" must never appear in Ask or a Wiki.
//   - EXT-OPS-WI-0001 is in review (shows in the Home inbox).
//   - Periodic reviews: one overdue, one due in 20 days, one due in 60 days.
//   - The SOP says die bolts 40 Nm, the supplier manual says 45 Nm: a
//     deliberate contradiction for the Consistency check slice.
//
// Wipes app data (templates, users and auth tables are kept). Safe to run
// twice; the result is identical. Run on dev only:
//   npx convex run seedKnowledge:run

const WIPE_TABLES = [
  "meta",
  "assets",
  "assetLogs",
  "documents",
  "documentVersions",
  "documentAssets",
  "logs",
  "documentLogRefs",
  "chunks",
  "qaSessions",
  "qaMessages",
  "images",
  "imageUsages",
  "importJobs",
  "namingLocations",
  "namingDisciplines",
  "namingTypes",
  "namingCounters",
  "ppeItems",
  "people",
  "wikis",
] as const

const TYPES = [
  { slug: "sop", token: "SOP", label: "SOP", icon: "FileText", color: "sky" },
  { slug: "manual", token: "MAN", label: "Manual", icon: "BookOpen", color: "violet" },
  { slug: "work_instruction", token: "WI", label: "Work instruction", icon: "ListChecks", color: "emerald" },
  { slug: "lmra", token: "LMRA", label: "LMRA", icon: "ShieldAlert", color: "rose" },
]

const PEOPLE = [
  { name: "Jan de Vries", kind: "operator", role: "Line operator, night shift", area: "EXT" },
  { name: "Fatima El Amrani", kind: "operator", role: "Line operator, day shift", area: "EXT" },
  { name: "Pieter Bakker", kind: "operator", role: "Mixing operator", area: "MIX" },
  { name: "Sanne Visser", kind: "engineer", role: "Process engineer", area: null },
  { name: "Mark Jansen", kind: "engineer", role: "Maintenance and safety engineer", area: null },
] as const

// ---- Tiny TipTap builders ---------------------------------------------------

interface Node {
  type: string
  attrs?: Record<string, unknown>
  content?: Node[]
  text?: string
}

const t = (text: string): Node => ({ type: "text", text })
const p = (...parts: (string | Node)[]): Node => ({
  type: "paragraph",
  content: parts.map((x) => (typeof x === "string" ? t(x) : x)),
})
const h = (level: number, text: string): Node => ({
  type: "heading",
  attrs: { level },
  content: [t(text)],
})
const ppe = (items: string): Node => ({ type: "ppe", attrs: { items } })
const callout = (kind: string, text: string): Node => ({
  type: "callout",
  attrs: { kind },
  content: [p(text)],
})
const steps = (items: string[]): Node => ({
  type: "stepList",
  content: items.map((it) => ({ type: "stepItem", content: [p(it)] })),
})
const table = (rows: string[][]): Node => ({
  type: "table",
  content: rows.map((row, i) => ({
    type: "tableRow",
    content: row.map((cell) => ({
      type: i === 0 ? "tableHeader" : "tableCell",
      attrs: { colspan: 1, rowspan: 1, colwidth: null },
      content: [p(cell)],
    })),
  })),
})
const asset = (id: Id<"assets">, label: string): Node => ({
  type: "linkedAsset",
  attrs: { assetId: id, label },
})
const doc = (...content: Node[]): Node => ({ type: "doc", content })

// One chunk per heading, paragraph, step and table row, labelled with the
// nearest heading. Same shape the editor produces.
function bodyChunks(body: Node) {
  const out: { text: string; section: string | null }[] = []
  let section: string | null = null
  const textOf = (n: Node): string =>
    n.text ?? (n.attrs?.label as string | undefined) ?? (n.content ?? []).map(textOf).join(n.type === "tableRow" ? " | " : "").trim()
  const visit = (n: Node) => {
    if (n.type === "heading") {
      section = textOf(n)
      out.push({ text: section, section })
      return
    }
    if (n.type === "paragraph" || n.type === "stepItem" || n.type === "tableRow") {
      const text = textOf(n)
      if (text) out.push({ text, section })
      return
    }
    for (const c of n.content ?? []) visit(c)
  }
  visit(body)
  return out
}

const DAY = 24 * 60 * 60 * 1000

export const run = internalMutation({
  args: {},
  handler: async (ctx) => {
    // ---- Wipe ----
    for (const v of await ctx.db.query("documentVersions").collect()) {
      if (v.pdfStorageId) await ctx.storage.delete(v.pdfStorageId).catch(() => {})
    }
    for (const img of await ctx.db.query("images").collect()) {
      if (img.storageId) await ctx.storage.delete(img.storageId).catch(() => {})
    }
    for (const tbl of WIPE_TABLES) {
      for (const row of await ctx.db.query(tbl).collect()) await ctx.db.delete(row._id)
    }

    const now = Date.now()
    const user = await ctx.db.query("users").first()
    const userId = user?._id ?? null

    // ---- Vocabulary ----
    for (const [code, label] of [
      ["MIX", "Hall 1 · Mixing"],
      ["EXT", "Hall 2 · Extrusion"],
    ]) {
      await ctx.db.insert("namingLocations", { code, label })
    }
    for (const [code, label] of [
      ["OPS", "Operations"],
      ["MNT", "Maintenance"],
      ["HSE", "Health and safety"],
    ]) {
      await ctx.db.insert("namingDisciplines", { code, label })
    }
    for (const [i, ty] of TYPES.entries()) {
      await ctx.db.insert("namingTypes", { ...ty, active: true, builtIn: true, sortOrder: i })
    }
    for (const [i, item] of FACTORY_PPE.entries()) {
      await ctx.db.insert("ppeItems", {
        slug: item.slug,
        label: item.label,
        labelEn: item.label,
        labelNl: item.labelNl,
        description: item.description,
        descriptionNl: item.descriptionNl,
        pictogramId: item.pictogramId,
        storageId: null,
        active: true,
        builtIn: true,
        sortOrder: i,
      })
    }
    for (const [i, person] of PEOPLE.entries()) {
      await ctx.db.insert("people", { ...person, sortOrder: i })
    }

    // ---- Assets ----
    const assetBase = {
      site: "PWN",
      level: 0,
      floorplan: null,
      isLinked: false,
      linkedLogCode: null,
      linkedLogName: null,
      linkedLogDescription: null,
      source: "local",
    }
    const mixer = await ctx.db.insert("assets", {
      ...assetBase,
      code: "MXR-101",
      name: "Batch mixer",
      location: "Hall 1 · Mixing",
      qrToken: "qr-mxr-101",
      description: "High-speed batch mixer that blends PE granulate with colour masterbatch for line 2.",
      pinNumber: 1,
      pinX: 22,
      pinY: 40,
    })
    const extruder = await ctx.db.insert("assets", {
      ...assetBase,
      code: "EXL-201",
      name: "Pipe extruder line 2",
      location: "Hall 2 · Extrusion",
      qrToken: "qr-exl-201",
      description: "Single-screw extruder producing PE pipe from 32 to 110 mm on line 2.",
      pinNumber: 2,
      pinX: 55,
      pinY: 45,
    })
    const saw = await ctx.db.insert("assets", {
      ...assetBase,
      code: "SAW-202",
      name: "Haul-off and cutting saw line 2",
      location: "Hall 2 · Extrusion",
      qrToken: "qr-saw-202",
      description: "Caterpillar haul-off with planetary saw that cuts pipe to length at the end of line 2.",
      pinNumber: 3,
      pinX: 82,
      pinY: 45,
    })

    // ---- Documents ----
    interface Edition {
      body: Node
      publishedDaysAgo: number | null
    }
    interface Seed {
      code: string
      area: string
      discipline: string
      type: string
      title: string
      status: "draft" | "in_review" | "published"
      live: number | null
      editions: Edition[]
      assets: Id<"assets">[]
      nextReviewInDays: number | null
    }

    const changeoverV1 = doc(
      h(1, "Colour and product changeover on extrusion line 2"),
      p("Use this procedure for every colour or product change on ", asset(extruder, "EXL-201"), ", fed by ", asset(mixer, "MXR-101"), " and cut by ", asset(saw, "SAW-202"), "."),
      ppe("glasses,gloves,boots,hearing"),
      callout("warning", "The die and barrel stay above 150 °C during a changeover. Wear heat-resistant gloves for any contact with the die."),
      h(2, "Procedure"),
      steps([
        "Tell the mixing operator the changeover is starting and which colour comes next.",
        "Stop dosing at MXR-101 when the extruder hopper is below 20 percent.",
        "Purge the barrel with purge compound PX-4400 at 190 °C until the melt runs clean, about 15 minutes.",
        "Swap the masterbatch and, for a product change, fit the new die.",
        "Tighten the die bolts crosswise to 40 Nm.",
        "Restart the screw at 60 rpm and ramp up to production speed over 5 minutes.",
        "Scrap the first 3 metres of pipe and measure wall thickness on each of the first 10 pipes.",
      ]),
      h(2, "If something goes wrong"),
      table([
        ["Symptom", "Likely cause", "Action"],
        ["Streaks of the old colour after 15 minutes", "Purge not finished", "Purge for another 5 minutes, then check again"],
        ["Wall thickness out of tolerance", "Speed ramp too fast", "Lower haul-off speed and recheck after 3 pipes"],
      ]),
    )
    // v2 draft: switches the purge compound. Must stay invisible until published.
    const changeoverV2 = doc(
      ...(changeoverV1.content ?? []).map((n) =>
        n.type === "stepList"
          ? steps([
              "Tell the mixing operator the changeover is starting and which colour comes next.",
              "Stop dosing at MXR-101 when the extruder hopper is below 20 percent.",
              "Purge the barrel with purge compound PX-9917 at 190 °C until the melt runs clean, about 10 minutes.",
              "Swap the masterbatch and, for a product change, fit the new die.",
              "Tighten the die bolts crosswise to 40 Nm.",
              "Restart the screw at 60 rpm and ramp up to production speed over 5 minutes.",
              "Scrap the first 3 metres of pipe and measure wall thickness on each of the first 10 pipes.",
              "Record the changeover in the shift handover.",
            ])
          : n,
      ),
    )

    const manual = doc(
      h(1, "EXL-201 single-screw extruder: supplier manual (excerpt)"),
      p("Operating and maintenance data for ", asset(extruder, "EXL-201"), " as supplied by the manufacturer."),
      h(2, "Operating envelope"),
      table([
        ["Parameter", "Minimum", "Maximum"],
        ["Barrel temperature", "170 °C", "220 °C"],
        ["Screw speed", "20 rpm", "220 rpm"],
        ["Melt pressure", "-", "350 bar"],
      ]),
      h(2, "Die mounting"),
      p("Tighten the die bolts in a cross pattern to 45 Nm with the die at operating temperature."),
      p("Replace the die bolts after 20 die changes or when the thread shows wear."),
      h(2, "Cleaning"),
      p("Clean the breaker plate and screen pack at every product change and at least every 500 operating hours."),
    )

    const loto = doc(
      h(1, "Lockout/tagout on extrusion line 2"),
      p("Follow this procedure before any work inside the guarding of ", asset(extruder, "EXL-201"), " or ", asset(saw, "SAW-202"), "."),
      ppe("glasses,gloves,boots"),
      callout("warning", "Never reach into the haul-off or saw area while the line is only stopped. A stopped line can restart."),
      h(2, "Procedure"),
      steps([
        "Inform the shift leader and the operators on line 2.",
        "Stop the line from the main panel.",
        "Switch off the main isolator of line 2 and attach your personal lock and tag.",
        "Release stored energy: open the pneumatic dump valve on the haul-off.",
        "Try to start the line from the panel to verify it is isolated.",
        "After the work, remove your own lock only. Only the person who placed a lock may remove it.",
      ]),
    )

    const mixerStart = doc(
      h(1, "Starting a batch on mixer MXR-101"),
      p("Work instruction for starting a colour batch on ", asset(mixer, "MXR-101"), "."),
      ppe("glasses,gloves,mask"),
      steps([
        "Check the recipe on the batch card against the colour planned for line 2.",
        "Weigh the masterbatch: 2 kg per 100 kg of PE granulate unless the batch card says otherwise.",
        "Load granulate first, then masterbatch, and close the lid before starting.",
        "Mix for 4 minutes and release the batch to the line 2 hopper.",
      ]),
    )

    const sawCheck = doc(
      h(1, "Saw blade check on SAW-202"),
      p("Daily check of the saw blade on ", asset(saw, "SAW-202"), " before the first cut."),
      steps([
        "Lock out the saw following the line 2 lockout procedure.",
        "Inspect the blade for missing or chipped teeth.",
        "Replace a damaged blade with blade type BL-7730.",
      ]),
    )

    const mixerCleaning = doc(
      h(1, "Cleaning mixer MXR-101"),
      p("Cleaning procedure for ", asset(mixer, "MXR-101"), " between colours."),
      steps([
        "Lock out the mixer.",
        "Scrape the paddles with paddle tool MT-5521.",
        "Vacuum the bowl and check that no granulate of the previous colour remains.",
      ]),
    )

    const seeds: Seed[] = [
      {
        code: "EXT-OPS-SOP-0001", area: "EXT", discipline: "OPS", type: "sop",
        title: "Colour and product changeover on extrusion line 2",
        status: "draft", live: 1,
        editions: [
          { body: changeoverV1, publishedDaysAgo: 165 },
          { body: changeoverV2, publishedDaysAgo: null },
        ],
        assets: [extruder, mixer, saw], nextReviewInDays: 200,
      },
      {
        code: "EXT-MNT-MAN-0001", area: "EXT", discipline: "MNT", type: "manual",
        title: "EXL-201 single-screw extruder: supplier manual (excerpt)",
        status: "published", live: 1,
        editions: [{ body: manual, publishedDaysAgo: 345 }],
        assets: [extruder], nextReviewInDays: 20,
      },
      {
        code: "EXT-HSE-SOP-0001", area: "EXT", discipline: "HSE", type: "sop",
        title: "Lockout/tagout on extrusion line 2",
        status: "published", live: 1,
        editions: [{ body: loto, publishedDaysAgo: 375 }],
        assets: [extruder, saw], nextReviewInDays: -10,
      },
      {
        code: "MIX-OPS-WI-0001", area: "MIX", discipline: "OPS", type: "work_instruction",
        title: "Starting a batch on mixer MXR-101",
        status: "published", live: 1,
        editions: [{ body: mixerStart, publishedDaysAgo: 305 }],
        assets: [mixer], nextReviewInDays: 60,
      },
      {
        code: "EXT-OPS-WI-0001", area: "EXT", discipline: "OPS", type: "work_instruction",
        title: "Saw blade check on SAW-202",
        status: "in_review", live: null,
        editions: [{ body: sawCheck, publishedDaysAgo: null }],
        assets: [saw], nextReviewInDays: null,
      },
      {
        code: "MIX-OPS-SOP-0001", area: "MIX", discipline: "OPS", type: "sop",
        title: "Cleaning mixer MXR-101",
        status: "draft", live: null,
        editions: [{ body: mixerCleaning, publishedDaysAgo: null }],
        assets: [mixer], nextReviewInDays: null,
      },
    ]

    const ids: Record<string, Id<"documents">> = {}
    const counters = new Map<string, number>()
    for (const s of seeds) {
      const current = s.editions.length
      const id = await ctx.db.insert("documents", {
        namingCode: s.code,
        location: s.area,
        discipline: s.discipline,
        title: s.title,
        type: s.type,
        status: s.status,
        currentVersion: current,
        ...(s.live != null ? { liveVersion: s.live } : {}),
        ownerId: userId,
        authorId: userId,
        reviewerId: userId,
        approverId: userId,
        tags: [],
        updatedAt: now,
        reviewIntervalMonths: DEFAULT_REVIEW_MONTHS,
        nextReviewAt: s.nextReviewInDays == null ? null : now + s.nextReviewInDays * DAY,
        lastReviewedAt:
          s.editions[0].publishedDaysAgo == null ? null : now - s.editions[0].publishedDaysAgo * DAY,
      })
      ids[s.code] = id
      for (const [i, ed] of s.editions.entries()) {
        const version = i + 1
        const at = ed.publishedDaysAgo == null ? now - DAY : now - ed.publishedDaysAgo * DAY
        const published = ed.publishedDaysAgo != null
        await ctx.db.insert("documentVersions", {
          documentId: id,
          version,
          bodyKind: "tiptap",
          bodyJson: ed.body,
          pdfStorageId: null,
          publishedAt: at,
          signoffs: userId
            ? published
              ? [
                  { role: "author", userId, at },
                  { role: "reviewer", userId, at },
                  { role: "approver", userId, at },
                ]
              : [{ role: "author", userId, at }]
            : [],
        })
        for (const [seq, c] of bodyChunks(ed.body).entries()) {
          await ctx.db.insert("chunks", {
            documentId: id,
            version,
            seq: seq + 1,
            text: c.text,
            pageOrSection: c.section,
            embedding: null,
            embeddingModel: null,
          })
        }
      }
      for (const assetId of s.assets) {
        await ctx.db.insert("documentAssets", { documentId: id, assetId })
      }
      const key = counterKey(s.area, s.discipline, s.type)
      counters.set(key, (counters.get(key) ?? 0) + 1)
    }
    for (const [key, value] of counters) {
      await ctx.db.insert("namingCounters", { key, value })
    }

    // ---- Example Wiki ----
    const wikiId = await ctx.db.insert("wikis", {
      title: "Line 2 changeover essentials",
      purpose: "For operators on extrusion line 2 who do a colour or product changeover, especially on the night shift.",
      scope: { areas: [], disciplines: [], assetIds: [extruder], documentIds: [] },
      status: "generating",
      content: null,
      sources: [],
      generatedAt: null,
      generationTicket: 0,
      requestedAt: null,
      lastTrigger: null,
      droppedPoints: 0,
      error: null,
      createdBy: userId,
      updatedAt: now,
    })
    await requestGeneration(ctx, wikiId, "seed")

    // Embeddings for Ask run in the background.
    for (const id of Object.values(ids)) {
      await ctx.scheduler.runAfter(0, internal.ai.embed.embedMissingInternal, {
        documentId: id,
      })
    }

    const count = async (tbl: (typeof WIPE_TABLES)[number]) =>
      (await ctx.db.query(tbl).collect()).length
    return {
      ok: true,
      assets: await count("assets"),
      documents: await count("documents"),
      versions: await count("documentVersions"),
      chunks: await count("chunks"),
      people: await count("people"),
      wikis: await count("wikis"),
    }
  },
})
