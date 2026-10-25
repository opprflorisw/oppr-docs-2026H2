# Wiki upgrade: build spec

Status: ready to build, revised after review (2026-10-25). Written for the next session, to be built by parallel agents.
Inputs: the code map of the Wiki, the walk report (screens in `scratchpad/wiki-design/walk/`), five reviews (Engineer, readers, quality and audit, AI retrieval, product owner) and one review of this spec (applied; see "Review notes" at the end).
Domain words follow `CONTEXT.md`. Rules that may not be broken: ADR 0003 (the AI never publishes; a Wiki states only what Published Knowledge says) and dev checks 4, 5, 7 and G in `convex/devChecks.ts`.

**Decided by the user on 2026-10-25**: D1 to D5 in section 0. D4 grew into an app-wide AI usage and cost tracker (6.7, Lane F).

---

## 0. Decisions (decided 2026-10-25)

| # | Decision | Decided |
|---|---|---|
| D1 | May an Engineer phrase Wiki text by hand at all (ADR 0003 amendment, 5.5)? | **Yes (user).** under the MVP rules in 5.1: a sentence reaches readers on its own only when the code-only check (`checkPoint`) proves every claim against a live Published passage. A claim that only the AI judge supports needs a second Engineer's confirm. |
| D2 | Second-Engineer confirm: per-Wiki setting in the MVP? | **Yes (user).** One boolean `wikis.confirmByAnother`, default on for Start here Wikis, off for the rest. When on, every written or edited block waits for a second Engineer. |
| D3 | Retention and status of a Wiki for ISO 9001 (was Q15). | **Decided (user): a Wiki is a snapshot.** A Wiki is a reading aid, not documented information. Screen and print say "Generated overview, not a controlled document". Keep builds and `wikiEvents` 365 days, at least the last 10 builds. If a quality lead later wants controlled status, write a separate ADR. |
| D4 | Daily AI ceiling for the whole deployment. | **Decided (user): build an AI usage and cost tracker** so every AI call in the app is visible with its cost, as the base for later usage-based pricing and per-customer plan settings (6.7). The 1,000 actions per day ceiling and the kill switch `OPPR_WIKI_AI_OFF` stay as the starting guardrail, now editable in the tracker's settings. |
| D5 | Danger callouts: cap per Wiki. | **Yes (user).** Default 2 (alarm fatigue: a third red box makes all of them easier to ignore). An Engineer can raise it to at most 5 per Wiki, with a logged reason. |

---

## 1. Outcome: what changes, for whom

**The problem in one line.** A Wiki today reads like a database dump. It has no introduction, every section is a boxed bullet list with a document code after every line, the same fact appears two or three times, and once it is built nobody can change anything except its Scope, which rebuilds everything.

**After the MVP (next session):**

| Who | What changes for them |
|---|---|
| **New plant manager** (reads on desktop) | The Wiki opens with a short introduction in plain words (under 90 words): what this is, who it is for, how the plant fits together, what it covers and does not cover. Sections read as a guide: a lead paragraph, then the list, steps or table. Each fact is said once. Long sections fold away. |
| **Operator** (reads on the phone or a printout) | Plain rows instead of a card per fact, one "Sources" link per row, sections that fold, steps that are not nested in boxes, and "Ask about this Wiki" on the phone. One alarm level: by default at most two danger callouts. |
| **Engineer** (builds and keeps the Wiki) | Can shape the Wiki after it is created: add, rename, reorder and remove sections; add a block between any two blocks; have the AI write a block from the current sources (or a chosen set), with a reading level and a length; find sources by search or AI search and add them; write a sentence by hand and press "Check against Published" to see, per claim, whether Published Knowledge supports it, contradicts it, or says nothing. Changes are previewed and then applied, and the previous build can be restored. Sees how many AI actions are left this hour. |
| **Quality manager, ISO auditor** | Every visible sentence still traces to a Published passage (unchanged guarantee). Every block shows its origin (generated, or written by a named Engineer and checked). Hovering a written sentence shows the verbatim Published passage it rests on. Every change is logged with who, when and why, and each build is stored whole and can be restored. A claim that contradicts Published Knowledge never reaches readers; it becomes a Proposed revision of the Document instead. |
| **Document owner** | Gets Proposed revisions from Engineers whose check found their Document wrong or silent, with the evidence attached. At most one Proposed revision per check per Document, with all its claims batched in it. |
| **Training coordinator** | MVP: the full print (4.8) works as a handout: intro, all sections expanded, endnotes. Phase 2: a "Training pack" print and the `checklist` kind (ticks are local to the viewer, never a record; the Training is the record). Phase 3: "Practise this" links to Trainings. |
| **Product and business** | Three MVP measures (7.5): share of Wikis with an intro, blocks added by Engineers per week, read depth and fold use. |

**The line no feature may cross.** People shape a Wiki. Published Knowledge states it. Text a person writes reaches readers only when every claim in it is supported by a cited Published passage. In the MVP that support must be proven by code (`checkPoint`), or confirmed by a second Engineer when only the AI judge found it. Anything else goes to a Proposed revision or stays private to the Engineer.

**ADR 0006.** The edit layer lives inside the Wiki page (the Wiki place in the nav). It adds no seventh place and no separate editor app; panels open as side sheets on the Wiki page.

---

## 2. The Wiki model

### 2.1 Structure

```
Wiki
 ├─ title, purpose ("Who it is for"), format, Scope        (unchanged)
 ├─ confirmByAnother, maxDanger                             (new settings)
 ├─ Outline: ordered Sections                               (new, durable, survives rebuilds)
 │    └─ Section: id, heading, instruction, safety, fold default
 │         └─ ordered Blocks                                (new, durable, survives rebuilds)
 │              └─ Block: id, kind, origin, status, sourceSet, points[]
 └─ content: the composed read model                        (derived from Outline + Blocks)
```

- **Section**: a heading that groups blocks. It has a stable `id` (so links `#slug`, fold state, history and diffs work per section) and an optional one-line `instruction` for the AI ("For a plant manager: who decides what in week 1").
- **Block**: one unit of content inside a section. It has a stable `id`, a `kind`, an `origin`, a `status`, its own `points` (cited sentences or rows) and an optional `sourceSet`.
- **The introduction** is a block of kind `intro` in a special first section with `role: "intro"`, on by default, and can be switched off.
- **Point** (the UI calls it a fact): unchanged shape `{text, key?, cells?, citations[]}` plus a stable `pointKey` (normalised text hash, computed by code, see 6.1) and optional `disputed` (see 5.4).

### 2.2 Block kinds

| Kind | What the reader sees | Points | Phase |
|---|---|---|---|
| `intro` | 2 to 4 sentences of prose under the title (under 90 words, see 4.9), then a coverage line written by code (not stored as points): "Built from 13 documents, 160 of 812 passages read. Covers: hazards, process limits, quarantine. Not covered: who decides what." | each sentence is a cited point | MVP |
| `prose` | a paragraph of 2 to 4 sentences with grouped superscript source markers (4.5) | each sentence is a cited point | MVP |
| `keyPoints` | "Key points": at most 5 short lines, each with a jump link to the section that holds the detail | cited points, deduped against the rest of the page (4.4) | MVP |
| `bullets` | a plain list | cited points | MVP (exists) |
| `steps` | a numbered list; "Full procedure: EXT-SOP-0003 v4" when the source has more steps | cited points | MVP (exists) |
| `table` | a table with sticky header; on the phone, horizontal scroll with the first column frozen | rows with `cells` | MVP (exists) |
| `callout` | one short boxed message with a tone: `danger` (red, the only strong box), `warning` (amber left border), `tip` (neutral) | 1 to 3 cited points | MVP |
| `images` | figures from cited versions, after the text they show; captions that repeat a point are cut | figure references only, no claims | MVP (move existing `pickFigures` output into a block) |
| `gap` | "No Published document covers this yet." Shown when a section's instruction found no supported points. Engineers see "Find sources" and "Propose a Document" | none (code-written, not a claim) | MVP |
| `checklist` | tick boxes for "before you start", "end of shift"; ticks are per viewer in localStorage, reset every 12 h, never a record | cited points | Phase 2 |
| `faq` | question and folded answer; questions come from Ask questions in this Wiki's sources, answers are cited | cited points (answers) | Phase 2 |
| `glossary` | terms used on this page, from Plant Glossary terms with their Dutch words; labelled "From the Plant" | no claims; links to Plant terms | Phase 2 |
| `contacts` | "Who to call": only names, roles and numbers that a Published passage states (cited). Plant roles appear as links, labelled "From the Plant" | cited points | Phase 2 |

**Collapsible group.** Any section can fold, and any block can be marked `fold: "closed"` with a one-line summary ("12 limits", "Full lockout steps") so it renders as a fold-out group inside its section. There is no separate container kind; this keeps the number of boxes down.

### 2.3 Origin of a block

| Origin | Meaning | Mark (Engineers always, readers subtle) |
|---|---|---|
| `generated` | written by the AI from Published passages | "Generated from 6 passages" |
| `written` | Engineer-phrased and verified: phrased by a named Engineer, every claim verified against a live Published passage, the verbatim passage shown beside it on hover | "Written by Sanne Visser, verified 25 Oct against EXT-HSE-SOP-0001 v3" (plus "confirmed by Jan de Boer" when a second Engineer confirmed) |
| `edited` | a generated block whose wording an Engineer changed; verified like `written` | "Edited by Sanne Visser, verified 25 Oct" |

Pinning (Phase 1.5) is a flag, not an origin: `pinned: true` on a point keeps it through rebuilds while its cited passage stays the live Published version (3.7).

### 2.4 Status of a block

| Status | Who sees it | Meaning |
|---|---|---|
| `generating` | Engineers | an AI job is running for this block |
| `grounded` | everyone | generated, every point passed `checkPoint` / `checkTableRow` against the live Published version |
| `checked` | everyone | written or edited, every claim verified (5.1) against the live Published version, and confirmed by a second Engineer where 5.1 requires it |
| `awaitingConfirm` | Engineers only, blue outline | written or edited, verified, but a second Engineer must confirm it (a claim only the AI judge supports, or the Wiki has `confirmByAnother` on) |
| `unchecked` | Engineers only, dashed outline | written or edited text that has not been checked yet, or whose check failed to run |
| `contradicts` | Engineers only, red outline | at least one claim contradicts Published Knowledge; it can never be applied |
| `notCovered` | Engineers only, grey outline | at least one claim has no supporting passage, or is only partly supported; it can never be applied |
| `needsRecheck` | Engineers only; readers see the section without it | a cited source got a new version, was archived or deleted, and the block no longer passes |
| `gap` | everyone, as the gap message | the instruction found nothing Published |
| `failed` | Engineers | the AI job failed; the previous content stays |

Only `grounded`, `checked` and `gap` blocks are composed into `wikis.content`. Everything else lives only on the block row.

### 2.5 Sources of a block

