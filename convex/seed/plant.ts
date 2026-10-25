// Seed module: the Plant ontology and organization background (plant lane). Called by seedKnowledge after the other modules.
// Running it again replaces what it made. No AI calls.
//
// The plant of the seed, Pijpwerk Noord: a PE pressure pipe extrusion plant
// with areas MIX, EXT and QCL (namingLocations). Links go to the seeded
// Documents, Assets, Trainings and Skills by code or name; anything missing
// is skipped, so this module never fails on a partial seed. Avoid the test
// fixtures' draft-only words (docs/test-set.md) in any text here.
import { internalMutation } from "../_generated/server"
import type { MutationCtx } from "../_generated/server"
import type { Doc, Id } from "../_generated/dataModel"

type Kind = Doc<"plantItems">["kind"]
type RelType = Doc<"plantRelations">["type"]

type ItemSeed = {
  key: string
  kind: Kind
  name: string
  code?: string
  area?: "MIX" | "EXT" | "QCL"
  description: string
  synonyms?: string[]
  docs?: string[]
  assets?: string[]
  trainings?: string[]
  skills?: string[]
}

const PROFILE = {
  about:
    "Pijpwerk Noord makes polyethylene (PE100) pressure pipe for drinking water and gas networks in the Netherlands and the north of Germany. One site with three areas: mixing, extrusion and a quality lab. About 85 people work in three shifts, five days a week, with a small weekend crew.",
  history:
    "Founded in 1987 as a family company making PVC drainage pipe. Moved to PE pressure pipe in 2004 when extrusion line 1 came in. Line 2, a Krauss KX-60, was added in 2019 for 32 to 110 mm pipe and coils. Part of a mid-sized Dutch industrial group since 2021, still run from the site.",
  productsAndCustomers:
    "PE100 SDR11 and SDR17 pressure pipe from 32 to 110 mm, as straight lengths of 6 m and 12 m and as coils of 50 m and 100 m. Customers are water companies, gas network operators and wholesalers for installers. Most sizes are made to stock; large network projects are made to order.",
  qualityPolicy:
    "Every pipe that leaves the plant can be traced to its batch, line and shift. Wall thickness and outside diameter are measured at fixed moments, and pipe outside tolerance goes to quarantine until Quality releases or scraps it. Safety comes before output: anyone may stop the line.",
  certifications: [
    "ISO 9001:2015",
    "ISO 14001:2015",
    "KOMO product certificate for pressure pipe",
    "VCA** for contractor safety",
  ],
  headcount: 85,
  keyFacts: [
    { label: "Founded", value: "1987" },
    { label: "Shifts", value: "Early, late and night, Monday to Friday" },
    { label: "Output", value: "About 9,000 tonnes of PE pipe a year" },
    { label: "Extrusion lines", value: "2 (line 2 is in Oppr)" },
    { label: "Languages on the floor", value: "Dutch and English" },
  ],
}

const AREA_INFO: Record<string, string> = {
  MIX: "Hall 1. Granulate silos, the batch mixer and the dryer. Prepares dry, coloured PE granulate for line 2.",
  EXT: "Hall 2. Extrusion line 2 from extruder to coiler, plus the older line 1 that is not in Oppr yet.",
  QCL: "The quality lab next to Hall 2. Measures wall thickness and diameter, keeps the quarantine area and releases pipe.",
}

