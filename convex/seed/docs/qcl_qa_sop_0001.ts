// QCL-QA-SOP-0001: Measuring wall thickness and outside diameter.
// Plant facts: docs/build/plant-facts.md. Deliberate contradiction #3: this SOP
// says the UT-200 is calibrated "once a day"; the Sonatek manual
// (QCL-QA-MAN-0001) says at the start of every shift. Keep it that way.
import { asset, b, bullets, callout, doc, h, img, p, ppe, ref, steps, table, type SeedDoc } from "../builders"

const body = doc(
  h(1, "Measuring wall thickness and outside diameter"),
  p(
    "This SOP describes how the Quality lab measures the wall thickness and the mean outside diameter (OD) of PE100 pressure pipe from line 2 with the Sonatek UT-200 ultrasonic thickness gauge ",
    asset("QCL-301"),
    ". The results decide whether pipe from the extruder ",
    asset("EXL-201"),
    " may go to stock or must go to quarantine.",
  ),
  p(
    "The tolerances in this SOP follow EN 12201 for drinking water pipe and are also used for EN 1555 gas pipe of the same OD and SDR.",
  ),

  h(2, "Scope"),
  bullets([
    "This SOP applies to all PE100 pipe made on line 2: 32 to 110 mm OD, SDR 11 and SDR 17, in 6 m or 12 m lengths and in 50 m or 100 m coils.",
    "This SOP covers sampling at the line, calibration of the UT-200, the wall thickness measurement, the mean OD measurement, the pass or fail decision and the records.",
    "This SOP does not cover pressure testing, melt flow testing or the handling of rejected pipe. Rejected pipe is handled with QCL-QA-WI-0001.",
  ]),

  h(2, "Responsibilities"),
  table([
    ["Role", "Responsibility"],
    ["Line operator", "Cuts the test piece at the end of line 2 at the required frequency and brings the test piece to the Quality lab with the product and batch written on it."],
    ["Quality lab technician", "Calibrates the UT-200, measures the test piece, decides pass or fail against the tolerance table and records the result in the QC log."],
    ["Shift leader", "Acts on every fail: informs the process engineer and makes sure suspect pipe is put in quarantine."],
    ["Process engineer", "Corrects the line settings after a fail (die centring, haul-off speed, vacuum) and confirms when a new test piece may be taken."],
    ["Quality manager", "Owns this SOP and the tolerance table, and is the only person who releases or scraps non-conforming pipe."],
  ]),

  h(2, "Personal protective equipment"),
  p("Wear safety glasses, cut-resistant gloves, safety shoes and hearing protection when you take a test piece at line 2 in Hall 2. Hall 2 is above 85 dB(A)."),
  ppe("glasses,gloves,boots,ear-pro"),
  p("In the Quality lab, wear a lab coat and safety glasses while you cut, condition and measure the test piece."),
  ppe("lab-coat,glasses"),

  h(2, "Tools and materials"),
  bullets([
    ["Sonatek UT-200 ultrasonic thickness gauge ", asset("QCL-301"), " with its dual-element probe."],
    "UT-200 calibration step block (supplied with the gauge) with a 3 mm step and a 12 mm step.",
    "Couplant gel and lint-free paper wipes.",
    "Circumference tape (pi tape) for 25 to 125 mm OD, graduated in 0.05 mm.",
    "Hand pipe cutter for PE pipe up to 110 mm, and a deburring knife.",
    "White paint marker for marking the 8 measuring points.",
    "Conditioning water bath in the Quality lab at 23 °C ± 2 °C, with a thermometer.",
    "QC log (measurement sheet for line 2) and the UT-200 calibration log.",
  ]),

  h(2, "When to measure"),
  table([
    ["Situation", "Measuring frequency"],
    ["Start-up of line 2", "Measure each of the first 10 pipes after start-up."],
    ["Colour or product changeover on line 2", "Measure each of the first 10 pipes after the changeover."],
    ["Stable production", "Measure one test piece every 2 hours for line 2."],
    ["After a fail and a correction by the process engineer", "Measure a new test piece before the line returns to the 2-hour frequency."],
  ]),
  p("A pipe is one length (6 m or 12 m) or one coil (50 m or 100 m). For coils, the test piece is cut from the tail end of the coil."),

  h(2, "Calibrating the UT-200"),
  callout(
    "notice",
    "Calibrate the UT-200 ",
    b("once a day"),
    ", before the first measurement of the day, with a two-point calibration on the step block. Also calibrate the UT-200 again after the probe, the probe cable or the batteries are changed, and after the UT-200 has been dropped.",
  ),
  img(
    "qcl-qa-sop-0001/step-block-calibration",
    "Two-point calibration of the UT-200 on the 3 mm and 12 mm steps of the step block, with couplant gel under the probe.",
  ),

  h(2, "Procedure"),
  callout(
    "caution",
    "Pipe at the end of line 2 can still be warm, and the hand pipe cutter has a sharp wheel. Wear cut-resistant gloves and keep your free hand behind the cutting wheel when you cut a test piece.",
  ),
  callout(
    "warning",
    "Never reach into the haul-off or saw area of ",
    asset("SAW-202"),
    " to take a test piece. Take the test piece only from a pipe that is already on the tipping table or from the tail of a finished coil.",
  ),
  steps([
    ["Check in the QC log whether the UT-200 ", asset("QCL-301"), " has been calibrated today; if the UT-200 has not been calibrated today, do the calibration in steps 2 to 4 first."],
    "Switch on the UT-200, check that the material setting shows PE, and wipe the probe face and the step block clean with a lint-free wipe.",
    "Put a drop of couplant gel on the 3 mm step, hold the probe flat on the 3 mm step, and run the low-point calibration until the UT-200 reads 3.00 mm.",
    "Put a drop of couplant gel on the 12 mm step, hold the probe flat on the 12 mm step, run the high-point calibration, and check that the UT-200 reads 12.00 mm ± 0.02 mm on the 12 mm step and 3.00 mm ± 0.02 mm on the 3 mm step; write the calibration in the UT-200 calibration log.",
    "At line 2, cut a test piece of 200 mm length from the end of the pipe with the hand pipe cutter, square to the pipe axis, and write the product, the batch number and the time on the test piece with the paint marker.",
    "In the Quality lab, deburr both cut ends of the test piece with the deburring knife so that the probe sits flat on the cut face area.",
    "Put the test piece in the conditioning water bath at 23 °C ± 2 °C for at least 30 minutes, so that the measured size is not affected by heat from the line.",
    "Dry the test piece and mark 8 measuring points evenly around the circumference at each end, 45° apart, starting at the stripe or the print line as point 1; each end has points 1 to 8.",
    "Measure the mean OD at the middle of the test piece with the pi tape: wrap the pi tape square around the pipe, pull the pi tape snug without stretching, and read the OD to 0.05 mm.",
    "Put a small amount of couplant gel on point 1 at the first end, 10 to 15 mm from the cut edge, and hold the UT-200 probe perpendicular to the pipe surface until the reading is stable for 2 seconds.",
    "Record the wall thickness reading for point 1, then measure and record points 2 to 8 at the first end the same way, with fresh couplant gel on every point.",
    "Turn the test piece around and measure and record points 1 to 8 at the second end, so that the test piece has 16 wall thickness readings in total.",
    "Compare the mean OD and every one of the 16 wall thickness readings with the tolerance table for the product; the test piece passes only if the mean OD and all 16 readings are inside the limits.",
    "If the test piece passes, write PASS, the mean OD, the lowest and the highest wall reading and your initials in the QC log for line 2.",
    "If the test piece fails, write FAIL and all readings in the QC log, phone the shift leader of line 2 at once, and start QCL-QA-WI-0001 for all pipe made since the last passed measurement.",
    "Wipe the couplant gel off the UT-200 probe and the step block, switch off the UT-200 and put the UT-200 back in its case.",
  ]),
  img(
    "qcl-qa-sop-0001/eight-point-pattern",
    "Eight measuring points marked 45° apart around the cut end of a black PE pipe test piece, with the ultrasonic probe held perpendicular on one point.",
  ),
  img(
    "qcl-qa-sop-0001/pi-tape-od",
    "Measuring the mean outside diameter in the middle of the test piece with a circumference (pi) tape pulled square around the pipe.",
  ),

  h(2, "Tolerance table"),
  p("Use the row that matches the OD and SDR on the production order. All values are in millimetres. The wall limits apply to every single reading, not to the average."),
  table([
    ["OD and SDR", "OD min-max (mm)", "Wall min-max (mm)"],
    ["32 SDR 11", "32.0-32.3", "3.0-3.4"],
    ["63 SDR 11", "63.0-63.4", "5.8-6.5"],
    ["110 SDR 11", "110.0-110.7", "10.0-11.1"],
    ["110 SDR 17", "110.0-110.7", "6.6-7.4"],
  ]),
  callout(
    "notice",
    "If the product on the production order is not in the tolerance table, do not measure against a guessed value. Ask the quality manager for the tolerance and write the source of the tolerance in the QC log.",
  ),

  h(2, "Checks and acceptance criteria"),
  table([
    ["Check", "Acceptance criterion"],
    ["UT-200 calibration", "Calibrated today; reads 3.00 mm ± 0.02 mm on the 3 mm step and 12.00 mm ± 0.02 mm on the 12 mm step."],
    ["Test piece", "200 mm long, cut square, deburred, conditioned at 23 °C ± 2 °C for at least 30 minutes, product and batch written on it."],
    ["Number of wall readings", "8 points evenly around the circumference at each end, 16 readings per test piece."],
    ["Wall thickness", "Every one of the 16 readings is inside the wall min-max for the product in the tolerance table."],
    ["Mean outside diameter", "The pi tape reading is inside the OD min-max for the product in the tolerance table."],
    ["Frequency", "Each of the first 10 pipes after start-up or changeover, then one test piece every 2 hours for line 2."],
  ]),

  h(2, "If something goes wrong"),
  table([
    ["Symptom", "Likely cause", "Action"],
    ["The UT-200 reading jumps or shows no value", "Too little couplant gel, or the probe is tilted on the curved pipe surface", "Add couplant gel, hold the UT-200 probe perpendicular with light pressure, and wait 2 seconds for a stable reading."],
    ["The UT-200 reads about twice the expected wall on a 32 mm pipe", "Doubling: the UT-200 picks up the second echo on a thin wall", "Measure again with fresh couplant gel and a firm, flat probe position; if the reading stays doubled, compare with a calliper reading on the cut face and tell the quality manager."],
    ["The calibration on the step block is out by more than 0.02 mm", "Dirty step block, worn probe face, or low battery in the UT-200", "Clean the step block and probe, change the batteries, and calibrate the UT-200 again; if the calibration still fails, take the UT-200 out of use and tell the quality manager."],
    ["Wall readings are low on one side and high on the opposite side", "The die is off centre, so the wall is eccentric", "Record FAIL if a reading is outside the limits, inform the shift leader, and ask the process engineer to centre the die on EXL-201."],
    ["The mean OD is below the OD minimum", "Vacuum in VAC-203 is too high or too low, or the wrong sizing sleeve is fitted", "Inform the shift leader; the line operator checks that VAC-203 runs at -0.3 bar (acceptable -0.2 to -0.4 bar) and that the sizing sleeve matches the OD."],
    ["All wall readings are near the maximum", "Haul-off speed is too low for the screw speed", "Inform the process engineer; pipe inside the limits is a PASS, but the trend must be corrected."],
  ]),

  h(2, "Records"),
  bullets([
    "Every measurement goes in the QC log for line 2: date, time, product, batch, mean OD, lowest and highest wall reading, PASS or FAIL, and the initials of the quality lab technician.",
    "Every UT-200 calibration goes in the UT-200 calibration log: date, time, readings on the 3 mm and 12 mm steps, and initials.",
    "Every FAIL gets an NC report number in the QC log, created with QCL-QA-WI-0001.",
    "The shift leader writes every FAIL and the action taken in the shift log at handover.",
    "QC logs and calibration logs are kept for 10 years, because the pipe is used for drinking water and gas.",
  ]),

  h(2, "References"),
  bullets([
    [ref("QCL-QA-MAN-0001"), " Sonatek UT-200 ultrasonic thickness gauge: user guide."],
    [ref("QCL-QA-WI-0001"), " Quarantine and release of non-conforming pipe."],
    [ref("EXT-OPS-SOP-0002"), " Starting line 2 from cold (the first 10 pipes after start-up)."],
    [ref("EXT-OPS-SOP-0001"), " Colour and product changeover on extrusion line 2 (the first 10 pipes after changeover)."],
    [ref("EXT-OPS-WI-0002"), " Setting up the vacuum calibration tank VAC-203."],
    "EN 12201-2 (PE pipe for water supply) and EN 1555-2 (PE pipe for gas supply).",
  ]),
)

