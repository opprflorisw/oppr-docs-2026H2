// EXT-OPS-WI-0003: Setting up the pipe coiler CLR-204.
// Approved, not yet Published (the Home inbox shows Publish). Plant facts:
// coils 32-63 mm in 50 m or 100 m, coil tension low, strap in 4 places, label
// with product, batch and length.
import { asset, bullets, callout, doc, h, img, p, ppe, ref, steps, table, type SeedDoc } from "../builders"

const body = doc(
  h(1, "Setting up the pipe coiler CLR-204"),
  p(
    "This work instruction describes how the line operator sets up the pipe coiler ",
    asset("CLR-204"),
    " at the end of line 2 for a new coil product, threads the first pipe, and finishes, straps and labels each coil. The coiler takes the pipe after the haul-off and planetary saw ",
    asset("SAW-202"),
    ", which cuts the pipe when the coil length is reached.",
  ),

  h(2, "Scope"),
  bullets([
    "This work instruction applies to PE pipe of 32 to 63 mm OD, wound on CLR-204 in coils of 50 m or 100 m.",
    "Pipe above 63 mm OD is not coiled on line 2; pipe above 63 mm OD is cut to 6 m or 12 m lengths on the tipping table.",
    "Clearing a jam inside the coiler drum is maintenance work under lockout/tagout and is not covered here.",
  ]),

  h(2, "Responsibilities"),
  table([
    ["Role", "Responsibility"],
    ["Line operator", "Sets up CLR-204, threads the pipe, watches the first coil, and straps and labels every coil."],
    ["Shift leader", "Confirms the coil product and coil length from the production order and signs the setup in the shift log."],
    ["Quality lab technician", "Measures the test pieces from the first coils per QCL-QA-SOP-0001."],
    ["Process engineer", "Owns this work instruction and the coiler settings table."],
  ]),

  h(2, "Personal protective equipment"),
  p("Wear safety glasses, cut-resistant gloves, safety shoes and hearing protection at CLR-204. Hall 2 is above 85 dB(A). Wear close-fitting work clothing with no loose sleeves near the turning drum."),
  ppe("glasses,gloves,boots,ear-pro,clothing"),

  h(2, "Tools and materials"),
  bullets([
    "Production order with product, OD, SDR, batch and coil length.",
    "Drum core segments for the OD (rack next to CLR-204, marked per OD).",
    "PET strapping and the hand strapping tool, enough for 4 straps per coil.",
    "Coil labels from the label printer at line 2.",
    "Hand pipe cutter for taking a test piece from the coil tail.",
  ]),

  h(2, "Coiler settings"),
  p("Set CLR-204 with the values in this table. The coil tension is always LOW: a higher tension makes the pipe oval and can kink thin-walled pipe."),
  table([
    ["Pipe OD (mm)", "Drum core inner diameter (mm)", "Traverse pitch (mm)", "Coil lengths", "Coil tension"],
    ["32", "800", "32", "50 m or 100 m", "LOW"],
    ["40", "900", "40", "50 m or 100 m", "LOW"],
    ["50", "1100", "50", "50 m or 100 m", "LOW"],
    ["63", "1300", "63", "50 m or 100 m", "LOW"],
  ]),

  h(2, "Procedure"),
  callout(
    "danger",
    "Never reach into the coiler drum of CLR-204 or the traverse guide while the drum turns. The pipe end can pull a hand or a sleeve into the drum. Press the drum STOP button and wait until the drum stands still before you touch the pipe end or the drum clamp.",
  ),
  callout(
    "loto",
    "For any work inside the drum or the traverse beyond threading the pipe end (a jam, a broken clamp, a crossed layer), lock out line 2 at the main isolator in panel MCC-2 per EXT-HSE-SOP-0001. A stopped coiler can restart.",
  ),
  steps([
    "Read the OD, SDR, batch and coil length (50 m or 100 m) from the production order and check that the OD is between 32 mm and 63 mm.",
    ["Press the drum STOP button on ", asset("CLR-204"), ", wait until the drum stands still, and fit the drum core segments for the OD from the coiler settings table."],
    "On the CLR-204 panel, set the traverse pitch to the pipe OD from the coiler settings table.",
    "On the CLR-204 panel, enter the coil length (50 m or 100 m) in the length counter and set the coil tension to LOW.",
    "Check that the strapping tool has enough strap for 4 straps per coil and that the label printer at line 2 shows the product and batch of the production order.",
    "With line 2 at threading speed, guide the pipe end by hand through the traverse guide and stop the pipe end 300 mm past the drum clamp; keep both hands on the pipe and away from the drum.",
    "Check that the drum stands still, push the pipe end fully into the drum clamp, and close the drum clamp.",
    "Step back behind the yellow floor line, then start CLR-204 in AUTO; the drum speed now follows the haul-off speed of SAW-202.",
    "Watch the first two layers of the coil from behind the yellow floor line and check that the turns lie tight against each other with no gaps and no crossings.",
    "When SAW-202 cuts the pipe at the coil length and the drum stops, put 4 straps around the coil at 90° apart before you open the drum clamp or collapse the drum core.",
    "Attach a coil label on the outside of the coil, next to the pipe tail, with the product, the batch and the coil length.",
    "Cut a test piece from the tail of each of the first 10 coils after setup and bring each test piece to the Quality lab for measurement per QCL-QA-SOP-0001.",
  ]),
  img(
    "ext-ops-wi-0003/drum-clamp",
    "Threading the pipe end into the drum clamp of CLR-204 with the drum stopped, both hands on the pipe and away from the drum.",
  ),
  img(
    "ext-ops-wi-0003/four-straps",
    "A finished coil of 32 mm PE pipe on CLR-204 with 4 straps placed 90° apart before the drum core is collapsed.",
  ),
  callout(
    "caution",
    "When the drum clamp opens, the pipe tail of a strapped coil can spring outwards. Hold the pipe tail with a gloved hand and keep your face out of line with the pipe tail.",
  ),
  img(
    "ext-ops-wi-0003/coil-label",
    "The coil label placed on the outside of the coil next to the pipe tail, readable from the forklift aisle.",
  ),

  h(2, "Checks and acceptance criteria"),
  table([
    ["Check", "Acceptance criterion"],
    ["Pipe size", "The OD on the production order is between 32 mm and 63 mm; pipe above 63 mm OD is not coiled."],
    ["Coil length", "The length counter on CLR-204 is set to the coil length on the production order: 50 m or 100 m."],
    ["Coil tension", "The coil tension on CLR-204 is set to LOW for every product."],
    ["Winding", "The turns lie tight against each other with no gaps, no crossings and no kinks."],
    ["Strapping", "Every coil has 4 straps, 90° apart, placed before the drum clamp is opened."],
    ["Labelling", "Every coil has a coil label with product, batch and coil length."],
    ["Measurement", "A test piece from each of the first 10 coils after setup has been measured and passed per QCL-QA-SOP-0001."],
  ]),

  h(2, "If something goes wrong"),
  table([
    ["Symptom", "Likely cause", "Action"],
    ["Turns cross or leave gaps on the drum", "Traverse pitch does not match the OD", "Stop CLR-204 with the drum STOP button, check the traverse pitch against the coiler settings table, and correct the traverse pitch before the next coil."],
    ["Pipe on the coil looks oval or kinked", "Coil tension set higher than LOW, or the wrong drum core for the OD", "Set the coil tension to LOW, check the drum core, and quarantine the oval coil per QCL-QA-WI-0001."],
    ["The pipe end slips out of the drum clamp at the start", "Pipe end not pushed fully into the drum clamp", "Press the drum STOP button, wait until the drum stands still, and thread the pipe end again."],
    ["The coil length is wrong (too short or too long)", "Wrong value in the length counter on CLR-204", "Correct the length counter, write the actual coil length on the coil label, and tell the shift leader."],
    ["A strap breaks during strapping", "Strap tension too high on the hand strapping tool", "Replace the strap; lower the strap tension on the strapping tool so that the strap holds the turns without cutting into the pipe."],
    ["Pipe is jammed in the drum or the traverse", "Crossed layer or broken drum clamp", "Stop line 2, call the shift leader, and lock out line 2 at MCC-2 per EXT-HSE-SOP-0001 before anyone reaches in."],
  ]),

  h(2, "Records"),
  bullets([
    "The line operator writes the coiler setup (product, OD, coil length, time) in the shift log.",
    "The coil label carries the product, batch and coil length for every coil, so that every coil can be traced.",
    "The measurement results of the first 10 coils are in the QC log for line 2.",
    "Any quarantined coil gets an NC report in the QC log per QCL-QA-WI-0001.",
  ]),

  h(2, "References"),
  bullets([
    [ref("EXT-HSE-SOP-0001"), " Lockout/tagout on extrusion line 2."],
    [ref("EXT-MNT-MAN-0002"), " Nordcut HC-110 haul-off and PS-110 planetary saw: manual."],
    [ref("QCL-QA-SOP-0001"), " Measuring wall thickness and outside diameter."],
    [ref("QCL-QA-WI-0001"), " Quarantine and release of non-conforming pipe."],
    [ref("EXT-OPS-SOP-0002"), " Starting line 2 from cold."],
  ]),
)

