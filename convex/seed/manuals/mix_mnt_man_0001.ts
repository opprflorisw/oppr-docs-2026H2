// Wrapped supplier manual: Vortex HM-500 high-speed batch mixer (MXR-101).
// Numbers follow docs/build/plant-facts.md: max batch 250 kg, 4 minutes
// mixing, lid interlock, FFP2 + local extraction + no compressed air.
import type { SupplierManual } from "../builders"

export const manual: SupplierManual = {
  code: "MIX-MNT-MAN-0001",
  title: "Vortex HM-500 high-speed mixer: operating manual",
  area: "MIX",
  discipline: "MNT",
  supplier: "Vortex Mischtechnik",
  supplierDocNumber: "VM-HM500-BA-EN",
  supplierRevision: "Edition 2.1 (2021-09)",
  model: "HM-500",
  publishedDaysAgo: 280,
  nextReviewInDays: 85,
  assets: ["MXR-101"],
  images: [
    {
      key: "mix-mnt-man-0001/mixer-overview",
      prompt:
        "industrial high-speed batch mixer for plastic granulate: tall cylindrical stainless steel mixing vessel on a steel support frame, hinged lid on top with a pneumatic lid cylinder and a safety switch at the hinge, filling chute on the lid, drive motor with belt guard underneath the vessel, pneumatic discharge valve on the side of the vessel leading into a transfer pipe, small control panel on a pedestal next to the mixer",
    },
    {
      key: "mix-mnt-man-0001/mixing-tool",
      prompt:
        "cutaway view into a cylindrical stainless steel mixing vessel showing the multi-level mixing tool at the bottom: a lower scraper blade close to the vessel floor and two upper fluidising blades on a central vertical shaft, a vortex of plastic granulate pellets swirling around the vessel wall, the discharge opening in the side wall near the floor",
    },
    {
      key: "mix-mnt-man-0001/lid-interlock",
      prompt:
        "close-up of the hinge area of a stainless steel mixer lid with a coded safety interlock switch mounted on the frame and its actuator mounted on the lid, the lid slightly open, a gloved hand pointing at the switch",
    },
  ],
  pages: [
    // ---- Page 2: safety -----------------------------------------------------
    {
      blocks: [
        { kind: "heading", text: "1 Safety" },
        {
          kind: "paragraph",
          text:
            "The Vortex HM-500 is a high-speed batch mixer for dry blending of plastic granulate with colour masterbatch and additives. Read this operating manual before using the HM-500 and keep the manual at the mixer.",
        },
        { kind: "heading", text: "1.1 Intended use", level: 2 },
        {
          kind: "paragraph",
          text:
            "The HM-500 mixer is intended only for dry, free-flowing plastic granulate, powder additives and masterbatch. Do not mix liquids, solvents or materials that can form an explosive dust cloud without a written release from Vortex Mischtechnik. Never load the HM-500 above the maximum batch weight of 250 kg.",
        },
        {
          kind: "warning",
          level: "DANGER",
          text:
            "Rotating mixing tool. The mixing tool of the HM-500 turns at high speed and can cause amputation. Never reach into the mixing vessel unless the main isolator is switched off and locked and the mixing tool has come to a complete stop.",
        },
        {
          kind: "warning",
          level: "WARNING",
          text:
            "Lid interlock. The HM-500 will not start with the lid open, and opening the lid during mixing stops the drive. Never bypass, bridge or remove the lid interlock switch. A mixer with a defective lid interlock must not be used.",
        },
        {
          kind: "warning",
          level: "WARNING",
          text:
            "Dust. Emptying bags of masterbatch or additives into the HM-500 releases dust. Wear a dust mask of class FFP2 when emptying bags and keep the local extraction at the filling chute switched on.",
        },
        {
          kind: "warning",
          level: "CAUTION",
          text:
            "Never use compressed air to clean the HM-500 mixer or the area around it. Compressed air spreads dust into the hall and into the breathing zone. Use a vacuum cleaner suitable for plastic dust.",
        },
        { kind: "heading", text: "1.2 Personal protective equipment", level: 2 },
        {
          kind: "list",
          items: [
            "Safety glasses when filling and when opening the lid.",
            "Dust mask FFP2 when emptying bags.",
            "Protective gloves when handling bags and when cleaning.",
            "Safety shoes.",
          ],
        },
      ],
    },
    // ---- Page 3: description and technical data ----------------------------
    {
      blocks: [
        { kind: "heading", text: "2 Description and technical data" },
        {
          kind: "paragraph",
          text:
            "The HM-500 consists of a cylindrical stainless steel mixing vessel with a hinged lid, a multi-level mixing tool driven from below, a pneumatic discharge valve and a control panel (see Fig. 1). The mixing tool lifts the granulate along the vessel wall and creates a vortex that distributes the masterbatch evenly through the batch.",
        },
        {
          kind: "figure",
          key: "mix-mnt-man-0001/mixer-overview",
          caption:
            "Fig. 1: Vortex HM-500 mixer. Mixing vessel with hinged lid and lid interlock, filling chute, drive with belt guard, discharge valve to the transfer pipe and control panel.",
        },
        {
          kind: "table",
          rows: [
            ["Parameter", "Value"],
            ["Gross vessel volume", "500 L"],
            ["Maximum batch weight", "250 kg"],
            ["Mixing tool speed, low / high", "450 rpm / 900 rpm"],
            ["Drive motor", "37 kW, two-speed"],
            ["Discharge valve", "Pneumatic, 6 bar compressed air"],
            ["Material temperature sensor", "PT100 in the vessel wall"],
            ["Lid interlock", "Coded safety switch, category 3"],
            ["Weight empty", "approx. 1,900 kg"],
          ],
        },
      ],
    },
    // ---- Page 4: operation --------------------------------------------------
    {
      blocks: [
        { kind: "heading", text: "3 Operation" },
        { kind: "heading", text: "3.1 Filling", level: 2 },
        {
          kind: "list",
          items: [
            "Check that the discharge valve of the HM-500 is closed and that the transfer pipe is ready to receive material.",
            "Switch on the local extraction at the filling chute.",
            "Weigh the granulate and the masterbatch according to the recipe or batch card of the operating company.",
            "Fill the granulate first, then the masterbatch, through the filling chute.",
            "Never fill more than 250 kg per batch into the HM-500.",
            "Close the lid. The lid-closed lamp on the control panel lights when the lid interlock is made.",
          ],
        },
        { kind: "heading", text: "3.2 Mixing", level: 2 },
        {
          kind: "list",
          items: [
            "Select the mixing program on the control panel.",
            "Press START. The HM-500 starts at low speed.",
            "For colouring PE granulate with masterbatch, a mixing time of 4 minutes at low speed gives a homogeneous mix.",
            "The HM-500 stops automatically at the end of the mixing time.",
            "If the material temperature exceeds the alarm value of the program, the HM-500 stops and shows a temperature alarm.",
          ],
        },
        {
          kind: "figure",
          key: "mix-mnt-man-0001/mixing-tool",
          caption:
            "Fig. 2: HM-500 mixing tool. Scraper blade near the vessel floor and two fluidising blades on the central shaft create the vortex.",
        },
        { kind: "heading", text: "3.3 Discharge", level: 2 },
        {
          kind: "list",
          items: [
            "Press DISCHARGE. The discharge valve opens and the mixing tool runs at low speed to empty the vessel.",
            "Watch the transfer pipe until the vessel is empty, then press STOP.",
            "Close the discharge valve before filling the next batch.",
          ],
        },
      ],
    },
    // ---- Page 5: interlocks -------------------------------------------------
    {
      blocks: [
        { kind: "heading", text: "4 Safety devices and interlocks" },
        {
          kind: "paragraph",
          text:
            "The safety devices of the HM-500 protect operators against the rotating mixing tool. Test the safety devices at the start of every working day and before the HM-500 is used after maintenance.",
        },
        {
          kind: "table",
          rows: [
            ["Safety device", "Function", "Daily test"],
            ["Lid interlock switch", "Prevents start with the lid open; stops the drive when the lid opens", "Open the lid 5 cm and press START: the mixer must not start"],
            ["Lid lock during run-down", "Keeps the lid locked until the mixing tool has stopped", "Stop the mixer and try to open the lid at once: the lid must stay locked"],
            ["Emergency stop", "Stops the drive and closes the discharge valve", "Press the emergency stop during low-speed running: the tool must stop"],
            ["Belt guard switch", "Prevents start with the belt guard removed", "Visual check that the belt guard is fitted and screwed"],
            ["Discharge valve guard", "Prevents access to the tool through the discharge opening", "Visual check that the guard is in place"],
          ],
        },
        {
          kind: "figure",
          key: "mix-mnt-man-0001/lid-interlock",
          caption:
            "Fig. 3: Lid interlock of the HM-500. The coded switch on the frame and the actuator on the lid.",
        },
        {
          kind: "warning",
          level: "WARNING",
          text:
            "If any safety device of the HM-500 fails the daily test, switch the mixer off, lock the main isolator, and report the fault to maintenance. Do not use the HM-500 until the fault is repaired and the test is passed.",
        },
      ],
    },
    // ---- Page 6: cleaning and maintenance -----------------------------------
    {
      blocks: [
        { kind: "heading", text: "5 Cleaning and maintenance" },
        {
          kind: "warning",
          level: "DANGER",
          text:
            "Before cleaning the vessel of the HM-500 or doing any maintenance, switch off the main isolator, lock it with a personal lock, and verify with a try-start that the mixer cannot start.",
        },
        { kind: "heading", text: "5.1 Cleaning after a colour change", level: 2 },
        {
          kind: "list",
          items: [
            "Empty the HM-500 completely through the discharge valve.",
            "Lock out the HM-500 before opening the lid for cleaning.",
            "Remove masterbatch residue from the vessel wall, the mixing tool and the lid seal with a vacuum cleaner and a plastic scraper.",
            "Clean the discharge valve seat.",
            "Never use compressed air to clean the HM-500.",
          ],
        },
        { kind: "heading", text: "5.2 Maintenance schedule", level: 2 },
        {
          kind: "table",
          rows: [
            ["Interval", "Task"],
            ["Daily", "Test the safety devices (section 4); check the lid seal"],
            ["Weekly", "Check the mixing tool blades for wear and loose fixings; check the discharge valve for leaks"],
            ["Monthly", "Check the drive belt tension and condition; clean the motor cooling fins"],
            ["Every 6 months", "Lubricate the main shaft bearing; check the lid hinge"],
            ["Yearly", "Have the lid interlock and emergency stop circuit checked by a qualified electrician"],
          ],
        },
      ],
    },
    // ---- Page 7: troubleshooting and spare parts ----------------------------
    {
      blocks: [
        { kind: "heading", text: "6 Troubleshooting" },
        {
          kind: "table",
          rows: [
            ["Fault", "Possible cause", "Remedy"],
            ["Mixer does not start", "Lid open or lid interlock defective", "Close the lid; if the lid-closed lamp stays off, call maintenance"],
            ["Mixer stops during mixing", "Lid opened, temperature alarm, motor overload", "Read the alarm on the panel; check the batch weight"],
            ["Streaks or uneven colour in the mix", "Mixing time too short, masterbatch added before granulate", "Mix for the full program time; fill granulate first"],
            ["Material temperature alarm", "Mixing at high speed too long", "Use low speed for colour mixing; let the vessel cool"],
            ["Discharge valve does not open", "No compressed air, valve blocked", "Check the 6 bar supply; clean the valve seat"],
            ["Dust escapes at the filling chute", "Local extraction off or filter blocked", "Switch on the extraction; report a blocked filter"],
          ],
        },
        { kind: "heading", text: "7 Spare parts" },
        {
          kind: "table",
          rows: [
            ["Part number", "Description"],
            ["HM5-200-01", "Scraper blade, lower"],
            ["HM5-200-02", "Fluidising blade, upper"],
            ["HM5-310-10", "Lid seal"],
            ["HM5-410-05", "Lid interlock switch with coded actuator"],
            ["HM5-520-03", "Drive belt set"],
            ["HM5-610-07", "Discharge valve seal kit"],
          ],
        },
        {
          kind: "paragraph",
          text:
            "Use only original Vortex Mischtechnik spare parts for the HM-500. State the serial number from the rating plate when ordering.",
        },
      ],
    },
  ],
}
