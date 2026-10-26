# Personas for Oppr Knowledge

Three people we test every function against: an Operator on the floor, an Engineer in the office, and an Admin who is also the quality lead. Each persona is built from customer quotes where we have them. Where we have none, the text says so.

The personas use the seeded plant **Pijpwerk Noord**, a plastic (PE) pipe extrusion plant with three Areas: Hall 1 Mixing, Hall 2 Extrusion and the Quality lab. When we test in the app, each persona checks in as the matching seeded person.

## How to read this

- **Sources.** Pocket quotes are cited by recording id and timestamp. Attio quotes are cited by call recording id. Slack quotes are cited by channel and timestamp. The full lists are in the finesse evidence files (`evidence-pocket.json`, `evidence-attio.json`, `evidence-slack.json`).
- **Speakers.** We name the speaker's role, not the person. Quotes stay in the original Dutch, with a short English gist after them.
- **Customer voice or Oppr voice.** Lines spoken by Oppr itself (pitch, internal meetings) are marked "Oppr view". They show our thinking, not demand.
- **Time budget.** The time budget is the most a first-time user of that persona should need, from the start page to the success criterion. It includes reading time. It does not include AI wait time beyond 10 seconds; anything longer is recorded as friction.
- **Words.** All function names follow CONTEXT.md.
- **Results.** Measured results per task and per function, with the verdicts they feed, are in [function-map.md](function-map.md).

---

## 1. Lotte, Operator on the floor

**Checks in as:** Lotte Smit, line operator on the early shift (new starter), Hall 2 Extrusion.

### Context

| | |
|---|---|
| Plant | Continuous process plant. Here: PE pipe extrusion, line 2 (extruder EXL-201, vacuum tank VAC-203, saw SAW-202, coiler CLR-204). Customer plants we talk to are similar: food, chemicals, water, packaging. |
| Shift | Early shift 06:00 to 14:00, in a five-shift rotation. Handover at 06:00 with the night operator. |
| Devices | A shared phone at the line (in a sleeve, often used with gloves, one hand free), and a shared screen in the line office. No own laptop. Wifi in the hall is patchy. |
| Pressure | Line must keep running; a stop costs output and scrap. She is new and still learning, so she leans on colleagues who are not always on her shift. Reading long text at the machine is not realistic. |
| Language | Dutch first. Uses floor words such as "rupsaftrek", "omstelling", "spoelen", not the words in the SOP. |

### Goals

1. Do the job right the first time, without waiting for the one colleague who knows.
2. Find the current instruction for this machine in seconds, standing at the machine.
3. Get a quick, trustworthy answer in her own words, and see where it comes from.
4. Prove she has learned the job, so she is allowed to run the line alone.

### Frustrations (with evidence)

- **Instructions do not reach the floor.** "We hebben wel werkinstructies. Maar die staan op de server of in ons digitale managementsysteem... Die komen als het ware niet op de werkvloer terecht." (customer representative, OmniPlus, Pocket 9d0a5b3a, 2026-06-18, 32:36). Gist: the instructions exist but never reach the floor.
- **Nobody opens the procedures.** "Volgens mij kijken ze er nooit naar." (prospect participant about operators and procedures, Attio recording 9f66fc48, 2026-09-16).
- **The computer is too far away.** "naar de computer lopen is een eind weg... als er dan een storing is geweest, dan kunnen ze gelijk inspreken hoe ze het opgelost hebben" (prospect, operations and maintenance, Attio recording 0c3e5e03, 2026-08-28). Gist: let operators speak in the fix right at the machine.
- **Typing with gloves.** "...operators nog met hun dikke vingers te doen... waar ze allemaal een hekel aan hebben." (prospect, Enpiro, Pocket fe5da37a, 2026-09-15, 27:12). Gist: large targets, little typing.
- **New, with little in her head yet.** "een groot aantal is nieuw bij de plant... er zit nog weinig in het hoofd van de operators" (prospect, plant leader, Attio recording a1114503, 2026-09-15).
- **Wants to just ask.** "Maar kan een operator ook... vragen stellen? Ik loop nu daar tegenaan." (prospect, Attio recording 6fa3780f, 2026-03-11).
- **Workarounds live in pockets.** "Ze werken vijf ploegendienst... ze hebben allemaal de boekjes in de zak" (prospect, Attio recording 0c3e5e03, 2026-08-28). Gist: each shift keeps its own notebook with its own settings.
- **Not a writer.** "Het moet heel laagdrempelig zijn. Het zijn geen schrijvers..." (executive director, Hoost, Pocket fbaa5997, 2026-06-16, 35:16).

