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
      // Lotte did not pass twice in a row: the second time asks for a walk-through.
      { person: "Lotte Smit", daysAgo: 6, wrong: [1, 2, 3] },
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

// ---- Builder content: question banks, breakdown, open answers, signals ----------
//
// Seeded Trainings carry an Engineer-made question bank, so Attempts draw
// from it and the demo needs no AI calls: per objective the static question,
// a second wording, open questions (answered in your own words) and picture
// questions (a picture used in the source document). Must-be-right
// objectives have at least two questions. Some past Attempts answer an open
// question, with grades (good, partly, not yet with a shared misconception),
// and one "Still on point?" analysis is ready.

interface OpenDef {
  prompt: string
  keyPoints: string[]
  modelAnswer: string
  explanation: string
  /** Answer by taking a photo at the stop. */
  byPhoto?: boolean
}
interface ImageDef {
  /** Words the picture's alt text contains (all of them). */
  match: string[]
  kind: "choice" | "open"
  prompt: string
  correct?: string
  wrong?: [string, string, string]
  whyWrong?: [string, string, string]
  keyPoints?: string[]
  modelAnswer?: string
  explanation: string
}
interface ObjectiveExtra {
  critical?: boolean
  variants?: (StaticQuestion & { whyWrong?: [string, string, string] })[]
  whyWrong?: [string, string, string]
  open?: OpenDef
  image?: ImageDef
}
interface OpenAnswerDef {
  text: string
  mode?: "typed" | "voice"
  verdict: "good" | "partly" | "not_yet"
  matched: string[]
  missing: string[]
  misconception?: string
  feedback: string
}
interface TrainingExtra {
  objectives: Record<string, ObjectiveExtra>
  breakdown?: {
    step: string
    keyPoints: [string, "safety" | "quality" | "knack"][]
    reasons: string[]
    objectives: string[]
  }[]
  tryOut?: { required: boolean; checklist: string[] }
  refreshMonths?: number
  /** Past Attempts (by person and days ago) that answered an objective's open question. */
  openAnswers?: { person: string; daysAgo: number; key: string; answer: OpenAnswerDef }[]
  signals?: {
    summary: string
    items: {
      kind: "misconception" | "unclear_question" | "document_gap" | "too_easy" | "practice_differs"
      objective?: string
      text: string
      count: number
      examples: string[]
      suggestion: string
    }[]
  }
}

const PURGE_MISCONCEPTION = "Thinks the purge runs at the normal running temperature of 230 °C"

