# Oppr Knowledge

A factory's controlled knowledge base, formerly "Oppr DOCS". Everyone working in the plant can find and question it. Content is authored, reviewed and published under ISO 9001-style control, and the system can show who is trained and skilled in what. Oppr Knowledge is an umbrella over several pillars: Documents, Trainings, Skills and Wikis. More pillars may be added later.

This build is an **internal technical showcase**. Its job is to cement Oppr's ideas and approaches. No external company works in it. Depth goes where it proves the concept, not where it would harden it for production.

It is built inside the existing DOCS codebase, starting from a **fresh, minimal seed**: one small plant with recognisable names, a handful of Assets, Documents and people. Each concept is built and tested end to end on that small set before more content is added. That way design problems surface while they are still cheap to fix, not after hundreds of Documents exist.

The UX follows the Homerun approach: usable and understandable without explanation. Navigation is shallow, settings are never nested four levels deep, and the obvious next action is always visible.

## Language

### Knowledge and control

**Knowledge**:
Everything an employee may rely on. Only Published content counts as Knowledge.
_Avoid_: content, data, info

**Published**:
Authored, reviewed, approved and released, so it is available to everyone and treated as the truth. Ask, Wikis and Trainings use Published content only.
_Avoid_: live, active, final

**Periodic review**:
A recurring moment when a Published Document must be checked again and either confirmed or revised.
_Avoid_: refresh, update cycle

### People

**Operator**:
A frontline person on the shop floor. Reads, Scans, Asks and does Trainings.
_Avoid_: user, worker

**Engineer**:
A desk-based person who authors, reviews and approves Knowledge and looks at Insights.
_Avoid_: admin, author (author is a role on a Document, not a kind of person)

**Anonymous**:
The default mode on the floor. Reading, Scanning and Asking work without saying who you are. Questions count only towards Document insights.

**Checked in**:
The mode in which the system knows who the person is. A person checks in by picking their name. In the showcase there is no PIN or badge. Checking in is required for anything that produces proof: Trainings, Rounds and sign-offs. Everywhere else it is optional, and it makes Ask personal, so it feeds that person's Learn. There are exactly these two modes and no others.
_Avoid_: logged in, identified, personal mode

### Documents

**Document**:
A controlled, versioned piece of Knowledge with an immutable naming code, such as an SOP, a work instruction or a manual.
_Avoid_: file, page, article

**SOP**:
A Document type, built natively in the Oppr editor, that describes how a task is done.

**Convert**:
Turning a PDF, for example an existing SOP or work instruction, into a native, editable Oppr Document. The PDF is the source. The result is owned and edited in Oppr from then on.
_Avoid_: import (on its own)

**Wrapped manual**:
A Document whose body is a supplier PDF that is embedded unchanged, such as a machine manufacturer's manual. Oppr adds the outline around it: naming code, Assets, review and status. It is never edited, only replaced by a newer PDF.
_Avoid_: attachment, upload

**Controlled copy**:
The stamped PDF of a Wrapped manual. Oppr adds a band above and below every page, outside the supplier's content, with the naming code, title, version and status. Only the Published version's band says "Controlled copy"; every other copy says "not for use". The supplier original is kept next to it, unchanged.
_Avoid_: watermarked PDF

**Imported draft**:
A Draft that an outside model created through the MCP server, from a customer's legacy document. It has a source note, and it goes through the same review as any other Draft. Nothing imported is Published until an Engineer publishes it.
_Avoid_: import (on its own), migrated document

### Assets

**Asset**:
A physical piece of equipment in the plant. It carries a QR code that leads to its Documents and Trainings.
_Avoid_: machine, equipment (in code), object

**Floor simulator**:
A desktop-only showcase page that stands in for being in the field. A floor plan shows about five Assets, each with its QR code. Next to it, an emulated phone screen shows what an Operator would see. Picking an Asset plays the "walking there" moment. During a Round, the wrong Asset gets "You're at the wrong machine, go to X". No real phone or real QR scanning is involved. The design comes later. For now it is a lightweight placeholder page that describes the plan.
_Avoid_: floor plan page, demo mode, mobile app

**Scan**:
Reading an Asset's QR code to get to its Knowledge. Anonymous by default.

### Training

**Training**:
The fixed, approved definition of what a person must prove: its Learning objectives, its source Documents, its stops (for a Round) and its pass mark. It is the same for everyone. It holds the training material only, not the person's progress.
_Avoid_: course, module, quiz

**Learning objective**:
One thing a person must know or be able to do, stated in a Training and traceable to a Published Document. Every Attempt must test every objective.
_Avoid_: question, learning goal, topic