### Tasks

| # | Task | Concrete situation | Start page | Success criterion | Time budget | Functions |
|---|---|---|---|---|---|---|
| O1 | Scan a machine and read the instruction in use | 06:20. Line 2 must change from black to blue pipe. Lotte stands at the extruder with gloves on and wants the changeover steps for this machine. | Phone app home `/m` (via Try it > Phone) | She has Scanned EXL-201 and is on the Published version of "Colour and product changeover on extrusion line 2" (EXT-OPS-SOP-0001), and can see that it is the version in use. | 30 s | phone-app, assets, doc-read |
| O2 | Ask a question in floor words | During the changeover she is unsure how to set the haul-off speed afterwards. She types, or says, "Hoe stel ik de rupsaftrek in na een omstelling?" | Phone Ask `/m/ask` | She gets an answer from Published Knowledge that names at least one source Document, and she can open that source in one tap. The floor word "rupsaftrek" is understood as Haul-off. The answer is about setting the haul-off, not about other steps of the changeover, and its main source is the plant's own SOP when one covers it (added after the outside review: speed alone is not success). | 45 s (excluding AI wait up to 10 s) | ask, plant-overview (Glossary), doc-read |
| O3 | Record how she fixed a problem | 11:40. The vacuum tank alarm fired; she cleaned the sensor and it stopped. She wants to record what she did so the next shift knows, without typing a report. | Phone Capture `/m/capture` | A Capture with at least one Entry (photo or voice note) is handed in and shows as handed in, under her name. | 120 s | captures, phone-app, check-in |
| O4 | Do her assigned Training on the shared screen | 13:30, after her shift work is done. Her Engineer assigned "Line 2 changeover". She checks in on the line office screen, finds it and does an Attempt. | Home `/` on the shared desktop | She is Checked in as Lotte, finds the assigned Training on her Home or in My learning, finishes an Attempt and sees a pass or fail result. Her Training record appears under Records. | 60 s to the first question; 600 s total | check-in, my-learning, take-training, training-records |
| O5 | Walk a Round on the floor | First week. Her shift lead asks her to walk the "Line 2 safety round": Scan each stop on line 2 and answer at each one. | Phone Round `/m/round` (or Floor simulator `/floor` on desktop) | She completes every stop of the Round in order, with a result at the end that counts as her proof. | 300 s (excluding walking) | rounds, floor-simulator, phone-app |

---

## 2. Sanne, Engineer in the office

**Checks in as:** Sanne Visser, process engineer. Author of most OPS Documents in the seed (reviewer: Mark Jansen, approver: Ingrid Hoekstra).

### Context

| | |
|---|---|
| Plant | Same plant. Responsible for the process on line 1 and line 2 and for the SOPs and work instructions that describe it. |
| Shift | Day work, 08:00 to 17:00, but called to the floor several times a day for stops and quality issues. |
| Devices | Laptop (1440 px wide screen) in the office, phone on the floor. Uses Ctrl+K and a mouse. |
| Pressure | Too many Documents to keep current alone. Veteran operators know more than the SOPs say. New operators arrive every few months and need training. Every change must be traceable for the next audit. |
| Language | Writes Documents in Dutch or English, thinks in Plant words and naming codes. |

### Goals

