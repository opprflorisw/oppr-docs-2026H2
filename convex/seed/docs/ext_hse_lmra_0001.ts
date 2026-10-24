// EXT-HSE-LMRA-0001: LMRA: working at the hot die head.
// Plant facts: docs/build/plant-facts.md. A last-minute risk assessment card,
// done by the person at the die just before the work starts.
// Says nothing about die bolt torque on purpose (contradiction #1 lives
// between EXT-OPS-SOP-0001 and EXT-MNT-MAN-0001 only).
import { asset, b, bullets, callout, doc, h, img, p, ppe, ref, steps, table, type SeedDoc } from "../builders"

const body = doc(
  h(1, "LMRA: working at the hot die head"),
  p(
    "This last-minute risk assessment (LMRA) is for every task at the die head of the extruder ",
    asset("EXL-201"),
    " on line 2 while the die is hot. Do the LMRA yourself, on the spot, just before you start the work, and again when the situation changes.",
  ),

  h(2, "When to use this LMRA"),
  bullets([
    "Removing melt drool from the die face of EXL-201.",
    "Threading the start-up pipe at a start-up or restart of line 2.",
    "Adjusting the die centring bolts of EXL-201 during production.",
    "Preparing a die change or a colour or product changeover at EXL-201.",
    "Opening the adapter clamp of EXL-201 for a screen pack change.",
    "Any other task where your hands or face come within 1 metre of the die of EXL-201 while the die is above 150 °C.",
  ]),

  h(2, "Stop, think, act"),
  p(
    b("Stop. "),
    "Before you start, take two minutes. Look at the die head of EXL-201, the floor around you and the people near you.",
  ),
  p(
    b("Think. "),
    "Go through the hazards in the table below. For each hazard, ask yourself: is the control in place right now, and can I check it?",
  ),
  p(
    b("Act. "),
    "Only start when every control is in place. If one control is missing and you cannot put it in place yourself, do not start: tell the shift leader.",
  ),

  h(2, "Personal protective equipment"),
  p("At the hot die head of EXL-201, wear heat-resistant gloves (EN 407), a face shield over safety glasses, long sleeves, safety shoes and hearing protection. Hall 2 is above 85 dB(A)."),
  ppe("gloves,face-shield,glasses,clothing,boots,ear-pro"),
  img(
    "ext-hse-lmra-0001/ppe-at-die",
    "The right PPE at the hot die head of EXL-201: face shield, EN 407 gloves, long sleeves, and standing to the side of the die.",
  ),

  callout(
    "hotwork",
    "The die and barrel of EXL-201 are above 150 °C during production and during a changeover. Hot PE melt sticks to the skin and keeps burning. Never stand in front of the die when the screw starts.",
  ),

  h(2, "Before you start"),
  steps([
    "Tell the line operator or the shift leader which task you are going to do at the die head of EXL-201.",
    "Check that you wear all the PPE listed on this card, with the gloves over your sleeves.",
    "Check whether the screw of EXL-201 is running or stopped, and agree with the line operator that nobody starts the screw while you work at the die.",
    "Check that the melt pressure of EXL-201 reads 0 bar before you open, loosen or clean anything that holds melt.",
    "Clear the floor around the die of EXL-201: no melt strands, granulate, water or cables where you stand.",
    "Choose your position to the side of the die of EXL-201, never in front of the die outlet.",
    "Check that the burn kit at the line 2 first aid post is complete and that you know the first aider extension 2222.",
    "Go through the hazards table and answer each check with yes before you start.",
  ]),

  h(2, "Hazards and controls"),
  table([
    ["Hazard", "Consequence", "Control", "Check"],
    ["Hot die, adapter and barrel surfaces above 150 °C", "Contact burn to hands and forearms", "EN 407 gloves, long sleeves, brass tools with long handles", "Gloves undamaged and dry, sleeves covered by the gloves"],
    ["Hot melt spitting from the die when the screw starts", "Burns to face, eyes and hands", "Stand to the side of the die; face shield down; screw started only by the line operator after a call-out", "Line operator knows where you stand before the screw starts"],
    ["Melt under pressure behind the die or the screen pack", "Melt jet when a clamp or plug is opened", "Open nothing that holds melt while melt pressure is above 0 bar", "EXL-201 panel shows 0 bar melt pressure"],
    ["Molten PE stuck to the skin", "Deep burn that keeps burning", "Cool with lukewarm running water for 20 minutes; never pull off plastic stuck to the skin", "Burn kit complete, water tap at the first aid post works"],
    ["Fumes from degraded melt", "Irritation of eyes and airways", "Local extraction above the die on; keep zone set points as on the product card", "Extraction fan runs; no blue smoke at the die"],
    ["Heater bands and thermocouple cables on the die", "Electric shock from damaged cables", "Do not touch or move heater cables; report damaged cables", "No bare wire or melted insulation visible"],
    ["Slipping on melt strands, granulate or water", "Fall against the hot die", "Clear the floor before you start", "Floor around the die is clean and dry"],
    ["Noise above 85 dB(A) in Hall 2", "Hearing damage, missed warnings", "Hearing protection; agree hand signals with the line operator", "Hearing protection worn; hand signals agreed"],
    ["Hot pipe between the die and VAC-203", "Burns to the legs and hands", "Do not step over or lean on the pipe between the die and VAC-203", "Walk-around route used"],
  ]),
  img(
    "ext-hse-lmra-0001/side-position",
    "Stand to the side of the die of EXL-201, never in front of the die outlet, when the screw can start.",
  ),

  h(2, "Stop the work if"),
  bullets([
    "Stop the work if one of the controls in the hazards table is not in place.",
    "Stop the work if the melt pressure of EXL-201 rises above 0 bar while you are opening or cleaning something that holds melt.",
    "Stop the work if your gloves are wet, torn or soaked with melt.",
    "Stop the work if someone starts the screw of EXL-201 without telling you.",
    "Stop the work if you see blue smoke, smell burning plastic or the local extraction stops.",
    "Stop the work if you are unsure how to do the task safely: ask the shift leader.",
  ]),

  h(2, "If someone is burned"),
  callout(
    "danger",
    "Cool the burn with lukewarm running water for 20 minutes. Do not pull off plastic stuck to the skin. Call the first aider on extension 2222 and report every burn. Follow EXT-HSE-SOP-0002.",
  ),

  h(2, "Sign-off"),
  p("I have done this LMRA at the die head of EXL-201. All controls are in place and I can do the work safely. Name, date, time and signature of the person doing the work; the shift leader countersigns for a die change or a screen pack change."),

  h(2, "Records"),
  bullets([
    "Keep the signed LMRA card with the shift log of the shift in which the work was done.",
    "Write every stopped job and the reason in the shift log, so the shift leader can follow up.",
    "Report every burn, near miss or missing control to the shift leader and in the incident report.",
  ]),

  h(2, "References"),
  bullets([
    [ref("EXT-HSE-SOP-0002"), " Hot melt burns: first response."],
    [ref("EXT-HSE-SOP-0001"), " Lockout/tagout on extrusion line 2."],
    [ref("EXT-OPS-SOP-0001"), " Colour and product changeover on extrusion line 2."],
    [ref("EXT-OPS-SOP-0002"), " Starting line 2 from cold."],
    [ref("EXT-MNT-SOP-0001"), " Changing the screen pack on EXL-201."],
    [ref("EXT-MNT-MAN-0001"), " Krauss KX-60 single-screw extruder: operating and maintenance manual."],
  ]),
)

export const seedDoc: SeedDoc = {
  code: "EXT-HSE-LMRA-0001",
  title: "LMRA: working at the hot die head",
  type: "lmra",
  area: "EXT",
  discipline: "HSE",
  status: "published",
  editions: [{ body, publishedDaysAgo: 150 }],
  assets: ["EXL-201"],
  nextReviewInDays: 215,
  tags: ["LMRA", "hot work", "burns", "die head"],
  images: [
    {
      key: "ext-hse-lmra-0001/ppe-at-die",
      prompt:
        "operator wearing a clear face shield over safety glasses, long-sleeved work jacket, grey heat-resistant gauntlet gloves pulled over the sleeves, ear defenders and safety shoes, standing next to the round die head of a plastic pipe extruder",
    },
    {
      key: "ext-hse-lmra-0001/side-position",
      prompt:
        "top-down view of an operator standing beside, not in front of, the outlet of a hot pipe extruder die, a scrap tray on wheels placed under the die outlet, clear floor around the die",
    },
  ],
}