- `sourceSet: "scope"` (default): any Published Document in the Wiki's Scope.
- `sourceSet: {documentIds}`: a subset of the Scope chosen for this block. A Document outside the Scope must be added to the Scope first (CONTEXT.md:251, one Scope per Wiki).
- `pinnedChunkIds`: passages that are always read for this block, whatever the passage budget (capped at 12 per block).
- Every point keeps its citations `{chunkId, documentId, namingCode, version, section}` as today.

---

## 3. Author flows (Engineer, checked in)

All flows are on the Wiki page itself (ADR 0006). They start from **Edit** in the header (Engineers only, next to Share and Print). Edit mode shows the edit bar, block handles and "+" insert points. Phase marks: **MVP** ships next session; **Phase 1.5** is the session after; Phase 2 and 3 as in section 7.

### 3.1 Edit mode, applying, restoring (MVP)

- Edit mode writes to **unapplied changes**: new and changed blocks get `state: "staged"`, outline edits go to `wikis.outlineStaged`. Readers keep seeing the live Wiki.
- The edit bar shows "4 unapplied changes · Preview · Apply · Discard", the AI allowance ("14 generations and 9 checks left this hour"), and a menu with "Restore previous build".
- **Apply** promotes everything at once (one mutation), recomposes `content`, writes a `wikiBuilds` snapshot and one `wikiEvents` row per change. Apply is refused if any staged block is `unchecked`, `contradicts`, `notCovered` or `generating`; the bar lists which. Blocks in `awaitingConfirm` are applied as structure but stay out of `content` until confirmed.
- **Confirm** (second Engineer): an `awaitingConfirm` block shows "Confirm" to any checked-in Engineer or Admin other than its author, with the claims and their verbatim passages side by side. Confirm sets `checked`, records `confirmedBy`, recomposes. "Send back" returns it to the author as `unchecked` with a note.
- **Restore previous build** (MVP): lists the last 10 `wikiBuilds` with time, who and why; restoring writes the stored outline, blocks and `content` back as a new build (nothing is deleted), logged as `restored`. Blocked while an AI job runs for this Wiki.
- **Concurrent editors**: staged state is per Wiki, not per person. Every staged change carries `updatedBy`; the edit bar shows "Also editing: Jan de Boer" when another person staged a change in the last 10 minutes. Apply carries the `stagedVersion` it was shown; if another Engineer changed staged state since, Apply is refused with "Jan de Boer changed this since you opened Preview" and the preview refreshes.
- **Losing the role**: every mutation re-checks `requireEngineerOrAdmin`. A person who checks out or loses the role mid-edit gets "You are no longer checked in as an Engineer"; their staged changes stay for another Engineer to apply or discard.
- Automatic rebuilds after a publish are never held for approval (holding them would show stale truth). In Phase 1.5 they show in the Changes panel (3.8).

### 3.2 Sections (MVP)

- **Add section**: "+ Section" between sections. Fields: heading, optional instruction, kind of first block (default: let AI choose), "Safety section" toggle. Creates the section with one `generated` block in `generating` state and starts 3.3.
- **Rename, reorder (Move up / Move down buttons, keyboard operable; no drag and drop in the MVP), remove** (removing a safety section asks for a reason, which is logged).
- **Fold default**: "Open by default" / "Closed by default". Safety sections cannot be closed by default.
- **Instruction**: editable per section; changing it offers "Regenerate this section".
- Safety sections are not capped: they render quietly (4.2). The cap is on `danger` callouts (`wikis.maxDanger`, default 2, D5). A third danger callout shows "Two danger callouts already; make this a warning callout, or raise the limit (reason required)?".

### 3.3 Generate a block from sources (MVP)

- "+ Block" inside a section, between any two blocks. Menu: Generate from sources (default), Key points, Steps, Table, Callout, Write by hand. ("Find sources" from this menu is MVP too, 3.4.)
- **Generate** panel (side sheet):
  1. "What should this block cover?" (one line, required, max 200 chars).
  2. Kind: Let AI choose / Prose / Bullets / Steps / Table / Callout.
  3. **Reading level**: Floor (short sentences, everyday words, one fact per sentence) / Office (default for plant manager purposes; full terms, can explain why). Default follows the purpose line: "Operator" or "shift" gives Floor.
  4. **Length**: One screen / Normal (default) / Full.
  5. Sources: "This Wiki's sources" (default), "These documents" (chips from the Scope), plus any pinned passages.
  6. Button **Generate**. Nothing runs before the press.
- Reading level and length are also Wiki-level settings in the Wiki's edit menu, used by the full rebuild (`wikis.readingLevel`, `wikis.length`); the panel overrides per block.
- The result shows as a staged block with each point's passage on hover, and below it "Left out (2)" with the count. The full reason list (the `droppedDetail` sheet) is Phase 1.5.
- Buttons on the staged block: Keep (stays staged until Apply), Regenerate, Discard.
- **Regenerate** on any existing generated block re-runs only that block with its instruction and sources. MVP shows the new text in place of the old with "Keep" and "Discard"; the word diff is Phase 1.5.

### 3.4 Find sources, by hand and by AI (MVP, per block only)

- MVP: "Find sources" is in each block's menu and on every `gap` block. The whole-Wiki entry in the edit bar is Phase 1.5.
- **By hand**: a search box (words) and the existing `DocumentPicker` (titles and codes).
- **By AI**: "Search for this block" uses the block's heading plus instruction as the query, expands it with Glossary synonyms, and runs the same engine.
- Results are grouped by Document: code, title, version, the matched passage, Area, and a badge: "In this Wiki", "In Scope, not read", "Not in Scope", plus "Open finding" when the passage is disputed. Drafts never appear (check 4); greyed draft hints are Phase 2.
- Actions per result:
  - **Add to Scope** (Document not in Scope): updates the Scope, logs "added by Sanne Visser, suggested by AI search" when it came from AI, and regenerates only the block the search came from.
  - **Use for this block**: adds the Document to the block's `sourceSet`.
  - **Pin passage**: adds the chunk to the block's `pinnedChunkIds`.
- Indexing honesty: "3 documents are still being indexed and are not searchable yet" when chunks have `embedding: null`, counted over the whole library, not only the Scope.

### 3.5 Write by hand, then Check against Published (MVP)

1. "Write by hand" opens a text box in the block. The Engineer types up to 1,200 characters. Nothing is checked while typing.
2. **Check against Published** (button). The server splits the text into claims and returns one verdict per claim.

**Claim splitting.** Sentences first. Then a sentence with two coordinated clauses that each carry a value, code or instruction ("Wear gloves and keep the guard closed", "Set 200 °C and check after 10 minutes") is split into separate claims by code (split on ";", and on " and " / " en " when both sides contain a verb or a number). An LLM split runs only when a sentence still exceeds 40 words. At most 12 claims per check.

**Verdicts:**

| Verdict | How it is reached | Shown as | What the Engineer can do |
|---|---|---|---|
| **Supported** | `checkPoint` (code only) passes against a retrieved live Published passage | green tick, the verbatim passage with code and version | nothing more; the citation is attached |
| **Supported by AI judge** | `checkPoint` fails but `judgeClaims` labels it supported with a verified verbatim quote | green outline tick, "Only the AI judge found this; a second Engineer must confirm" | apply puts the block in `awaitingConfirm` |
| **Partly supported** | the judge or `checkPoint` supports one part of a claim that the splitter could not split | amber, supported part highlighted, unsupported part struck through | "Split into two claims", "Remove the unsupported part", "Remove claim" |
| **Differs from Published** | `factConflict` finds the same unit or code family with another value, or `negation-mismatch` fires, or the judge labels it contradicted with a verified quote | red, the Engineer's words beside the verbatim Published quote ("You wrote 230 °C; EXT-MNT-MAN-0001 v1 says 220 °C") | "Use the Published wording" (AI rewrites the claim from that passage, re-grounded), "Propose a revision" (3.5.1), or "Remove claim" |
| **Not covered** | no passage supports or contradicts it | grey, "No Published passage says this. Searched 20 documents, 160 passages; 2 documents are not indexed yet", plus the closest passages found | "Find sources", "Propose a revision" to the closest Document, or "Remove claim" |
| **Already disputed** | the supporting passage is one side of an open contradiction Finding | amber, the supporting passage plus the open Finding (both sides quoted, link to `/library/findings?f=<id>`) | allowed only if the claim states both values (the reader shows the dispute, 5.4); otherwise "Remove claim" |

"Not covered" always reports how far the search went, so absence is never read as proof that the library is silent. Qualitative contradictions ("never" against "sometimes", "always" against "only when") are caught by `negation-mismatch` only for explicit negation words; everything else rests on the AI judge, and the UI says so on a Differs verdict that came from the judge ("Found by the AI judge").

3. The block status is set from the verdicts: every claim Supported (or Already disputed and stating both values) gives `checked`, or `awaitingConfirm` when the Wiki has `confirmByAnother` on. Any claim "Supported by AI judge" gives `awaitingConfirm` regardless of the setting. Any Differs gives `contradicts`; any Not covered or Partly supported gives `notCovered`.
4. **When the check fails to run** (AI error, timeout, budget refused before start): the block stays `unchecked`, the Engineer sees "The check did not run: <reason>. Try again", and the action is not counted against the budget (the `aiActions` row is written with `ok: false` and is excluded from the count).
5. The full check result (claims, verdicts, how each verdict was reached, passages and versions, search counts, model, time) is stored in `wikiChecks` and linked from the block, so a reviewer, confirmer or auditor can see the evidence.

**3.5.1 Path to a Proposed revision or a Finding.**
- **Proposed revision** (Differs or Not covered, the Engineer decides the Document is wrong or silent): one `proposedRevisions` row per check per Document. All claims of that check that point at the same Document are batched into it (`source.note` lists each claim with its passage), and a second "Propose a revision" press on the same check and Document adds to the existing row instead of creating a new one. `source.kind: "wiki_check"`, linked to the `wikiChecks` row. It then goes through normal review. The AI never publishes. The Wiki block stays unapplied (or the claim is removed) until a revision is Published.
- **Finding**: a Finding is Published against Published (CONTEXT.md), so a hand-written claim never creates one. When the check retrieves two Published passages that disagree with each other, the result says "These two Published passages may disagree" and offers **Run the Consistency check on these two Documents**, which calls the existing `findings.runCheckNow` path. Any Finding then comes from the real Consistency check.

**3.5.2 Standalone check (Phase 1.5).** "Check a statement" in the edit bar, without adding anything to the Wiki. Same results, same evidence row (with `blockId: null`). Phase 2 offers it in Ask for everyone.

### 3.6 Restyle a block (Phase 1.5)

- Block menu "Turn into: Prose / Bullets / Steps / Table". The AI rewrites the block from the **same cited chunks** in the new shape. Every new point is re-grounded. Preview, then Keep or Discard.
- "Make shorter" (Phase 2): same mechanism with a length target.
- Restyling a `written` block makes it `edited` and it must pass the check again.

### 3.7 Pin and hide (Phase 1.5)

