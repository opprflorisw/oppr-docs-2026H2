// Wrapped supplier manual: Sonatek UT-200 ultrasonic thickness gauge
// (QCL-301). Says calibrate "at the start of every shift": deliberate
// contradiction #3 with QCL-QA-SOP-0001 ("once a day"). Keep it.
import type { SupplierManual } from "../builders"

export const manual: SupplierManual = {
  code: "QCL-QA-MAN-0001",
  title: "Sonatek UT-200 ultrasonic thickness gauge: user guide",
  area: "QCL",
  discipline: "QA",
  supplier: "Sonatek Instruments",
  supplierDocNumber: "UT200-UG-EN",
  supplierRevision: "Rev. C (2023-02)",
  model: "UT-200",
  publishedDaysAgo: 190,
  nextReviewInDays: 175,
  assets: ["QCL-301"],
  images: [
    {
      key: "qcl-qa-man-0001/gauge-and-probe",
      prompt:
        "handheld ultrasonic wall thickness gauge with a rugged rubber housing, a blank display screen and a membrane keypad, connected by a coiled cable to a small cylindrical dual-element transducer probe, lying next to a stepped steel calibration block with two steps of different height and a small bottle of couplant gel",
    },
    {
      key: "qcl-qa-man-0001/step-block-calibration",
      prompt:
        "close-up of a gloved hand pressing a small ultrasonic transducer probe flat onto the thin step of a stepped steel calibration block, a thin film of clear couplant gel visible between the probe face and the block, the thicker step of the block next to it",
    },
    {
      key: "qcl-qa-man-0001/pipe-measurement",
      prompt:
        "a black plastic pressure pipe with blue stripes lying on a lab bench, cut end facing the viewer, a hand holding a small ultrasonic probe flat on the outer pipe surface near the cut end, small dots of couplant gel evenly spaced around the circumference of the pipe",
    },
  ],
  pages: [
    // ---- Page 2: introduction, safety, description -------------------------
    {
      blocks: [
        { kind: "heading", text: "1 Introduction" },
        {
          kind: "paragraph",
          text:
            "The Sonatek UT-200 is a handheld ultrasonic thickness gauge for measuring the wall thickness of metal and plastic parts from one side. The UT-200 sends an ultrasonic pulse into the material and measures the time until the echo from the back wall returns. The gauge converts this time into a thickness using the sound velocity of the material.",
        },
        { kind: "heading", text: "1.1 Safety and intended use", level: 2 },
        {
          kind: "list",
          items: [
            "Use the UT-200 only for thickness measurement as described in this user guide.",
            "Use only the probe and the step block supplied with the UT-200 or approved by Sonatek Instruments.",
            "Do not measure on surfaces hotter than 60 °C with the standard probe. Hot surfaces damage the probe face.",
            "Do not open the gauge housing. There are no user-serviceable parts inside.",
          ],
        },
        {
          kind: "warning",
          level: "CAUTION",
          text:
            "A UT-200 that has not been calibrated, or that was calibrated with the wrong sound velocity, shows wrong thickness values without an error message. Calibrate the UT-200 as described in section 3 before taking measurements.",
        },
        { kind: "heading", text: "1.2 Parts of the UT-200", level: 2 },
        {
          kind: "figure",
          key: "qcl-qa-man-0001/gauge-and-probe",
          caption:
            "Fig. 1: UT-200 gauge with dual-element probe, the supplied step block with 3 mm and 12 mm steps, and couplant gel.",
        },
        {
          kind: "list",
          items: [
            "UT-200 gauge with display and keypad.",
            "5 MHz dual-element probe with cable.",
            "Step block with a 3 mm step and a 12 mm step, with its calibration certificate.",
            "Couplant gel, 250 ml.",
            "Carry case, two AA batteries, USB cable.",
          ],
        },
      ],
    },
    // ---- Page 3: technical data and couplant -------------------------------
    {
      blocks: [
        { kind: "heading", text: "2 Technical data" },
        {
          kind: "table",
          rows: [
            ["Parameter", "Value"],
            ["Measuring range (steel)", "1.0 to 200 mm"],
            ["Measuring range (PE)", "1.0 to 50 mm"],
            ["Display resolution", "0.01 mm"],
            ["Accuracy after two-point calibration", "±0.05 mm"],
            ["Probe", "5 MHz dual element, 10 mm contact face"],
            ["Sound velocity setting", "1,000 to 9,999 m/s"],
            ["Typical sound velocity for PE100", "2,350 m/s (check with a reference sample)"],
            ["Operating temperature", "-10 to 50 °C"],
            ["Power supply", "2 x AA batteries, about 40 hours"],
            ["Memory", "10,000 readings in up to 100 files"],
          ],
        },
        { kind: "heading", text: "2.1 Couplant", level: 2 },
        {
          kind: "paragraph",
          text:
            "Ultrasound does not pass through air. Apply a thin layer of couplant gel between the UT-200 probe and the surface for every reading. Use the Sonatek couplant gel or a water-based ultrasonic gel. Too little couplant gives no reading or an unstable reading; a thick layer of couplant on a rough surface can add up to 0.1 mm to the reading.",
        },
        {
          kind: "list",
          items: [
            "Apply one drop of couplant gel, about 5 mm across, at each measuring point.",
            "Wipe the couplant gel off the part and the probe after measuring.",
            "Close the couplant bottle after use to keep the gel free of dirt.",
          ],
        },
        { kind: "heading", text: "2.2 Switching on", level: 2 },
        {
          kind: "paragraph",
          text:
            "Press the ON key of the UT-200. The gauge shows the battery state, the selected material and the sound velocity. Check that the material shown matches the part to be measured before calibrating.",
        },
      ],
    },
    // ---- Page 4: calibration -----------------------------------------------
    {
      blocks: [
        { kind: "heading", text: "3 Calibration" },
        {
          kind: "paragraph",
          text:
            "Calibrate the UT-200 with a two-point calibration on the supplied step block at the start of every shift. Also calibrate the UT-200 after changing the probe, after changing the batteries, after a drop or impact, and when the room temperature has changed by more than 10 °C since the last calibration.",
        },
        {
          kind: "warning",
          level: "NOTE",
          text:
            "The two-point calibration compensates for probe wear and for the delay in the probe. A one-point calibration is not sufficient for plastic pipe measurements with the UT-200.",
        },
        { kind: "heading", text: "3.1 Two-point calibration on the step block", level: 2 },
        {
          kind: "list",
          items: [
            "Clean the step block and the probe face.",
            "Select the material of the part to be measured, for example PE100, in the MATERIAL menu.",
            "Press CAL. The UT-200 shows CAL 1.",
            "Apply couplant to the 3 mm step and press the probe flat on the 3 mm step (see Fig. 2).",
            "When the reading is stable, enter 3.00 mm with the arrow keys and press ENTER. The UT-200 shows CAL 2.",
            "Apply couplant to the 12 mm step and press the probe flat on the 12 mm step.",
            "When the reading is stable, enter 12.00 mm and press ENTER. The UT-200 shows CAL OK.",
            "Check the calibration: measure the 3 mm step and the 12 mm step again. Each reading must be within ±0.05 mm of the step value.",
            "If a check reading is outside ±0.05 mm, clean the probe and repeat the calibration.",
          ],
        },
        {
          kind: "figure",
          key: "qcl-qa-man-0001/step-block-calibration",
          caption:
            "Fig. 2: Two-point calibration of the UT-200. The probe is pressed flat on the 3 mm step of the step block with a thin film of couplant.",
        },
        {
          kind: "paragraph",
          text:
            "The step block must be kept clean, dry and free of scratches. Have the step block re-certified every two years.",
        },
      ],
    },
    // ---- Page 5: measuring ---------------------------------------------------
    {
      blocks: [
        { kind: "heading", text: "4 Measuring" },
        { kind: "heading", text: "4.1 Measuring wall thickness", level: 2 },
        {
          kind: "list",
          items: [
            "Let the part cool to room temperature before measuring with the UT-200. Warm plastic gives a lower reading.",
            "Wipe the measuring point clean and dry.",
            "Apply one drop of couplant gel at the measuring point.",
            "Press the probe flat on the surface with light, even pressure. Do not tilt the probe.",
            "Read the value when the coupling symbol is steady and the reading no longer changes.",
            "Press SAVE to store the reading in the active file, or note the reading.",
          ],
        },
        { kind: "heading", text: "4.2 Measuring pipe", level: 2 },
        {
          kind: "paragraph",
          text:
            "On pipe, place the UT-200 probe with the split line of the dual-element probe at right angles to the pipe axis. This gives a stable echo on the curved surface. Take the readings evenly spaced around the circumference, at the number of points and at the positions required by your quality procedure (see Fig. 3).",
        },
        {
          kind: "figure",
          key: "qcl-qa-man-0001/pipe-measurement",
          caption:
            "Fig. 3: Measuring the wall thickness of pipe with the UT-200. Measuring points are evenly spaced around the circumference near the pipe end.",
        },
        {
          kind: "list",
          items: [
            "Measure at least 10 mm away from a cut end, where the cut face does not disturb the echo.",
            "On small pipe, use the small-diameter probe adapter for a stable reading.",
            "Use MIN mode to capture the smallest reading while sliding the probe slowly over the area.",
          ],
        },
      ],
    },
    // ---- Page 6: error codes and care --------------------------------------
    {
      blocks: [
        { kind: "heading", text: "5 Error codes" },
        {
          kind: "table",
          rows: [
            ["Code", "Meaning", "Action"],
            ["E01", "No echo received", "Apply more couplant; press the probe flat; check the probe cable"],
            ["E02", "Unstable reading", "Hold the probe still; clean the surface; use more couplant"],
            ["E03", "Reading outside the measuring range", "Check the material setting and the sound velocity"],
            ["E04", "Calibration failed", "Clean the step block and the probe; repeat the two-point calibration"],
            ["E05", "Calibration overdue", "Calibrate on the step block before measuring"],
            ["E07", "Probe not recognised", "Check the probe connector; replace the probe cable"],
            ["E09", "Memory full", "Transfer the files to a PC and delete them from the gauge"],
            ["BAT", "Battery low", "Replace both AA batteries, then calibrate again"],
          ],
        },
        { kind: "heading", text: "6 Care and maintenance" },
        {
          kind: "list",
          items: [
            "Wipe the UT-200 and the probe with a damp cloth after use. Do not use solvents.",
            "Check the probe face for wear every week. A worn or scratched probe face gives unstable readings and must be replaced.",
            "Store the UT-200, the probe and the step block in the carry case.",
            "Remove the batteries if the UT-200 will not be used for more than one month.",
            "Have the UT-200 checked by Sonatek Instruments or an accredited laboratory once a year.",
          ],
        },
      ],
    },
  ],
}