const ITEMS: ItemSeed[] = [
  // Sites and lines
  {
    key: "site",
    kind: "site",
    name: "Pijpwerk Noord main site",
    code: "PWN",
    description: "The only production site: two halls, the quality lab, a granulate silo yard and the finished pipe yard.",
  },
  {
    key: "lineMix",
    kind: "line",
    name: "Mixing and drying",
    area: "MIX",
    description: "Mixes PE100 granulate with colour masterbatch and dries it before it is conveyed to line 2.",
    assets: ["MXR-101", "DRY-102"],
  },
  {
    key: "line2",
    kind: "line",
    name: "Extrusion line 2",
    code: "L2",
    area: "EXT",
    description: "Krauss KX-60 line for PE100 pressure pipe from 32 to 110 mm: extruder, vacuum calibration tank, haul-off and saw, coiler.",
    synonyms: ["Lijn 2", "L2"],
    assets: ["EXL-201", "VAC-203", "SAW-202", "CLR-204"],
    docs: ["EXT-OPS-SOP-0002", "EXT-OPS-SOP-0003"],
  },
  {
    key: "line1",
    kind: "line",
    name: "Extrusion line 1",
    code: "L1",
    area: "EXT",
    description: "The older line for 20 to 63 mm pipe. Runs on its own paper instructions and is not in Oppr yet.",
    synonyms: ["Lijn 1", "L1"],
  },
  {
    key: "lab",
    kind: "line",
    name: "Measuring station",
    area: "QCL",
    description: "The lab bench where pipe ends are measured for wall thickness and outside diameter.",
    assets: ["QCL-301"],
  },

  // Processes
  {
    key: "mixing",
    kind: "process",
    name: "Batch mixing",
    area: "MIX",
    description: "Weighing PE100 granulate and colour masterbatch and blending them in the batch mixer for line 2.",
    synonyms: ["Mengen"],
    docs: ["MIX-OPS-WI-0001", "MIX-OPS-SOP-0001"],
    assets: ["MXR-101"],
    trainings: ["MIX-TRN-0001"],
    skills: ["Batch mixing"],
  },
  {
    key: "drying",
    kind: "process",
    name: "Granulate drying",
    area: "MIX",
    description: "Drying the granulate in the desiccant dryer so no moisture reaches the extruder.",
    synonyms: ["Drogen"],
    docs: ["MIX-OPS-SOP-0002"],
    assets: ["DRY-102"],
    skills: ["Granulate drying"],
  },
  {
    key: "extrusion",
    kind: "process",
    name: "Pipe extrusion",
    area: "EXT",
    description: "Melting the granulate in the extruder and pressing it through the die head into a pipe. Covers start-up from cold and shutdown.",
    synonyms: ["Extruderen"],
    docs: ["EXT-OPS-SOP-0002", "EXT-OPS-SOP-0003"],
    assets: ["EXL-201"],
    skills: ["Operate extrusion line 2"],
  },
  {
    key: "calibration",
    kind: "process",
    name: "Vacuum calibration and cooling",
    area: "EXT",
    description: "Sizing the hot pipe in the sizing sleeve under vacuum and cooling it with water sprays.",
    synonyms: ["Kalibreren", "Koelen"],
    docs: ["EXT-OPS-WI-0002"],
    assets: ["VAC-203"],
    skills: ["Vacuum tank setup"],
  },
  {
    key: "cutting",
    kind: "process",
    name: "Haul-off and cutting",
    area: "EXT",
    description: "Pulling the pipe at a steady speed with the caterpillar haul-off and cutting it to length with the planetary saw.",
    synonyms: ["Aftrekken en zagen"],
    docs: ["EXT-OPS-WI-0001"],
    assets: ["SAW-202"],
  },
  {
    key: "coiling",
    kind: "process",
    name: "Coiling",
    area: "EXT",
    description: "Winding 32 to 63 mm pipe into coils, strapping and labelling each coil.",
    synonyms: ["Haspelen", "Wikkelen"],
    docs: ["EXT-OPS-WI-0003"],
    assets: ["CLR-204"],
  },
  {
    key: "changeover",
    kind: "process",
    name: "Colour and product changeover",
    area: "EXT",
    description: "Switching line 2 to another colour, diameter or wall thickness, including purging the old material.",
    synonyms: ["Omstellen", "Kleurwissel"],
    docs: ["EXT-OPS-SOP-0001"],
    trainings: ["EXT-TRN-0001"],
    skills: ["Colour and product changeover line 2"],
  },
  {
    key: "screen",
    kind: "process",
    name: "Screen pack change",
    area: "EXT",
    description: "Replacing the screen pack that filters the melt before the die head when the melt pressure rises.",
    synonyms: ["Zeefwissel"],
    docs: ["EXT-MNT-SOP-0001"],
    assets: ["EXL-201"],
    trainings: ["EXT-TRN-0003"],
    skills: ["Screen pack change"],
  },
  {
    key: "measuring",
    kind: "process",
    name: "Wall thickness and diameter check",
    area: "QCL",
    description: "Measuring wall thickness at 8 points around the pipe end and the outside diameter, and recording the result.",
    synonyms: ["Wanddiktemeting", "Maatcontrole"],
    docs: ["QCL-QA-SOP-0001", "QCL-QA-MAN-0001"],
    assets: ["QCL-301"],
    trainings: ["QCL-TRN-0001"],
    skills: ["Wall thickness measurement"],
  },
  {
    key: "quarantine",
    kind: "process",
    name: "Quarantine and release",
    area: "QCL",
    description: "Blocking pipe that is outside tolerance, deciding to release or scrap it, and recording the decision.",
    synonyms: ["Blokkeren en vrijgeven"],
    docs: ["QCL-QA-WI-0001"],
  },

  // Products
  {
    key: "lengths",
    kind: "product",
    name: "PE100 pressure pipe, straight lengths",
    description: "Black pipe with blue stripes for drinking water, 32 to 110 mm, SDR11 and SDR17, in lengths of 6 m and 12 m.",
    synonyms: ["Drinkwaterbuis", "Stangen"],
  },
  {
    key: "coils",
    kind: "product",
    name: "PE100 pressure pipe, coils",
    description: "32 to 63 mm pipe in coils of 50 m or 100 m, strapped in 4 places and labelled.",
    synonyms: ["Rollen", "Haspels"],
    docs: ["EXT-OPS-WI-0003"],
  },
  {
    key: "gas",
    kind: "product",
    name: "PE100 gas pipe",
    description: "Black pipe with yellow stripes for gas networks, made on line 1 in batches to order.",
    synonyms: ["Gasbuis"],
  },

  // Materials
  {
    key: "pe100",
    kind: "material",
    name: "PE100 granulate",
    area: "MIX",
    description: "The base material: high-density polyethylene granulate, delivered by silo truck and stored in the granulate silos.",
    synonyms: ["HDPE", "Granulaat", "Polyetheen"],
    docs: ["MIX-OPS-SOP-0002"],
  },
  {
    key: "masterbatch",
    kind: "material",
    name: "Colour masterbatch",
    area: "MIX",
    description: "Concentrated colour pellets mixed into the granulate, blue for water pipe and yellow for gas pipe.",
    synonyms: ["MB", "Kleurconcentraat"],
    docs: ["MIX-OPS-WI-0001", "MIX-HSE-LMRA-0001"],
  },
  {
    key: "purge",
    kind: "material",
    name: "Purge compound",
    area: "EXT",
    description: "A cleaning compound run through the extruder at a colour or product changeover to push out the old material.",
    synonyms: ["Spoelmiddel", "Purge"],
    docs: ["EXT-OPS-SOP-0001"],
  },
  {
    key: "water",
    kind: "material",
    name: "Cooling water",
    area: "EXT",
    description: "Process water sprayed on the pipe in the vacuum calibration tank.",
    synonyms: ["Koelwater"],
    docs: ["EXT-OPS-WI-0002"],
  },
  {
    key: "couplant",
    kind: "material",
    name: "Couplant gel",
    area: "QCL",
    description: "Gel between the ultrasonic probe and the pipe so the sound passes into the wall.",
    synonyms: ["Koppelgel", "Koppelmiddel"],
    docs: ["QCL-QA-MAN-0001"],
  },

  // Hazards
  {
    key: "hot",
    kind: "hazard",
    name: "Hot surfaces and molten plastic",
    area: "EXT",
    description: "The barrel, die head and melt are far above 200 °C. Contact or a spray of melt causes serious burns.",
    synonyms: ["Hete delen", "Verbranding"],
    docs: ["EXT-HSE-LMRA-0001", "EXT-HSE-SOP-0002"],
    skills: ["Working at the hot die head"],
  },
  {
    key: "energy",
    kind: "hazard",
    name: "Unexpected start-up and stored energy",
    area: "EXT",
    description: "Drives, heaters, pressure and vacuum can start or release during work on the line unless it is locked out.",
    synonyms: ["Onverwacht starten", "LOTO"],
    docs: ["EXT-HSE-SOP-0001"],
    trainings: ["EXT-TRN-0002"],
    skills: ["Lockout/tagout line 2"],
  },
  {
    key: "dust",
    kind: "hazard",
    name: "Dust and masterbatch handling",
    area: "MIX",
    description: "Fine dust when filling the mixer and opening bags, which irritates the eyes and airways.",
    synonyms: ["Stof"],
    docs: ["MIX-HSE-LMRA-0001"],
  },
  {
    key: "moving",
    kind: "hazard",
    name: "Moving parts and the saw",
    area: "EXT",
    description: "The haul-off tracks and the planetary saw can trap hands. Only work behind closed guards.",
    synonyms: ["Bewegende delen", "Knelgevaar"],
    assets: ["SAW-202"],
  },
  {
    key: "loads",
    kind: "hazard",
    name: "Heavy coils and pipe bundles",
    area: "EXT",
    description: "Coils and bundles are moved with a forklift or crane. Never stand under a load.",
    synonyms: ["Zware lasten"],
    assets: ["CLR-204"],
  },
  {
    key: "noise",
    kind: "hazard",
    name: "Noise",
    description: "Noise in Hall 2 is above 80 dB(A) near the saw and the extruder. Hearing protection is required there.",
    synonyms: ["Geluid", "Lawaai"],
  },

  // Roles and teams
  {
    key: "operator",
    kind: "role",
    name: "Line operator",
    area: "EXT",
    description: "Runs extrusion line 2 during a shift: start-up, changeovers, checks and first-line fixes.",
    synonyms: ["Lijnoperator"],
    skills: ["Operate extrusion line 2", "Colour and product changeover line 2", "Lockout/tagout line 2"],
  },
  {
    key: "mixer",
    kind: "role",
    name: "Mixing operator",
    area: "MIX",
    description: "Prepares the granulate for line 2: drying, weighing and mixing batches.",
    synonyms: ["Menger"],
    skills: ["Batch mixing", "Granulate drying"],
  },
  {
    key: "labtech",
    kind: "role",
    name: "Quality lab technician",
    area: "QCL",
    description: "Measures pipe, keeps the quarantine area and records results.",
    synonyms: ["Laborant"],
    skills: ["Wall thickness measurement"],
  },
  {
    key: "shiftlead",
    kind: "role",
    name: "Shift leader",
    description: "Leads one shift, hands over to the next shift and decides when to stop a line.",
    synonyms: ["Ploegleider", "Ploegchef"],
  },
  {
    key: "process",
    kind: "role",
    name: "Process engineer",
    description: "Owns the settings and the operating documents of the lines and approves changes to them.",
    synonyms: ["Procesingenieur"],
  },
  {
    key: "maint",
    kind: "role",
    name: "Maintenance and safety engineer",
    description: "Plans maintenance and owns lockout/tagout and the safety documents.",
    synonyms: ["TD", "Technische dienst"],
  },
  {
    key: "qm",
    kind: "role",
    name: "Quality manager",
    description: "Owns the quality system and the ISO 9001 certificate, and releases or scraps quarantined pipe.",
    synonyms: ["QA-manager", "Kwaliteitsmanager"],
  },
  {
    key: "early",
    kind: "team",
    name: "Early shift",
    description: "06:00 to 14:00. Takes over from the night shift.",
    synonyms: ["Vroege dienst", "Ochtenddienst"],
  },
  {
    key: "late",
    kind: "team",
    name: "Late shift",
    description: "14:00 to 22:00.",
    synonyms: ["Late dienst", "Middagdienst"],
  },
  {
    key: "night",
    kind: "team",
    name: "Night shift",
    description: "22:00 to 06:00, with a smaller crew on line 2 only.",
    synonyms: ["Nachtdienst"],
  },
  {
    key: "maintTeam",
    kind: "team",
    name: "Maintenance team",
    description: "Day-time technicians, with one on call outside office hours.",
    synonyms: ["Technische dienst", "TD"],
  },

  // Glossary
  { key: "t-die", kind: "term", name: "Die head", description: "The tool at the front of the extruder that shapes the melt into a pipe.", synonyms: ["Matrijs", "Spuitkop", "Kop"], docs: ["EXT-HSE-LMRA-0001"] },
  { key: "t-barrel", kind: "term", name: "Barrel", description: "The heated tube around the screw where the granulate melts.", synonyms: ["Cilinder"] },
  { key: "t-screw", kind: "term", name: "Screw", description: "The turning screw inside the barrel that conveys and melts the granulate.", synonyms: ["Schroef", "Worm"] },
  { key: "t-screen", kind: "term", name: "Screen pack", description: "Fine metal screens in front of the die head that filter dirt from the melt.", synonyms: ["Zeefpakket", "Zeef"], docs: ["EXT-MNT-SOP-0001"] },
  { key: "t-melt", kind: "term", name: "Melt", description: "The molten plastic between the screw and the die head.", synonyms: ["Smelt"] },
  { key: "t-haul", kind: "term", name: "Haul-off", description: "The machine with rubber tracks that pulls the pipe through the line at a steady speed.", synonyms: ["Rupsaftrek", "Aftrek", "Caterpillar"] },
  { key: "t-sleeve", kind: "term", name: "Sizing sleeve", description: "The ring in the vacuum tank that gives the pipe its outside diameter.", synonyms: ["Kalibreerhuls", "Kalibrator"] },
  { key: "t-vac", kind: "term", name: "Vacuum calibration tank", description: "The water tank under vacuum where the pipe is sized and cooled.", synonyms: ["Vacuümbak", "Kalibreerbak", "VAC"] },
  { key: "t-coiler", kind: "term", name: "Coiler", description: "The machine at the end of the line that winds pipe into coils.", synonyms: ["Haspel", "Wikkelaar"] },
  { key: "t-sdr", kind: "term", name: "SDR", description: "Standard Dimension Ratio: the outside diameter divided by the wall thickness. A lower SDR means a thicker wall.", synonyms: ["Standard Dimension Ratio"] },
  { key: "t-od", kind: "term", name: "OD", description: "Outside diameter of the pipe, measured on the pipe end.", synonyms: ["Outside diameter", "Buitendiameter"], docs: ["QCL-QA-SOP-0001"] },
  { key: "t-wall", kind: "term", name: "Wall thickness", description: "The thickness of the pipe wall, measured at 8 points around the end.", synonyms: ["Wanddikte"], docs: ["QCL-QA-SOP-0001"] },
  { key: "t-pe100", kind: "term", name: "PE100", description: "The strength class of polyethylene used for pressure pipe.", synonyms: ["PE 100", "Polyethyleen 100"] },
  { key: "t-mb", kind: "term", name: "Masterbatch", description: "Concentrated colour pellets mixed into the base granulate.", synonyms: ["MB", "Kleurconcentraat"] },
  { key: "t-dew", kind: "term", name: "Dew point", description: "How dry the drying air is. The dryer display shows it; a lower value means drier air.", synonyms: ["Dauwpunt"], docs: ["MIX-OPS-SOP-0002"] },
  { key: "t-change", kind: "term", name: "Changeover", description: "Switching a line to another colour, size or product.", synonyms: ["Omstelling", "Ombouw"], docs: ["EXT-OPS-SOP-0001"] },
  { key: "t-purge", kind: "term", name: "Purging", description: "Running purge compound or new material through the extruder until the old colour is gone.", synonyms: ["Spoelen", "Doorspoelen"] },
  { key: "t-loto", kind: "term", name: "LOTO", description: "Lockout/tagout: switching off and locking every energy source before work on a machine.", synonyms: ["Lockout/tagout", "Vergrendelen en labelen"], docs: ["EXT-HSE-SOP-0001"] },
  { key: "t-lmra", kind: "term", name: "LMRA", description: "Last Minute Risk Analysis: a short check of the risks right before a job starts.", synonyms: ["Last Minute Risk Analysis", "Laatste-minuut-risicoanalyse"], docs: ["EXT-HSE-LMRA-0001", "MIX-HSE-LMRA-0001"] },
  { key: "t-nc", kind: "term", name: "Non-conforming pipe", description: "Pipe outside tolerance. It goes to quarantine until Quality decides.", synonyms: ["Afkeur", "NC-buis"], docs: ["QCL-QA-WI-0001"] },
  { key: "t-quar", kind: "term", name: "Quarantine", description: "The marked area and status for pipe that may not be shipped until it is released.", synonyms: ["Quarantaine", "Blokkade", "Geblokkeerd"], docs: ["QCL-QA-WI-0001"] },
  { key: "t-couplant", kind: "term", name: "Couplant", description: "Gel that lets ultrasound pass from the probe into the pipe wall.", synonyms: ["Koppelgel", "Koppelmiddel"] },
  { key: "t-handover", kind: "term", name: "Shift handover", description: "The short talk at the start of a shift about what happened and what is open.", synonyms: ["Ploegoverdracht", "Overdracht"] },
  { key: "t-batch", kind: "term", name: "Batch", description: "One load of the mixer: granulate and masterbatch mixed in one go.", synonyms: ["Charge", "Menging"], docs: ["MIX-OPS-WI-0001"] },
]