1. Get what experienced operators know out of their heads and into a Draft, without writing it all herself.
2. Keep Published Documents correct and consistent, and change them through a proper review.
3. Turn Published Documents into Trainings quickly, and get new operators trained.
4. Know where the Knowledge is weak: unused, unclear, contradicting or overdue.

### Frustrations (with evidence)

- **Knowledge sits in heads.** "ik denk inderdaad dat er heel veel kennis verloren staat... Er zit zoveel in de hoofden van een aantal goede en ervaren operators." (prospect, manufacturing manager, Attio recording daef1720, 2026-03-09).
- **Hard to get it out.** "...je krijgt gewoon slecht of moeilijk of moeizaam de ervaring van de operators... uit hun hoofd op papier, of in een werkinstructie." (executive director, Hoost, Pocket fbaa5997, 2026-06-16, 09:42).
- **The veteran and the newcomer.** "Bert die er 35 jaar werkt en die elke machine blind kent. Dat de gast van twintig die er een jaar werkt heeft dat niet." (prospect advisor, Attio recording 99afcaf7, 2026-08-04).
- **Capturing costs time.** "Alles wat je in het begin doet, is vastleggen. Dat kost tijd natuurlijk." (customer representative, OmniPlus, Pocket 9d0a5b3a, 2026-06-18, 38:56).
- **New people reinvent the wheel.** "...hoe communiceer het je daarna tegen operators die nieuw binnenkomen en dan weer het wiel moeten gaan uitvinden?" (Oppr view: the founder, Operator User Journeys meeting, Attio recording 9f66fc48, 2026-09-16, 58:12).
- **Turnover.** "Dus iedere drie maanden moet er iemand nieuw worden opgeleid." (executive director, Hoost, about a customer, Pocket fbaa5997, 2026-06-16, 08:51).
- **A change must stick.** "We hebben een SOP aangepast omdat we iets geleerd hebben... maar wie waarborgt dat?" (partner consultant, Attio recording 9f66fc48, 2026-09-16).
- **No dumping ground.** "...wat je wil voorkomen is dat het een vergaarbak wordt waar iedereen zijn eigen versie van de waarheid in kan zetten" (Oppr view, Navigation Wireframes Review, Pocket f19eeb58, 2026-10-15, 09:06).
- **Same round, same scan.** "...zeker weten dat ze allemaal hetzelfde rondje lopen, hetzelfde scannetje maken, fotootje maken, daar zie ik wel wat in." (prospect, Enpiro, Pocket fe5da37a, 2026-09-15, 27:52).

### Tasks

| # | Task | Concrete situation | Start page | Success criterion | Time budget | Functions |
|---|---|---|---|---|---|---|
| E1 | Turn floor Captures into a Draft | Monday 09:00. Over the weekend three Operators recorded how they clean the screen pack. Sanne wants to see how they differ and get one Draft work instruction out of it. | Captures `/library/captures` | She has opened the Capture set, seen the Variations side by side, and created a Draft Document from it. The Draft is not Published. | 240 s (excluding AI wait) | captures, capture-sets, doc-guided |
| E2 | Start a new version of an SOP and send it for review | The purge step in the changeover SOP turned out to be wrong. She finds the SOP, starts a new version, edits the step, marks it a Significant change and sends it for review. | Any page, using Search (Ctrl+K) | EXT-OPS-SOP-0001 has a new version in review, marked as a Significant change, with the reviewer named. The Published version is unchanged until approval. | 180 s | search, doc-read, doc-lifecycle |
| E3 | Resolve a Finding | The weekly Consistency check found that two Published Documents give a different screen pack temperature. She decides which is right and has the AI prepare a revision of the other. | Findings `/library/findings` | She has opened the Finding, read both passages, and either dismissed it with a reason or created a Proposed revision Draft for the wrong Document. | 150 s | findings, doc-insights, knowledge-health |
| E4 | Build a Training, assign it, sign off a try-out | Two new Operators start next week. She builds a Training on the changeover from the Published SOP with the AI, and assigns it to Lotte with a due date. Yesterday she also watched Fatima do a changeover after Fatima passed the Training, and now signs off that try-out. | Learn `/learn?tab=trainings` | A Training built from Published Documents has Learning objectives traceable to them and has been sent for sign-off (or is Published); Lotte has it assigned with a due date; Fatima's try-out is signed off and her Skill level shows qualified (level 2). | 420 s (excluding AI wait) | training-guided, trainings, assign-training, try-outs |
| E5 | Shape the Line 2 Wiki | The Line 2 Wiki misses a short section on what to do when the vacuum alarm fires. She adds a block from Published sources, checks it against Published and applies it. | Wikis `/wiki` | The new block is applied and visible to readers, and every claim in it passed Check against Published (or was turned into a Proposed revision). | 300 s (excluding AI wait) | wiki-find, wiki-read, wiki-shape |

