// EXT-HSE-SOP-0001: Lockout/tagout on extrusion line 2.
// Plant facts: docs/build/plant-facts.md. Published, periodic review overdue by
// 10 days (docs/test-set.md). Keeps the fixture warning and steps verbatim.
import { asset, b, bullets, callout, doc, h, img, p, ppe, ref, steps, table, type SeedDoc } from "../builders"

const body = doc(
  h(1, "Lockout/tagout on extrusion line 2"),
  p("Follow this procedure before any work inside the guarding of ", asset("EXL-201"), " or ", asset("SAW-202"), "."),
  p(
    "The same procedure applies to the vacuum calibration tank ",
    asset("VAC-203"),
    " and the pipe coiler ",
    asset("CLR-204"),
    ". All machines of line 2 are fed from one main isolator in panel MCC-2, so one lockout makes the whole line safe to work on.",
  ),
  p(
    "Lockout/tagout (LOTO) means that every energy source of line 2 is switched off, locked with a personal lock, tagged with the name of the person who placed the lock, released where energy is stored, and verified with a try-start before anyone reaches into the machine.",
  ),

  h(2, "Scope"),
  bullets([
    "This procedure applies to all work inside the guarding of line 2: clearing a blockage, changing a saw blade, cleaning the haul-off tracks, changing a sizing sleeve, working at the coiler drum and all maintenance work.",
    "This procedure applies to employees, temporary workers and contractors.",
    "Work inside panel MCC-2 itself is electrical work. Electrical work is only for qualified electricians and is not covered by this procedure.",
    ["Work at the hot die head with the heaters on is not lockout work. Use the LMRA card ", ref("EXT-HSE-LMRA-0001"), " for work at the hot die head."],
  ]),

  h(2, "Responsibilities"),
  table([
    ["Role", "Responsibility"],
    ["Authorised person", "Anyone who places a lock. An authorised person is trained in this procedure and holds a valid Lockout/tagout line 2 skill (valid 12 months)."],
    ["Shift leader", "Agrees to the stop of line 2, informs the other operators on line 2 and checks at the end of the shift that the LOTO register is complete."],
    ["Line operator", "Stops line 2 on request and never restarts line 2 while a lock is on the main isolator."],
    ["Maintenance and safety engineer", "Owns this procedure, trains authorised persons, keeps the spare locks and investigates every deviation."],
  ]),

  h(2, "Safety"),
  ppe("glasses,gloves,boots,ear-pro"),
  callout("warning", "Never reach into the haul-off or saw area while the line is only stopped. A stopped line can restart."),
  callout(
    "loto",
    "One person, one lock, one key. Every person who works inside the guarding of line 2 attaches a personal red lock and tag. Never work under the lock of someone else.",
  ),
  callout(
    "danger",
    "Isolation does not remove all energy. Compressed air stays in the haul-off cylinders until the dump valve is opened, the die and barrel of EXL-201 stay above 150 °C for hours, and a part-wound coil on CLR-204 is under tension.",
  ),
  callout("electrical", "Only operate the isolator handle of panel MCC-2. Never open the door of panel MCC-2: the door is for qualified electricians only."),

  h(2, "Energy sources on line 2"),
  table([
    ["Energy", "Where", "How to isolate or release", "How to verify"],
    ["Electrical (drives, heaters, pumps)", "EXL-201, VAC-203, SAW-202, CLR-204", "Main isolator of line 2 in panel MCC-2, locked in the off position", "Try-start from the main panel: nothing moves"],
    ["Pneumatic", "Haul-off clamping cylinders on SAW-202", "Pneumatic dump valve on the haul-off", "Pressure gauge on the haul-off air supply reads 0 bar"],
    ["Gravity", "Saw carriage of SAW-202", "Saw carriage in its lowest rest position", "Saw carriage rests on its end stop"],
    ["Vacuum and water", "VAC-203", "Vacuum pumps stop with the main isolator; open the vent valve on top of the tank", "Vacuum gauge of VAC-203 reads 0 bar"],
    ["Mechanical tension", "Part-wound coil on CLR-204", "Strap the coil and cut the pipe between the haul-off and the coiler", "The pipe end is loose and the coil does not move"],
    ["Heat", "Die and barrel of EXL-201", "Cannot be isolated. Keep away, or wear heat-resistant gloves (EN 407) and a face shield", "Treat the die and barrel as hot until the display shows below 50 °C"],
  ]),

  h(2, "Tools and materials"),
  bullets([
    "Personal red lock with one key, marked with your name.",
    "Red tag \"Do not operate\" with your name, the date and the task written on the tag.",
    "Multi-lock hasp for group work, from the LOTO station at the line 2 panel.",
    "LOTO register (logbook) at the line 2 panel.",
    "Torch for checking the haul-off and saw area.",
  ]),

  h(2, "Procedure: placing the lock"),
  steps([
    "Identify every energy source for the task with the energy source table in this procedure.",
    "Inform the shift leader and the operators on line 2.",
    "Write the task, your name and the start time in the LOTO register at the line 2 panel.",
    "Stop the line from the main panel.",
    "Wait until the screw of EXL-201, the haul-off tracks of SAW-202 and the coiler drum of CLR-204 have come to a complete standstill.",
    "Go to panel MCC-2 and find the handle of the main isolator of line 2.",
    "Switch off the main isolator of line 2 and attach your personal lock and tag.",
    "For group work, fit a multi-lock hasp on the main isolator of line 2 so that every person in the group attaches a personal lock and tag to the hasp.",
    "Release stored energy: open the pneumatic dump valve on the haul-off.",
    "Check that the pressure gauge on the haul-off air supply reads 0 bar.",
    "Open the vent valve of VAC-203 when the task is at the vacuum tank, and check that the vacuum gauge reads 0 bar.",
    "Try to start the line from the panel to verify it is isolated.",
    "Set the start selector on the main panel back to off after the try-start.",
  ]),
  img("ext-hse-sop-0001/isolator-lock", "Main isolator of line 2 in panel MCC-2, switched off, with a personal red lock and a red tag attached."),
  img("ext-hse-sop-0001/dump-valve", "Pneumatic dump valve on the haul-off of SAW-202, opened to release stored air; the pressure gauge reads 0 bar."),

  h(2, "Procedure: removing the lock"),
  steps([
    "Check that all tools and loose parts are removed from line 2.",
    "Close all guards of line 2 and check that every guard interlock is engaged.",
    "Check that every person is clear of EXL-201, VAC-203, SAW-202 and CLR-204.",
    "After the work, remove your own lock only. Only the person who placed a lock may remove it.",
    "Close the pneumatic dump valve on the haul-off.",
    "Write the end time in the LOTO register and tell the shift leader that line 2 may be restarted.",
  ]),
  img("ext-hse-sop-0001/group-hasp", "A multi-lock hasp on the main isolator of line 2, with one personal red lock for each person in the group."),

  h(2, "Checks and acceptance criteria"),
  table([
    ["Check", "Acceptance criterion"],
    ["Main isolator of line 2", "Handle in the off position, personal red lock and tag attached for every person working."],
    ["Pneumatic energy", "Pressure gauge on the haul-off air supply reads 0 bar."],
    ["Vacuum energy (work at VAC-203)", "Vacuum gauge of VAC-203 reads 0 bar."],
    ["Try-start", "No drive of line 2 moves and no motor sound is heard when start is pressed on the main panel."],
    ["LOTO register", "Task, name, start time and end time are written for every lock."],
  ]),

  h(2, "If something goes wrong"),
  table([
    ["Symptom", "Likely cause", "Action"],
    ["A drive moves or a motor starts during the try-start", "Wrong isolator, or isolator not fully off", "Press the emergency stop, do not start the work, and inform the shift leader and the maintenance and safety engineer."],
    ["The haul-off pressure gauge stays above 0 bar after opening the dump valve", "Dump valve blocked or a second air supply still open", "Do not reach into the haul-off. Inform the maintenance and safety engineer."],
    ["A lock is still on the isolator and its owner has left the site", "Lock not removed at the end of the work", "Do not remove the lock. The shift leader calls the owner back to remove the lock and informs the maintenance and safety engineer."],
    ["You lost the key of your lock", "Key misplaced", "Do not cut the lock yourself. Inform the shift leader and the maintenance and safety engineer."],
    ["Someone asks you to restart line 2 while a lock is on the isolator", "Pressure to restart production", "Never restart. Refer the request to the shift leader."],
  ]),

  h(2, "Records"),
  bullets([
    "LOTO register at the line 2 panel: task, name, start time, end time for every lock placed.",
    "Shift log: every stop of line 2 for lockout, with the reason and the duration.",
    "Every deviation from this procedure is reported as a safety incident to the maintenance and safety engineer on the same day.",
    "Training records: each authorised person's Lockout/tagout line 2 skill and the date it expires.",
  ]),

  h(2, "References"),
  bullets([
    [ref("EXT-HSE-LMRA-0001"), ": LMRA for working at the hot die head."],
    [ref("EXT-OPS-SOP-0003"), ": Shutting down line 2."],
    [ref("EXT-MNT-MAN-0001"), ": Krauss KX-60 single-screw extruder, operating and maintenance manual."],
    [ref("EXT-MNT-MAN-0002"), ": Nordcut HC-110 haul-off and PS-110 planetary saw, manual."],
    [ref("EXT-MNT-SOP-0001"), ": Changing the screen pack on EXL-201."],
    [ref("EXT-HSE-SOP-0002"), ": Hot melt burns, first response."],
  ]),
  p(b("Emergency: "), "first aider on extension 2222."),
)

