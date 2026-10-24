// EXT-MNT-SOP-0001: Changing the screen pack on EXL-201.
// Plant facts: docs/build/plant-facts.md.
// v1 Published (~200 days ago): change only triggered by a melt pressure rise
// of more than 30 bar above the product baseline.
// v2 in review (Significant change for the demo): adds the Krauss rule (every
// product change and at least every 500 operating hours) to the pressure-rise
// trigger, records the operating hours, and adds a pressure test after the
// restart before pipe is threaded. Training EXT-TRN-0003 uses this document.
// Clamp torque is deliberately not given here: it refers to EXT-MNT-MAN-0001.
import { asset, b, bullets, callout, doc, h, img, p, ppe, ref, steps, table, type Node, type SeedDoc } from "../builders"

type StepItem = string | Node | (string | Node)[]

function build(v2: boolean) {
  const when = v2
    ? [
        p(
          "Change the screen pack of EXL-201 at every product change, and at least every 500 operating hours, or when the melt pressure at production speed rises more than 30 bar above the baseline for that product, whichever comes first.",
        ),
        p(
          "The 500 operating hours are counted on the operating hours counter of the EXL-201 panel from the reading written in the maintenance log at the last screen pack change.",
        ),
        p(
          "The baseline is the melt pressure of EXL-201 at production speed written in the maintenance log after the last screen pack change for the same product.",
        ),
      ]
    : [
        p(
          "Change the screen pack of EXL-201 when the melt pressure at production speed rises more than 30 bar above the baseline for that product.",
        ),
        p(
          "The baseline is the melt pressure of EXL-201 at production speed written in the maintenance log after the last screen pack change for the same product.",
        ),
      ]

  const prepare: StepItem[] = [
    ...(v2
      ? ["Write the operating hours counter reading of EXL-201 in the maintenance log."]
      : []),
    "Write the melt pressure of EXL-201 at production speed in the maintenance log before you stop the line.",
    [
      "Stop line 2 for a short stop with ",
      ref("EXT-OPS-SOP-0003"),
      ": run the extruder empty and leave all heating zones of EXL-201 at set point.",
    ],
    "Switch off the screw drive at the EXL-201 panel and lock the lockable screw drive switch on the EXL-201 panel in the off position with your personal red lock and tag; the heating zones stay on.",
    "Press screw start on the EXL-201 panel to verify that the screw does not turn, then set the screw selector back to off.",
    "Check that the melt pressure on the EXL-201 panel reads 0 bar before you open the adapter clamp.",
  ]

  const change: StepItem[] = [
    "Standing to the side of the adapter, open the adapter clamp of EXL-201 and swing the die head aside on its hinge.",
    "Pull the breaker plate out of the barrel flange of EXL-201 with the puller hook and lay the breaker plate on the heat-resistant tray.",
    "Take the old screens off the breaker plate with the brass spatula and keep the old screens on the tray for inspection.",
    "Clean every hole of the hot breaker plate with the brass brush and the brass pins; never use a steel tool on the breaker plate.",
    "Inspect the breaker plate and the sealing faces of the barrel flange and the adapter for cracks, dents and burnt material, and replace a damaged breaker plate.",
    "Lay three new screens on the screw side of the breaker plate in this order from the screw: 40 mesh, 80 mesh, 40 mesh.",
    "Fit the breaker plate into the barrel flange recess of EXL-201 with the screens facing the screw.",
    [
      "Clean the sealing faces, swing the die head back, close the adapter clamp and tighten the clamp bolts to the torque given in ",
      ref("EXT-MNT-MAN-0001"),
      ".",
    ],
    "Wait 15 minutes so the breaker plate and the new screens reach the set temperature of EXL-201.",
  ]

  const restart: StepItem[] = v2
    ? [
        "Remove your own lock and tag from the screw drive switch on the EXL-201 panel.",
        "Standing to the side of the die, start the EXL-201 screw at 20 rpm into the scrap tray.",
        "Pressure test: run the EXL-201 screw at 60 rpm into the scrap tray for 10 minutes and check that no melt comes out at the adapter clamp and that the melt pressure stays steady within 10 bar.",
        [
          "When the pressure test passes, thread the start-up pipe and ramp up to production speed as in ",
          ref("EXT-OPS-SOP-0002"),
          ".",
        ],
        "At production speed, write the new melt pressure of EXL-201 in the maintenance log as the new baseline for the product.",
      ]
    : [
        "Remove your own lock and tag from the screw drive switch on the EXL-201 panel.",
        "Standing to the side of the die, start the EXL-201 screw at 20 rpm into the scrap tray and check that no melt comes out at the adapter clamp.",
        [
          "Thread the start-up pipe and ramp up to production speed as in ",
          ref("EXT-OPS-SOP-0002"),
          ".",
        ],
        "At production speed, write the new melt pressure of EXL-201 in the maintenance log as the new baseline for the product.",
      ]

  const checks: string[][] = [
    ["Check", "Acceptance criterion", "When"],
    ["Screw drive of EXL-201", "Screw drive switch on the EXL-201 panel locked off; screw does not turn on a try-start", "Before opening the adapter clamp"],
    ["Melt pressure of EXL-201", "0 bar", "Before opening the adapter clamp"],
    ["Heating zones of EXL-201", "At set point during the whole screen pack change, so the die and barrel stay above 150 °C", "During the screen pack change"],
    ["Breaker plate", "All holes open, no cracks or dents, sealing faces clean", "Before fitting the breaker plate"],
    ["Screen order", "40 mesh, 80 mesh, 40 mesh from the screw side, screens facing the screw", "Before fitting the breaker plate"],
    ...(v2
      ? [["Pressure test", "10 minutes at 60 rpm: no melt at the adapter clamp, melt pressure steady within 10 bar", "Before threading the pipe"]]
      : [["Adapter clamp", "No melt comes out at the adapter clamp", "After starting the screw"]]),
    ["Melt pressure after the change", "180 to 250 bar at production speed and lower than the reading before the change", "At production speed"],
  ]

  return doc(
    h(1, "Changing the screen pack on EXL-201"),
    p(
      "This SOP describes how to change the screen pack of the extruder ",
      asset("EXL-201"),
      " on line 2. The screen pack is three wire mesh screens (40, 80 and 40 mesh) on a breaker plate between the barrel and the adapter. The screens catch dirt and unmelted particles; a blocked screen pack raises the melt pressure and gives specks in the pipe.",
    ),
    p(
      "The screen pack is changed hot, with the heating zones at set point, so the PE in the breaker plate stays soft. This makes it hot work at the die head: do the LMRA EXT-HSE-LMRA-0001 first.",
    ),

    h(2, "When to change the screen pack"),
    ...when,

    h(2, "Scope"),
    bullets([
      "This SOP applies to the screen pack and breaker plate of EXL-201 on line 2.",
      "This SOP does not cover the replacement of heater bands, the screw or the die; that work needs a full lockout of line 2 with EXT-HSE-SOP-0001.",
    ]),

    h(2, "Responsibilities"),
    table([
      ["Role", "Responsibility"],
      ["Line operator (trained in screen pack change)", "Carries out this SOP and writes the readings in the maintenance log."],
      ["Shift leader", "Plans the screen pack change at the end of a production run together with the line operator, countersigns the LMRA and decides when line 2 restarts."],
      ["Maintenance and safety engineer", "Owns this SOP, keeps spare screens and breaker plates in stock and replaces damaged breaker plates."],
      ["Process engineer", "Follows the melt pressure baselines and is called when the melt pressure stays high after a change."],
    ]),

    h(2, "Personal protective equipment"),
    p("Wear heat-resistant gloves (EN 407), a face shield over safety glasses, long sleeves, safety shoes and hearing protection. Hall 2 is above 85 dB(A)."),
    ppe("gloves,face-shield,glasses,clothing,boots,ear-pro"),

    h(2, "Tools and materials"),
    bullets([
      "Screen set for EXL-201: one 80 mesh and two 40 mesh screens, from the spare parts cabinet at line 2.",
      "Spare breaker plate for EXL-201.",
      "Puller hook for the breaker plate.",
      "Brass spatula, brass brush and brass cleaning pins.",
      "Heat-resistant tray.",
      "Torque wrench and the clamp torque value from EXT-MNT-MAN-0001.",
      "Scrap tray on wheels.",
      "Personal red lock and tag.",
      "Maintenance log for EXL-201.",
    ]),

    h(2, "Procedure"),
    h(3, "Preparing"),
    callout(
      "loto",
      "Lock the screw drive switch of EXL-201 before you open the adapter clamp. A screw that starts while the adapter is open pushes hot melt out of the barrel flange. Only the person who placed a lock removes the lock. The screw drive lock is only for the screen pack change, where the heating must stay on; for any other work inside the guarding, lock out line 2 at the main isolator in panel MCC-2 with EXT-HSE-SOP-0001.",
    ),
    steps(prepare),

    h(3, "Changing the screens"),
    callout(
      "danger",
      "Never open the adapter clamp of EXL-201 while the melt pressure is above 0 bar. Melt under pressure comes out as a hot jet.",
    ),
    callout(
      "hotwork",
      "The barrel flange, the breaker plate and the adapter are at production temperature. Never stand in front of the barrel flange or the die; work from the side.",
    ),
    img(
      "ext-mnt-sop-0001/opening-adapter-clamp",
      "The adapter clamp of EXL-201 is opened from the side, with face shield and EN 407 gloves, and the die head swings aside on its hinge.",
    ),
    steps(change),
    img(
      "ext-mnt-sop-0001/breaker-plate-screens",
      "The breaker plate of EXL-201 with the three screens in order from the screw side: 40 mesh, 80 mesh, 40 mesh.",
    ),
    img(
      "ext-mnt-sop-0001/cleaning-breaker-plate",
      "The holes of the hot breaker plate are cleaned with a brass brush and brass pins, never with steel tools.",
    ),

    h(3, v2 ? "Restarting and pressure test" : "Restarting"),
    steps(restart),

    h(2, "Checks and acceptance criteria"),
    table(checks),

    h(2, "If something goes wrong"),
    table([
      ["Symptom", "Likely cause", "Action"],
      ["Melt comes out at the adapter clamp after the restart", "Breaker plate not seated, dirty sealing face or clamp bolts not at torque", "Stop the screw, lock the screw drive switch, and reseat the breaker plate after cleaning the sealing faces"],
      ...(v2
        ? [["Pressure test fails: melt at the adapter clamp or melt pressure not steady within 10 bar", "Breaker plate not seated or screens folded", "Stop the screw, lock the screw drive switch again and check the breaker plate seating before a new pressure test; never thread pipe after a failed pressure test"]]
        : []),
      ["Melt pressure stays more than 30 bar above the baseline after the change", "Screens fitted in the wrong order, a blocked breaker plate hole or a cold zone", "Check all zone temperatures, then tell the process engineer"],
      ["Melt pressure of EXL-201 reaches the 320 bar alarm", "Blocked screen pack or a cold zone", "Stop the screw at once; the melt pressure must never exceed 350 bar"],
      ["Breaker plate stuck in the barrel flange", "Melt frozen around the breaker plate", "Wait 10 minutes with the heating at set point and use the puller hook again; never hit the breaker plate with a steel hammer"],
      ["Old screens torn or full of black material", "Degraded material or contamination in the granulate", "Keep the old screens, write the finding in the maintenance log and tell the process engineer"],
    ]),

    h(2, "Records"),
    bullets([
      ...(v2
        ? ["Write the operating hours counter reading of EXL-201 at the screen pack change in the maintenance log."]
        : []),
      "Write the melt pressure of EXL-201 before the change and the new baseline after the change in the maintenance log.",
      "Write the date, the product, the condition of the old screens and the name of the person who did the change in the maintenance log.",
      "Keep the signed LMRA card with the shift log.",
      "Write the screen pack change in the shift log.",
    ]),

    h(2, "References"),
    bullets([
      [ref("EXT-MNT-MAN-0001"), " Krauss KX-60 single-screw extruder: operating and maintenance manual."],
      [ref("EXT-HSE-LMRA-0001"), " LMRA: working at the hot die head."],
      [ref("EXT-HSE-SOP-0001"), " Lockout/tagout on extrusion line 2."],
      [ref("EXT-OPS-SOP-0002"), " Starting line 2 from cold."],
      [ref("EXT-OPS-SOP-0003"), " Shutting down line 2."],
      [ref("EXT-HSE-SOP-0002"), " Hot melt burns: first response."],
    ]),
    p(b("Owner. "), "The maintenance and safety engineer owns this SOP."),
  )
}