**Attempt**:
One person doing a Training once. The AI generates the Attempt's questions fresh, within the Training's Learning objectives. No two people get the same wording, so they can't pass answers to each other, but everyone is tested on the same things.
_Avoid_: session, run, variant

**Round**:
A Training done physically in the plant, like a treasure hunt. The Operator walks to Assets, Scans each one, and answers questions or adds a photo or voice note.
_Avoid_: tour, hunt, walk

**Training record**:
Proof that a named person passed an Attempt of a Training, and when, including which questions they got and how they answered. This is what a labour inspector asks for after an incident.
_Avoid_: certificate, completion

### Learn (Skills)

**Learn**:
The pillar that builds and keeps up what people can do. It contains Skills, Skill profiles and Trainings. Its focus is a person's ability to run the plant, not ticking off completed courses. It adapts to each person's questions and remarks.
_Avoid_: Academy, LMS, e-learning

**Skill**:
A named ability that a person holds at a level, for example "Operate extruder line 2". It is linked to one or more Published Documents. Levels:
- 0: not trained
- 1: trained, meaning they passed a Training (set automatically)
- 2: qualified, meaning an Engineer signed off on practice
- 3: can train others (Engineer sign-off)

A Skill may also have a validity period.
_Avoid_: competence, qualification (as separate terms)

**Skill profile**:
The set of Skills, with their target levels, that a role or a person needs to run their part of the plant, for example "Line 2 operator".
_Avoid_: job description, curriculum

**Skill matrix**:
The grid of people against Skills that shows current against target level, gaps, expiring Skills and re-training needs.
_Avoid_: competency grid

**Significant change**:
A mark the author puts on a new Document version. It means the change affects how the work is done. Only a Significant change flags "re-train needed" on the linked Skills. Typo fixes do not.
_Avoid_: major version, breaking change

### Wikis

**Wiki**:
An AI-generated overview of the Published Knowledge that is relevant to a particular audience, bounded by its Scope. People never write a Wiki by hand. It is regenerated on a schedule, and whenever one of its sources gets a new Published version, so it stays correct without a human author. It is not a status card for an Asset.
_Avoid_: page, article, record card

**Scope**:
The boundary that says which Knowledge something draws from: any combination of disciplines, areas, Assets and Documents. Ask already uses a simple Scope (one Document, one Asset or the whole library). A Wiki's Scope is the generalised version of that.
_Avoid_: filter, selection, context

### Guided creation

**Guided creation**:
The core interaction pattern of Oppr Knowledge. A person says in natural language what they want. The AI asks follow-up questions and proposes a Draft. The person adjusts the Draft with ordinary controls and confirms it. Conversation is for intent. Controls are for precision and for the final decision. Nothing is created without confirmation.
_Avoid_: wizard, chatbot, prompt

**Draft**:
The structured proposal the AI produces during Guided creation, for example a Wiki's title, purpose and Scope shown as editable chips. It lives in the same place as the conversation and is the hand-off point between talking and choosing.
_Avoid_: preview, suggestion

### Assistance and insight

