// The plant Pijpwerk Noord as seed data (docs/build/full-showcase-plan.md,
// content catalogue; docs/build/plant-facts.md). Pure data, no Convex
// imports: seedKnowledge.ts writes it, media.ts generates its images.
import { p, type ImageSpec, type Node, type SeedDoc, type SupplierManual } from "./builders"
import { SEED_DOCS as NATIVE_DOCS } from "./docs/index"
import { SEED_MANUALS } from "./manuals/index"

export { SEED_MANUALS }

// One Significant change that is already Published, so "re-train needed"
// shows from the start (the in-review v2 of EXT-MNT-SOP-0001 stays for the
// live demo). MIX-OPS-SOP-0002 v2 adds the sample cup check to the
// procedure before release. Its Skill (Granulate drying) has no Training,
// so an Engineer confirms the re-training of its holders (Pieter, Emma).
const SAMPLE_STEP_BEFORE = "Sign the hopper card of DRY-102 as released"
const SAMPLE_STEP =
  "Fill the sample cup at the slide gate of DRY-102 and check that the granulate is free flowing, with no lumps, no dust and no yellowing. Do not release granulate that fails this check."

function textOf(n: Node): string {
  return (n.text ?? "") + (n.content ?? []).map(textOf).join("")
}

function withSampleCheck(body: Node): Node | null {
  const copy: Node = JSON.parse(JSON.stringify(body))
  let added = false
  const visit = (n: Node) => {
    if (added) return
    if (n.type === "stepList" && n.content) {
      const at = n.content.findIndex((item) => textOf(item).startsWith(SAMPLE_STEP_BEFORE))
      if (at >= 0) {
        n.content.splice(at, 0, { type: "stepItem", content: [p(SAMPLE_STEP)] })
        added = true
        return
      }
    }
    for (const c of n.content ?? []) visit(c)
  }
  visit(copy)
  return added ? copy : null
}

function withPublishedRevision(d: SeedDoc): SeedDoc {
  // Only while the document has a single Published edition of its own.
  if (d.code !== "MIX-OPS-SOP-0002" || d.editions.length !== 1) return d
  const first = d.editions[0]
  const v2 = first.publishedDaysAgo != null && first.publishedDaysAgo > 12 ? withSampleCheck(first.body) : null
  if (!v2) return d
  return {
    ...d,
    editions: [
      first,
      {
        body: v2,
        publishedDaysAgo: 12,
        significantChange: true,
        changeNote:
          "Added a step before release: check the dried granulate in the sample cup, and do not release granulate that fails the check.",
      },
    ],
  }
}

// The Documents the line 2 safety round (EXT-TRN-0002, Published 500 days
// ago) cites were Published before it: a Training can only cite Published
// Knowledge. Their periodic review dates stay as they are: seedKnowledge
// derives the last confirmation from the next review date, so the review
// story (EXT-HSE-SOP-0001 is 10 days overdue) does not change.
const FIRST_PUBLISHED_DAYS_AGO: Record<string, number> = {
  "EXT-HSE-SOP-0001": 520,
  "EXT-HSE-LMRA-0001": 520,
  "EXT-OPS-WI-0002": 520,
}

function withFirstPublished(d: SeedDoc): SeedDoc {
  const days = FIRST_PUBLISHED_DAYS_AGO[d.code]
  const first = d.editions[0]
  if (days == null || first.publishedDaysAgo == null || first.publishedDaysAgo >= days) return d
  return { ...d, editions: [{ ...first, publishedDaysAgo: days }, ...d.editions.slice(1)] }
}

export const SEED_DOCS: SeedDoc[] = NATIVE_DOCS.map(withFirstPublished).map(withPublishedRevision)

export const SITE = "PWN"

export const AREAS: { code: "MIX" | "EXT" | "QCL"; label: string }[] = [
  { code: "MIX", label: "Hall 1 · Mixing" },
  { code: "EXT", label: "Hall 2 · Extrusion" },
  { code: "QCL", label: "Quality lab" },
]

export const DISCIPLINES: { code: string; label: string }[] = [
  { code: "OPS", label: "Operations" },
  { code: "MNT", label: "Maintenance" },
  { code: "HSE", label: "Health and safety" },
  { code: "QA", label: "Quality" },
]

export const TYPES = [
  { slug: "sop", token: "SOP", label: "SOP", icon: "FileText", color: "sky" },
  { slug: "manual", token: "MAN", label: "Manual", icon: "BookOpen", color: "violet" },
  { slug: "work_instruction", token: "WI", label: "Work instruction", icon: "ListChecks", color: "emerald" },
  { slug: "lmra", token: "LMRA", label: "LMRA", icon: "ShieldAlert", color: "rose" },
]