export const seedDoc: SeedDoc = {
  code: "EXT-OPS-WI-0003",
  title: "Setting up the pipe coiler CLR-204",
  type: "work_instruction",
  area: "EXT",
  discipline: "OPS",
  status: "approved",
  editions: [{ body, publishedDaysAgo: null }],
  assets: ["CLR-204"],
  nextReviewInDays: null,
  tags: ["coiler", "line 2", "setup", "coils"],
  images: [
    {
      key: "ext-ops-wi-0003/drum-clamp",
      prompt:
        "two gloved hands pushing the end of a black polyethylene pipe into the clamp on the rim of a large stationary pipe coiling drum, the pipe running through a traverse guide roller behind, industrial pipe coiler in a factory hall, side view",
    },
    {
      key: "ext-ops-wi-0003/four-straps",
      prompt:
        "a neatly wound coil of black polyethylene pipe with blue stripes still on the drum of an industrial pipe coiler, four plastic straps placed at equal quarter positions around the coil, an operator in gloves tensioning one strap with a hand strapping tool",
    },
    {
      key: "ext-ops-wi-0003/coil-label",
      prompt:
        "close-up of a blank white adhesive label stuck on the outer turn of a coil of black polyethylene pipe right next to the cut pipe tail, the coil lying flat on a wooden pallet, no writing visible on the label",
    },
  ],
}