- On any generated point: **Keep this fact** (pin) and **Hide from this Wiki** (asks for a reason; logged).
- Hiding a point in a safety section or a `danger` callout needs a second Engineer: it goes to `awaitingConfirm` like written text and the point stays visible until confirmed.
- A pinned point is carried into the next build of its block as long as each cited chunk is still in the live Published version, or can be remapped to the new version (same `pageOrSection`, best `support`) and passes `checkPoint` again. If not, it is dropped and the Changes panel says "Your pinned fact was replaced".
- Hidden points are stored as `pointKey`s on the block; the generator is told not to produce them and code removes any that come back.

### 3.8 When sources change

**MVP (safety floor, no UI):**
- Triggers stay as today: publish, archive or delete of a Document in Scope (`regenerateWikisForDocument`), nightly cron, Rebuild now. Publish triggers are coalesced per Wiki: a rebuild is scheduled 10 minutes after the first trigger and later triggers in that window join it.
- **Generated blocks** are regenerated only when their sources changed: a block is rebuilt when any cited or `sourceSet` Document got a new live version, or its source set is "scope" and the changed Document is in Scope. Others keep their content and bump `dependsOn`.
- **Written and edited blocks** are never regenerated. At every `compose`, code runs `checkPoint` for each of their points against the live version of the cited passage (remapped by `pageOrSection` when the version changed). A point that no longer passes takes its block out of `content` and sets `needsRecheck`. No LLM runs here. The Engineer sees the block in edit mode with "A source changed; check again".

**Phase 1.5:**
- The LLM re-judge for written blocks whose `checkPoint` fails after a publish (W4 timing check).
- **Changes panel** ("What changed", Engineers; badge on Edit): one card per changed block with the trigger ("EXT-SOP-0012 v4 published"), a word diff old against new, and:
  - generated block: **Accept** (marks seen) or **Keep previous wording**, offered only when every previous point still passes `checkPoint` against the new live version; otherwise disabled with the reason.
  - `needsRecheck` block: **Accept AI rewrite**, **Edit and check again**, or **Remove**.
- Readers see the "New" pill on changed points as today (14 days).

---

## 4. Reader experience (MVP)

### 4.1 Page order (desktop)

1. Title, purpose line as the subtitle.
2. One quiet meta line: "6 min read · Built from 13 documents · rebuilt 2 h ago". Area chips link to the Plant area. The format badge is hidden on the page and in the list (all four live Wikis are "Overview"; it explains nothing). The `format` field stays: no UI filters on it, but `mcpGet` returns it to outside models, so it is not removed.
3. Trust line, only when needed, and precise (4.6).
4. **Introduction** block, then the coverage line.
5. **Key points** (folds; open by default).
6. Sections in outline order.
7. Rail: On this page (with Expand all / Collapse all), Ask about this Wiki, Built from (scrolls inside the rail, max height 40vh), Scope and rebuilds.
8. Footer on screen and in print: "Generated overview, not a controlled document" (D3).

### 4.2 Readable sections

- One content width for every block: `max-width: 68ch` text column; tables may extend to the article width. No box widths jumping between 600 and 760 px.
- A section may open with a `prose` lead (1 to 2 sentences) before its list. The generator is asked for one lead per section when the section has 3 or more points.
- Safety sections: a 3 px amber left border and a shield in the heading, not a filled box. Only `callout` blocks with tone `danger` get a strong red box, capped by `wikis.maxDanger` (default 2).
- No grey document code after every line (4.5).

### 4.3 Collapsible sections

- Every section heading has a chevron button (`aria-expanded`, `aria-controls`, Enter and Space toggle, visible focus ring).
- Defaults: intro and Key points open; safety sections open and cannot fold below their heading plus first callout; the first two other sections open; the rest open, unless reading time is over 8 minutes, then closed. An Engineer's per-section default overrides (except safety).
- A folded section shows "Main hazards on line 2 · 5 facts".
- Per viewer state in localStorage, key `wiki:<wikiId>:fold:<sectionId>`, every read and write in try/catch; the page renders correctly without it.
- `#slug` links open their section and scroll to it. Print and the one-pager expand everything.

### 4.4 Each fact once

- `keyPoints` holds its own points and links each to the section that holds the detail ("in Main hazards").
- Server-side dedupe after generation and at compose: two points with the same `pointKey` or the same sorted chunk set and support of one against the other above 0.8 are duplicates. Keep the first by priority: danger callout, then Key points, then the earlier section. The later one is dropped and counted. (Migration composes with dedupe off, 6.3.)
- Figure captions whose content stems overlap a point's by 60% or more are cut to what the image shows (the alt text noun phrase).

### 4.5 Citations: one rule per surface

| Surface | Rule |
|---|---|
| Desktop | One superscript marker per **run** of consecutive sentences or list items in the same block that share the same citation set, placed after the last one in the run, at most 3 sentences per run. A sentence with its own sources gets its own marker. Hover or focus shows each passage (existing `SourceChip` popover); click opens the Document at the highlighted passage (`/docs/:id?wiki=<id>&hl=`). Under each section, one line: "Sources: EXT-HSE-LMRA-0001 v2, EXT-SOP-0004 v3". Rail toggle "Show source codes inline" for auditors (per viewer, localStorage). |
| Phone | One "Sources (n)" link per list row or table row, and one per paragraph for `intro` and `prose` blocks; it opens the existing `SourceSheet`. |
| Print | Numbered endnotes per section, using the same runs as desktop. |

Storage is unchanged: every sentence keeps its own citations and is grounded on its own; grouping happens only at render.

### 4.6 Precise trust signals

- Banner names the fact and jumps to it: "1 fact rests on documents that disagree: Barrel zones of EXL-201." Click scrolls and highlights.
- Counts split and agree: "1 fact here rests on an open contradiction. 2 more Findings concern these sources but no fact on this page." Links go to `/library/findings?wiki=<wikiId>`, which filters to Findings touching this Wiki's sources.
- "1 review overdue" names the Document and links to it.
- "3 facts left out" shows the count for everyone. The sheet with each dropped text and reason is Phase 1.5.

### 4.7 Phone (`/m/wiki/:id`)

- Rows, not cards: points are plain list items with a thin divider; no bordered card per point (`MobileWikiPage.tsx` around :258).
- Sections are accordions with the same defaults; sticky chip bar groups safety sections behind one shield chip.
- Steps render as one numbered list, never nested inside a callout box.
- Images come after their section's text.
- "Ask about this Wiki" button in the sticky header, opening the phone Ask scoped to the Wiki.
- The contradiction card is tappable and scrolls to the fact.
- Header shows the purpose, not "Wiki · Overview". The bottom nav does not highlight Find on a Wiki.
- Read only; no editing on the phone (MVP and Phase 2).
- Low signal: the page needs one query; images load lazily after the text. A cached last-read copy for offline use is Phase 2 (7.3).

### 4.8 Print (`WikiPrintLayout.tsx`)

- Prints the intro, coverage line, all sections expanded, figures, and numbered endnotes per section instead of a code list after every point. This is also the MVP training handout.
- Origin marks print as small text ("Written by S. Visser, verified 25 Oct").
- One-pager: Key points, danger callouts and safety sections.
- Footer unchanged ("Generated overview, not a controlled document", QR).

### 4.9 How the writing must read (prompt contract for Lane B)

**Rules** (in the prompt and in the rubric below):
- Write for the purpose line's reader. Reading level Floor: sentences under 15 words, everyday words, one fact per sentence, imperative for actions. Office: sentences under 22 words, full terms, may say why.
- Intro: 2 to 4 sentences, under 90 words in total. Sentence 1 says what the plant or area does in this Wiki's Scope. Sentence 2 says how it fits together (flow, areas, lines). Sentences 3 and 4 say what matters most for this reader. No sentence restates the title or a section heading. No "This Wiki", "This guide", "In this overview" openings; what the Wiki covers is said by the code-written coverage line.
- Length: One screen gives at most 5 sections and 4 points each; Normal at most 8 sections and 8 points each; Full has no section cap and up to 15 points each.
- Every sentence cites. To keep the text fluent, the prompt allows several consecutive sentences to cite the same excerpts (they render under one marker, 4.5); it forbids sentences that carry no fact.

**Golden example** (Pijpwerk Noord, purpose "Running Pijpwerk Noord for 30 days", reading level Office). Illustrative wording: at build time every fact must come from the cited excerpts, and the markers show how runs group.

> Pijpwerk Noord makes PE pressure pipe: compound is prepared in Mixing, extruded on the lines in Extrusion and released by Quality Control. Raw material moves one way, from the silos through the mixers to the extruders, and every coil is held until its gauge and pressure checks pass.¹ The highest risks in your first month are hot work at the die and barrel, which only trained people do with the line locked out.² Release decisions belong to Quality Control, so a coil on hold stays on hold until they clear it.³

(4 sentences, 72 words, 3 markers.)

**Acceptable intro rubric** (used by the reviewer of a build and, where code can, by the browser check):
1. 2 to 4 sentences, under 90 words. (code)
2. No sentence restates the title or a heading: token overlap with any heading below 0.6 after stop words. (code)
3. No "this Wiki / this guide / this overview" opener. (code)
4. Every sentence has a citation and passes `checkProse`. (code)
5. A new plant manager could say after reading it what the plant makes, how it flows, and the one or two things to be careful about. (person, during review)

---

## 5. Trust and governance

### 5.1 ADR 0003 compliance

ADR 0003 exempts Wikis from approval because they are "generated output derived only from content that is already Published". A `written` block is person-phrased text. The MVP keeps it inside that exemption only where code can prove the derivation, and adds a second person where it cannot:

| Case | MVP rule |
|---|---|
| Every claim passes `checkPoint` (code only) against a live Published passage | May reach readers without a second person (unless `confirmByAnother` is on). It is "Engineer-phrased, verified", and readers see the verbatim passage on hover. The phrasing is the Engineer's, the facts are provably the Document's: the same test that generated text must pass. |
| Any claim rests only on the AI judge's "Supported" | Never auto-applied. Goes to `awaitingConfirm`; a second checked-in Engineer reads the claims beside their verbatim passages and confirms. The judge's verdict is evidence for that person, never the decision. |
| `confirmByAnother` on (default for Start here Wikis) | Every written or edited block waits for a second Engineer. |
| Differs, Not covered, Partly supported | Can never be applied. Goes to a Proposed revision or is removed. |

| Rule | How the upgrade keeps it |
|---|---|
| Every visible claim traces to a Published passage | Only `grounded`, `checked` and `gap` blocks are composed. `gap` text and the coverage line are fixed code strings, not claims. Check 5 is extended to every point of every composed block, including intro, prose and written sentences, and runs `checkPoint` on each. |
| The AI never publishes | The AI generates Wiki blocks (already allowed for Wikis) and drafts Proposed revisions. It never applies a person's text and never confirms. |
| No draft text reaches a Wiki | Sources and search filter to live Published versions. Check 4 unchanged and extended (8.2). |
| The Plant briefing is never cited | It stays background for the intro wording. An intro sentence without a citation is dropped by `checkProse`. |
| Findings are Published against Published | A check never creates a Finding; it may trigger the real Consistency check on two Published Documents (3.5.1). |

