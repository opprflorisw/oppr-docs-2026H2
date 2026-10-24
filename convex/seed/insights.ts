// Seed: Usage signals for Document insights and Knowledge health over the
// last 60 days. Operators' questions (some Anonymous, some by checked-in
// people), views and Scans on desktop and floor, a few "unclear or wrong"
// marks from Attempts, and two ready insight reports so the document pages
// are rich before any AI refresh. Findings are NOT seeded: the real
// Consistency check produces them.
//
// Called by seedKnowledge after documents, chunks, people and assets exist.
// Everything is found by naming code, asset code or person name; missing
// things are skipped. Deterministic (fixed random seed).
import { internalMutation, MutationCtx } from "../_generated/server"
import { Doc, Id } from "../_generated/dataModel"

const DAY = 24 * 60 * 60 * 1000
const SPAN_DAYS = 60

function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ---- Questions --------------------------------------------------------------
// doc: the document the question is about (null = no Published document
// answers it). scope: where it was asked. found: whether the answer was in
// Published Knowledge. n: how many times it was asked.
interface Q {
  q: string
  doc: string | null
  scope: { kind: "doc" } | { kind: "asset"; code: string } | { kind: "library" }
  found: boolean
  n: number
  also?: string[]
}

const DOC = { kind: "doc" } as const
const LIB = { kind: "library" } as const
const at = (code: string) => ({ kind: "asset" as const, code })

