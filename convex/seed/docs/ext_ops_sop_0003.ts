// EXT-OPS-SOP-0003: Shutting down line 2.
// Plant facts: docs/build/plant-facts.md. No deliberate contradiction here.
// Deliberately says nothing about how long dried granulate may stay in the
// hopper (a known gap in the library).
import { asset, b, bullets, callout, doc, h, img, p, ppe, ref, steps, table, type SeedDoc } from "../builders"

const body = doc(
  h(1, "Shutting down line 2"),
  p(
    "This SOP describes the planned shutdown of extrusion line 2: running the extruder ",
    asset("EXL-201"),
    " empty, taking the last pipe through the vacuum calibration tank ",
    asset("VAC-203"),
    " and the haul-off and saw ",
    asset("SAW-202"),
    ", and leaving the line in a safe state for the next shift.",
  ),
  p(
    "A clean shutdown makes the next start-up fast. Melt left in the die burns, blocked spray nozzles give oval pipe, and a missing note in the shift log costs the next shift an hour.",
  ),

  h(2, "Scope"),
  bullets([
    "This SOP applies to every planned stop of line 2: end of the production week, planned maintenance, a long wait for material, and a short stop of up to 2 hours.",
    "This SOP does not apply to an emergency. In an emergency, press the nearest emergency stop of line 2 and call the shift leader.",
    "A shutdown is not an isolation. Before any work inside the guarding of line 2, follow EXT-HSE-SOP-0001.",
  ]),

  h(2, "Responsibilities"),
  table([
    ["Role", "Responsibility"],
    ["Shift leader", "Plans the stop, decides between a short stop and a full shutdown, and checks the line before handover."],
    ["Line operator", "Carries out this SOP and records the shutdown in the shift log."],
    ["Mixing operator", "Stops sending batches from MXR-101 to line 2 and sets dryer DRY-102 as MIX-OPS-SOP-0002 says."],
    ["Process engineer", "Owns this SOP."],
  ]),

  h(2, "Personal protective equipment"),
  p("Wear safety glasses, heat-resistant gloves (EN 407), safety shoes, long sleeves and hearing protection. Hall 2 is above 85 dB(A)."),
  ppe("glasses,gloves,boots,clothing,ear-pro"),
  p("Add a face shield for cleaning the die face of EXL-201."),
  ppe("face-shield"),

  callout(
    "loto",
    "Never reach into the haul-off or saw area while the line is only stopped. A stopped line can restart. Lock out line 2 at panel MCC-2 with EXT-HSE-SOP-0001 before any work inside the guarding.",
  ),
  callout(
    "hotwork",
    "The die and barrel of EXL-201 stay hot for at least 6 hours after the heaters are switched off. Treat every part of the die head as hot and wear heat-resistant gloves and a face shield for any work at the die.",
  ),

  h(2, "Tools and materials"),
  bullets([
    "Brass scraper for melt drool on the die face (never a steel tool on the die).",
    "Scrap tray on wheels.",
    "Red scrap marker for run-down pipe.",
    "Broom, dustpan and the granulate waste bin.",
    "Shift log.",
  ]),

  h(2, "Procedure"),
  h(3, "Running the line empty"),
  steps([
    "Tell the shift leader and the mixing operator the planned stop time, so the last batch from MXR-101 is the final batch for line 2.",
    "Write the batch number of the last batch in the shift log.",
    "When the last granulate has entered the hopper of EXL-201, close the hopper slide gate of EXL-201.",
    "Mark every pipe made after the hopper slide gate was closed with the red scrap marker; run-down pipe is not measured and goes to the regrind cage.",
    "Stop the EXL-201 screw as soon as the melt strand from the die thins and breaks; never run the screw dry for more than 2 minutes.",
  ]),
  img(
    "ext-ops-sop-0003/hopper-slide-gate",
    "The hopper slide gate of EXL-201 is closed when the last granulate has entered the hopper.",
  ),
  h(3, "Taking the last pipe out"),
  steps([
    "When the pipe tail enters VAC-203, switch off the VAC-203 vacuum pump.",
    "Let the SAW-202 haul-off pull the pipe tail out of VAC-203 and the spray cooling bath.",
    "Let SAW-202 cut the last full length and put the short tail piece in the regrind cage.",
    "Stop the SAW-202 haul-off when the pipe tail has left the caterpillar tracks, and park the saw of SAW-202 in its home position.",
    "Stop the VAC-203 circulation pump and close the cooling water supply valve of VAC-203.",
    "Drain VAC-203 only for a stop longer than 72 hours or when maintenance asks for it: open the drain valve of VAC-203.",
  ]),
  h(3, "Heating and the die"),
  steps([
    "Choose the heater setting of EXL-201: for a short stop of up to 2 hours, leave all heating zones at set point with the screw stopped; for a longer stop, switch off all heating zones of EXL-201 including the adapter and the die.",
    "Standing to the side of the die, remove the melt drool from the die face of EXL-201 with the brass scraper while the die is still hot.",
    "Leave the feed throat cooling water of EXL-201 running until the feed zone reads below 80 °C, then close the feed throat cooling water valve.",
  ]),
  img(
    "ext-ops-sop-0003/die-face-cleaning",
    "Melt drool is removed from the hot die face of EXL-201 with a brass scraper, standing to the side of the die.",
  ),
  h(3, "Handover"),
  steps([
    "Sweep up granulate and pipe offcuts around line 2; spilled granulate on the floor is a slip hazard.",
    "Write the shutdown in the shift log: stop time, reason, last batch number, number of scrap pipes, and whether the next start is a restart after a short stop or a start from cold.",
  ]),

  h(2, "Restarting after a short stop"),
  p("Use this section only when the heating zones of EXL-201 stayed at set point and the stop lasted no longer than 2 hours. After a longer stop, or when the heating zones were switched off, start line 2 with EXT-OPS-SOP-0002, including the 90-minute soak."),
  bullets([
    "Check on the EXL-201 panel that all zones are at set point before you turn the screw.",
    "Set up VAC-203 again with EXT-OPS-WI-0002.",
    "Open the hopper slide gate, stand to the side of the die and start the screw at 20 rpm into the scrap tray.",
    "Run the melt into the scrap tray until the melt is clean and free of black specks, then thread the start-up pipe as in EXT-OPS-SOP-0002.",
    "Have each of the first 10 pipes after the restart measured with QCL-QA-SOP-0001.",
  ]),

  h(2, "Checks and acceptance criteria"),
  table([
    ["Check", "Acceptance criterion", "When"],
    ["Screw of EXL-201", "0 rpm, screw drive stopped", "After the melt strand breaks"],
    ["Melt pressure of EXL-201", "0 bar before anyone works at the die", "Before cleaning the die face"],
    ["Heating zones of EXL-201", "At set point for a short stop of up to 2 hours; all zones off for a longer stop", "Before handover"],
    ["Vacuum of VAC-203", "Vacuum pump off, gauge at 0 bar", "After the pipe tail has left VAC-203"],
    ["Haul-off of SAW-202", "No pipe between the caterpillar tracks, saw in home position", "Before handover"],
    ["Run-down pipe", "Every pipe made after closing the hopper slide gate is marked red and in the regrind cage", "Before handover"],
    ["Floor around line 2", "No granulate, offcuts or water on the floor", "Before handover"],
  ]),

  h(2, "If something goes wrong"),
  table([
    ["Symptom", "Likely cause", "Action"],
    ["Melt pressure of EXL-201 stays above 0 bar with the screw stopped", "Melt trapped behind a blocked screen pack", "Do not open or clean anything at the die; tell the shift leader and the process engineer"],
    ["Pipe tail collapses in VAC-203", "Vacuum still on when the pipe tail entered VAC-203", "Switch off the vacuum, open the lid and let the haul-off pull the tail out"],
    ["Pipe tail stuck in the SAW-202 haul-off", "Tail too short for the caterpillar tracks to grip", "Stop the haul-off, lock out line 2 with EXT-HSE-SOP-0001, then take the tail out by hand"],
    ["A heating zone of EXL-201 does not switch off", "Contactor fault in the heating control", "Tell the shift leader and call maintenance; do not leave the line until maintenance takes over"],
    ["Water leaks from the feed throat of EXL-201", "Leaking cooling water hose", "Close the feed throat cooling water valve and report the leak to maintenance"],
  ]),

  h(2, "Records"),
  bullets([
    "Write the stop time, the reason, the last batch number and the number of scrap pipes in the shift log.",
    "Write in the shift log whether the heating zones of EXL-201 are on or off, and whether VAC-203 is full or drained.",
    "Write every fault found during the shutdown in the shift log and report it to maintenance.",
  ]),

  h(2, "References"),
  bullets([
    [ref("EXT-OPS-SOP-0002"), " Starting line 2 from cold."],
    [ref("EXT-OPS-WI-0002"), " Setting up the vacuum calibration tank VAC-203."],
    [ref("EXT-HSE-SOP-0001"), " Lockout/tagout on extrusion line 2."],
    [ref("EXT-HSE-LMRA-0001"), " LMRA: working at the hot die head."],
    [ref("MIX-OPS-SOP-0002"), " Drying PE granulate on dryer DRY-102."],
    [ref("QCL-QA-SOP-0001"), " Measuring wall thickness and outside diameter."],
    [ref("EXT-MNT-MAN-0001"), " Krauss KX-60 single-screw extruder: operating and maintenance manual."],
  ]),
  p(b("Note. "), "Questions about this SOP go to the process engineer."),
)

export const seedDoc: SeedDoc = {
  code: "EXT-OPS-SOP-0003",
  title: "Shutting down line 2",
  type: "sop",
  area: "EXT",
  discipline: "OPS",
  status: "published",
  editions: [{ body, publishedDaysAgo: 230 }],
  assets: ["EXL-201", "VAC-203", "SAW-202"],
  nextReviewInDays: 135,
  tags: ["shutdown", "line 2", "handover"],
  images: [
    {
      key: "ext-ops-sop-0003/hopper-slide-gate",
      prompt:
        "gloved hand pulling the lever of a slide gate at the bottom of a stainless steel granulate hopper on top of the feed throat of a single-screw plastic extruder",
    },
    {
      key: "ext-ops-sop-0003/die-face-cleaning",
      prompt:
        "operator in face shield, heat-resistant gloves and long sleeves standing to the side of a round extruder pipe die, scraping a drip of dark plastic melt off the die face with a brass scraper",
    },
  ],
}