const EXTRAS: Record<string, TrainingExtra> = {
  "EXT-TRN-0001": {
    objectives: {
      c1: {
        whyWrong: [
          "Stopping the screw comes later; first the mixing operator must know.",
          "Line 2 is not isolated for a changeover; the SOP starts by telling the mixing operator.",
          "The hopper is run down later, after dosing stops, not emptied first.",
        ],
        variants: [
          {
            prompt: "Who do you tell first when a colour changeover on line 2 starts, and what do you tell them?",
            correct: "The mixing operator: the changeover is starting and which colour comes next",
            wrong: [
              "The shift leader: the line will stop for an hour",
              "The quality lab: the first pipes need measuring",
              "Nobody: the changeover card says it all",
            ],
            explanation: "Tell the mixing operator the changeover is starting and which colour comes next.",
          },
        ],
      },
      c2: {
        whyWrong: [
          "An empty hopper starves the screw; dosing stops below 20 percent.",
          "At 50 percent there is still too much old colour in the hopper.",
          "Dosing stops at a hopper level, not when the changeover is announced.",
        ],
        variants: [
          {
            prompt: "The extruder hopper is running down for a changeover. At what level do you stop dosing at MXR-101?",
            correct: "Below 20 percent",
            wrong: ["Below 50 percent", "At 0 percent, when it is empty", "Below 75 percent"],
            explanation: "Stop dosing at MXR-101 when the extruder hopper is below 20 percent.",
          },
        ],
      },
      c3: {
        whyWrong: [
          "230 °C is too hot for the purge; the SOP says 190 °C.",
          "Fresh granulate does not clean the barrel; use purge compound PX-4400.",
          "150 °C is too cold for the purge; the SOP says 190 °C.",
        ],
        variants: [
          {
            prompt: "You are about to purge the barrel of EXL-201. Which temperature do you purge at?",
            correct: "190 °C",
            wrong: ["230 °C", "150 °C", "210 °C"],
            explanation: "Purge the barrel with purge compound PX-4400 at 190 °C until the melt runs clean.",
          },
        ],
        open: {
          prompt: "Describe in your own words how you purge the barrel during a colour changeover.",
          keyPoints: ["Use purge compound PX-4400", "Purge at 190 °C", "Keep purging until the melt runs clean"],
          modelAnswer: "I purge with purge compound PX-4400 at 190 °C and keep going until the melt runs clean.",
          explanation: "Purge the barrel with purge compound PX-4400 at 190 °C until the melt runs clean.",
        },
      },
      c4: {
        whyWrong: [
          "One by one pulls the die off centre; tighten crosswise.",
          "Hand tight is not enough; the torque is 40 Nm.",
          "80 Nm is double the torque the SOP gives.",
        ],
        variants: [
          {
            prompt: "You fit the die after a changeover. How do you tighten the die bolts?",
            correct: "Crosswise, to 40 Nm",
            wrong: ["One by one around the die, to 40 Nm", "Crosswise, to 80 Nm", "Crosswise, hand tight"],
            explanation: "Tighten the die bolts crosswise to 40 Nm.",
          },
        ],
        open: {
          prompt: "Explain how you tighten the die bolts after fitting the die.",
          keyPoints: ["Tighten crosswise", "Tighten to 40 Nm"],
          modelAnswer: "I tighten the bolts crosswise, not one by one, to 40 Nm with the torque wrench.",
          explanation: "Tighten the die bolts crosswise to 40 Nm.",
        },
      },
      c5: {
        critical: true,
        whyWrong: [
          "The die does not cool down that fast during a changeover.",
          "The die and barrel stay hot during a changeover, above 150 °C.",
          "The heaters stay on during a changeover, so the parts stay hot.",
        ],
        variants: [
          {
            prompt: "During a changeover you need to touch the die. What do you wear on your hands?",
            correct: "Heat-resistant gloves",
            wrong: ["Thin nitrile gloves", "No gloves, for a better grip", "Cut-resistant gloves only"],
            explanation: "The die and barrel stay above 150 °C during a changeover: wear heat-resistant gloves.",
          },
        ],
      },
      c6: {
        whyWrong: [
          "The first pipes after a restart are often off; the SOP asks to scrap and measure.",
          "One pipe is not enough; measure each of the first 10 pipes.",
          "Scrap the first 3 metres, not only the first 1 metre.",
        ],
        variants: [
          {
            prompt: "Line 2 runs again after a changeover. What happens with the first pipes?",
            correct: "Scrap the first 3 metres, then measure the wall of each of the first 10 pipes",
            wrong: [
              "Keep them: the line was already at temperature",
              "Scrap the first 3 metres and measure only the first pipe",
              "Scrap the first 1 metre and measure every second pipe",
            ],
            explanation: "Scrap the first 3 metres and measure wall thickness on each of the first 10 pipes.",
          },
        ],
        open: {
          prompt: "The line runs again after a changeover. Describe what you do with the first pipes.",
          keyPoints: ["Scrap the first 3 metres", "Measure wall thickness on each of the first 10 pipes"],
          modelAnswer: "I scrap the first 3 metres and have the wall thickness of each of the first 10 pipes measured.",
          explanation: "Scrap the first 3 metres and measure wall thickness on each of the first 10 pipes.",
        },
        image: {
          match: ["first 3 metres", "first pipe"],
          kind: "open",
          prompt: "This picture shows the first pipe after the saw of SAW-202 after a changeover. What do you do before this pipe counts as good?",
          keyPoints: ["Scrap the first 3 metres", "Measure wall thickness on each of the first 10 pipes"],
          modelAnswer: "The first 3 metres are scrapped, and the wall of each of the first 10 pipes is measured.",
          explanation: "Scrap the first 3 metres and measure wall thickness on each of the first 10 pipes.",
        },
      },
    },
    breakdown: [
      {
        step: "Announce the changeover",
        keyPoints: [
          ["Tell the mixing operator the changeover is starting", "quality"],
          ["Say which colour comes next", "quality"],
        ],
        reasons: ["So the right masterbatch is ready and no old colour is dosed after the change."],
        objectives: ["c1"],
      },
      {
        step: "Run the hopper down",
        keyPoints: [["Stop dosing at MXR-101 when the extruder hopper is below 20 percent", "quality"]],
        reasons: ["Less old material in the hopper means less to purge out."],
        objectives: ["c2"],
      },
      {
        step: "Purge the barrel",
        keyPoints: [
          ["Use purge compound PX-4400", "quality"],
          ["Purge at 190 °C until the melt runs clean", "quality"],
          ["Heat-resistant gloves on: the die stays above 150 °C", "safety"],
        ],
        reasons: ["The compound cleans the screw and die, so the new colour comes out clean.", "Hot parts and melt can burn."],
        objectives: ["c3", "c5"],
      },
      {
        step: "Fit the die and tighten the bolts",
        keyPoints: [
          ["Tighten crosswise", "knack"],
          ["Tighten to 40 Nm", "quality"],
        ],
        reasons: ["Even pressure keeps the die centred, so the wall thickness stays even."],
        objectives: ["c4"],
      },
      {
        step: "Restart and check the first pipes",
        keyPoints: [
          ["Scrap the first 3 metres", "quality"],
          ["Measure wall thickness on each of the first 10 pipes", "quality"],
        ],
        reasons: ["The first pipe after a changeover is often out of tolerance."],
        objectives: ["c6"],
      },
    ],
    tryOut: {
      required: true,
      checklist: [
        "Told the mixing operator the changeover and the next colour",
        "Stopped dosing with the hopper below 20 percent",
        "Purged with PX-4400 at 190 °C, heat-resistant gloves on",
        "Tightened the die bolts crosswise to 40 Nm",
        "Scrapped the first 3 metres and had the first 10 pipes measured",
      ],
    },
    refreshMonths: 12,
    openAnswers: [
      {
        person: "Jan de Vries",
        daysAgo: 150,
        key: "c3",
        answer: {
          text: "PX-4400 purge compound, barrel at 190 degrees, and I keep purging until the melt comes out clean with no old colour.",
          verdict: "good",
          matched: ["Use purge compound PX-4400", "Purge at 190 °C", "Keep purging until the melt runs clean"],
          missing: [],
          feedback: "Right: PX-4400 at 190 °C until the melt runs clean (EXT-OPS-SOP-0001 v1).",
        },
      },
      {
        person: "Ahmed Yilmaz",
        daysAgo: 95,
        key: "c3",
        answer: {
          text: "I put in the purge compound and run it until the melt is clean.",
          mode: "voice",
          verdict: "partly",
          matched: ["Use purge compound PX-4400", "Keep purging until the melt runs clean"],
          missing: ["Purge at 190 °C"],
          feedback: "Good start. Add the temperature: EXT-OPS-SOP-0001 v1 says purge at 190 °C.",
        },
      },
      {
        person: "Lotte Smit",
        daysAgo: 4,
        key: "c3",
        answer: {
          text: "Run the purge at 230 like normal production and stop when it looks clean.",
          mode: "voice",
          verdict: "not_yet",
          matched: ["Keep purging until the melt runs clean"],
          missing: ["Use purge compound PX-4400", "Purge at 190 °C"],
          misconception: PURGE_MISCONCEPTION,
          feedback: "Not yet. The purge is not done at running temperature: EXT-OPS-SOP-0001 v1 says purge compound PX-4400 at 190 °C.",
        },
      },
      {
        person: "Lotte Smit",
        daysAgo: 6,
        key: "c3",
        answer: {
          text: "Same temperature as running, 230, with the purge stuff until clean.",
          verdict: "not_yet",
          matched: ["Keep purging until the melt runs clean"],
          missing: ["Use purge compound PX-4400", "Purge at 190 °C"],
          misconception: PURGE_MISCONCEPTION,
          feedback: "Not yet. Purge with PX-4400 at 190 °C, not at the running temperature (EXT-OPS-SOP-0001 v1).",
        },
      },
    ],
    signals: {
      summary:
        "Most people know the changeover order. The purge temperature is mixed up with the running temperature, and the hopper level question trips up new starters.",
      items: [
        {
          kind: "misconception",
          objective: "c3",
          text: "People think the purge runs at the normal running temperature (230 °C) instead of 190 °C.",
          count: 2,
          examples: [
            "Run the purge at 230 like normal production and stop when it looks clean.",
            "Same temperature as running, 230, with the purge stuff until clean.",
          ],
          suggestion: "Show the purge temperature next to the running temperature in step 4 of the SOP, and add a key point 'Purge at 190 °C, not at running temperature'.",
        },
        {
          kind: "document_gap",
          objective: "c3",
          text: "EXT-OPS-SOP-0001 gives 190 °C for the purge but does not say to lower the zones from running temperature first.",
          count: 2,
          examples: ["Same temperature as running, 230, with the purge stuff until clean."],
          suggestion: "Propose a revision: add 'Lower all zones to 190 °C before you start the purge' to the purge step.",
        },
        {
          kind: "unclear_question",
          objective: "c2",
          text: "The hopper level question is answered wrongly by new starters: 'below 20 percent' is read as 'at 20 percent full'.",
          count: 2,
          examples: ["When the extruder hopper is below 50 percent"],
          suggestion: "Ask it as a situation: 'The hopper shows 25 percent. Do you stop dosing yet?'",
        },
        {
          kind: "too_easy",
          objective: "c1",
          text: "Everyone gets the first step right on the first try.",
          count: 5,
          examples: [],
          suggestion: "Keep one question on it, or ask what goes wrong when the mixing operator is not told.",
        },
      ],
    },
  },
  "EXT-TRN-0002": {
    objectives: {
      r1: {
        critical: true,
        variants: [
          {
            prompt: "You must reach into the haul-off of line 2. How do you make the line safe first?",
            correct: "Switch off the main isolator and attach your personal lock and tag",
            wrong: [
              "Press the emergency stop and start working",
              "Ask a colleague to watch the control panel",
              "Switch off the haul-off motor at its local panel",
            ],
            explanation: "Isolate line 2 at the main isolator and attach your personal lock and tag.",
          },
        ],
        open: {
          prompt: "Explain in your own words how you isolate line 2 before you work on it.",
          keyPoints: ["Switch off the main isolator of line 2", "Attach your own personal lock", "Attach your tag"],
          modelAnswer: "I switch off the main isolator of line 2 and put my own personal lock and tag on it.",
          explanation: "Isolate line 2 at the main isolator with your own lock and tag.",
        },
      },
      r2: {
        variants: [
          {
            prompt: "You are about to work at the die head of EXL-201. Which gloves do you wear?",
            correct: "Heat-resistant gloves",
            wrong: ["Nitrile gloves", "Cut-resistant gloves", "No gloves"],
            explanation: "Wear heat-resistant gloves when working at the hot die.",
          },
        ],
        image: {
          match: ["right PPE", "hot die head"],
          kind: "open",
          prompt: "Look at the operator at the hot die head of EXL-201. Which protection for the hands must you wear here, and why?",
          keyPoints: ["Heat-resistant gloves"],
          modelAnswer: "Heat-resistant gloves, because the die head is hot and can burn.",
          explanation: "Wear heat-resistant gloves when working at the hot die.",
        },
      },
      r3: {
        variants: [
          {
            prompt: "You stand at VAC-203. Which vacuum should the gauge of the calibration tank show?",
            correct: "-0.3 bar",
            wrong: ["-0.9 bar", "0 bar", "+0.3 bar"],
            explanation: "The vacuum in the calibration tank is -0.3 bar.",
          },
        ],
      },
      r4: {
        critical: true,
        variants: [
          {
            prompt: "Line 2 has stopped by itself and a pipe is stuck in the saw area. What do you do?",
            correct: "Do not reach in: lock out the line first, because a stopped line can restart",
            wrong: [
              "Reach in quickly while it is stopped",
              "Reach in with a tool instead of your hand",
              "Press the emergency stop, then reach in",
            ],
            explanation: "Never reach into the haul-off or saw area of a line that is only stopped.",
          },
        ],
      },
      r5: {
        variants: [
          {
            prompt: "Before you work on the haul-off, how do you release the stored energy?",
            correct: "Open the pneumatic dump valve on the haul-off",
            wrong: [
              "Close the pneumatic dump valve on the haul-off",
              "Wait 5 minutes after the stop",
              "Switch off the compressor in the workshop",
            ],
            explanation: "Release stored energy by opening the pneumatic dump valve on the haul-off.",
          },
        ],
        open: {
          prompt: "Show it: take a photo of the pneumatic dump valve on the haul-off in the position it must be in before you work on it.",
          keyPoints: ["The pneumatic dump valve on the haul-off", "The valve is open"],
          modelAnswer: "A photo of the dump valve on the haul-off of SAW-202 in the open position.",
          explanation: "Release stored energy by opening the pneumatic dump valve on the haul-off.",
          byPhoto: true,
        },
      },
      r6: {
        variants: [
          {
            prompt: "The work on line 2 is done. Which locks may you take off?",
            correct: "Only your own lock",
            wrong: ["Every lock on the isolator", "Your own lock and your colleague's", "The shift leader's lock"],
            explanation: "Only the person who placed a lock may remove it.",
          },
        ],
      },
    },
    breakdown: [
      {
        step: "Isolate line 2 at EXL-201",
        keyPoints: [
          ["Switch off the main isolator of line 2", "safety"],
          ["Attach your own personal lock and tag", "safety"],
        ],
        reasons: ["Your own lock means nobody can switch line 2 on while you work on it."],
        objectives: ["r1"],
      },
      {
        step: "Protect yourself at the die head",
        keyPoints: [["Heat-resistant gloves at the hot die", "safety"]],
        reasons: ["The die and barrel of EXL-201 stay above 150 °C for hours after a stop."],
        objectives: ["r2"],
      },
      {
        step: "Check the vacuum at VAC-203",
        keyPoints: [["The calibration tank gauge reads -0.3 bar", "quality"]],
        reasons: ["The vacuum pulls the hot pipe against the sizing sleeve, which sets the outside diameter."],
        objectives: ["r3"],
      },
      {
        step: "Make the haul-off and saw safe at SAW-202",
        keyPoints: [
          ["Never reach in while the line is only stopped", "safety"],
          ["Open the pneumatic dump valve on the haul-off", "safety"],
        ],
        reasons: [
          "A stopped line can restart.",
          "Compressed air stays in the haul-off cylinders until the dump valve is opened.",
        ],
        objectives: ["r4", "r5"],
      },
      {
        step: "Finish the work at CLR-204",
        keyPoints: [["Remove only your own lock", "safety"]],
        reasons: ["Only the person who placed a lock may remove it, so nobody is left unprotected."],
        objectives: ["r6"],
      },
    ],
    refreshMonths: 12,
    tryOut: {
      required: true,
      checklist: [
        "Switched off the main isolator of line 2",
        "Attached own lock and tag",
        "Released stored energy at the haul-off dump valve",
        "Wore heat-resistant gloves at the die head",
        "Explained why a stopped line is not a safe line",
      ],
    },
  },
  "EXT-TRN-0003": {
    objectives: {
      s2: {
        open: {
          prompt: "How do you recognise that the screen pack of EXL-201 is clogged?",
          keyPoints: ["Melt pressure more than 30 bar above the baseline", "The baseline for that product"],
          modelAnswer: "The melt pressure is more than 30 bar above the baseline for that product.",
          explanation: "A melt pressure more than 30 bar above the baseline for the product means the screen pack is clogged.",
        },
      },
      s3: {
        image: {
          match: ["breaker plate", "three screens"],
          kind: "choice",
          prompt: "This is the breaker plate of EXL-201. In which order are the screens fitted, from the screw side?",
          correct: "40 mesh, 80 mesh, 40 mesh",
          wrong: ["80 mesh, 40 mesh, 80 mesh", "40 mesh, 40 mesh, 80 mesh", "80 mesh, 80 mesh, 40 mesh"],
          whyWrong: [
            "The fine 80 mesh screen sits in the middle, not on the outside.",
            "The 80 mesh screen goes in the middle, between two 40 mesh screens.",
            "Only one 80 mesh screen is used, in the middle.",
          ],
          explanation: "Three screens: 40/80/40 mesh, the fine one in the middle.",
        },
      },
      s4: {
        critical: true,
        variants: [
          {
            prompt: "You open the adapter clamp to change the screen pack. What do you wear on your hands?",
            correct: "Heat-resistant gloves",
            wrong: ["Nitrile gloves", "Cut-resistant gloves only", "No gloves, for a better grip"],
            explanation: "Wear heat-resistant gloves when working at the hot parts.",
          },
        ],
      },
    },
    breakdown: [
      {
        step: "Decide that the screen pack is due",
        keyPoints: [
          ["At least every 500 operating hours", "quality"],
          ["Melt pressure more than 30 bar above the baseline for the product", "quality"],
        ],
        reasons: ["A blocked screen pack raises the melt pressure and gives specks in the pipe."],
        objectives: ["s1", "s2"],
      },
      {
        step: "Open the adapter clamp and take out the breaker plate",
        keyPoints: [["Heat-resistant gloves (EN 407) and a face shield", "safety"]],
        reasons: ["The screen pack is changed hot, with the zones at set point, so the PE stays soft: it is hot work at the die head."],
        objectives: ["s4"],
      },
      {
        step: "Fit the new screens",
        keyPoints: [["40 mesh, 80 mesh, 40 mesh from the screw side", "knack"]],
        reasons: ["The screens catch dirt and unmelted particles before they reach the die."],
        objectives: ["s3"],
      },
    ],
    tryOut: {
      required: true,
      checklist: [
        "Wrote the melt pressure in the maintenance log before stopping",
        "Wore EN 407 gloves and a face shield at the adapter clamp",
        "Fitted the screens 40, 80, 40 mesh from the screw side",
      ],
    },
    refreshMonths: 24,
  },
  "MIX-TRN-0001": {
    objectives: {
      m2: {
        open: {
          prompt: "Describe how you load MXR-101 for a batch.",
          keyPoints: ["Granulate first", "Then the masterbatch", "Close the lid before starting"],
          modelAnswer: "Granulate goes in first, then the masterbatch, and I close the lid before I start the mixer.",
          explanation: "Load granulate first, then masterbatch, and close the lid before starting.",
        },
      },
      m4: {
        critical: true,
        variants: [
          {
            prompt: "You empty bags of masterbatch into the dosing hopper. What do you wear against the dust?",
            correct: "An FFP2 dust mask",
            wrong: ["An FFP1 dust mask", "Safety glasses only", "Nothing, the extraction hood is on"],
            explanation: "Wear an FFP2 dust mask when emptying bags of masterbatch.",
          },
        ],
      },
    },
    breakdown: [
      {
        step: "Weigh the masterbatch",
        keyPoints: [["2 kg per 100 kg of PE granulate, unless the batch card says otherwise", "quality"]],
        reasons: ["The batch card can set another ratio: it always wins over the standard."],
        objectives: ["m1"],
      },
      {
        step: "Empty the bags into the dosing hopper",
        keyPoints: [
          ["FFP2 dust mask on while emptying bags", "safety"],
          ["Local extraction at the dosing hopper on", "safety"],
        ],
        reasons: ["Emptying bags puts masterbatch and granulate dust in the air you breathe."],
        objectives: ["m4"],
      },
      {
        step: "Load MXR-101 and close the lid",
        keyPoints: [
          ["Granulate first, then masterbatch", "knack"],
          ["Close the lid fully before starting", "safety"],
        ],
        reasons: ["MXR-101 will not start with the lid open: never bypass the lid interlock."],
        objectives: ["m2"],
      },
      {
        step: "Mix and release the batch",
        keyPoints: [["Mix for 4 minutes", "quality"]],
        reasons: ["The batch is released to the line 2 hopper only after the full mixing time."],
        objectives: ["m3"],
      },
      {
        step: "Dry the granulate on DRY-102",
        keyPoints: [["80 °C for at least 4 hours", "quality"]],
        reasons: ["Moisture in the granulate turns into steam in the extruder: bubbles, voids and a rough inner surface in the pipe wall."],
        objectives: ["m5"],
      },
    ],
    tryOut: {
      required: true,
      checklist: [
        "Checked the batch card for the masterbatch ratio",
        "Wore the FFP2 dust mask with the extraction on",
        "Loaded granulate first, then masterbatch, and closed the lid",
        "Mixed for 4 minutes before releasing the batch",
      ],
    },
    refreshMonths: 24,
  },
  "QCL-TRN-0001": {
    objectives: {
      w5: {
        open: {
          prompt: "A pipe is out of tolerance. Explain what happens to it and who decides.",
          keyPoints: ["The pipe goes to quarantine", "Only the quality manager releases it"],
          modelAnswer: "The pipe goes into quarantine with a red label, and only the quality manager may release it.",
          explanation: "Pipe out of tolerance is quarantined; only the quality manager releases it.",
        },
      },
    },
    breakdown: [
      {
        step: "Calibrate the UT-200",
        keyPoints: [["Two-point calibration on the 3 mm and 12 mm steps of the step block", "quality"]],
        reasons: ["Before the first measurement of the day, and after the probe, cable or batteries are changed or the gauge was dropped."],
        objectives: ["w1"],
      },
      {
        step: "Measure the test piece",
        keyPoints: [
          ["8 points evenly around the circumference at each end", "quality"],
          ["One test piece every 2 hours on line 2", "quality"],
        ],
        reasons: ["16 readings per test piece show an off-centre die, where one side of the wall is thin."],
        objectives: ["w2", "w3"],
      },
      {
        step: "Judge the result",
        keyPoints: [
          ["110 SDR 11: wall 10.0 to 11.1 mm", "quality"],
          ["Out of tolerance: quarantine, only the quality manager releases", "quality"],
        ],
        reasons: ["The pipe is used for drinking water and gas."],
        objectives: ["w4", "w5"],
      },
    ],
    tryOut: { required: false, checklist: [] },
    refreshMonths: 12,
  },
}

