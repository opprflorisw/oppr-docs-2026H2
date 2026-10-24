// Wrapped supplier manual: Krauss KX-60 single-screw extruder (EXL-201).
// Fixture sentences (die bolts 45 Nm, bolt replacement, breaker plate
// cleaning) and the 170-220 °C / 350 bar envelope are test fixtures: keep
// them verbatim (docs/test-set.md, docs/build/plant-facts.md).
import type { SupplierManual } from "../builders"

export const manual: SupplierManual = {
  code: "EXT-MNT-MAN-0001",
  title: "Krauss KX-60 single-screw extruder: operating and maintenance manual",
  area: "EXT",
  discipline: "MNT",
  supplier: "Krauss Extrusionstechnik GmbH",
  supplierDocNumber: "KX60-BA-EN-0412",
  supplierRevision: "Rev. 04 (2022-03)",
  model: "KX-60",
  publishedDaysAgo: 345,
  nextReviewInDays: 20,
  assets: ["EXL-201"],
  images: [
    {
      key: "ext-mnt-man-0001/extruder-overview",
      prompt:
        "side view of a single-screw plastics pipe extruder on a steel base frame: electric drive motor and gearbox at the rear, feed throat with material hopper on top, long horizontal barrel wrapped in ceramic heater bands with cooling fans underneath, breaker plate clamp ring and adapter at the front, round pipe die head at the far front end, cutaway section of the barrel showing the screw flights inside",
    },
    {
      key: "ext-mnt-man-0001/die-bolt-pattern",
      prompt:
        "front view of the flange of a round pipe extrusion die head with eight bolts evenly spaced on a bolt circle, numbered tightening order shown only by curved arrows crossing from each bolt to the opposite bolt in a star pattern, a torque wrench engaged on one bolt held by a hand in a heat-resistant glove",
    },
    {
      key: "ext-mnt-man-0001/breaker-plate-screen-pack",
      prompt:
        "exploded view of an extruder breaker plate assembly: a thick round steel breaker plate perforated with many small holes, three circular wire mesh screens of different fineness stacked in front of it, a hinged clamp ring with a swing bolt, the end of the extruder barrel on one side and the adapter flange on the other side, brass scraper and brass wire brush lying next to the parts",
    },
  ],
  pages: [
    // ---- Page 2: About this manual, safety -----------------------------------
    {
      blocks: [
        { kind: "heading", text: "1 About this manual" },
        {
          kind: "paragraph",
          text:
            "This manual describes the safe installation, operation and maintenance of the Krauss KX-60 single-screw extruder. The KX-60 is designed for the extrusion of polyolefin pipe, in particular PE80 and PE100 pressure pipe, with a downstream pipe die, vacuum calibration and haul-off supplied by others.",
        },
        {
          kind: "paragraph",
          text:
            "Read this manual completely before working on the KX-60 extruder. Keep the manual at the machine and make it available to every operator, setter and maintenance technician. Krauss Extrusionstechnik GmbH accepts no liability for damage caused by not following the instructions in this manual.",
        },
        {
          kind: "paragraph",
          text:
            "Safety messages in this manual use the signal words DANGER, WARNING, CAUTION and NOTE. DANGER marks a hazard that will cause death or serious injury. WARNING marks a hazard that can cause death or serious injury. CAUTION marks a hazard that can cause minor injury or damage to the machine. NOTE gives information for correct use of the KX-60.",
        },
        { kind: "heading", text: "2 Safety instructions" },
        { kind: "heading", text: "2.1 Intended use", level: 2 },
        {
          kind: "paragraph",
          text:
            "The KX-60 extruder is intended only for melting and conveying thermoplastic granulate within the operating envelope given in section 3.3. Processing PVC or other materials that release corrosive gases is not permitted without a written release from Krauss. Any change to the screw, barrel, heating or control system requires a written release from Krauss.",
        },
        { kind: "heading", text: "2.2 Qualified personnel", level: 2 },
        {
          kind: "paragraph",
          text:
            "Only trained and authorised persons may operate the KX-60 extruder. Work on the electrical equipment of the KX-60 may only be done by a qualified electrician. Work on the die, adapter and breaker plate may only be done by persons trained in working at hot extrusion tooling.",
        },
        {
          kind: "warning",
          level: "DANGER",
          text:
            "Hazardous voltage in the control cabinet and at the heater band terminals. Before opening the control cabinet or removing a heater band cover, switch off the main isolator, lock it in the off position and verify that the KX-60 is de-energised.",
        },
        {
          kind: "warning",
          level: "WARNING",
          text:
            "Rotating screw. Never put a hand, tool or rod into the feed throat of the KX-60 while the drive is switched on. A stationary screw can start at any time from the control panel or from the line control.",
        },
      ],
    },
    // ---- Page 3: residual hazards, PPE -------------------------------------
    {
      blocks: [
        { kind: "heading", text: "2.3 Residual hazards", level: 2 },
        {
          kind: "paragraph",
          text:
            "The KX-60 extruder is built to the state of the art. The following residual hazards remain and must be controlled by the operating company through instructions, training and personal protective equipment.",
        },
        {
          kind: "table",
          rows: [
            ["Hazard", "Where", "Protective measure"],
            ["Burns from hot surfaces (up to 220 °C)", "Barrel, heater bands, adapter, die, breaker plate", "Heat-resistant gloves, long sleeves, keep guards closed"],
            ["Burns from molten plastic", "Die outlet, breaker plate, purge material", "Face shield, heat-resistant gloves, never stand in front of the die when the screw starts"],
            ["Ejection of melt under pressure", "Adapter, breaker plate, die flange", "Never loosen a clamp or bolt while the screw turns or while melt pressure is shown"],
            ["Entanglement", "Feed throat, drive coupling", "Coupling guard fitted, feed throat cover in place"],
            ["Electric shock", "Control cabinet, heater terminals", "Lockout before work, covers fitted"],
            ["Fumes from overheated or degraded material", "Die outlet, purge area", "Local extraction, stay within the operating envelope"],
          ],
        },
        {
          kind: "warning",
          level: "WARNING",
          text:
            "Melt under pressure. The melt in the barrel, adapter and die can remain under pressure after the screw has stopped. Read the melt pressure display before loosening the breaker plate clamp ring or the die bolts. The melt pressure must read 0 bar before any clamp or bolt is loosened.",
        },
        {
          kind: "warning",
          level: "WARNING",
          text:
            "Never stand in front of the die when the screw of the KX-60 starts. Trapped gas or degraded material can be ejected from the die outlet with force when the screw starts.",
        },
        { kind: "heading", text: "2.4 Personal protective equipment", level: 2 },
        {
          kind: "list",
          items: [
            "Heat-resistant gloves to EN 407 for all work on the die, adapter, breaker plate and purge material.",
            "Face shield for all work at the die outlet and for purging.",
            "Long-sleeved, flame-retardant work clothing.",
            "Safety shoes.",
            "Hearing protection according to the site rules for the extrusion hall.",
          ],
        },
        { kind: "heading", text: "2.5 First aid for burns", level: 2 },
        {
          kind: "paragraph",
          text:
            "Cool a burn from hot melt with lukewarm running water for 20 minutes. Do not pull off plastic that sticks to the skin. Call the site first aider and report every burn.",
        },
      ],
    },
    // ---- Page 4: description -----------------------------------------------
    {
      blocks: [
        { kind: "heading", text: "3 Machine description" },
        { kind: "heading", text: "3.1 Overview", level: 2 },
        {
          kind: "paragraph",
          text:
            "The KX-60 is a single-screw extruder with a 60 mm screw and a processing length of 30 L/D. Granulate enters through the water-cooled feed throat, is melted and homogenised by the screw in the heated barrel, passes the screen pack and breaker plate, and leaves through the adapter into the pipe die (see Fig. 1).",
        },
        {
          kind: "figure",
          key: "ext-mnt-man-0001/extruder-overview",
          caption:
            "Fig. 1: KX-60 extruder, side view. Drive motor and gearbox at the rear, feed throat and hopper, heated barrel with cooling fans, breaker plate clamp ring, adapter and pipe die at the front.",
        },
        { kind: "heading", text: "3.2 Main components", level: 2 },
        {
          kind: "list",
          items: [
            "Drive: AC motor with frequency converter and helical gearbox with integrated thrust bearing.",
            "Feed throat: water-cooled, with a sight hole and a cover over the screw flight.",
            "Barrel: nitrided steel barrel with a grooved feed section and four heating and cooling zones (zones 1 to 4), each with ceramic heater bands and a cooling fan.",
            "Screw: 60 mm barrier screw, 30 L/D, with a mixing section at the screw tip.",
            "Breaker plate and screen pack: held between barrel flange and adapter by a hinged clamp ring (see section 7).",
            "Adapter and die: separately heated zones; the pipe die is supplied by others.",
            "Melt pressure transducer and melt thermocouple in the adapter, before the die.",
            "Control panel with temperature controllers, screw speed, drive load and melt pressure display.",
          ],
        },
      ],
    },
    // ---- Page 5: technical data --------------------------------------------
    {
      blocks: [
        { kind: "heading", text: "3.3 Technical data and operating envelope", level: 2 },
        {
          kind: "paragraph",
          text:
            "Operate the KX-60 extruder only within the operating envelope in the table below. Operation outside the operating envelope voids the Krauss warranty and can damage the screw, barrel and heaters or degrade the material.",
        },
        {
          kind: "table",
          rows: [
            ["Parameter", "Value"],
            ["Screw diameter", "60 mm"],
            ["Processing length", "30 L/D"],
            ["Screw speed", "20 to 220 rpm"],
            ["Barrel temperature (operating envelope)", "170 °C minimum, 220 °C maximum"],
            ["Melt pressure, absolute maximum", "350 bar"],
            ["Recommended high melt pressure alarm", "320 bar"],
            ["Heating and cooling zones on the barrel", "4"],
            ["Separately heated zones after the barrel", "Adapter, die (2 zones or more)"],
            ["Screen pack", "3 screens, 40 / 80 / 40 mesh, on the breaker plate"],
            ["Feed throat cooling water", "At least 4 L/min, clean mains or process water"],
            ["Drive motor", "55 kW, frequency-controlled"],
            ["Output with PE100 (depending on die and screw speed)", "up to 220 kg/h"],
            ["Machine weight without die", "approx. 3,200 kg"],
          ],
        },
        {
          kind: "warning",
          level: "CAUTION",
          text:
            "The barrel temperature of the KX-60 must stay between 170 °C and 220 °C during production. Above 220 °C, PE100 starts to degrade and the heater bands and thermocouples are overloaded. Below 170 °C, the screw can be overloaded by unmelted material.",
        },
        {
          kind: "warning",
          level: "WARNING",
          text:
            "The melt pressure of the KX-60 must never exceed 350 bar. Set the high melt pressure alarm to 320 bar and the automatic screw stop to 350 bar. A rupture disc in the adapter protects the extruder above 350 bar; a burst rupture disc must be replaced before restarting.",
        },
        {
          kind: "paragraph",
          text:
            "Typical temperature set points depend on the material grade, pipe size and die. The material supplier's data sheet and the operating company's set point sheet take priority, provided they stay within the operating envelope above.",
        },
      ],
    },
    // ---- Page 6: installation of the die -----------------------------------
    {
      blocks: [
        { kind: "heading", text: "4 Installation of the die" },
        { kind: "heading", text: "4.1 Before mounting", level: 2 },
        {
          kind: "list",
          items: [
            "Check that the die flange faces and the adapter flange face are clean, flat and free of melt residue and scratches.",
            "Check that the centring spigot of the die fits the adapter without force.",
            "Check every die bolt for thread damage, stretching or wear before use.",
            "Apply high-temperature anti-seize paste to the threads and under the heads of the die bolts.",
            "Heat the adapter to its set point before the die is mounted.",
          ],
        },
        { kind: "heading", text: "4.2 Lifting the die", level: 2 },
        {
          kind: "warning",
          level: "WARNING",
          text:
            "Suspended load. Lift the pipe die only with lifting gear rated for the die weight, using the lifting eyes on the die body. Never stand under a suspended die.",
        },
        { kind: "heading", text: "4.3 Mounting the die", level: 2 },
        {
          kind: "list",
          items: [
            "Bring the die to the adapter and engage the centring spigot.",
            "Fit all die bolts and tighten them by hand until the die flange lies flat against the adapter.",
            "Heat the die and the adapter to operating temperature and allow the temperatures to stabilise.",
            "Tighten the die bolts with a calibrated torque wrench in the order shown in Fig. 2.",
          ],
        },
        {
          kind: "paragraph",
          text: "Tighten the die bolts in a cross pattern to 45 Nm with the die at operating temperature.",
        },
        {
          kind: "figure",
          key: "ext-mnt-man-0001/die-bolt-pattern",
          caption:
            "Fig. 2: Cross pattern for tightening the die bolts on the KX-60 die flange. Each bolt is followed by the bolt opposite to it.",
        },
        {
          kind: "paragraph",
          text: "Replace the die bolts after 20 die changes or when the thread shows wear.",
        },
        {
          kind: "warning",
          level: "CAUTION",
          text:
            "Die bolts tightened on a cold die lose their pre-load when the die heats up, and melt can leak at the die flange. Always do the final tightening of the die bolts with the die at operating temperature.",
        },
      ],
    },
    // ---- Page 7: start-up and operation ------------------------------------
    {
      blocks: [
        { kind: "heading", text: "5 Start-up" },
        { kind: "heading", text: "5.1 Start-up from cold", level: 2 },
        {
          kind: "list",
          items: [
            "Switch on the feed throat cooling water and check the flow.",
            "Switch on the heating of all barrel zones, the adapter and the die.",
            "Wait until every zone of the KX-60 has reached its set point.",
            "Soak the extruder for 90 minutes after all zones have reached their set points, before the screw is turned.",
            "Check that the melt pressure display reads 0 bar and that no alarm is active.",
            "Open the material slide in the feed throat.",
            "Start the screw at low speed and stand to the side of the die, never in front of the die.",
            "Increase the screw speed in steps while watching the melt pressure and the drive load.",
          ],
        },
        {
          kind: "warning",
          level: "WARNING",
          text:
            "Never turn the screw of the KX-60 before the 90-minute soak time has passed. Turning the screw in partly solid material can break the screw or the thrust bearing and can cause a sudden melt pressure peak.",
        },
        { kind: "heading", text: "5.2 Start-up from warm", level: 2 },
        {
          kind: "paragraph",
          text:
            "If the barrel, adapter and die of the KX-60 were held above 150 °C during a stop, for example during a product change, the 90-minute soak is not needed. Start the screw only when every zone has reached its set point again.",
        },
        { kind: "heading", text: "6 Operation" },
        {
          kind: "list",
          items: [
            "Normal melt pressure for PE pipe on the KX-60 is 180 to 250 bar, depending on the die and the throughput.",
            "Normal screw speed during production is 90 to 120 rpm. The permitted range is 20 to 220 rpm.",
            "Record the melt pressure after every screen pack change as the baseline for that product.",
            "Change the screen pack when the melt pressure rises more than 30 bar above the baseline for the product.",
            "During a product or colour change, keep the die and barrel above 150 °C so that the melt in the die stays soft.",
            "Purge the KX-60 with a commercial purge compound according to the purge compound supplier's instructions, within the operating envelope.",
          ],
        },
        {
          kind: "warning",
          level: "NOTE",
          text:
            "A slow, steady rise of the melt pressure at constant screw speed and temperature usually means a blocked screen pack. A sudden rise usually means a blockage in the die or a cold zone.",
        },
      ],
    },
    // ---- Page 8: screen pack and breaker plate -----------------------------
    {
      blocks: [
        { kind: "heading", text: "7 Screen pack and breaker plate" },
        {
          kind: "paragraph",
          text:
            "The KX-60 breaker plate carries a screen pack of three screens (40 / 80 / 40 mesh). The screen pack filters contamination from the melt and builds back pressure for good mixing. The breaker plate is held between the barrel flange and the adapter by a hinged clamp ring with a swing bolt (see Fig. 3).",
        },
        {
          kind: "paragraph",
          text: "Clean the breaker plate and screen pack at every product change and at least every 500 operating hours.",
        },
        {
          kind: "figure",
          key: "ext-mnt-man-0001/breaker-plate-screen-pack",
          caption:
            "Fig. 3: KX-60 breaker plate assembly, exploded view. Barrel flange, screen pack of three screens, perforated breaker plate, hinged clamp ring and adapter flange.",
        },
        { kind: "heading", text: "7.1 Removing the breaker plate", level: 2 },
        {
          kind: "warning",
          level: "WARNING",
          text:
            "Hot melt and hot metal. Remove the KX-60 breaker plate only with the screw stopped, the melt pressure at 0 bar, the drive locked out and while wearing heat-resistant gloves, a face shield and long sleeves.",
        },
        {
          kind: "list",
          items: [
            "Keep the barrel and adapter heated above 150 °C so the melt at the breaker plate stays soft.",
            "Stop the screw, lock out the drive and check that the melt pressure reads 0 bar.",
            "Loosen the swing bolt and open the clamp ring.",
            "Swing the adapter away or pull the breaker plate out with the Krauss extraction hook.",
            "Remove the screen pack and dispose of the used screens.",
          ],
        },
        { kind: "heading", text: "7.2 Cleaning and refitting", level: 2 },
        {
          kind: "list",
          items: [
            "Scrape the melt from the breaker plate while hot, using only brass tools. Steel tools damage the sealing faces.",
            "Clean the holes of the breaker plate with a brass wire brush, or in a burn-off oven at a maximum of 450 °C.",
            "Check the breaker plate for cracks and for damaged sealing faces. Replace a cracked breaker plate.",
            "Insert a new screen pack in the order 40, 80, 40 mesh with the screens flat and centred.",
            "Refit the breaker plate, close the clamp ring and tighten the swing bolt.",
            "Start the screw at low speed, check the clamp ring for leakage and record the new melt pressure baseline.",
          ],
        },
      ],
    },
    // ---- Page 9: maintenance schedule --------------------------------------
    {
      blocks: [
        { kind: "heading", text: "8 Maintenance" },
        {
          kind: "paragraph",
          text:
            "Carry out the maintenance of the KX-60 extruder at the intervals in the table below. Operating hours are counted by the hour meter on the control panel. Record every maintenance task in the machine log of the operating company.",
        },
        {
          kind: "warning",
          level: "DANGER",
          text:
            "Before any maintenance on the KX-60 drive, coupling, feed throat or electrical equipment, switch off the main isolator, lock it, and verify with a try-start that the extruder cannot start.",
        },
        {
          kind: "table",
          rows: [
            ["Interval", "Task", "By"],
            ["Every shift", "Check feed throat cooling water flow; check melt pressure and drive load against normal values", "Operator"],
            ["Every shift", "Check heater zones for deviations from the set point of more than 5 °C", "Operator"],
            ["Every product change", "Clean the breaker plate and fit a new screen pack", "Operator / setter"],
            ["Every 500 operating hours", "Clean the breaker plate and fit a new screen pack, if not done at a product change", "Operator / setter"],
            ["Weekly", "Check the heater band terminals and cooling fans; clean the fan inlets", "Maintenance"],
            ["Every 20 die changes", "Replace the die bolts", "Maintenance"],
            ["Every 2,000 operating hours", "Check the gearbox oil level and look for leaks", "Maintenance"],
            ["Every 4,000 operating hours", "Change the gearbox oil (ISO VG 320)", "Maintenance"],
            ["Yearly", "Check the melt pressure transducer zero and span; inspect the rupture disc", "Maintenance"],
            ["Every 8,000 operating hours", "Measure screw and barrel wear; compare with the values in the acceptance record", "Maintenance / Krauss service"],
          ],
        },
        {
          kind: "warning",
          level: "NOTE",
          text:
            "The melt pressure transducer of the KX-60 must be removed only with the adapter at operating temperature. Removing a cold transducer can tear off the diaphragm.",
        },
      ],
    },
    // ---- Page 10: troubleshooting ------------------------------------------
    {
      blocks: [
        { kind: "heading", text: "9 Troubleshooting" },
        {
          kind: "paragraph",
          text:
            "The table lists common faults of the KX-60 extruder. If a fault cannot be cleared with the action given, stop the extruder and contact Krauss service.",
        },
        {
          kind: "table",
          rows: [
            ["Fault", "Possible cause", "Remedy"],
            ["Melt pressure rises slowly at constant settings", "Screen pack blocked", "Change the screen pack and clean the breaker plate (section 7)"],
            ["Melt pressure alarm at 320 bar", "Screen pack blocked, cold zone, die blocked", "Reduce the screw speed; check all zone temperatures; change the screen pack"],
            ["Screw stops at 350 bar", "Blockage or cold start", "Do not restart; find the cause; check the rupture disc"],
            ["Screw will not start", "Soak time not finished, zone below set point, interlock open", "Wait for the soak time; check zone temperatures and guards"],
            ["Melt leaks at the die flange", "Die bolts not tightened hot, damaged flange face", "Re-tighten the die bolts at operating temperature (section 4.3); inspect the flange"],
            ["Melt leaks at the clamp ring", "Screen pack not centred, damaged sealing face", "Refit the breaker plate; inspect the sealing faces"],
            ["Black specks in the pipe", "Degraded material, dirty breaker plate", "Check temperatures against the envelope; purge; clean the breaker plate"],
            ["Zone does not reach the set point", "Heater band or thermocouple defective", "Check the heater band current and the thermocouple"],
            ["Output drops at constant screw speed", "Feed throat too warm, bridging in the hopper", "Check the feed throat cooling water; check the material flow"],
            ["High drive load", "Barrel temperature too low, worn screw", "Check zone temperatures; measure screw wear"],
          ],
        },
      ],
    },
    // ---- Page 11: spare parts ----------------------------------------------
    {
      blocks: [
        { kind: "heading", text: "10 Spare parts" },
        {
          kind: "paragraph",
          text:
            "Use only original Krauss spare parts for the KX-60 extruder. When ordering, state the machine serial number from the rating plate, the part number and the quantity.",
        },
        {
          kind: "table",
          rows: [
            ["Part number", "Description", "Recommended stock"],
            ["KX60-210-015", "Die bolt set, high-temperature steel", "2 sets"],
            ["KX60-310-040", "Screen pack set, 40 / 80 / 40 mesh (10 packs)", "5 sets"],
            ["KX60-310-002", "Breaker plate", "1"],
            ["KX60-310-008", "Clamp ring swing bolt with nut", "1"],
            ["KX60-420-110", "Ceramic heater band, barrel zone", "2"],
            ["KX60-420-210", "Thermocouple type J, barrel zone", "2"],
            ["KX60-430-005", "Melt pressure transducer, 0 to 500 bar", "1"],
            ["KX60-430-007", "Rupture disc, 350 bar", "2"],
            ["KX60-510-020", "Cooling fan, barrel zone", "1"],
            ["KX60-610-001", "Gearbox oil ISO VG 320, 20 L", "1"],
          ],
        },
        {
          kind: "paragraph",
          text:
            "Krauss service can be reached through the Krauss after-sales department. Have the machine serial number and the operating hours ready when calling.",
        },
      ],
    },
  ],
}