### 5.2 Who may do what

| Action | Who |
|---|---|
| Read, ask, print, share | everyone (unchanged) |
| Fold, show source codes inline | everyone, per viewer |
| Edit mode, generate, find sources, write, check, apply, restore a build | any checked-in Engineer or Admin (`requireEngineerOrAdmin`, `convex/lib/roles.ts:27`) |
| Confirm a written block | a checked-in Engineer or Admin who is not its author |
| Propose a revision from a check | checked-in Engineer; the revision follows normal review by the Document's reviewers |
| Remove a safety section; raise `maxDanger` | checked-in Engineer, reason required, logged |
| Hide a point in a safety section or danger callout (Phase 1.5) | checked-in Engineer plus a second Engineer's confirm |

### 5.3 History and audit trail

- **MVP**: new append-only `wikiEvents` table; every mutation on a Wiki writes one row `{wikiId, at, personId|null, kind, blockId?, sectionId?, detail}`. Kinds: created, scopeChanged, outlineChanged, blockAdded, blockChanged, blockRemoved, checkRun, confirmed, sentBack, applied, rebuilt, restored, migrated, revisionProposed, settingChanged, deleted (Phase 1.5 adds pointPinned, pointHidden).
- **MVP**: `wikiBuilds` becomes lossless: it stores the full composed `content`, the outline, the block rows, the Scope, title, purpose, the model id (`claude` / `gemini` / `stub`) and a prompt version string. Keep builds 365 days, at least the last 10 (replace the `KEEP_BUILDS` count at `convex/wikis.ts:86` with age plus floor). This is what Restore (3.1) and migration rollback (6.3) use.
- **Phase 1.5**: History sheet with the event timeline and "Read as it was on <date>" for any build.
- `remove` writes a `deleted` event and keeps the `wikiEvents` rows (Phase 2: delete becomes Archive; Admin purge).
- The stub notice: when a build ran without AI (`OPPR_AI_STUB` or no key), the reader shows "Offline stand-in, no AI" in the meta line.

### 5.4 State both values (enforced in code)

After grounding, for each point that cites a chunk that is one side of an open contradiction Finding (`findingForPoint`, `convex/wikis.ts:281`), code sets `point.disputed = {findingId, otherNamingCode, otherVersion, otherQuote}` from the Finding's other side. The reader shows "EXT-MNT-MAN-0001 v1 says: '…220 °C…' · Open finding". If the other side's quote cannot be resolved, the point is withheld (except in migration, 6.3). This replaces the prompt-only rule at `convex/ai/wiki.ts:79`.

### 5.5 ADR changes (Lane A writes these first, after the user decides D1 and D2)

**New `docs/adr/0007-people-shape-wikis-published-states-them.md`** (0006 is the highest number today):

> **People shape a Wiki; Published Knowledge states it.**
> A Wiki has a durable Outline of sections and blocks that Engineers may add, order, restyle, pin, hide and instruct, and that survives every rebuild. Text in a Wiki is either generated from Published passages, or phrased by a checked-in Engineer and verified against Published passages; in both cases every claim cites a live Published passage. Engineer-phrased text reaches readers on its own only when code proves each claim against its passage; a claim that only an AI judge supports needs a second Engineer's confirm, and a Wiki can require that confirm for all person-phrased text. Readers can always see the verbatim passage behind a sentence. Text that a check finds unsupported or contradicting never reaches readers; it becomes a Proposed revision of the Document, which goes through normal review. A check never creates a Finding, because a Finding is Published against Published. Automatic rebuilds after a publish are never held for approval.
> We chose this over free "Engineer notes" (which would make a Wiki a second, uncontrolled SOP and break "Published = reviewed by a person") and over four-eyes approval of every Wiki edit (which would make Wikis slow and stale). It is hard to reverse because Wikis will hold person-phrased text and an outline that people rely on.

**Amend `docs/adr/0003-ai-prepares-humans-publish.md`**, the exception sentences. Replace "Wikis and Attempt questions are the exception. They are generated output derived only from content that is already Published, so they need no approval of their own." with:

> Wikis and Attempt questions are the exception. They state only what is already Published, so they need no approval of their own: Wiki text is either generated from Published passages or phrased by an Engineer and verified claim by claim against them, with a second Engineer's confirm where code cannot prove the claim (docs/adr/0007).

### 5.6 CONTEXT.md changes (write with the ADRs)

- **Wiki** (CONTEXT.md:161): replace "People never write a Wiki by hand." with "People shape a Wiki (its sections, blocks and sources) and may phrase a block by hand, but every claim in it cites and is verified against Published Knowledge (docs/adr/0007)."
- Add **Outline** ("the ordered sections and blocks of a Wiki that Engineers shape; it survives rebuilds"), **Wiki block** ("one unit of a Wiki section: introduction, prose, key points, steps, table, callout and so on; generated or written, always cited"), **Check against Published** ("checking a person's statement, claim by claim, against Published passages: Supported, Differs, Not covered, Partly supported or Already disputed; evidence, never approval"). _Avoid_: note, comment, card.
- Fix the relationship line at CONTEXT.md:251: "derived from the Published Documents inside it" (generation reads Document chunks only; Trainings are not read).

---

## 6. Data model, server and UI changes

Items marked (1.5) are built in Phase 1.5; the schema fields may be added in the MVP so no second migration is needed.

### 6.1 Shared types (Lane A, hour 0): `convex/lib/wikiTypes.ts`

The contract every lane imports. Pure: no Convex `ctx`, no I/O, so the browser checks can import `pointKey` too.

```ts
export type BlockKind = "intro" | "prose" | "keyPoints" | "bullets" | "steps" | "table" | "callout" | "images" | "gap"
  // Phase 2: | "checklist" | "faq" | "glossary" | "contacts"
export type BlockOrigin = "generated" | "written" | "edited"
export type BlockStatus = "generating" | "grounded" | "checked" | "awaitingConfirm" | "unchecked" | "contradicts" | "notCovered" | "needsRecheck" | "gap" | "failed"
export type CalloutTone = "danger" | "warning" | "tip"
export type ReadingLevel = "floor" | "office"
export type Length = "oneScreen" | "normal" | "full"
export type SourceSet = "scope" | { documentIds: Id<"documents">[] }
export interface Citation { chunkId; documentId; namingCode; version; section }            // unchanged
export interface Point { text; pointKey; key?; cells?; citations: Citation[]; pinned?; disputed?: Disputed }
export interface OutlineSection { id; heading; role?: "intro"; instruction?; safety?: boolean; fold: "open" | "closed" }
export interface ComposedBlock { id; kind; origin; tone?; columns?; fold?: { closed: boolean; summary: string }; points: Point[]; authorName?; checkedAt?; confirmedByName?; figureIds? }
export interface ComposedSection { id; heading; role?; safety?; fold; blocks: ComposedBlock[] }
export interface WikiContentV2 { v: 2; sections: ComposedSection[]; coverage: Coverage }
export type ClaimVerdict = "supported" | "supportedByJudge" | "partly" | "differs" | "notCovered" | "disputed"
export interface ClaimResult { text; verdict; via: "code" | "judge"; reason; passages: { chunkId; documentId; namingCode; title; version; quote; inScope: boolean }[]; supportedPart?; findingId?; conflictPair?: [Id<"documents">, Id<"documents">] }
export interface SearchStats { documentsSearched: number; passagesSearched: number; documentsNotIndexed: number }
export interface CheckResult { checkId: Id<"wikiChecks">; claims: ClaimResult[]; stats: SearchStats }
export interface FoundSource { documentId; namingCode; title; version; areaCode; passage: { chunkId; text; section }; badge: "inWiki" | "inScopeNotRead" | "notInScope"; disputedFindingId?: Id<"findings"> }

// What Lane B's full build hands to Lane A's internal.wikis.saveGeneration.
export interface GeneratedBlock { blockId: string; points: Point[]; dropped: DroppedPoint[]; gap?: boolean }
export interface ProposedSection { heading; instruction?; safety?: boolean; blocks: { kind: BlockKind; tone?: CalloutTone; points: Point[] }[] }
export interface SaveGenerationArgs {
  wikiId: Id<"wikis">; ticket: number; model: string; promptVersion: string; sources: SourceRef[];
  mode: "outline" | "propose";            // outline: fill known blockIds; propose: no outline yet, first build
  blocks?: GeneratedBlock[];               // mode "outline"
  proposed?: ProposedSection[];            // mode "propose"
  intro?: GeneratedBlock; keyPoints?: GeneratedBlock;
}
export interface SaveBlockGenerationArgs { blockId: string; ticket: number; points: Point[]; dropped: DroppedPoint[]; gap: boolean; model: string }

export function normaliseForKey(text: string): string   // NFKC, lower case, strip markers ¹²³ and [n], strip punctuation except . in numbers, collapse whitespace
export function pointKey(text: string): string           // short hash of normaliseForKey(text)
export function allPoints(content): Point[]               // every point of every block; used by check 5, get, MCP, Ask overview
export function normaliseContent(content): WikiContentV2  // reads legacy content (sections[].points) as v2
```

`pointKey` and `normaliseForKey` are owned by Lane A (pure, in this file). Lanes B and C import them; browser check 2 uses the same normaliser.

### 6.2 Schema (`convex/schema.ts`, Lane A only)

- `wikis` (`:548-635`):
  - `content`: union of the legacy shape and `WikiContentV2` (keep legacy readable until migration has run; `normaliseContent` everywhere).
  - add `outline: v.optional({ sections: OutlineSection[], introEnabled: boolean })`, `outlineStaged: v.optional(same)`, `stagedVersion: v.optional(v.number())`, `outlineUpdatedAt`, `outlineUpdatedBy: v.optional(v.id("people"))`.
  - add `confirmByAnother: v.optional(v.boolean())`, `maxDanger: v.optional(v.number())`, `readingLevel: v.optional(...)`, `length: v.optional(...)`.
  - add `droppedDetail: v.optional(v.array({ text, reason, detail, blockId: v.optional(v.string()) }))`, capped at 20 (written in the MVP, shown in 1.5).
  - add `model`, `promptVersion`, `rebuildScheduledAt: v.optional(v.number())` (publish coalescing, 3.8).
  - add indexes `by_status` and `by_startHere` (lookups scan with `.take(200)` today).
- New `wikiBlocks`:
  `{ wikiId, sectionId: string, blockId: string, order: string (fractional key), state: "live" | "staged" | "removedStaged", stagedOf: v.optional(v.id("wikiBlocks")), kind, origin, status, tone?, columns?, fold?, instruction?, readingLevel?, length?, sourceSet, pinnedChunkIds: Id<"chunks">[], hiddenPointKeys: string[], points: Point[], writtenText?: string, checkId?: Id<"wikiChecks">, confirmedBy?: Id<"people">, confirmedAt?, dependsOn: {documentId, version}[], generationTicket: number, droppedPoints: number, authorPersonId?, updatedAt, updatedBy? }`
  Indexes: `by_wikiId_and_state`, `by_wikiId_and_blockId`, `by_wikiId_and_status`.