export interface PersonSeed {
  name: string
  kind: "operator" | "engineer"
  role: string
  area: string | null
}

// Check-in identities. Names are what other seed modules look people up by.
// Shifts (plant facts): early 06:00-14:00, late 14:00-22:00, night
// 22:00-06:00. convex/skills.ts shiftOf reads the shift from the role text.
export const PEOPLE: PersonSeed[] = [
  { name: "Jan de Vries", kind: "operator", role: "Line operator, night shift", area: "EXT" },
  { name: "Fatima El Amrani", kind: "operator", role: "Line operator, early shift", area: "EXT" },
  { name: "Lotte Smit", kind: "operator", role: "Line operator, early shift (new starter)", area: "EXT" },
  { name: "Ahmed Yilmaz", kind: "operator", role: "Line operator, late shift", area: "EXT" },
  { name: "Pieter Bakker", kind: "operator", role: "Mixing operator, early shift", area: "MIX" },
  { name: "Emma de Boer", kind: "operator", role: "Mixing operator, late shift", area: "MIX" },
  { name: "Kevin Mulder", kind: "operator", role: "Quality lab technician, early shift", area: "QCL" },
  { name: "Sanne Visser", kind: "engineer", role: "Process engineer", area: null },
  { name: "Mark Jansen", kind: "engineer", role: "Maintenance and safety engineer", area: null },
  { name: "Ingrid Hoekstra", kind: "engineer", role: "Quality manager", area: null },
  { name: "Ruud Kok", kind: "engineer", role: "Plant manager", area: null },
]

export interface AssetSeed {
  code: string
  name: string
  area: "MIX" | "EXT" | "QCL"
  description: string
  // Pin position in percent over the site plan (the Floor simulator draws
  // its own plan; these follow the line flow left to right).
  pinX: number
  pinY: number
  photo: ImageSpec
}

const photo = (code: string, prompt: string): ImageSpec => ({
  key: `asset/${code}`,
  prompt,
  style: "photo",
})

export const ASSETS: AssetSeed[] = [
  {
    code: "MXR-101",
    name: "Batch mixer",
    area: "MIX",
    description: "Vortex HM-500 high-speed batch mixer. Blends PE granulate with colour masterbatch for line 2, at most 250 kg per batch.",
    pinX: 12,
    pinY: 34,
    photo: photo(
      "MXR-101",
      "a stainless steel high-speed batch mixer for plastic granulate standing on a steel platform: cylindrical mixing vessel with a hinged lid, a filling chute on top, a drive motor with belt guard underneath, a discharge valve leading into a transfer pipe, a small grey control panel beside it, bags of granulate on a pallet nearby",
    ),
  },
  {
    code: "DRY-102",
    name: "Granulate dryer",
    area: "MIX",
    description: "Desiccant dryer for PE granulate. Dries at 80 °C for at least 4 hours to a dew point of -40 °C or lower.",
    pinX: 26,
    pinY: 64,
    photo: photo(
      "DRY-102",
      "an industrial desiccant dryer for plastic granulate: a tall insulated stainless steel drying hopper on legs, a compact dryer cabinet with a digital display beside it, flexible conveying hoses running from the hopper towards an extruder, clean painted concrete floor",
    ),
  },
  {
    code: "EXL-201",
    name: "Pipe extruder line 2",
    area: "EXT",
    description: "Krauss KX-60 single-screw extruder, 60 mm screw, 30 L/D. Produces PE100 pressure pipe from 32 to 110 mm on line 2.",
    pinX: 40,
    pinY: 50,
    photo: photo(
      "EXL-201",
      "a single-screw plastic pipe extruder in a factory hall: long horizontal barrel with silver heater bands and cooling fans, a material hopper on top of the feed throat, a drive motor and gearbox at the back, a round pipe die head at the front with a black plastic pipe coming out of it, a control panel with a screen on the side",
    ),
  },
  {
    code: "VAC-203",
    name: "Vacuum calibration tank line 2",
    area: "EXT",
    description: "Vacuum calibration tank with sizing sleeve and spray cooling. Runs at -0.3 bar with cooling water of 15-20 °C.",
    pinX: 55,
    pinY: 50,
    photo: photo(
      "VAC-203",
      "a long stainless steel vacuum calibration tank for plastic pipe extrusion with a hinged lid and inspection windows, a black plastic pipe running through it, water spray visible through the windows, a vacuum gauge and water hoses on the side, directly behind a pipe extruder die",
    ),
  },
  {
    code: "SAW-202",
    name: "Haul-off and cutting saw line 2",
    area: "EXT",
    description: "Nordcut HC-110 caterpillar haul-off and PS-110 planetary saw. Pulls the pipe and cuts it to 6 m or 12 m lengths (±10 mm).",
    pinX: 70,
    pinY: 50,
    photo: photo(
      "SAW-202",
      "a caterpillar haul-off for plastic pipe with three rubber-padded tracks gripping a black pipe, followed by a planetary pipe saw inside a closed guard housing with a window, painted machine frames in a clean extrusion hall",
    ),
  },
  {
    code: "CLR-204",
    name: "Pipe coiler line 2",
    area: "EXT",
    description: "Pipe coiler for 32-63 mm pipe in coils of 50 m or 100 m. Each coil is strapped in 4 places and labelled.",
    pinX: 86,
    pinY: 42,
    photo: photo(
      "CLR-204",
      "a pipe coiling machine at the end of a plastic pipe extrusion line winding black plastic pipe with blue stripes onto a large rotating drum, a traverse guide moving the pipe across the drum, a finished coil of pipe strapped on a pallet beside it",
    ),
  },
  {
    code: "QCL-301",
    name: "Ultrasonic wall thickness gauge",
    area: "QCL",
    description: "Sonatek UT-200 ultrasonic thickness gauge with step block. Measures wall thickness at 8 points around each pipe end.",
    pinX: 86,
    pinY: 14,
    photo: photo(
      "QCL-301",
      "a handheld ultrasonic wall thickness gauge with a probe on a cable lying on a laboratory bench next to short cut sections of black plastic pipe, a small steel step block and a tube of couplant gel, a quality laboratory with a measuring table in the background",
    ),
  },
]

