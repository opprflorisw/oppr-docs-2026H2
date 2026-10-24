# Build brief: Oppr Knowledge full showcase

Branch `feature/knowledge-full-showcase`. Builds on slices 0 and 1 (Foundation,
Wiki via Guided creation). Read `CONTEXT.md` (the glossary is the law for names
and UI copy) and `docs/adr/0001-0003` first.

## Goal

Oppr Knowledge must show every pillar working end to end, on a small but
**rich and believable** plant: 20 highly detailed documents with real-looking
images and supplier manuals, from which Wikis, Trainings, Rounds, Skills,
Findings and insights are built. Every stakeholder must be able to open the
app and see the value for them within a few minutes:

| Stakeholder | What they must see working |
|---|---|
| Operator (floor, often Anonymous) | Scan an Asset in the Floor simulator, read the Published SOP with images, Ask a question, do a Round as a treasure hunt, get "wrong machine, go to X". |
| New starter (checked in) | My learning: gaps against their Skill profile, the Trainings offered, doing an Attempt with fresh questions that cite their source. |
| Process / maintenance Engineer | Home inbox with real work: reviews, Findings (contradictions between documents), Proposed revisions with before/after, Trainings to review after a Significant change. |
| Quality manager / ISO auditor | Controlled documents: naming codes stamped on supplier PDFs, sign-offs by named Engineers, periodic review, version history, Training records as proof. |
| Plant / operations manager | Skill matrix (who can run line 2 tonight?), expiring skills, re-training needed, Knowledge health (is the library lean?). |
| Labour inspector (after an incident) | For a named person: which Training, which version, which questions, which answers, when. |
| Oppr sales / demo presenter | A coherent story across all of the above, on one plant, without explaining. |

**Ambitious target**: a stranger can walk through each stakeholder story above in
under 3 minutes without help, and every AI output on screen is traceable to a
Published passage.

## Invariants (never break)

1. **Published = truth.** Ask, Wikis, Trainings, Attempts, the Consistency check,
   the floor (mobile) views and Skills use only Published versions
   (`convex/lib/published.ts`: `isPublished`, `publishedVersion`; chunks with
   `version === liveVersion`). Draft sentinels `PX-9917`, `MT-5521`, `BL-7730`
   must never reach any of them. `npx convex run devChecks:run` must stay green.
2. **AI prepares, humans publish (ADR 0003).** AI output is a draft, a Finding, a
   Proposed revision, an insight, or questions inside an Attempt. AI code never
   calls approve or publish.
3. **Proof needs check-in.** Sign-offs (approve, publish, confirm review, Training
   review/approve/publish, Skill level 2/3 sign-off, dismissing a Finding) need a
   checked-in Engineer `personId`, validated server-side (`requireEngineer` is
   exported from `convex/documents.ts`). Attempts and Rounds need a checked-in
   person (any kind). Use `useCheckIn()` on the client.
4. **Grounding.** Any AI-generated factual text (Wiki points, Attempt questions and
   answers, Finding quotes, Proposed revision text) is checked in code against the
   cited passage (`convex/ai/grounding.ts`: `checkPoint`; quotes must be found
   verbatim after `normalise`). Drop what fails, log it, count it.
5. **Shallow navigation.** Six nav places only (Home, Documents, Learn, Wiki,
   Assets, Settings). New pages hang one level below: `/library/findings`,
   `/library/health`, `/learn/trainings/:id`, `/learn/attempts/:id`,
   `/learn/people/:id`. Anything deeper is a dialog or sheet. Never put a
   desktop route under `/m` (that is the mobile shell).
6. **UI copy.** Plain, short, CONTEXT.md terms (Finding, not "issue"; Attempt,
   not "quiz"; Round, not "tour"). **No em dashes** in UI copy. Homerun-style:
   the obvious next action is always visible; empty states say what will appear.
7. **Visual style.** Follow the existing shadcn style (see
   `scratchpad maps/ui.md` section 5): `text-sm` body, `text-xs` meta, mono
   naming codes, `Card` lists with `divide-y`, amber for warn, red for overdue,
   emerald for done, `size="sm"` buttons, sonner toasts.

## Environment and rules for build agents

