// EXT-OPS-SOP-0002: Starting line 2 from cold.
// Plant facts: docs/build/plant-facts.md.
// Deliberate contradiction #2: this SOP says barrel zones "never above 230 °C";
// the Krauss manual EXT-MNT-MAN-0001 gives an operating envelope of 170-220 °C.
// Deliberate duplicate #4: the section "Setting up the vacuum tank" repeats
// steps 2-10 of EXT-OPS-WI-0002 nearly word for word. Keep both in step.
import { asset, b, bullets, callout, doc, h, img, p, ppe, ref, steps, table, type SeedDoc } from "../builders"

const body = doc(
  h(1, "Starting line 2 from cold"),
  p(
    "This SOP describes how to start extrusion line 2 when the extruder ",
    asset("EXL-201"),
    " is cold: after a weekend, after maintenance, or after any stop where the heating zones were switched off. It covers heating up and the 90-minute soak, setting up the vacuum calibration tank ",
    asset("VAC-203"),
    ", starting the screw, threading the pipe through the haul-off and saw ",
    asset("SAW-202"),
    ", and running in until the first pipes are released.",
  ),
  p(
    "A cold start done in a hurry damages the screw, blocks the screen pack and fills the scrap cage. Follow the steps in order and do not skip the soak.",
  ),

  h(2, "Scope"),
  bullets([
    "This SOP applies to every start of line 2 where the barrel of EXL-201 has cooled down below its set points.",
    "This SOP does not apply to a restart after a short stop where the heating zones stayed at set point; for a short stop, follow the restart section in EXT-OPS-SOP-0003.",
    "This SOP does not cover a colour or product changeover on a running line; for a changeover, follow EXT-OPS-SOP-0001.",
    "The zone set points in this SOP are for 110 mm SDR 11 pipe. For every other product, use the set points on the product card.",
  ]),

  h(2, "Responsibilities"),
  table([
    ["Role", "Responsibility"],
    ["Shift leader", "Decides that line 2 may start, checks that all locks are off and releases the line for production after the first 10 pipes pass."],
    ["Line operator", "Carries out this SOP, stays at line 2 during the start-up and records the start-up in the shift log."],
    ["Mixing operator", "Supplies dried and coloured granulate from DRY-102 and MXR-101 to the line 2 hopper."],
    ["Quality lab technician", "Measures wall thickness and outside diameter of the first 10 pipes with QCL-QA-SOP-0001."],
    ["Process engineer", "Owns this SOP and the zone set points on the product cards."],
  ]),

  h(2, "Personal protective equipment"),
  p("Wear safety glasses, heat-resistant gloves (EN 407), safety shoes, long sleeves and hearing protection for the whole start-up. Hall 2 is above 85 dB(A)."),
  ppe("glasses,gloves,boots,clothing,ear-pro"),
  p("Add a face shield for every task at the die: starting the screw, cutting melt and threading the start-up pipe."),
  ppe("face-shield"),

  h(2, "Tools and materials"),
  bullets([
    "Product card for the pipe to be made (OD, SDR, colour, zone set points, line speed).",
    "Scrap tray on wheels for the melt from the die.",
    "Start-up pipe (a 2 m length of the same OD with a pulling eye) and the pulling rope.",
    "Brass scraper and melt knife.",
    "Spare O-rings and pipe entry seals for the sizing sleeve of VAC-203.",
    "Nozzle pin for clearing spray nozzles.",
    "Shift log.",
  ]),

  h(2, "Before you start"),
  bullets([
    "Read the shift log of the previous shift for open faults, maintenance work and the reason for the stop.",
    "Check that no lock or tag is left on panel MCC-2 or anywhere on line 2. If a lock is still in place, find the person who placed the lock: only that person removes the lock.",
    "Walk line 2 from the hopper to the tipping table and check that all guards are closed, the saw guard of SAW-202 is shut and the floor is clear of pipe offcuts and granulate.",
    "Check with the mixing operator that dried granulate is ready: dried in DRY-102 at 80 °C for at least 4 hours, with a dew point of -40 °C or lower.",
    "Check that the die and the sizing sleeve fitted on line 2 match the product card.",
    "Check that the feed throat cooling water of EXL-201 is on.",
  ]),

  h(2, "Zone set points for 110 mm SDR 11"),
  p("Set the heating zones of EXL-201 to these values for 110 mm SDR 11 pipe. For every other product, use the set points on the product card."),
  table([
    ["Zone of EXL-201", "Set point"],
    ["Feed zone (zone 1)", "175 °C"],
    ["Zone 2", "190 °C"],
    ["Zone 3", "200 °C"],
    ["Zone 4", "205 °C"],
    ["Adapter", "205 °C"],
    ["Die", "210 °C"],
  ]),
  callout(
    "warning",
    "Never set any barrel zone of EXL-201 above 230 °C. Above 230 °C the PE100 melt starts to degrade, which gives black specks, a rough inner surface and brittle pipe.",
  ),

  h(2, "Procedure"),
  h(3, "Heating up and soaking"),
  img(
    "ext-ops-sop-0002/heating-zones",
    "The heater bands along the barrel of EXL-201 heat zone 1 to zone 4, the adapter and the die.",
  ),
  callout(
    "danger",
    "Never turn the screw of EXL-201 before the 90-minute soak is complete. Solid PE in the screw flights can break the screw or the gearbox when the screw turns too early.",
  ),
  steps([
    "Enter the zone set points from the product card on the EXL-201 panel and check every value against the product card before you confirm.",
    "Switch on all heating zones of EXL-201, including the adapter and the die.",
    "When all zones of EXL-201 are within 3 °C of their set point, start the 90-minute soak timer on the EXL-201 panel and do not turn the screw during the soak.",
  ]),

  h(2, "Setting up the vacuum tank"),
  p(
    "Set up the vacuum calibration tank ",
    asset("VAC-203"),
    " during the soak, so it is ready when the first melt comes out of the die. These steps are the same as in work instruction EXT-OPS-WI-0002.",
  ),
  callout(
    "caution",
    "The floor around VAC-203 gets wet during filling and when the lid is open. Mop up spilled water at once: a wet floor next to a running line is a slip hazard.",
  ),
  steps([
    "Check that the sizing sleeve fitted in VAC-203 matches the pipe OD on the product card; the OD is stamped on the sleeve flange.",
    "Inspect the sizing sleeve O-ring and the pipe entry seal of VAC-203 and replace any seal that is cut, flattened or hardened.",
    "Close the drain valve of VAC-203 and open the cooling water supply valve.",
    "Fill VAC-203 with cooling water up to the upper sight-glass mark.",
    "Start the VAC-203 circulation pump and check that the cooling water temperature is between 15 and 20 °C.",
    "Open the VAC-203 lid and check that all spray nozzles run with a full, even fan; clear a blocked nozzle with the nozzle pin.",
    "Check that all spray nozzles of the spray cooling bath behind VAC-203 also run.",
    "When the pipe runs through the sizing sleeve, close the VAC-203 lid and lock both lid clamps.",
    "Switch on the VAC-203 vacuum pump and set the vacuum to -0.3 bar; the acceptable range is -0.2 to -0.4 bar.",
  ]),

  h(2, "Starting the screw and running in"),
  callout(
    "hotwork",
    "Never stand in front of the die of EXL-201 when the screw starts. Moisture or a cold spot can make the die spit hot melt. Stand to the side and wear the face shield.",
  ),
  callout(
    "danger",
    "If the melt pressure of EXL-201 reaches the 320 bar alarm, stop the screw at once. The melt pressure must never exceed 350 bar.",
  ),
  steps([
    "Open the hopper slide gate of EXL-201 so granulate fills the feed throat.",
    "Place the scrap tray under the die of EXL-201 and stand to the side of the die.",
    "Start the EXL-201 screw at 20 rpm and watch the melt pressure on the EXL-201 panel.",
    "Let the melt of EXL-201 run into the scrap tray until the melt comes out smooth, evenly coloured and free of bubbles.",
    [
      "Join the melt to the start-up pipe and pull the start-up pipe through the sizing sleeve of VAC-203 and into the haul-off of ",
      asset("SAW-202"),
      " at low haul-off speed.",
    ],
    "Close the VAC-203 lid and switch on the vacuum as described in the section Setting up the vacuum tank.",
    "Increase the EXL-201 screw speed to 60 rpm, then ramp up to the production speed on the product card (normally 90-120 rpm) over 5 minutes, with the SAW-202 haul-off speed following the line speed.",
    "Set the cut length on the SAW-202 panel to 6 m or 12 m as the product card says.",
  ]),
  img(
    "ext-ops-sop-0002/threading-start-up-pipe",
    "The melt from the die of EXL-201 is joined to the start-up pipe and pulled into the sizing sleeve of VAC-203.",
  ),
  p(
    b("First pipes. "),
    "Scrap the first 3 metres of pipe after a cold start. Have each of the first 10 pipes measured by the Quality lab with QCL-QA-SOP-0001 before the shift leader releases line 2 for production.",
  ),
  img(
    "ext-ops-sop-0002/first-pipe-check",
    "The line operator checks the surface and the stripes of the first pipe after the saw of SAW-202.",
  ),

  h(2, "Checks and acceptance criteria"),
  table([
    ["Check", "Acceptance criterion", "When"],
    ["Zone temperatures of EXL-201", "All zones within 3 °C of set point, no zone above 230 °C", "Before starting the soak timer"],
    ["Soak of EXL-201", "90 minutes complete with all zones at set point", "Before turning the screw"],
    ["Cooling water of VAC-203", "15 to 20 °C, water up to the upper sight-glass mark", "Before closing the lid"],
    ["Vacuum of VAC-203", "-0.3 bar, acceptable -0.2 to -0.4 bar", "After closing the lid"],
    ["Melt pressure of EXL-201", "180 to 250 bar at production speed, alarm at 320 bar", "During the ramp-up and every hour"],
    ["Outside diameter of 110 mm SDR 11 pipe", "110.0 to 110.7 mm", "Each of the first 10 pipes"],
    ["Wall thickness of 110 mm SDR 11 pipe", "10.0 to 11.1 mm", "Each of the first 10 pipes"],
    ["Cut length at SAW-202", "6 m or 12 m, ±10 mm", "First 3 cut pipes"],
    ["Pipe surface", "Smooth inside and outside, no bubbles, no black specks, stripes straight and in the right colour", "Each of the first 10 pipes"],
  ]),

  h(2, "If something goes wrong"),
  table([
    ["Symptom", "Likely cause", "Action"],
    ["A zone of EXL-201 does not reach its set point", "Heater band or thermocouple failure", "Do not start the soak timer; call maintenance and write the zone number in the shift log"],
    ["Melt pressure of EXL-201 rises fast above 250 bar at 20 rpm", "Screw started before the soak was complete, a cold zone or a blocked screen pack", "Stop the screw, check all zone temperatures, and call the process engineer before you restart"],
    ["Bubbles or foam in the melt from EXL-201", "Wet granulate", "Ask the mixing operator to check the DRY-102 dew point and drying time; keep the melt in the scrap tray"],
    ["Black specks in the melt or the pipe", "Degraded material from overheating or from melt left in the die", "Check that no zone is above its set point, purge into the scrap tray and tell the process engineer"],
    ["Melt tears between the die and VAC-203", "Haul-off of SAW-202 pulls too fast for the screw speed", "Lower the haul-off speed and thread the start-up pipe again"],
    ["Vacuum of VAC-203 does not reach -0.2 bar", "Lid clamp open or a leaking seal", "Check both lid clamps and listen for hissing at the seals"],
    ["Pipe OD below the minimum", "Vacuum too high or wrong sizing sleeve", "Check the sleeve size against the product card, then set the vacuum to -0.3 bar"],
  ]),

  h(2, "Records"),
  bullets([
    "Write the start time, the product, the batch number of the granulate and the time the soak ended in the shift log.",
    "Write the melt pressure of EXL-201 at production speed in the shift log: this is the baseline for the product until the next screen pack change.",
    "Write the sizing sleeve size, the vacuum and the cooling water temperature of VAC-203 in the shift log.",
    "The Quality lab records the measurements of the first 10 pipes in the QC log.",
    "Write every fault and every deviation from this SOP in the shift log and tell the shift leader.",
  ]),

  h(2, "References"),
  bullets([
    [ref("EXT-MNT-MAN-0001"), " Krauss KX-60 single-screw extruder: operating and maintenance manual."],
    [ref("EXT-OPS-WI-0002"), " Setting up the vacuum calibration tank VAC-203."],
    [ref("EXT-OPS-SOP-0003"), " Shutting down line 2."],
    [ref("EXT-OPS-SOP-0001"), " Colour and product changeover on extrusion line 2."],
    [ref("MIX-OPS-SOP-0002"), " Drying PE granulate on dryer DRY-102."],
    [ref("QCL-QA-SOP-0001"), " Measuring wall thickness and outside diameter."],
    [ref("EXT-HSE-SOP-0001"), " Lockout/tagout on extrusion line 2."],
    [ref("EXT-HSE-LMRA-0001"), " LMRA: working at the hot die head."],
    [ref("EXT-MNT-MAN-0002"), " Nordcut HC-110 haul-off and PS-110 planetary saw: manual."],
  ]),
)