---

## 3. Ingrid, Admin and quality lead

**Checks in as:** in the persona, Ingrid Hoekstra, quality manager and approver of most Documents. In the seed Ingrid is an Engineer; the only Admin is Ruud Kok (plant manager). **Assumption:** Admin-only tasks (A5 limits) are tested checked in as Ruud Kok; all other tasks as Ingrid. Since round 1 the check-in chip shows the role next to the name ("Ruud Kok · Admin"), the picker marks Admins, and an Admin gets an Admin group in the menu (AI cost and limits, People and roles), so the Admin's extra rights are visible outside Settings.

### Context

| | |
|---|---|
| Plant | Same plant. Owns ISO 9001 certification, document control, training evidence and the plant's settings in Oppr. Answers to the plant manager and to auditors. |
| Shift | Day work. Daily start-of-day meeting with shift leads at 08:30. Audits once or twice a year, plus customer audits. |
| Devices | Laptop in the office, phone when walking the floor or a Round herself. |
| Pressure | Audit findings, labour inspection after an incident ("who was trained on which version?"), staffing gaps on shifts, and a budget for any new tool. |
| Language | Dutch, ISO terms (7.5, controlled copy, record), short reports for management. |

### Goals

1. Know every morning whether each shift has people who are allowed to do each task.
2. Show audit-ready proof: who passed which Training, on which version, when.
3. Keep document control clean: right approver, versions, periodic reviews on time.
4. Approve and publish changes herself; people publish, never the AI.
5. Know what the AI costs and keep it under control.

### Frustrations (with evidence)