const QUESTIONS: Q[] = [
  // Changeover on line 2
  { q: "How long do I purge after a colour change?", doc: "EXT-OPS-SOP-0001", scope: at("EXL-201"), found: true, n: 4 },
  { q: "how long purge black to yellow", doc: "EXT-OPS-SOP-0001", scope: at("EXL-201"), found: true, n: 1 },
  { q: "What torque for the die bolts on line 2?", doc: "EXT-OPS-SOP-0001", scope: at("EXL-201"), found: true, n: 3 },
  { q: "Is it 40 or 45 Nm for the die bolts?", doc: "EXT-OPS-SOP-0001", scope: LIB, found: true, n: 2, also: ["EXT-MNT-MAN-0001"] },
  { q: "Which masterbatch ratio for yellow gas pipe?", doc: "EXT-OPS-SOP-0001", scope: DOC, found: false, n: 3 },
  { q: "What percentage masterbatch for blue stripes?", doc: "EXT-OPS-SOP-0001", scope: at("MXR-101"), found: false, n: 2 },
  { q: "Do I stop the haul-off while purging?", doc: "EXT-OPS-SOP-0001", scope: DOC, found: false, n: 1 },
  { q: "How many pipes do I measure after a changeover?", doc: "EXT-OPS-SOP-0001", scope: DOC, found: true, n: 2 },
  { q: "Black specks after purging, what now?", doc: "EXT-OPS-SOP-0001", scope: at("EXL-201"), found: true, n: 2 },
  { q: "Which purge compound do we use?", doc: "EXT-OPS-SOP-0001", scope: DOC, found: true, n: 2 },
  { q: "What temperature do I purge at?", doc: "EXT-OPS-SOP-0001", scope: at("EXL-201"), found: true, n: 2 },
  // Wall thickness and OD
  { q: "Which tolerance for 110 SDR 17?", doc: "QCL-QA-SOP-0001", scope: at("QCL-301"), found: true, n: 3 },
  { q: "wall thickness limits 110 mm SDR 17", doc: "QCL-QA-SOP-0001", scope: DOC, found: true, n: 1 },
  { q: "How often do I measure during stable production?", doc: "QCL-QA-SOP-0001", scope: DOC, found: true, n: 3 },
  { q: "When do I calibrate the UT-200?", doc: "QCL-QA-SOP-0001", scope: at("QCL-301"), found: true, n: 3, also: ["QCL-QA-MAN-0001"] },
  { q: "Calibrate the thickness gauge every shift or once a day?", doc: "QCL-QA-SOP-0001", scope: LIB, found: false, n: 2 },
  { q: "What if one reading is just outside the wall limit?", doc: "QCL-QA-SOP-0001", scope: DOC, found: true, n: 2 },
  { q: "Do I use the mean or every single reading for the wall?", doc: "QCL-QA-SOP-0001", scope: DOC, found: true, n: 1 },
  { q: "Which couplant gel do we use for the UT-200?", doc: "QCL-QA-SOP-0001", scope: at("QCL-301"), found: false, n: 1 },
  { q: "Can I measure the OD with a pi tape?", doc: "QCL-QA-SOP-0001", scope: DOC, found: false, n: 1 },
  // Drying on DRY-102
  { q: "How long can dried granulate stay in the hopper?", doc: "MIX-OPS-SOP-0002", scope: at("DRY-102"), found: false, n: 4 },
  { q: "How long can dried granulate stay in the hopper before it must be dried again?", doc: "MIX-OPS-SOP-0002", scope: DOC, found: false, n: 1 },
  { q: "Can I use granulate that only dried 3 hours?", doc: "MIX-OPS-SOP-0002", scope: at("DRY-102"), found: true, n: 2 },
  { q: "What dew point is OK on DRY-102?", doc: "MIX-OPS-SOP-0002", scope: at("DRY-102"), found: true, n: 3 },
  { q: "What do I do when the dew point alarm goes off?", doc: "MIX-OPS-SOP-0002", scope: at("DRY-102"), found: false, n: 2 },
  { q: "Does masterbatch need drying too?", doc: "MIX-OPS-SOP-0002", scope: DOC, found: true, n: 1 },
  { q: "Who releases the dried granulate?", doc: "MIX-OPS-SOP-0002", scope: DOC, found: true, n: 2 },
  { q: "How long does drying take on DRY-102?", doc: "MIX-OPS-SOP-0002", scope: at("DRY-102"), found: true, n: 3 },
  { q: "What do I write on the hopper card?", doc: "MIX-OPS-SOP-0002", scope: DOC, found: true, n: 1 },
  // The coiler: its work instruction is not Published yet, so Ask finds nothing.
  { q: "What coil tension for 40 mm pipe?", doc: null, scope: at("CLR-204"), found: false, n: 3 },
  { q: "How many straps on a coil?", doc: null, scope: at("CLR-204"), found: false, n: 2 },
  { q: "How do I thread the first pipe on the coiler?", doc: null, scope: at("CLR-204"), found: false, n: 2 },
  { q: "How do I lock out the coiler before clearing a kink?", doc: "EXT-HSE-SOP-0001", scope: at("CLR-204"), found: true, n: 2 },
  // Other documents
  { q: "Barrel zone temperatures for a cold start?", doc: "EXT-OPS-SOP-0002", scope: at("EXL-201"), found: true, n: 2 },
  { q: "What is the maximum barrel temperature?", doc: "EXT-OPS-SOP-0002", scope: LIB, found: true, n: 1, also: ["EXT-MNT-MAN-0001"] },
  { q: "Can I reach into the saw area when the line is stopped?", doc: "EXT-HSE-SOP-0001", scope: at("SAW-202"), found: true, n: 2 },
  { q: "Where are the isolation points for line 2?", doc: "EXT-HSE-SOP-0001", scope: DOC, found: true, n: 1 },
  { q: "What vacuum for the calibration tank?", doc: "EXT-OPS-WI-0002", scope: at("VAC-203"), found: true, n: 2 },
  { q: "Cooling water temperature VAC-203?", doc: "EXT-OPS-WI-0002", scope: at("VAC-203"), found: true, n: 1 },
  { q: "How often must the screen pack be changed?", doc: "EXT-MNT-SOP-0001", scope: at("EXL-201"), found: false, n: 1 },
  { q: "In which order do the screens go in the breaker plate?", doc: "EXT-MNT-SOP-0001", scope: DOC, found: true, n: 1 },
  { q: "Where do I put pipe that failed the wall check?", doc: "QCL-QA-WI-0001", scope: LIB, found: true, n: 2 },
  { q: "How long do I cool a melt burn?", doc: "EXT-HSE-SOP-0002", scope: LIB, found: true, n: 1 },
  { q: "Maximum batch size for the mixer?", doc: "MIX-OPS-WI-0001", scope: at("MXR-101"), found: true, n: 2 },
  { q: "What is the maximum melt pressure on the KX-60?", doc: "EXT-MNT-MAN-0001", scope: at("EXL-201"), found: true, n: 2 },
  { q: "In what order do I switch off the line?", doc: "EXT-OPS-SOP-0003", scope: DOC, found: true, n: 1 },
  { q: "Do I need a face shield at the die head?", doc: "EXT-HSE-LMRA-0001", scope: at("EXL-201"), found: true, n: 1 },
]

