# Function map: Oppr Knowledge

One page to decide what ships first. Every function in the showcase (55), with its job, how mature it is, how it did when our personas used it, what customers said about the need behind it, what its AI costs, what it needs, and a verdict.

Built on 26 Oct 2026, corrected the same day after two outside reviews (rounds 1 and 2), from: the function inventory (`functions.json`, code is the truth), the persona walks (Playwright, 1440 x 900 desk and 390 x 844 phone) before and after polish round 1, the four lens passes (frontline UX, document control, L&D, content design), customer evidence from Pocket, Attio and Slack (read-only), and AI usage rows from Convex DEV. Personas and their tasks are in [personas.md](personas.md).

---

## Summary

**The decision in one paragraph.** Sell the floor loop first: a way for Operators to hand back how they really fixed something, the right instruction at the machine, and an answer in floor words with its source. That is slice 1 and it stands on its own: document control, Scan, Ask and Capture on one set of Published Documents. Said plainly: the first sale is the slice 1 bundle, not three loose functions, because Scan, Ask and Capture only work on top of controlled, Published Documents. The smallest version of it that can be sold alone is named below (minimum sellable core). Slice 2 proves who may do the work (Trainings, Rounds, Skill matrix, records) and needs only slice 1. Slice 3 keeps the knowledge alive and consistent (Wikis, Findings, Knowledge health, Proposed revisions) and also needs only slice 1. The Floor simulator and the Developer tools stay as showcase or internal tooling; two lab pages are proposed for removal from the customer build.

**The 3 functions most likely to sell first**

Each "function" here is a small bundle of functions from the table below, and each needs the slice 1 document control under it. **The rank follows evidence strength** (how many organisations, how direct). It is not the build order: all three sit on the same core, so by dependency they ship together, and in a demo Scan comes first because it is the quickest to show. Quote tags: *direct* (a customer, prospect or partner said it to us), *relayed* (someone told us what others say), *paraphrased* (a call note, not a transcript), *Oppr* (our own view), *market* (second-hand or competitor). "Companies" counts distinct customer, prospect or partner organisations behind the need, named where the source names them.

| # | Function (bundle) | Companies | Why, from evidence | Persona result | Ship gates | AI cost per use |
|---|---|---|---|---|---|---|
| 1 | **Captures from the floor** (phone, voice and photo, turned into a Draft) | 5 or 6: Hoost Group, Enpiro, three unnamed prospects (C13, C14, C18), one advisor (C15) | The strongest need in every source is getting veteran know-how out of heads (C5 Hoost, C13, C14, C15, all direct), by people who "zijn geen schrijvers" (Hoost, C6, direct), with "dikke vingers" (Enpiro, C10, direct), without "naar de computer lopen" (C18, direct). It needs the Draft and review path of slice 1 to become Knowledge. | O3 PASS, 8.6 s, 7 taps (budget 120 s); E1 PASS, 5.1 s | DC1 (who handed it in is a picked name) | about $0.014 per Capture |
| 2 | **Scan to the instruction in use** (Phone app + Assets and QR + Read a Document) | 3 or 4: OmniPlus, Omniplast, one unnamed prospect (operations and maintenance), possibly one more (C17, speaker not labelled) | "Die komen als het ware niet op de werkvloer terecht" (OmniPlus, C1, direct). "ze hebben allemaal de boekjes in de zak" per shift (C19, direct). "Volgens mij kijken ze er nooit naar" (C17, direct, speaker not labelled in the recording). A customer manager installed the phone app to walk rounds himself (Omniplast, C29, direct; it is about rounds more than instructions). Against it: the same OmniPlus call says "werkinstructie leeft eigenlijk niet bij ons" (C2, direct): the instructions exist but nobody misses them, so this need has to be shown, not assumed. On a desk it can only be shown through the Floor simulator. | O1 PASS, 5.1 s, 3 taps (budget 30 s); since round 2 the phone reader opens at step 1 under the PPE strip | **F1** (the QR label holds a token, not a link, so an iPhone camera cannot open it) and **DC1** | none |
| 3 | **Ask** (desk and phone, with sources) | 2: one unnamed prospect (C20) and one partner consultant (C21) | "Maar kan een operator ook... vragen stellen? Ik loop nu daar tegenaan." (prospect, C20, direct). "ik wil iets in de manual opzoeken" (partner, C21, direct). A competitor sells the same promise (Relay, S32, market). That answers must show what is validated is our own view (V3, V4, Oppr), which Ask meets by answering only from Published Documents. This is the thinnest of the three: one prospect and one partner, and the weakest demo (see Ask). | O2 PARTIAL after round 2: 7.0 to 8.1 s, 4 taps, first sentence on the haul-off in 3 of 3 runs, 88 to 113 words; it still cites the supplier manual, not the SOP step (see Ask) | CD3 (Dutch answer in an English interface) | about $0.0013 per question |

**How strong this is, honestly.** The ranking rests on about ten organisations in total, mostly first calls, and no signed customer. Need #1 is the best supported; #2 has direct quotes from two named companies and one direct counter-signal (C2); #3 rests on one prospect and one partner. Earlier drafts ranked Scan first and Captures third, which did not follow this evidence; round 2 re-ranked by evidence. No source asked for Wikis, the Consistency check or periodic review directly (see Evidence gaps). Treat the top 3 as the best bet from thin evidence, to be tested with the Less or More operator interviews.

**Minimum sellable core of slice 1.** The smallest set a plant can buy and use on one line, as the start-small ask suggests ("een probleem op een lijn", Vergeer, S30, relayed by Oppr): Captures from the floor, Assets and QR codes, Phone app (Scan, Find, Capture, Ask), Read a Document, Ask, Plant model and glossary (for floor words), and only the document control needed to Publish: New Document or Convert a PDF, Wrap a supplier manual, Edit, review, approve and publish, Check in, Company, people and shifts, Document settings. That is 13 of the 25 slice 1 functions. Captures is in the core because it has the strongest evidence and needs only the Draft path the core already has. Periodic review, PDF and print, the ISO 9001 view, Templates, Guided creation, Home and the AI cost page follow when the plant widens past one line or an audit comes up. This resolves the tension with S30: start with one line and its 5 to 10 Documents, not with the whole document system.

Runner-up: **Rounds** (Enpiro: "dat ze allemaal hetzelfde rondje lopen, hetzelfde scannetje maken", C9; Omniplast, C29). It is held back only because the wider Oppr platform (LOGS) already sells rounds, so in Knowledge it is the training form of a Round, not a new buy reason.

**Three sellable slices** (each needs only earlier slices, never a later one)

| Slice | Promise to the plant | Functions | Needs | Evidence strength |
|---|---|---|---|---|
| **1. The right instruction at the machine** | Controlled Documents that reach the floor by Scan, answers in floor words with the source, and fixes handed back from the floor as Drafts. Audit-ready document control (ISO 9001 7.5) comes with it. | Home, Search, Ask, Check in, Find Documents, Read a Document, New Document, Guided creation (Document), Convert a PDF, Wrap a supplier manual, Edit/review/approve/publish, Periodic review, PDF and print, Safety icons, ISO 9001 view, Captures, Assets and QR codes, Phone app, Plant model and glossary, Company/people/shifts, Document settings, Templates, My preferences, Instructions, AI cost and limits (AI usage, Prices, Limits and Plan: already one page) | Nothing earlier. Platform gates below. | Strong for Captures (5 or 6 companies), medium for Scan (3 or 4) and Ask (2); see the top 3 |
| **2. Prove who may do the work** (gated: not demoable or sellable until LD1 and LD2) | Trainings built from the Published Documents, taken on phone or desk, with records that name the version; try-outs; Rounds; a Skill matrix that answers "who can run line 2 tonight" (Demo until LD1 and LD2 are fixed). | My learning, Trainings list, Take a Training, Guided creation (Training), Assign a Training, Rounds, Skill matrix, Coverage questions, Person Skill profile, Skills workspace, Training records, Try-outs and sign-off, Training and floor settings | Slice 1 (Published Documents, Assets, check-in), and the LD1 and LD2 fixes | Medium to strong for onboarding (C7, C11, C16, C9); weak for the matrix itself ("redelijk vrijblijvend", C3) |
| **3. Keep the knowledge alive** | Short Wikis per job or machine that rebuild when Documents change, a weekly Consistency check that finds contradictions, usage signals, and AI-prepared Proposed revisions that people review. | Find a Wiki, Read a Wiki, Shape a Wiki, Guided creation (Wiki), Findings and Consistency check, Knowledge health, Document insights and Proposed revisions, Capture sets, Image library, Propose Plant from Documents | Slice 1 (Published Documents, Captures). Not slice 2. | Medium: the need is real ("wie waarborgt dat?", C23), but most Wiki and consistency lines are Oppr voice ("wiel moeten gaan uitvinden" is the founder, V12) |

**Why this order.** The slice order is by dependency first, evidence second. Slice 1 matches the three strongest, most direct customer needs and the start-small ask ("een probleem op een lijn", Vergeer, S30). Everything later reads from Published Documents, so document control must come first anyway. Slice 2 comes before 3 because onboarding pain is volunteered by plant leaders (C7, C16) while Wiki and consistency demand is mostly our own voice. Slice 2 has one gate: the re-train deadlock (LD1, LD2) must be fixed before a plant relies on the matrix, because today one Significant change empties every shift. Until then the Skill matrix, Coverage questions and Person Skill profile are rated Demo, and slice 2 is a planned slice, not evidence: on the DEV plant after the standard checks, Home shift cover reads 0 people for Early, Late and Night on Line 2 and Mixing, the Training that would fix it is on hold, and Operator Lotte's only assigned Training is Waiting for the same reason (her O4 task only passed on a different, startable Training). A reseed alone does not help: the standard checks publish the SOP change that causes it. Do not demo slice 2 until LD1 and LD2 are built; if Home must be shown, say first that the zeros are this rule at work.

**Platform gates for any paid slice** (not functions, but every buyer will ask): personal sign-in or a PIN before sign-offs (DC1; check-in is a picked name on one shared login), security and data residency evidence (Arla: "Hebben jullie ISO-certificaten met betrekking tot de beveiliging van de data?", C24; iQatalyst, S35), and QR labels that carry a link so iPhones open the app (F1).

**AI cost is small per use; publishes drive the bill.** Measured per use: Ask $0.0013, Capture $0.014, Training attempt feedback $0.009, Training assistant turn $0.09, Proposed revision $0.047, Wiki build about $0.11 to $0.23, Consistency check about $0.12 per Document. What people do costs little: on the live usage page (26 Oct, 30 days, $22.60 over 597 calls) people account for $0.89 and system jobs for $21.71 (96%), almost all of it Wiki rebuilds ($15.46) and Consistency checks ($5.78) started by publishes, reseeds and test runs. **One publish chain** (a Consistency check of that Document plus one rebuild per Wiki built on it) costs about $0.12 to $0.60, and that is the number to watch. Since round 2 the usage page shows this share and the per-publish cost. A plant of 30 Operators would spend in the order of $50 per month (worked example under AI cost; an assumption, not a measurement, and the page itself says there is too little history for a forecast), against price anchors of EUR 25K for a 10-week Proof of Value and EUR 50K to 75K per year (S14, C12). So AI cost is unlikely to decide a sale, but a plant that publishes often, or has many Wikis per Document, needs a publish budget; the Plan's feature limits and kill switch already cover both lines.

**Needs customers raised that no function covers yet** (details at the end): breakdown (storing) log and escalation, shift handover, reporting time per shift, translated or Dutch interface, data security proof, absence and shift planning, pricing and packaging.

**Biggest risks to selling slice 1:** the QR label holds a token, not a link (F1); sign-offs are not authenticated (DC1); Ask answers in Dutch but the phone interface is English (CD3), and its answer to a how-to question can still drift (see Ask).

**Open items after outside review round 2** (fixed in code; confirm in the next measured walk): (1) Home "This week" said "No significant changes in the last 7 days" while the same screen and Learn showed a re-train and a Training on hold caused by EXT-OPS-SOP-0001 v2. Cause: a removed cited passage counted as Significant for re-training but was not stored on the version. The version row now stores the same decision, so This week, history and re-training read one flag. (2) The flagship SOP v2 showed the author as approver and no reviewer, because the dev check that publishes it skipped the review step. It now signs with a distinct reviewer (Mark Jansen) and approver (Ingrid Hoekstra) and a change note; the real publish flow already refused this on the server. (3) Ask answer quality on the O2 question (see Ask). (4) Slice 2 stays gated on LD1 and LD2.

---

## How to read an entry