- Repo `C:/Users/fwyer/Documents/claude/oppr-docs`. Several agents work **in the
  same working tree at the same time**, each on the files it owns (table below).
  **Never edit a file you do not own.** If you need a change in someone else's
  file, put it in your report under "requests"; the orchestrator applies it.
- Typecheck: `npx tsc -p convex --noEmit` (backend) and `npx tsc -b` (frontend).
  Errors in files you do not own may come from another agent mid-edit: ignore
  them, but your own files must be clean.
- Deploy to the **dev** deployment for testing: `npx convex dev --once
  --typecheck disable` (it pushes the whole tree; if another agent's file breaks
  bundling, wait a minute and retry). Run functions with `npx convex run
  <module>:<fn> '<json args>'`, read data with `npx convex data <table>`, logs
  with `npx convex logs`. **Never use `--prod`. Never run `seedKnowledge:run`**
  (it wipes data other agents are testing with); the orchestrator reseeds.
  Clean up test rows you create.
- Do not use the browser (one shared Chrome; a separate QA pass does that).
- Do not run `git commit`, `git checkout`, `git stash` or anything that changes
  git state. The orchestrator commits.
- AI: Claude via `convex/ai/llm.ts` `claudeJson` (model `claude-opus-5-5`,
  `ANTHROPIC_API_KEY` and `ANTHROPIC_WORKSPACE_ID` are set on dev), embeddings
  and Ask via Gemini (`GEMINI_API_KEY` set on dev). Image generation:
  `gemini-3.1-flash-lite-image` via `generateContent` (the cheapest image model
  available on this key; verified working).
- Subsystem maps (exact functions, lines, patterns) are in
  `C:/Users/fwyer/AppData/Local/Temp/claude/C--Users-fwyer-documents-claude/c13ade79-2beb-4a32-a7e0-f30eb53dc418/scratchpad/maps/`:
  `lifecycle.md`, `pdf-images.md`, `ai.md`, `ui.md`, `seed-tests.md`. Read the
  ones relevant to you.

## What the orchestrator already built (scaffold)

- **Schema** (`convex/schema.ts`): new tables `seedMedia`, `findings`,
  `consistencyRuns`, `proposedRevisions`, `askEvents`, `usageEvents`,
  `contentFlags`, `insightReports`, `trainings`, `trainingVersions`,
  `trainingAttempts`, `trainingRecords`, `skills`, `skillLevels`, `skillEvents`,
  `skillProfiles`; new fields `documents.origin/supplier`,
  `documentVersions.sourcePdfStorageId/pdfPageCount/stampLabel/significantChange/changeNote`,
  `people.profileIds`. Read the comments there. If your track truly needs a
  schema change, request it; small optional fields can be granted.
- **Publish hook**: `documents.publish` takes `significantChange?` and
  `changeNote?`; `publishApproved` stores them on the version row and calls
  `afterPublish` (`convex/lib/onPublish.ts`), which schedules
  `internal.manuals.stampVersion` for wrapped docs and calls
  `findingsAfterPublish`, `trainingsAfterPublish`, `skillsAfterPublish`.
- **Signals**: `convex/usage.ts` (`record` mutation for views/scans,
  `logAsk` internal mutation). Ask now logs every question to `askEvents`
  server-side (with checked-in `personId` and surface). Views are logged from
  `DocumentReadPage`, `MobileDocPage`; Scans from `MobileAssetPage`
  (`src/lib/usage.ts` `useRecordUsage`).
- **Libraries**: `convex/lib/pdfStamp.ts` (`stampPdf(bytes, info)`,
  `stampLabel`), `convex/lib/chunking.ts` (`bodyChunks(body)`,
  `pdfPageChunks(pages)`).
- **Cron**: weekly `internal.ai.consistency.runAll({trigger:"weekly"})`.
- **Placeholders already placed in the UI** (replace their bodies, keep export
  name and props): see the ownership table. Routes exist in `src/App.tsx`.
  Learn is a tabbed page (`?tab=mine|trainings|matrix|records`). Settings has a
  `skills` tab. Library header links to Findings and Knowledge health. The new
  document chooser has "Wrap a supplier manual". The Asset page shows
  `AssetTrainingsCard`. Home shows `HomeFindingsRows`, `HomeTrainingRows`,
  `HomeSkillRows` (each its own titled section below the inbox; render nothing
  when empty) and `HomeInsightsPanel` in the aside.