const gradeScore = (v: OpenAnswerDef["verdict"]) => (v === "good" ? 1 : v === "partly" ? 0.5 : 0)

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

type Resolved = Map<string, { def: ObjectiveDef; stored: Doc<"trainingVersions">["objectives"][number]; section: string | null }>

/** The question bank, breakdown and try-out of a seeded version, from EXTRAS. */
function bankAndBreakdown(
  def: TrainingDef,
  extra: TrainingExtra,
  keys: string[],
  resolved: Resolved,
  stops: Doc<"trainingVersions">["stops"],
  imageFor: (match: string[]) => Id<"images"> | null,
) {
  type Bank = NonNullable<Doc<"trainingVersions">["questionBank"]>
  const bank: Bank = []
  const stopOf = (k: string) => {
    if (def.kind !== "round") return null
    const i = stops.findIndex((s) => s.objectiveIds.includes(k))
    return i >= 0 ? i : null
  }
  for (const k of keys) {
    const r = resolved.get(k)!
    const x = extra.objectives[k] ?? {}
    const citation = {
      documentId: r.stored.documentId,
      namingCode: r.stored.namingCode,
      version: r.stored.documentVersion,
      chunkId: r.stored.chunkId,
      quote: r.stored.quote,
    }
    const choices = [
      { q: r.def.q, why: x.whyWrong },
      ...(x.variants ?? []).map((q) => ({ q, why: q.whyWrong })),
    ]
    choices.forEach(({ q, why }, vi) => {
      const correctAt = (vi + k.length) % 4
      const options = [...q.wrong] as string[]
      options.splice(correctAt, 0, q.correct)
      bank.push({
        id: `${k}-c${vi + 1}`,
        objectiveId: k,
        kind: "choice",
        prompt: q.prompt,
        options,
        correctIndex: correctAt,
        explanation: q.explanation,
        citation,
        source: "engineer",
        stopIndex: stopOf(k),
        ...(why ? { whyWrong: [...why] } : {}),
      })
    })
    if (x.open) {
      // A photo answer only where the stop asks for a photo.
      const byPhoto = !!x.open.byPhoto && def.kind === "round" && stops[stopOf(k) ?? -1]?.evidence === "photo"
      if (!x.open.byPhoto || byPhoto)
        bank.push({
          id: `${k}-o1`,
          objectiveId: k,
          kind: "open",
          prompt: x.open.prompt,
          options: [],
          correctIndex: 0,
          keyPoints: x.open.keyPoints,
          modelAnswer: x.open.modelAnswer,
          explanation: x.open.explanation,
          citation,
          source: "engineer",
          stopIndex: stopOf(k),
          ...(byPhoto ? { answerByPhoto: true } : {}),
        })
    }
    if (x.image) {
      const imageId = imageFor(x.image.match)
      if (imageId) {
        const img = x.image
        if (img.kind === "choice" && img.correct && img.wrong) {
          const options = [...img.wrong] as string[]
          options.splice(1, 0, img.correct)
          bank.push({
            id: `${k}-i1`,
            objectiveId: k,
            kind: "choice",
            prompt: img.prompt,
            options,
            correctIndex: 1,
            explanation: img.explanation,
            citation,
            source: "engineer",
            stopIndex: stopOf(k),
            imageId,
            ...(img.whyWrong ? { whyWrong: [...img.whyWrong] } : {}),
          })
        } else if (img.kind === "open" && img.keyPoints) {
          bank.push({
            id: `${k}-i1`,
            objectiveId: k,
            kind: "open",
            prompt: img.prompt,
            options: [],
            correctIndex: 0,
            keyPoints: img.keyPoints,
            modelAnswer: img.modelAnswer,
            explanation: img.explanation,
            citation,
            source: "engineer",
            stopIndex: stopOf(k),
            imageId,
          })
        }
      }
    }
  }
  const breakdown = extra.breakdown
    ?.map((b, i) => {
      const objectiveIds = b.objectives.filter((k) => keys.includes(k))
      const first = objectiveIds[0] ? resolved.get(objectiveIds[0]) : undefined
      return {
        id: `b${i + 1}`,
        step: b.step,
        keyPoints: b.keyPoints.map(([t]) => t),
        keyPointKinds: b.keyPoints.map(([, kind]) => kind),
        reasons: b.reasons,
        objectiveIds,
        ...(first
          ? {
              citation: {
                documentId: first.stored.documentId,
                namingCode: first.stored.namingCode,
                version: first.stored.documentVersion,
                chunkId: first.stored.chunkId,
                quote: first.stored.quote,
              },
            }
          : {}),
      }
    })
    .filter((b) => b.objectiveIds.length > 0)
  return {
    questionBank: bank,
    ...(breakdown && breakdown.length > 0 ? { breakdown } : {}),
    ...(extra.tryOut ? { tryOut: extra.tryOut } : {}),
    ...(extra.refreshMonths ? { refreshMonths: extra.refreshMonths } : {}),
  }
}

