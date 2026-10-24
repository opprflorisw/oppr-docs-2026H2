// MIX-HSE-LMRA-0001: LMRA: dust and masterbatch handling at the mixer.
// Published, but rarely used (Knowledge health shows it is never viewed).
// Plant facts: FFP2 dust mask when emptying bags, local extraction on, no
// compressed air for cleaning; MXR-101 lid interlock; masterbatch 2 kg per
// 100 kg; DRY-102 at 80 °C.
import { asset, b, bullets, callout, doc, h, img, p, ppe, ref, steps, table, type SeedDoc } from "../builders"

const body = doc(
  h(1, "LMRA: dust and masterbatch handling at the mixer"),
  p(
    "This last-minute risk assessment (LMRA) card is used by the mixing operator just before emptying bags of PE granulate or colour masterbatch at the batch mixer ",
    asset("MXR-101"),
    " and before filling or opening the granulate dryer ",
    asset("DRY-102"),
    " in Hall 1.",
  ),

  h(2, "Task"),
  bullets([
    "Opening and emptying 25 kg bags of PE granulate and colour masterbatch into the MXR-101 dosing hopper.",
    "Weighing colour masterbatch: 2 kg per 100 kg PE granulate unless the batch card says otherwise.",
    "Cleaning up spilled granulate and masterbatch dust around MXR-101 and DRY-102.",
    "Opening the inspection hatch of DRY-102 while the dryer runs at 80 °C.",
  ]),

  h(2, "Stop, think, act"),
  p(
    b("Stop"),
    " before you open the first bag. ",
    b("Think"),
    " through every hazard in the table below and check each control at the mixer with your own eyes. ",
    b("Act"),
    " only when every check is OK. If one check is not OK, do not start: fix the problem or call the shift leader.",
  ),
  p("The LMRA takes about 2 minutes. Do the LMRA at the start of every shift in which you handle bags at MXR-101, and again when the situation changes (a new material, a spill, a broken extraction hose)."),

  h(2, "Personal protective equipment"),
  p("Wear an FFP2 dust mask when emptying bags, safety glasses, gloves and safety shoes. Use heat-resistant gloves when you open the inspection hatch of DRY-102."),
  ppe("dust-mask,glasses,gloves,boots"),

  h(2, "Hazards and controls"),
  callout(
    "warning",
    "Never clean dust or granulate with compressed air at MXR-101 or DRY-102. Compressed air blows fine masterbatch dust into the air you breathe and spreads the dust over hot surfaces and electrical cabinets.",
  ),
  table([
    ["Hazard", "Consequence", "Control", "Check before you start"],
    ["Breathing in masterbatch and granulate dust when emptying bags", "Irritated airways, coughing, long-term lung damage", "FFP2 dust mask on while emptying bags; local extraction at the dosing hopper on", "The FFP2 dust mask fits tightly; the extraction at the MXR-101 dosing hopper runs and pulls a tissue towards the hood"],
    ["Fine dust cloud near hot surfaces or sparks", "Dust fire or dust explosion", "Local extraction on; no compressed air; spills cleaned with the industrial vacuum cleaner; bags emptied slowly", "No visible dust cloud at the hopper; the industrial vacuum cleaner is at MXR-101 and works"],
    ["Static charge when pouring granulate", "Spark in the hopper", "Dosing hopper earthed; empty bags folded, not shaken over the hopper", "The green earthing cable is clamped to the MXR-101 dosing hopper"],
    ["Mixer starting while the lid is open or a hand is in the hopper", "Crushed or cut hand by the mixer blades", "Lid interlock on MXR-101: the mixer will not start with the lid open; never bypass the lid interlock", "Open the lid and press START once: MXR-101 must not start; report a failed test at once"],
    ["Lifting 25 kg bags to the dosing hopper", "Back injury", "Use the bag lift table; lift with straight back; no more than 1 bag at a time", "The bag lift table is at hopper height and the pallet is within 1 m of the hopper"],
    ["Spilled granulate on the floor", "Slipping and falling (granulate rolls like marbles)", "Clean every spill at once with the brush and the industrial vacuum cleaner", "The floor around MXR-101 and DRY-102 is free of granulate"],
    ["Hot surfaces and hot air at the DRY-102 inspection hatch (80 °C)", "Burns to hands and face", "Heat-resistant gloves; open the inspection hatch slowly and keep your face away from the opening", "Heat-resistant gloves are on the hook next to DRY-102"],
    ["Wrong or unlabelled material", "Wrong colour batch, contaminated pipe, unknown health hazard", "Use only bags that match the batch card; never use a bag without a label", "The material code on each bag matches the batch card"],
  ]),
  img(
    "mix-hse-lmra-0001/bag-emptying",
    "Emptying a bag of colour masterbatch into the MXR-101 dosing hopper with an FFP2 dust mask on and the extraction hood running above the hopper.",
  ),
  img(
    "mix-hse-lmra-0001/vacuum-not-air",
    "Cleaning spilled granulate next to MXR-101 with a brush and an industrial vacuum cleaner, never with compressed air.",
  ),

  h(2, "Before you start"),
  steps([
    "Read the batch card and check that the material code on each bag matches the batch card.",
    ["Check that the local extraction at the dosing hopper of ", asset("MXR-101"), " runs."],
    "Put on the FFP2 dust mask, safety glasses and gloves, and check that the FFP2 dust mask fits tightly.",
    "Check that the green earthing cable is clamped to the MXR-101 dosing hopper.",
    "Test the lid interlock: open the lid of MXR-101, keep both hands out of the mixer, press START once, and check that MXR-101 does not start.",
    "Check that the floor around MXR-101 and DRY-102 is free of spilled granulate.",
    "Sign the LMRA card and put the signed LMRA card in the LMRA tray at MXR-101.",
  ]),
  img(
    "mix-hse-lmra-0001/lid-interlock",
    "The lid interlock switch on the lid of MXR-101: with the lid open, the batch mixer will not start.",
  ),

  h(2, "Stop the work if"),
  bullets([
    "The local extraction at the MXR-101 dosing hopper does not run or does not pull.",
    "MXR-101 starts, or tries to start, with the lid open.",
    "A visible dust cloud stays in the air around the dosing hopper.",
    "A bag is torn, wet or has no label, or the material code does not match the batch card.",
    "There is no FFP2 dust mask in your size, or the FFP2 dust mask does not fit tightly.",
    "You smell burning or see smoke at DRY-102 or MXR-101.",
    "You feel unwell, short of breath or dizzy.",
  ]),
  callout(
    "notice",
    "When you stop the work, tell the shift leader, write the reason in the shift log, and call the first aider on extension 2222 if anyone is hurt or feels unwell.",
  ),

  h(2, "Sign-off"),
  p("I have gone through every hazard on this card, every check is OK, and I can start the work safely."),
  p("Name: ____________   Date: ________   Shift: early / late / night   Signature: ____________"),

  h(2, "Records"),
  bullets([
    "The signed LMRA card goes in the LMRA tray at MXR-101.",
    "The shift leader of Hall 1 collects the LMRA cards every week and keeps them for 1 year.",
    "Every stop of the work and every failed lid interlock test is written in the shift log and reported to the maintenance and safety engineer.",
  ]),

  h(2, "References"),
  bullets([
    [ref("MIX-OPS-WI-0001"), " Starting a batch on mixer MXR-101."],
    [ref("MIX-OPS-SOP-0002"), " Drying PE granulate on dryer DRY-102."],
    [ref("MIX-MNT-MAN-0001"), " Vortex HM-500 high-speed mixer: operating manual."],
    "Safety data sheets of the colour masterbatches, in the red folder at MXR-101.",
  ]),
)