// ---- Views and Scans ----------------------------------------------------------
const VIEWS: Record<string, number> = {
  "EXT-OPS-SOP-0001": 82,
  "QCL-QA-SOP-0001": 61,
  "MIX-OPS-SOP-0002": 48,
  "EXT-OPS-SOP-0002": 40,
  "EXT-HSE-SOP-0001": 34,
  "EXT-MNT-MAN-0001": 28,
  "EXT-OPS-WI-0002": 24,
  "EXT-MNT-SOP-0001": 24,
  "MIX-OPS-WI-0001": 22,
  "QCL-QA-WI-0001": 18,
  "EXT-OPS-SOP-0003": 18,
  "EXT-HSE-LMRA-0001": 14,
  "QCL-QA-MAN-0001": 12,
  "MIX-MNT-MAN-0001": 9,
  "EXT-MNT-MAN-0002": 9,
  "EXT-HSE-SOP-0002": 7,
  "EXT-OPS-WI-0003": 5,
  "EXT-OPS-WI-0001": 3,
  // MIX-HSE-LMRA-0001: never viewed (Knowledge health shows it).
}
const SCANS: Record<string, number> = {
  "EXL-201": 36,
  "MXR-101": 24,
  "DRY-102": 16,
  "SAW-202": 15,
  "CLR-204": 15,
  "VAC-203": 12,
  "QCL-301": 13,
}

// ---- Marks from Attempts --------------------------------------------------------
const FLAGS: { doc: string; note: string; person: string; daysAgo: number }[] = [
  { doc: "QCL-QA-SOP-0001", note: "The question said calibrate once a day, but the sticker on the UT-200 says every shift.", person: "Kevin Mulder", daysAgo: 9 },
  { doc: "QCL-QA-SOP-0001", note: "Not clear if the wall limit is for each reading or for the average.", person: "Lotte Smit", daysAgo: 4 },
  { doc: "EXT-OPS-SOP-0001", note: "The answer says 40 Nm, but the Krauss manual at the line says 45 Nm.", person: "Ahmed Yilmaz", daysAgo: 12 },
  { doc: "EXT-OPS-SOP-0001", note: "Asked about the masterbatch ratio, but the SOP only says to follow the batch card.", person: "Lotte Smit", daysAgo: 6 },
  { doc: "MIX-OPS-SOP-0002", note: "Nothing about how long the dried granulate stays good in the hopper.", person: "Emma de Boer", daysAgo: 15 },
]