const RELATIONS: [string, RelType, string][] = [
  ["mixing", "feeds", "drying"],
  ["drying", "feeds", "extrusion"],
  ["extrusion", "feeds", "calibration"],
  ["calibration", "feeds", "cutting"],
  ["cutting", "feeds", "coiling"],
  ["mixing", "runs_on", "lineMix"],
  ["drying", "runs_on", "lineMix"],
  ["extrusion", "runs_on", "line2"],
  ["calibration", "runs_on", "line2"],
  ["cutting", "runs_on", "line2"],
  ["coiling", "runs_on", "line2"],
  ["changeover", "runs_on", "line2"],
  ["screen", "runs_on", "line2"],
  ["measuring", "runs_on", "lab"],
  ["mixing", "uses", "pe100"],
  ["mixing", "uses", "masterbatch"],
  ["drying", "uses", "pe100"],
  ["changeover", "uses", "purge"],
  ["calibration", "uses", "water"],
  ["measuring", "uses", "couplant"],
  ["extrusion", "produces", "lengths"],
  ["coiling", "produces", "coils"],
  ["cutting", "produces", "lengths"],
  ["extrusion", "has_hazard", "hot"],
  ["screen", "has_hazard", "hot"],
  ["screen", "has_hazard", "energy"],
  ["changeover", "has_hazard", "hot"],
  ["mixing", "has_hazard", "dust"],
  ["cutting", "has_hazard", "moving"],
  ["cutting", "has_hazard", "noise"],
  ["coiling", "has_hazard", "loads"],
  ["extrusion", "done_by", "operator"],
  ["changeover", "done_by", "operator"],
  ["screen", "done_by", "operator"],
  ["calibration", "done_by", "operator"],
  ["mixing", "done_by", "mixer"],
  ["drying", "done_by", "mixer"],
  ["measuring", "done_by", "labtech"],
  ["quarantine", "done_by", "qm"],
  ["operator", "part_of", "early"],
  ["operator", "part_of", "late"],
  ["operator", "part_of", "night"],
  ["maint", "part_of", "maintTeam"],
  ["line2", "part_of", "site"],
  ["lineMix", "part_of", "site"],
  ["t-die", "related_to", "hot"],
  ["t-screen", "related_to", "screen"],
  ["t-sdr", "related_to", "lengths"],
  ["t-loto", "related_to", "energy"],
  ["t-purge", "related_to", "changeover"],
  ["t-nc", "related_to", "quarantine"],
  ["t-wall", "related_to", "measuring"],
]

