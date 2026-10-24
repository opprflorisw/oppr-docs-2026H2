// Seed: the five Trainings of the plan's catalogue, with their versions,
// Engineer sign-offs and realistic past Attempts and Training records.
// Called by seedKnowledge after documents, chunks, people and assets exist.
// Everything is found by naming code, asset code or person name; what is
// missing is skipped quietly. Objectives find their passage in the live
// version by keywords, so wording changes in the seed content are tolerated.
// Past Attempts use static questions written here (the live ones are
// generated); each cites the real passage.
import { internalMutation, internalQuery, MutationCtx } from "../_generated/server"
import { Doc, Id } from "../_generated/dataModel"
import { loadLiveDoc, LiveDoc } from "../trainings"
import { normalise } from "../ai/grounding"

const DAY = 24 * 60 * 60 * 1000

interface StaticQuestion {
  prompt: string
  correct: string
  wrong: [string, string, string]
  explanation: string
}

interface ObjectiveDef {
  key: string
  text: string
  /** Where to find the passage: first document and keyword set that matches. */
  sources: { doc: string; match: string[][] }[]
  /**
   * Key words of the fact the objective tests. The cited quote must contain
   * every one of them, or the passage is not used (checked at seed time, so
   * an objective never cites a step that says something else).
   */
  fact: string[]
  q: StaticQuestion
}

interface StopDef {
  asset: string
  objectives: string[]
  hint: string
  evidence: "none" | "photo" | "note"
}

interface VersionDef {
  keys: string[]
  /**
   * Days ago it was published; null = the working version, not published.
   * Must be later than every cited Document version was Published (and the
   * author's sign-off 9 days before it too): devChecks check D.
   */
  publishedDaysAgo: number | null
  author: string
  reviewer?: string
  approver?: string
  /** For the working version: where it stands. */
  status?: "draft" | "in_review" | "approved"
}

interface AttemptDef {
  person: string
  daysAgo: number
  /** Positions (0-based) of questions answered wrongly. */
  wrong?: number[]
}

interface TrainingDef {
  code: string
  title: string
  kind: "course" | "round"
  area: string
  purpose: string
  passMark: number
  objectives: ObjectiveDef[]
  stops?: StopDef[]
  versions: VersionDef[]
  attempts: AttemptDef[]
}

const SANNE = "Sanne Visser"
const MARK = "Mark Jansen"
const INGRID = "Ingrid Hoekstra"

