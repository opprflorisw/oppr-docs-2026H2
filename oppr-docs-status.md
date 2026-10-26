# Oppr Knowledge (formerly Oppr DOCS): Build Status

**Snapshot:** 2026-10-26
**Build state:** Green. `npx tsc -b` and `npx vite build` both exit 0.
**Dev:** `npx convex dev` (terminal 1) + `npm run dev` (terminal 2) → http://localhost:5173
**Backend:** Convex, project `oppr-docs-2026h2`. Dev deployment `dev:different-newt-869`; prod deployment behind https://oppr-docs-2026-h2.vercel.app. Paid Convex plan since 2026-10-26.

The living record of what is built. For language and scope read [`CONTEXT.md`](./CONTEXT.md) (the glossary is the law for names and UI copy) and `docs/adr/`. For what to sell first read [`docs/product/function-map.md`](./docs/product/function-map.md). For Claude orientation read [`CLAUDE.md`](./CLAUDE.md). [`prd.md`](./prd.md) is the original May 2026 DOCS PRD, kept for history.

---

## What it is

An internal technical showcase of **Oppr Knowledge**: a factory's controlled knowledge base. Content is authored, reviewed and Published under ISO 9001-style control; only Published content counts as Knowledge, and Ask, Wikis and Trainings use only Published content. Four pillars: **Documents, Trainings, Skills, Wikis**. One small seeded plant (Pijpwerk Noord, 20 documents) shows every pillar end to end.

Surfaces:

1. **Desktop**: six nav places, Home, Documents, Learn, Wiki, Plant, Settings (ADR 0006: never a seventh). Below them **Try it** (Floor simulator, Phone) and **Developer** (Engineers and Admins only).
2. **Phone app** at `/m` (also framed inside the Floor simulator): Scan, Find, read, Ask, Capture, Rounds, Attempts, Try-outs, Wikis, Me.
3. **MCP server** for outside models (ADR 0004), keys and activity under Developer.

---

## Tech stack

| Layer | Choice | Notes |
|---|---|---|
| Runtime | React 19 + TypeScript 5.8, Vite 7 | strict-off TS per `tsconfig.app.json` |
| Backend | Convex 1.37 | DB, file storage, vector search, crons, HTTP actions, live queries |
| Auth | `@convex-dev/auth` | Provisioned password accounts (`accounts:create`, CLI only) plus magic link for `@oppr.ai` via Resend |
| Floor identity | Check-in (`useCheckIn`) | A picked person on a shared login; server checks the person's kind for sign-offs. Not authenticated (gate DC1) |
| Styling | Tailwind 3 + shadcn/ui (Radix) | Light/dark tokens in `src/index.css` |
| Routing | `wouter` 3 | `/m/*` renders the mobile shell |
| Editor | TipTap 2.10 + custom nodes | Editor, read view and `buildPrintDoc.ts` must stay in step |
| PDF | `react-pdf` (view, extract), `pdf-lib` (import, stamping Wrapped manuals) | |
| AI | Gemini (`gemini-embedding-2` 768-dim, `gemini-3.1-flash-lite`, image model) and Claude via `convex/ai/llm.ts` (`ANTHROPIC_API_KEY`): Consistency check, Captures, Trainings, insights, Proposed revisions; Wikis and Guided creation fall back to Gemini without it | Server-side only, every call metered in `aiUsage` with prices in `aiPrices`, budgets and kill switch in Settings |
| Hosting | Vercel (static bundle) + Convex | Vercel build runs `npx convex deploy`, so a push to `main` updates both |

---

## What's shipped

### Documents (document control)
- Lifecycle `pre_draft → draft → in_review → approved → published → archived`, sign-offs by checked-in Engineers, review record, true publish dates, Significant change flag stored on the version.
- `currentVersion` (working) vs `liveVersion` (served). Saving never bumps; editing a Published doc forks a new version.
- Immutable server-allocated naming codes, `refile` for re-filing, editable vocabulary (locations, disciplines, types).
- New Document dialog, Guided creation (AI drafts, shows what changed, undo), Convert a PDF (importer), **Wrap a supplier manual** (stamps code, version and status onto the supplier PDF).
- Periodic review, PDF and print export, Safety icons (ISO 7010 PPE), Templates, ISO 9001 view (`/iso-9001`).
- **Captures**: Operators record voice/photo on the phone, AI organizes, an Engineer turns it into a Draft (ADR 0005). Capture sets group them.
- **Findings and Consistency check**: contradictions between Published Documents, on every publish and weekly. **Knowledge health** and **Document insights** with AI-prepared **Proposed revisions** (ADR 0003: AI prepares, humans publish).

### Learn (Trainings and Skills)
- Trainings are controlled documents built from Published passages; Attempts generate fresh questions that cite their source (ADR 0002). Training builder with open questions, Rounds (floor treasure hunt), Try-outs and sign-off, Training records naming the version.
- Skill matrix, Skill levels and profiles, Coverage questions ("who can run line 2 tonight"), refresher assignments, Skills workspace.