// ---- Ready insight reports ---------------------------------------------------------
// Examples must be questions from QUESTIONS, copied exactly.
const REPORTS: {
  doc: string
  daysAgo: number
  themes: { title: string; detail: string; severity: "info" | "unclear" | "gap"; examples: string[] }[]
}[] = [
  {
    doc: "EXT-OPS-SOP-0001",
    daysAgo: 2,
    themes: [
      {
        title: "Masterbatch ratio per product",
        detail:
          "Operators want the masterbatch ratio for each colour. The SOP only says to swap the masterbatch as written on the batch card, so these questions went unanswered.",
        severity: "gap",
        examples: ["Which masterbatch ratio for yellow gas pipe?", "What percentage masterbatch for blue stripes?"],
      },
      {
        title: "Which die bolt torque applies",
        detail:
          "Operators check the die bolt torque before tightening, and some ask because the supplier manual at the line gives another value. One person marked it as wrong in an Attempt.",
        severity: "unclear",
        examples: ["Is it 40 or 45 Nm for the die bolts?", "What torque for the die bolts on line 2?"],
      },
      {
        title: "Purge time and purge compound",
        detail: "The most asked topic. The purge step answers it; people ask on the floor at EXL-201 rather than open the SOP.",
        severity: "info",
        examples: ["How long do I purge after a colour change?", "Which purge compound do we use?"],
      },
    ],
  },
  {
    doc: "QCL-QA-SOP-0001",
    daysAgo: 3,
    themes: [
      {
        title: "Calibration interval of the UT-200",
        detail:
          "People ask how often to calibrate the gauge, and one marked the answer as wrong because the gauge itself says something else. The calibration section needs to be unambiguous.",
        severity: "unclear",
        examples: ["Calibrate the thickness gauge every shift or once a day?", "When do I calibrate the UT-200?"],
      },
      {
        title: "Single readings or the average",
        detail: "The tolerance table answers it, but people still ask whether a single reading just outside the limit fails the pipe.",
        severity: "unclear",
        examples: ["Do I use the mean or every single reading for the wall?", "What if one reading is just outside the wall limit?"],
      },
      {
        title: "Couplant gel for the gauge",
        detail: "The SOP mentions couplant gel but not which product to use.",
        severity: "gap",
        examples: ["Which couplant gel do we use for the UT-200?"],
      },
      {
        title: "Tolerances for SDR 17 pipe",
        detail: "Frequent lookups of the SDR 17 rows in the tolerance table. The table answers them.",
        severity: "info",
        examples: ["Which tolerance for 110 SDR 17?"],
      },
    ],
  },
]

const OPERATORS = ["Jan de Vries", "Fatima El Amrani", "Lotte Smit", "Ahmed Yilmaz", "Pieter Bakker", "Emma de Boer", "Kevin Mulder"]
const ENGINEERS = ["Sanne Visser", "Mark Jansen", "Ingrid Hoekstra", "Ruud Kok"]

async function clearSignals(ctx: MutationCtx) {
  for (const table of ["askEvents", "usageEvents", "contentFlags", "insightReports"] as const) {
    for (const row of await ctx.db.query(table).take(10000)) await ctx.db.delete(row._id)
  }
  // Proposed revisions whose document is gone (after a reseed wipe).
  for (const p of await ctx.db.query("proposedRevisions").take(2000)) {
    if (!(await ctx.db.get(p.documentId))) await ctx.db.delete(p._id)
  }
}