const TRAININGS: TrainingDef[] = [
  {
    code: "EXT-TRN-0001",
    title: "Line 2 changeover",
    kind: "course",
    area: "EXT",
    purpose: "For line 2 operators: carry out a colour or product changeover on EXL-201 safely and get good pipe again quickly.",
    passMark: 80,
    objectives: [
      {
        key: "c1",
        text: "Tell the mixing operator when a changeover starts and which colour comes next",
        sources: [{ doc: "EXT-OPS-SOP-0001", match: [["tell the mixing operator"], ["mixing operator", "colour"]] }],
        fact: ["mixing operator", "colour"],
        q: {
          prompt: "A colour changeover on line 2 is about to start. What is the first thing you do?",
          correct: "Tell the mixing operator the changeover is starting and which colour comes next",
          wrong: [
            "Stop the screw and open the die",
            "Switch off the main isolator of line 2",
            "Empty the extruder hopper completely",
          ],
          explanation: "The first step is to tell the mixing operator the changeover is starting and which colour comes next.",
        },
      },
      {
        key: "c2",
        text: "Stop dosing at the mixer at the right hopper level",
        sources: [{ doc: "EXT-OPS-SOP-0001", match: [["stop dosing", "hopper"]] }],
        fact: ["stop dosing", "20 percent"],
        q: {
          prompt: "During a changeover, when do you stop dosing at MXR-101?",
          correct: "When the extruder hopper is below 20 percent",
          wrong: [
            "When the extruder hopper is completely empty",
            "When the extruder hopper is below 50 percent",
            "As soon as the changeover is announced",
          ],
          explanation: "Stop dosing at MXR-101 when the extruder hopper is below 20 percent.",
        },
      },
      {
        key: "c3",
        text: "Purge the barrel with the right compound at the right temperature",
        sources: [{ doc: "EXT-OPS-SOP-0001", match: [["PX-4400", "190"], ["purge", "190"]] }],
        fact: ["PX-4400", "190"],
        q: {
          prompt: "Which purge compound and temperature do you use to purge the barrel?",
          correct: "Purge compound PX-4400 at 190 °C",
          wrong: [
            "Purge compound PX-4400 at 230 °C",
            "Fresh PE granulate at 150 °C",
            "Purge compound PX-4400 at 150 °C",
          ],
          explanation: "Purge the barrel with purge compound PX-4400 at 190 °C until the melt runs clean.",
        },
      },
      {
        key: "c4",
        text: "Tighten the die bolts in the right pattern and to the right torque",
        sources: [{ doc: "EXT-OPS-SOP-0001", match: [["tighten the die bolts crosswise"], ["die bolts", "40 Nm"]] }],
        fact: ["crosswise", "40 Nm"],
        q: {
          prompt: "You have fitted the new die. How do you tighten the die bolts?",
          correct: "Crosswise to 40 Nm",
          wrong: ["One by one clockwise to 40 Nm", "Crosswise to 25 Nm", "Hand tight, then a quarter turn"],
          explanation: "Tighten the die bolts crosswise to 40 Nm.",
        },
      },
      {
        key: "c5",
        text: "Protect yourself from the hot die and barrel during a changeover",
        sources: [{ doc: "EXT-OPS-SOP-0001", match: [["150", "gloves"]] }],
        fact: ["150", "heat-resistant gloves"],
        q: {
          prompt: "Why do you wear heat-resistant gloves for any contact with the die during a changeover?",
          correct: "The die and barrel stay above 150 °C during a changeover",
          wrong: [
            "The die is cooled to room temperature before you touch it",
            "Gloves are only needed when handling the purge compound",
            "The barrel heaters are switched off during a changeover",
          ],
          explanation: "The die and barrel stay above 150 °C during a changeover. Wear heat-resistant gloves for any contact with the die.",
        },
      },
      {
        key: "c6",
        text: "Check the first pipes after restarting the line",
        sources: [{ doc: "EXT-OPS-SOP-0001", match: [["first 3 metres"], ["first 10 pipes"]] }],
        fact: ["first 3 metres", "first 10 pipes"],
        q: {
          prompt: "The line runs again after the changeover. What do you do with the first pipe?",
          correct: "Scrap the first 3 metres and measure wall thickness on each of the first 10 pipes",
          wrong: [
            "Keep the first 3 metres as a reference sample",
            "Measure wall thickness on the first pipe only",
            "Scrap the first 10 pipes without measuring them",
          ],
          explanation: "Scrap the first 3 metres of pipe and measure wall thickness on each of the first 10 pipes.",
        },
      },
    ],
    versions: [{ keys: ["c1", "c2", "c3", "c4", "c5", "c6"], publishedDaysAgo: 155, author: SANNE, reviewer: MARK, approver: INGRID }],
    attempts: [
      { person: "Jan de Vries", daysAgo: 150 },
      { person: "Fatima El Amrani", daysAgo: 120, wrong: [3] },
      { person: "Ahmed Yilmaz", daysAgo: 95 },
      { person: "Lotte Smit", daysAgo: 4, wrong: [1, 2, 3] },
    ],
  },
  {
    code: "EXT-TRN-0002",
    title: "Line 2 safety round",
    kind: "round",
    area: "EXT",
    purpose: "For everyone working on line 2: walk the line, find each machine and show you know how to make it safe.",
    passMark: 80,
    objectives: [
      {
        key: "r1",
        text: "Isolate line 2 at the main isolator with your own lock and tag",
        sources: [{ doc: "EXT-HSE-SOP-0001", match: [["switch off the main isolator", "personal lock"], ["main isolator", "personal lock"]] }],
        fact: ["main isolator", "personal lock"],
        q: {
          prompt: "You need to work inside the guarding of line 2. How do you isolate the line?",
          correct: "Switch off the main isolator of line 2 and attach your personal lock and tag",
          wrong: [
            "Press the emergency stop and hang a sign on the panel",
            "Stop the line from the main panel and wait 5 minutes",
            "Ask the shift leader to lock the panel for you",
          ],
          explanation: "Switch off the main isolator of line 2 and attach your personal lock and tag.",
        },
      },
      {
        key: "r2",
        text: "Wear the right protection when working at the hot die",
        sources: [
          { doc: "EXT-HSE-LMRA-0001", match: [["wear heat-resistant gloves", "EN 407"], ["heat-resistant gloves"]] },
          { doc: "EXT-OPS-SOP-0001", match: [["wear heat-resistant gloves"]] },
        ],
        fact: ["heat-resistant gloves"],
        q: {
          prompt: "You are at the die head of EXL-201. What protects your hands?",
          correct: "Heat-resistant gloves",
          wrong: ["Thin nitrile gloves", "No gloves, for a better grip", "Cut-resistant gloves only"],
          explanation: "Wear heat-resistant gloves for any contact with the die.",
        },
      },
      {
        key: "r3",
        text: "Check the vacuum in the calibration tank",
        sources: [{ doc: "EXT-OPS-WI-0002", match: [["vacuum pump", "set the vacuum to -0.3 bar"], ["-0.3 bar"]] }],
        fact: ["-0.3 bar"],
        q: {
          prompt: "What vacuum should the calibration tank VAC-203 run at?",
          correct: "-0.3 bar",
          wrong: ["-0.8 bar", "-0.05 bar", "+0.3 bar"],
          explanation: "The vacuum in the calibration tank is set to -0.3 bar.",
        },
      },
      {
        key: "r4",
        text: "Never reach into the haul-off or saw area of a line that is only stopped",
        sources: [{ doc: "EXT-HSE-SOP-0001", match: [["never reach", "haul-off"]] }],
        fact: ["never reach", "stopped"],
        q: {
          prompt: "The line is stopped from the panel but not locked out. A pipe is stuck in the haul-off. What do you do?",
          correct: "Never reach in: a stopped line can restart, so lock it out first",
          wrong: [
            "Reach in quickly while the line is stopped",
            "Reach in if the shift leader is watching",
            "Reach in with a tool instead of your hand",
          ],
          explanation: "Never reach into the haul-off or saw area while the line is only stopped. A stopped line can restart.",
        },
      },
      {
        key: "r5",
        text: "Release stored energy before working on the haul-off",
        sources: [{ doc: "EXT-HSE-SOP-0001", match: [["release stored energy", "open the pneumatic dump valve"], ["stored energy", "open", "dump valve"]] }],
        // Not "Close the pneumatic dump valve": that is the restore step after the work.
        fact: ["stored energy", "open", "dump valve"],
        q: {
          prompt: "After isolating line 2, how do you release the stored energy?",
          correct: "Open the pneumatic dump valve on the haul-off",
          wrong: [
            "Run the haul-off once more by hand",
            "Disconnect the hoses at the compressor",
            "Wait until the pressure gauge drops by itself",
          ],
          explanation: "Release stored energy: open the pneumatic dump valve on the haul-off.",
        },
      },
      {
        key: "r6",
        text: "Remove only your own lock after the work",
        sources: [{ doc: "EXT-HSE-SOP-0001", match: [["only the person who placed"], ["own lock"]] }],
        fact: ["only the person who placed"],
        q: {
          prompt: "The work on line 2 is finished. Whose locks may you remove?",
          correct: "Only your own lock: only the person who placed a lock may remove it",
          wrong: [
            "All locks, once the shift leader agrees",
            "Every lock on the isolator if you are the last to leave",
            "Any lock whose owner has gone home",
          ],
          explanation: "After the work, remove your own lock only. Only the person who placed a lock may remove it.",
        },
      },
    ],
    stops: [
      { asset: "EXL-201", objectives: ["r1", "r2"], hint: "The extruder at the start of line 2, in Hall 2.", evidence: "none" },
      { asset: "VAC-203", objectives: ["r3"], hint: "Right behind the die head: the long water tank.", evidence: "note" },
      { asset: "SAW-202", objectives: ["r4", "r5"], hint: "Follow the pipe to the caterpillar haul-off and the saw.", evidence: "photo" },
      { asset: "CLR-204", objectives: ["r6"], hint: "At the end of line 2, where pipe is wound into coils.", evidence: "none" },
    ],
    versions: [{ keys: ["r1", "r2", "r3", "r4", "r5", "r6"], publishedDaysAgo: 500, author: MARK, reviewer: SANNE, approver: INGRID }],
    attempts: [
      // Ahmed passed before his lockout/tagout sign-off (426 days ago), which
      // has since expired. Fatima passed before her sign-off (347 days ago),
      // which expires soon. Lotte, three weeks in, passed it 9 days ago.
      { person: "Ahmed Yilmaz", daysAgo: 430 },
      { person: "Fatima El Amrani", daysAgo: 360 },
      { person: "Jan de Vries", daysAgo: 200 },
      { person: "Lotte Smit", daysAgo: 9 },
    ],
  },
  {
    code: "MIX-TRN-0001",
    title: "Batch mixing basics",
    kind: "course",
    area: "MIX",
    purpose: "For mixing operators: prepare and start a colour batch on MXR-101 correctly and safely.",
    passMark: 80,
    objectives: [
      {
        key: "m1",
        text: "Dose the masterbatch in the right ratio",
        sources: [{ doc: "MIX-OPS-WI-0001", match: [["weigh the masterbatch", "2 kg per 100 kg"], ["2 kg per 100 kg"]] }],
        fact: ["2 kg per 100 kg"],
        q: {
          prompt: "How much colour masterbatch goes into a batch, unless the batch card says otherwise?",
          correct: "2 kg per 100 kg of PE granulate",
          wrong: ["5 kg per 100 kg of PE granulate", "2 kg per batch, whatever its size", "1 kg per 250 kg of PE granulate"],
          explanation: "Weigh the masterbatch: 2 kg per 100 kg of PE granulate unless the batch card says otherwise.",
        },
      },
      {
        key: "m2",
        text: "Load the mixer in the right order and close the lid",
        sources: [{ doc: "MIX-OPS-WI-0001", match: [["granulate first", "close the lid"], ["granulate first"]] }],
        fact: ["granulate first", "masterbatch", "lid"],
        q: {
          prompt: "In which order do you load MXR-101?",
          correct: "Granulate first, then masterbatch, and close the lid before starting",
          wrong: [
            "Masterbatch first, then granulate, lid open",
            "Granulate and masterbatch together while the mixer runs",
            "Granulate first, start mixing, then add the masterbatch",
          ],
          explanation: "Load granulate first, then masterbatch, and close the lid before starting.",
        },
      },
      {
        key: "m3",
        text: "Mix for the right time before releasing the batch",
        sources: [{ doc: "MIX-OPS-WI-0001", match: [["mix for 4 minutes"], ["4 minutes"]] }],
        fact: ["mix for 4 minutes"],
        q: {
          prompt: "How long do you mix a batch before releasing it to the line 2 hopper?",
          correct: "4 minutes",
          wrong: ["1 minute", "10 minutes", "Until the colour looks even"],
          explanation: "Mix for 4 minutes and release the batch to the line 2 hopper.",
        },
      },
      {
        key: "m4",
        text: "Protect yourself from dust when handling masterbatch",
        sources: [{ doc: "MIX-HSE-LMRA-0001", match: [["wear an FFP2 dust mask", "emptying bags"], ["FFP2", "emptying bags"]] }],
        fact: ["FFP2", "emptying bags"],
        q: {
          prompt: "You empty bags of masterbatch into the mixer. What do you wear?",
          correct: "A dust mask (FFP2)",
          wrong: ["Hearing protection only", "No mask, the extraction is enough", "A paper face cover"],
          explanation: "Wear a dust mask (FFP2) when emptying bags.",
        },
      },
      {
        key: "m5",
        text: "Dry the PE granulate at the right temperature for long enough",
        sources: [{ doc: "MIX-OPS-SOP-0002", match: [["dried at 80 °C for at least 4 hours"], ["80 °C", "at least 4 hours"]] }],
        fact: ["80 °C", "at least 4 hours"],
        q: {
          prompt: "How is PE granulate dried on DRY-102 before mixing?",
          correct: "At 80 °C for at least 4 hours",
          wrong: ["At 120 °C for 1 hour", "At 80 °C for 30 minutes", "At room temperature overnight"],
          explanation: "Dry PE granulate at 80 °C for at least 4 hours.",
        },
      },
    ],
    versions: [
      { keys: ["m1", "m2", "m3", "m4"], publishedDaysAgo: 290, author: SANNE, reviewer: MARK, approver: INGRID },
      { keys: ["m1", "m2", "m3", "m4", "m5"], publishedDaysAgo: null, author: SANNE, status: "in_review" },
    ],
    attempts: [
      { person: "Pieter Bakker", daysAgo: 270, wrong: [] },
      { person: "Emma de Boer", daysAgo: 140 },
    ],
  },
  {
    code: "QCL-TRN-0001",
    title: "Wall thickness measurement",
    kind: "course",
    area: "QCL",
    purpose: "For quality lab technicians: measure wall thickness and diameter of PE pipe correctly and act on what you find.",
    passMark: 80,
    objectives: [
      {
        key: "w1",
        text: "Calibrate the gauge on the step block",
        sources: [
          // The calibration section of the Sonatek manual, not a table row or the error list.
          { doc: "QCL-QA-MAN-0001", match: [["calibrate the UT-200 with a two-point calibration", "step block"], ["two-point calibration on the step block"]] },
          { doc: "QCL-QA-SOP-0001", match: [["two-point calibration", "step block"]] },
        ],
        fact: ["two-point calibration", "step block"],
        q: {
          prompt: "How is the UT-200 gauge calibrated?",
          correct: "A two-point calibration on the step block",
          wrong: [
            "A one-point check on any pipe offcut",
            "No calibration: it is set at the factory",
            "By comparing it with a tape measure",
          ],
          explanation: "The gauge is calibrated with a two-point calibration on the step block.",
        },
      },
      {
        key: "w2",
        text: "Measure at enough points around the pipe",
        sources: [{ doc: "QCL-QA-SOP-0001", match: [["8 points"], ["eight points"]] }],
        fact: ["8 points", "circumference"],
        q: {
          prompt: "At how many points do you measure the wall thickness at each pipe end?",
          correct: "8 points evenly around the circumference",
          wrong: ["1 point at the top", "4 points at random", "2 points opposite each other"],
          explanation: "Measure at 8 points evenly around the circumference.",
        },
      },
      {
        key: "w3",
        text: "Measure at the required frequency",
        sources: [{ doc: "QCL-QA-SOP-0001", match: [["every 2 hours"]] }],
        fact: ["every 2 hours"],
        q: {
          prompt: "After the first pipes following start-up, how often do you measure?",
          correct: "Every 2 hours per line",
          wrong: ["Once per shift", "Every 8 hours", "Only when an operator asks"],
          explanation: "Then measure every 2 hours per line.",
        },
      },
      {
        key: "w4",
        text: "Know the wall thickness tolerance for 110 mm SDR 11",
        sources: [{ doc: "QCL-QA-SOP-0001", match: [["110", "SDR 11", "11.1"], ["110", "11.1"]] }],
        fact: ["110", "10.0", "11.1"],
        q: {
          prompt: "What wall thickness is allowed for 110 mm SDR 11 pipe?",
          correct: "10.0 to 11.1 mm",
          wrong: ["6.6 to 7.4 mm", "10.0 to 10.7 mm", "5.8 to 6.5 mm"],
          explanation: "For 110 SDR 11 the wall thickness must be 10.0-11.1 mm.",
        },
      },
      {
        key: "w5",
        text: "Quarantine pipe that is out of tolerance",
        sources: [{ doc: "QCL-QA-WI-0001", match: [["only the quality manager releases"], ["only the quality manager"]] }],
        fact: ["only the quality manager", "releases"],
        q: {
          prompt: "Who may release or scrap pipe that is in quarantine?",
          correct: "Only the quality manager",
          wrong: ["Any operator on the line", "The shift leader", "The lab technician who measured it"],
          explanation: "Only the quality manager releases or scraps quarantined pipe.",
        },
      },
    ],
    versions: [{ keys: ["w1", "w2", "w3", "w4", "w5"], publishedDaysAgo: 165, author: INGRID, reviewer: SANNE, approver: MARK }],
    attempts: [{ person: "Kevin Mulder", daysAgo: 45 }],
  },
  {
    code: "EXT-TRN-0003",
    title: "Screen pack change",
    kind: "course",
    area: "EXT",
    purpose: "For line 2 operators and maintenance: change the screen pack on EXL-201 at the right moment, safely.",
    passMark: 80,
    objectives: [
      {
        key: "s1",
        text: "Know when the screen pack must be changed",
        sources: [
          { doc: "EXT-MNT-SOP-0001", match: [["at least every 500 operating hours"]] },
          { doc: "EXT-MNT-MAN-0001", match: [["at least every 500 operating hours"], ["500 operating hours"]] },
        ],
        fact: ["500 operating hours"],
        q: {
          prompt: "Besides every product change, when must the screen pack be changed at the latest?",
          correct: "At least every 500 operating hours",
          wrong: ["Once a year", "Every 50 operating hours", "Only when the line stops by itself"],
          explanation: "Change the screen pack at every product change and at least every 500 operating hours.",
        },
      },
      {
        key: "s2",
        text: "Recognise a clogged screen pack from the melt pressure",
        sources: [
          { doc: "EXT-MNT-SOP-0001", match: [["change the screen pack", "more than 30 bar above the baseline"]] },
          { doc: "EXT-MNT-MAN-0001", match: [["change the screen pack", "more than 30 bar above the baseline"]] },
        ],
        fact: ["more than 30 bar above the baseline"],
        q: {
          prompt: "Which melt pressure sign tells you the screen pack needs changing?",
          correct: "Melt pressure more than 30 bar above the baseline for that product",
          wrong: [
            "Melt pressure 30 bar below the baseline",
            "Any melt pressure above 100 bar",
            "Melt pressure that changes by 5 bar",
          ],
          explanation: "Change the screen pack when melt pressure rises more than 30 bar above the baseline for that product.",
        },
      },
      {
        key: "s3",
        text: "Fit the screens in the right order on the breaker plate",
        sources: [
          { doc: "EXT-MNT-SOP-0001", match: [["three new screens", "40 mesh, 80 mesh, 40 mesh"], ["40/80/40"]] },
          { doc: "EXT-MNT-MAN-0001", match: [["40/80/40"]] },
        ],
        fact: ["40", "80", "mesh"],
        q: {
          prompt: "Which screens make up the screen pack on the breaker plate?",
          correct: "Three screens: 40/80/40 mesh",
          wrong: ["One 80 mesh screen", "Two screens: 40/40 mesh", "Three screens: 80/40/80 mesh"],
          explanation: "The screen pack is three screens, 40/80/40 mesh, on a breaker plate.",
        },
      },
      {
        key: "s4",
        text: "Protect yourself from the hot breaker plate and die",
        sources: [
          { doc: "EXT-MNT-SOP-0001", match: [["wear heat-resistant gloves", "EN 407"], ["heat-resistant gloves"]] },
        ],
        fact: ["heat-resistant gloves"],
        q: {
          prompt: "What do you wear when you handle the hot breaker plate?",
          correct: "Heat-resistant gloves",
          wrong: ["Thin nitrile gloves", "No gloves, for a better grip", "Cut-resistant gloves only"],
          explanation: "Wear heat-resistant gloves when working at the hot parts.",
        },
      },
    ],
    versions: [{ keys: ["s1", "s2", "s3", "s4"], publishedDaysAgo: 180, author: MARK, reviewer: SANNE, approver: INGRID }],
    attempts: [
      { person: "Fatima El Amrani", daysAgo: 30 },
      { person: "Jan de Vries", daysAgo: 60 },
    ],
  },
]

