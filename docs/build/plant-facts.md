# Plant facts: Pijpwerk Noord (seed content source of truth)

Every seed document must agree with these facts. Documents disagree **only**
where a deliberate contradiction is listed at the bottom. Writers working in
parallel rely on this sheet, so do not invent a different number for anything
listed here. For anything not listed, invent plausible detail but keep it in
your own document and do not state it in a way that clashes with another
document's topic.

## Plant and product
- Pijpwerk Noord, a fictional Dutch plant making **PE100 pressure pipe** for
  drinking water and gas, 32 to 110 mm outside diameter, **SDR 11 and SDR 17**,
  to EN 12201 (water) / EN 1555 (gas). Water pipe is black with blue stripes;
  gas pipe is yellow.
- Shifts: early 06:00-14:00, late 14:00-22:00, night 22:00-06:00. A shift
  leader per shift; handover in the shift log.
- Halls: Hall 1 Mixing (MIX), Hall 2 Extrusion (EXT, line 2 is the line in
  scope), Quality lab (QCL) next to Hall 2.
- Line 2 flow: MXR-101 batch mixer -> DRY-102 granulate dryer -> EXL-201
  extruder -> VAC-203 vacuum calibration tank (with a spray cooling bath
  behind it) -> SAW-202 haul-off and planetary saw -> CLR-204 pipe coiler (for
  32-63 mm coils of 50 or 100 m) or the tipping table for 6 m / 12 m lengths.
  QCL-301 ultrasonic gauge in the Quality lab.

## Equipment and numbers
- **MXR-101** Vortex HM-500 high-speed batch mixer: max batch 250 kg; colour
  masterbatch dosing **2 kg per 100 kg** PE granulate unless the batch card says
  otherwise; mix **4 minutes**; lid interlock: the mixer will not start with
  the lid open; discharge into the line 2 hopper via the transfer pipe.
- **DRY-102** desiccant dryer: dry PE granulate at **80 °C for at least 4
  hours**, target dew point **-40 °C** or lower. (Nothing is stated about how
  long dried granulate may stay in the hopper: that is a deliberate gap people
  ask about.)
- **EXL-201** Krauss KX-60 single-screw extruder: 60 mm screw, 30 L/D.
  Set points for 110 mm SDR 11: feed zone 175 °C, zone 2 190 °C, zone 3
  200 °C, zone 4 205 °C, adapter 205 °C, die 210 °C. Normal screw speed 90-120
  rpm (range 20-220 rpm). Melt pressure normally 180-250 bar, **alarm at 320
  bar, absolute maximum 350 bar**. Supplier operating envelope: barrel **170-220
  °C**. After reaching set points from cold, **soak for 90 minutes** before
  turning the screw. Screen pack: three screens (40/80/40 mesh) on a breaker
  plate; change at every product change and at least every **500 operating
  hours**, or when melt pressure rises **more than 30 bar** above the baseline
  for that product. The die and barrel stay **above 150 °C** during a
  changeover.
- Purge compound **PX-4400** at **190 °C**, about **15 minutes** until the melt
  runs clean (EXT-OPS-SOP-0001 v1). Never write PX-9917 in a Published edition.
- **VAC-203** vacuum calibration tank: vacuum **-0.3 bar** (acceptable -0.2 to
  -0.4 bar), cooling water **15-20 °C**, water level up to the upper sight-glass
  mark, sizing sleeve matched to the OD, check that all spray nozzles run.
- **SAW-202** Nordcut HC-110 caterpillar haul-off and PS-110 planetary saw:
  haul-off speed follows line speed; cut length 6 m or 12 m (±10 mm); saw
  guard interlocked. Never write BL-7730 in a Published edition.
- **CLR-204** pipe coiler: coils 32-63 mm pipe in 50 m or 100 m coils; coil
  tension low; strap each coil in 4 places; label with product, batch and
  length.
- **QCL-301** Sonatek UT-200 ultrasonic thickness gauge: two-point calibration
  on the step block (supplied, 3 mm and 12 mm steps), couplant gel.
  Measurement: **8 points** evenly around the circumference at each end.
  Frequency: the first 10 pipes after start-up or changeover, then every **2
  hours** per line.
- Tolerances (EN 12201, used by QCL-QA-SOP-0001):

  | OD and SDR | OD min-max (mm) | Wall min-max (mm) |
  |---|---|---|
  | 32 SDR 11 | 32.0-32.3 | 3.0-3.4 |
  | 63 SDR 11 | 63.0-63.4 | 5.8-6.5 |
  | 110 SDR 11 | 110.0-110.7 | 10.0-11.1 |
  | 110 SDR 17 | 110.0-110.7 | 6.6-7.4 |

- Non-conforming pipe: red **QUARANTINE** label, NC report in the QC log, kept
  in the quarantine bay next to the Quality lab; **only the quality manager**
  releases or scraps it.

## Safety
- LOTO on line 2: main isolator of line 2 in panel **MCC-2**; personal red lock
  and tag; release stored energy with the pneumatic dump valve on the haul-off;
  try-start to verify; only the person who placed a lock removes it. "Never
  reach into the haul-off or saw area while the line is only stopped. A stopped
  line can restart."
- Hot work at the die: heat-resistant gloves (EN 407), face shield, long
  sleeves; die and barrel above 150 °C; never stand in front of the die when
  the screw starts.
- Burns from hot melt: cool with lukewarm running water for **20 minutes**; do
  not pull off plastic stuck to the skin; call the first aider (extension
  **2222**) and report every burn.
- Dust and masterbatch: dust mask (FFP2) when emptying bags, local extraction
  on, no compressed air for cleaning.
- Hearing protection in Hall 2 (above 85 dB(A)).

## People and roles used in documents
- Shift leader, line operator, mixing operator, quality lab technician,
  process engineer (Sanne Visser), maintenance and safety engineer (Mark
  Jansen), quality manager (Ingrid Hoekstra), plant manager (Ruud Kok).
  Documents name roles, not people.

## Deliberate contradictions and duplicate (for the Consistency check)
1. Die bolts: EXT-OPS-SOP-0001 says crosswise to **40 Nm**; the Krauss manual
   EXT-MNT-MAN-0001 says cross pattern to **45 Nm** at operating temperature.
2. Barrel temperature: EXT-OPS-SOP-0002 says "never above **230 °C**"; the
   Krauss manual says operating envelope **170-220 °C** (maximum 220 °C).
3. Gauge calibration: QCL-QA-SOP-0001 says calibrate the UT-200 **once a day**;
   the Sonatek manual QCL-QA-MAN-0001 says **at the start of every shift**.
4. Duplicate: EXT-OPS-SOP-0002 has a section "Setting up the vacuum tank" that
   repeats the steps of EXT-OPS-WI-0002 nearly word for word.
No other contradictions: if two documents mention the same thing, use the same
number.
