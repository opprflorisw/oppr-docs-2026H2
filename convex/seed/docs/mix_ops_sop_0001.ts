// MIX-OPS-SOP-0001: Cleaning mixer MXR-101.
// Plant facts: docs/build/plant-facts.md. Draft, never published.
// Fixture (docs/test-set.md): mentions paddle tool MT-5521, which must never
// reach Ask, Wikis or Trainings while this document is unpublished.
import { asset, bullets, callout, doc, h, img, p, ppe, ref, steps, table, type SeedDoc } from "../builders"

const body = doc(
  h(1, "Cleaning mixer MXR-101"),
  p("Cleaning procedure for ", asset("MXR-101"), " between colours."),
  p(
    "Granulate or masterbatch left in the bowl of MXR-101 ends up in the next batch and shows as streaks of the wrong colour on the pipe. A yellow streak on black water pipe, or a black streak on yellow gas pipe, makes the pipe non-conforming. Clean MXR-101 at every colour change and at least once a week.",
  ),

  h(2, "Scope"),
  bullets([
    "This SOP applies to the bowl, the paddles, the lid, the lid seal and the discharge flap of MXR-101.",
    "Do the cleaning at every colour change, after a rejected batch, and at least once a week.",
    ["Cleaning the transfer pipe beyond the discharge flap and repairs to the paddles follow the Vortex manual ", ref("MIX-MNT-MAN-0001"), "."],
  ]),

  h(2, "Responsibilities"),
  table([
    ["Role", "Responsibility"],
    ["Mixing operator", "Cleans MXR-101, checks the result and records the cleaning."],
    ["Shift leader", "Plans the cleaning with the colour change on line 2."],
    ["Maintenance and safety engineer", "Repairs a damaged lid seal or paddle reported during the cleaning."],
    ["Process engineer", "Owns this SOP."],
  ]),

  h(2, "Safety"),
  ppe("glasses,gloves,dust-mask,boots"),
  callout("loto", "Lock out MXR-101 before any part of your body goes past the lid opening. The paddles of a high-speed mixer cause severe injuries."),
  callout("warning", "Wear a dust mask (FFP2) during cleaning and keep the local extraction at MXR-101 switched on."),
  callout("caution", "Never clean MXR-101 with compressed air. Compressed air blows masterbatch dust into the hall and into other machines."),

  h(2, "Tools and materials"),
  bullets([
    "Paddle tool MT-5521 (plastic scraper shaped to the paddles), from the tool board at the mixer.",
    "Plastic bowl scraper. Never use steel tools in the bowl.",
    "Industrial vacuum cleaner with a crevice nozzle.",
    "Lint-free cloths.",
    "Personal lock and tag, torch.",
    "Cleaning log at the mixer.",
  ]),

  h(2, "Procedure"),
  steps([
    "Discharge the last batch of the old colour from MXR-101 to the line 2 hopper.",
    "Lock out the mixer.",
    "Press start on the panel of MXR-101 to verify that the mixer does not start.",
    "Check that the local extraction at MXR-101 is running.",
    "Open the lid of MXR-101 and secure the lid in the open position with the lid stay.",
    "Scrape the paddles with paddle tool MT-5521.",
    "Scrape the bowl wall and the underside of the lid of MXR-101 with the plastic bowl scraper.",
    "Open the discharge flap of MXR-101 and scrape the flap and the flap seat.",
    "Vacuum the bowl and check that no granulate of the previous colour remains.",
    "Wipe the paddles, the bowl wall and the lid seal of MXR-101 with a lint-free cloth.",
    "Inspect the lid seal of MXR-101 for cracks and missing pieces.",
    "Close the discharge flap and the lid of MXR-101.",
    "Remove your lock and tag from MXR-101.",
    "Record the cleaning in the cleaning log at the mixer.",
  ]),
  img("mix-ops-sop-0001/scrape-paddles", "Scraping the paddles of MXR-101 with the plastic paddle tool, lid open and mixer locked out."),
  img("mix-ops-sop-0001/vacuum-bowl", "Vacuuming the bowl of MXR-101 until no granulate of the previous colour remains."),

  h(2, "Checks and acceptance criteria"),
  table([
    ["Check", "Acceptance criterion"],
    ["Bowl and paddles", "No granulate, no masterbatch and no coloured film visible with a torch."],
    ["Discharge flap", "Flap and flap seat clean, flap closes fully."],
    ["Lid seal", "No cracks and no missing pieces."],
    ["Lid interlock", "MXR-101 does not start with the lid open."],
    ["First batch after cleaning", "Even colour with no streaks of the previous colour."],
  ]),

  h(2, "If something goes wrong"),
  table([
    ["Symptom", "Likely cause", "Action"],
    ["Coloured film stays on the paddles", "Masterbatch melted onto the paddles by friction heat", "Scrape again with the paddle tool. If the film stays, inform the process engineer."],
    ["Lid seal cracked", "Wear", "Do not mix. Report the damaged lid seal to the maintenance and safety engineer."],
    ["Streaks of the previous colour on the first pipe", "Granulate left in the bowl or in the discharge flap", "Stop dosing, clean MXR-101 again and inform the shift leader."],
    ["Mixer starts during the start test", "Mixer not isolated", "Stop the mixer, do not start cleaning, and inform the shift leader and the maintenance and safety engineer."],
  ]),
  img("mix-ops-sop-0001/lid-seal", "Inspecting the lid seal of MXR-101 for cracks and missing pieces."),

  h(2, "Records"),
  bullets([
    "Cleaning log at the mixer: date, time, old and new colour, name of the mixing operator.",
    "Shift log of Hall 1: any damage found during the cleaning.",
  ]),

  h(2, "References"),
  bullets([
    [ref("MIX-OPS-WI-0001"), ": Starting a batch on mixer MXR-101."],
    [ref("MIX-MNT-MAN-0001"), ": Vortex HM-500 high-speed mixer, operating manual."],
    [ref("MIX-HSE-LMRA-0001"), ": LMRA for dust and masterbatch handling at the mixer."],
  ]),
)

export const seedDoc: SeedDoc = {
  code: "MIX-OPS-SOP-0001",
  title: "Cleaning mixer MXR-101",
  type: "sop",
  area: "MIX",
  discipline: "OPS",
  status: "draft",
  editions: [{ body, publishedDaysAgo: null }],
  assets: ["MXR-101"],
  nextReviewInDays: null,
  tags: ["mixing", "cleaning", "colour change"],
  images: [
    {
      key: "mix-ops-sop-0001/scrape-paddles",
      prompt:
        "A gloved hand holding a curved white plastic scraper against the steel mixing paddle at the bottom of an open stainless steel high-speed mixer bowl, seen from above through the open lid.",
    },
    {
      key: "mix-ops-sop-0001/vacuum-bowl",
      prompt:
        "An operator wearing an FFP2 dust mask, safety glasses and gloves holding the crevice nozzle of an industrial vacuum cleaner inside the open bowl of a stainless steel batch mixer.",
    },
    {
      key: "mix-ops-sop-0001/lid-seal",
      prompt:
        "Close-up of the black rubber seal around the rim of a heavy stainless steel mixer lid, a gloved finger tracing along the seal.",
    },
  ],
}