- **ISO is a burden.** "alle documenten moeten in orde zijn. De ISO 9001 moet in orde zijn en dat is eigenlijk gewoon heel kort gezegd even de bureaucratische last" (partner consultant describing this persona, Attio recording 9f66fc48, 2026-09-16).
- **The skill matrix is not enforced.** "heel veel training on the job... we hebben trainingsmodules en we hebben skill matrices... maar dat is allemaal redelijk vrijblijvend." (customer representative, OmniPlus, Pocket 9d0a5b3a, 2026-06-18, 33:21).
- **Team leaders drown in admin.** "teamleiders zitten veel achter de computer (administratieve last, uren controleren, personeelsplanning)" (Operations Engineering Specialist, Arla Foods, Attio note 4fc45479, 2026-10-15; call analysis, paraphrased).
- **Who signed this off.** "...afgetekend... door iemand met autoriteit" (Oppr view, Pocket f19eeb58, 2026-10-15, 14:15). "voor de live software moet alles auditbaar zijn." (Oppr view, Pocket cb47a902, 2026-09-10, 54:58).
- **Managers walk rounds too, and login blocks them.** "Ik wil samen met Marc gaan starten met de OPPR app om zelf ook de rondes te gaan lopen. Ik heb de app inmiddels geïnstalleerd op mijn telefoon, echter heb ik geen inloggegevens." (Manager Operations, Omniplast, Slack #20-dev, 2026-09-25, ts 1790329548.163389).
- **What will it cost.** "Kan je een beetje beschrijven hoe zo'n traject dan zou lopen qua tijd en ook wat ik aan kosten moet denken?" (prospect, plant leader, Attio recording a1114503, 2026-09-15). "Hoe ziet de abonnementsprijs er dan uit?" (prospect, Attio recording 0c3e5e03, 2026-08-28).
- **Data security.** "Hebben jullie ISO-certificaten met betrekking tot de beveiliging van de data?" (Operations Engineering Specialist, Arla Foods, Attio, 2026-10-15). No function covers this yet.
- **Evidence gap.** We found no direct customer ask for periodic review or a new skill matrix. Document control demand comes mostly from partners and from Oppr itself.

### Tasks

| # | Task | Concrete situation | Start page | Success criterion | Time budget | Functions |
|---|---|---|---|---|---|---|
| A1 | Answer "Who can run line 2 tonight?" | 08:25, before the shift lead meeting. Jan is sick for the night shift. She needs to know who else may run line 2 tonight, and why someone may not. | Home `/` | She names at least one person who meets the level for line 2 on the night shift, and for one person who does not, she sees which Skill is missing on their profile. | 60 s | home, coverage-questions, skill-matrix, person-skills |
| A2 | Approve, publish and print the SOP | Sanne's changeover SOP change (E2) is waiting for her approval. She reads the change, approves and publishes it, then gets a controlled PDF for the line binder. | Home `/` (what needs a decision) | The new version is Published by her (her name as approver), the old one is superseded, linked Trainings are flagged for re-training, and she has a PDF with the plant title page. | 180 s | home, doc-lifecycle, pdf-export |
| A3 | Prepare for an audit on clause 7.5 | The external auditor comes next week. She checks what ISO 9001 7.5 asks, which Documents are overdue for Periodic review, and confirms one that is still correct. | ISO 9001 view `/iso-9001` (also a tab under Documents) | She can say which 7.5 requirements Oppr covers, she has opened the list of Documents due for review, and one Document shows a new review date after she confirmed it. | 240 s | iso-9001, knowledge-health, periodic-review, doc-library |
| A4 | Show proof of training after an incident | A labour inspector asks who was trained on the line 2 changeover, on which version, and when. She needs Lotte's proof and the master list. | Learn `/learn?tab=records` | She shows Lotte's Training record for "Line 2 changeover" with date, version and result, and exports or prints the list of records. | 90 s | training-records, person-skills, doc-library (export master list) |
| A5 | Check AI cost and set a limit | The plant manager asks what the AI cost last month and whether it can run away. She looks up the 30-day cost, sees which feature costs most, exports it, and checks the kill switch and Wiki AI limits. | Developer `/dev` | She reads the 30-day total and the top feature by cost, has a CSV export, and can point to the kill switch and current limits (changes saved checked in as Admin). | 150 s | dev-overview, ai-usage, ai-prices-limits |

---

## Coverage of the functions

The 15 persona tasks touch 37 of the 56 functions. The functions the evidence ranks highest are each covered by at least one task:

| Evidence need (ranked) | Tasks |
|---|---|
| Transfer operator experience to new operators | O3, O4, E1, E4, E5 |
| Low-friction capture and use on a phone at the machine | O1, O2, O3, O5 |
| Instructions that reach the floor and stay current | O1, E2, E3, A2, A3 |
| Faster onboarding | O4, O5, E4, A1 |
| Trusted Q&A with sources, a human decides | O2, E3, E5, A2 |
| Document control and audit (ISO 9001 7.5) | E2, A2, A3, A4 |
| Skill matrix as competence evidence | A1, A4, E4 (try-out sign-off) |
| Pricing and AI cost | A5 |

**Not covered by a persona task, on purpose.** These are set-up, developer or showcase functions; they are walked through once in the function map instead:

- Set-up: settings-company-people, settings-documents, templates, settings-training-floor, skills-workspace, my-preferences.
- Authoring extras: doc-new, doc-import (Convert), wrapped-manual, ppe-icons, diagram-builder, image-library, wiki-guided, plant-propose.
- Developer: ai-models-jobs, mcp, embeddings-lab, analysis.
- Showcase: instructions (each function's tour is checked against its task instead).

Convert (doc-import) has indirect evidence ("papier en Excel op tablets naast SAP", Yara, second-hand, Slack #floris-cos draft 30) and is a candidate for a sixth Engineer task if the function map needs a measured result.

## Open points found while writing

- The baseline shows that Operators can open the Document editor (`/docs/:id/edit`), guided creation, and the Dismiss and Prepare a revision buttons on Findings. None of the Operator tasks need these. Since the document control pass, saving a Document, starting a new version and changing a review interval need a checked-in Engineer on the server, so Lotte can open the editor but cannot save. The other buttons should still be checked.
- No function covers structured breakdown (storing) reports, shift logging or data security evidence, although prospects raised all three. These are recorded as "no function yet" in the function map.

## Measured results and seed alignment (round 1, 26 Oct 2026)

| Task | Result after round 1 | Main friction left |
|---|---|---|
| O1 | PASS, 5.1 s, 3 taps | QR label holds a token, so iPhones cannot open the app from it (F1) |
| O2 | PARTIAL, 7.0 to 8.1 s, 4 taps (three fresh runs after outside review round 2; the earlier 4.9 s read an older answer, and round 2 saw about 15 s live) | First sentence now answers the haul-off question (3 of 3), 88 to 113 words; but the main source is the supplier manual, not the changeover SOP, and the SOP step is not retrieved; phone interface is English around a Dutch answer (CD3) |
| O3 | PASS, 8.6 s, 7 taps | Job comes before machine (P1) |
| O4 | PASS on a different Training, 42.7 s, 27 taps (first walk FAIL: no assigned Training could be started; after the standard checks her assigned Training is still Waiting, LD1 and LD2) | Assigned Trainings on hold after a change (LD2, P3); all steps shown at once (P10) |
| O5 | PASS, 61.3 s, 39 taps | Stand-in QR sheet label (P11) |
| E1 | PASS, 5.1 s, 2 clicks | none major |
| E2 | PASS, 15.5 s, 6 clicks | Significant change at submit is new and not yet clicked through in a browser |
| E3 | PASS, 3.2 s, 1 click | Dismiss takes no reason (P6) |
| E4 | PASS, 15.9 s, 9 clicks | Training build step skipped (already built) |
| E5 | PASS, 35.5 s, 14 clicks | Wiki budget line (P12) |
| A1 | PARTIAL, 0.9 s, 3 clicks | Nobody qualifies on any shift after a Significant change (LD1, LD2); Home now leads with the reason; no absence (P4) |
| A2 | PASS, 24.3 s, 5 clicks plus print (measured before round 1; needs a reseed to re-run) | Sign-off is a picked name (DC1) |
| A3 | PASS, 6.7 s, 7 clicks | none major |
| A4 | PARTIAL, 7.7 s, 5 clicks | Lotte has no passed record (true in the data). The walk missed the Master list button on Documents, which exports the list in one click (DC3 is shipped for CSV) |
| A5 | PASS, 3.9 s, 6 clicks | none major |

Engineer timings are machine times; the walk estimates human time at two to five times longer, still inside every budget.

**Where the seed differs from the task text** (P15, align before the next measured pass):

- **E1.** The seed already has a Capture set with a Draft made from it, so the task now opens that Draft instead of creating one.
- **E4.** Fatima is already at level 2 for the changeover after an earlier run; the task measures the sign-off path, not a new level.
- **O4.** Both Trainings assigned to Lotte are on hold after a Significant change, so she takes "Wall thickness measurement" instead of "Line 2 changeover". The seed should give her one assigned, startable Training.
- **A2.** EXT-MNT-SOP-0001 v2 is already Published in DEV; run `seedKnowledge:run` before the next pass.