export const seedDoc: SeedDoc = {
  code: "EXT-OPS-SOP-0002",
  title: "Starting line 2 from cold",
  type: "sop",
  area: "EXT",
  discipline: "OPS",
  status: "published",
  editions: [{ body, publishedDaysAgo: 240 }],
  assets: ["EXL-201", "VAC-203", "SAW-202"],
  nextReviewInDays: 125,
  tags: ["start-up", "line 2", "set points"],
  images: [
    {
      key: "ext-ops-sop-0002/heating-zones",
      prompt:
        "side view of the barrel of a single-screw plastic pipe extruder with a row of ceramic heater bands, each band with its own thermocouple cable, from the feed hopper on the left to the die head on the right",
    },
    {
      key: "ext-ops-sop-0002/threading-start-up-pipe",
      prompt:
        "operator in face shield, heat-resistant gloves and long sleeves standing to the side of an extruder die head, guiding a glowing soft strand of black plastic melt onto the end of a short start-up pipe that leads into the inlet of a stainless steel vacuum calibration tank",
    },
    {
      key: "ext-ops-sop-0002/first-pipe-check",
      prompt:
        "operator in safety glasses and gloves inspecting the cut end and outer surface of a freshly cut black plastic pressure pipe with blue stripes, lying on a tipping table after a planetary saw on an extrusion line",
    },
  ],
}