- New `wikiChecks`: `{ wikiId?, blockId?, personId, text, claims: ClaimResult[], stats: SearchStats, cacheKey, model, ok: boolean, at }`. Index `by_cacheKey`, `by_wikiId`.
- New `wikiEvents` (append-only): `{ wikiId, at, personId: v.union(v.id("people"), v.null()), kind, blockId?, sectionId?, detail: v.string() }`. Index `by_wikiId_and_at`.
- New `aiActions` (cost guard): `{ bucket: "person" | "system", personId: v.union(v.id("people"), v.null()), wikiId?, action: "wikiBuild" | "wikiBlock" | "wikiCheck" | "wikiFind" | "wikiRestyle", at, ms, ok: boolean, estTokens: v.number() }`. Indexes `by_personId_and_at`, `by_wikiId_and_at`, `by_bucket_and_at`, `by_at`.
- New `wikiReads` (measures, 7.5): `{ wikiId, at, surface: "desktop" | "phone", maxSectionIndex: number, sectionCount: number, foldToggles: number, checkedIn: boolean }`. No person id, no text. Index `by_wikiId_and_at`.
- `wikiBuilds` (`:639-656`): add `contentV2: v.optional(...)`, `outline`, `blocks` (snapshot of live block rows), `scope`, `title`, `purpose`, `model`, `promptVersion`, `reason: "build" | "apply" | "restore" | "preMigration"`.
- `proposedRevisions.source.kind`: add `v.literal("wiki_check")`, plus `wikiId: v.optional(v.id("wikis"))`, `checkId: v.optional(v.id("wikiChecks"))`.

### 6.3 Migration of the four live Wikis

`convex/wikiBlocks.ts` `migrateLegacy` (internal mutation, idempotent, run with `npx convex run wikiBlocks:migrateLegacy`), with `rollbackMigration({wikiId})`:

1. **Snapshot first.** Write a `wikiBuilds` row with `reason: "preMigration"` holding the legacy `content` unchanged. Retention never deletes `preMigration` rows within 365 days.
2. **Build the outline.** One outline section per legacy section (new id, same heading, `instruction` = heading, `safety` kept, no cap), one `generated` block per section with its points copied unchanged (`kind` from the legacy section, `pointKey` computed, `key` flag kept on the point). No `keyPoints` block is made from legacy `key` points: the legacy sections already hold those points, so a separate block would duplicate them. An intro section (`role: "intro"`) is added with one `intro` block in `generating` state, and an empty `keyPoints` block in `generating` state.
3. **Compose in legacy-preserving mode.** `compose({wikiId, mode: "legacy"})`: dedupe off, danger cap off, `disputed` set where the other side resolves but never withholding a point. Write the result to `wikis.contentV2Pending`, not to `content`.
4. **Equality check.** `allPoints(contentV2Pending)` must equal the legacy point count exactly, with the same `pointKey` multiset. If not, stop, leave `content` as it was, and report the difference.
5. **Swap on intro.** Schedule a rebuild of the intro and key points blocks only. When the intro block is `grounded` (or `gap`), compose in normal mode, swap `content` to v2 and clear `contentV2Pending`. Until then readers see the old `content`, unchanged.
6. **Expected delta.** The normal-mode compose in step 5 may drop duplicate points (4.4), withhold disputed points whose other side does not resolve (5.4), and turn extra danger callouts into warnings. It reports each count as an expected delta in the `migrated` event detail ("Dedupe dropped 7 repeated points; 0 withheld; 1 danger callout turned into a warning").
7. **Rollback.** `rollbackMigration({wikiId})` restores `content` from the `preMigration` build, deletes the Wiki's `wikiBlocks` rows and `outline`, and logs `restored`.

- `seedKnowledge` and `seedMinimal` create Wikis through the normal path, so new Wikis are v2 from birth.
- Readers call `normaliseContent`, so an un-migrated Wiki still renders.

### 6.4 Server functions

**Lane A: `convex/wikiBlocks.ts` (new), `convex/wikis.ts`, `convex/lib/aiBudget.ts`**
- Queries: `editorState({wikiId})` (outline, staged outline, `stagedVersion`, all block rows with status, staged count, who else staged recently, remaining AI allowance for the viewer and for the Wiki, last 20 events), `builds({wikiId})` (last 10 for Restore). Phase 1.5: `changes({wikiId})`, `events({wikiId, cursor})`.
- MVP mutations (all `personId` arg, `requireEngineerOrAdmin`, each writes `wikiEvents`): `addSection`, `updateSection` (heading, instruction, safety, fold), `moveSection`, `removeSection({reason?})`, `addBlock({sectionId, afterBlockId, kind, instruction?, sourceSet?, readingLevel?, length?})` (returns `blockId`; schedules generation for generated kinds), `updateBlock` (fold, tone, instruction, sourceSet, pinned chunks), `moveBlock`, `removeBlock`, `setWrittenText({blockId, text})` (status `unchecked`), `applyStaged({stagedVersion})`, `discardStaged`, `confirmBlock({blockId})` (refuses the author), `sendBack({blockId, note})`, `restoreBuild({buildId, reason})`, `updateSettings({confirmByAnother?, maxDanger?, reason?, readingLevel?, length?})`, `addToScope({wikiId, documentId, viaAi: boolean, forBlockId?})`, `recordRead(...)` (public, no auth beyond `requireUser`, rate limited to one per Wiki per viewer session).
- Phase 1.5 mutations: `pinPoint`, `hidePoint({reason})`, `acceptChange({blockId})`, `keepPreviousWording({blockId})`.
- Internal: `saveBlockGeneration(SaveBlockGenerationArgs)` (rejects stale ticket), `saveCheckResult({blockId, checkId, status, points})`, `compose({wikiId, mode: "normal" | "legacy"})` (outline + live blocks with visible status → `content` v2, dedupe 4.4, danger cap, `checkPoint` on written points (3.8), coverage line data), `migrateLegacy`, `rollbackMigration`, `wikiMetrics()` (7.5). Phase 1.5: `recheckWrittenBlocks` with the LLM re-judge.
- `convex/wikis.ts`: `get` reads `normaliseContent`, uses `allPoints` for `visiblePoints`, findings, figures (figures attach to an `images` block per section); `saveGeneration(SaveGenerationArgs)` (`:1038-1102`) maps a build into blocks by `blockId` (mode "outline") or creates the outline (mode "propose") and calls `compose` instead of replacing `content`; `regenerateWikisForDocument` (`:940-955`) sets `rebuildScheduledAt` and coalesces (3.8); `remove` writes a `deleted` event; `mcpGet` (`:1212-1288`) returns intro sentences and origin marks, never staged, unchecked or awaiting text; `openContradictions` exposes counts split into "touches a shown point" and "other".
- `convex/lib/aiBudget.ts`: `assertBudget(ctx, {bucket, personId, wikiId, action})` and `recordAiAction`. See 6.6 for caps. `bucket: "system"` is used when `personId` is null (migration, publish-triggered rebuilds, nightly cron).
- `convex/devChecks.ts`: see 8.2.

**Lane B: `convex/ai/wiki.ts`, new `convex/ai/wikiBlock.ts`, `convex/ai/grounding.ts`**
- `grounding.ts`: add `checkProse(sentences: RawPoint[], excerpts)` = `checkPoint` per sentence with only that sentence's own citations; a sentence with no citation is dropped (`reason: "no-citation"`). Imports `pointKey` from `wikiTypes.ts`.
- `ai/wiki.ts` prompt (`WIKI_BASE :61-89`, `FORMAT_RULES :91-109`): remove "Do not write an introduction, a conclusion or filler." (`:88`); add the 4.9 rules, reading level and length from the Wiki settings, the golden example, "Fill exactly these blocks by id: [...]; keep headings; do not invent sections", "Open a section with 3 or more points with a one or two sentence lead", "Use tone danger for at most <maxDanger> callouts", "Return gaps[] for block instructions you cannot support". Bump `PROMPT_VERSION`.
- `generate` (`:289-311`): returns `SaveGenerationArgs`. When the Wiki has an outline, one model call fills all `generated` blocks whose `sourceSet` is "scope" and that need a rebuild (mode "outline", stable ids); blocks with their own `sourceSet` or pinned chunks get their own call through `wikiBlock.generateBlock`. When there is no outline (a new Wiki), mode "propose".
- Passage selection per block: `pickChunks` (`:113`) on the block's heading plus instruction stems, plus pinned chunks first; for `generateBlock` also embed the instruction (`embedText`, `convex/mcp/embedding.ts:8`) and vector search filtered to the source set's Documents (up to 64), post-filtered to live versions, merged, top 32.
- `ai/wikiBlock.ts` (new): `generateBlock({wikiId, blockId, personId})` (action: budget, ticket, retrieve, one Claude call, ground, `saveBlockGeneration`), `rewriteFromPassage({checkId, claimIndex, personId})` (Use the Published wording). Phase 1.5: `restyleBlock`.
- Post-grounding steps (shared helper): dedupe by `pointKey`, `disputed` enforcement (5.4), danger cap, dropped details (first 20) with plain-language reasons from `DroppedPoint.detail`.
- Stub (`:679-722`): deterministic stub output per block (fixed intro of 3 cited sentences, fixed points per kind) so dev checks and stub-mode browser checks are repeatable.

**Lane C: new `convex/ai/wikiCheck.ts`, `convex/ai/consistency.ts` (additive exports only), `convex/ai/guidedChat.ts` (export only), `convex/revisions.ts`**
- `consistency.ts`: export `factConflict` (`:126`) and `features` (`:73`); add exported `judgeClaims(claims, passages)` built on `judgeBatch` (`:444`) / `JUDGE_SYSTEM` (`:363`) / `verifyQuote` (`:414`) where side A is the claim text as a pseudo-passage. Labels: supported, partly (with the supported span), contradicted, not_addressed, each with a verbatim quote; `verifyQuote` failure falls back to not_addressed. Additive only: `checkDocument`, `runAll` and the nightly path must behave exactly as before; Lane C runs the existing G and consistency dev checks to prove it.
- `guidedChat.ts`: export the internal `searchPassages` (`:315`) unchanged.
- `wikiCheck.ts`:
  - `checkText({wikiId?, blockId?, text, personId})` (action): kill switch and budget; split into claims (3.5); one batched `embedText`; per claim `vectorSearch` over the whole library, limit 48, post-filter to live Published (`internal.captures.sets.publishedPassages`, `convex/captures/sets.ts:368`), score at least 0.55, top 4, mark `inScope`; record `SearchStats` (documents and passages searched, documents with unembedded chunks); cache lookup by `sha256(normalise(claim) + live versions of the top passages)` (the cache saves the LLM call only; embed and search always run); deterministic pass `checkPoint(claim, passages)`: ok gives Supported (`via: "code"`); `factConflict` same unit or code family with another value, or `negation-mismatch`, gives Differs (`via: "code"`); one `judgeClaims` call for all unsettled claims (often zero) gives supportedByJudge, partly, differs or notCovered (`via: "judge"`); `findings.openFindingsTouching` (`convex/findings.ts:100`) on supporting chunks gives Already disputed; two retrieved Published passages that `factConflict` with each other set `conflictPair`. Saves `wikiChecks`; when `blockId` is set, calls `wikiBlocks.saveCheckResult` with status (3.5 step 3) and cited points. On any failure: `ok: false`, block stays `unchecked`, not counted (3.5 step 4).
  - `findSources({wikiId, blockId, query?, mode: "words" | "ai", personId})` (action): budget; for "ai" builds the query from the block heading plus instruction plus Glossary synonyms; `searchPassages` with limit 40 over the whole library; groups by Document; sets `badge`; `disputedFindingId` from open Findings; returns at most 12 Documents with their best passage, plus `indexingNote`.
  - `proposeRevisionFromCheck({checkId, documentId, claimIndexes, personId})` (mutation path into `revisions.start`, `convex/revisions.ts:434`) with `source.kind: "wiki_check"`; one row per check per Document, later presses add claims to it (3.5.1).
  - `runConsistencyOnPair({checkId, claimIndex, personId})`: calls `findings.runCheckNow` (`convex/findings.ts:433`) for the pair's first Document.