export const seedDoc: SeedDoc = {
  code: "QCL-QA-SOP-0001",
  title: "Measuring wall thickness and outside diameter",
  type: "sop",
  area: "QCL",
  discipline: "QA",
  status: "published",
  editions: [{ body, publishedDaysAgo: 214 }],
  assets: ["QCL-301"],
  nextReviewInDays: 151,
  tags: ["quality", "measurement", "wall thickness", "EN 12201"],
  images: [
    {
      key: "qcl-qa-sop-0001/step-block-calibration",
      prompt:
        "close-up of a gloved hand holding a small handheld ultrasonic thickness gauge probe flat on the thin step of a two-step metal calibration block on a laboratory bench, a drop of clear couplant gel visible under the probe, the gauge body with a blank display lying next to the block",
    },
    {
      key: "qcl-qa-sop-0001/eight-point-pattern",
      prompt:
        "close-up of the cut end of a short black polyethylene pipe test piece with blue longitudinal stripes, eight small white paint dots evenly spaced around the circumference near the cut edge, a gloved hand holding an ultrasonic probe perpendicular on one dot with a dab of couplant gel, laboratory bench background",
    },
    {
      key: "qcl-qa-sop-0001/pi-tape-od",
      prompt:
        "two gloved hands wrapping a thin steel circumference tape squarely around the middle of a 200 mm long black polyethylene pipe test piece lying on a laboratory bench, the tape snug against the pipe surface, viewed from slightly above",
    },
  ],
}