**Ask**:
Asking a question in natural language and getting an answer drawn only from Published Knowledge, with sources. Anonymous on the floor.
_Avoid_: chat, search, Ask IDA (that is the wider platform's name)

**Document insights**:
Aggregated, anonymous analysis of how people interact with a Document: which questions they Ask about it, and where it seems unclear. Feeds the Document's next revision.
_Avoid_: feedback, analytics, comments

**Proposed revision**:
A draft new version of a Document that the AI prepares from Document insights, Knowledge health or a Finding. It might rewrite a step, add a warning, merge two Documents or retire one. Every change shows its before and after, plus a reason that links back to the signal that triggered it. It then goes through normal review. The AI never publishes anything.
_Avoid_: auto-update, AI edit, suggestion

**Knowledge health**:
The library-wide view of whether the body of Knowledge is lean and relevant. It shows which Documents are never used, which overlap and could be merged, which are asked about but unclear, and which have open Findings. Its goal is a smaller, better library, not a bigger one.
_Avoid_: dashboard, statistics, library analytics

**Consistency check**:
A recurring agent run that finds Published Knowledge that contradicts or duplicates other Published Knowledge, so Ask never gives conflicting answers.
_Avoid_: audit, lint

**Finding**:
What a Consistency check produces: a *contradiction* or a *duplicate* between two pieces of Published Knowledge, with the passages quoted. It is resolved either by publishing a revision, which closes it, or by an Engineer dismissing it with a reason. A dismissed pair is not reported again until one side changes.
_Avoid_: issue, alert, conflict

**Usage**:
How people actually use Knowledge: Scans, views, questions asked and Trainings done.

### Connecting outside models

**MCP server**:
The door through which an assistant or system the customer already runs talks to Oppr. That can be their own cloud assistant or a model on their own site. It can read Published Knowledge, import Drafts and report signals. It can never publish, approve, sign off or delete (docs/adr/0004).

**MCP key**:
What connects one outside assistant or system. A checked-in Engineer creates it, with access levels (read Published, read people data, write drafts, write signals) and optionally a limit to some areas. Every call made with it is logged.
_Avoid_: API token, password

### Capturing work on the floor

**Capture**:
One person recording how they do their work, on the phone, while walking the floor. It is a continuous stream of Entries in one stretch. A Capture belongs to its author until they hand it in; after that, Engineers can see it and use it. A Capture is raw input, never Knowledge: nothing in it is Published.
_Avoid_: Log (that is a LOGS checklist), session, recording

**Entry**:
One thing added to a Capture: a typed note, a voice note, a photo, a video, or a Scan of an Asset. Each Entry has a time and, after a Scan, the Asset it was made at.

**Moment**:
A step, safety point, quality check, tip, problem or open question that the AI found in a Capture after it was handed in. Every Moment points back to the Entries it came from (the evidence).

**Capture set**:
Several Captures of the same job, often by different Operators or on different shifts. Combining them gives one step list, shows which Captures support each step, and marks Variations.

**Variation**:
A place where Captures in a Capture set do the same step differently, skip it, or contradict Published Knowledge. An Engineer decides which way becomes the standard.

## Relationships

- A **Capture** is made by one person and holds **Entries**. After hand-in the AI turns it into **Moments**. Several Captures make a **Capture set**, which shows **Variations**.
- A Capture or a Capture set becomes a **Draft** (SOP, work instruction, LMRA or a proposal for a new LOGS checklist). It is never Published directly. A **Training** is made once that Draft is Published (docs/adr/0005).
- A **Document** is linked to zero or more **Assets**. A **Scan** of an Asset shows its Published Documents.
- A **Document** comes from the editor, from a **Convert**, as a **Wrapped manual**, or as an **Imported draft** through the **MCP server**.
- An outside model does the messy pre-work (classifying, cleaning up, splitting and translating legacy files) before anything reaches Oppr. Oppr checks the result against its structure and Published Knowledge, and a person decides.
- A **Training** is generated from one or more Published **Documents**. A **Round** also visits **Assets**.
- A **Training** has one or more **Learning objectives**. Each objective is traceable to a Published **Document**.
- A **Training** follows the same lifecycle as a **Document** (draft → in review → approved → published, versioned) and needs an Engineer's sign-off. Only a published Training counts towards Skills.
- A **Significant change** to a source **Document** sends linked **Trainings** back to review.
- Every question in an **Attempt** cites its source passage. A person can mark a question "unclear or wrong", which feeds **Document insights**.
- An **Attempt** belongs to one checked-in person and one **Training**. Its questions vary, but its objectives don't. A passed Attempt produces a **Training record**.
- A **Skill** level is held by one person. A passed **Training** raises it to level 1, and an Engineer's sign-off raises it to levels 2 and 3.
- A **Skill** is linked to Published **Documents**. Publishing a **Significant change** to one of them flags every holder as "re-train needed".
- A **Skill profile** lists target levels per **Skill**. Gaps against it drive which **Trainings** a person is offered.
- A **Wiki** has exactly one **Scope**, and is derived from the Published **Documents** and **Trainings** inside it.
- A **Wiki** is made through **Guided creation**: conversation, then **Draft**, then confirm.
- A **Consistency check** runs on every publish (the new version against existing Published Knowledge) and once a week across everything. Its **Findings** go to the Engineers' list and appear as a banner on both Documents.
- **Ask** keeps answering when a source has an open contradiction **Finding**, but it warns the person and names both sources.
- **Document insights** come from **Ask** conversations about a Document. They inform its next revision, not its current one.

## Flagged ambiguities

- Fixed in slice 0: Ask no longer falls back to the working version of a never-Published Document.
- Showcase order: Guided creation for Wikis first, then Trainings and Rounds. Skill profiles and Documents come later.
- Floor simulator: built as a plant plan with a phone frame that runs the real mobile app (free walk and Rounds).
- Live dashboards inside a Wiki are an idea parked for later, not part of the showcase.