## Tracks and file ownership

| Track | Owns (create or edit) |
|---|---|
| **A. Wrapped manuals** | `convex/manuals.ts`, `src/components/manuals/*`, `src/pages/desktop/DocumentEditPage.tsx` (only to handle `bodyKind "pdf"` wrapped docs: no body editing, a "Replace PDF" action that starts a new version), `src/components/docs/PdfViewer.tsx` (if needed), `src/pages/mobile/MobileDocPage.tsx` (only the pdf rendering branch, for wrapped stamped PDFs) |
| **B. Consistency check and Findings** | `convex/findings.ts`, `convex/ai/consistency.ts`, `convex/ai/ask.ts` (only: warn on open contradiction Findings for cited docs), `src/components/findings/*`, `src/pages/desktop/FindingsPage.tsx` |
| **C1. Trainings, Attempts, Rounds, Records** | `convex/trainings.ts`, `convex/attempts.ts`, `convex/ai/training.ts`, `convex/seed/trainings.ts`, `src/components/learn/{TrainingsTab,RecordsTab,DocumentTrainingsCard,AssetTrainingsCard,HomeTrainingRows}.tsx`, `src/components/learn/training/*`, `src/pages/desktop/TrainingPage.tsx`, `src/pages/desktop/AttemptPage.tsx` |
| **C2. Skills, profiles, matrix** | `convex/skills.ts`, `convex/seed/skills.ts`, `src/components/learn/{SkillMatrixTab,MyLearningTab,HomeSkillRows,SkillsSettings}.tsx`, `src/components/learn/skills/*`, `src/pages/desktop/PersonSkillsPage.tsx`, `convex/people.ts` (people/profile management mutations) |
| **D. Insights, Knowledge health, Proposed revisions** | `convex/insights.ts`, `convex/ai/insights.ts`, `convex/ai/revision.ts`, `convex/revisions.ts`, `convex/seed/insights.ts`, `src/components/insights/*`, `src/pages/desktop/KnowledgeHealthPage.tsx` |
| **E. Floor simulator** (after C1) | `src/pages/desktop/FloorSimulatorPage.tsx`, `src/components/floor/*`, `src/components/mobile/*`, `src/pages/mobile/*` except the pdf branch of `MobileDocPage.tsx`, `convex/floor.ts` |
| **F. Content and media (seed)** | `convex/seedKnowledge.ts`, `convex/seed/{content,builders,media,supplierPdfs}.ts` and any other new `convex/seed/*` not listed above, `convex/devChecks.ts` (keep all checks passing; extend), `docs/test-set.md` |

Shared files only the orchestrator edits: `convex/schema.ts`, `convex/documents.ts`,
`convex/lib/*`, `convex/usage.ts`, `convex/crons.ts`, `src/App.tsx`,
`src/components/layout/*`, `HomePage.tsx`, `DocumentReadPage.tsx`, `LearnPage.tsx`,
`LibraryPage.tsx`, `SettingsPage.tsx`, `AssetDetailPage.tsx`, `CONTEXT.md`,
`docs/adr/*`.

## Contracts between tracks

- **Seed entry points** (F calls them, in this order, after documents, chunks,
  people and assets exist; each is an `internalMutation` with no args that finds
  what it needs by naming code, asset code or person name, skips gracefully if
  something is missing, and returns a small count object):
  `internal.seed.trainings.run` (C1), `internal.seed.skills.run` (C2, after
  trainings, so it can link Skills to Trainings and create records-based levels),
  `internal.seed.insights.run` (D). Then F schedules
  `internal.ai.consistency.runAll({trigger:"seed"})` about 90 s later (after
  embeddings), so Findings come from the real check. The orchestrator created
  stub files for these three seed modules.
- **C1 → C2**: when an Attempt passes, C1 inserts a `trainingRecords` row and
  runs `internal.skills.onTrainingPassed({personId, trainingId, recordId})`.
- **Significant change**: on publish with `significantChange`, C1's
  `trainingsAfterPublish` sets `needsReview` on Trainings whose live version has
  an objective from that document; C2's `skillsAfterPublish` flags holders of
  Skills whose `documentIds` include it.