export const seedDoc: SeedDoc = {
  code: "EXT-HSE-SOP-0001",
  title: "Lockout/tagout on extrusion line 2",
  type: "sop",
  area: "EXT",
  discipline: "HSE",
  status: "published",
  editions: [{ body, publishedDaysAgo: 375 }],
  assets: ["EXL-201", "VAC-203", "SAW-202", "CLR-204"],
  nextReviewInDays: -10,
  tags: ["LOTO", "safety", "line 2"],
  images: [
    {
      key: "ext-hse-sop-0001/isolator-lock",
      prompt:
        "Close-up of a large rotary main isolator handle on the front of a grey industrial electrical cabinet, turned to the off position, with a red padlock through the handle's lockout hole and a blank red tag hanging from the padlock.",
    },
    {
      key: "ext-hse-sop-0001/dump-valve",
      prompt:
        "A gloved hand turning the lever of a pneumatic dump valve on a compressed air line mounted on the frame of a caterpillar pipe haul-off machine, with a round pressure gauge next to the valve showing zero.",
    },
    {
      key: "ext-hse-sop-0001/group-hasp",
      prompt:
        "Close-up of a steel multi-lock lockout hasp clamped through an isolator handle, with four red padlocks of different workers attached to the hasp and blank red tags hanging below.",
    },
  ],
}