const PLANT_TABLES = ["plantProposals", "plantRelations", "plantAreas", "plantItems", "plantProfile"] as const

async function clear(ctx: MutationCtx) {
  for (const t of PLANT_TABLES) {
    for (const row of await ctx.db.query(t).take(4000)) await ctx.db.delete(row._id)
  }
}

export const run = internalMutation({
  args: {},
  handler: async (ctx) => {
    await clear(ctx)
    const now = Date.now()

    const docId = async (code: string) =>
      (await ctx.db.query("documents").withIndex("by_namingCode", (q) => q.eq("namingCode", code)).first())?._id
    const assetId = async (code: string) =>
      (await ctx.db.query("assets").withIndex("by_code", (q) => q.eq("code", code)).first())?._id
    const trainings = await ctx.db.query("trainings").take(500)
    const skills = await ctx.db.query("skills").take(500)
    const resolve = async <T>(keys: string[] | undefined, f: (k: string) => Promise<T | undefined> | T | undefined) => {
      const out: T[] = []
      for (const k of keys ?? []) {
        const id = await f(k)
        if (id) out.push(id)
      }
      return out
    }

    await ctx.db.insert("plantProfile", { ...PROFILE, updatedAt: now, updatedByPersonId: null })

    const ids = new Map<string, Id<"plantItems">>()
    const order = new Map<Kind, number>()
    let links = 0
    for (const s of ITEMS) {
      const n = (order.get(s.kind) ?? 0) + 1
      order.set(s.kind, n)
      const item = {
        kind: s.kind,
        name: s.name,
        code: s.code ?? null,
        description: s.description,
        areaCode: s.area ?? null,
        synonyms: s.synonyms ?? [],
        links: {
          documentIds: await resolve(s.docs, docId),
          assetIds: await resolve(s.assets, assetId),
          trainingIds: await resolve(s.trainings, (c) => trainings.find((t) => t.code === c)?._id),
          skillIds: await resolve(s.skills, (name) => skills.find((k) => k.name === name)?._id),
        },
        source: "seed" as const,
        sortOrder: n,
        updatedAt: now,
      }
      links +=
        item.links.documentIds.length + item.links.assetIds.length + item.links.trainingIds.length + item.links.skillIds.length
      ids.set(s.key, await ctx.db.insert("plantItems", item))
    }

    const siteId = ids.get("site") ?? null
    const areas = await ctx.db.query("namingLocations").take(200)
    for (const a of areas) {
      await ctx.db.insert("plantAreas", {
        areaCode: a.code,
        description: AREA_INFO[a.code] ?? "",
        siteId,
      })
    }

    let relations = 0
    for (const [from, type, to] of RELATIONS) {
      const fromId = ids.get(from)
      const toId = ids.get(to)
      if (!fromId || !toId) continue
      await ctx.db.insert("plantRelations", { fromId, toId, type })
      relations += 1
    }

    return { items: ITEMS.length, areas: areas.length, relations, links }
  },
})