// ---- Run ------------------------------------------------------------------------

export const run = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now()
    const people = await ctx.db.query("people").take(200)
    const user = await ctx.db.query("users").first()
    const userId: Id<"users"> | null = user?._id ?? null
    const counts = { trainings: 0, versions: 0, objectives: 0, attempts: 0, records: 0, signals: 0, skipped: [] as string[] }

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
        for (const s of await ctx.db
          .query("trainingSignals")
          .withIndex("by_trainingId_and_version", (q) => q.eq("trainingId", t._id))
          .collect())
          await ctx.db.delete(s._id)
        for (const a of await ctx.db
          .query("trainingAssignments")
          .withIndex("by_trainingId", (q) => q.eq("trainingId", t._id))
          .collect())
          await ctx.db.delete(a._id)
        await ctx.db.delete(t._id)
      }
    }
    // Requests point at Trainings and Attempts that were just replaced.
    for (const r of await ctx.db.query("tryOutRequests").take(2000)) if (!(await ctx.db.get(r.trainingId))) await ctx.db.delete(r._id)
    // Pictures by their alt text, for the picture questions.
    const images = await ctx.db.query("images").take(2000)
    const imageFor = (match: string[]) =>
      images.find((img) => match.every((m) => img.altText.toLowerCase().includes(m.toLowerCase())))?._id ?? null

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
        const extra = EXTRAS[def.code]
        const objectives = vd.keys.map((k) => ({
          ...resolved.get(k)!.stored,
          ...(extra?.objectives[k]?.critical ? { critical: true } : {}),
        }))
        await ctx.db.insert("trainingVersions", {
          trainingId,
          version: i + 1,
          purpose: def.purpose,
          objectives,
          stops: def.kind === "round" ? stops : [],
          passMark: def.passMark,
          questionsPerObjective: 1,
          ...(extra ? bankAndBreakdown(def, extra, vd.keys, resolved, stops, imageFor) : {}),
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
        const extra = EXTRAS[def.code]
        const questions: Doc<"trainingAttempts">["questions"] = ordered.map((k, qi) => {
          const r = resolved.get(k)!
          const citation = {
            documentId: r.stored.documentId,
            namingCode: r.stored.namingCode,
            version: r.stored.documentVersion,
            chunkId: r.stored.chunkId,
            quote: r.stored.quote,
          }
          const critical = extra?.objectives[k]?.critical ? { critical: true } : {}
          const answeredAt = startedAt + (qi + 1) * 90 * 1000
          const open = extra?.openAnswers?.find((x) => x.person === ad.person && x.daysAgo === ad.daysAgo && x.key === k)
          const openDef = extra?.objectives[k]?.open
          if (open && openDef) {
            return {
              id: `q${qi + 1}`,
              objectiveId: k,
              stopIndex: def.kind === "round" ? stopOf.get(k) ?? null : null,
              prompt: openDef.prompt,
              options: [],
              correctIndex: 0,
              explanation: openDef.explanation,
              citation,
              answerIndex: null,
              answeredAt,
              flag: null,
              kind: "open" as const,
              keyPoints: openDef.keyPoints,
              answerText: open.answer.text,
              answerMode: open.answer.mode ?? "typed",
              grade: {
                verdict: open.answer.verdict,
                score: gradeScore(open.answer.verdict),
                matched: open.answer.matched,
                missing: open.answer.missing,
                ...(open.answer.misconception ? { misconception: open.answer.misconception } : {}),
                feedback: open.answer.feedback,
                gradedBy: "ai" as const,
                gradedAt: answeredAt + 20 * 1000,
              },
              source: "bank" as const,
              ...critical,
            }
          }
          const correctAt = (pi + qi * 3) % 4
          const options = [...r.def.q.wrong] as string[]
          options.splice(correctAt, 0, r.def.q.correct)
          const why = extra?.objectives[k]?.whyWrong
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
            citation,
            answerIndex,
            answeredAt,
            flag: null,
            kind: "choice" as const,
            ...(why ? { whyWrong: [...why] } : {}),
            source: "bank" as const,
            ...critical,
          }
        })
        const points = questions.reduce(
          (n, q) => n + (q.kind === "open" ? q.grade?.score ?? 0 : q.answerIndex === q.correctIndex ? 1 : 0),
          0,
        )
        const score = Math.round((points / questions.length) * 100)
        const mustBeRightMissed = questions
          .filter((q) => q.critical && (q.kind === "open" ? (q.grade?.score ?? 0) < 1 : q.answerIndex !== q.correctIndex))
          .map((q) => q.objectiveId)
        const passed = score >= def.passMark && mustBeRightMissed.length === 0
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
          ...(mustBeRightMissed.length > 0 ? { mustBeRightMissed } : {}),
          ...(def.kind === "course" && extra?.breakdown ? { presentSeenAt: startedAt + 30 * 1000 } : {}),
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

      // One ready "Still on point?" analysis, so the demo shows it without AI calls.
      const sig = EXTRAS[def.code]?.signals
      if (sig) {
        const finishedCount = (
          await ctx.db
            .query("trainingAttempts")
            .withIndex("by_trainingId", (q) => q.eq("trainingId", trainingId))
            .collect()
        ).filter((a) => a.status === "passed" || a.status === "failed").length
        await ctx.db.insert("trainingSignals", {
          trainingId,
          version: liveVersion,
          status: "ready",
          at: now - 2 * DAY,
          attemptsAnalysed: finishedCount,
          summary: sig.summary,
          items: sig.items
            .filter((i) => !i.objective || liveKeys.includes(i.objective))
            .map((i) => ({
              kind: i.kind,
              ...(i.objective ? { objectiveId: i.objective } : {}),
              text: i.text,
              count: i.count,
              examples: i.examples,
              suggestion: i.suggestion,
            })),
        })
        counts.signals += 1
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
