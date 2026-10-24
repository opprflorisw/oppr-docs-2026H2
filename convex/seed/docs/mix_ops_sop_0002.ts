// MIX-OPS-SOP-0002: Drying PE granulate on dryer DRY-102.
// Plant facts: docs/build/plant-facts.md: 80 °C for at least 4 hours, dew
// point -40 °C or lower. Deliberate gap: this SOP says NOTHING about how long
// dried granulate may stay in the hopper. Do not add a holding time.
import { asset, bullets, callout, doc, h, img, p, ppe, ref, steps, table, type SeedDoc } from "../builders"

const body = doc(
  h(1, "Drying PE granulate on dryer DRY-102"),
  p(
    "This SOP describes how the mixed PE100 granulate from the batch mixer ",
    asset("MXR-101"),
    " is dried on the desiccant dryer ",
    asset("DRY-102"),
    " before it is fed to the extruder ",
    asset("EXL-201"),
    " of line 2.",
  ),
  p(
    "PE granulate and colour masterbatch take up moisture from the air. Moisture in the granulate turns into steam in the extruder and shows as bubbles, voids and a rough inner surface in the pipe wall. Drying at 80 °C for at least 4 hours with dry air at a dew point of -40 °C or lower removes this moisture.",
  ),

  h(2, "Scope"),
  bullets([
    "This SOP applies to all PE100 granulate dried on DRY-102 for line 2, for water pipe and for gas pipe.",
    ["Mixing the batch before drying follows ", ref("MIX-OPS-WI-0001"), "."],
    "Repairs to the dryer, desiccant replacement and heater faults are maintenance work and are not covered by this SOP.",
  ]),

  h(2, "Responsibilities"),
  table([
    ["Role", "Responsibility"],
    ["Mixing operator", "Fills DRY-102, checks temperature and dew point, keeps the hopper card and releases the dried granulate."],
    ["Line operator", "Opens the slide gate to EXL-201 only for granulate released on the hopper card."],
    ["Shift leader", "Decides when dried granulate is not ready in time for line 2."],
    ["Process engineer", "Owns this SOP and the drying set points."],
  ]),

  h(2, "Safety"),
  ppe("glasses,gloves,dust-mask,boots"),
  callout("caution", "The drying hopper, the process air hose and the heater housing of DRY-102 are hot (about 80 °C). Wear gloves when you touch the dryer."),
  callout("warning", "Wear a dust mask (FFP2) when you empty granulate or masterbatch bags, keep the local extraction on, and never use compressed air for cleaning."),
  callout("notice", "Never open the heater housing or the desiccant beds of DRY-102. A fault inside the dryer is for the maintenance and safety engineer."),

  h(2, "Drying set points"),
  table([
    ["Parameter", "Set point", "Limit"],
    ["Drying air temperature", "80 °C", "Not lower than 80 °C"],
    ["Drying time", "4 hours", "At least 4 hours at 80 °C"],
    ["Dew point of the drying air", "-40 °C", "-40 °C or lower"],
  ]),

  h(2, "Tools and materials"),
  bullets([
    "Batch card of the mixed batch from MXR-101.",
    "Hopper card at DRY-102 (start time, readings, release signature).",
    "Gloves and an FFP2 dust mask.",
    "Clean sample cup for a visual check of the granulate.",
  ]),

  h(2, "Procedure"),
  steps([
    "Check on the batch card that the batch in MXR-101 is PE100 granulate with the colour planned for line 2.",
    "Check on the display of DRY-102 that the dryer is running without alarms.",
    "Check that the drying air temperature set point on DRY-102 is 80 °C.",
    "Check that the dew point on the display of DRY-102 is -40 °C or lower before filling.",
    "Check that the process air filter indicator of DRY-102 is green.",
    "Check that the slide gate below the drying hopper of DRY-102 is closed.",
    "Start the transfer of the mixed batch from MXR-101 to the drying hopper of DRY-102.",
    "Write the batch number and the start time of drying on the hopper card of DRY-102.",
    "Read the drying air temperature and the dew point on DRY-102 every hour and write both values on the hopper card.",
    "Wait until the granulate in DRY-102 has dried at 80 °C for at least 4 hours.",
    "Check on the hopper card that every reading during the 4 hours shows 80 °C and a dew point of -40 °C or lower.",
    "Sign the hopper card of DRY-102 as released, with the time of release.",
    "Tell the line operator on line 2 that the dried granulate is released.",
  ]),
  img("mix-ops-sop-0002/dew-point-display", "Control panel of DRY-102 showing the drying air temperature of 80 °C and a dew point of -40 °C."),
  img("mix-ops-sop-0002/drying-hopper", "Drying hopper of DRY-102 with the transfer pipe from MXR-101 on top and the slide gate to EXL-201 below."),

  h(2, "Checks and acceptance criteria"),
  table([
    ["Check", "When", "Acceptance criterion"],
    ["Dew point", "Before filling and every hour", "-40 °C or lower."],
    ["Drying air temperature", "Every hour", "80 °C."],
    ["Drying time", "Before release", "At least 4 hours at 80 °C."],
    ["Hopper card", "Before release", "Batch number, start time, hourly readings and release signature filled in."],
    ["Granulate in the sample cup", "Before release", "Free flowing, no lumps, no dust, no yellowing."],
  ]),
  img("mix-ops-sop-0002/sample-cup", "Dried granulate in a sample cup: free flowing, with no lumps and no yellowing."),

  h(2, "If something goes wrong"),
  table([
    ["Symptom", "Likely cause", "Action"],
    ["Dew point above -40 °C", "Desiccant saturated or regeneration fault in DRY-102", "Do not release the granulate. Inform the shift leader and the maintenance and safety engineer. Restart the 4 hours once the dew point is -40 °C or lower."],
    ["Drying air temperature below 80 °C", "Heater fault or filter blocked", "Check the filter indicator. Do not count the time below 80 °C towards the 4 hours. Inform the maintenance and safety engineer."],
    ["Bubbles or voids in the pipe wall on line 2", "Granulate not dry enough", "Close the slide gate, inform the shift leader and check the hopper card readings. The process engineer decides on the pipe made."],
    ["Lumps in the granulate", "Granulate overheated or wet granulate stuck together", "Do not release the granulate. Inform the process engineer."],
    ["Line 2 needs granulate before the 4 hours are complete", "Batch started too late", "Do not release early. The shift leader adjusts the production plan."],
  ]),

  h(2, "Records"),
  bullets([
    "Hopper card at DRY-102: batch number, start time of drying, hourly temperature and dew point readings, release time and signature.",
    "Shift log of Hall 1: every dryer alarm and every batch that was not released.",
    "Completed hopper cards are kept in the folder at DRY-102 for the rest of the month.",
  ]),

  h(2, "References"),
  bullets([
    [ref("MIX-OPS-WI-0001"), ": Starting a batch on mixer MXR-101."],
    [ref("MIX-HSE-LMRA-0001"), ": LMRA for dust and masterbatch handling at the mixer."],
    [ref("EXT-OPS-SOP-0002"), ": Starting line 2 from cold."],
    [ref("EXT-OPS-SOP-0001"), ": Colour and product changeover on extrusion line 2."],
  ]),
)

export const seedDoc: SeedDoc = {
  code: "MIX-OPS-SOP-0002",
  title: "Drying PE granulate on dryer DRY-102",
  type: "sop",
  area: "MIX",
  discipline: "OPS",
  status: "published",
  editions: [{ body, publishedDaysAgo: 140 }],
  assets: ["DRY-102", "MXR-101"],
  nextReviewInDays: 225,
  tags: ["drying", "granulate", "dew point"],
  images: [
    {
      key: "mix-ops-sop-0002/dew-point-display",
      prompt:
        "Front view of the control panel of an industrial desiccant granulate dryer, with a digital display showing two numeric readings, a green status light and a small round filter indicator, in a clean industrial hall.",
    },
    {
      key: "mix-ops-sop-0002/drying-hopper",
      prompt:
        "A tall insulated stainless steel drying hopper of a plastic granulate dryer, with a pipe entering at the top, an insulated hot air hose at the side and a manual slide gate at the bottom outlet, seen from floor level.",
    },
    {
      key: "mix-ops-sop-0002/sample-cup",
      prompt:
        "Close-up of a clear plastic sample cup filled with dry, free-flowing black polyethylene granulate pellets, held in a gloved hand.",
    },
  ],
}