- **Maturity.** *Idea*: described, not built. *Demo*: works on seeded data, would break or mislead with real use. *Usable*: a real plant could use it today with help. *Ship-ready*: we would let a customer rely on it as is.
- **Persona test.** The task from personas.md (O = Lotte, Operator; E = Sanne, Engineer; A = Ingrid, quality lead, or Ruud, Admin), result, seconds and clicks or taps after round 1, and the main friction. Functions without a task got a first-screen walk as Sanne at 1440 px after round 1: seconds to the heading, words on the first screen, axe rule types with serious or critical issues.
- **Evidence.** Quote ids (C = customer or prospect, S = second-hand or market signal, V = Oppr's own view) point to the Evidence register at the end, with source, date and speaker role. "No evidence found" means none of the three sources gave a line for it.
- **Kano.** *Must-be*: expected; missing it loses the deal, having it wins nothing. *Performance*: more is better and buyers compare it. *Attractive*: a delighter nobody asked for. *Indifferent*: buyers do not care.
- **AI cost.** Measured from AI usage rows (see AI cost, method), or marked *estimate* when the window had no calls.
- **Verdict.** Slice 1, 2 or 3; *showcase* (keep in the demo, do not sell); *merge* (fold into another function); *drop (proposed)* from the customer build.

---

## Overview table

| Function | Place | Roles | Maturity | Kano | AI cost per use | Verdict |
|---|---|---|---|---|---|---|
| Home | Home | Op, Eng, Adm | Usable | Must-be | none | Slice 1 |
| Search | Everywhere | Op, Eng, Adm | Ship-ready | Must-be | ~$0 | Slice 1 |
| Ask | Everywhere, phone | Op, Eng, Adm | Usable | Performance | $0.0013 | Slice 1 |
| Check in | Top bar | Op, Eng, Adm | Demo | Must-be | none | Slice 1 (needs DC1) |
| Find Documents | Documents | Op, Eng, Adm | Usable | Must-be | none | Slice 1 |
| Read a Document | Documents | Op, Eng, Adm | Ship-ready | Must-be | none | Slice 1 |
| Guided creation (Document) | Documents | Eng, Adm | Usable | Attractive | ~$0.03 to 0.09 per turn (estimate) | Slice 1 |
| New Document | Documents | Eng, Adm | Ship-ready | Must-be | none | Slice 1 |
| Convert a PDF | Documents | Eng, Adm | Usable | Performance | none (indexing $0.0003 on publish) | Slice 1 |
| Wrap a supplier manual | Documents | Eng, Adm | Ship-ready | Performance | ~$0.0003 (indexing) | Slice 1 |
| Edit, review, approve and publish | Documents | Eng, Adm | Ship-ready | Must-be | $0.12 to $0.6 per publish (jobs it starts) | Slice 1 |
| Periodic review | Documents | Eng, Adm | Usable | Must-be | none | Slice 1 |
| Document insights and Proposed revisions | Documents | Eng, Adm | Usable | Attractive | $0.047 per revision | Slice 3 |
| PDF and print | Documents | Op, Eng, Adm | Usable | Must-be | none | Slice 1 |
| Safety icons (PPE) | Editor | Eng, Adm | Ship-ready | Must-be | none | Slice 1 |
| Diagrams in Documents | Editor | Eng, Adm | Demo | Indifferent | none | Merge (editor block) |
| Findings and Consistency check | Documents | Eng, Adm | Usable | Attractive | ~$0.12 per Document per run | Slice 3 |
| Knowledge health | Documents | Eng, Adm | Usable | Attractive | none | Slice 3 |
| Captures from the floor | Documents, phone | Op, Eng, Adm | Usable | Performance | $0.014 per Capture | Slice 1 |
| Capture sets | Documents | Eng, Adm | Usable | Attractive | ~$0.014 (estimate) | Slice 3 |
| Image library | Documents | Eng, Adm | Usable | Indifferent | $0.0006 per image | Slice 3 |
| ISO 9001 view | Documents | Eng, Adm | Usable | Attractive | none | Slice 1 |
| My learning | Learn | Op, Eng, Adm | Usable | Must-be (in slice 2) | none | Slice 2 |
| Trainings list | Learn | Op, Eng, Adm | Usable | Must-be (in slice 2) | none | Slice 2 |
| Take a Training | Learn, phone | Op, Eng, Adm | Ship-ready | Performance | $0.009 per Attempt | Slice 2 |
| Guided creation (Training) | Learn | Eng, Adm | Usable | Attractive | $0.09 per turn | Slice 2 |
| Assign a Training | Learn | Eng, Adm | Usable | Must-be (in slice 2) | none | Slice 2 |
| Rounds | Learn, phone | Op, Eng, Adm | Usable | Performance | ~$0.009 per Round (estimate) | Slice 2 |
| Skill matrix | Learn | Op, Eng, Adm | Demo (until LD1, LD2) | Performance | none | Slice 2 (after LD1, LD2) |
| Coverage questions | Learn, Home | Op, Eng, Adm | Demo (until LD1, LD2) | Attractive | none | Slice 2 (after LD1, LD2) |
| Person Skill profile | Learn | Op, Eng, Adm | Demo (until LD1, LD2) | Performance | none | Slice 2 (after LD1, LD2) |
| Skills workspace | Learn | Eng, Adm | Usable | Must-be (in slice 2) | none | Slice 2 |
| Training records | Learn | Op, Eng, Adm | Ship-ready | Must-be | none | Slice 2 |
| Try-outs and sign-off | Learn, phone | Op, Eng, Adm | Usable | Performance | none | Slice 2 |
| Find a Wiki | Wiki | Op, Eng, Adm | Usable | Performance | ~$0 | Slice 3 |
| Read a Wiki | Wiki | Op, Eng, Adm | Usable | Performance | none to read | Slice 3 |
| Shape a Wiki | Wiki | Eng, Adm | Usable | Attractive | $0.035 per block; $0.23 per rebuild | Slice 3 |
| Guided creation (Wiki) | Wiki | Eng, Adm | Usable | Attractive | $0.025 per outline + $0.23 build | Slice 3 |
| Plant model and glossary | Plant | Op, Eng, Adm | Usable | Must-be (for Ask) | none | Slice 1 |
| Propose Plant from Documents | Plant | Eng, Adm | Demo | Attractive | ~$0.1 per run (estimate) | Slice 3 |
| Assets and QR codes | Plant | Op, Eng, Adm | Usable | Must-be | none | Slice 1 (needs F1) |
| Floor simulator | Try it | Op, Eng, Adm | Demo | Attractive (in a sale) | none | Showcase |
| Phone app | Try it, /m | Op, Eng, Adm | Usable | Performance | none (Ask, Capture as above) | Slice 1 |
| Company, people and shifts | Settings | Eng, Adm | Usable | Must-be | none | Slice 1 |
| Document settings | Settings | Eng, Adm | Ship-ready | Must-be | none | Slice 1 |
| Templates | Settings | Eng, Adm | Usable | Must-be | none | Slice 1 |
| Training and floor settings | Settings | Eng, Adm | Usable | Must-be (in slice 2) | none | Slice 2 |
| My preferences | Settings | Op, Eng, Adm | Usable | Indifferent | none | Slice 1 |
| Instructions | Try it | Op, Eng, Adm | Ship-ready | Attractive | none | Slice 1 (tours per slice) |
| Developer overview | Developer | Eng, Adm | Usable | Indifferent | none | Showcase (internal) |
| AI models, search index and schedules | Developer | Eng, Adm | Usable | Indifferent | none | Showcase (internal) |
| AI cost and limits (AI usage, Prices, Limits and Plan) | Admin, Developer | Eng, Adm | Ship-ready | Must-be (for IT and finance) | none | Slice 1 (Admin entry since round 1) |
| Connect Claude with MCP | Developer | Eng, Adm | Usable | Attractive (for IT) | ~$0 per query | Showcase, add-on later |
| Embeddings lab | Developer (internal lab) | Eng, Adm | Demo | Indifferent | none | Drop (proposed) from customer build; hidden from the menu |
| Analysis case files | Developer (internal lab) | Eng, Adm | Usable (internal) | Indifferent | none | Drop (proposed) from customer build; hidden from the menu |

Count: slice 1 has 25 functions, slice 2 has 13, slice 3 has 10, showcase 4, merge 1 (Diagrams into the editor), drop (proposed) 2. Total 55. Prices, Limits and Plan are no longer counted apart: the app already shows them as tabs of one page with AI usage (an earlier draft of this map listed them as a 56th function).

---

## Home

### Home (`/`)
- **Role and job:** Operator, Engineer, Admin. See what needs a decision today, shift cover and how the knowledge base is doing.
- **Maturity:** Usable. Round 1 split it by role: only the person whose turn it is gets the action ("Your turn: review it"), others see "Waiting for Mark Jansen's review"; a checked-in Operator now sees her own Trainings and Rounds, Scan, Ask and Find a document instead of the Engineer inbox. Engineer inbox rows are still dense code strings.
- **Persona test:** A2 start (Ingrid): before round 1 the inbox row said "Waiting for your review" to the approver, a dead end (fixed). O4 (Lotte): before round 1 she saw "Review", "Publish" and six Findings and not her own Training (fixed, `walk-operator/O4-1-home.png`). The walk script still logs the old heuristic line. A1 starts here: Shift cover block answers in 0.9 s, 3 clicks (see Coverage questions). Outside review round 1: an Engineer's first Home led with "nobody 0" on every shift; the block now opens with the reason ("Cover is paused by a document change") and the Training to update, before the zeros. An anonymous visitor's Home now says it is the Engineer view and how to check in. Outside review round 2: "This week" said "No significant changes" while shift cover and Learn showed a re-train from EXT-OPS-SOP-0001 v2 (fixed: one stored Significant-change flag drives both). Shift cover still reads 0 on every shift after the standard checks; that is the LD1 and LD2 rule, and slice 2 is gated on it.
- **Evidence:** "teamleiders zitten veel achter de computer (administratieve last...)" (C25, paraphrased). No direct ask for an inbox.
- **Kano and JTBD:** Must-be. "When I start my day, I want to see only what waits for me, so I do not miss a review or an expiring Skill."
- **AI cost:** none.
- **Dependencies:** check-in (role), documents, assignments, skills, findings.
- **Verdict:** Slice 1 (inbox and Operator Home); the shift cover block comes with slice 2.

### Search (Ctrl K)
- **Role and job:** all roles. One field to find Documents, Assets, Trainings, Wikis, people and Plant words.
- **Maturity:** Ship-ready. E2 found the SOP first under Documents after typing.
- **Persona test:** E2 (Sanne): Ctrl K to the SOP in 1.1 s, 1 keystroke plus 1 click, inside the 15.5 s task.
- **Evidence:** No evidence found for search itself; implied by "ik wil iets in de manual opzoeken" (C21).
- **Kano and JTBD:** Must-be. "When I know roughly what I need, I want to type a few letters and land on it."
- **AI cost:** about $0.000002 per semantic query (embed.query rows), effectively zero.
- **Dependencies:** embeddings index (AI models and jobs).
- **Verdict:** Slice 1.

### Ask
- **Role and job:** all roles, desk dock and phone `/m/ask`. Ask in your own words and get an answer from Published knowledge, with sources.
- **Maturity:** Usable. Answers only from Published Documents and shows one main source; long answers open short with "Show the whole answer"; the phone has feedback, an offline queue and a slow-signal note (frontline lens); failures now read "No answer: ..." in plain words (content lens). Gaps: unanswered questions pile up with no "Ask again" (F5); the interface around a Dutch answer is English (CD3); the Ask panel narrows tables (P9). Outside review round 1: the O2 answer was long, mixed threading and saw steps into a haul-off question, and cited a supplier manual (Nordcut HC-110) before the plant's changeover SOP. Fixed in part: excerpts are still chosen by relevance alone, but among them the plant's own Documents are numbered before supplier manuals, manuals are marked as such for the model, and the prompt asks to open with at most three steps that do what was asked. Outside review round 2 found a fresh answer that opened with threading and the saw, put the one on-point fact last, took about 15 s and cited numbers that did not match the main source card. Fixed in round 2: floor words in the question are added in plant words before the search (rupsaftrek adds Haul-off); title lines, heading-only passages and References entries no longer take excerpt slots; passages that name the machine rank a little higher; the prompt asks for a first sentence that answers exactly what was asked, under 80 words, each citation right after its claim; and the phone's main source card is now the source the answer cites first, with its [n] numbers shown on every source card. Still open: the SOP step "Set the haul-off speed of SAW-202 to the line speed on the batch card" is not retrieved for the Dutch question (it is for the English one), so the answer leans on the supplier manual; answers run 88 to 113 words, above the 80 asked. Better retrieval for short steps (for example embedding passages with their section, tried and reverted in round 2 because it made title matches dominate) is a proposal, not built.
- **Persona test:** O2 (Lotte, phone): "Hoe stel ik de rupsaftrek in na een omstelling?" **PARTIAL** (not a clean pass). Re-timed after round 2, three fresh runs: 7.0, 7.0 and 8.1 s, 4 taps (budget 45 s), AI wait 2.6 to 3.7 s. First sentence on the haul-off and line speed in 3 of 3 runs ("De rupsaftrek volgt automatisch de lijnsnelheid die door de lijnregeling wordt aangestuurd [5]"), off-topic step words 1 (was 4), 88 to 113 words (was about 180). Against it: the main and first-cited source is the Nordcut supplier manual, not the plant's changeover SOP, and the SOP's own step is missing. The script's PASS line now requires the first sentence on topic, under 3 off-topic words and at most 120 words; this map grades it PARTIAL because of the source. Before round 2 the map said PASS at 8.0 s; the outside review's live run took about 15 s with an off-topic answer. For a demo, use a question the corpus answers well from the SOP (for example the die bolt torque, which also shows the conflict warning) until retrieval of short steps improves.
- **Evidence:** C20 "Maar kan een operator ook... vragen stellen? Ik loop nu daar tegenaan." C21 manual lookup at the machine. S32 competitor Relay sells "Ask questions about what happened". V3 "wat is informatie waar ik vanuit mag gaan dat het goed is" and V4 hallucination worry (Oppr view) are answered by the Published-only rule.
- **Kano and JTBD:** Performance. "When I am stuck at the machine, I want a short answer in my words that I can trust, so I do not have to find the one colleague who knows."
- **AI cost:** $0.0013 per question (median of 18 questions: one embedding call plus one Gemini Flash-Lite call, about 2,800 tokens in, 200 out, median 1.4 s). Two of the 18 rows were first priced at $0.029: a test price row ($10 in, $40 out per 1M tokens) was in force for about an hour and later removed, and removing a row did not re-price the calls it had priced. Fixed: removing a price row now re-prices those calls, and the rows were corrected to $0.0007 each.
- **Dependencies:** Published Documents, embeddings index, Plant glossary (floor words), check-in (Scope).
- **Verdict:** Slice 1. Top 3 to sell first (#3, the thinnest evidence and the weakest demo).

### Check in
- **Role and job:** all roles. Say who you are on a shared screen, so role, Skills and signatures are yours.
- **Maturity:** Demo. Fast (phone: 2 taps, 3.0 s) and every role check runs on the server, but it is picking a name on one shared login: sign-offs carry a name that nothing proves (DC1). The ISO 9001 page now says so.
- **Persona test:** set-up step of every task: 2 taps, 3.0 s on the phone. The accessible name of the chip does not match its text (P5, open). Since round 1 the chip shows the role next to the name ("Ruud Kok · Admin") and the picker marks Admins.
- **Evidence:** C29 Omniplast manager blocked by "geen inloggegevens" on the phone app: login friction is real on both sides. V2 sign-off "door iemand met autoriteit" (Oppr view).
- **Kano and JTBD:** Must-be. "When I use a shared screen, I want it to know it is me in two taps, so my records and signatures are mine."
- **AI cost:** none.
- **Dependencies:** people and roles (Company, people and shifts).
- **Verdict:** Slice 1, with DC1 (PIN or badge before a sign-off) as a ship gate.

---

## Documents

### Find Documents (`/library`)
- **Role and job:** all roles. Browse and filter every controlled Document; export the master list.
- **Maturity:** Usable. Filters, status and owner columns; the first line now says why Published matters. The Master list button downloads every Document with code, version, status, owner and next review as one CSV in one click (DC3, shipped; a print view is not built). A checked-in Operator sees only All documents and Captures as tabs, and no New document button.
- **Persona test:** A3 (Ingrid): reached "Reviews due" from here and ISO 9001 in 6.7 s, 7 clicks (before 10.4 s, 8 clicks). A4 walked before the Master list button existed and recorded it as missing; the outside review downloaded master-list-2026-10-26.csv in one click.
- **Evidence:** C22 "alle documenten moeten in orde zijn. De ISO 9001 moet in orde zijn" (partner). S33 "papier en Excel op tablets naast SAP" (second-hand).
- **Kano and JTBD:** Must-be. "When an auditor or colleague asks what we have, I want one list of every controlled Document and its state."
- **AI cost:** none.
- **Dependencies:** documents, naming codes.
- **Verdict:** Slice 1.

### Read a Document (`/docs/:id`)
- **Role and job:** all roles. Read the Published version, its history, Assets and Trainings, and know it is the one in use.
- **Maturity:** Ship-ready. Read-only live version, sign-offs per role, compare, superseded banners. Round 1 and the lenses fixed a draft that showed "Published" and printed like the controlled copy (doc-control lens). On the phone the header shows "v2 in use", a pinned PPE strip and step by step with Next in thumb reach; warnings and PPE are larger on the phone. Outside review round 2: the flagship Published v2 showed "Reviewer: Not assigned" and the author as approver, which an ISO buyer reads as self-approval. It came from a dev check that published v2 without the review step, not from the publish flow (the server refuses an author or reviewer as approver). Fixed: the check now signs with a distinct reviewer and approver. Since round 2 the phone reader opens at the first step under the PPE strip, with the title, intro and Scope one swipe up (it used to open on the title because the title contains "changeover"). Gap: no offline cache for a cold start (F3).
- **Persona test:** O1 (Lotte): Scan EXL-201 to the changeover SOP in use, PASS, 5.1 s, 3 taps (budget 30 s). First-screen walk: heading in 0.6 s.
- **Evidence:** C1 "Die komen als het ware niet op de werkvloer terecht" (OmniPlus). C17 "Volgens mij kijken ze er nooit naar." C19 "boekjes in de zak" per shift. C2 "werkinstructie leeft eigenlijk niet bij ons" (OmniPlus, a weak pain).
- **Kano and JTBD:** Must-be. "When I do a job, I want the instruction that is valid today, so I do not follow an old copy."
- **AI cost:** none.
- **Dependencies:** documents, lifecycle, Assets (links), Trainings (links).
- **Verdict:** Slice 1.

### Guided creation (Document) (`/docs/new/compose?assistant=1`)
- **Role and job:** Engineer, Admin. Write an SOP or work instruction with the assistant asking the right questions.
- **Maturity:** Usable. The assistant asks, the person writes and submits; the result is a Draft that goes through normal review (the AI never publishes).
- **Persona test:** no persona task. First-screen walk: heading in 1.0 s, 123 words, 0 axe issues.
- **Evidence:** C5 "slecht of moeilijk of moeizaam de ervaring van de operators... uit hun hoofd op papier" (Hoost). C4 "Alles wat je in het begin doet, is vastleggen. Dat kost tijd" (OmniPlus). S7 market trend "AI proposing while a person decides".
- **Kano and JTBD:** Attractive. "When I must write a new SOP, I want to be asked the right questions, so the draft is complete without a blank page."
- **AI cost:** no "writer" calls in the measured window. Estimate $0.03 to $0.09 per assistant turn (same model and prompt size as the Training assistant, measured at $0.09).
- **Dependencies:** templates, naming codes, Plant model (context), lifecycle.
- **Verdict:** Slice 1.

### New Document, blank or template (`/docs/new`)
- **Role and job:** Engineer, Admin. Start a Document blank or from a template, with naming code and details.
- **Maturity:** Ship-ready. Server-allocated naming codes; templates per type. The chooser dialog opens over the page (the Admin walk only read the heading behind it; not a bug).
- **Persona test:** no persona task. First-screen walk: heading in 1.0 s.
- **Evidence:** No evidence found.
- **Kano and JTBD:** Must-be. "When I start a Document, I want the right code and layout without thinking about it."
- **AI cost:** none.
- **Dependencies:** Document settings (naming), Templates.
- **Verdict:** Slice 1.

### Convert a PDF (`/import`)
- **Role and job:** Engineer, Admin. Turn an existing PDF into an editable Draft Document.
- **Maturity:** Usable. Page renamed from "Import external document" to "Convert a PDF" to match CONTEXT and the tour.
- **Persona test:** no persona task. First-screen walk: heading in 0.6 s, 86 words (the shortest first screen).
- **Evidence:** S33 "papier en Excel op tablets naast SAP" (Yara, second-hand). S36 "veel kennis in hoofden en Excel" (Ketjen, second-hand). C1 the instructions already exist on a server. Every plant starts with existing PDFs, so this is the on-ramp.
- **Kano and JTBD:** Performance. "When we start, I want our existing SOPs in the system in hours, not weeks."
- **AI cost:** none. The page converts text and pictures without AI, as its first screen says ("No template, no AI and no naming code yet"). An AI mapping step exists in code (`convex/importer/map.ts`) but the page does not call it. Indexing ($0.0003) happens when the Draft is published.
- **Dependencies:** lifecycle (result is a Draft).
- **Verdict:** Slice 1.

### Wrap a supplier manual
- **Role and job:** Engineer, Admin. Keep a supplier PDF unchanged as a controlled Document with code, Assets and review.
- **Maturity:** Ship-ready. Supplier document number and revision, stamped copies, original kept. Checking the supplier's latest revision is manual.
- **Persona test:** no persona task. First-screen walk: heading in 0.7 s.
- **Evidence:** C21 "ik wil iets in de manual opzoeken" (partner). V5 QR "of de handleiding van de fabrikant?" (Oppr pitch).
- **Kano and JTBD:** Performance. "When a machine comes with a manual, I want it controlled and findable at the machine without retyping it."
- **AI cost:** indexing only, about $0.0003 per manual.
- **Dependencies:** Assets, lifecycle, periodic review.
- **Verdict:** Slice 1.

### Edit, review, approve and publish (`/docs/:id/edit`)
- **Role and job:** Engineer, Admin. Start a new version, send it for review and approval, and publish it (people publish, never the AI).
- **Maturity:** Ship-ready logic: named reviewer and approver, four-eyes by person on the server (the author may not review or approve, the reviewer may not approve), change note, Significant change chosen at submit and preselected at publish (round 1), every save now signed by a checked-in Engineer (doc-control lens). Gaps: sign-off identity is a picked name (DC1); autosave is local only; no diff inside a Draft before review. Round 2: the demo's flagship SOP showed author = approver because a dev check bypassed this flow (fixed); "Ship-ready" is about the server rules, and holds only with DC1 for real identities.
- **Persona test:** E2 (Sanne): find the SOP, start a version, send for review, PASS, 15.5 s, 6 clicks (estimated human time 69 s; budget 180 s). The Significant change choice in the submit dialog was added in round 1 and is not yet clicked through in a browser. A2 (Ingrid): approve, publish and PDF, PASS, 24.3 s machine time, 5 clicks plus 1 for print, after the reviewer step; not re-run after round 1 (needs a reseed).
- **Evidence:** C23 "We hebben een SOP aangepast omdat we iets geleerd hebben... maar wie waarborgt dat?" (partner). C22 ISO 9001 as bureaucratic load. V1 "vergaarbak" and V2 author, reviewer, approver (Oppr view). Pocket ranks document control as weak direct demand.
- **Kano and JTBD:** Must-be. "When we change how we work, I want the change reviewed, approved and traceable, so the floor uses one truth."
- **AI cost:** no AI in the flow itself. Publishing starts paid jobs: indexing ($0.0003), a Consistency check for that Document (measured $0.113 for EXT-MNT-SOP-0001) and a rebuild of each Wiki that reads it ($0.23 each). So one publish costs about $0.12 to $0.60.
- **Dependencies:** check-in, people and roles, Document settings, Templates.
- **Verdict:** Slice 1.

### Periodic review
- **Role and job:** Engineer, Admin. Know when a Published Document is due for review and confirm or revise it.
- **Maturity:** Usable. "Still valid" now takes an optional note ("What did you check?") and interval changes need an Engineer and are recorded (doc-control lens). No reminder outside Home; no bulk confirm before an audit.
- **Persona test:** A3 (Ingrid): confirmed EXT-OPS-SOP-0003, next review shown, inside the 6.7 s, 7-click task (budget 240 s).
- **Evidence:** C19 shift notebooks drift from the standard. V6 "die verificatie loop, die doet niemand" (Oppr describing the market). No direct customer ask for periodic review (Attio and Pocket both say so).
- **Kano and JTBD:** Must-be (for ISO plants). "When a Document gets old, I want to be told and to confirm it in one step, so the auditor sees it is maintained."
- **AI cost:** none.
- **Dependencies:** lifecycle, Document settings (review rules).
- **Verdict:** Slice 1.

### Document insights and Proposed revisions
- **Role and job:** Engineer, Admin. See how a Document is used and asked about; let the AI prepare a revision Draft for review.
- **Maturity:** Usable. Before/after view, reason linked to its signal, normal review, the AI never publishes. Gaps: the insights card sits below the fold (P7); the author sign-off of an AI Proposed revision stores the shared login, not the person (DC4).
- **Persona test:** E3 (Sanne): from a Finding to "Review the proposed revision", PASS, 3.2 s, 1 click (estimated human time 6 s). The live version stayed Published.
- **Evidence:** V7 "als heel veel mensen dat doen kan de houder zeggen, we moeten het proces aanpassen" (Oppr pitch). S7 human-in-the-loop trend. No direct customer quote.
- **Kano and JTBD:** Attractive. "When the floor keeps asking about a step, I want a ready Draft of the fix, so I only have to review it."
- **AI cost:** $0.047 per Proposed revision (5 measured, Opus 5.5, about 8,600 tokens in). Insights summaries had no calls in the window; estimate $0.03 to $0.05 per Document.
- **Dependencies:** Ask history (signals), Findings, lifecycle.
- **Verdict:** Slice 3.

### PDF and print
- **Role and job:** all roles. Get a controlled PDF with the plant's title page, or print.
- **Maturity:** Usable. The PDF marks every page; browser Print now carries a status band ("Controlled copy · vN · printed <date>", or "DRAFT, NOT FOR USE"), but only at the top and bottom of the document, not on every page (DC5).
- **Persona test:** A2 (Ingrid): PDF dialog with title page and controlled-copy watermark, 1 click after publishing.
- **Evidence:** No customer quote. Plants with paper binders at the line need it (C19 notebooks in pockets).
- **Kano and JTBD:** Must-be. "When the line still uses a binder, I want a printed copy that says whether it is valid."
- **AI cost:** none.
- **Dependencies:** cover settings (Document settings), lifecycle status.
- **Verdict:** Slice 1.

### Safety icons (PPE)
- **Role and job:** Engineer, Admin. Add the right PPE and safety pictograms to a Document.
- **Maturity:** Ship-ready. 20 ISO 7010 style pictograms; render in editor, reader, phone and PDF; the toolbar now has text labels; the PPE picker has an accessible name.
- **Persona test:** O1 phone reader: "Wear" strip pinned in the header (round 1). First-screen walk of the editor: 0 axe issues.
- **Evidence:** No evidence found.
- **Kano and JTBD:** Must-be. "When I open a job, I want to see what to wear before step 1."
- **AI cost:** none.
- **Dependencies:** Document settings (PPE catalogue).
- **Verdict:** Slice 1.

### Diagrams in Documents
- **Role and job:** Engineer, Admin. Draw a flow or layout diagram inside a Document.
- **Maturity:** Demo. A block in the editor; errors now read in plain words. Not tested by a persona; no evidence of use.
- **Persona test:** no persona task. Editor first screen: 0.9 s, 0 axe issues.
- **Evidence:** No evidence found.
- **Kano and JTBD:** Indifferent. "When a layout is easier to draw than to write, I want to draw it in place."
- **AI cost:** none.
- **Dependencies:** editor.
- **Verdict:** Merge: treat as an editor block of Edit, review, approve and publish, not a function to sell or tour on its own.

### Findings and Consistency check (`/library/findings`)
- **Role and job:** Engineer, Admin. See where Published Documents contradict or repeat each other, and resolve it.
- **Maturity:** Usable. Both passages on each card; empty states teach resolve and dismiss. Gap: Dismiss takes no reason, so "why we kept both" is not recorded (P6).
- **Persona test:** E3 (Sanne): PASS, 3.2 s, 1 click to the prepared revision (budget 150 s). Friction: no reason on Dismiss.
- **Evidence:** V1 "vergaarbak waar iedereen zijn eigen versie van de waarheid in kan zetten" (Oppr view). C19 every shift with its own notebook. S10 "keep what the operator observed separate from the suspected cause" (external practitioner). No direct customer ask.
- **Kano and JTBD:** Attractive. "When two instructions disagree, I want to be told before an Operator finds out at the machine."
- **AI cost:** $0.025 per check call, 5 calls per Document, so about $0.12 per Document per run (200 calls measured). The weekly run over a 50-Document library would be about $6.
- **Dependencies:** Published Documents, embeddings index, schedules.
- **Verdict:** Slice 3.

### Knowledge health (`/library/health`)
- **Role and job:** Engineer, Admin. See which Documents are never used, unclear, in conflict or due for review.
- **Maturity:** Usable. Each group says what to do. The first line packs dense numbers. On the demo plant a "Sample data" label now says the views, Scans, questions and Findings were made up for the showcase (it shows when the Plant site comes from the seed), so nobody reads them as telemetry.
- **Persona test:** A3 (Ingrid): the Reviews due list opened from here and from the ISO page, inside 6.7 s.
- **Evidence:** No evidence found directly. Related: C13 "Die wordt gewoon niet goed genoeg gebruikt" (knowledge not used).
- **Kano and JTBD:** Attractive. "When I have an hour for upkeep, I want to know which Documents need it most."
- **AI cost:** none (reads stored signals).
- **Dependencies:** Ask history, Findings, Periodic review.
- **Verdict:** Slice 3.

### Captures from the floor (`/library/captures`, phone `/m/capture`)
- **Role and job:** all roles. Record how Operators really do the work on the phone and turn it into a Draft.
- **Maturity:** Usable. Big Start button at the bottom, voice and photo, "Raw input, not Knowledge" on the desk, phone says why. No job is preselected any more and the scan prompt is prominent. Gaps: the job comes before the machine (P1); duplicate Captures can stack on phone Home; the status pill is 12 px (F6).
- **Persona test:** O3 (Lotte): record the vacuum alarm fix and hand it in, PASS, 8.6 s, 7 taps (before 9.1 s; budget 120 s). E1 (Sanne): open the set and the Draft made from it, PASS, 5.1 s, 2 clicks.
- **Evidence:** C18 "naar de computer lopen is een eind weg... dan kunnen ze gelijk inspreken hoe ze het opgelost hebben". C6 "Het zijn geen schrijvers" (Hoost). C10 "dikke vingers... waar ze allemaal een hekel aan hebben" (Enpiro). C13, C14 knowledge leaving with retirements. S2 tribal knowledge is a rising market topic. S18 "We want them to record all their observations" (Attero field observation, Oppr).
- **Kano and JTBD:** Performance. "When I just fixed something, I want to say how in 30 seconds, so the next shift does not start from zero."
- **AI cost:** $0.014 per handed-in Capture (7 measured: a Gemini Flash-Lite call plus an Opus 5.5 summary, about 1,550 tokens in).
- **Dependencies:** phone app, check-in, Assets (machine link), lifecycle (Draft).
- **Verdict:** Slice 1. Top 3 to sell first.

### Capture sets, variations (`/library/captures?tab=sets`)
- **Role and job:** Engineer, Admin. Compare how different people do the same job and agree one best way.
- **Maturity:** Usable. Variations side by side with an AI summary; "Make another Draft" now shows how many steps are still To decide.
- **Persona test:** E1 (Sanne): PASS, 5.1 s, 2 clicks (estimated human 11 s; budget 240 s). Friction fixed in round 1: the reason a second Draft could not be made was not stated.
- **Evidence:** C19 "vijf ploegendienst... boekjes in de zak" (each shift its own way). C9 "dat ze allemaal hetzelfde rondje lopen" (Enpiro). C11 "minder afhankelijk" of one operator (Enpiro).
- **Kano and JTBD:** Attractive. "When five shifts do the same job five ways, I want to see the differences and agree one."
- **AI cost:** no separate rows in the window; estimate about $0.014 per set summary (same path as a Capture).
- **Dependencies:** Captures (slice 1), lifecycle.
- **Verdict:** Slice 3. It needs several Captures of the same job, which a plant only has after running slice 1 for a while.

### Image library (`/library/images`)
- **Role and job:** Engineer, Admin. Find and reuse plant pictures by words or by photo.
- **Maturity:** Usable. Search by words and by photo. One axe contrast issue remains on the count chips.
- **Persona test:** no persona task. First-screen walk: 0.7 s, 126 words, 1 axe rule.
- **Evidence:** No evidence found.
- **Kano and JTBD:** Indifferent. "When I write a step, I want the right photo of our machine without hunting through folders."
- **AI cost:** $0.0006 per image indexed (embed.image rows); photo descriptions and generated images had no calls; list price $0.039 per generated image.
- **Dependencies:** embeddings index.
- **Verdict:** Slice 3.

### ISO 9001 view (`/iso-9001`, a Documents tab)
- **Role and job:** Engineer, Admin. See what ISO 9001 asks for (7.5 document control and more) and what Oppr already covers.
- **Maturity:** Usable. Honest split into built, supported and your process, live evidence counts, an audit checklist, and a "Still yours" line that check-in has no PIN yet. Now a Documents tab (round 1). Evidence is counts, not samples an auditor can open per Document.
- **Persona test:** A3 (Ingrid): PASS, 6.7 s, 7 clicks (before 10.4 s, 8 clicks, wrong "Settings" breadcrumb).
- **Evidence:** C22 ISO 9001 as the plant leader's bureaucratic load (partner). V8 "iedereen wil ISO 9001" and "alles auditbaar" (Oppr view). C24 is about the tool's own security certificates, a different need.
- **Kano and JTBD:** Attractive. "When an audit is coming, I want to see what the clause asks and where our proof is."
- **AI cost:** none.
- **Dependencies:** lifecycle, periodic review, Training records (7.2 evidence).
- **Verdict:** Slice 1 (sales aid for the quality lead).

---

## Learn

### My learning (`/learn?tab=mine`)
- **Role and job:** all roles. See what you need to learn next, your Skills and your records.
- **Maturity:** Usable. Waiting items now say why and since when, and blocked retries show the reason instead of a "Try again" that fails. Operators see one line per Training (the pass that counts, or "Not passed yet · N tries, best X%"). Gap: everything can be Waiting with nothing to do (P3).
- **Persona test:** O4 (Lotte): first walk FAIL, both assigned Trainings were on hold with no reason. After round 1 the reason shows; she took a startable Training: PASS, 42.7 s, 27 taps (budget 600 s). Honest note: her main assigned Training stays Waiting after the standard checks, for the same reason the Skill matrix shows 0 (LD1, LD2), so the PASS is on a different Training than the one she was assigned.
- **Evidence:** C16 "een groot aantal is nieuw bij de plant" (plant leader). C7 "iedere drie maanden moet er iemand nieuw worden opgeleid" (Hoost).
- **Kano and JTBD:** Must-be within slice 2. "When I have a moment, I want to see what I should learn next and start it."
- **AI cost:** none.
- **Dependencies:** assignments, Trainings, Skills.
- **Verdict:** Slice 2.

### Trainings list (`/learn?tab=trainings`)
- **Role and job:** all roles. Find Trainings and Rounds built from Published knowledge.
- **Maturity:** Usable for Engineers. Operators still see Engineer columns and the technical on-hold reason (P2, CD1). Outside review round 1: "0 of 1 passed, pass rate 100%" read as a contradiction. The two numbers measure different things and are now labelled so: "0 of 1 passed since assigned" (a pass after the latest assignment) and "100% of all Attempts pass" (every Attempt ever).
- **Persona test:** O4: Lotte had to look here because nothing in My learning was startable (before round 1). First-screen walk: 0.9 s.
- **Evidence:** C3 "we hebben trainingsmodules en we hebben skill matrices... redelijk vrijblijvend" (OmniPlus).
- **Kano and JTBD:** Must-be within slice 2. "When I manage training, I want every Training, its state and who needs it in one list."
- **AI cost:** none.
- **Dependencies:** Published Documents.
- **Verdict:** Slice 2.

### Take a Training (`/learn/trainings/:id`, phone `/m/attempt`)
- **Role and job:** all roles. Start an Attempt, answer, and get a result that counts as proof.
- **Maturity:** Ship-ready. Every objective tested, a Must-be-right gate, "You already know 3 of 6 things" on a fail, Read again cards. Gap: "Step 1 of 3" shows all steps at once (P10).
- **Persona test:** O4 (Lotte): 0.56 s from Start to the first screen, 5 questions in 23 s, result and record visible. PASS.
- **Evidence:** V9 "een SOP en daar een training van maken is jouw officiele manier om een wijziging door te voeren. En daar moeten mensen op aftekenen." (Oppr pitch to partners). C16, C7 onboarding load.
- **Kano and JTBD:** Performance. "When I learn a job, I want a short check that proves I got it, on the phone or at the line screen."
- **AI cost:** $0.009 per Attempt (11 measured feedback calls, Opus 5.5, about 1,000 tokens in).
- **Dependencies:** Trainings, Published Documents (objectives cite passages), check-in.
- **Verdict:** Slice 2.

### Guided creation (Training)
- **Role and job:** Engineer, Admin. Build a Training from Published Documents with the AI, get it signed off.
- **Maturity:** Usable. Objectives traced to Published passages; the objective count in the assistant's reply now comes from the list; the last reviewer is prefilled. No check that objectives describe doing rather than knowing.
- **Persona test:** E4 (Sanne): build skipped (already built by an earlier run); the task passed on assign and sign-off, 15.9 s, 9 clicks.
- **Evidence:** C15 "Bert die er 35 jaar werkt... Kun je dat proces, die knowledge transfer, daar dingen mee doen?" C8 "nieuwe operators trainen op een installatie, maar ze zit op afstand" (Hoost).
- **Kano and JTBD:** Attractive. "When an SOP changes or a new starter comes, I want a Training ready in minutes, built from what is Published."
- **AI cost:** $0.09 per assistant turn (5 measured, about 18,700 tokens in). A typical build of 4 to 6 turns costs $0.40 to $0.55.
- **Dependencies:** Published Documents, lifecycle for the Training's sign-off.
- **Verdict:** Slice 2.

### Assign a Training
- **Role and job:** Engineer, Admin. Assign a Training to people or roles with a due date and follow progress.
- **Maturity:** Usable. Round 1: warns when a Training is on hold, toast is true for already assigned people, the picked due date is used, the people picker closes and filters.
- **Persona test:** E4 (Sanne): assign Lotte with a due date inside 15.9 s, 9 clicks (before: 5 frictions incl. one high, now 3).
- **Evidence:** C7 a new starter every three months.
- **Kano and JTBD:** Must-be within slice 2. "When someone must learn a job, I want to assign it with a date and see who is late."
- **AI cost:** none.
- **Dependencies:** Trainings, people.
- **Verdict:** Slice 2.

### Rounds (`/m/round`, Floor simulator)
- **Role and job:** all roles. Walk a route of Assets and learn or check at each stop.
- **Maturity:** Usable. 4 stops, 8 questions, note and photo proof. The stand-in QR sheet for testing needs a clear label (P11).
- **Persona test:** O5 (Lotte): full Line 2 safety round, PASS, 61.3 s, 39 taps plus 4 test-only (budget 300 s, excluding walking). A confirm sheet adds one tap.
- **Evidence:** C9 "dat we zeker weten dat ze allemaal hetzelfde rondje lopen, hetzelfde scannetje maken, fotootje maken, daar zie ik wel wat in" (Enpiro). C29 Omniplast manager wants "zelf ook de rondes te gaan lopen".
- **Kano and JTBD:** Performance. "When a new Operator starts, I want them to walk the line with the right checks at each machine."
- **AI cost:** no Round-specific rows; estimate about $0.009 per Round (one Attempt feedback call).
- **Dependencies:** Assets and QR, Trainings, phone app.
- **Verdict:** Slice 2. Runner-up to sell first; overlaps with rounds in the LOGS product.

### Skill matrix (`/learn?tab=matrix`)
- **Role and job:** all roles. See who can do what per Skill and shift, against the level each role needs.
- **Maturity:** Demo until LD1 and LD2 are fixed (downgraded from Usable after the outside review). The screens are good: who, why not, what unblocks (L&D lens). The gap is a rule: one Significant change marks every holder "re-train needed" and in the same publish puts their re-train Training on hold, so the DEV plant shows 0 qualified people on every shift (LD1, LD2). No absence (P4).
- **Persona test:** A1 (Ingrid): PARTIAL, 0.9 s, 3 clicks. It now names the closest people and the one Skill that blocks everyone, but cannot name anyone who may run line 2 tonight.
- **Evidence:** C3 "skill matrices... maar dat is allemaal redelijk vrijblijvend" (OmniPlus; existing matrices are not enforced, no demand for a new one). C25 team leaders lose time on staff planning (paraphrased). V9 ISO traceability of training (Oppr).
- **Kano and JTBD:** Performance. "When I plan a shift, I want to see who is allowed to do each task, not who once had a course."
- **AI cost:** none.
- **Dependencies:** Skills workspace, Training records, try-outs, shifts.
- **Verdict:** Slice 2, gated on LD1 and LD2. For a sales demo, reseed first or open on the reason line, never on a red matrix without it.

### Coverage questions ("who can run line 2 tonight")
- **Role and job:** all roles. Answer the shift lead's daily question of who may do this task today.
- **Maturity:** Demo until LD1 and LD2 are fixed (downgraded from Usable). Reasons are concrete ("re-train needed, its Training is on hold"); the answer lists on-hold Trainings with links; Home shift cover now leads with "Cover is paused by a document change" and the Training to update. On the DEV plant it still answers "nobody" for every shift of Line 2 and Mixing, which is the headline promise of slice 2 failing in front of an outsider. "Who may do this work today" now also appears on the Document. Open rule question: it counts level 2 for every Skill, even where the role target is 1.
- **Persona test:** A1: see Skill matrix. 0.9 s to the answer, which is fast; the content was the friction.
- **Evidence:** C25 personnel planning load (paraphrased, Arla). No direct quote.
- **Kano and JTBD:** Attractive. "When someone calls in sick, I want to know in one minute who may replace them tonight."
- **AI cost:** none.
- **Dependencies:** Skill matrix, shifts, Training records.
- **Verdict:** Slice 2, gated on LD1 and LD2.

### Person Skill profile (`/learn/people/:id`)
- **Role and job:** all roles. See one person's Skills, levels and how each was reached.
- **Maturity:** Demo until LD1 and LD2 are fixed (downgraded from Usable): the profile shows the same re-train deadlock, and some people (for example Sanne, process engineer) show "No profile". Each gap shows its real next step ("Try-out requested 23 Oct, waiting for Sanne Visser" with a Sign off button). No time to competence (LD4).
- **Persona test:** A1 and A4 use it for "why not" and proof. First-screen walk: 0.8 s, 145 words.
- **Evidence:** C16 new operators; LD4 rationale "een groot aantal is nieuw bij de plant".
- **Kano and JTBD:** Performance. "When I coach someone, I want to see what still stands between them and running the line alone."
- **AI cost:** none.
- **Dependencies:** Skill matrix, try-outs, records.
- **Verdict:** Slice 2.

### Skills workspace (`/learn/skills`)
- **Role and job:** Engineer, Admin. Set up Skills, Skill profiles per role, who is measured and which Training proves what.
- **Maturity:** Usable with live counts. Level 3 (Can teach it) has no evidence (LD3). One axe contrast rule remains.
- **Persona test:** no persona task. First-screen walk: 0.8 s, 130 words, 1 axe rule.
- **Evidence:** LD3 rationale: trainers carry onboarding (C7).
- **Kano and JTBD:** Must-be within slice 2. "When we set up competence, I want to say once which Training proves which Skill for which role."
- **AI cost:** none.
- **Dependencies:** Trainings, people and roles.
- **Verdict:** Slice 2.

### Training records (`/learn?tab=records`)
- **Role and job:** all roles. Show audit-ready proof of who passed which Training, which version and when.
- **Maturity:** Ship-ready as evidence: Training version, Document versions, answers and sources; new "Based on" Document version column; CSV export; rows open from the keyboard. Signed by a picked name (DC1).
- **Persona test:** A4 (Ingrid): PARTIAL, 7.7 s, 5 clicks. Export works; Lotte has no passed Line 2 changeover record (true in the data, she failed twice), shown once "Not passed too" is on.
- **Evidence:** V9 "voor ISO 9001... traceren of je wel of niet goed je mensen traint" (Oppr pitch). No direct customer quote about records.
- **Kano and JTBD:** Must-be. "When an inspector asks who was trained on which version, I want the answer and an export in one minute."
- **AI cost:** none.
- **Dependencies:** Attempts, Document versions.
- **Verdict:** Slice 2.

### Try-outs and sign-off (`/m/tryout`)
- **Role and job:** all roles. After a passed Training a trainer watches you do the job and signs it off.
- **Maturity:** Usable. Checklist; requests now show on the person page; People and Skills sits right under the Home inbox. No reminder to the trainer outside Home.
- **Persona test:** E4 (Sanne): Fatima's try-out sign-off reached through the matrix cell in about 2 s; before round 1 the request block sat about 2,800 characters below the fold.
- **Evidence:** No direct quote about try-outs. Closest: C15 veteran to newcomer transfer, C7 a new starter every three months, and V9 "daar moeten mensen op aftekenen" (Oppr).
- **Kano and JTBD:** Performance. "When a new Operator has passed the test, I want to watch them once and sign that they may do it alone."
- **AI cost:** none.
- **Dependencies:** Trainings, Skill matrix, check-in.
- **Verdict:** Slice 2.

---

## Wiki

### Find a Wiki (`/wiki`)
- **Role and job:** all roles. Search and browse short overviews of a job, a machine or an Area.
- **Maturity:** Usable. First line now calls them "reading guides... rebuilt when they change".
- **Persona test:** E5 start: open "Line 2 changeover essentials" in 1 click. First-screen walk: 0.7 s, 0 axe issues.
- **Evidence:** No customer quote. Oppr view only: V12 "hoe communiceer het je daarna tegen operators die nieuw binnenkomen en dan weer het wiel moeten gaan uitvinden?" (founder, to partners) and V10 Wiki as "gecureerde updates pagina... voor bepaalde audience" (founder).
- **Kano and JTBD:** Performance. "When I am new on a line, I want one short page per job instead of ten SOPs."
- **AI cost:** about $0 (wiki.find embedding rows round to zero).
- **Dependencies:** Wikis built from Published Documents.
- **Verdict:** Slice 3.

### Read a Wiki (`/wiki/:id`)
- **Role and job:** all roles. Read an overview with folded sections, sources and Ask.
- **Maturity:** Usable after the frontline pass: 44 px chips and source taps on the phone, "Open finding" no longer a dead end on the phone. Pages up to 1,379 words; a missing image shows as an empty box. Outside review round 1: the list said "about 9 min" while the page said "5 min read", and the source line said "all current" next to open Findings and an overdue review. Both now follow one rule: read time is counted the same way on list and page (a read over 8 minutes is called a long guide), and the source line says "latest versions" plus any open Findings and overdue reviews.
- **Persona test:** E5 read step; phone walk at 390 px: no overflow, 0 small targets.
- **Evidence:** as Find a Wiki. S31 shift handover leaks knowledge (market signal).
- **Kano and JTBD:** Performance. "When I prepare for a job, I want the essentials with a link to the full procedure."
- **AI cost:** none to read (the cost is in the rebuild).
- **Dependencies:** Published Documents, Ask.
- **Verdict:** Slice 3.

### Shape a Wiki (Wiki editing)
- **Role and job:** Engineer, Admin. Change the Outline, add blocks from sources, check against Published and apply.
- **Maturity:** Usable. Round 1: an empty Generate warns and opens Find sources prefilled; "Regenerate with these" in the sheet. Budget line is noisy and generated blocks need a clearer "checked by code" mark (P12).
- **Persona test:** E5 (Sanne): add a vacuum-alarm block from Published sources, check and apply, PASS, 35.5 s (25.3 s without AI wait), 14 clicks (estimated human 96 s; budget 300 s).
- **Evidence:** V10 founder intent; S10 observation versus cause (external practitioner). No direct customer quote.
- **Kano and JTBD:** Attractive. "When a Wiki misses something, I want to add it from our own Documents and know every claim is backed."
- **AI cost:** $0.035 per generated block (10 measured); each apply can trigger a rebuild at $0.23; Check against Published is about $0 (embedding only).
- **Dependencies:** Published Documents, AI limits (Wiki budget).
- **Verdict:** Slice 3.

### Guided creation (Wiki)
- **Role and job:** Engineer, Admin. Create a new Wiki with the AI drafting an outline from sources.
- **Maturity:** Usable. One measured run.
- **Persona test:** no persona task. First-screen walk: 0.8 s.
- **Evidence:** C5, C13 knowledge in heads; V10 founder intent.
- **Kano and JTBD:** Attractive. "When a job has no overview yet, I want a first outline from what is already Published."
- **AI cost:** $0.025 for the outline (wiki.guide, 1 measured) plus the first build at $0.23 (wiki.build, 62 measured, median 59 s).
- **Dependencies:** Published Documents.
- **Verdict:** Slice 3.

---

## Plant

### Plant model and glossary (`/plant`)
- **Role and job:** all roles. Who we are, Areas and Lines, processes, hazards, roles and the words used on the floor.
- **Maturity:** Usable. First line now says Plant is background, not a source. The overview is one long block of text.
- **Persona test:** O2 depends on it: "rupsaftrek" mapped to Haul-off through the glossary, PASS.
- **Evidence:** S19 voice recognition hears "Pikmin" for "pigment station" (Oppr test): floor words need a glossary. C26/27 language barriers (Oppr voice).
- **Kano and JTBD:** Must-be for Ask. "When Operators use their own words, I want the system to know what they mean."
- **AI cost:** none.
- **Dependencies:** none.
- **Verdict:** Slice 1.

### Propose Plant from Documents (`/plant/structure`)
- **Role and job:** Engineer, Admin. Let the AI read Documents and propose Areas, processes and terms to accept.
- **Maturity:** Demo. A visible "Propose from documents" link since round 1; no calls in the measured window.
- **Persona test:** no persona task. First-screen walk: 0.7 s.
- **Evidence:** No evidence found.
- **Kano and JTBD:** Attractive. "When we start, I want the glossary and structure suggested from our Documents, not typed by hand."
- **AI cost:** no "plant" calls in the window. Estimate about $0.10 per run (one Opus 5.5 call over several Documents).
- **Dependencies:** Published Documents.
- **Verdict:** Slice 3 (onboarding accelerator; could move to slice 1 once tested).

### Assets and QR codes (`/plant/assets`)
- **Role and job:** all roles. Every machine with its QR code, Documents, Trainings and who can work there.
- **Maturity:** Usable. Phone Asset page shows Ask, Safety, then saved and latest tasks first (top 3, "Show all"). Realism gap: the QR label holds only a token, so an iPhone or the phone's own camera cannot open the app from it (F1).
- **Persona test:** O1 (Lotte): Scan to the SOP in 5.1 s, 3 taps. On iPhones the in-app camera does not exist; the page now says so and does not pop the keyboard.
- **Evidence:** V5 "Als je voor een machine staat en je scant de QR-code, kan je vragen: mag ik de SOP zien" (Oppr pitch). C17 operators do not open procedures. The business plan makes QR to asset Documents a v1.0 platform requirement.
- **Kano and JTBD:** Must-be. "When I stand at a machine, I want its documents with one scan."
- **AI cost:** none.
- **Dependencies:** Plant model; printed labels (F1 needs a host name decision).
- **Verdict:** Slice 1, F1 is a ship gate.

---

## Try it

### Floor simulator (`/floor`)
- **Role and job:** all roles. Walk the plant on screen and see what an Operator gets after a Scan.
- **Maturity:** Demo, strong. Always a perfect signal; the status bar never changes (F2). Outside review round 2 saw a grey, empty plan for several seconds before the machines appeared; it now says "Loading the plant and its machines..." while it loads.
- **Persona test:** O5 can run here on desktop. First-screen walk: 0.8 s.
- **Evidence:** S30 "het voelde als een grote stap zonder duidelijk startpunt" (Vergeer, second-hand): a simulator lowers that step in a sale. No customer asked for it.
- **Kano and JTBD:** Attractive in a sales meeting, indifferent in daily use. "When I evaluate the tool, I want to see the floor experience without going to the floor."
- **AI cost:** none.
- **Dependencies:** Assets, phone app.
- **Verdict:** Showcase.

### Phone app: Scan, Find, Capture, Ask, Me (`/m`)
- **Role and job:** all roles. The Operator's floor app: scan a machine, find, capture, ask and see own learning.
- **Maturity:** Usable. 44 px targets, tab bar in thumb reach, signal banner ("No signal. Open pages still work."), Scan first, empty states teach. Gaps: QR token (F1), no offline cache after a cold start (F3), English interface (CD3), Engineer pages say "This page is for desk use" (P8). Round 1 after the outside review: "On the floor plan" is gone from the machine cards (CD5), and a jump to a section of a Document now lands below the sticky header, so the heading reads whole. In a browser without a camera the Scan screen offers a list; print the QR sheet for a live demo (F1 still applies).
- **Persona test:** O1 PASS 5.1 s; O2 PARTIAL 7.0 to 8.1 s (answer leans on the supplier manual, see Ask); O3 PASS 8.6 s; O5 PASS 61.3 s. Check-in 2 taps, 3.0 s.
- **Evidence:** C1, C17, C18, C10 (see Read a Document and Captures). C29 Omniplast manager installed the app himself. S18 hands-free capture on the floor.
- **Kano and JTBD:** Performance. "When I am at the line with gloves on, I want everything in two or three taps on one hand."
- **AI cost:** none of its own; Ask and Capture as listed.
- **Dependencies:** check-in, Assets, Documents, Ask, Captures, Learn (Me).
- **Verdict:** Slice 1 (Me tab shows learning once slice 2 is on). Top 3 to sell first, with Scan.

### Instructions, guided tours (`/instructions`)
- **Role and job:** all roles. One guided tour per function: what it is, why it matters, then the real screens.
- **Maturity:** Ship-ready. What, why, helps and steps per tour; tour targets check shows 0 missing after every lens. 39 tours for an Engineer is a lot; the slice-based tour sets in the verdict would cut that to the tours of what a plant bought.
- **Persona test:** no task; first-screen walk 0.7 s, 134 words.
- **Evidence:** S30 "klein beginnen" and C29 first-use friction: self-serve onboarding matters.
- **Kano and JTBD:** Attractive. "When I meet a new screen, I want a short tour of what it is for."
- **AI cost:** none.
- **Dependencies:** every function it tours.
- **Verdict:** Slice 1, shipping only the tours of the functions in the slice.

---

## Settings

### Company, people and shifts (`/settings?tab=people`)
- **Role and job:** Engineer, Admin. Company name and logo, who can check in with which role, and the shifts.
- **Maturity:** Usable. "Daily work lives in the other places" sets the tone.
- **Persona test:** no task; first-screen walk 0.7 s, 0 axe issues.
- **Evidence:** C29 login friction at Omniplast.
- **Kano and JTBD:** Must-be. "When we start, I want our people, roles and shifts set once."
- **AI cost:** none.
- **Dependencies:** none.
- **Verdict:** Slice 1.

### Document settings (`/settings?tab=naming`)
- **Role and job:** Engineer, Admin. Naming codes, document types, the PDF title page, safety icons and review rules.
- **Maturity:** Ship-ready. Editable type vocabulary, server-allocated codes, PDF cover, PPE catalogue.
- **Persona test:** no task; first-screen walk 0.8 s.
- **Evidence:** C22 ISO 9001 document control load (partner).
- **Kano and JTBD:** Must-be. "When we bring our documents in, I want our own codes and title page."
- **AI cost:** none.
- **Dependencies:** none.
- **Verdict:** Slice 1.

### Templates (`/settings?tab=templates`)
- **Role and job:** Engineer, Admin. Make and edit the templates new Documents start from.
- **Maturity:** Usable. Errors in plain words since the content lens.
- **Persona test:** no task; first-screen walk 0.7 s.
- **Evidence:** No evidence found.
- **Kano and JTBD:** Must-be. "When a new SOP starts, I want it to look like ours."
- **AI cost:** none.
- **Dependencies:** Document settings.
- **Verdict:** Slice 1.

### Training and floor settings (`/settings?tab=training`)
- **Role and job:** Engineer, Admin. What a new Training starts with; how shared phones and Captures behave (including media retention).
- **Maturity:** Usable.
- **Persona test:** no task; first-screen walk 0.7 s.
- **Evidence:** C10 shared phones with gloves; capture media privacy is implied by C24 security concerns.
- **Kano and JTBD:** Must-be within slice 2. "When we roll out phones, I want to decide how long photos and voice notes are kept."
- **AI cost:** none.
- **Dependencies:** Trainings, Captures.
- **Verdict:** Slice 2 (the Capture retention part ships with slice 1).

### My preferences (`/settings?tab=preferences`)
- **Role and job:** all roles. Your account, who is checked in, and what this browser remembers.
- **Maturity:** Usable.
- **Persona test:** no task; first-screen walk 0.7 s.
- **Evidence:** No evidence found.
- **Kano and JTBD:** Indifferent. "When something looks odd, I want to see who this screen thinks I am."
- **AI cost:** none.
- **Dependencies:** check-in.
- **Verdict:** Slice 1.

---

## Developer

### Developer overview (`/dev`)
- **Role and job:** Engineer, Admin. One card per tool for trying out models, connections and AI setups.
- **Maturity:** Usable (internal). Since round 1 the Embeddings lab and Analysis sit under "Internal labs" with a switch that shows them in the menu; off by default, so the menu shows only Overview, MCP and AI models and jobs.
- **Persona test:** A5 start: to AI usage in 2 clicks.
- **Evidence:** No evidence found.
- **Kano and JTBD:** Indifferent for a plant.
- **AI cost:** none.
- **Dependencies:** none.
- **Verdict:** Showcase (internal).

### AI models, search index and schedules (`/dev/ai`)
- **Role and job:** Engineer, Admin. See which model does what, whether search is up to date, and what runs by itself.
- **Maturity:** Usable (internal). Shows the daily Wiki safety-net rebuild, weekly Consistency check and daily usage roll-up.
- **Persona test:** no task; first-screen walk 0.6 s, 103 words.
- **Evidence:** S35 data security doubts, S19 EU hosting test: IT buyers will ask which model sees their data. This page answers it for us, not yet for them.
- **Kano and JTBD:** Indifferent for operations; useful for an IT review.
- **AI cost:** none.
- **Dependencies:** none.
- **Verdict:** Showcase (internal); reuse its model list in a customer data sheet.

### AI cost and limits: AI usage, Prices, Limits and Plan (`/dev/ai/usage`, `/dev/ai/prices`, `/dev/ai/limits`)
- **Role and job:** Engineer, Admin. Read what every AI call costs today, 7 and 30 days, and where it goes; export CSV; set the Price table, the Wiki AI limits, the kill switch and the Plan.
- **Maturity:** Ship-ready. Already one page: three tabs of AI models and jobs. Opens on 30 days (round 1), per feature, person and target, CSV export. Kill switch on, 24 h count shown (103 of 1,000 in A5); changes need an Admin. Since the outside review an Admin reaches it from its own "AI cost and limits" entry in an Admin group of the menu, not only under Developer, and the page says when there is too little history for a monthly forecast instead of inviting a guess from one busy day ("No monthly forecast yet: AI was used on 2 of the last 30 days"). The table region is not keyboard focusable (P14).
- **Persona test:** A5 (Ruud, Admin): 30-day total $19.79 and top feature (Wiki build $13.85), CSV, kill switch and limits: PASS, 3.9 s, 6 clicks (budget 150 s). Limits read only, not saved by design. Outside review round 2 read $22.60 over 597 calls, 96% system jobs, and could not confirm "AI cost is not the constraint" from the page. Since round 2 the People and system jobs card says what share went to publish follow-ups (Wiki rebuilds and Consistency checks) and what one publish costs.
- **Evidence:** C28 "Hoe ziet de abonnementsprijs er dan uit?" and "wat ik aan kosten moet denken" (prospects, direct); S14 price anchors; V4 cost and runaway worries (Oppr).
- **Kano and JTBD:** Must-be for IT and finance. "When the AI runs by itself, I want to see what it costs and where, and one switch to stop it."
- **AI cost:** none.
- **Dependencies:** price table.
- **Verdict:** Slice 1, as the Admin page "AI cost and limits" (the Admin entry exists; giving it a page of its own outside AI models and jobs is the remaining step).

### Connect Claude with MCP (`/dev/mcp`)
- **Role and job:** Engineer, Admin. Let an outside assistant read Published knowledge and bring in Drafts, with keys and an audit log.
- **Maturity:** Usable. Keys, audit log, test console. Two axe rules remain (contrast, scroll region).
- **Persona test:** no task; first-screen walk 0.7 s, 105 words.
- **Evidence:** No customer evidence. S35 data security doubts point the other way for now.
- **Kano and JTBD:** Attractive for IT teams that already run an assistant. "When our engineers use their own AI assistant, I want it to read our Published Documents safely."
- **AI cost:** about $0.000002 per query (embedding); no calls in the window.
- **Dependencies:** Published Documents, embeddings index.
- **Verdict:** Showcase; offer as an add-on after slice 1 when a customer asks.

### Embeddings lab (`/dev/embeddings`)
- **Role and job:** Engineer, Admin. Try a search model in the browser and compare it with production search.
- **Maturity:** Demo. Runs in a Web Worker; the WebGPU route is untested and headless browsers have none. Hidden from the menu since round 1 (Internal labs switch on the Developer overview).
- **Persona test:** no task; first-screen walk 0.7 s.
- **Evidence:** S19 EU or local model hosting is being explored internally.
- **Kano and JTBD:** Indifferent for a plant.
- **AI cost:** none (runs in the browser).
- **Dependencies:** none.
- **Verdict:** Drop (proposed) from the customer build; keep as an internal lab.

### Analysis case files (`/dev/analysis`)
- **Role and job:** Engineer, Admin. Find and read the case files behind larger changes.
- **Maturity:** Usable as an internal record. About 970 em dashes in the case files need a read-through (CD4). Hidden from the menu since round 1 (Internal labs switch); /analysis addresses still open.
- **Persona test:** no task; first-screen walk 0.9 s, 1 axe rule.
- **Evidence:** No evidence found.
- **Kano and JTBD:** Indifferent for a plant.
- **AI cost:** none.
- **Dependencies:** none.
- **Verdict:** Drop (proposed) from the customer build; keep internally.

---

## AI cost: method and worked example

**How we got the numbers.** We ran the internal read-only query `aiUsage:exportPage` with `npx convex run` on Convex DEV (the same rows the Export CSV button on `/dev/ai/usage` writes), for the last 60 days, and grouped the rows per feature. Call-level rows only reach back to 25 Oct 2026 14:27 UTC, because older rows are rolled up into day totals every night (`aiUsage.rollupOld`). The window holds 517 calls costing $20.49, almost all from this round's reseeds and persona walks. Costs use the app's price table: Claude Opus 5.5 at $4 in and $20 out per million tokens, Gemini 3.1 Flash-Lite at $0.25 and $1.50, Gemini embeddings at $0.15 in. The Admin walk read $19.79 for 30 days (479 calls) on the Usage page earlier the same night; the outside review read $22.60 over 588 calls. All of it falls on two days, so the in-app 30-day figure is not a monthly cost; the page now says so.

| Feature (usage row) | Calls | Total | Per call | Typical use | Cost per typical use |
|---|---|---|---|---|---|
| wiki.build | 62 | $14.07 | $0.227 | one Wiki build or rebuild | $0.23 |
| consistency | 200 | $5.05 | $0.025 | one Document checked (5 calls) | $0.12 |
| training | 17 | $0.53 | $0.031 | assistant turn / Attempt feedback | $0.09 / $0.009 |
| wiki.block | 18 | $0.37 | $0.021 | one generated block (plus embedding) | $0.035 |
| revision | 5 | $0.24 | $0.047 | one Proposed revision | $0.047 |
| capture | 14 | $0.10 | $0.007 | one handed-in Capture (2 calls) | $0.014 |
| ask | 36 | $0.08 | $0.002 | one question (2 calls) | $0.0013 median |
| embed.passage | 87 | $0.03 | $0.0003 | index one Document version | $0.0003 |
| wiki.guide | 1 | $0.02 | $0.025 | one Wiki outline | $0.025 |
| embed.image | 32 | $0.02 | $0.0006 | index one image | $0.0006 |
| wiki.check, wiki.find, embed.query | 45 | $0.00 | ~$0 | check or search | ~$0 |

No calls in the window for: writer (Guided creation, Document), import (Convert), insights, plant (Propose), image.describe, image.generate, mcp, wiki.rewrite. Their costs in this map are estimates, marked as such.

**Worked example (assumption, not measured): a plant with 30 Operators and 60 Documents, per month.** 4,500 questions ($6), 100 Captures ($1.40), 300 Training Attempts ($2.70), 10 Training builds ($5), 20 publishes with their Consistency checks and two Wiki rebuilds each ($11), the weekly Consistency check over 60 Documents ($29), 10 Proposed revisions ($0.50). Total about $55 per month. The weekly Consistency check is half of it; the Plan's feature limits and kill switch already cover it.

---

## Needs customers raised that have no function yet

| Need | Evidence | Note |
|---|---|---|
| Breakdown (storing) log and escalation: what was tried, who is coming, why it keeps failing | C26 "elke keer valt hij uit... we weten niet wanneer en waarom" (relayed); C27 "nu staan we alweer 3 uur bijna stil. Het is slechte communicatie."; V11 "ze hebben helemaal geen feedback of ze dat echt geprobeerd hebben" (Oppr, service calls); S16 pattern spotting across notes (competitor) | Captures cover the "how I fixed it" half. The log, escalation and pattern parts belong with LOGS and IDA in the wider platform. |
| Shift handover | C21 "ook overdracht tussen operators" (partner); S31 "Shift handover is the most discussed pain point" (market listening) | The business plan puts handover rounds in LOGS. Knowledge could add "what changed since your last shift" (new Published versions, open Findings). |
| Time lost to reporting and logging per shift | S34 Chemours and Covestro (second-hand) | LOGS territory. |
| Instructions and interface in the Operator's language | C26b translated SOPs for knowledge migrants (Oppr proposal); C27b "mijn operators komen uit allemaal Polen" (Oppr voicing a director); CD3 | Ask already answers in Dutch. A Dutch phone interface (CD3) and translated reading of Published Documents are the next steps. |
| Proof of the tool's own security and data residency | C24 "Hebben jullie ISO-certificaten met betrekking tot de beveiliging van de data?" (Arla); C24b external cloud would be laughed at (Arla, paraphrased); S35 "data security doubts" (iQatalyst, second-hand) | Not a function: a security pack (hosting region, models used, retention, audit log). A gate for large plants. |
| Absence and shift planning | C25 team leaders lose time on personnel planning (Arla, paraphrased); P4 | P4 (mark absent tonight) is the small first step. |
| Personal sign-in for managers on the phone | C29 "echter heb ik geen inloggegevens" (Omniplast) | Same root as DC1: real accounts or PINs. |
| Pricing and packaging clarity | C28 two prospects asked for cost early; C12 "voor 75.000 kost, zeg maar een extra operator" (Enpiro); C21c "Hoeveel ga je me dan rekenen?"; S14 anchors | Not a function. The slices above are a natural price ladder. |
| Willingness to pay for customer-facing support | C29b "Daar wil niemand voor betalen in eerste instantie" (Hoost) | Confirms selling to the plant's own operations first. |

---

## Proposals carried from this round (not built)

From `proposals.md`. Each needs a product decision or is a larger change.

**Round 1 (persona walks)**
- **P1.** Capture starts with "Which machine?" on the phone, then suggests the job.
- **P2.** Role-aware Learn: Operators see only "Trainings for you". (Round 1 after the outside review did this for Documents and Settings: an Operator gets only All documents and Captures as tabs, no New document button, a note on Settings, and an old /docs/new link explains itself.)
- **P3.** Blocked Training offers a way forward: ping the owner; keep wording-only changes startable.
- **P4.** Mark a person absent tonight in the coverage answer.
- **P5.** Accessible names of the check-in chip and Ask button start with their visible text (change together with the walk helper).
- **P6.** Dismiss a Finding with a reason.
- **P7.** One-line Document insights at the top of the right rail.
- **P8.** Decide on read-only Document, Finding and Skill matrix pages on the phone for Engineers.
- **P9.** Close Ask on route change unless pinned, or collapse low-priority columns.
- **P10.** Training attempt shows one step at a time.
- **P11.** Label the Round stand-in QR sheet as a test aid.
- **P12.** One Wiki budget chip; "Checked by code against its passage" next to Grounded.
- **P14.** Keyboard access for the scrollable table wrapper (AI usage).
- **P15.** Reseed before the next measured pass and align personas with the seed.

**Frontline UX**
- **F1.** QR labels carry a link (`/m/q/:token`), so any phone camera opens the app. Ship gate for slice 1.
- **F2.** A Good / Weak / None signal switch in the Floor simulator.
- **F3.** Saved Documents readable without signal after a cold start (service worker cache).
- **F4.** "Bright hall" display option on Me.
- **F5.** "Not answered. Ask again" under unanswered phone questions.
- **F6.** Floor sizes for the Capture status pill and step numbers.

**Document control**
- **DC1.** PIN or badge before any sign-off. Ship gate for every slice.
- **DC2.** Read-and-confirm for small Significant changes.
- **DC3.** Document master list export. Done for CSV (Master list button on Documents); a print view is not built.
- **DC4.** Store the checked-in person on the author sign-off of an AI Proposed revision.
- **DC5.** Repeat the print control band on every printed page.

**L&D**
- **LD1.** Re-train window after a Significant change, chosen at publish. Gate for slice 2.
- **LD2.** Fix the re-training deadlock in the Publish flow ("Update the Training now", "N people wait"). Gate for slice 2.
- **LD3.** Evidence for level 3, Can teach it.
- **LD4.** Time to competence for new starters.
- **LD5.** "Who may do this work" lookup on the Skill matrix.

**Content design**
- **CD1.** Store the on-hold reason as data and word it per audience.
- **CD2.** One shared error helper instead of seven local ones.
- **CD3.** Dutch interface for the phone app.
- **CD4.** Read-through of the Developer case files to remove em dashes.
- **CD5.** Drop "On the floor plan" from phone Asset cards. Done in round 1 for the scan cards; the Asset page header keeps it.

---

## Evidence register

C = customer, prospect or partner voice. S = second-hand, market or competitor signal. V = Oppr's own view (pitch or internal). The Voice column says how direct each line is: *direct* (said to us), *relayed* (someone passing on what others say, including Oppr recalling a prospect), *paraphrased* (call notes, not a transcript), *market* (summaries of public or competitor signals), *Oppr*. Of the 34 C lines, 29 are direct; the rest are relayed, paraphrased or Oppr. Speakers are named by role. Quotes stay in the original language.

| Id | Voice | Quote | Source | Date | Speaker role |
|---|---|---|---|---|---|
| C1 | direct | "We hebben wel werkinstructies. Maar die staan op de server of in ons digitale managementsysteem. En, maar die blijven daar eigenlijk. Die komen als het ware niet op de werkvloer terecht." | Pocket 9d0a5b3a, 32:36 | 2026-06-18 | customer representative, OmniPlus |
| C2 | direct (weak pain) | "Nee, werkinstructie leeft eigenlijk niet bij ons, nee toch?" | Pocket 9d0a5b3a, 32:30 | 2026-06-18 | customer representative, OmniPlus (weak pain) |
| C3 | direct | "heel veel training on the job ... we hebben trainingsmodules en we hebben skill matrices, et cetera, Uh, maar dat is allemaal redelijk vrijblijvend." | Pocket 9d0a5b3a, 33:21 | 2026-06-18 | customer representative, OmniPlus |
| C4 | direct | "Alles wat je in het begin doet, is vastleggen. Dat kost tijd natuurlijk." | Pocket 9d0a5b3a, 38:56 | 2026-06-18 | customer representative, OmniPlus |
| C5 | direct | "Maar je krijgt gewoon slecht of moeilijk of moeizaam de ervaring van de operators, uh, uit hun hoofd op papier, uh, of in, in een, werkinstructie." | Pocket fbaa5997, 09:42 | 2026-06-16 | executive director, Hoost Group |
| C6 | direct | "Het moet heel laagdrempelig zijn. Het zijn geen schrijvers, het zijn geen, ze gaan geen uitgebreide rapportages, euh, maken." | Pocket fbaa5997, 35:16 | 2026-06-16 | executive director, Hoost Group |
| C7 | direct, about a customer | "Dus iedere drie maanden moet er iemand nieuw worden opgeleid." | Pocket fbaa5997, 08:51 | 2026-06-16 | executive director, Hoost Group (about a customer) |
| C8 | direct | "we moeten nieuwe operators trainen op een installatie, maar ze zit op afstand. Hoe maakt hij nou gebruik van best practices?" | Pocket fbaa5997, 07:51 | 2026-06-16 | executive director, Hoost Group |
| C9 | direct | "Dus als je ... wat meer kan vastleggen wat ze moeten doen ... dat we zeker weten dat ze allemaal hetzelfde rondje lopen, hetzelfde scannetje maken, fotootje maken, dat, daar zie ik wel wat in." | Pocket fe5da37a, 27:52 | 2026-09-15 | prospect, Enpiro |
| C10 | direct | "zitten nu die operators nog met hun dikke vingers te doen eigenlijk. Uh, waar ze allemaal een hekel aan hebben." | Pocket fe5da37a, 27:12 | 2026-09-15 | prospect, Enpiro |
| C11 | direct | "We willen juist niet weer afhankelijk zijn van die op-- ja, je bent altijd afhankelijk van een operator, maar minder afhankelijk. Dus dat je makkelijker nieuwe operators kan inpassen." | Pocket fe5da37a, 50:16 | 2026-09-15 | prospect, Enpiro |
| C12 | direct | "Nee, want ik snap wel dat het best voor 75. 000 kost, zeg maar een extra operator." | Pocket fe5da37a, 49:44 | 2026-09-15 | prospect, Enpiro (no commitment) |
| C13 | direct | "ik denk inderdaad dat er heel veel kennis verloren staat. Die wordt gewoon niet goed genoeg gebruikt. Er zit zoveel in de hoofden van een aantal goede en ervaren operators." | Attio recording daef1720 | 2026-03-09 | prospect, manufacturing manager |
| C14 | direct | "er hier en daar wat mensen dan wel met pensioen zijn gegaan en we toch wel veel kennis verliezen ... We hebben echt een probleem." | Attio recording ad8e9151 | 2026-08-28 | prospect, manufacturing lead |
| C15 | direct | "Bert die er 35 jaar werkt en die elke machine blind kent. Dat de gast van twintig die er een jaar werkt heeft dat niet. Kun je dat proces, die knowledge transfer, daar dingen mee doen?" | Attio recording 99afcaf7 | 2026-08-04 | prospect, advisor |
| C16 | direct | "een van de zaken waar wij tegenaan lopen is dat eigenlijk de operators nog in het leertraject zitten. Een groot aantal is nieuw bij de plant... er zit nog weinig in het hoofd van de operators" | Attio recording a1114503; also Pocket fe5da37a, 25:16 | 2026-09-15 | prospect, plant leader (Enpiro) |
| C17 | direct, speaker not labelled | "Volgens mij kijken ze er nooit naar. [naar de procedures]" | Attio recording 9f66fc48 | 2026-09-16 | participant in the partner session of 2026-09-16 (same recording as C21 to C23); the recording does not say who |
| C18 | direct | "naar de computer lopen is een eind weg... als er dan een storing is geweest, dan kunnen ze gelijk inspreken hoe ze het opgelost hebben" | Attio recording 0c3e5e03 | 2026-08-28 | prospect, operations and maintenance |
| C19 | direct | "Ze werken vijf ploegendienst... ze hebben allemaal de boekjes in de zak" | Attio recording 0c3e5e03 | 2026-08-28 | prospect, operations and maintenance |
| C20 | direct | "Maar kan een operator ook... vragen stellen? Ik loop nu daar tegenaan." | Attio recording 6fa3780f | 2026-03-11 | prospect |
| C21 | direct | "ik wil iets in de manual opzoeken. Misschien is daarom wel een interessante journey... ook overdracht tussen operators" | Attio recording 9f66fc48 | 2026-09-16 | partner, consultant |
| C21c | direct | "Dat zou mijn eerste vraag zijn: top, je laat voor 25.000 zien dat ik een groot probleem heb. Hoeveel ga je me dan rekenen om dat probleem op te lossen?" | Attio recording 99afcaf7 | 2026-08-04 | prospect, advisor |
| C22 | direct, describing a plant manager | "alle documenten moeten in orde zijn. De ISO 9001 moet in orde zijn en dat is eigenlijk gewoon heel kort gezegd even de bureaucratische last waar deze persona mee moet dealen" | Attio recording 9f66fc48 | 2026-09-16 | partner, consultant describing a plant manager |
| C23 | direct | "We hebben een SOP aangepast omdat we iets geleerd hebben... maar wie waarborgt dat? Hoe ziet een conclusie eruit en hoe ga je die conclusie handhaven?" | Attio recording 9f66fc48 | 2026-09-16 | partner, consultant |
| C24 | direct | "Hebben jullie ISO-certificaten met betrekking tot de beveiliging van de data?" | Attio recording c7d841ea | 2026-10-15 | Operations Engineering Specialist, Arla Foods |
| C24b | paraphrased | "Ik denk dat ze me in mijn gezicht uitlachen [als ik data naar een externe cloud wil sturen]" | Attio note 4fc45479 (call analysis, paraphrased) | 2026-10-15 | Operations Engineering Specialist, Arla Foods |
| C25 | paraphrased | "teamleiders zitten veel achter de computer (administratieve last, uren controleren, personeelsplanning)" | Attio note 4fc45479 (call analysis, paraphrased) | 2026-10-15 | Operations Engineering Specialist, Arla Foods |
| C26 | relayed | "we hebben zo'n CO2 liquefaction machine, elke keer valt hij uit, de operator gaat erheen en reset hem, en we weten niet wanneer en waarom" | Attio recording c6106d81 (relayed by Oppr) | 2026-07-31 | plant staff, relayed |
| C26b | Oppr | "we kunnen eigenlijk kosteloos bij jullie testen... over mensen, kennis, vertalingen, trainingen, SOP's, kennismigranten" | Attio recording 47aa1d10 | 2026-10-21 | Oppr (proposal to a prospect) |
| C27 | direct, speaker inferred | "We hebben een neer kapot en allemaal technische support gebeld... nu staan we alweer 3 uur bijna stil. Het is slechte communicatie." | Attio recording dde4e20c | 2026-10-22 | frontline or shift staff (inferred) |
| C27b | Oppr | "mijn operators komen uit allemaal Polen, spreken geen Engels. Ik weet niet hoe ik het moet aanpakken." | Attio recording 99afcaf7 | 2026-08-04 | Oppr voicing a typical operations director |
| C28 | direct | "Hoe ziet de abonnementsprijs er dan uit?" and "Kan je een beetje beschrijven hoe zo'n traject dan zou lopen qua tijd en ook wat ik aan kosten moet denken?" | Attio recordings 0c3e5e03 and a1114503 | 2026-08-28, 2026-09-15 | prospects (operations; plant leader) |
| C29 | direct (forwarded email) | "Ik wil samen met Marc gaan starten met de OPPR app om zelf ook de rondes te gaan lopen. Ik heb de app inmiddels geinstalleerd op mijn telefoon, echter heb ik geen inloggegevens." | Slack #20-dev, ts 1790329548.163389 (forwarded email) | 2026-09-25 | Manager Operations, Omniplast (customer) |
| C29b | direct | "Daar wil niemand voor betalen in eerste instantie ... de primaire focus ligt wel heel erg op onze eigen assets op dit moment." | Pocket fbaa5997, 40:57 | 2026-06-16 | executive director, Hoost Group |
| S2 | market | "Tribal and operator knowledge is rising: a recycling OEM, a CMMS vendor and a startup all pitch capturing what veterans know" | Slack #30-marketing, ts 1792393776.299599 | 2026-10-19 | Oppr market listening summary |
| S7 | market | "Human in the loop is rising: Siemens, Evos, IFS, Schneider Electric and TwinThread all framed AI as proposing while a person decides." | Slack #30-marketing, ts 1792393776.299599 | 2026-10-19 | Oppr market listening summary |
| S10 | relayed by Oppr | "keep what the operator observed separate from the suspected cause, and record whether the next test supported it." | Slack #floris-cos, ts 1792566315.321399 | 2026-10-21 | external practitioner (LinkedIn comment, summarised) |
| S14 | relayed by Oppr | "10-week, EUR 25K Proof of Value ... long-term contract (EUR 50-75K+ annually)" | Slack #40-commercial, ts 1787902423.195729 | 2026-08-28 | Oppr, price anchors |
| S16 | market | "separate remarks over three days ... get connected into one warning about a failing cooler" | Slack #24-dev-hardware, ts 1792160102.161679 | 2026-10-16 | Oppr summarising competitor Relay |
| S18 | relayed by Oppr | "We want them to record all their observations. Theoretically 75% of those should not be relevant for the control room operator." | Slack #24-dev-hardware | 2026-10-16 | Oppr, field observation at Attero |
| S19 | relayed by Oppr | "operator says 'pigment station 1,' speech recognition sometimes hears 'Pikmin'/'Pygment'/'Pikment.'" | Slack #p-local-llm-service, ts 1792420305.477299 | 2026-10-19 | Oppr, local model test |
| S30 | relayed by Oppr | "Je gaf aan dat het voelde als een grote stap zonder duidelijk startpunt. Wat als we klein beginnen: een probleem op een lijn, dat jij kiest?" | Slack #floris-cos, draft 29, ts 1792397324.266999 | 2026-10-19 | Oppr recalling a prospect objection (Vergeer) |
| S31 | market | "Shift handover is the most discussed pain point across X and Reddit." | Slack #30-marketing, ts 1791836888.382609 | 2026-10-12 | Oppr market listening summary |
| S32 | market | "A searchable record of the shift ... Ask questions about what happened" | Slack #24-dev-hardware, ts 1792160102.161679 | 2026-10-16 | Oppr summarising competitor Relay |
| S33 | relayed by Oppr | "Vorig jaar spraken we over papier en Excel op tablets naast SAP." | Slack #floris-cos, draft 30 | 2026-10-19 | Oppr recalling a prospect (Yara) |
| S34 | relayed by Oppr | "de tijd die per ploeg in rapportage gaat / de tijd die per ploeg in logging gaat" | Slack #floris-cos, drafts 21 and 23 | 2026-10-19 | Oppr recalling two prospects (Chemours, Covestro) |
| S35 | relayed by Oppr | "no room for projects, data security doubts" | Slack #floris-cos, draft 31 | 2026-10-19 | Oppr summarising a prospect (iQatalyst) |
| S36 | relayed by Oppr | "Je zei eerder dat veel kennis in hoofden en Excel zit." | Slack #floris-cos, draft 25 | 2026-10-19 | Oppr recalling a prospect (Ketjen) |
| V1 | Oppr | "wat je wil voorkomen is dat het een vergaarbak wordt waar iedereen zijn eigen versie van de waarheid in kan zetten en AI eigenlijk dan moet gaan zoeken." | Pocket f19eeb58, 09:06 | 2026-10-15 | Oppr team |
| V2 | Oppr | "je hebt een auteur, je hebt een reviewer en je hebt een approver ... uiteindelijk moet het afgetekend worden door iemand met autoriteit" | Pocket f19eeb58, 09:06 and 14:15 | 2026-10-15 | Oppr team |
| V3 | Oppr | "wat is informatie waar ik vanuit mag gaan dat het goed is en wat is informatie die gewoon afgevangen is." | Pocket f19eeb58, 12:30 | 2026-10-15 | Oppr team |
| V4 | Oppr | "iemand ... gaat voor zichzelf maar wat beginnen, terwijl die AI gewoon keihard aan het hallucineren kan zijn" | Pocket f19eeb58, 13:26 | 2026-10-15 | Oppr team |
| V5 | Oppr | "Als je voor een machine staat en je scant de QR-code, kan je vragen: mag ik de SOP zien die hoort bij het schoonmaken? Of de handleiding van de fabrikant?" | Attio recording 6fa3780f | 2026-03-11 | Oppr pitch |
| V6 | Oppr | "die verificatie loop, die doet niemand. Ik kan die SOPs wel updaten, maar dat moet ik met de hand doen" | Attio recording 99afcaf7 | 2026-08-04 | Oppr describing the market |
| V7 | Oppr | "als een operator een SOP volgt en zegt: bij stap vier draai ik met de klok mee... Als heel veel mensen dat doen kan de houder zeggen, we moeten het proces aanpassen" | Attio recording 6fa3780f | 2026-03-11 | Oppr pitch |
| V8 | Oppr | "iedereen wil ISO 9001, want dat is gewoon een stempel van: ik werk behoorlijk en ik kan terugvinden wat er aan de hand is." / "voor de live software moet alles auditbaar zijn." | Pocket cb47a902, 56:03 and 54:58 | 2026-09-10 | Oppr team |
| V9 | Oppr | "voor ISO 9001... eist dat als er iets misgaat, dat je kan traceren of je wel of niet goed je mensen traint. Een SOP en daar een training van maken is jouw officiele manier om een wijziging door te voeren. En daar moeten mensen op aftekenen." | Attio recording 9f66fc48 | 2026-09-16 | Oppr pitch to partners |
| V10 | Oppr | "idee met wiki was dat je een gecureerde updates pagina maakt in vorm wiki ... Wiki zegt nooit iets nieuws, maar is alleen snapshot van waar we staan, gemaakt specifiek voor bepaalde audience." | Slack DM | 2026-09-30 | Oppr founder |
| V11 | Oppr | "Ja, lijn doet het niet. Ja, maar heb je dit en dit geprobeerd? Ja, heb ik geprobeerd, maar ze hebben helemaal geen feedback of ze dat echt geprobeerd hebben." | Pocket fbaa5997, 38:56 | 2026-06-16 | Oppr founder describing service calls |
| V12 | Oppr | "Maar hoe communiceer het je daarna tegen operators die nieuw binnenkomen en dan weer het wiel moeten gaan uitvinden?" | Attio recording 9f66fc48, 58:12 to 58:45 (also Pocket baeafebf, 24:51) | 2026-09-16 | Oppr founder, to partners (earlier listed as C21b with an unclear speaker) |

**Evidence gaps.** No source gave a direct customer ask for: periodic review, a new skill matrix, Wikis, the Floor simulator, the Consistency check, or AI cost tracking as such. Document control demand comes mostly from partners and Oppr itself. The Less or More operator interviews are planned but their findings are not in any source yet.