// ---- Matching ------------------------------------------------------------------

const squash = (s: string) => normalise(s).replace(/\s+/g, " ").trim()

/**
 * The live passage that holds every keyword of the first set that matches,
 * and its best sentence. The shortest such passage wins: a single step says
 * it more precisely than an overview, a contents page or a figure caption.
 * A passage only counts when its quote states the objective's fact: the
 * shortest hit can be a different step about the same thing ("Close the
 * dump valve" instead of "open" it), and that must never become the source.
 */
function findPassage(live: LiveDoc, match: string[][], fact: string[]) {
  const facts = fact.map(squash)
  const states = (s: string) => facts.every((k) => squash(s).includes(k))
  for (const set of match) {
    const keys = set.map(squash)
    const has = (s: string) => keys.every((k) => squash(s).includes(k))
    const hits = live.passages
      .filter((p) => p.text.trim() !== (p.section ?? "").trim())
      .filter((p) => !/^(contents|figure:|fig\.\s*\d)/i.test(p.text.trim()))
      .filter((p) => has(p.text))
      .sort((a, b) => a.text.length - b.text.length)
    for (const p of hits) {
      const sentences = p.text.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean)
      const sentence =
        sentences.find((s) => has(s) && states(s) && s.length >= 20) ??
        sentences.find((s) => has(s) && s.length >= 20)
      const quote = sentence ?? p.text
      if (states(quote)) return { passage: p, quote }
      if (states(p.text)) return { passage: p, quote: p.text }
    }
  }
  return null
}

