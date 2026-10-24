// Seed module: Captures and a combined Capture set (docs/adr/0005). Called by
// seedKnowledge after people, assets, documents, Trainings and Skills exist.
//
// Four handed-in, processed Captures of the job "Start-up of line 2 after a
// stop" by four line operators, each done slightly differently:
//   - Jan de Vries does it by the book.
//   - Fatima El Amrani adds a knack: she warms the start-up pipe end.
//   - Lotte Smit (new starter) skips the spray nozzle check of VAC-203.
//   - Ahmed Yilmaz purges for 5 minutes, where the Published changeover SOP
//     EXT-OPS-SOP-0001 v1 says about 15 minutes (the conflict).
// Plus one Capture set over all four, already combined with Variations and
// that conflict, and one Capture still recording (Fatima) for the running pill.
//
// Photos reuse the storage of seeded images; voice notes are transcripts
// without audio (analysisNote "seeded transcript"). No AI calls. Skips when
// Captures already exist, so it is safe to run again.
import { internalMutation, MutationCtx } from "../_generated/server"
import { Doc, Id } from "../_generated/dataModel"

const MIN = 60 * 1000
const HOUR = 60 * MIN
const DAY = 24 * HOUR
const JOB = "Start-up of line 2 after a stop"

type Kind = "step" | "safety" | "quality" | "tip" | "problem" | "question"

interface EntryDef {
  key: string
  min: number
  kind: "note" | "voice" | "photo" | "video" | "scan"
  /** note text, voice transcript, or photo/video description */
  text?: string
  /** seeded image key, e.g. "ext-ops-sop-0002/heating-zones", or "asset/EXL-201" */
  photo?: string
  /** scanned Asset code */
  asset?: string
  durationMs?: number
}

interface MomentDef {
  kind: Kind
  title: string
  detail: string
  entries: string[]
}

interface CaptureDef {
  key: string
  person: string
  title: string
  daysAgo: number
  /** UTC hour the Capture started. */
  startHour: number
  summary: string
  tags: string[]
  entries: EntryDef[]
  moments: MomentDef[]
}

