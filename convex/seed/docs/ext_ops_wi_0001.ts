// EXT-OPS-WI-0001: Saw blade check on SAW-202.
// Plant facts: docs/build/plant-facts.md. In review, never published.
// Fixture (docs/test-set.md): mentions blade type BL-7730, which must never
// reach Ask, Wikis or Trainings while this document is unpublished.
import { asset, bullets, callout, doc, h, img, p, ppe, ref, steps, table, type SeedDoc } from "../builders"

const body = doc(
  h(1, "Saw blade check on SAW-202"),
  p("Daily check of the saw blade on ", asset("SAW-202"), " before the first cut."),
  p(
    "The Nordcut PS-110 planetary saw on SAW-202 cuts PE pipe from line 2 to 6 m or 12 m lengths. A blunt or damaged saw blade gives rough, angled cut faces, pulls the pipe out of square and can break teeth that are thrown inside the saw guard. This check finds blade damage before it causes scrap or an injury.",
  ),

  h(2, "Scope"),
  bullets([
    "This work instruction applies to the saw blade of the planetary saw on SAW-202.",
    "Do the check once a day, before the first cut after start-up of line 2 or during the first planned stop of the day shift.",
    ["Changing the blade flange, the saw motor or the saw carriage is maintenance work and follows the Nordcut manual ", ref("EXT-MNT-MAN-0002"), "."],
  ]),

  h(2, "Responsibilities"),
  table([
    ["Role", "Responsibility"],
    ["Line operator", "Does the daily check and replaces a damaged blade."],
    ["Shift leader", "Agrees to the stop of line 2 for the lockout and signs the shift log."],
    ["Maintenance and safety engineer", "Owns this work instruction and is called when the blade flange or the saw guard is damaged."],
  ]),

  h(2, "Safety"),
  ppe("glasses,gloves,boots,ear-pro"),
  callout("loto", "The saw blade check is work inside the guarding of SAW-202. Lock out line 2 with EXT-HSE-SOP-0001 before you open the saw guard."),
  callout("warning", "The saw guard of SAW-202 is interlocked. Never bypass the guard interlock, not even for a quick look."),
  callout("caution", "Saw teeth are sharp even on a blunt blade. Wear cut-resistant gloves whenever you touch the saw blade."),

  h(2, "Tools and materials"),
  bullets([
    "Cut-resistant gloves and safety glasses.",
    "Torch for inspecting the teeth.",
    "Plastic scraper for removing PE build-up from the blade.",
    "Spare saw blade of the type written in the procedure, from the spare parts cabinet at line 2.",
    "Torque wrench and the blade flange key from the line 2 tool board.",
    "A piece of scrap pipe for the test cut.",
  ]),

  h(2, "Procedure"),
  steps([
    "Inform the shift leader that the saw blade check on SAW-202 needs a lockout of line 2.",
    "Lock out the saw following the line 2 lockout procedure.",
    "Open the saw guard of SAW-202 only after the try-start has confirmed that line 2 is isolated.",
    "Turn the saw blade of SAW-202 slowly by hand, wearing cut-resistant gloves, so that every tooth passes the torch light.",
    "Inspect the blade for missing or chipped teeth.",
    "Check the saw blade of SAW-202 for cracks, blue heat marks and PE build-up between the teeth.",
    "Remove PE build-up from the saw blade with the plastic scraper.",
    "Replace a damaged blade with blade type BL-7730.",
    "Tighten the blade flange bolts of SAW-202 to the torque given in the Nordcut manual EXT-MNT-MAN-0002.",
    "Close the saw guard of SAW-202 and remove your lock following the line 2 lockout procedure.",
    "Make one test cut on scrap pipe and check that the cut face is square and free of burrs.",
    "Record the saw blade check in the shift log.",
  ]),
  img("ext-ops-wi-0001/blade-inspection", "Inspecting the teeth of the SAW-202 saw blade with a torch, guard open and line 2 locked out."),
  img("ext-ops-wi-0001/chipped-tooth", "A chipped saw tooth (left) next to an intact saw tooth (right): a blade with chipped or missing teeth is replaced."),

  h(2, "Checks and acceptance criteria"),
  table([
    ["Check", "Acceptance criterion"],
    ["Teeth", "No missing or chipped teeth."],
    ["Blade body", "No cracks and no blue heat marks."],
    ["Blade cleanliness", "No PE build-up between the teeth."],
    ["Guard interlock", "SAW-202 does not run with the saw guard open."],
    ["Test cut", "Cut face is square to the pipe axis and free of burrs."],
    ["Cut length after restart", "6 m or 12 m, within ±10 mm."],
  ]),
  img("ext-ops-wi-0001/test-cut", "A good test cut on scrap pipe: the cut face is square and free of burrs."),

  h(2, "If something goes wrong"),
  table([
    ["Symptom", "Likely cause", "Action"],
    ["Rough or angled cut face", "Blunt blade or PE build-up on the teeth", "Lock out line 2, clean the blade and check the teeth again. Replace a blunt blade."],
    ["Burrs on the cut face", "Blade worn or blade running too slow", "Replace the blade. If burrs remain, inform the maintenance and safety engineer."],
    ["Saw runs with the guard open", "Guard interlock defective", "Stop line 2 at once, lock out line 2 and inform the maintenance and safety engineer. Do not use SAW-202 until the interlock is repaired."],
    ["Blade wobbles when turned by hand", "Blade flange bolts loose", "Tighten the blade flange bolts to the torque in the Nordcut manual and check again."],
    ["Cut length out of tolerance after the check", "Haul-off speed not matched to line speed", "Correct the haul-off speed of SAW-202 and measure the next 3 pipes."],
  ]),

  h(2, "Records"),
  bullets([
    "Shift log: date, time, result of the saw blade check and whether the blade was replaced.",
    "Spare parts cabinet list: each spare saw blade taken out.",
    "LOTO register: the lockout for the check.",
  ]),

  h(2, "References"),
  bullets([
    [ref("EXT-HSE-SOP-0001"), ": Lockout/tagout on extrusion line 2."],
    [ref("EXT-MNT-MAN-0002"), ": Nordcut HC-110 haul-off and PS-110 planetary saw, manual."],
    [ref("EXT-OPS-SOP-0001"), ": Colour and product changeover on extrusion line 2."],
  ]),
)

export const seedDoc: SeedDoc = {
  code: "EXT-OPS-WI-0001",
  title: "Saw blade check on SAW-202",
  type: "work_instruction",
  area: "EXT",
  discipline: "OPS",
  status: "in_review",
  editions: [{ body, publishedDaysAgo: null }],
  assets: ["SAW-202"],
  nextReviewInDays: null,
  tags: ["saw", "daily check", "line 2"],
  images: [
    {
      key: "ext-ops-wi-0001/blade-inspection",
      prompt:
        "An operator wearing cut-resistant gloves and safety glasses shining a torch on the circular toothed blade of a planetary pipe saw, with the hinged saw guard opened upwards, inside the cutting unit at the end of a plastic pipe extrusion line.",
    },
    {
      key: "ext-ops-wi-0001/chipped-tooth",
      prompt:
        "Macro close-up of the edge of a circular saw blade showing two adjacent carbide teeth: the left tooth chipped and broken, the right tooth intact and sharp.",
    },
    {
      key: "ext-ops-wi-0001/test-cut",
      prompt:
        "Close-up of the freshly cut end of a black polyethylene pressure pipe with blue stripes, the cut face smooth, flat and square, held in gloved hands.",
    },
  ],
}
