// QCL-QA-WI-0001: Quarantine and release of non-conforming pipe.
// Plant facts: docs/build/plant-facts.md (red QUARANTINE label, NC report in
// the QC log, quarantine bay next to the Quality lab, only the quality
// manager releases or scraps).
import { asset, b, bullets, callout, doc, h, img, p, ppe, ref, steps, table, type SeedDoc } from "../builders"

const body = doc(
  h(1, "Quarantine and release of non-conforming pipe"),
  p(
    "This work instruction describes how pipe from line 2 that fails a check is blocked, labelled, recorded and moved to the quarantine bay, and how the quality manager releases or scraps the blocked pipe. Most non-conforming pipe is found with the ultrasonic thickness gauge ",
    asset("QCL-301"),
    " in the Quality lab.",
  ),
  p(
    "Non-conforming pipe must never reach a customer. A red QUARANTINE label on pipe means: do not move, do not ship, do not regrind, until the quality manager decides.",
  ),

  h(2, "Scope"),
  bullets([
    "This work instruction applies to all pipe from line 2 (lengths and coils) that fails a wall thickness or OD measurement, shows visible defects, or has an unknown or wrong batch identity.",
    "This work instruction also applies to pipe that a customer or the warehouse reports as suspect.",
    "Raw material problems (wet or contaminated granulate) are handled by the shift leader in Hall 1 and are not covered here.",
  ]),

  h(2, "Responsibilities"),
  table([
    ["Role", "Responsibility"],
    ["Quality lab technician", "Decides that pipe is non-conforming, creates the NC report in the QC log and fills in the red QUARANTINE labels."],
    ["Line operator", "Stops suspect pipe from leaving line 2, attaches the red QUARANTINE labels and helps move the pipe to the quarantine bay."],
    ["Shift leader", "Makes sure all suspect pipe since the last passed measurement is found and blocked, and writes the event in the shift log."],
    ["Quality manager", "Is the only person who releases or scraps quarantined pipe, and signs the decision on the NC report."],
  ]),

  h(2, "Personal protective equipment"),
  p("Wear safety shoes, gloves and hearing protection in Hall 2, and a high-visibility vest in the quarantine bay when the forklift is working."),
  ppe("boots,gloves,ear-pro,hi-vis"),

  h(2, "Tools and materials"),
  bullets([
    "Red QUARANTINE labels with cable ties (stock in the Quality lab, drawer 2).",
    "Black waterproof marker.",
    "QC log with the NC report pages.",
    "Forklift with pipe forks, driven only by a certified forklift driver.",
    "Red and white barrier chain at the quarantine bay.",
  ]),

  h(2, "Procedure"),
  callout(
    "warning",
    "Never reach into the haul-off or saw area of ",
    asset("SAW-202"),
    " or into the coiler ",
    asset("CLR-204"),
    " to pull out a suspect pipe while line 2 is only stopped. A stopped line can restart. Use lockout/tagout per EXT-HSE-SOP-0001 when you must reach into the line.",
  ),
  steps([
    "Tell the line operator of line 2 at once that pipe is non-conforming, so that no further pipe of that batch goes to the dispatch area.",
    "Find the last passed measurement for line 2 in the QC log; all pipe made after the last passed measurement is suspect and must be quarantined.",
    "Create an NC report in the QC log with the next NC number, the date and time, the product, the batch, the number of lengths or coils, and the reason (for example: wall below minimum at point 3, 9.7 mm on 110 SDR 11).",
    "Fill in one red QUARANTINE label per bundle of lengths or per coil with the NC number, the date, the product, the batch and your initials.",
    "Attach each red QUARANTINE label with a cable tie to the outside of the bundle or coil, where the label is visible from the forklift aisle.",
    "Have a certified forklift driver move the labelled bundles and coils to the quarantine bay next to the Quality lab, and close the red and white barrier chain behind the load.",
    "Write the lane number in the quarantine bay on the NC report, so that the quality manager can find the pipe.",
    "Inform the quality manager of the NC number before the end of the shift, by phone or in person; for gas pipe (yellow), inform the quality manager at once.",
    "The quality manager decides on each bundle or coil: release (the pipe is conforming after re-measurement), sort (re-measure each item), or scrap, and signs the decision on the NC report.",
    "For released pipe, the quality manager removes the red QUARANTINE label, writes RELEASED and the date on the NC report, and the pipe goes back to normal stock.",
    "For scrapped pipe, the quality manager writes SCRAP on the red QUARANTINE label, and the line operator cuts the scrapped pipe into pieces for the PE regrind container in Hall 2.",
  ]),
  img(
    "qcl-qa-wi-0001/red-label-coil",
    "A red QUARANTINE label fastened with a cable tie to the outside of a strapped coil of black PE pipe with blue stripes.",
  ),
  callout(
    "authorised",
    "Only the quality manager releases or scraps quarantined pipe. Nobody else removes a red QUARANTINE label, not even when the pipe looks good or a customer is waiting.",
  ),
  img(
    "qcl-qa-wi-0001/quarantine-bay",
    "The quarantine bay next to the Quality lab: bundles and coils of pipe with red labels behind a red and white barrier chain.",
  ),

  h(2, "Checks and acceptance criteria"),
  table([
    ["Check", "Acceptance criterion"],
    ["Suspect range", "All pipe made after the last passed measurement in the QC log is quarantined, not only the pipe that was measured."],
    ["Labels", "Every bundle and every coil carries its own red QUARANTINE label with NC number, date, product, batch and initials."],
    ["NC report", "The NC report in the QC log has the NC number, reason, quantity, batch and lane number in the quarantine bay."],
    ["Location", "All quarantined pipe stands in the quarantine bay behind the closed barrier chain; no quarantined pipe stays at line 2 or in the dispatch area."],
    ["Decision", "Every NC report is closed with a decision (release, sort or scrap) signed by the quality manager."],
  ]),

  h(2, "If something goes wrong"),
  table([
    ["Symptom", "Likely cause", "Action"],
    ["Suspect pipe is already in the dispatch area or loaded on a truck", "The pipe left line 2 before the measurement result was known", "Stop the loading, tell the shift leader and the quality manager at once, and put red QUARANTINE labels on the suspect pipe where the pipe stands."],
    ["Suspect pipe has already been shipped to a customer", "The fail was found late", "Tell the quality manager at once; only the quality manager contacts the customer."],
    ["The quarantine bay is full", "Many open NC reports, or decisions are waiting", "Tell the quality manager; mark a temporary quarantine area with the barrier chain next to the bay and write the temporary location on the NC report."],
    ["A red QUARANTINE label is missing from a bundle in the quarantine bay", "The label tore off during transport", "Check the batch on the pipe print, compare with the NC report, and attach a new red QUARANTINE label."],
    ["The batch number on the pipe print does not match the NC report", "Print line was not updated after a batch change", "Quarantine the pipe under the same NC report, write both batch numbers on the NC report, and tell the shift leader."],
  ]),

  h(2, "Records"),
  bullets([
    "The NC report in the QC log is the record of the non-conformity, the quarantine location and the decision of the quality manager.",
    "The shift leader writes the NC number and the quantity in the shift log at handover.",
    "The quality manager reviews all open NC reports every week and closes each NC report within 10 working days.",
    "Closed NC reports are kept with the QC log for 10 years.",
  ]),

  h(2, "References"),
  bullets([
    [ref("QCL-QA-SOP-0001"), " Measuring wall thickness and outside diameter (tolerance table)."],
    [ref("EXT-HSE-SOP-0001"), " Lockout/tagout on extrusion line 2."],
    [ref("QCL-QA-MAN-0001"), " Sonatek UT-200 ultrasonic thickness gauge: user guide."],
    ["ISO 9001 clause 8.7, ", b("Control of nonconforming outputs"), "."],
  ]),
)

export const seedDoc: SeedDoc = {
  code: "QCL-QA-WI-0001",
  title: "Quarantine and release of non-conforming pipe",
  type: "work_instruction",
  area: "QCL",
  discipline: "QA",
  status: "published",
  editions: [{ body, publishedDaysAgo: 176 }],
  assets: ["QCL-301"],
  nextReviewInDays: 189,
  tags: ["quality", "non-conforming", "quarantine", "release"],
  images: [
    {
      key: "qcl-qa-wi-0001/red-label-coil",
      prompt:
        "close-up of a blank bright red tag fastened with a black cable tie to the outside of a strapped coil of black polyethylene pipe with blue longitudinal stripes, the coil lying flat on a pallet in a factory hall, no writing on the tag",
    },
    {
      key: "qcl-qa-wi-0001/quarantine-bay",
      prompt:
        "a fenced quarantine area inside a plastics pipe factory next to a laboratory door: several bundles of straight black polyethylene pipe and two pipe coils on pallets, each with a blank red tag, closed off by a red and white barrier chain on posts, wide view from the forklift aisle",
    },
  ],
}
