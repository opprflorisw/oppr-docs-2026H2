// MIX-OPS-WI-0001: Starting a batch on mixer MXR-101.
// Plant facts: docs/build/plant-facts.md. Published, periodic review due in 60
// days (docs/test-set.md). Keeps the fixture steps verbatim.
import { asset, bullets, callout, doc, h, img, p, ppe, ref, steps, table, type SeedDoc } from "../builders"

const body = doc(
  h(1, "Starting a batch on mixer MXR-101"),
  p("Work instruction for starting a colour batch on ", asset("MXR-101"), "."),
  p(
    "The Vortex HM-500 high-speed batch mixer MXR-101 blends PE100 granulate with colour masterbatch for extrusion line 2. A correct batch gives the right colour on the pipe: black with blue stripes for water pipe, yellow for gas pipe. After mixing, the batch goes through the transfer pipe to the line 2 hopper and is dried on ",
    asset("DRY-102"),
    " before extrusion.",
  ),

  h(2, "Scope"),
  bullets([
    "This work instruction applies to every colour batch mixed on MXR-101 for line 2.",
    ["Drying the mixed batch is not part of this work instruction; drying follows ", ref("MIX-OPS-SOP-0002"), "."],
  ]),

  h(2, "Responsibilities"),
  table([
    ["Role", "Responsibility"],
    ["Mixing operator", "Weighs, loads, mixes and releases the batch, and signs the batch card."],
    ["Shift leader", "Confirms the colour planned for line 2 and decides when the batch card and the plan do not match."],
    ["Process engineer", "Owns the batch card recipes and approves any change to the masterbatch dosing."],
  ]),

  h(2, "Safety"),
  ppe("glasses,gloves,dust-mask,boots"),
  callout("warning", "Wear a dust mask (FFP2) when you empty masterbatch or granulate bags, and keep the local extraction at MXR-101 switched on."),
  callout("danger", "MXR-101 will not start with the lid open. Never bypass or tape over the lid interlock of MXR-101."),
  callout("caution", "Never clean spilled granulate or masterbatch dust with compressed air. Use the vacuum cleaner at the mixer."),
  p("Before the first batch of the shift, read the LMRA card ", ref("MIX-HSE-LMRA-0001"), " for dust and masterbatch handling at the mixer."),

  h(2, "Tools and materials"),
  bullets([
    "Batch card for the batch, from the folder at the mixer.",
    "PE100 granulate from the silo or from bags.",
    "Colour masterbatch as written on the batch card.",
    "Platform scale for granulate and bench scale for masterbatch, both with a valid calibration sticker.",
    "Masterbatch scoop and weighing bucket, one per colour.",
    "Vacuum cleaner for spills.",
  ]),

  h(2, "Masterbatch dosing"),
  p("The standard dosing is 2 kg of masterbatch per 100 kg of PE granulate unless the batch card says otherwise. The maximum batch on MXR-101 is 250 kg, granulate and masterbatch together."),
  table([
    ["PE granulate", "Masterbatch (standard 2 kg per 100 kg)"],
    ["100 kg", "2 kg"],
    ["150 kg", "3 kg"],
    ["200 kg", "4 kg"],
    ["245 kg (largest batch: 249.9 kg with masterbatch)", "4.9 kg"],
  ]),

  h(2, "Procedure"),
  steps([
    "Check the recipe on the batch card against the colour planned for line 2.",
    "Open the lid of MXR-101 and check that the bowl is empty and free of granulate of the previous colour.",
    "Check that the local extraction at MXR-101 is running.",
    "Weigh the PE granulate on the platform scale; a batch on MXR-101 is never more than 250 kg.",
    "Weigh the masterbatch: 2 kg per 100 kg of PE granulate unless the batch card says otherwise.",
    "Load granulate first, then masterbatch, and close the lid before starting.",
    "Press start on the panel of MXR-101; the mixer only starts when the lid is fully closed.",
    "Mix for 4 minutes and release the batch to the line 2 hopper.",
    "Check through the inspection window of MXR-101 that the bowl is empty after the discharge.",
    "Sign the batch card with the batch number, the weights and the time of release.",
  ]),
  img("mix-ops-wi-0001/weigh-masterbatch", "Weighing colour masterbatch on the bench scale before loading MXR-101."),
  img("mix-ops-wi-0001/load-mixer", "Loading PE granulate into the open bowl of MXR-101 with the local extraction running; the masterbatch goes in after the granulate."),

  h(2, "Checks and acceptance criteria"),
  table([
    ["Check", "Acceptance criterion"],
    ["Recipe", "Colour and masterbatch on the batch card match the colour planned for line 2."],
    ["Batch weight", "Granulate and masterbatch together are not more than 250 kg."],
    ["Masterbatch weight", "2 kg per 100 kg of granulate, or the dosing on the batch card, within ±0.05 kg on the bench scale."],
    ["Mixing time", "4 minutes on the mixer panel."],
    ["Mixed batch", "Even colour with no clumps of masterbatch, seen through the inspection window."],
    ["Bowl after discharge", "Empty, with no granulate left in the bowl."],
  ]),

  h(2, "If something goes wrong"),
  table([
    ["Symptom", "Likely cause", "Action"],
    ["MXR-101 does not start", "Lid not fully closed; the lid interlock blocks the start", "Close the lid fully and press start again. If MXR-101 still does not start, call the shift leader. Never bypass the interlock."],
    ["Batch card colour differs from the colour planned for line 2", "Wrong batch card or a changed production plan", "Do not mix. Ask the shift leader which colour is planned."],
    ["Clumps or streaks of masterbatch in the mixed batch", "Masterbatch loaded before the granulate, or mixing time too short", "Mix for another 2 minutes and check again. If the colour is still uneven, inform the shift leader."],
    ["Visible dust around the mixer", "Local extraction off or blocked", "Stop emptying bags, switch on the local extraction, and report a blocked extraction to the maintenance and safety engineer."],
    ["Mixer motor trips during mixing", "Batch heavier than 250 kg", "Inform the shift leader. Empty part of the batch only after the mixer has been locked out."],
  ]),
  img("mix-ops-wi-0001/inspection-window", "Inspection window of MXR-101: the mixed batch shows an even colour with no clumps of masterbatch."),

  h(2, "Records"),
  bullets([
    "Batch card: batch number, granulate weight, masterbatch type and weight, mixing time, time of release and the signature of the mixing operator.",
    "Shift log of Hall 1: every batch that was mixed again or rejected, with the reason.",
  ]),

  h(2, "References"),
  bullets([
    [ref("MIX-MNT-MAN-0001"), ": Vortex HM-500 high-speed mixer, operating manual."],
    [ref("MIX-OPS-SOP-0002"), ": Drying PE granulate on dryer DRY-102."],
    [ref("MIX-HSE-LMRA-0001"), ": LMRA for dust and masterbatch handling at the mixer."],
    [ref("EXT-OPS-SOP-0001"), ": Colour and product changeover on extrusion line 2."],
  ]),
)