async function findPerson(ctx: MutationCtx, people: Doc<"people">[], name: string, engineer = false) {
  const exact = people.find((p) => p.name === name)
  if (exact) return exact
  if (engineer) return people.find((p) => p.kind === "engineer") ?? null
  void ctx
  return null
}

/**
 * Dry run of the objective matching against today's Published versions:
 * which passage and quote each objective would cite, or why none. Read only.
 * npx convex run seed/trainings:checkObjectives
 */
export const checkObjectives = internalQuery({
  args: {},
  handler: async (ctx) => {
    const out: { objective: string; doc: string | null; quote: string | null; ok: boolean }[] = []
    for (const def of TRAININGS) {
      for (const o of def.objectives) {
        let hit: { doc: string; quote: string } | null = null
        for (const src of o.sources) {
          const doc = await ctx.db
            .query("documents")
            .withIndex("by_namingCode", (q) => q.eq("namingCode", src.doc))
            .first()
          const live = doc ? await loadLiveDoc(ctx, doc._id) : null
          const found = live ? findPassage(live, src.match, o.fact) : null
          if (found) {
            hit = { doc: `${src.doc} v${live!.version}`, quote: found.quote }
            break
          }
        }
        out.push({ objective: `${def.code} ${o.key}`, doc: hit?.doc ?? null, quote: hit?.quote ?? null, ok: !!hit })
      }
    }
    return out
  },
})