- **B → D**: the Finding UI offers "Prepare a revision", which calls
  `api.ai.revision.propose({documentId, source:{kind:"finding", findingId, note}})`
  (returns the `proposedRevisions` id; D builds it). D shows the Proposed revision
  on the document (`ProposedRevisionBanner`) and marks it on the Finding
  (`findings.proposedRevisionId`) via an internal mutation it owns in
  `convex/revisions.ts`. B's `findingsAfterPublish` resolves open Findings whose
  side has a version older than the newly Published one ("resolved by
  publishing CODE vN").
- **Attempt flags → D**: when a person marks a question "unclear or wrong", C1
  inserts a `contentFlags` row (source "attempt") for the cited document; D
  aggregates them.
- **C1 → E (Rounds)**: C1 exposes, in `convex/attempts.ts`:
  `start({trainingId, personId}) → attemptId` (creates the Attempt and schedules
  question generation; status `generating` then `in_progress`),
  `get({id})` (attempt with training title, stops resolved to
  `{assetId, code, name, hint, evidence}`, questions without `correctIndex`
  until answered or finished), `scanAt({id, assetId}) → {ok:true, stopIndex} |
  {ok:false, expected:{assetId, code, name}}` (wrong Asset increments
  `wrongScans`), `answer({id, questionId, answerIndex}) → {correct, explanation,
  citation}`, `addEvidence({id, stopIndex, kind, text?, storageId?})`,
  `flag({id, questionId, note})`, `finish({id})` (scores, passes or fails,
  writes the record). Queries `listMine({personId})`, `listForTraining`.
  All mutations take and validate `personId` (must match the attempt).
  E builds the in-phone Round experience on these.

## Content catalogue (F writes it; everyone may rely on these names)

Plant **Pijpwerk Noord** (site `PWN`), makes PE pressure pipe 32 to 110 mm.

Areas: `MIX` Hall 1 · Mixing, `EXT` Hall 2 · Extrusion, `QCL` Quality lab.
Disciplines: `OPS` Operations, `MNT` Maintenance, `HSE` Health and safety,
`QA` Quality.

Assets:

| Code | Name | Area |
|---|---|---|
| MXR-101 | Batch mixer | MIX |
| DRY-102 | Granulate dryer | MIX |
| EXL-201 | Pipe extruder line 2 | EXT |
| VAC-203 | Vacuum calibration tank line 2 | EXT |
| SAW-202 | Haul-off and cutting saw line 2 | EXT |
| CLR-204 | Pipe coiler line 2 | EXT |
| QCL-301 | Ultrasonic wall thickness gauge | QCL |

People (check-in identities): Operators: Jan de Vries (line 2, night),
Fatima El Amrani (line 2, day), Lotte Smit (line 2, day, new starter, 3 weeks
in), Ahmed Yilmaz (line 2, night), Pieter Bakker (mixing), Emma de Boer
(mixing), Kevin Mulder (quality lab technician). Engineers: Sanne Visser
(process engineer), Mark Jansen (maintenance and safety engineer), Ingrid
Hoekstra (quality manager), Ruud Kok (plant manager).

Documents (20). Existing fixtures keep their codes, status and sentinel text.

| # | Code | Title | Type / origin | Status | Assets | Notes |
|---|---|---|---|---|---|---|
| 1 | EXT-OPS-SOP-0001 | Colour and product changeover on extrusion line 2 | SOP | Published v1, v2 draft | EXL-201, MXR-101, SAW-202 | Fixture: v2 uses PX-9917. Die bolts **40 Nm**. |
| 2 | EXT-MNT-MAN-0001 | Krauss KX-60 single-screw extruder: operating and maintenance manual | Manual, **wrapped PDF** (Krauss Extrusionstechnik GmbH) | Published v1, review due in 20 days | EXL-201 | Die bolts **45 Nm**, barrel 170-220 °C, melt 350 bar max, breaker plate and screen pack. |
| 3 | EXT-HSE-SOP-0001 | Lockout/tagout on extrusion line 2 | SOP | Published, review overdue 10 days | EXL-201, VAC-203, SAW-202, CLR-204 | "Never reach into the haul-off or saw area while the line is only stopped." |
| 4 | MIX-OPS-WI-0001 | Starting a batch on mixer MXR-101 | WI | Published, review in 60 days | MXR-101 | |
| 5 | EXT-OPS-WI-0001 | Saw blade check on SAW-202 | WI | In review | SAW-202 | Fixture BL-7730. |
| 6 | MIX-OPS-SOP-0001 | Cleaning mixer MXR-101 | SOP | Draft, never published | MXR-101 | Fixture MT-5521. |
| 7 | MIX-MNT-MAN-0001 | Vortex HM-500 high-speed mixer: operating manual | Manual, wrapped PDF (Vortex Mischtechnik) | Published | MXR-101 | |
| 8 | EXT-MNT-MAN-0002 | Nordcut HC-110 haul-off and PS-110 planetary saw: manual | Manual, wrapped PDF (Nordcut Machinery AB) | Published | SAW-202 | |
| 9 | QCL-QA-MAN-0001 | Sonatek UT-200 ultrasonic thickness gauge: user guide | Manual, wrapped PDF (Sonatek Instruments) | Published | QCL-301 | Says calibrate **at the start of every shift**. |
| 10 | MIX-OPS-SOP-0002 | Drying PE granulate on dryer DRY-102 | SOP | Published | DRY-102, MXR-101 | 80 °C, 4 h, dew point -40 °C. |
| 11 | EXT-OPS-SOP-0002 | Starting line 2 from cold | SOP | Published | EXL-201, VAC-203, SAW-202 | Zone table; says barrel **never above 230 °C** (manual: max 220 °C, deliberate contradiction #2). Has a section on vacuum tank setup that overlaps doc 13 (deliberate duplicate). References doc 2. |
| 12 | EXT-OPS-SOP-0003 | Shutting down line 2 | SOP | Published | EXL-201, VAC-203, SAW-202 | |
| 13 | EXT-OPS-WI-0002 | Setting up the vacuum calibration tank VAC-203 | WI | Published | VAC-203 | Vacuum -0.3 bar, water 15-20 °C. |
| 14 | QCL-QA-SOP-0001 | Measuring wall thickness and outside diameter | SOP | Published | QCL-301 | Tolerance table per size/SDR; says calibrate the gauge **once a day** (manual: every shift, deliberate contradiction #3). |
| 15 | QCL-QA-WI-0001 | Quarantine and release of non-conforming pipe | WI | Published | QCL-301 | |
| 16 | EXT-HSE-LMRA-0001 | LMRA: working at the hot die head | LMRA | Published | EXL-201 | |
| 17 | EXT-HSE-SOP-0002 | Hot melt burns: first response | SOP | Published | EXL-201 | |
| 18 | EXT-MNT-SOP-0001 | Changing the screen pack on EXL-201 | SOP | Published v1, **v2 in review** (a real procedural change, to be published as a Significant change in the demo) | EXL-201 | |
| 19 | EXT-OPS-WI-0003 | Setting up the pipe coiler CLR-204 | WI | **Approved** (inbox shows Publish) | CLR-204 | |
| 20 | MIX-HSE-LMRA-0001 | LMRA: dust and masterbatch handling at the mixer | LMRA | Published | MXR-101, DRY-102 | Rarely used (Knowledge health shows it). |

Skills (C2): Operate extrusion line 2; Colour and product changeover line 2;
Lockout/tagout line 2 (valid 12 months); Batch mixing; Granulate drying;
Screen pack change; Wall thickness measurement; Vacuum tank setup; Working at
the hot die head (valid 24 months). Profiles: Line 2 operator, Mixing operator,
Quality lab technician.

Trainings (C1): `EXT-TRN-0001` Line 2 changeover (course, Published);
`EXT-TRN-0002` Line 2 safety round (Round, Published, stops EXL-201, VAC-203,
SAW-202, CLR-204); `MIX-TRN-0001` Batch mixing basics (course, in review);
`QCL-TRN-0001` Wall thickness measurement (course, Published);
`EXT-TRN-0003` Screen pack change (course, Published, uses doc 18, so the
Significant change demo sends it back to review).

Story hooks the seed must make visible: Lotte (new starter) has gaps and
Trainings offered; Ahmed's LOTO skill expired; several records exist from
seeded past Attempts; doc 20 is never viewed; doc 1 and doc 14 get many
questions, some unanswered; three contradictions and one duplicate are found
by the real Consistency check.
