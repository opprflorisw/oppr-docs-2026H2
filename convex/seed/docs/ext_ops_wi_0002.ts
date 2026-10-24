// EXT-OPS-WI-0002: Setting up the vacuum calibration tank VAC-203.
// Plant facts: docs/build/plant-facts.md. Deliberate duplicate #4: the section
// "Setting up the vacuum tank" in EXT-OPS-SOP-0002 repeats steps 2-10 of this
// work instruction nearly word for word. Keep both in step when editing.
import { asset, bullets, callout, doc, h, img, p, ppe, ref, steps, table, type SeedDoc } from "../builders"

const body = doc(
  h(1, "Setting up the vacuum calibration tank VAC-203"),
  p(
    "This work instruction describes how to set up the vacuum calibration tank ",
    asset("VAC-203"),
    " on line 2 before pipe from the extruder ",
    asset("EXL-201"),
    " is pulled through the sizing sleeve. VAC-203 sets the final outside diameter (OD) of the pipe: the vacuum pulls the hot pipe against the sizing sleeve while spray water freezes the outer skin.",
  ),
  p(
    "A wrongly set VAC-203 gives oval pipe, an OD out of tolerance or a rough surface. Most OD rejects on line 2 start at the vacuum tank.",
  ),

  h(2, "Scope"),
  bullets([
    "This work instruction applies to every start-up of line 2 and to every product change on line 2 where the pipe OD changes.",
    "This work instruction covers the sizing sleeve check, the seals, filling with cooling water, the spray nozzles of VAC-203 and of the spray cooling bath behind it, and setting the vacuum.",
    "Changing the sizing sleeve itself is maintenance work and is not covered here; ask the maintenance and safety engineer.",
  ]),

  h(2, "Responsibilities"),
  table([
    ["Role", "Responsibility"],
    ["Line operator", "Sets up VAC-203 with this work instruction and records the settings in the shift log."],
    ["Shift leader", "Makes sure the correct sizing sleeve is fitted before a product change and acts when VAC-203 does not reach its settings."],
    ["Process engineer", "Owns the vacuum and cooling water settings for each product."],
  ]),

  h(2, "Personal protective equipment"),
  p("Wear safety glasses, gloves, safety shoes and hearing protection at VAC-203. Hall 2 is above 85 dB(A)."),
  ppe("glasses,gloves,boots,ear-pro"),

  callout(
    "caution",
    "The floor around VAC-203 gets wet during filling and when the lid is open. Mop up spilled water at once: a wet floor next to a running line is a slip hazard.",
  ),
  callout(
    "caution",
    "The VAC-203 lid is heavy. Open and close the VAC-203 lid with both hands on the handle and keep your fingers away from the lid edge and the lid clamps.",
  ),

  h(2, "Tools and materials"),
  bullets([
    "Product card for the pipe that runs next (OD, SDR, colour).",
    "Spare O-rings and pipe entry seals for the fitted sizing sleeve, from the spare parts cabinet at line 2.",
    "Nozzle pin for clearing blocked spray nozzles.",
    "Torch for looking into the tank.",
    "Mop and bucket.",
    "Shift log.",
  ]),

  h(2, "Procedure"),
  img(
    "ext-ops-wi-0002/sizing-sleeve-flange",
    "The OD of the sizing sleeve is stamped on the sleeve flange at the inlet of VAC-203.",
  ),
  steps([
    "Check on the product card which pipe outside diameter (OD) runs next on line 2.",
    "Check that the sizing sleeve fitted in VAC-203 matches the pipe OD; the OD is stamped on the sleeve flange.",
    "Inspect the sizing sleeve O-ring and the pipe entry seal of VAC-203 and replace any seal that is cut, flattened or hardened.",
    "Close the drain valve of VAC-203 and open the cooling water supply valve.",
    "Fill VAC-203 with cooling water up to the upper sight-glass mark.",
    "Start the VAC-203 circulation pump and check that the cooling water temperature is between 15 and 20 °C.",
    "Open the VAC-203 lid and check that all spray nozzles run with a full, even fan; clear a blocked nozzle with the nozzle pin.",
    "Check that all spray nozzles of the spray cooling bath behind VAC-203 also run.",
    "When the pipe runs through the sizing sleeve, close the VAC-203 lid and lock both lid clamps.",
    "Switch on the VAC-203 vacuum pump and set the vacuum to -0.3 bar; the acceptable range is -0.2 to -0.4 bar.",
    "Record the sleeve size, the vacuum and the cooling water temperature of VAC-203 in the shift log.",
  ]),
  img(
    "ext-ops-wi-0002/sight-glass",
    "The cooling water in VAC-203 must reach the upper sight-glass mark before the vacuum is switched on.",
  ),
  img(
    "ext-ops-wi-0002/spray-nozzles",
    "Inside VAC-203 every spray nozzle must give a full, even fan of water onto the pipe.",
  ),

  h(2, "Checks and acceptance criteria"),
  table([
    ["Check", "Acceptance criterion", "When"],
    ["Sizing sleeve of VAC-203", "OD stamped on the sleeve flange equals the OD on the product card", "Before every start-up and every OD change"],
    ["Seals of VAC-203", "No cuts, flat spots or hard seals on the sleeve O-ring and the pipe entry seal", "Before every start-up"],
    ["Water level of VAC-203", "Water up to the upper sight-glass mark", "After filling, and every hour while running"],
    ["Cooling water temperature of VAC-203", "15 to 20 °C", "After starting the circulation pump, and every hour while running"],
    ["Spray nozzles of VAC-203 and the spray cooling bath", "All nozzles run with a full, even fan", "Before closing the lid"],
    ["Vacuum of VAC-203", "-0.3 bar set point, acceptable -0.2 to -0.4 bar", "After closing the lid, and every hour while running"],
  ]),

  h(2, "If something goes wrong"),
  table([
    ["Symptom", "Likely cause", "Action"],
    ["Vacuum of VAC-203 does not reach -0.2 bar", "Lid clamp open, lid seal or pipe entry seal leaking", "Check both lid clamps, then listen for hissing at the seals and replace a leaking seal at the next stop"],
    ["Vacuum of VAC-203 goes beyond -0.4 bar", "Vacuum control valve set wrong or water drain blocked", "Set the vacuum back to -0.3 bar and tell the shift leader if it does not hold"],
    ["Cooling water of VAC-203 above 20 °C", "Chiller not running or circulation pump flow too low", "Check that the chiller runs and that the supply valve is fully open; tell the shift leader"],
    ["Pipe OD below the minimum", "Vacuum too high or wrong sizing sleeve", "Check the sleeve size against the product card, then set the vacuum to -0.3 bar"],
    ["Pipe oval after VAC-203", "Blocked spray nozzles or water level too low", "Clear the nozzles with the nozzle pin and top up to the upper sight-glass mark"],
    ["Water on the floor next to VAC-203", "Drain valve not closed or a leaking hose", "Close the drain valve, mop the floor and report a leaking hose to maintenance"],
  ]),

  h(2, "Records"),
  bullets([
    "Write the sizing sleeve size, the vacuum and the cooling water temperature of VAC-203 in the shift log at every start-up and every OD change.",
    "Write a replaced seal of VAC-203 in the shift log and tell maintenance so the spare is reordered.",
    "Report every vacuum or water problem that you cannot solve to the shift leader and write it in the shift log.",
  ]),

  h(2, "References"),
  bullets([
    [ref("EXT-OPS-SOP-0002"), " Starting line 2 from cold."],
    [ref("EXT-OPS-SOP-0003"), " Shutting down line 2."],
    [ref("QCL-QA-SOP-0001"), " Measuring wall thickness and outside diameter."],
    [ref("EXT-HSE-SOP-0001"), " Lockout/tagout on extrusion line 2."],
  ]),
)