export const seedDoc: SeedDoc = {
  code: "EXT-MNT-SOP-0001",
  title: "Changing the screen pack on EXL-201",
  type: "sop",
  area: "EXT",
  discipline: "MNT",
  status: "in_review",
  editions: [
    { body: build(false), publishedDaysAgo: 200 },
    {
      body: build(true),
      publishedDaysAgo: null,
      significantChange: true,
      changeNote:
        "The screen pack is now also changed at every product change and at least every 500 operating hours (was: only when melt pressure rose more than 30 bar above the baseline). The operating hours are recorded at each change, and a 10-minute pressure test at 60 rpm is added after the restart, before pipe is threaded.",
    },
  ],
  assets: ["EXL-201"],
  nextReviewInDays: 165,
  tags: ["screen pack", "breaker plate", "melt pressure", "maintenance"],
  images: [
    {
      key: "ext-mnt-sop-0001/opening-adapter-clamp",
      prompt:
        "operator in face shield and grey heat-resistant gauntlet gloves standing to the side of a single-screw extruder, opening the hinged clamp ring between the barrel flange and the adapter, the die head swung aside on its hinge",
    },
    {
      key: "ext-mnt-sop-0001/breaker-plate-screens",
      prompt:
        "round steel breaker plate with many small drilled holes lying on a heat-resistant tray, next to it three round wire mesh screens laid out in a row: a coarse screen, a fine screen and a coarse screen",
    },
    {
      key: "ext-mnt-sop-0001/cleaning-breaker-plate",
      prompt:
        "close-up of gloved hands cleaning the holes of a hot round steel breaker plate with a brass wire brush, brass cleaning pins lying on a heat-resistant tray beside it",
    },
  ],
}
