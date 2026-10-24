// EXT-OPS-SOP-0001: Colour and product changeover on extrusion line 2.
// Plant facts: docs/build/plant-facts.md.
// Fixtures (docs/test-set.md): v1 is Published and uses purge compound PX-4400,
// about 15 minutes, die bolts crosswise to 40 Nm. v2 is a draft that switches
// to PX-9917, about 10 minutes, and adds a handover step. PX-9917 must only
// ever appear in v2. Deliberate contradiction #1: this SOP says 40 Nm, the
// Krauss manual (EXT-MNT-MAN-0001) says 45 Nm. Never write 45 Nm here.
import { asset, b, bullets, callout, doc, h, img, p, ppe, ref, steps, table, type Node, type SeedDoc } from "../builders"

function changeover(draft: boolean): Node {
  const compound = draft ? "PX-9917" : "PX-4400"
  const purgeMinutes = draft ? "10" : "15"

  const procedure = [
    "Check the batch card and the production plan for the next colour, outside diameter and SDR before the changeover starts.",
    "Tell the mixing operator the changeover is starting and which colour comes next.",
    ["Ask the quality lab technician to be ready to measure the first 10 pipes of the new product on the ultrasonic gauge ", asset("QCL-301"), "."],
    "Stop dosing at MXR-101 when the extruder hopper is below 20 percent.",
    ["Run the extruder hopper of ", asset("EXL-201"), " empty at a reduced screw speed of 40 rpm."],
    ["When the melt flow drops, cut the last pipe of the old product at the saw and stop the haul-off of ", asset("SAW-202"), "."],
    "Set all barrel zones and the die of EXL-201 to 190 °C for purging and wait until every zone shows 190 °C.",
    draft
      ? "Purge the barrel with purge compound PX-9917 at 190 °C until the melt runs clean, about 10 minutes."
      : "Purge the barrel with purge compound PX-4400 at 190 °C until the melt runs clean, about 15 minutes.",
    "Stop the screw of EXL-201 and check that the screw speed display shows 0 rpm before anyone works at the die.",
    "Swap the masterbatch and, for a product change, fit the new die.",
    ["For a product change, change the screen pack of EXL-201 following ", ref("EXT-MNT-SOP-0001"), "."],
    "Tighten the die bolts crosswise to 40 Nm.",
    ["For a product change, fit the sizing sleeve for the new outside diameter in the vacuum tank ", asset("VAC-203"), " following ", ref("EXT-OPS-WI-0002"), "."],
    "Set the zone temperatures of EXL-201 to the set points on the batch card for the new product.",
    "Restart the screw at 60 rpm and ramp up to production speed over 5 minutes.",
    "Thread the new pipe through the sizing sleeve of VAC-203 and the haul-off tracks of SAW-202 with the start-up pipe.",
    "Set the haul-off speed of SAW-202 to the line speed on the batch card and set the cut length of SAW-202 to 6 m or 12 m.",
    "Scrap the first 3 metres of pipe and measure wall thickness on each of the first 10 pipes.",
    "Release line 2 for production only when each of the first 10 pipes is within the tolerance of QCL-QA-SOP-0001.",
    ...(draft ? ["Record the changeover in the shift handover."] : []),
  ]

  return doc(
    h(1, "Colour and product changeover on extrusion line 2"),
    p("Use this procedure for every colour or product change on ", asset("EXL-201"), ", fed by ", asset("MXR-101"), " and cut by ", asset("SAW-202"), "."),
    p(
      "A changeover on line 2 moves production from one colour to another (black water pipe with blue stripes, or yellow gas pipe) or from one product to another (a different outside diameter or SDR). The aim of the changeover is a clean melt and pipe within tolerance with the least scrap, without letting the die and barrel cool down.",
    ),

    h(2, "Scope"),
    bullets([
      "This SOP applies to every colour change and every product change on extrusion line 2, for PE100 pipe from 32 to 110 mm outside diameter in SDR 11 and SDR 17.",
      ["This SOP does not cover starting line 2 from cold; use ", ref("EXT-OPS-SOP-0002"), " for a cold start."],
      ["This SOP does not cover shutting line 2 down at the end of a campaign; use ", ref("EXT-OPS-SOP-0003"), " for a shutdown."],
      ["The screen pack change during a product change follows ", ref("EXT-MNT-SOP-0001"), "; this SOP only says when to do it."],
    ]),

    h(2, "Responsibilities"),
    table([
      ["Role", "Responsibility"],
      ["Shift leader", "Plans the changeover with the production plan, confirms the batch card for the next product and signs the changeover in the shift log."],
      ["Line operator", "Carries out the changeover steps on EXL-201, VAC-203 and SAW-202 and stops the changeover when a check fails."],
      ["Mixing operator", "Prepares the batch of the next colour on MXR-101 following MIX-OPS-WI-0001 and starts dosing only when the line operator asks for it."],
      ["Quality lab technician", "Measures wall thickness and outside diameter of the first 10 pipes after the changeover on QCL-301 and records the results in the QC log."],
      ["Process engineer", "Owns this SOP, sets the batch card set points and approves any deviation from them."],
    ]),

    h(2, "Safety"),
    ppe("glasses,gloves,boots,ear-pro,face-shield,clothing"),
    callout("warning", "The die and barrel stay above 150 °C during a changeover. Wear heat-resistant gloves for any contact with the die."),
    callout(
      "hotwork",
      "Fitting a new die or tightening the die bolts is hot work at the die head. Complete the LMRA card ",
      ref("EXT-HSE-LMRA-0001"),
      " before you start and wear heat-resistant gloves (EN 407), a face shield and long sleeves.",
    ),
    callout("danger", "Never stand in front of the die when the screw starts. Molten PE can spurt from the die when the screw of EXL-201 restarts."),
    callout(
      "notice",
      "For a burn from hot melt, cool the skin with lukewarm running water for 20 minutes and call the first aider on extension 2222. Follow ",
      ref("EXT-HSE-SOP-0002"),
      ".",
    ),
    callout("caution", "Wear hearing protection in Hall 2 at all times: the noise level near line 2 is above 85 dB(A)."),

    h(2, "Tools and materials"),
    bullets([
      ["Purge compound ", b(compound), ", from the material rack at line 2."],
      "Colour masterbatch for the next product, as written on the batch card.",
      "For a product change: the die and the sizing sleeve for the new outside diameter, pre-heated on the die trolley.",
      "For a product change: a new screen pack of three screens (40/80/40 mesh) for the breaker plate.",
      "Torque wrench with a range that covers 40 Nm, with a valid calibration sticker.",
      "Brass scraper and copper brush for cleaning the die face. Never use steel tools on the die face.",
      "Heat-resistant gloves (EN 407), face shield, long-sleeved jacket.",
      "Scrap bin on wheels for purge melt and start-up pipe.",
      "Start-up pipe (draw-down pipe) for the new outside diameter.",
      "Shift log and QC log.",
    ]),

    h(2, "Procedure"),
    p("Do the steps in order. Do not skip a step for a colour-only change unless the step says it is for a product change."),
    steps(procedure),
    img(
      "ext-ops-sop-0001/purge",
      `Purging EXL-201: purge melt runs from the die into the scrap bin until the melt runs clean, about ${purgeMinutes} minutes.`,
    ),
    img("ext-ops-sop-0001/torque-pattern", "Die bolts are tightened crosswise with a torque wrench, in two passes, wearing heat-resistant gloves."),

    h(2, "Set points for 110 mm SDR 11"),
    p("The batch card gives the set points for each product. For the most common product, 110 mm SDR 11, the set points of EXL-201 are:"),
    table([
      ["Zone", "Set point"],
      ["Feed zone", "175 °C"],
      ["Zone 2", "190 °C"],
      ["Zone 3", "200 °C"],
      ["Zone 4", "205 °C"],
      ["Adapter", "205 °C"],
      ["Die", "210 °C"],
    ]),
    p("Normal production screw speed on EXL-201 is 90-120 rpm. Normal melt pressure is 180-250 bar."),

    h(2, "Checks and acceptance criteria"),
    table([
      ["Check", "When", "Acceptance criterion"],
      ["Melt at the die", "End of the purge", "The melt is clean and uniform, with no streaks of the old colour and no black specks."],
      ["Die bolt torque", "After fitting the die", "Every die bolt is tightened crosswise to 40 Nm, and the torque wrench clicks on every bolt in a second pass."],
      ["Zone temperatures of EXL-201", "Before the screw restarts", "Every zone is within 3 °C of the set point on the batch card."],
      ["Melt pressure", "After the ramp-up to production speed", "Melt pressure is 180-250 bar. The alarm is at 320 bar."],
      ["Wall thickness and outside diameter", "Each of the first 10 pipes", "Within the tolerance table of QCL-QA-SOP-0001, for example 110 mm SDR 11: OD 110.0-110.7 mm, wall 10.0-11.1 mm."],
      ["Cut length on SAW-202", "First 3 pipes", "6 m or 12 m, within ±10 mm."],
      ["Stripes on water pipe", "First pipe after the changeover", "The blue stripes are continuous and evenly spaced around the pipe."],
    ]),
    img("ext-ops-sop-0001/first-pipes", "The first 3 metres of pipe after a changeover go to scrap; the first 10 pipes are measured in the Quality lab."),

    h(2, "If something goes wrong"),
    table([
      ["Symptom", "Likely cause", "Action"],
      [`Streaks of the old colour after ${purgeMinutes} minutes`, "Purge not finished", "Purge for another 5 minutes, then check again"],
      ["Wall thickness out of tolerance", "Speed ramp too fast", "Lower haul-off speed and recheck after 3 pipes"],
      ["Black specks in the melt after the purge", "Degraded material in the die or adapter", "Purge for another 5 minutes. If the black specks remain, inform the process engineer before restarting production."],
      ["Melt leaks at the die flange", "Die bolts not tightened evenly", "Stop the screw, wear heat-resistant gloves and a face shield, and tighten the die bolts crosswise to 40 Nm again."],
      ["Melt pressure more than 30 bar above the baseline for the product", "Screen pack blocked", "Change the screen pack following EXT-MNT-SOP-0001. Stop the screw if the melt pressure reaches the 320 bar alarm."],
      ["Pipe oval after the vacuum tank", "Wrong sizing sleeve, or vacuum outside -0.2 to -0.4 bar", "Check the sizing sleeve and the vacuum of VAC-203 following EXT-OPS-WI-0002."],
      ["Cut length differs more than 10 mm from 6 m or 12 m", "Haul-off speed not matched to the line speed", "Correct the haul-off speed of SAW-202 and measure the next 3 pipes."],
      ["Wrong colour or no stripes on the first pipe", "Wrong masterbatch in the batch", "Stop dosing, inform the shift leader and the mixing operator, and put the pipe in quarantine following QCL-QA-WI-0001."],
    ]),

    h(2, "Records"),
    bullets([
      "Shift log: start and end time of the changeover, old and new product, purge compound and its lot number, metres of scrap.",
      "QC log: wall thickness and outside diameter of each of the first 10 pipes, recorded by the quality lab technician.",
      "Batch card: signed by the mixing operator for the new colour and kept at the line 2 hopper.",
      ["Non-conforming pipe: red QUARANTINE label and an NC report in the QC log, following ", ref("QCL-QA-WI-0001"), "."],
    ]),

    h(2, "References"),
    bullets([
      [ref("EXT-MNT-MAN-0001"), ": Krauss KX-60 single-screw extruder, operating and maintenance manual."],
      [ref("EXT-HSE-SOP-0001"), ": Lockout/tagout on extrusion line 2."],
      [ref("EXT-HSE-LMRA-0001"), ": LMRA for working at the hot die head."],
      [ref("EXT-HSE-SOP-0002"), ": Hot melt burns, first response."],
      [ref("EXT-MNT-SOP-0001"), ": Changing the screen pack on EXL-201."],
      [ref("EXT-OPS-WI-0002"), ": Setting up the vacuum calibration tank VAC-203."],
      [ref("MIX-OPS-WI-0001"), ": Starting a batch on mixer MXR-101."],
      [ref("QCL-QA-SOP-0001"), ": Measuring wall thickness and outside diameter."],
      [ref("QCL-QA-WI-0001"), ": Quarantine and release of non-conforming pipe."],
    ]),
  )
}