// ---- Run ------------------------------------------------------------------------

export const run = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now()
    const people = await ctx.db.query("people").take(200)
    const user = await ctx.db.query("users").first()
    const userId: Id<"users"> | null = user?._id ?? null
    const counts = { trainings: 0, versions: 0, objectives: 0, attempts: 0, records: 0, skipped: [] as string[] }

    // Idempotent: replace only what this seed owns.
    for (const def of TRAININGS) {
      const old = await ctx.db
        .query("trainings")
        .withIndex("by_code", (q) => q.eq("code", def.code))
        .collect()
      for (const t of old) {
        for (const row of await ctx.db
          .query("trainingVersions")
          .withIndex("by_trainingId_and_version", (q) => q.eq("trainingId", t._id))
          .collect())
          await ctx.db.delete(row._id)
        for (const a of await ctx.db
          .query("trainingAttempts")
          .withIndex("by_trainingId", (q) => q.eq("trainingId", t._id))
          .collect())
          await ctx.db.delete(a._id)
        for (const r of await ctx.db
          .query("trainingRecords")
          .withIndex("by_trainingId", (q) => q.eq("trainingId", t._id))
          .collect())
          await ctx.db.delete(r._id)
        await ctx.db.delete(t._id)
      }
    }

    const liveDocs = new Map<string, LiveDoc | null>()
    const liveByCode = async (code: string) => {
      if (!liveDocs.has(code)) {
        const doc = await ctx.db
          .query("documents")
          .withIndex("by_namingCode", (q) => q.eq("namingCode", code))
          .first()
        liveDocs.set(code, doc ? await loadLiveDoc(ctx, doc._id) : null)
      }
      return liveDocs.get(code)!
    }
    const maxSeq = new Map<string, number>()

    for (const def of TRAININGS) {
      // Resolve objectives to live passages.
      const resolved = new Map<
        string,
        { def: ObjectiveDef; stored: Doc<"trainingVersions">["objectives"][number]; section: string | null }
      >()
      for (const o of def.objectives) {
        for (const src of o.sources) {
          const live = await liveByCode(src.doc)
          if (!live) continue
          const hit = findPassage(live, src.match, o.fact)
          if (!hit) continue
          resolved.set(o.key, {
            def: o,
            section: hit.passage.section,
            stored: {
              id: o.key,
              text: o.text,
              documentId: live.doc._id,
              namingCode: live.doc.namingCode,
              documentVersion: live.version,
              chunkId: hit.passage.chunkId,
              quote: hit.quote,
            },
          })
          break
        }
        if (!resolved.has(o.key)) {
          const why = `${def.code} ${o.key}: no passage states "${o.fact.join(" + ")}"`
          counts.skipped.push(why)
          console.warn(`seed trainings: ${why}`)
        }
      }

      // Rounds: stops whose Asset exists; objectives only where they have a stop.
      const stops: Doc<"trainingVersions">["stops"] = []
      if (def.kind === "round") {
        for (const s of def.stops ?? []) {
          const asset = await ctx.db
            .query("assets")
            .withIndex("by_code", (q) => q.eq("code", s.asset))
            .first()
          const objectiveIds = s.objectives.filter((k) => resolved.has(k))
          if (!asset || (objectiveIds.length === 0 && s.evidence === "none")) {
            counts.skipped.push(`${def.code} stop ${s.asset}`)
            continue
          }
          stops.push({ assetId: asset._id, objectiveIds, hint: s.hint, evidence: s.evidence })
        }
        const atStop = new Set(stops.flatMap((s) => s.objectiveIds))
        for (const k of Array.from(resolved.keys())) if (!atStop.has(k)) resolved.delete(k)
      }

      const versionsDef = def.versions
        .map((vd) => ({ ...vd, keys: vd.keys.filter((k) => resolved.has(k)) }))
        .filter((vd) => vd.keys.length > 0)
      if (versionsDef.length === 0 || (def.kind === "round" && stops.length === 0)) {
        counts.skipped.push(def.code)
        continue
      }

      const last = versionsDef[versionsDef.length - 1]
      const liveDef = [...versionsDef].reverse().find((vd) => vd.publishedDaysAgo != null)
      const liveVersion = liveDef ? versionsDef.indexOf(liveDef) + 1 : null
      const currentVersion = versionsDef.length
      const status = last.publishedDaysAgo != null ? "published" : (last.status ?? "draft")
      // A source Document published with a Significant change after this
      // Training went live sends it back to review, as publishing would.
      let needsReviewReason: string | null = null
      if (liveDef) {
        const liveAt = now - liveDef.publishedDaysAgo! * DAY
        for (const k of liveDef.keys) {
          const o = resolved.get(k)!.stored
          const dv = await ctx.db
            .query("documentVersions")
            .withIndex("by_documentId_and_version", (q) =>
              q.eq("documentId", o.documentId).eq("version", o.documentVersion),
            )
            .unique()
          if (dv?.significantChange && dv.publishedAt > liveAt) {
            needsReviewReason = `${o.namingCode} v${o.documentVersion} was published with a Significant change`
            break
          }
        }
      }
      const trainingId = await ctx.db.insert("trainings", {
        code: def.code,
        title: def.title,
        kind: def.kind,
        status,
        currentVersion,
        liveVersion,
        needsReview: needsReviewReason != null,
        needsReviewReason,
        area: def.area,
        createdBy: userId,
        updatedAt: now - (last.publishedDaysAgo ?? 3) * DAY,
      })
      counts.trainings += 1
      const seq = Number(def.code.slice(-4))
      maxSeq.set(def.area, Math.max(maxSeq.get(def.area) ?? 0, seq))

      for (const [i, vd] of versionsDef.entries()) {
        const published = vd.publishedDaysAgo != null ? now - vd.publishedDaysAgo * DAY : null
        // Written 9 days before it was Published; a working version 6 days ago.
        const writtenAt = published != null ? published - 9 * DAY : now - 6 * DAY
        const signoffs: Doc<"trainingVersions">["signoffs"] = []
        const author = await findPerson(ctx, people, vd.author, true)
        signoffs.push({ role: "author", personId: author?._id ?? null, userId, at: writtenAt })
        if (vd.reviewer && (published || vd.status === "approved")) {
          const p = await findPerson(ctx, people, vd.reviewer, true)
          signoffs.push({ role: "reviewer", personId: p?._id ?? null, userId, at: (published ?? now) - 4 * DAY })
        }
        if (vd.approver && published) {
          const p = await findPerson(ctx, people, vd.approver, true)
          signoffs.push({ role: "approver", personId: p?._id ?? null, userId, at: published })
        }
        await ctx.db.insert("trainingVersions", {
          trainingId,
          version: i + 1,
          purpose: def.purpose,
          objectives: vd.keys.map((k) => resolved.get(k)!.stored),
          stops: def.kind === "round" ? stops : [],
          passMark: def.passMark,
          questionsPerObjective: 1,
          signoffs,
          publishedAt: published,
        })
        counts.versions += 1
        counts.objectives += vd.keys.length
      }

      // Past Attempts on the live version, with static questions.
      if (!liveDef || liveVersion == null) continue
      const liveKeys = liveDef.keys
      for (const [pi, ad] of def.attempts.entries()) {
        const person = await findPerson(ctx, people, ad.person)
        if (!person) {
          counts.skipped.push(`${def.code} attempt ${ad.person}`)
          continue
        }
        const finishedAt = now - ad.daysAgo * DAY + (pi + 1) * 37 * 60 * 1000
        if (finishedAt <= now - liveDef.publishedDaysAgo! * DAY) continue
        const startedAt = finishedAt - (12 + pi * 3) * 60 * 1000
        const stopOf = new Map<string, number>()
        stops.forEach((s, si) => s.objectiveIds.forEach((k) => stopOf.set(k, si)))
        const ordered = def.kind === "round" ? [...liveKeys].sort((a, b) => (stopOf.get(a) ?? 0) - (stopOf.get(b) ?? 0)) : liveKeys
        const questions = ordered.map((k, qi) => {
          const r = resolved.get(k)!
          const correctAt = (pi + qi * 3) % 4
          const options = [...r.def.q.wrong] as string[]
          options.splice(correctAt, 0, r.def.q.correct)
          const wrong = ad.wrong?.includes(qi) ?? false
          const answerIndex = wrong ? (correctAt + 1 + (qi % 3)) % 4 : correctAt
          return {
            id: `q${qi + 1}`,
            objectiveId: k,
            stopIndex: def.kind === "round" ? stopOf.get(k) ?? null : null,
            prompt: r.def.q.prompt,
            options,
            correctIndex: correctAt,
            explanation: r.def.q.explanation,
            citation: {
              documentId: r.stored.documentId,
              namingCode: r.stored.namingCode,
              version: r.stored.documentVersion,
              chunkId: r.stored.chunkId,
              quote: r.stored.quote,
            },
            answerIndex,
            answeredAt: startedAt + (qi + 1) * 90 * 1000,
            flag: null,
          }
        })
        const correct = questions.filter((q) => q.answerIndex === q.correctIndex).length
        const score = Math.round((correct / questions.length) * 100)
        const passed = score >= def.passMark
        const attemptId = await ctx.db.insert("trainingAttempts", {
          trainingId,
          trainingVersion: liveVersion,
          personId: person._id,
          status: passed ? "passed" : "failed",
          questions,
          round:
            def.kind === "round"
              ? {
                  currentStop: stops.length,
                  visited: stops.map((s) => s.assetId),
                  wrongScans: pi % 2,
                  evidence: stops
                    .map((s, si) => ({ s, si }))
                    .filter(({ s }) => s.evidence !== "none")
                    .map(({ s, si }) => ({
                      stopIndex: si,
                      kind: s.evidence as "photo" | "note",
                      text: s.evidence === "note" ? "Vacuum gauge reads -0.3 bar." : "Photo taken at the stop (not kept in the showcase seed).",
                      storageId: null,
                      at: startedAt + (si + 1) * 4 * 60 * 1000,
                    })),
                }
              : null,
          score,
          startedAt,
          finishedAt,
          error: null,
        })
        counts.attempts += 1
        if (passed) {
          await ctx.db.insert("trainingRecords", {
            personId: person._id,
            trainingId,
            trainingVersion: liveVersion,
            attemptId,
            trainingCode: def.code,
            trainingTitle: def.title,
            score,
            passedAt: finishedAt,
          })
          counts.records += 1
        }
      }
    }

    // Codes handed out later continue after the seeded ones.
    for (const [area, seq] of maxSeq) {
      const key = `TRN|${area}`
      const counter = await ctx.db
        .query("namingCounters")
        .withIndex("by_key", (q) => q.eq("key", key))
        .unique()
      if (!counter) await ctx.db.insert("namingCounters", { key, value: seq })
      else if (counter.value < seq) await ctx.db.patch(counter._id, { value: seq })
    }
    return counts
  },
})