const CAPTURES: CaptureDef[] = [
  {
    key: "lotte",
    person: "Lotte Smit",
    title: "My first start-up of line 2",
    daysAgo: 9,
    startHour: 6,
    summary:
      "Lotte started line 2 after a stop with the heating off, watched by Fatima. She followed the soak and set up VAC-203 but did not check the spray nozzles. She asks how long the melt must run before it counts as clean.",
    tags: ["start-up", "line 2", "new starter", "vac-203"],
    entries: [
      { key: "e1", min: 0, kind: "note", text: "Asked Fatima to watch me today. Read the shift log, no locks left on MCC-2." },
      { key: "e2", min: 3, kind: "scan", asset: "EXL-201" },
      { key: "e3", min: 4, kind: "photo", photo: "ext-ops-sop-0002/heating-zones", text: "Heater bands along the barrel of EXL-201, from the feed zone to the die. The panel shows all zones close to set point." },
      { key: "e4", min: 6, kind: "voice", durationMs: 9000, text: "All zones are at set point now, so I started the timer for the 90 minute soak. Not touching the screw until it's done." },
      { key: "e5", min: 18, kind: "scan", asset: "VAC-203" },
      { key: "e6", min: 20, kind: "voice", durationMs: 14000, text: "Closed the drain, filled the tank up to the upper mark and started the pump. Water is 18 degrees. The sleeve says 110 on the flange so that matches the card." },
      { key: "e7", min: 21, kind: "photo", photo: "ext-ops-wi-0002/sizing-sleeve-flange", text: "Sizing sleeve flange of VAC-203 with the outside diameter stamped on it." },
      { key: "e8", min: 97, kind: "scan", asset: "EXL-201" },
      { key: "e9", min: 98, kind: "voice", durationMs: 11000, text: "Face shield on, standing at the side of the die. Slide gate open, screw on at 20 rpm, melt goes into the tray until it's clean." },
      { key: "e10", min: 104, kind: "note", text: "Question: how long should the melt run before it counts as clean? I waited until I saw no more streaks, about 7 minutes." },
      { key: "e11", min: 107, kind: "photo", photo: "ext-ops-sop-0002/threading-start-up-pipe", text: "Melt from the die joined to the start-up pipe and pulled into the sizing sleeve of VAC-203." },
      { key: "e12", min: 110, kind: "voice", durationMs: 10000, text: "Pipe is through, lid closed and both clamps on, vacuum minus 0.3. Ramping up slowly to the speed on the card." },
      { key: "e13", min: 124, kind: "scan", asset: "SAW-202" },
      { key: "e14", min: 126, kind: "voice", durationMs: 7000, text: "First 3 metres go to scrap. The lab measures the first 10 pipes before the line is released." },
    ],
    moments: [
      { kind: "step", title: "Read the shift log and check for locks", detail: "Read the shift log and checked that no locks are left on MCC-2.", entries: ["e1"] },
      { kind: "step", title: "Wait for set point, then start the 90-minute soak", detail: "When all zones of EXL-201 were at set point she started the 90-minute soak timer and did not turn the screw.", entries: ["e3", "e4"] },
      { kind: "step", title: "Fill and start VAC-203", detail: "Closed the drain, filled VAC-203 to the upper mark and started the pump; water at 18 °C. Checked the sleeve is 110 mm. The spray nozzles were not checked.", entries: ["e6", "e7"] },
      { kind: "safety", title: "Face shield and stand to the side of the die", detail: "Wore the face shield and stood at the side of the die when starting the screw.", entries: ["e9"] },
      { kind: "step", title: "Start the screw at 20 rpm into the scrap tray", detail: "Opened the slide gate and ran the screw at 20 rpm into the tray until the melt looked clean, about 7 minutes.", entries: ["e9", "e10"] },
      { kind: "question", title: "How long must the melt run before it is clean?", detail: "She waited until there were no streaks, about 7 minutes, and is not sure this is the rule.", entries: ["e10"] },
      { kind: "step", title: "Thread the start-up pipe and set the vacuum", detail: "Joined the melt to the start-up pipe, pulled it into VAC-203, closed the lid with both clamps and set the vacuum to -0.3 bar.", entries: ["e11", "e12"] },
      { kind: "step", title: "Ramp up to the speed on the product card", detail: "Ramped up slowly to the production speed on the card.", entries: ["e12"] },
      { kind: "quality", title: "Scrap the first 3 metres, lab measures 10 pipes", detail: "The first 3 metres go to scrap and the lab measures the first 10 pipes before release.", entries: ["e14"] },
    ],
  },
  {
    key: "jan",
    person: "Jan de Vries",
    title: "Line 2 start-up, night shift",
    daysAgo: 6,
    startHour: 22,
    summary:
      "Jan started line 2 on the night shift after a screen pack change. He followed the full start-up: shift log, zones and 90-minute soak, VAC-203 set-up with the nozzle check, purge until clean at 20 rpm, threading, vacuum and ramp-up, and the first-pipe checks.",
    tags: ["start-up", "line 2", "night shift", "soak"],
    entries: [
      { key: "e1", min: 0, kind: "note", text: "Read the shift log. The stop was for a screen pack change by maintenance. No locks left on MCC-2, checked with the shift leader." },
      { key: "e2", min: 2, kind: "scan", asset: "EXL-201" },
      { key: "e3", min: 3, kind: "photo", photo: "ext-ops-sop-0002/heating-zones", text: "Heater bands along the barrel of EXL-201. The panel shows zone 1 at 175 °C and the die at 210 °C, all zones at set point." },
      { key: "e4", min: 4, kind: "voice", durationMs: 12000, text: "All zones are within 3 degrees of set point now, so I start the 90 minute soak timer. I don't touch the screw until the timer is done, otherwise you can break the screw." },
      { key: "e5", min: 20, kind: "scan", asset: "VAC-203" },
      { key: "e6", min: 21, kind: "photo", photo: "ext-ops-wi-0002/sizing-sleeve-flange", text: "Sizing sleeve flange of VAC-203 stamped 110 mm, matching the product card." },
      { key: "e7", min: 24, kind: "photo", photo: "ext-ops-wi-0002/spray-nozzles", text: "VAC-203 with the lid open; all spray nozzles run with a full, even fan." },
      { key: "e8", min: 26, kind: "photo", photo: "ext-ops-wi-0002/sight-glass", text: "Water level at the upper sight-glass mark of VAC-203." },
      { key: "e9", min: 27, kind: "note", text: "Cooling water 17 °C on the display." },
      { key: "e10", min: 95, kind: "scan", asset: "EXL-201" },
      { key: "e11", min: 96, kind: "voice", durationMs: 13000, text: "Face shield on, standing to the side of the die. Scrap tray under the die. Opening the slide gate and starting the screw at 20 rpm." },
      { key: "e12", min: 98, kind: "photo", photo: "ext-ops-sop-0001/purge", text: "Melt running from the die into the scrap tray; the operator stands to the side wearing a face shield." },
      { key: "e13", min: 104, kind: "voice", durationMs: 8000, text: "Melt is clean now, no specks, no bubbles. Pressure is 190 bar at 20 rpm." },
      { key: "e14", min: 106, kind: "photo", photo: "ext-ops-sop-0002/threading-start-up-pipe", text: "Melt joined to the start-up pipe and pulled into the sizing sleeve of VAC-203." },
      { key: "e15", min: 110, kind: "note", text: "Lid closed, both clamps locked, vacuum at -0.3 bar." },
      { key: "e16", min: 112, kind: "voice", durationMs: 9000, text: "Ramping up to 60 rpm and then to 100 over five minutes. The haul-off follows the line speed." },
      { key: "e17", min: 125, kind: "scan", asset: "SAW-202" },
      { key: "e18", min: 126, kind: "photo", photo: "ext-ops-sop-0002/first-pipe-check", text: "The first pipe after the saw of SAW-202 is checked for surface and stripes." },
      { key: "e19", min: 128, kind: "voice", durationMs: 8000, text: "First 3 metres to scrap. First 10 pipes go to the lab for measuring before the shift leader releases the line." },
    ],
    moments: [
      { kind: "step", title: "Read the shift log and check for locks", detail: "Read why line 2 stopped (screen pack change) and checked with the shift leader that no locks are left on MCC-2.", entries: ["e1"] },
      { kind: "step", title: "Check the zones, then start the 90-minute soak", detail: "When all zones of EXL-201 were within 3 °C of set point he started the 90-minute soak timer.", entries: ["e3", "e4"] },
      { kind: "safety", title: "Do not turn the screw during the soak", detail: "The screw stays still until the soak timer is done; turning it early can break the screw.", entries: ["e4"] },
      { kind: "step", title: "Set up VAC-203 during the soak", detail: "Checked the 110 mm sleeve, checked all spray nozzles run with a full fan, filled to the upper sight-glass mark; cooling water 17 °C.", entries: ["e6", "e7", "e8", "e9"] },
      { kind: "safety", title: "Face shield and stand to the side of the die", detail: "Face shield on and standing to the side of the die when the screw starts.", entries: ["e11", "e12"] },
      { kind: "step", title: "Start the screw at 20 rpm into the scrap tray", detail: "Scrap tray under the die, slide gate open, screw started at 20 rpm.", entries: ["e11"] },
      { kind: "quality", title: "Run the melt until it is clean", detail: "Melt clean with no specks and no bubbles after about 6 minutes; melt pressure 190 bar at 20 rpm.", entries: ["e12", "e13"] },
      { kind: "step", title: "Thread the start-up pipe into VAC-203", detail: "Joined the melt to the start-up pipe and pulled it into the sizing sleeve of VAC-203.", entries: ["e14"] },
      { kind: "step", title: "Close the lid and set the vacuum to -0.3 bar", detail: "Closed the lid, locked both clamps and set the vacuum to -0.3 bar.", entries: ["e15"] },
      { kind: "step", title: "Ramp up to production speed", detail: "Ramped up to 60 rpm and then to 100 rpm over five minutes, haul-off following the line speed.", entries: ["e16"] },
      { kind: "quality", title: "Scrap the first 3 metres, lab measures 10 pipes", detail: "First 3 metres to scrap; the first 10 pipes are measured by the lab before the shift leader releases the line.", entries: ["e18", "e19"] },
    ],
  },
  {
    key: "fatima",
    person: "Fatima El Amrani",
    title: "Start-up line 2 after the Monday stop",
    daysAgo: 4,
    startHour: 6,
    summary:
      "Fatima started line 2 after a 3-hour die change. She follows the standard start-up and adds a knack: she warms the end of the start-up pipe with the hot air gun so the melt sticks first time.",
    tags: ["start-up", "line 2", "threading", "tip"],
    entries: [
      { key: "e1", min: 0, kind: "note", text: "Shift log: line stopped 3 hours for a die change, heating was off. No locks on MCC-2." },
      { key: "e2", min: 2, kind: "scan", asset: "EXL-201" },
      { key: "e3", min: 3, kind: "voice", durationMs: 8000, text: "Zones all at set point within 2 degrees. Soak timer on, 90 minutes, screw stays off." },
      { key: "e4", min: 15, kind: "scan", asset: "VAC-203" },
      { key: "e5", min: 17, kind: "photo", photo: "ext-ops-wi-0002/spray-nozzles", text: "All spray nozzles of VAC-203 running with an even fan; one was cleared with the nozzle pin." },
      { key: "e6", min: 19, kind: "photo", photo: "ext-ops-wi-0002/sight-glass", text: "VAC-203 filled to the upper sight-glass mark." },
      { key: "e7", min: 94, kind: "scan", asset: "EXL-201" },
      { key: "e8", min: 95, kind: "voice", durationMs: 12000, text: "Face shield on, I start the screw at 20 rpm and let it run into the tray until it's clean, about 6 minutes today." },
      { key: "e9", min: 96, kind: "photo", photo: "ext-hse-lmra-0001/side-position", text: "Operator standing to the side of the die head of EXL-201, not in front of it." },
      { key: "e10", min: 101, kind: "voice", durationMs: 15000, text: "Trick I learned from Jan: I warm the end of the start-up pipe with the hot air gun for half a minute. Then the melt sticks first time and doesn't tear when you pull it into the tank." },
      { key: "e11", min: 102, kind: "video", durationMs: 41000, text: "Video: the warmed end of the start-up pipe is joined to the melt and pulled into VAC-203 at low haul-off speed; the melt does not tear." },
      { key: "e12", min: 106, kind: "note", text: "Lid closed, vacuum -0.3 bar, then ramp to 60 rpm and to 110 rpm in 5 minutes." },
      { key: "e13", min: 120, kind: "scan", asset: "SAW-202" },
      { key: "e14", min: 121, kind: "photo", photo: "ext-ops-sop-0001/first-pipes", text: "A cut length of pipe on the tipping table after SAW-202, with a short sample held up for checking." },
      { key: "e15", min: 123, kind: "voice", durationMs: 6000, text: "First 3 metres scrap, 10 pipes to the lab." },
    ],
    moments: [
      { kind: "step", title: "Read the shift log and check for locks", detail: "Line 2 stopped 3 hours for a die change with heating off; no locks on MCC-2.", entries: ["e1"] },
      { kind: "step", title: "Check the zones, then start the 90-minute soak", detail: "All zones within 2 °C of set point; 90-minute soak timer started with the screw off.", entries: ["e3"] },
      { kind: "step", title: "Set up VAC-203 during the soak", detail: "Checked the spray nozzles (cleared one with the nozzle pin) and filled to the upper sight-glass mark.", entries: ["e5", "e6"] },
      { kind: "safety", title: "Face shield and stand to the side of the die", detail: "Face shield on and standing to the side of the die head when the screw starts.", entries: ["e8", "e9"] },
      { kind: "step", title: "Start the screw at 20 rpm and run until clean", detail: "Screw at 20 rpm into the tray until the melt is clean, about 6 minutes.", entries: ["e8"] },
      { kind: "tip", title: "Warm the end of the start-up pipe first", detail: "Warm the end of the start-up pipe with the hot air gun for about 30 seconds so the melt sticks first time and does not tear.", entries: ["e10", "e11"] },
      { kind: "step", title: "Thread the start-up pipe into VAC-203", detail: "Join the melt to the warmed pipe end and pull it into VAC-203 at low haul-off speed.", entries: ["e11"] },
      { kind: "step", title: "Set the vacuum and ramp up", detail: "Lid closed, vacuum at -0.3 bar, then 60 rpm and up to 110 rpm in 5 minutes.", entries: ["e12"] },
      { kind: "quality", title: "Scrap the first 3 metres, lab measures 10 pipes", detail: "First 3 metres to scrap and 10 pipes to the lab.", entries: ["e14", "e15"] },
    ],
  },
  {
    key: "ahmed",
    person: "Ahmed Yilmaz",
    title: "Line 2 back up after the colour stop",
    daysAgo: 2,
    startHour: 15,
    summary:
      "Ahmed restarted line 2 after a 40-minute colour change stop with the zones kept at set point, so no soak. He purges with PX-4400 for 5 minutes, scrapes the die face before restarting, and follows the standard threading and first-pipe checks.",
    tags: ["restart", "line 2", "purge", "colour change"],
    entries: [
      { key: "e1", min: 0, kind: "note", text: "Line stopped 40 minutes for a colour change, black to blue stripes. Zones stayed at set point." },
      { key: "e2", min: 1, kind: "scan", asset: "EXL-201" },
      { key: "e3", min: 2, kind: "voice", durationMs: 7000, text: "Zones are still at set point, short stop, so no soak needed this time." },
      { key: "e4", min: 5, kind: "scan", asset: "VAC-203" },
      { key: "e5", min: 6, kind: "photo", photo: "ext-ops-wi-0002/spray-nozzles", text: "Spray nozzles of VAC-203 all running." },
      { key: "e6", min: 8, kind: "note", text: "Water at the upper mark, 16 °C." },
      { key: "e7", min: 10, kind: "scan", asset: "EXL-201" },
      { key: "e8", min: 11, kind: "voice", durationMs: 10000, text: "Purging with PX-4400 at 190. Five minutes is enough after a short stop, then straight back to the product." },
      { key: "e9", min: 12, kind: "photo", photo: "ext-ops-sop-0001/purge", text: "Purge melt running from the die of EXL-201 into the scrap bin." },
      { key: "e10", min: 17, kind: "photo", photo: "ext-ops-sop-0003/die-face-cleaning", text: "Melt drool removed from the hot die face with a brass scraper, standing to the side." },
      { key: "e11", min: 18, kind: "voice", durationMs: 9000, text: "I always scrape the die face before I start again, otherwise you get lines on the new pipe. Face shield on and stand to the side when the screw starts." },
      { key: "e12", min: 22, kind: "voice", durationMs: 11000, text: "Thread the start-up pipe, lid closed, vacuum to minus 0.3, ramp up over five minutes." },
      { key: "e13", min: 34, kind: "scan", asset: "SAW-202" },
      { key: "e14", min: 35, kind: "note", text: "First 3 m to scrap. First 10 pipes measured by Kevin in the lab." },
    ],
    moments: [
      { kind: "step", title: "Check the reason and length of the stop", detail: "40-minute colour change stop with the zones kept at set point, so he did not soak.", entries: ["e1", "e3"] },
      { kind: "step", title: "Set up VAC-203", detail: "Spray nozzles all running; water at the upper mark, 16 °C.", entries: ["e5", "e6"] },
      { kind: "step", title: "Purge with PX-4400 for 5 minutes", detail: "Purged with PX-4400 at 190 °C for 5 minutes after the short stop, then went straight back to the product.", entries: ["e8", "e9"] },
      { kind: "tip", title: "Scrape the die face before restarting", detail: "Scrape the melt drool off the die face with the brass scraper before restarting, otherwise the new pipe gets lines.", entries: ["e10", "e11"] },
      { kind: "safety", title: "Face shield and stand to the side of the die", detail: "Face shield on and standing to the side when the screw starts.", entries: ["e11"] },
      { kind: "step", title: "Thread, set the vacuum and ramp up", detail: "Threaded the start-up pipe, closed the lid, vacuum to -0.3 bar, ramped up over five minutes.", entries: ["e12"] },
      { kind: "quality", title: "Scrap the first 3 metres, lab measures 10 pipes", detail: "First 3 metres to scrap; Kevin measured the first 10 pipes in the lab.", entries: ["e14"] },
    ],
  },
]