export const seedDoc: SeedDoc = {
  code: "EXT-OPS-SOP-0001",
  title: "Colour and product changeover on extrusion line 2",
  type: "sop",
  area: "EXT",
  discipline: "OPS",
  status: "draft",
  editions: [
    { body: changeover(false), publishedDaysAgo: 165 },
    { body: changeover(true), publishedDaysAgo: null },
  ],
  assets: ["EXL-201", "MXR-101", "SAW-202"],
  nextReviewInDays: 200,
  tags: ["changeover", "purge", "line 2"],
  images: [
    {
      key: "ext-ops-sop-0001/purge",
      prompt:
        "Front view of the die head of an industrial single-screw plastic pipe extruder, with a thick rope of molten grey-white plastic flowing down from the round die opening into a wheeled steel scrap bin; an operator standing to the side of the die wearing a face shield, heat-resistant gloves and a long-sleeved jacket.",
    },
    {
      key: "ext-ops-sop-0001/torque-pattern",
      prompt:
        "Close-up of a gloved hand in heat-resistant gloves tightening the bolts of a round pipe extruder die flange with a click-type torque wrench, the bolts arranged in a circle around the flange, viewed slightly from the side.",
    },
    {
      key: "ext-ops-sop-0001/first-pipes",
      prompt:
        "End of a plastic pipe extrusion line: a black polyethylene pipe with blue longitudinal stripes leaving a caterpillar haul-off, a cut length of pipe lying on a tipping table, and an operator with safety glasses and gloves holding a short cut pipe sample.",
    },
  ],
}
