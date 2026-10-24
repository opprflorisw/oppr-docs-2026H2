// Wrapped supplier manual: Nordcut HC-110 haul-off and PS-110 planetary saw
// (SAW-202). Never name a saw blade part number here (the blade code in
// EXT-OPS-WI-0001 is a draft sentinel and must never reach Published text).
import type { SupplierManual } from "../builders"

export const manual: SupplierManual = {
  code: "EXT-MNT-MAN-0002",
  title: "Nordcut HC-110 haul-off and PS-110 planetary saw: manual",
  area: "EXT",
  discipline: "MNT",
  supplier: "Nordcut Machinery AB",
  supplierDocNumber: "NC-110-OM-EN",
  supplierRevision: "Version 3.2 (2022-11)",
  model: "HC-110 / PS-110",
  publishedDaysAgo: 220,
  nextReviewInDays: 145,
  assets: ["SAW-202"],
  images: [
    {
      key: "ext-mnt-man-0002/haul-off-and-saw",
      prompt:
        "pipe extrusion downstream equipment in line: a caterpillar haul-off with three rubber-padded tracks arranged around a black plastic pipe, followed by a planetary saw in a closed sheet-metal housing with a hinged transparent guard hood, the pipe running straight through both machines on a support, chip extraction hose on top of the saw housing",
    },
    {
      key: "ext-mnt-man-0002/saw-blade-change",
      prompt:
        "inside view of a planetary pipe saw with the guard hood open: a circular carbide-tipped saw blade mounted on a flange on a rotating carrier ring, two hands in cut-resistant gloves holding the blade at its edge while a blade flange nut lies removed on a tray, a pin spanner next to it",
    },
  ],
  pages: [
    // ---- Page 2: safety ----------------------------------------------------
    {
      blocks: [
        { kind: "heading", text: "1 Safety" },
        {
          kind: "paragraph",
          text:
            "This manual covers the Nordcut HC-110 caterpillar haul-off and the Nordcut PS-110 planetary saw for plastic pipe up to 110 mm outside diameter. Read this manual before operating, setting or maintaining the HC-110 or the PS-110.",
        },
        { kind: "heading", text: "1.1 Main hazards", level: 2 },
        {
          kind: "list",
          items: [
            "Drawing-in between the caterpillar tracks of the HC-110 haul-off.",
            "Cuts and amputation by the rotating saw blade of the PS-110.",
            "Crushing by the pipe clamp and the moving saw carriage of the PS-110.",
            "Stored pneumatic energy in the track pressure cylinders and the pipe clamp.",
            "Flying chips during cutting.",
          ],
        },
        {
          kind: "warning",
          level: "DANGER",
          text:
            "Never reach into the haul-off or saw area while the line is only stopped. A stopped line can restart. Before any work inside the guards of the HC-110 or PS-110, switch off and lock the main isolator and release the stored pneumatic energy.",
        },
        {
          kind: "warning",
          level: "WARNING",
          text:
            "The HC-110 track pressure cylinders and the PS-110 pipe clamp stay under air pressure after the main isolator is switched off. Open the pneumatic dump valve on the HC-110 haul-off and check that the pressure gauge reads 0 bar before working between the tracks or at the clamp.",
        },
        {
          kind: "warning",
          level: "WARNING",
          text:
            "The saw blade of the PS-110 continues to run down after a stop. Open the guard hood only when the blade has stopped completely. The guard hood is locked until the blade standstill monitor confirms that the blade has stopped.",
        },
        { kind: "heading", text: "1.2 Personal protective equipment", level: 2 },
        {
          kind: "list",
          items: [
            "Safety glasses at the saw.",
            "Cut-resistant gloves for handling saw blades and freshly cut pipe ends.",
            "Hearing protection according to the site rules.",
            "Safety shoes.",
          ],
        },
      ],
    },
    // ---- Page 3: description and data --------------------------------------
    {
      blocks: [
        { kind: "heading", text: "2 Description" },
        {
          kind: "paragraph",
          text:
            "The HC-110 haul-off pulls the pipe from the extruder through the vacuum calibration and cooling at a constant speed. Three rubber-padded caterpillar tracks grip the pipe from three sides. The track pressure is set with pneumatic cylinders. The haul-off speed follows the line speed signal from the line control.",
        },
        {
          kind: "paragraph",
          text:
            "The PS-110 planetary saw cuts the pipe to length without stopping the line. The saw carriage clamps the pipe and travels with it while the saw blade, on a rotating carrier ring, moves around the pipe and cuts through the wall. After the cut, the clamp opens and the carriage returns to its start position (see Fig. 1).",
        },
        {
          kind: "figure",
          key: "ext-mnt-man-0002/haul-off-and-saw",
          caption:
            "Fig. 1: HC-110 haul-off with three caterpillar tracks, followed by the PS-110 planetary saw with its guard hood and chip extraction.",
        },
        {
          kind: "table",
          rows: [
            ["Parameter", "HC-110 haul-off", "PS-110 planetary saw"],
            ["Pipe outside diameter", "20 to 110 mm", "20 to 110 mm"],
            ["Speed / cutting", "0.2 to 20 m/min", "Wall thickness up to 15 mm"],
            ["Tracks / blade", "3 tracks, contact length 1,100 mm", "1 circular carbide-tipped blade"],
            ["Cut length setting", "-", "0.5 to 15 m"],
            ["Cut length accuracy", "-", "±10 mm"],
            ["Compressed air", "6 bar", "6 bar"],
          ],
        },
      ],
    },
    // ---- Page 4: guards and interlocks -------------------------------------
    {
      blocks: [
        { kind: "heading", text: "3 Guards and interlocks" },
        {
          kind: "paragraph",
          text:
            "The guards of the HC-110 and the PS-110 are interlocked with the control system. Opening an interlocked guard stops the haul-off tracks or the saw at once. Test all interlocks at the start of every shift.",
        },
        {
          kind: "table",
          rows: [
            ["Guard or device", "Function", "Shift test"],
            ["PS-110 saw guard hood", "Interlocked and locked: the saw cannot run with the hood open, and the hood stays locked until the blade has stopped", "Try to open the hood during a cut: the hood must stay locked; open the hood at standstill and press SAW START: the saw must not start"],
            ["HC-110 side covers", "Interlocked: the tracks stop when a cover is opened", "Open one cover with the tracks running at low speed: the tracks must stop"],
            ["Infeed and outfeed guards", "Fixed guards around the pipe entry and exit", "Visual check that the guards are fitted"],
            ["Emergency stop buttons", "Stop the haul-off, saw and line", "Press each button once per week; check the reset"],
            ["Pneumatic dump valve on the HC-110", "Releases the air from the track cylinders and the clamp", "Open the valve: the gauge must drop to 0 bar"],
          ],
        },
        {
          kind: "warning",
          level: "DANGER",
          text:
            "Never bypass or defeat an interlock on the HC-110 or the PS-110. If an interlock test fails, stop the line, lock out the machine and report the fault to maintenance before production continues.",
        },
      ],
    },
    // ---- Page 5: operation --------------------------------------------------
    {
      blocks: [
        { kind: "heading", text: "4 Operation" },
        { kind: "heading", text: "4.1 Threading a new pipe", level: 2 },
        {
          kind: "list",
          items: [
            "Open the HC-110 tracks to their maximum gap with the TRACKS OPEN button.",
            "Guide the pipe start through the haul-off from the infeed side, using a pulling rope or a starter pipe.",
            "Close the tracks and set the track pressure for the pipe size from the table on the HC-110 panel.",
            "Start the HC-110 at low speed and increase to the line speed.",
            "Check that the pipe runs centred through the haul-off and the PS-110 saw.",
          ],
        },
        {
          kind: "warning",
          level: "WARNING",
          text:
            "Keep hands at least 300 mm away from the HC-110 infeed while the tracks are moving. Use the pulling rope, never your hands, to guide the pipe start into the tracks.",
        },
        { kind: "heading", text: "4.2 Setting the cut length", level: 2 },
        {
          kind: "list",
          items: [
            "Enter the cut length on the PS-110 panel, for example 6,000 mm or 12,000 mm.",
            "Select the pipe size so that the PS-110 uses the right feed rate and clamp jaws.",
            "Cut the first pipe and measure its length with a steel tape.",
            "If the length deviates more than ±10 mm from the set length, correct the length offset on the panel and measure the next pipe.",
          ],
        },
        { kind: "heading", text: "4.3 During production", level: 2 },
        {
          kind: "list",
          items: [
            "The haul-off speed follows the line speed. Do not change the haul-off speed by hand during production.",
            "Check that the chip extraction of the PS-110 is running.",
            "Check the cut face of the pipe: it must be square and free of burrs.",
            "Burrs or a rough cut face indicate a blunt saw blade. Change the blade (section 5).",
          ],
        },
      ],
    },
    // ---- Page 6: blade change ----------------------------------------------
    {
      blocks: [
        { kind: "heading", text: "5 Changing the saw blade" },
        {
          kind: "warning",
          level: "DANGER",
          text:
            "Before changing the PS-110 saw blade, switch off and lock the main isolator, open the pneumatic dump valve on the HC-110, and verify with a try-start that the saw cannot start.",
        },
        {
          kind: "warning",
          level: "CAUTION",
          text:
            "Saw blade teeth are sharp. Wear cut-resistant gloves and hold the PS-110 saw blade only at its edge with the teeth pointing away from your body.",
        },
        {
          kind: "list",
          items: [
            "Wait until the blade has stopped and open the guard hood of the PS-110.",
            "Turn the carrier ring by hand until the blade flange is at the top.",
            "Lock the blade with the blade locking pin.",
            "Loosen the blade flange nut with the pin spanner. The flange nut has a left-hand thread.",
            "Remove the flange nut, the outer flange and the blade, and place them on a tray (see Fig. 2).",
            "Clean the inner and outer flange of chips.",
            "Check the new blade: the diameter, bore and number of teeth must match the data on the PS-110 rating plate, and the direction arrow on the blade must match the arrow on the carrier ring.",
            "Fit the new blade, the outer flange and the flange nut, and tighten the flange nut with the pin spanner.",
            "Remove the blade locking pin and turn the carrier ring by hand one full turn to check that the blade runs free.",
            "Close the guard hood, remove the lock, and make a test cut on a scrap pipe.",
          ],
        },
        {
          kind: "figure",
          key: "ext-mnt-man-0002/saw-blade-change",
          caption:
            "Fig. 2: PS-110 blade change. The blade is held at its edge in cut-resistant gloves; the flange nut and pin spanner are on the tray.",
        },
        {
          kind: "paragraph",
          text:
            "Use only Nordcut original saw blades of the type stated on the PS-110 rating plate. Blades of another diameter or tooth pitch overload the carrier ring drive and give a rough cut.",
        },
      ],
    },
    // ---- Page 7: maintenance and troubleshooting ---------------------------
    {
      blocks: [
        { kind: "heading", text: "6 Maintenance" },
        {
          kind: "table",
          rows: [
            ["Interval", "Task"],
            ["Every shift", "Test the interlocks (section 3); check the cut face; empty the chip container"],
            ["Weekly", "Check the track pads for wear and cuts; check the track chain tension; test the emergency stops"],
            ["Monthly", "Lubricate the saw carriage guides; check the clamp jaws; check the air filter regulator"],
            ["Every 6 months", "Check the carrier ring bearing; check the blade standstill monitor"],
          ],
        },
        { kind: "heading", text: "7 Troubleshooting" },
        {
          kind: "table",
          rows: [
            ["Fault", "Possible cause", "Remedy"],
            ["Pipe slips in the haul-off", "Track pressure too low, worn pads", "Increase the track pressure to the table value; replace worn pads"],
            ["Pipe is oval after the haul-off", "Track pressure too high", "Reduce the track pressure to the table value"],
            ["Cut length outside ±10 mm", "Length offset wrong, pipe slipping", "Correct the offset; check the track pressure"],
            ["Burrs or rough cut face", "Blunt blade, wrong blade type", "Change the blade (section 5)"],
            ["Saw does not start", "Guard hood open, clamp not closed, no air", "Close the hood; check the 6 bar supply"],
            ["Guard hood does not unlock", "Blade still running down, standstill monitor fault", "Wait; if the hood stays locked, call maintenance"],
          ],
        },
      ],
    },
  ],
}