### Wiki
- Short Wikis per job or machine, built from Published Documents, rebuilt (coalesced) when a source publishes and daily as a safety net; people shape a Wiki, Published Knowledge states it (ADR 0007). Points withheld from outdated sources; version provenance shown.

### Plant
- Plant model and glossary (floor words), Assets with QR codes and floorplan, Propose Plant from Documents.

### Ask
- One side panel on desktop (`AskDock`/`AskPanel`), full screen on the phone. Scopes: doc, asset, wiki, training, skills, library. Answers only from Published passages, with sources; grounding checks for units, ranges and polarity.

### Settings and Developer
- Settings in five groups (Company, People and roles, Documents, Training, Floor) plus My preferences.
- Developer: Embeddings lab (EmbeddingGemma in the browser vs Gemini), MCP (keys, tools, test console, activity), AI models and jobs (models, search index, schedules, usage and cost), Analysis case files.
- Instructions: an introduction page and a guided tour for every function.

---

## Data model

Schema source of truth: `convex/schema.ts` (plus `authTables`). Tables by area:

| Area | Tables |
|---|---|
| Documents | `documents`, `documentVersions`, `documentAssets`, `documentLogRefs`, `templates`, `coverSettings`, `ppeItems`, `namingLocations`, `namingDisciplines`, `namingTypes`, `namingCounters`, `importJobs` |
| Search | `chunks` (passages per version), `chunkVectors` (768-dim vector per chunk, vector index filtered by `documentId`) |
| Images | `images`, `imageVectors` (vector index filtered by `kind`, `embedSource`), `imageCollections`, `imageUsages`, `seedMedia` (seed image cache) |
| Plant and people | `assets`, `assetLogs`, `logs`, `people`, plus shifts, skill level names, plant and capture tables from the `convex/*/schema.ts` lanes |
| Wikis | `wikis`, `wikiBuilds`, `wikiBlocks`, `wikiChecks`, `wikiEvents`, `wikiReads` |
| Learn | `trainings`, `trainingVersions`, `trainingAttempts`, `trainingRecords`, `trainingAssignments`, `trainingSignals`, `tryOutRequests`, `skills`, `skillLevels`, `skillEvents`, `skillProfiles`, `coverageQuestions` |
| Quality signals | `findings`, `consistencyRuns`, `proposedRevisions`, `askEvents`, `usageEvents`, `contentFlags`, `insightReports` |
| Ask | `qaSessions`, `qaMessages` |
| AI and MCP | `aiUsage`, `aiPrices`, `aiSettings`, `mcpKeys`, `mcpCalls` |
| Misc | `meta` |

Vectors are stored apart from the rows they describe; `chunks.vectorId` and `images.vectorId` point at them. Write and delete them only through `convex/lib/vectors.ts`, search only through `convex/ai/vectorSearch.ts`.

---

## Routes

### Desktop
| Path | Purpose |
|---|---|
| `/` | Home: inbox, This week, shift cover |
| `/library`, `/documents` | Documents list |
| `/library/findings`, `/library/health`, `/library/captures`, `/library/captures/:id`, `/library/capture-sets/:id`, `/library/images` | Under Documents |
| `/docs/new`, `/docs/new/compose`, `/docs/new/import`, `/docs/:id`, `/docs/:id/edit` | Create, read, edit |
| `/templates`, `/templates/new`, `/templates/:id/edit`, `/images`, `/import`, `/import/:jobId` | Document tools |
| `/learn`, `/learn/trainings/:id`, `/learn/attempts/:id`, `/learn/people/:id`, `/learn/skills/:tab?` | Learn |
| `/wiki`, `/wiki/:id` | Wikis |
| `/plant/:tab?`, `/assets`, `/assets/:id` | Plant and Assets |
| `/floor` | Floor simulator (Try it) |
| `/instructions`, `/instructions/:tourId` | Introduction and tours |
| `/iso-9001` | ISO 9001 view |
| `/settings`, `/settings/naming` | Settings |
| `/dev`, `/dev/embeddings/:tab?`, `/dev/mcp/:tab?`, `/dev/ai/:tab?`, `/dev/analysis`, `/analysis/:slug` | Developer |

### Phone (`/m`)
Home, Scan, Assets, Docs, Ask, Capture (+ detail), Rounds, Attempts, Try-outs, Wikis, Me (`src/pages/mobile/`).

---

## AI and search flow

1. **Chunking**: client-side `chunksFromTipTap` / PDF pages; saved through the document mutations. `reconcileChunks` keeps unchanged passages (same id, same vector), so a save re-embeds only edited passages.
2. **Embedding**: `embedMissingInternal` embeds passages without a current vector, four at a time, and writes them 20 per mutation into `chunkVectors`. Images: `ai/imageEmbed:backfill` works through batches inside one run.
3. **Retrieval**: `searchChunks` / `searchImages` run the vector search and map hits back through the `by_vectorId` index. Published-only filtering happens after (`convex/lib/published.ts`).
4. **Generation**: Ask streams NDJSON from `/ai/askStream`. Wikis, Trainings, Captures, Findings and Proposed revisions run as background actions; each is metered.
5. **Crons** (`convex/crons.ts`, names in `convex/settings/schedules.ts`): Wiki safety-net rebuild (skips up-to-date Wikis), weekly Consistency check, refreshers, capture media retention, AI usage rollup.