export const seedDoc: SeedDoc = {
  code: "MIX-HSE-LMRA-0001",
  title: "LMRA: dust and masterbatch handling at the mixer",
  type: "lmra",
  area: "MIX",
  discipline: "HSE",
  status: "published",
  editions: [{ body, publishedDaysAgo: 342 }],
  assets: ["MXR-101", "DRY-102"],
  nextReviewInDays: 23,
  tags: ["LMRA", "dust", "masterbatch", "mixing"],
  images: [
    {
      key: "mix-hse-lmra-0001/bag-emptying",
      prompt:
        "an operator wearing a white FFP2 dust mask, safety glasses and gloves slowly pouring a paper bag of small coloured plastic pellets into the dosing hopper of an industrial high-speed batch mixer, a stainless steel local extraction hood with a flexible duct directly above the hopper, side view",
    },
    {
      key: "mix-hse-lmra-0001/vacuum-not-air",
      prompt:
        "a gloved operator cleaning up spilled small black plastic granulate pellets from a concrete factory floor next to the base of an industrial batch mixer, using a broad brush and the nozzle of a wheeled industrial vacuum cleaner, low viewpoint",
    },
    {
      key: "mix-hse-lmra-0001/lid-interlock",
      prompt:
        "close-up of a safety interlock switch mounted at the hinge of the open lid of a stainless steel industrial high-speed batch mixer, the switch actuator visibly separated from the switch body, mixer bowl interior with blades in the background",
    },
  ],
}