/** Every image the seed uses: document images, manual figures, asset photos. */
export function allImageSpecs(): ImageSpec[] {
  const out: ImageSpec[] = []
  const seen = new Set<string>()
  const push = (s: ImageSpec) => {
    if (seen.has(s.key)) return
    seen.add(s.key)
    out.push(s)
  }
  for (const d of SEED_DOCS) d.images.forEach(push)
  for (const m of SEED_MANUALS) m.images.forEach(push)
  for (const a of ASSETS) push(a.photo)
  return out
}

/** The edition that is live (the last one with a publish date), 1-based. */
export function liveEdition(d: { editions: { publishedDaysAgo: number | null }[] }): number | null {
  let live: number | null = null
  d.editions.forEach((e, i) => {
    if (e.publishedDaysAgo != null) live = i + 1
  })
  return live
}

export function manualByCode(code: string): SupplierManual | undefined {
  return SEED_MANUALS.find((m) => m.code === code)
}

// Who wrote, reviewed and approved each discipline's Documents. Engineers
// sign by name; the seed resolves them to people ids.
export const SIGNERS: Record<string, { author: string; reviewer: string; approver: string }> = {
  OPS: { author: "Sanne Visser", reviewer: "Mark Jansen", approver: "Ingrid Hoekstra" },
  MNT: { author: "Mark Jansen", reviewer: "Sanne Visser", approver: "Ingrid Hoekstra" },
  HSE: { author: "Mark Jansen", reviewer: "Sanne Visser", approver: "Ruud Kok" },
  QA: { author: "Ingrid Hoekstra", reviewer: "Sanne Visser", approver: "Ruud Kok" },
}

export interface WikiSeed {
  title: string
  purpose: string
  scope: { areas: string[]; disciplines: string[]; assetCodes: string[]; documentCodes: string[] }
}

export const WIKIS: WikiSeed[] = [
  {
    // devChecks check 6 looks this Wiki up by title.
    title: "Line 2 changeover essentials",
    purpose:
      "For operators on extrusion line 2 who do a colour or product changeover, especially on the night shift.",
    scope: { areas: [], disciplines: [], assetCodes: ["EXL-201"], documentCodes: [] },
  },
  {
    title: "Quality lab: measuring and releasing pipe",
    purpose:
      "For quality lab technicians and shift leaders: how pipe from line 2 is measured, which tolerances apply and how non-conforming pipe is quarantined and released.",
    scope: { areas: ["QCL"], disciplines: [], assetCodes: [], documentCodes: [] },
  },
  {
    title: "Night shift safety on line 2",
    purpose:
      "For operators on the night shift of line 2, when fewer people are around: lockout, hot work at the die head and what to do after a burn.",
    scope: { areas: ["EXT"], disciplines: ["HSE"], assetCodes: [], documentCodes: [] },
  },
]