export const run = internalMutation({
  args: {},
  handler: async (ctx) => {
    await clearSignals(ctx)
    const now = Date.now()
    const rand = rng(20261024)
    const pick = <T,>(xs: T[]): T => xs[Math.floor(rand() * xs.length)]
    // Recent days a bit more likely, never in the future, never older than 60 days.
    const when = () => now - Math.floor(Math.pow(rand(), 1.3) * SPAN_DAYS * DAY) - Math.floor(rand() * 3600_000)

    const docs = new Map<string, Doc<"documents">>()
    for (const d of await ctx.db.query("documents").take(500)) docs.set(d.namingCode, d)
    const assets = new Map<string, Id<"assets">>()
    for (const a of await ctx.db.query("assets").take(500)) assets.set(a.code, a._id)
    const people = new Map<string, Id<"people">>()
    for (const p of await ctx.db.query("people").take(200)) people.set(p.name, p._id)
    const operators = OPERATORS.map((n) => people.get(n)).filter((x): x is Id<"people"> => x != null)
    const engineers = ENGINEERS.map((n) => people.get(n)).filter((x): x is Id<"people"> => x != null)
    const published = (code: string) => {
      const d = docs.get(code)
      return d && d.liveVersion != null && d.status !== "archived" ? d : null
    }

    // Ask: about 40% Anonymous, most on the floor.
    const asked: { doc: Id<"documents">; question: string; found: boolean }[] = []
    let askCount = 0
    for (const item of QUESTIONS) {
      const doc = item.doc ? published(item.doc) : null
      if (item.doc && !doc) continue // not in this catalogue: skip
      let scopeKind: "doc" | "asset" | "library" = item.scope.kind
      let scopeId = ""
      if (item.scope.kind === "doc") {
        if (!doc) continue
        scopeId = doc._id
      } else if (item.scope.kind === "asset") {
        const assetId = assets.get(item.scope.code)
        if (assetId) scopeId = assetId
        else scopeKind = "library"
      }
      const cited: Id<"documents">[] = []
      if (item.found && doc) {
        cited.push(doc._id)
        for (const c of item.also ?? []) {
          const o = published(c)
          if (o) cited.push(o._id)
        }
      }
      for (let i = 0; i < item.n; i++) {
        const anonymous = rand() < 0.4 || operators.length === 0
        await ctx.db.insert("askEvents", {
          at: when(),
          scopeKind,
          scopeId,
          question: item.q,
          answerFound: item.found,
          citedDocumentIds: cited,
          primaryDocumentId: scopeKind === "doc" && doc ? doc._id : (cited[0] ?? (doc?._id ?? null)),
          personId: anonymous ? null : pick(operators),
          surface: rand() < 0.8 ? "floor" : "desktop",
        })
        askCount++
        if (doc) asked.push({ doc: doc._id, question: item.q, found: item.found })
      }
    }

    // Views: mostly floor and Anonymous; Engineers read on the desktop.
    let views = 0
    for (const [code, n] of Object.entries(VIEWS)) {
      const doc = docs.get(code)
      if (!doc) continue
      for (let i = 0; i < n; i++) {
        const desk = rand() < 0.3
        await ctx.db.insert("usageEvents", {
          at: when(),
          kind: "view",
          documentId: doc._id,
          assetId: null,
          personId: desk ? (engineers.length ? pick(engineers) : null) : rand() < 0.5 && operators.length ? pick(operators) : null,
          surface: desk ? "desktop" : "floor",
        })
        views++
      }
    }
    // Scans: always on the floor.
    let scans = 0
    for (const [code, n] of Object.entries(SCANS)) {
      const assetId = assets.get(code)
      if (!assetId) continue
      for (let i = 0; i < n; i++) {
        await ctx.db.insert("usageEvents", {
          at: when(),
          kind: "scan",
          documentId: null,
          assetId,
          personId: rand() < 0.35 && operators.length ? pick(operators) : null,
          surface: "floor",
        })
        scans++
      }
    }

    let flags = 0
    for (const f of FLAGS) {
      const doc = published(f.doc)
      if (!doc) continue
      await ctx.db.insert("contentFlags", {
        documentId: doc._id,
        version: doc.liveVersion as number,
        chunkId: null,
        source: "attempt",
        attemptId: null,
        note: f.note,
        personId: people.get(f.person) ?? null,
        at: now - f.daysAgo * DAY - 3 * 3600_000,
      })
      flags++
    }

    let reports = 0
    for (const r of REPORTS) {
      const doc = published(r.doc)
      if (!doc) continue
      const mine = asked.filter((a) => a.doc === doc._id)
      const known = new Set(mine.map((a) => a.question))
      await ctx.db.insert("insightReports", {
        documentId: doc._id,
        version: doc.liveVersion as number,
        state: "ready",
        questionCount: mine.length,
        unansweredCount: mine.filter((a) => !a.found).length,
        flagCount: FLAGS.filter((f) => f.doc === r.doc).length,
        themes: r.themes
          .map((t) => ({ ...t, examples: t.examples.filter((e) => known.has(e)) }))
          .filter((t) => t.examples.length > 0),
        generatedAt: now - r.daysAgo * DAY,
        error: null,
      })
      reports++
    }

    return { askEvents: askCount, views, scans, flags, reports }
  },
})