/** The still-recording Capture, for the running pill. */
const RECORDING: { person: string; title: string; startedMinAgo: number; entries: EntryDef[] } = {
  person: "Fatima El Amrani",
  title: "Start-up line 2, early shift",
  startedMinAgo: 14,
  entries: [
    { key: "e1", min: 0, kind: "note", text: "Stop for a screen pack change last night. Shift log read, no locks on MCC-2." },
    { key: "e2", min: 3, kind: "scan", asset: "EXL-201" },
    { key: "e3", min: 5, kind: "voice", durationMs: 8000, text: "Zones coming up, zone 4 still 12 degrees under. Waiting before I start the soak." },
  ],
}

interface StepDef {
  title: string
  detail: string
  kind: Kind
  supportedBy: string[]
  variations?: { capture: string; kind: "different" | "skipped" | "extra"; text: string }[]
  suggestion?: string
  conflict?: { code: string; match: string[]; note: string }
  evidence: string[]
  decision?: string
}

const SET_STEPS: StepDef[] = [
  {
    title: "Read the shift log and check for locks",
    detail: "Read why line 2 stopped and check that no lock or tag is left on MCC-2.",
    kind: "step",
    supportedBy: ["lotte", "jan", "fatima", "ahmed"],
    evidence: ["jan:e1", "fatima:e1", "lotte:e1", "ahmed:e1"],
  },
  {
    title: "Check the zones, then soak when the heating was off",
    detail: "Wait until all zones of EXL-201 are within 3 °C of set point, then start the 90-minute soak timer.",
    kind: "step",
    supportedBy: ["lotte", "jan", "fatima", "ahmed"],
    variations: [{ capture: "ahmed", kind: "different", text: "After a 40-minute stop with the zones kept at set point he does not soak." }],
    suggestion:
      "Keep the 90-minute soak after a stop with the heating off. Write the short stop as its own case, the way EXT-OPS-SOP-0003 does: no soak when the zones stayed at set point and the stop was under 2 hours.",
    evidence: ["jan:e3", "jan:e4", "fatima:e3", "lotte:e4", "ahmed:e3"],
  },
  {
    title: "Do not turn the screw during the soak",
    detail: "The screw stays still until the soak timer is done; turning it early can break the screw.",
    kind: "safety",
    supportedBy: ["lotte", "jan", "fatima"],
    evidence: ["jan:e4", "fatima:e3", "lotte:e4"],
  },
  {
    title: "Set up VAC-203 during the soak",
    detail: "Check the sleeve size, check that all spray nozzles run with a full fan, fill to the upper sight-glass mark and check the cooling water is 15 to 20 °C.",
    kind: "step",
    supportedBy: ["lotte", "jan", "fatima", "ahmed"],
    variations: [{ capture: "lotte", kind: "skipped", text: "Did not check the spray nozzles of VAC-203." }],
    suggestion: "Keep the spray nozzle check in the standard: a blocked nozzle gives oval pipe. Three of the four Captures do it.",
    evidence: ["jan:e6", "jan:e7", "jan:e8", "fatima:e5", "lotte:e6", "ahmed:e5"],
  },
  {
    title: "Wear the face shield and stand to the side of the die",
    detail: "Face shield on and stand to the side of the die of EXL-201 when the screw starts.",
    kind: "safety",
    supportedBy: ["lotte", "jan", "fatima", "ahmed"],
    evidence: ["jan:e11", "fatima:e9", "lotte:e9", "ahmed:e11"],
  },
  {
    title: "Start the screw at 20 rpm into the scrap tray",
    detail: "Open the hopper slide gate and start the screw at 20 rpm with the scrap tray under the die.",
    kind: "step",
    supportedBy: ["lotte", "jan", "fatima"],
    evidence: ["jan:e11", "fatima:e8", "lotte:e9"],
  },
  {
    title: "Purge until the melt runs clean",
    detail: "Let the melt run into the scrap tray until it is clean: no streaks, no specks, no bubbles. This took about 6 to 7 minutes.",
    kind: "quality",
    supportedBy: ["lotte", "jan", "fatima", "ahmed"],
    variations: [{ capture: "ahmed", kind: "different", text: "Purges with PX-4400 at 190 °C for 5 minutes after a colour stop, then goes straight back to the product." }],
    conflict: {
      code: "EXT-OPS-SOP-0001",
      match: ["PX-4400", "15 minutes"],
      note: "Ahmed purges with PX-4400 for 5 minutes. The Published changeover SOP EXT-OPS-SOP-0001 says to purge with PX-4400 at 190 °C until the melt runs clean, about 15 minutes.",
    },
    suggestion:
      "Follow EXT-OPS-SOP-0001: purge until the melt runs clean, about 15 minutes. Ask the process engineer whether a shorter purge is allowed after a short stop before changing the standard.",
    evidence: ["jan:e12", "jan:e13", "ahmed:e8", "ahmed:e9", "lotte:e10"],
  },
  {
    title: "Warm the end of the start-up pipe",
    detail: "Warm the end of the start-up pipe with the hot air gun for about 30 seconds so the melt sticks first time and does not tear.",
    kind: "tip",
    supportedBy: ["fatima"],
    variations: [{ capture: "fatima", kind: "extra", text: "Warms the start-up pipe end with the hot air gun for half a minute before joining the melt." }],
    suggestion: "Add it as a tip: it is shown on video and makes threading work the first time.",
    evidence: ["fatima:e10", "fatima:e11"],
  },
  {
    title: "Thread the start-up pipe into VAC-203",
    detail: "Join the melt to the start-up pipe and pull it through the sizing sleeve of VAC-203 at low haul-off speed.",
    kind: "step",
    supportedBy: ["lotte", "jan", "fatima", "ahmed"],
    evidence: ["jan:e14", "fatima:e11", "lotte:e11", "ahmed:e12"],
  },
  {
    title: "Close the lid and set the vacuum to -0.3 bar",
    detail: "Close the lid of VAC-203, lock both clamps and set the vacuum to -0.3 bar.",
    kind: "step",
    supportedBy: ["lotte", "jan", "fatima", "ahmed"],
    evidence: ["jan:e15", "fatima:e12", "lotte:e12", "ahmed:e12"],
  },
  {
    title: "Ramp up to production speed over 5 minutes",
    detail: "Go to 60 rpm, then ramp up to the production speed on the product card over 5 minutes with the haul-off following.",
    kind: "step",
    supportedBy: ["lotte", "jan", "fatima", "ahmed"],
    evidence: ["jan:e16", "fatima:e12", "lotte:e12", "ahmed:e12"],
  },
  {
    title: "Scrape the die face before restarting",
    detail: "Scrape the melt drool off the die face with the brass scraper before restarting, otherwise the new pipe gets lines.",
    kind: "tip",
    supportedBy: ["ahmed"],
    variations: [{ capture: "ahmed", kind: "extra", text: "Scrapes the die face with the brass scraper before he restarts the screw." }],
    suggestion: "Add it as a tip. It matches the die face cleaning in EXT-OPS-SOP-0003.",
    evidence: ["ahmed:e10", "ahmed:e11"],
    decision: "Scrape the melt drool off the die face with the brass scraper before restarting, standing to the side of the die.",
  },
  {
    title: "Scrap the first 3 metres and have the first 10 pipes measured",
    detail: "The first 3 metres go to scrap; the lab measures each of the first 10 pipes before the shift leader releases line 2.",
    kind: "quality",
    supportedBy: ["lotte", "jan", "fatima", "ahmed"],
    evidence: ["jan:e18", "jan:e19", "fatima:e14", "lotte:e14", "ahmed:e14"],
  },
  {
    title: "How long must the melt run before it counts as clean?",
    detail: "Lotte waited until there were no streaks, about 7 minutes, and asks for a clear rule.",
    kind: "question",
    supportedBy: ["lotte"],
    evidence: ["lotte:e10"],
  },
]