- `revisions.ts`: accept `"wiki_check"` in `start` and show the source in `forDocument`/`list` ("From a Wiki check by Sanne Visser, 3 claims").

### 6.5 UI components

**Lane D (reader, phone, print)**
- `src/components/wiki/WikiReader.tsx`: becomes the block renderer: `WikiSection` (fold, slug, safety style), `BlockView` switch. Takes `renderBlockChrome?: (block) => ReactNode` and `renderInsert?: (sectionId, afterBlockId) => ReactNode`.
- New `src/components/wiki/blocks/`: `IntroBlock.tsx` (+ coverage line), `ProseBlock.tsx`, `KeyPointsBlock.tsx`, `ListBlock.tsx` (bullets, steps), `TableBlock.tsx`, `CalloutBlock.tsx`, `ImagesBlock.tsx`, `GapBlock.tsx`, `OriginMark.tsx` (with the verbatim passage on hover for written blocks).
- New `src/components/wiki/Citations.tsx`: grouped superscript markers (4.5) with popover (reuse `SourceChip` popover body), section source line, inline-codes toggle.
- New `src/components/wiki/useFold.ts`: fold state per viewer (localStorage, try/catch), expand/collapse all, hash open.
- `src/pages/desktop/WikiPage.tsx`: page order 4.1, trust line 4.6, rail fixes (sticky offset so the first TOC item is not under the header, Built from scroll), footer, `recordRead` on leave, and the **edit mount point**: `{canEdit && <WikiEditLayer wiki={wiki} onEditingChange={setEditing} renderers={setRenderers} />}` passing `renderBlockChrome` and `renderInsert` from the layer into `WikiReader`. Lane D owns this file; Lane E only fills those props.
- `src/components/wiki/edit/WikiEditLayer.tsx` **stub** (Lane D writes it in hour one, Lane E then owns and replaces it): exports the component and the prop types, renders nothing, returns `renderBlockChrome = () => null` and `renderInsert = () => null`.
- `src/components/wiki/wikiShared.tsx`: `sectionSlugs` keyed by section id; `groupByDocument` reused for the section source line.
- `src/components/wiki/wikiStarters.ts`: starter questions from heading type templates ("What are the main hazards on line 2?", "When should I measure?").
- `src/pages/mobile/MobileWikiPage.tsx`: 4.7, `recordRead` on leave.
- `src/components/wiki/WikiPrintLayout.tsx`: 4.8.
- `src/pages/desktop/FindingsPage.tsx`: accept `?wiki=<id>` (filter to Findings whose `a` or `b` Document is in that Wiki's sources).
- `src/pages/desktop/WikiListPage.tsx` (small): hide "Suggested. Set the path..." from non-Engineers; card shows "Updated 2 days ago" instead of "opened 1 time"; hide the format badge (`:505`).

**Lane E (editor, desktop only)**, all under `src/components/wiki/edit/` (takes over `WikiEditLayer.tsx` from D's stub):
- MVP: `WikiEditLayer.tsx` (edit mode state, subscribes to `wikiBlocks.editorState`), `EditBar.tsx` (unapplied count, also-editing note, AI allowance, Preview, Apply, Discard, Restore previous build), `SectionControls.tsx` (rename, instruction, safety, fold default, Move up / Move down, remove), `BlockChrome.tsx` (origin and status mark, menu: Regenerate, Find sources, Remove, Confirm or Send back), `InsertMenu.tsx` (+ Section, + Block), `GeneratePanel.tsx` (with reading level and length), `FindSourcesPanel.tsx`, `WriteAndCheck.tsx` (text box, Check button, per-claim verdict list with how each was reached and the search stats, actions), `ConfirmPanel.tsx` (claims beside verbatim passages), `RestoreDialog.tsx`, `SettingsDialog.tsx` (confirm by another, danger limit with reason, reading level, length).
- Phase 1.5: `ChangesPanel.tsx`, `DroppedSheet.tsx`, `WordDiff.tsx`, `HistorySheet.tsx`, restyle and pin and hide in `BlockChrome.tsx`, standalone check in `EditBar.tsx`.
- Buttons call actions with `personId` from the existing check-in context, show a spinner and the server's message ("Busy: try again in 12 min", "AI is switched off for Wikis", "Daily limit for this Wiki reached"); no request fires on typing. All controls are buttons reachable by Tab, with labels.

### 6.6 Usage and cost guardrails

- **No AI on keystrokes, focus or scroll.** Every AI call starts from a named button: Generate, Regenerate, Use the Published wording, Check against Published, Search for this block, Rebuild now (Phase 1.5 adds Turn into and Check a statement). Text inputs that only filter local lists debounce at 250 ms and never call an action.
- **Kill switch**: env flag `OPPR_WIKI_AI_OFF=1` makes `assertBudget` refuse every Wiki AI action ("AI is switched off for Wikis"); reading, editing structure, writing by hand and applying still work, and the deterministic `checkPoint` in `compose` still runs.
- **Caps** (`aiActions`; failed actions with `ok: false` do not count):

| Bucket | Cap |
|---|---|
| Person, per hour | 30 block generations, 20 checks, 40 source searches |
| Wiki, per day | 60 AI actions of any kind (all people plus system) |
| System (`personId` null: migration, publish rebuilds, nightly), per day | 200 actions; per Wiki at most 6 system rebuilds per day |
| Deployment, per day | 1,000 actions (D4) |
| Concurrency | 1 running job per block (ticket); 3 running block jobs per Wiki |

  Over a cap: `ConvexError` with a plain message and when it frees up. The edit bar shows the viewer's remaining allowance and the Wiki's remaining daily allowance.
- **Cascade control**: publish triggers coalesce per Wiki over 10 minutes (3.8); the nightly cron skips Wikis whose `dependsOn` versions are all still live; rebuilds touch only blocks whose sources changed; written blocks are re-verified by code only (no LLM in the MVP).
- **Expected cost per action** (estimates from today's prompt sizes; the lead measures real numbers in the session and replaces these, stored as `estTokens`):

| Action | Calls | Tokens in / out (estimate) |
|---|---|---|
| Full build or rebuild (one Wiki, up to 160 passages) | 1 Claude | 45k / 5k |
| Block generation (top 32 passages) | 1 embed, 1 vector search, 1 Claude | 9k / 1k |
| Intro and key points rebuild | 1 Claude | 12k / 0.8k |
| Check, cache miss, judge needed | 1 embed batch, up to 12 vector searches, 1 Claude | 6k / 1k |
| Check, all claims settled by code or cache hit | 1 embed batch, up to 12 vector searches, no Claude | embed only |
| Find sources (words) | 1 embed, 1 vector search | embed only |
| Use the Published wording | 1 Claude | 2k / 0.2k |

- `aiActions` rows feed the AI usage and cost tracker (6.7); they hold no text.

### 6.7 AI usage and cost tracker (D4, Lane F, app-wide)

User's words: "i want to have an AI tracker so i can monitor what does everything cost.. we need to create an elaborate usage tool so that i can also start thinking about how to monetize this tool in usage and create clear settings once we actually sell the tool".

Scope is the whole app, not only Wikis: every Claude, Gemini chat, Gemini image and embedding call.

- **One meter**: a single helper (e.g. `convex/lib/aiMeter.ts`) wraps every model call site (`convex/ai/llm.ts` claudeJson, Gemini chat, image generation, embeddings, Ask, guided writers, Wiki builds, MCP tools). Each call writes one `aiUsage` row: time, feature (wiki.build, wiki.block, wiki.check, ask, writer, image.generate, embed.passage, embed.image, mcp, ...), provider, model, tokens in and out (or images, or embedded items), latency, ok or failed, person (nullable for system jobs), and the object it served (Wiki, Document, Training). No prompt or answer text. `aiActions` (6.6) becomes a view on, or is replaced by, `aiUsage`, so there is one source of truth.
- **Price table**: an Admin-editable table of model prices (per 1M tokens in and out, per image, per 1k embeddings) with an effective date, seeded with today's list prices. Cost is computed from the row and the price valid on that day, so a price change does not rewrite history. Label all amounts "estimate".
- **Tracker page**: `/dev/ai` Usage tab in the Developer section (replaces the "Usage hints" tab). Totals for today, 7 and 30 days; cost over time; breakdowns by feature, model, person, Wiki and Document; the most expensive actions; failed calls; system jobs vs people. Export CSV. Engineer/Admin only.
- **Plans and limits (for selling later)**: an Admin settings group, off by default, that turns the meter into plan rules: a plan per organisation (e.g. included AI actions or credits per month, per feature limits, overage on or off, hard stop or warn), with "what this customer used this month vs their plan". Until a plan is set, only the deployment guardrails from 6.6 apply. Pricing itself (amounts, plan names) is the user's decision, not built in.
- **Convex cost**: Convex usage (reads, writes, scheduled jobs) is not visible from inside the app; the tracker links to the Convex dashboard Usage page and keeps `aiUsage` small (one row per call, indexed by day and feature, daily rollups after 30 days).
- **Checks**: a dev check that every AI call site goes through the meter (a grep-based check in `devChecks` that model SDK calls only appear inside the meter), and a Playwright check that a Wiki block generation adds one row with a cost.

---

## 7. Phased plan

### 7.1 MVP: next session (tracer bullet)

Goal: the screenshot Wiki reads as a guide, and an Engineer can add a section, generate a block, write a sentence, check it and apply it, with every claim still cited. Built as two slices; slice 1 is demo-able on its own.

**Slice 1: reader, migration, intro (Lanes A, B, D)**
1. ADR 0007, ADR 0003 amendment and CONTEXT.md edits (A, first, after D1 and D2).
2. `wikiTypes.ts`, schema, lossless `wikiBuilds`, `wikiEvents` writes (no UI), `aiBudget` with kill switch, system bucket and daily caps (A).
3. Migration with snapshot, legacy-preserving compose, equality check, swap on intro, rollback (A).
4. Intro, prose leads, key points without repeats, danger cap, both values stated, reading level and length, golden example in the prompt (B).
5. Reader: blocks, folding, grouped citations, precise trust line, rail fixes, footer; phone rows, accordions, scoped Ask; print (D).
6. Measures: `wikiReads`, `wikiMetrics` (A, D).

**Slice 2: thin editor vertical (Lanes A, B, C, E)**
7. Edit mode: add, rename, move (buttons), remove sections; add and remove blocks; apply, discard; concurrent-edit guard; restore previous build (A, E).
8. Generate a block with reading level and length; regenerate (B, E).
9. Find sources for a block by words and AI; Add to Scope, Use for this block, Pin passage (C, E).
10. Write by hand and Check against Published with the six verdicts, search stats, failure handling, Proposed revision path with batching (C, E).
11. Second-Engineer confirm and the `confirmByAnother` setting (A, E).
12. Code-only re-verification of written blocks at every compose (A).

### 7.2 Phase 1.5 (the session after)

- Restyle ("Turn into").
- Pin and hide, with a second Engineer for hiding safety points.
- Changes panel, word diff, "Keep previous wording", "Accept AI rewrite".
- `needsRecheck` automation with the LLM re-judge and the W4 timing check.
- History sheet (`wikiEvents` UI) and "Read as it was".
- The `droppedDetail` sheet ("3 facts left out").
- Standalone "Check a statement" in the edit bar; whole-Wiki "Find sources" in the edit bar.
- Drag and drop for sections and blocks (buttons stay).

### 7.3 Phase 2

- Guided creation outline step (`WikiGuidedCreation.tsx`, `ai/wiki.ts guide`): after Scope, a proposed outline with a coverage dot per section (green covered, amber thin, red no Published source), intro on or off, reading level, length, audience templates (Plant manager 30 days; Operator week 1; Shift lead). Fixes the missing "start of shift" section and the assistant saying "nobody to call" while the build has extension 2222.
- Block kinds checklist (ticks local to the viewer, never a record), FAQ, glossary, contacts.
- Training pack print: intro, key points, steps and safety sections, with a sign line that points to the Training (the Training record stays the proof).
- "Add this answer to the Wiki" from Ask (re-grounded through `checkProse`, no extra LLM call).
- Check a statement in Ask, for everyone.
- `askEvents.scopeKind` gains `"wiki"` with `scopeId` (`convex/ai/ask.ts:758-763`, `schema.ts:784`); per-Wiki views.
- Archive instead of delete; tombstone for old QR codes.
- Phone offline: keep the last-read copy of a Wiki for reading without signal, marked "Saved copy from <time>; may be out of date".
- Read model precompute (health, coverage, diff) on save so `get` and `list` only read; target cold open under 2 s.
- Vector index: `chunks.live: boolean` kept on publish, archive and delete, added to `filterFields`, so searches need no over-fetching.

### 7.4 Phase 3

- Reader "This is unclear or wrong" on a point (writes `contentFlags` with source `"reader"`).
- Wikis on the ISO evidence page (`convex/iso.ts`).
- Start here per Skill profile; "Practise this" links to Trainings.
- Dutch and English toggle per Wiki: the reader picks the language; the build makes both from the same cited passages, each grounded on its own.
- Wiki Usage and Knowledge health rows (unused Wikis, questions the Wiki does not answer feeding gap suggestions).
- Phone step-by-step mode for `steps`.
- Outline templates reusable across Areas.

### 7.5 MVP success measures

`internal.wikiBlocks.wikiMetrics` returns, per week:
1. **Share of Wikis with an intro**: Wikis whose `content` has a composed `intro` block, over all built Wikis. Target: 100% of live Wikis after migration.
2. **Blocks added by Engineers per week**: `wikiEvents` of kind `blockAdded` with a `personId`, and how many of them were applied. Signal that the editor is used.
3. **Read depth and fold use**: from `wikiReads`, the median share of sections reached (`maxSectionIndex / sectionCount`) and fold toggles per read, desktop and phone apart.

### 7.6 Lanes, file ownership, contracts and integration order

**Integration order:** A types and schema (hour one) → B, C and D in parallel (D ships the mount-point stubs in hour one) → E (starts on C's sample data and D's stubs, wires to real functions as they land); F runs in parallel from hour one → lead integrates.

| Lane | Owns (only this lane edits) | Delivers first (contract) |
|---|---|---|
| **A. Model and server core** | `convex/schema.ts`, `convex/lib/wikiTypes.ts` (incl. `pointKey`), `convex/lib/aiBudget.ts`, `convex/wikiBlocks.ts`, `convex/wikis.ts`, `convex/devChecks.ts`, `convex/mcp/*` (only `mcpGet` output), `convex/ai/ask.ts` (only `buildScopeOverview` reading `allPoints`), `docs/adr/0003-*.md`, `docs/adr/0007-*.md`, `CONTEXT.md` | Within the first hour: `wikiTypes.ts` (including `SaveGenerationArgs`, `SaveBlockGenerationArgs`, `CheckResult`, `pointKey`) and the schema pushed (`npx convex dev --once`); every 6.4 mutation and query as a stub that typechecks and returns fixed data. |
| **B. Generation** | `convex/ai/wiki.ts`, `convex/ai/wikiBlock.ts`, `convex/ai/grounding.ts` | `checkProse` exported early; `generate` returns `SaveGenerationArgs`; calls only `internal.wikiBlocks.saveBlockGeneration` and `internal.wikis.saveGeneration` with the 6.1 types. |
| **C. Check and find** | `convex/ai/wikiCheck.ts`, `convex/ai/consistency.ts` (additive exports only), `convex/ai/guidedChat.ts` (export only), `convex/revisions.ts` | `api.ai.wikiCheck.checkText` returning `CheckResult` and `findSources` returning `{sources: FoundSource[], indexingNote}`; until real, return fixed sample data so E can build. Proves the nightly Consistency check is unchanged (8.2). |
| **D. Reader, phone, print** | `src/components/wiki/WikiReader.tsx`, `src/components/wiki/blocks/*`, `Citations.tsx`, `useFold.ts`, `wikiShared.tsx`, `wikiStarters.ts`, `WikiPrintLayout.tsx`, `src/pages/desktop/WikiPage.tsx`, `WikiListPage.tsx`, `FindingsPage.tsx`, `src/pages/mobile/MobileWikiPage.tsx`; the hour-one stub of `edit/WikiEditLayer.tsx` | Hour one: the mount points in `WikiPage.tsx` and `WikiReader.tsx` plus the empty `WikiEditLayer` stub with its prop types, so E can render from minute one. Renders from `normaliseContent(content)`. |
| **E. Editor** | `src/components/wiki/edit/*` (takes over `WikiEditLayer.tsx` after D's stub lands) | Uses only `api.wikiBlocks.*`, `api.ai.wikiBlock.*`, `api.ai.wikiCheck.*` signatures from 6.4; renders only through D's mount points. |
| **F. AI usage and cost tracker** (6.7) | `convex/lib/aiMeter.ts`, `convex/aiUsage.ts`, `convex/aiPrices.ts`, the call-site wrapping in `convex/ai/llm.ts` and other model call sites outside Lane B and C files (B and C call the meter, F does not edit their files), the `/dev/ai` Usage tab and the Plans and limits settings group | Hour one: the `aiMeter` signature (`meter(ctx, {feature, model, personId, target}, call)`) so B and C wrap their calls from the start; the `aiUsage` and `aiPrices` tables go through Lane A's schema. Lane A's `aiBudget.ts` reads from `aiUsage`. |

Rules for all lanes:
- Do not edit a file another lane owns. If you need a change there, write the request as a short note at the top of your final report; the session lead merges it.
- `wikiTypes.ts` is the contract. Lane A changes it only additively after hour one.
- Each lane runs `npx tsc -b` before handing back. The lead runs `npx vite build`, `npx convex dev --once`, `npx convex run devChecks:run`, `npx convex run wikiBlocks:migrateLegacy`, then the browser checks in 8.1.
- No em dashes in UI text. Use the CONTEXT.md words (Published, Scope, Finding, Proposed revision, Engineer); call staged edits "unapplied changes", never "Draft" (that word belongs to Guided creation and Documents).

---

## 8. Acceptance criteria and checks

### 8.1 Browser checks (Playwright, check in as Sanne Visser, app at http://localhost:5173, Wiki "Running Pijpwerk Noord for 30 days")

Every check runs in two modes:
- **Stub mode** (`OPPR_AI_STUB=1` on the dev deployment): deterministic, the pass or fail gate. Fixed timings: a staged block appears within 10 s.
- **Live mode** (real AI): smoke only, reported but not a gate. Timings are generous (a staged block within 90 s) and wording-based asserts are relaxed to structure.

Desktop 1440x900:
1. An introduction of 2 to 4 sentences and under 90 words appears above the first section, with at least one superscript marker; hovering one shows a passage. No intro sentence has token overlap of 0.6 or more with any section heading, and none opens with "This Wiki" or "This guide". The coverage line names documents and passages read.
2. No point text appears more than once on the page: collect the text of all rendered points and captions, apply `normaliseForKey` (6.1; imported from `convex/lib/wikiTypes.ts`), and assert no duplicates.
3. At most `maxDanger` (default 2) strong danger boxes; no filled amber boxes.
4. No document code is rendered inline after sentences (until "Show source codes inline" is on); each section has one "Sources:" line; no more than one marker per run of 3 sentences with the same sources.
5. Collapse "Critical process limits", reload: it stays folded. A safety section has no "close by default" and opens on `#slug`. Expand all works.
6. The contradiction banner names the fact and scrolls to it; the Findings link opens `/library/findings?wiki=<id>` listing only this Wiki's Findings; "review overdue" names a Document.
7. Edit: add section "Who decides what in week 1" with that instruction, Generate with reading level Office and length Normal: a staged block with cited points or a gap message appears (stub 10 s, live 90 s); Apply; in a second browser context (not an Engineer) the section is visible. Rebuild now: the section, its heading and its position survive.
8. Write by hand "Barrel zones of EXL-201 are never above 230 °C." and Check: the verdict is Differs or Already disputed with both quotes; Apply is refused while it stands. "Propose a revision" creates one Proposed revision visible on that Document with source "From a Wiki check"; pressing it again for the same check does not create a second one.
9. Write "Cool a burn under running water for 20 minutes." and Check: Supported (via code) with the passage; Apply; the reader shows "Written by Sanne Visser, verified <date>", and hovering it shows the verbatim passage.
10. A claim that only the judge supports (stub fixture) goes to `awaitingConfirm` and is not visible to a reader; a second Engineer (second context, checked in as another Engineer) confirms it; it becomes visible. Sanne cannot confirm her own block.
11. Find sources "first aider extension" from a gap block: results grouped by Document with badges; "Add to Scope" on a Document not in Scope adds it and regenerates only that block; the `wikiEvents` row says "suggested by AI search" when AI search was used.
12. Typing in any editor box triggers no network call to an action (check the network log while typing 20 characters).
13. **Concurrent edit**: two Engineer contexts on the same Wiki. A adds a section; B sees "Also editing: Sanne Visser"; B opens Preview; A applies; B's Apply is refused with the "changed this since" message and the preview refreshes.
14. **Budget in the UI**: with the person cap lowered by a dev-only setting to 1, a second Generate shows "Busy: try again in N min" and the allowance reads 0. With `OPPR_WIKI_AI_OFF=1`, Generate shows "AI is switched off for Wikis" and Apply of structure still works.
15. **Role lost mid-edit**: check out (or switch to a non-Engineer) with unapplied changes; Apply shows "You are no longer checked in as an Engineer"; the staged changes are still there for another Engineer.
16. **Check failure**: with the stub forced to fail the judge, Check shows "The check did not run", the block stays `unchecked`, and the allowance is unchanged.
17. **Restore**: Apply a change, then Restore previous build: the earlier content returns and a `restored` event exists.
18. **Keyboard and screen reader**: with the keyboard only, open Edit, add a section, move it up, generate, apply, and fold a section. Every control has an accessible name; chevrons expose `aria-expanded`; an axe scan (`@axe-core/playwright`, added as a dev dependency by the lead) on the reader and in edit mode reports no serious or critical issues.

Phone 390x844 (`/m/wiki/<id>`):
19. Points render as rows (no element per point with its own border); one "Sources (n)" link per row, and one per intro or prose paragraph, opens the source sheet.
20. Sections fold; "Ask about this Wiki" opens Ask scoped to the Wiki; steps are not inside a callout box; the bottom nav does not highlight Find.

Print:
21. Print preview contains the intro, all sections expanded and numbered endnotes; the one-pager contains Key points, danger callouts and safety sections only; the footer says "Generated overview, not a controlled document".

Migration (run on dev before the browser checks):
22. `migrateLegacy` on the four live Wikis: the legacy-mode point counts and `pointKey` multisets are equal; readers see the old content until the intro is ready; after the swap the `migrated` event lists the expected delta; `rollbackMigration` on one Wiki restores its old content exactly.

Build: `npx tsc -b` and `npx vite build` exit 0.

### 8.2 Dev checks (`convex/devChecks.ts`, Lane A; existing ids D, 3, 4, 5, G, B, I, M, S, N, 7, F, 6 are taken)

- **4** unchanged in intent: also assert staged, unchecked and `awaitingConfirm` block text never appears in `content`, `mcpGet` or the print data, and that `PX-9917` appears in no block row of any Wiki.
- **5** extended: iterate `allPoints(content)` (intro, prose, key points, callouts, rows, written blocks); every point has citations to the in-scope live Published version and passes `checkPoint` (`checkTableRow` for rows) again.
- **7** unchanged: a Scope with nothing Published gives `status: "empty"` and `content: null`; no outline sections are composed.
- **G** extended with prose and claim cases: a supported sentence; a sentence with a different number; a different unit; a negation flip; a code not in the passage; a sentence with no citation in a prose block (dropped); a two-sentence paragraph where only one sentence is supported (one dropped); a compound sentence split into two claims.
- **W1 (new)**: every composed block is either `generated` with status `grounded`, or `written`/`edited` with status `checked` whose `wikiChecks` row shows every claim Supported via code, or Supported by the judge with `confirmedBy` set to a person other than the author; `gap` blocks have no points.
- **W2 (new)**: outline survives a rebuild: on a probe Wiki, add a section with an instruction, rename one, move one, rebuild; section ids, headings and order are the same afterwards.
- **W3 (new)**: `checkText` deterministic stage on fixed passages (no LLM): Supported, Differs (number), Differs (negation), Not covered (with search stats) and a split compound come out as expected.
- **W5 (new)**: no point in `content` cites one side of an open contradiction Finding without `disputed` set.
- **W6 (new)**: a written block whose cited passage's value changes in a newly published version is out of `content` after the next `compose` (code-only re-verification, 3.8).
- **W7 (new, live only, not in the default run)**: `npx convex run devChecks:judgeFixtures` runs a fixture set of at least 20 claims against fixed Pijpwerk Noord passages through the LLM stage (supported in other words, qualitative contradictions such as "never" against "only when", partly supported compounds, not addressed). Target: at least 18 of 20 verdicts agree with the fixture labels; any disagreement where the judge says Supported but the label is Differs fails the check outright.
- **Consistency unchanged**: the existing Consistency check dev check still finds the four seeded contradictions and the duplicate, with the same counts as before Lane C's change.
- Budget check (`:574-596`) extended: `aiBudget` refuses the 31st block generation in an hour for one person, the 61st action on one Wiki in a day, a system action past the system cap, and everything when `OPPR_WIKI_AI_OFF` is set; a failed action does not count.
- **W4 (Phase 1.5)**: the LLM re-judge sets `needsRecheck` within 60 s of a publish.

---

## 9. Risks and open questions (with the recommended default)

| # | Question or risk | Recommended default |
|---|---|---|
| Q1 | Does Engineer-phrased text count as "derived from Published" under ADR 0003? | Decided by D1 and D2: yes when code proves each claim; a second Engineer confirms judge-only claims; ADR 0003 amended and ADR 0007 written (5.5). |
| Q2 | Unsupported hand text: block it, or allow a labelled "Engineer note"? | Block it completely. It goes to a Proposed revision. Revisit only with a separate ADR. |
| Q3 | Should applying changes need a second person? | Per Wiki (`confirmByAnother`), on by default for Start here Wikis; always for judge-only claims. |
| Q4 | Uncited connecting sentences in the intro ("This guide covers your first week")? | Not allowed as stored text. The coverage line and gap messages are code-written. Fluency comes from grouped markers (4.5) and the 4.9 rules, not from uncited sentences. |
| Q5 | Per-block source sets versus the one-Scope rule (CONTEXT.md:251). | A block's source set must be a subset of the Scope; adding a Document outside the Scope adds it to the Scope. |
| Q6 | A written point fails re-verification after a publish: hide at once or warn? | Hide at once from readers (code-only, at compose); the Engineer sees it in edit mode (MVP) and in the Changes panel (Phase 1.5). |
| Q7 | Who may edit the outline? | Any checked-in Engineer or Admin, as for Edit scope today; every change logged with the person. |
| Q8 | Longer prose sentences may fail `MIN_SUPPORT` (0.4). | Do not lower it globally. `checkProse` checks each sentence on its own citations; the 4.9 sentence length rules keep sentences short; add G cases. |
| Q9 | Contacts and glossary come from the Plant, not from Published Documents. | Phase 2. Show Plant items only as labelled links ("From the Plant"); phone numbers only when a Published passage states them. |
| Q10 | Cost: per-block generation and checks multiply AI calls. | 6.6: person, Wiki, system and deployment caps, kill switch, coalesced rebuilds, cached checks, code-only re-verification. |
| Q11 | Migration changes the four live Wikis' look and could drop points. | 6.3: snapshot, legacy-preserving compose with an exact equality check, old content until the intro is ready, expected delta reported, rollback. |
| Q12 | Parallel lanes collide on `WikiPage.tsx`, `schema.ts` and the generation contract. | 7.6: strict ownership, typed `SaveGenerationArgs`, D's hour-one stubs, a fixed integration order. |
| Q13 | Library-wide check may surface passages from Areas a person may later not be allowed to see. | Today all Published Knowledge is visible to every user; search the whole library. Revisit when per-role visibility exists. |
| Q14 | Language of the intro and prose (NL or EN)? | MVP follows the language of the purpose line; Glossary links give the other words. Phase 3 adds a reader toggle (7.4). |
| Q15 | Is a Wiki "documented information" under ISO 9001 with a retention period? | Moved to D3: decide before building. |
| Q16 | The live outline is now owned by people: will the AI still fix a bad structure? | Regenerate keeps the outline. Phase 2's Guided creation outline step and a "Suggest outline changes" button (preview only) handle it. |
| Q17 | Demo first on desktop (plant manager) or phone (operator)? | Desktop first: slice 1 is the demo; phone rows and scoped Ask ship in the same slice. |
| Q18 | The AI judge is probabilistic. | It never decides alone: judge-only Supported needs a person (5.1); W7 measures agreement; the UI says when a verdict came from the judge. |

---

## Review notes

Review of 2026-10-25 applied as follows. Accepted unless listed here.

- **Finding 1 (ADR 0003).** Accepted. One adjustment: the reviewer asked to restrict MVP written blocks to `checkPoint`-only claims and also to add the second-Engineer confirm in the MVP. Since the confirm now exists in the MVP, judge-only claims are allowed but always routed through it (5.1) instead of being refused outright. This keeps the Engineer useful when the wording differs from the passage, without the model ever deciding alone.
- **Finding 2 (scope).** Accepted. Two items stayed in the MVP: Find sources per block (the user asked for it by name, and it is small once `searchPassages` is exported), and lossless `wikiBuilds` plus `wikiEvents` writes without UI (needed for Restore and migration rollback). Drag and drop also moved to Phase 1.5; the MVP uses Move up / Move down buttons, which also meets the keyboard requirement.
- **Finding 4 (cost).** Accepted. The token numbers in 6.6 are estimates from prompt sizes, not measurements; the session replaces them with measured values.
- **Finding 5 (writing).** Accepted. The golden example is illustrative wording built from the seed's plant description (`convex/seedKnowledge.ts:29`); at build time every fact must come from cited excerpts. The rubric's last item stays a human judgement.
- **Finding 6 (stakeholders).** Accepted, except the training pack: the MVP offers the existing full print as the handout instead of a new export, to keep the MVP small; the dedicated Training pack print is Phase 2. Offline phone reading is Phase 2, not MVP.
- **Finding 7 (check).** Accepted. Both remedies for compounds are used: code splits coordinated clauses, and "Partly supported" covers what the splitter misses.
- **Finding 8 (migration).** Accepted, with one change: no `keyPoints` block is built from legacy `key` points at all; key points are generated with the intro in normal mode, so dedupe handles them.
- **Finding 9 (acceptance).** Accepted. The axe scan needs `@axe-core/playwright` as a new dev dependency; the lead adds it.
- **Finding 10 (smaller items).**
  - Danger cap: kept at 2 by default with the alarm fatigue reason, configurable to 5 per Wiki (D5). Safety sections themselves are no longer capped, since they render quietly.
  - Format badge: checked. No UI filters on `format`; `mcpGet` returns it to outside models (`convex/wikis.ts:1228`, `:1268`), so the field stays and only the badge is hidden.
  - ADR number 0007 confirmed (0006 is the highest in `docs/adr/`).
- **Finding 3 (lanes).** Accepted in full.