---

## Seeding and accounts

- `npx convex run seedKnowledge:run`: wipes app tables (templates, auth, seed media kept) and seeds Pijpwerk Noord: people, Assets, 20 documents with images and supplier manuals, Trainings, Skills, insights, coverage questions, captures, plant, Wikis; then schedules embeddings, the image backfill and a Consistency check. On a deployment without cached seed media it first generates 67 images (one-off AI cost).
- `npx convex run devChecks:run`: the invariant checks (Published-only, sentinels never leak).
- Accounts: `npx convex run accounts:create '{"email":"…","password":"…","name":"…"}'` (add `--prod` for production). Minimum 10 characters.
- `npx convex run admin:wipeAll`: CLI-only full wipe, no reseed.

---

## Build and deploy

```bash
npx tsc -b              # type-check (must exit 0)
npx vite build          # production build (must exit 0)
npx convex dev --once   # push convex/ changes to dev if the watcher isn't running
```

Production: push to `main` → Vercel builds with `npx convex deploy --cmd 'tsc -b && vite build'`, which deploys Convex prod first. Branch deploys are off for `feature/knowledge-polish`. Prod Convex env needs `GEMINI_API_KEY`, `AUTH_RESEND_KEY`, `AUTH_EMAIL`, `SITE_URL`, `JWT_PRIVATE_KEY`, `JWKS`, `ANTHROPIC_API_KEY` (Consistency check, Captures, Trainings and other Claude features fail without it) and `ANTHROPIC_WORKSPACE_ID` (required unless the key is scoped to a workspace; without it every Claude call returns 400). Never run `devChecks:run` on prod: it publishes a draft as part of its test.

---

## Known issues and gates

From `docs/product/function-map.md` (26 Oct):

- **F1**: QR labels hold a token, not a link, so a phone camera cannot open the app.
- **DC1**: sign-offs use a picked name on one shared login, not a personal sign-in or PIN.
- **CD3**: Ask answers in Dutch while the interface is English.
- **LD1 / LD2**: re-train deadlock. One Significant change empties shift cover (Home shows 0 people per shift on the seeded plant after the standard checks). Do not demo the Skill matrix until fixed.
- Ask on how-to questions can still cite the supplier manual instead of the SOP step.
- Main JS bundle is 4.5 MB (1.3 MB gzip); no code splitting yet.
- Editor, read view and PDF export must stay in sync for every TipTap node.
- Naming codes are immutable; `refile` makes a new document and inbound links keep pointing at the archived one.
- Agent test runs on the shared dev deployment drove most of the Free plan overrun (page loads and test sign-ins). Run them against `npx convex dev --local`.

## Later

See `docs/todo.md`: backend on Google Cloud and EmbeddingGemma (research only, recommendation is to stay on Convex), remaining Convex usage follow-ups.

---

## Recent diffs worth knowing about

- **2026-10-26**: Lightweight pass before going live. Vectors moved out of `chunks` and `images` into `chunkVectors` / `imageVectors` (every passage and image read used to carry about 6 KB of vector); search hits map back through `vectorId` indexes. Embeddings written 20 per mutation instead of one call per passage. Saves keep unchanged passages and their vectors instead of re-embedding the whole document. Image backfill loops within one run. Paid Convex plan; prod wiped and reseeded with the Knowledge seed.
- **2026-10-26**: Polish from persona walks, five expert lenses and two outside-judge rounds; personas and function map (`docs/product/`); Instructions with a tour per function.
- **2026-10-25**: Developer section, AI usage and cost tracker, Wiki upgrade MVP (`docs/specs/wiki-upgrade.md`), Skills workspace, one Ask side panel, Settings in six groups, People and roles, Plant, image library search, ISO 9001 page, GCP/EmbeddingGemma research.
- **2026-10-24**: Full showcase built (`docs/build/full-showcase-plan.md`): all Knowledge pillars, 20-document Pijpwerk Noord seed, MCP server, Captures, phone preview, coverage questions.
- **2026-10-23**: Rebrand to Oppr Knowledge: glossary and ADRs 0002–0003, six-item nav, Home inbox, check-in, Published-only Ask, people, periodic review, Wikis with Guided creation, password login.
- **2026-06**: DOCS v1.0 on Convex: versioning, naming codes, importer, image library, PDF export, PPE configurator, editable type vocabulary, Ask scopes.
- **2026-05 → 06**: Migration off sql.js/IndexedDB to Convex.

---

## How to update this file

When work materially changes a tech choice, a feature, a schema, a route or a known issue, update that section and add a line to **Recent diffs**.