async function photoStorage(ctx: MutationCtx, images: Doc<"images">[], key: string) {
  if (key.startsWith("asset/")) {
    const a = await ctx.db
      .query("assets")
      .withIndex("by_code", (q) => q.eq("code", key.slice(6)))
      .first()
    return a?.imageStorageId ? { storageId: a.imageStorageId, contentType: "image/png", size: null as number | null } : null
  }
  const prefix = `${key.replace(/\//g, "-")}.`
  const img = images.find((i) => i.filename.startsWith(prefix) && i.storageId)
  return img?.storageId ? { storageId: img.storageId, contentType: img.contentType, size: img.byteSize } : null
}

async function insertEntries(
  ctx: MutationCtx,
  captureId: Id<"captures">,
  startedAt: number,
  defs: EntryDef[],
  images: Doc<"images">[],
  assetByCode: Map<string, Id<"assets">>,
) {
  const ids = new Map<string, Id<"captureEntries">>()
  let current: Id<"assets"> | undefined
  for (const e of defs) {
    const at = startedAt + e.min * MIN + 20_000
    if (e.kind === "scan") {
      current = e.asset ? assetByCode.get(e.asset) : undefined
      if (!current) continue
      ids.set(e.key, await ctx.db.insert("captureEntries", { captureId, kind: "scan", at, assetId: current }))
      continue
    }
    const base = { captureId, at, assetId: current }
    if (e.kind === "note") {
      ids.set(e.key, await ctx.db.insert("captureEntries", { ...base, kind: "note", text: e.text }))
    } else if (e.kind === "voice") {
      ids.set(
        e.key,
        await ctx.db.insert("captureEntries", {
          ...base,
          kind: "voice",
          durationMs: e.durationMs,
          transcript: e.text,
          analysis: "done",
          analysisNote: "seeded transcript",
        }),
      )
    } else if (e.kind === "video") {
      ids.set(
        e.key,
        await ctx.db.insert("captureEntries", {
          ...base,
          kind: "video",
          durationMs: e.durationMs,
          description: e.text,
          analysis: "done",
          analysisNote: "seeded summary, no video file",
        }),
      )
    } else if (e.kind === "photo") {
      const media = e.photo ? await photoStorage(ctx, images, e.photo) : null
      if (!media) continue
      ids.set(
        e.key,
        await ctx.db.insert("captureEntries", {
          ...base,
          kind: "photo",
          storageId: media.storageId,
          mimeType: media.contentType,
          sizeBytes: media.size ?? undefined,
          description: e.text,
          analysis: "done",
          analysisNote: "seeded description",
        }),
      )
    }
  }
  return { ids, current }
}