export const seedDoc: SeedDoc = {
  code: "EXT-OPS-WI-0002",
  title: "Setting up the vacuum calibration tank VAC-203",
  type: "work_instruction",
  area: "EXT",
  discipline: "OPS",
  status: "published",
  editions: [{ body, publishedDaysAgo: 290 }],
  assets: ["VAC-203"],
  nextReviewInDays: 75,
  tags: ["vacuum tank", "start-up", "outside diameter"],
  images: [
    {
      key: "ext-ops-wi-0002/sizing-sleeve-flange",
      prompt:
        "close-up of the brass sizing sleeve flange at the inlet of a stainless steel vacuum calibration tank on a plastic pipe extrusion line, a gloved finger pointing at the stamped size marking on the flange, no readable text",
    },
    {
      key: "ext-ops-wi-0002/sight-glass",
      prompt:
        "side view of a vertical glass sight tube on a stainless steel vacuum calibration tank, water level standing exactly at an upper metal marker ring, a vacuum dial gauge mounted next to it",
    },
    {
      key: "ext-ops-wi-0002/spray-nozzles",
      prompt:
        "view into an open stainless steel vacuum calibration tank from above, a row of spray nozzles each giving a full even fan of water onto a black plastic pipe running through a sizing sleeve",
    },
  ],
}
