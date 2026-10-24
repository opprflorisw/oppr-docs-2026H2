// EXT-HSE-SOP-0002: Hot melt burns: first response.
// Plant facts: docs/build/plant-facts.md (lukewarm running water for 20
// minutes, do not pull off stuck plastic, first aider on extension 2222,
// report every burn).
import { asset, b, bullets, callout, doc, h, img, p, ppe, ref, steps, table, type SeedDoc } from "../builders"

const body = doc(
  h(1, "Hot melt burns: first response"),
  p(
    "This SOP describes what to do in the first minutes after someone is burned by hot PE melt or by a hot surface at the extruder ",
    asset("EXL-201"),
    " on line 2. Hot PE melt sticks to the skin and keeps burning, so fast and long cooling with water makes the biggest difference to the injury.",
  ),
  p(
    b("In short: "),
    "cool with lukewarm running water for 20 minutes, do not pull off plastic stuck to the skin, call the first aider on extension 2222, and report every burn.",
  ),

  h(2, "Scope"),
  bullets([
    "This SOP applies to every burn in Hall 2 from hot PE melt, the die, adapter or barrel of EXL-201, heater bands, or hot pipe before the vacuum tank.",
    "This SOP applies to everyone in Hall 2: operators, maintenance staff, contractors and visitors.",
    "This SOP covers first response until the first aider or the ambulance takes over. Medical treatment is not covered.",
  ]),

  h(2, "Responsibilities"),
  table([
    ["Role", "Responsibility"],
    ["Anyone who sees the burn", "Starts cooling at once, calls the first aider on extension 2222 and stays with the casualty."],
    ["Company first aider (BHV)", "Takes over the first response, decides whether to call 112 and dresses the burn after cooling."],
    ["Shift leader", "Makes line 2 safe, arranges transport, informs the maintenance and safety engineer and makes sure the burn is reported."],
    ["Maintenance and safety engineer", "Investigates every burn, owns this SOP and keeps the burn kits stocked."],
  ]),

  h(2, "Personal protective equipment"),
  p("Helpers wear gloves when they handle hot plastic or hot parts near the casualty. Do not let PPE delay the cooling: start cooling first."),
  ppe("gloves,general"),

  callout(
    "danger",
    "Call 112 at once when the burn is larger than the casualty's hand palm, is on the face, neck, hands, feet, joints or genitals, looks white, grey or charred, when melt entered the eye, or when the casualty breathed in hot fumes or has trouble breathing.",
  ),
  callout(
    "warning",
    "Do not pull off plastic stuck to the skin. Pulling off solidified PE tears off the burned skin with it. Cool the plastic with water and leave the plastic in place for the hospital.",
  ),

  h(2, "Tools and materials"),
  bullets([
    "Water tap with a hose at the line 2 first aid post, next to the EXL-201 control panel.",
    "Eye wash station at the line 2 first aid post.",
    "Burn kit at the line 2 first aid post: sterile burn dressings, cling film, a foil blanket and scissors.",
    "Wall phone at the line 2 first aid post, with extension 2222 for the first aider.",
    "Incident report form (on the HSE board in Hall 2 and in the shift log folder).",
  ]),

  h(2, "Procedure"),
  steps([
    "Get the casualty away from the hot surface or the melt, without putting yourself at risk.",
    "If melt is still coming out of the die of EXL-201, press the nearest emergency stop of line 2.",
    "Hold the burn under lukewarm running water at the line 2 first aid post for 20 minutes.",
    "Call the first aider on extension 2222 while the burn is being cooled, and say: burn at line 2, which body part, and whether there is melt on the skin.",
    "Do not pull off plastic stuck to the skin; keep cooling the plastic with water for the full 20 minutes.",
    "Remove rings, watches and tight clothing near the burn before swelling starts, but leave anything that is stuck to the skin.",
    "Keep the rest of the casualty warm with the foil blanket from the burn kit while the burn is cooled.",
    "Do not put ice, ice water, ointment, cream or butter on a burn.",
    "For melt or hot fumes in the eye, rinse the eye at the eye wash station for 20 minutes and call 112.",
    "The first aider checks the burn against the 112 criteria in this SOP and calls 112 when one of them applies.",
    "After 20 minutes of cooling, cover the burn loosely with a sterile burn dressing or with cling film laid on, not wrapped around.",
    "The shift leader arranges transport to the GP or the hospital; a burned person never drives themselves.",
    "The shift leader decides whether line 2 can keep running and sends someone to clean up melt on the floor.",
    "Report every burn, also a small one, in the shift log and on the incident report form before the end of the shift.",
  ]),
  img(
    "ext-hse-sop-0002/cooling-under-tap",
    "A burn from hot PE melt is cooled under lukewarm running water for 20 minutes; plastic stuck to the skin stays in place.",
  ),
  img(
    "ext-hse-sop-0002/first-aid-post",
    "The line 2 first aid post next to the EXL-201 control panel has a water tap with a hose, an eye wash station, the burn kit and a wall phone.",
  ),
  img(
    "ext-hse-sop-0002/loose-dressing",
    "After cooling, cling film is laid loosely over the burn, not wrapped tightly around the arm.",
  ),

  h(2, "Checks and acceptance criteria"),
  table([
    ["Check", "Acceptance criterion", "When"],
    ["Cooling time", "20 minutes of lukewarm running water, not ice cold", "Every burn"],
    ["Stuck plastic", "Left on the skin, cooled with water", "Every burn with melt on the skin"],
    ["First aider", "Called on extension 2222 within the first minutes", "Every burn"],
    ["112", "Called when one of the 112 criteria applies", "Decided by the first aider"],
    ["Dressing", "Loose sterile dressing or cling film laid on, not wrapped tightly", "After cooling"],
    ["Report", "Shift log entry and incident report form completed", "Before the end of the shift"],
    ["Burn kit at the line 2 first aid post", "Complete, with dressings, cling film, foil blanket and scissors", "Weekly, and after every use"],
  ]),

  h(2, "If something goes wrong"),
  table([
    ["Symptom", "Likely cause", "Action"],
    ["Casualty shivers or turns pale during cooling", "Body cooling down from the long rinse", "Keep cooling only the burn, cover the rest of the body with the foil blanket and tell the first aider"],
    ["Nobody answers extension 2222", "First aider busy or away from the phone", "Keep cooling, ask a colleague to fetch the shift leader, and call 112 when one of the 112 criteria applies"],
    ["Pain comes back after cooling stops", "Burn not cooled long enough", "Cool again with lukewarm running water and tell the first aider"],
    ["Water tap at the first aid post does not work", "Valve closed or supply fault", "Use the nearest other tap or the eye wash station, and report the fault to maintenance"],
    ["Burn kit incomplete", "Not restocked after the last use", "Use cling film or a clean cloth for now and tell the maintenance and safety engineer"],
  ]),

  h(2, "Records"),
  bullets([
    "Write every burn in the shift log: time, place, casualty, cause and what was done.",
    "Fill in the incident report form before the end of the shift and give it to the shift leader.",
    "The maintenance and safety engineer records the investigation and the actions in the incident register.",
    "Write the use of the burn kit in the first aid post checklist so the burn kit is restocked.",
  ]),

  h(2, "References"),
  bullets([
    [ref("EXT-HSE-LMRA-0001"), " LMRA: working at the hot die head."],
    [ref("EXT-HSE-SOP-0001"), " Lockout/tagout on extrusion line 2."],
    [ref("EXT-OPS-SOP-0001"), " Colour and product changeover on extrusion line 2."],
    [ref("EXT-OPS-SOP-0002"), " Starting line 2 from cold."],
    [ref("EXT-MNT-SOP-0001"), " Changing the screen pack on EXL-201."],
  ]),
)

export const seedDoc: SeedDoc = {
  code: "EXT-HSE-SOP-0002",
  title: "Hot melt burns: first response",
  type: "sop",
  area: "EXT",
  discipline: "HSE",
  status: "published",
  editions: [{ body, publishedDaysAgo: 320 }],
  assets: ["EXL-201"],
  nextReviewInDays: 45,
  tags: ["first aid", "burns", "emergency"],
  images: [
    {
      key: "ext-hse-sop-0002/cooling-under-tap",
      prompt:
        "forearm held under a gentle stream of running water from a tap with a hose at a stainless steel sink in a factory, a small patch of solidified black plastic on the skin left in place, no visible wound",
    },
    {
      key: "ext-hse-sop-0002/first-aid-post",
      prompt:
        "first aid post on a factory wall next to a plastic extrusion line: a green first aid cabinet, a wall-mounted eye wash station, a sink with a tap and hose, and a wall telephone",
    },
    {
      key: "ext-hse-sop-0002/loose-dressing",
      prompt:
        "hands of a first aider laying a sheet of cling film loosely over the top of a forearm, not wrapping it around, with an open burn kit box beside the arm",
    },
  ],
}