export const run = internalMutation({
  args: {},
  handler: async (ctx) => {
    // Links to Drafts whose documents were wiped are stale either way.
    let staleLinks = 0
    for (const l of await ctx.db.query("captureDrafts").take(1000)) {
      if (!(await ctx.db.get(l.documentId))) {
        await ctx.db.delete(l._id)
        staleLinks += 1
      }
    }
    if ((await ctx.db.query("captures").take(1)).length > 0) return { skipped: "Captures already exist", staleLinks }

    const people = new Map((await ctx.db.query("people").take(200)).map((p) => [p.name, p]))
    const assetRows = await ctx.db.query("assets").take(500)
    const assetByCode = new Map(assetRows.map((a) => [a.code, a._id]))
    const images = await ctx.db.query("images").take(2000)
    const missing = [...CAPTURES.map((c) => c.person), RECORDING.person].filter((n) => !people.has(n))
    if (missing.length > 0) return { skipped: `People missing: ${[...new Set(missing)].join(", ")}` }
    if (!assetByCode.has("EXL-201")) return { skipped: "Line 2 Assets missing" }

    const now = Date.now()
    const capIds = new Map<string, Id<"captures">>()
    const entryIds = new Map<string, Id<"captureEntries">>()
    let entries = 0
    let moments = 0
    let photos = 0

    for (const def of CAPTURES) {
      const person = people.get(def.person)!
      const dayStart = new Date(now - def.daysAgo * DAY)
      dayStart.setUTCHours(def.startHour, 5, 0, 0)
      const startedAt = dayStart.getTime()
      const last = Math.max(...def.entries.map((e) => e.min))
      const endedAt = startedAt + (last + 2) * MIN
      const captureId = await ctx.db.insert("captures", {
        title: def.title,
        job: JOB,
        authorId: person._id,
        status: "ready",
        startedAt,
        endedAt,
        handedInAt: endedAt + 30_000,
        processedAt: endedAt + 2 * MIN,
        summary: def.summary,
        tags: def.tags,
        seeded: true,
      })
      capIds.set(def.key, captureId)
      const { ids, current } = await insertEntries(ctx, captureId, startedAt, def.entries, images, assetByCode)
      if (current) await ctx.db.patch(captureId, { currentAssetId: current })
      for (const [k, id] of ids) entryIds.set(`${def.key}:${k}`, id)
      entries += ids.size
      photos += def.entries.filter((e) => e.kind === "photo" && ids.has(e.key)).length

      let order = 0
      for (const m of def.moments) {
        const mids = m.entries.map((k) => ids.get(k)).filter((x): x is Id<"captureEntries"> => !!x)
        if (mids.length === 0) continue
        // The Asset where the first evidence Entry was made.
        let assetId: Id<"assets"> | undefined
        for (const id of mids) {
          const e = await ctx.db.get(id)
          if (e?.assetId) {
            assetId = e.assetId
            break
          }
        }
        await ctx.db.insert("captureMoments", { captureId, order: order++, kind: m.kind, title: m.title, detail: m.detail, assetId, entryIds: mids })
        moments += 1
      }
    }

    // The still-recording Capture.
    const rec = people.get(RECORDING.person)!
    const recStart = now - RECORDING.startedMinAgo * MIN
    const recId = await ctx.db.insert("captures", {
      title: RECORDING.title,
      job: JOB,
      authorId: rec._id,
      status: "recording",
      startedAt: recStart,
      seeded: true,
    })
    const recEntries = await insertEntries(ctx, recId, recStart, RECORDING.entries, images, assetByCode)
    if (recEntries.current) await ctx.db.patch(recId, { currentAssetId: recEntries.current })
    entries += recEntries.ids.size

    // The combined Capture set, with the conflict against the live EXT-OPS-SOP-0001.
    const engineer = people.get("Sanne Visser") ?? [...people.values()].find((p) => p.kind === "engineer")
    if (!engineer) return { captures: capIds.size + 1, entries, moments, set: "skipped: no Engineer" }
    let conflictNote = "none"
    const steps = []
    for (const s of SET_STEPS) {
      let conflict: { documentId: Id<"documents">; namingCode: string; quote: string; note: string } | undefined
      if (s.conflict) {
        const c = s.conflict
        const d = await ctx.db
          .query("documents")
          .withIndex("by_namingCode", (q) => q.eq("namingCode", c.code))
          .first()
        const live = d?.liveVersion
        if (d && live != null && d.status !== "archived") {
          const chunks = await ctx.db
            .query("chunks")
            .withIndex("by_documentId_and_version", (q) => q.eq("documentId", d._id).eq("version", live))
            .take(500)
          const hit = chunks.find((ch) => c.match.every((m) => ch.text.includes(m)))
          if (hit) {
            conflict = { documentId: d._id, namingCode: d.namingCode, quote: hit.text.trim(), note: c.note }
            conflictNote = `${d.namingCode} v${live}`
          }
        }
      }
      steps.push({
        title: s.title,
        detail: s.detail,
        kind: s.kind,
        supportedBy: s.supportedBy.map((k) => capIds.get(k)).filter((x): x is Id<"captures"> => !!x),
        variations: (s.variations ?? [])
          .filter((vr) => capIds.has(vr.capture))
          .map((vr) => ({ captureId: capIds.get(vr.capture)!, kind: vr.kind, text: vr.text })),
        evidenceEntryIds: s.evidence.map((k) => entryIds.get(k)).filter((x): x is Id<"captureEntries"> => !!x),
        ...(s.suggestion ? { suggestion: s.suggestion } : {}),
        ...(s.decision ? { decision: s.decision } : {}),
        ...(conflict ? { conflict } : {}),
      })
    }
    const setCreated = now - 1 * DAY
    const setId = await ctx.db.insert("captureSets", {
      title: "Start-up of line 2: four operators",
      job: JOB,
      captureIds: CAPTURES.map((c) => capIds.get(c.key)!),
      createdBy: engineer._id,
      createdAt: setCreated,
      status: "ready",
      combined: {
        summary:
          "Four line operators started line 2 after a stop. All four follow the same order: shift log, zones and soak, VAC-203, purge at 20 rpm, threading, vacuum, ramp-up and first-pipe checks. Lotte skips the spray nozzle check, Fatima adds a knack for threading, and Ahmed skips the soak after a short stop and purges for 5 minutes, which conflicts with EXT-OPS-SOP-0001.",
        steps,
        combinedAt: setCreated + 3 * MIN,
      },
    })

    return { captures: capIds.size + 1, entries, photos, moments, setId, conflict: conflictNote, staleLinks }
  },
})