export const seedDoc: SeedDoc = {
  code: "MIX-OPS-WI-0001",
  title: "Starting a batch on mixer MXR-101",
  type: "work_instruction",
  area: "MIX",
  discipline: "OPS",
  status: "published",
  editions: [{ body, publishedDaysAgo: 305 }],
  assets: ["MXR-101"],
  nextReviewInDays: 60,
  tags: ["mixing", "masterbatch", "batch card"],
  images: [
    {
      key: "mix-ops-wi-0001/weigh-masterbatch",
      prompt:
        "A mixing operator wearing safety glasses, nitrile gloves and an FFP2 dust mask pouring small yellow plastic masterbatch pellets from a scoop into a bucket standing on a digital bench scale, in an industrial mixing hall.",
    },
    {
      key: "mix-ops-wi-0001/load-mixer",
      prompt:
        "Top view into the open stainless steel bowl of an industrial high-speed batch mixer with mixing paddles at the bottom, white plastic granulate pouring in from a bag held by a gloved operator, and a flexible local extraction hood positioned above the bowl opening.",
    },
    {
      key: "mix-ops-wi-0001/inspection-window",
      prompt:
        "Close-up of a round glass inspection window on the side of a stainless steel industrial mixer, showing evenly blended yellow plastic granulate inside.",
    },
  ],
}
