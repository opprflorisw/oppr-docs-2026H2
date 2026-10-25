# CLAUDE.md — Oppr DOCS

You are working on **Oppr DOCS v1.0 showcase**, a React + Convex app at `oppr-docs/`. This file is your orientation. Read it first, then dip into the docs it points to as needed.

---

## Read these in order

1. **This file** — orientation, conventions, common tasks (≤250 lines)
2. **[`oppr-docs-status.md`](./oppr-docs-status.md)** — current build state: what's shipped, folder structure, data model, routes, known issues. Always check here before assuming what exists
3. **[`prd.md`](./prd.md)** — full requirements + milestone checklist. The source of truth for scope
4. **[`../oppr_business.md`](../oppr_business.md)** — the parent business doc. Read §3, §6, §7 (UC4), §8 (rows 25–29), §10 for DOCS-specific context

You don't need to read all four every turn. For most tasks: this file + a targeted look at the status doc is enough.

---

## What this project is, in 60 seconds

**Oppr** is a manufacturing-floor SaaS that captures operator knowledge (voice, photo, structured forms) and fuses it with machine data on a unified timeline. The product has three modules in a closed improvement loop: **LOGS** (capture) → **IDA** (investigate) → **DOCS** (standardize).

**Oppr DOCS** is the standardize half. It lets process engineers author SOPs in a rich-text editor, link them to assets, and lets operators retrieve them via QR scan and ask questions through IDA (RAG over docs).

**This codebase** is a Vite/React frontend on a **Convex** backend (database, file storage, vector search, auth, server-side AI). Built to demonstrate the full DOCS experience for sales demos and engineering alignment, not as the final production system.

The 8-week paid POC frame in the business doc converts at €75–100K/year. Every visible feature here is sized to defend that conversation.

---

## Tech stack — the load-bearing parts

- **React 19 + TypeScript 5.8 + Vite 7**, strict-off TS (per `tsconfig.app.json`)
- **Tailwind 3** + **shadcn/ui** (Radix primitives) — design tokens in `src/index.css`
- **Convex** backend — dev deployment `dev:different-newt-869`, project `oppr-docs-2026h2`. Schema source of truth: `convex/schema.ts`
- **`@convex-dev/auth`** — magic-link sign-in via Resend, gated to `@oppr.ai`; `AuthGate`/`SignInForm` in `src/auth/`
- **TipTap 2.10** for authoring; custom nodes: `ImageWithRef`, `LaunchLog`, `LinkedAsset`, `ReferenceDoc`, `Callout`, `Ppe`, `Diagram`, `StepList`/`StepItem`, `PdfAttachment`
- **`react-pdf`** (bundles pdfjs) for PDF viewing + text extraction; **`pdf-lib`** for import-side handling
- **Gemini server-side** in `convex/ai/*` — `gemini-embedding-2` (768-dim, Convex `vectorIndex` on `chunks`) + `gemini-3.1-flash-lite`; streaming via the `/ai/askStream` HTTP action on the `.convex.site` host
- **`wouter`** for routing — top-level switch on `/m/*` toggles desktop vs mobile shell
- **`react-hook-form` + `zod`**, **`sonner`** toasts, **`next-themes`**

Full detail in `oppr-docs-status.md` → "Tech stack".

---

## Run / build / verify

```bash
# from oppr-docs/

npm install                  # one-time
npx convex dev               # terminal 1 — connects the dev deployment, watches convex/
npm run dev                  # terminal 2 — http://localhost:5173

# Server env (one-time): npx convex env set GEMINI_API_KEY <key>
# .env.local carries CONVEX_DEPLOYMENT, VITE_CONVEX_URL, VITE_CONVEX_SITE_URL
# (written by `npx convex dev`); VITE_GEMINI_API_KEY is legacy-local only.

# Before declaring any change "done", run BOTH:
npx tsc -b                   # type-check (must exit 0)
npx vite build               # production build (must exit 0)

# If you changed anything under convex/ and the watcher isn't running:
npx convex dev --once        # push functions/schema to the dev deployment
```

The dev server may already be running in the background — check `http://localhost:5173` before starting another.

To reset data to the minimal test set: `npx convex run seedMinimal:run` (wipes app tables, preserves templates + auth users).

---

## Architecture in 5 lines

1. One Vite app. Same code serves desktop (`/`) and mobile (`/m/*`). The desktop sidebar's **Mobile** button calls `window.open('/m', …)` to launch a popup the user resizes to phone size.
2. All data lives in **Convex**. Components subscribe via `useQuery(api.…)` — every open window live-updates on writes; there is no client-side persistence layer.
3. Functions in `convex/*.ts` are the only legitimate way to touch data. Every function calls `requireUser`/`requireUserId` (`convex/lib/auth.ts`). The schema lives in `convex/schema.ts`.
4. AI runs **server-side** in `convex/ai/*` — embeddings land in a 768-dim `vectorIndex` on `chunks` (auto-scheduled on publish); Ask IDA streams NDJSON from the `/ai/askStream` HTTP action. The Gemini key never reaches the browser.
5. The **Ask** side panel (`AskDock`, mounted once in the desktop shell, rendering `AskPanel`) is the one desktop Q&A surface; open it with `openAsk(question?, scope?)`. Scopes: `doc`, `asset`, `wiki`, `training`, `skills` (the Skill matrix as background), `library`. The phone keeps its own full-screen Ask (`MobileAskPage`).

---

## Folder ownership — respect this

| Folder | Owner concern | Don't do |
|---|---|---|
| `convex/**` | Schema, queries/mutations/actions, naming, importer pipeline, seed | Put server logic in `src/`, or query tables without auth checks |
| `convex/ai/**` | Gemini calls, embedding pipeline, ask/stream | Call Gemini from the browser — keys live in Convex env only |
| `src/auth/**` | AuthGate, SignInForm | Bypass the gate for new routes |
| `src/components/ui/**` | shadcn primitives, cherry-picked | Edit these. Replace if needed |
| `src/components/{layout,mobile,docs,ai}/**` | Feature components | Reach into pages |
| `src/pages/desktop/**` | Desktop routes | Touch mobile pages |
| `src/pages/mobile/**` | Mobile routes (`/m/*`) | Touch desktop pages |
| `src/lib/**` | `cn()`, convex-adapters, namingCode, chunking helpers, `pdf-export/`, `import/` | Add server logic here — derivations only |

When unsure, look at the existing import graph and copy the pattern.

---

## Code conventions

- **No emojis** in code, comments, or output unless the user explicitly asks.
- **No comments unless the why is non-obvious.** Don't write "fetch the document then render it" — the code says that. Do write `// pdf.js detaches the buffer it receives — copy first` if the why is hidden.
- **No new docs files** unless the user asks (`*.md`, README additions, etc.).
- **Use `cn()`** from `@/lib/utils` for conditional classes.
- **Use shadcn components** before writing custom UI. The full set is in `src/components/ui/`.
- **Live data** — pages call `useQuery`/`useMutation`/`useAction` from `convex/react` with `api.*` references; never fetch Convex over raw HTTP except the streaming ask endpoint.
- **Naming code format**: `{LOCATION}-{DISCIPLINE}-{TYPE}-{NNNN}` (e.g. `HOL-OPS-SOP-0001`). Allocated **server-side** from `namingCounters` per triplet (`convex/naming.ts`); vocabulary managed at `/settings/naming`. Never construct codes client-side.
- **TipTap content** — both editor and read view use the shared `.tiptap-content` CSS class in `src/index.css`. Never bring back the dead Tailwind `prose` classes (`@tailwindcss/typography` is not installed).
- **Wouter v3 API** — `<Link href="/x" className="…">…</Link>` (no nested anchor).

---

## Common pitfalls

- **Naming codes are immutable.** Once allocated, the code never changes; location/discipline/type are locked in the editor. Changing filing goes through `documents.refile`, which mints a **new** document with a fresh code and optionally archives the old one. Older docs missing location/discipline are backfilled by parsing the code (`parseNamingCode` in `convex/naming.ts` and `src/lib/namingCode.ts`).
- **Versioning: saving never bumps.** `currentVersion` is the working edition, `liveVersion` is what operators/QR/RAG are served. Publish pins `liveVersion`; editing a published doc forks via `documents.createNewVersion`. Published versions are read-only.
- **Convex changes need a push.** If the `npx convex dev` watcher isn't running, schema/function edits do nothing until `npx convex dev --once`. Symptom: the app calls the old function or validation fails.
- **TipTap extension lists must mirror.** `DocumentEditor.tsx` and `TiptapReadOnly.tsx` must load the same node set. If you add a node to the editor but not the read view, content gets silently stripped on the next render (this bit us once with tables). Also keep `src/lib/pdf-export/buildPrintDoc.ts` rendering in step.
- **Image nodes** (`ImageWithRef`) round-trip via `data-image-id` plus a `width` percent attr (`align` too). Drag-to-move is handled by ProseMirror via the node-view wrapper (`draggable` + `data-drag-handle`); the inner `<img>` must stay `draggable={false}` or the browser starts a native image drag and drops a duplicate.
- **Diagram backgrounds embed Convex storage URLs** inside the cached SVG. PDF export pre-fetches and inlines them as data URLs so the print document is self-contained — keep that substitution working if you touch diagrams or export.
- **`logs.code` is optional.** Placeholder logs (`AMS-OPS-LOG-0001`…) carry codes, older rows may not. Write defensively wherever a log code is displayed.
- **PDF bytes** — `react-pdf` and `pdfjs.getDocument` detach the buffer. Always pass a fresh copy: `bytes.slice()`.
- **Embedding-model swap requires re-embed.** Embeddings are keyed on `chunkId + modelVersion` (`convex/ai/constants.ts`). If you change `EMBEDDING_DIM` or model, Settings → "Re-embed all" is mandatory or RAG returns garbage.
- **Custom-node SVG content** — `DiagramBlock` renders SVG via `dangerouslySetInnerHTML`. Curated presets/builder output only; never accept user-pasted SVG without sanitising.
- **Assets and logs are shared, platform-scoped registries.** They belong to the wider Oppr toolset (LOGS/IDA), not DOCS — this deployment keeps a local copy. Access them only through `convex/assets.ts` / `convex/logs.ts` (no component queries those tables directly); link documents to assets/logs by Convex id via the join tables, never by the human-readable code. Rows carry optional `source`/`externalId` provenance so the future swap to an imported registry is server-side only. See `docs/adr/0001-shared-asset-and-log-registries.md`.

---

## Common task recipes

### "Add a field to a table"
1. Add it to `convex/schema.ts` (use `v.optional(…)` so existing rows stay valid).
2. Push: `npx convex dev --once` (or let the watcher pick it up).
3. Update the mutations that write it and any queries that shape return objects.
4. Update the matching type in `src/types/index.ts` and `src/lib/convex-adapters.ts` if the field crosses into legacy domain types.
5. Backfill or re-seed if the field needs a value on existing rows (`npx convex run seedMinimal:run` for dev data).

### "Add a new page"
1. Create the component in `src/pages/desktop/` or `src/pages/mobile/`.
2. Wire it into `src/App.tsx`'s `<Switch>` (inside `AuthGate`).
3. Add a sidebar entry in `src/components/layout/DesktopShell.tsx` (or bottom-nav in `MobileShell.tsx`) if it deserves top-level nav.

### "Add a new TipTap node"
1. Define the node with `Node.create()` in `src/components/docs/`.
2. Export both the node + a picker dialog component (see `LaunchLogBlock.tsx`, `PpeBlock.tsx`, or `DiagramBlock.tsx` as reference patterns — atom blocks vs content blocks differ slightly).
3. Add it to the editor's extensions array in `DocumentEditor.tsx`. Surface it in the toolbar and (optionally) the slash menu via `makeSlashItems()`.
4. Add it to the read-only view's extensions array in `TiptapReadOnly.tsx`. **Both lists must match** or stored content gets silently stripped.
5. Round-trip via `data-*` attributes so `parseHTML` works. For block content, return `[tag, attrs, 0]` from `renderHTML`; for atom blocks omit the `0`.
6. Update `chunksFromTipTap()` in `src/components/docs/chunking.ts` if the node carries indexable text, and `buildPrintDoc.ts` so PDF export renders it.

### "Add or change a document template"
Templates are DB-backed (`templates` table), managed at `/templates` (create/edit/duplicate). `templates.seedIfEmpty` seeds defaults; `seedTemplates:seedBestPracticeSop` seeds the reference SOP template.

### "Add a new diagram preset"
Add an SVG entry to `DIAGRAM_PRESETS` in `src/components/docs/diagramPresets.ts`. Use `viewBox` so it scales; prefer named hex over Tailwind classes since the SVG is rendered via `dangerouslySetInnerHTML`. The picker surfaces it automatically.

### "Reset / seed dev data"
- `npx convex run seedMinimal:run` — wipes app tables (templates + auth preserved) and seeds the minimal set: assets EXT-201/MIX-101, logs AMS-OPS-LOG-0001..0005, AMS-OPS-MAN-0001 (published) + AMS-OPS-SOP-0001 (draft exercising every primitive), 2 stored SVG images.
- `npx convex run admin:wipeAll` — CLI-only full wipe (no reseed).

### "Add a new Ask IDA scope"
1. Extend `AskPanelScope` in `src/components/ai/AskPanel.tsx`, and the route-to-scope mapping in `src/components/ai/AskDock.tsx`.
2. Extend the scope handling in `convex/ai/ask.ts` — `prepareAskContext` (retrieval/slicing), `lookupAfterSearch` (version/status filter), and `buildScopeOverview`. The streaming `askStream` HTTP action is the only entry point.
3. Loosen the `qaSessions.scopeKind` union in `convex/schema.ts` and update `qa.ts` session functions if you want persistence.

### "Run agents in parallel for big work"
For multi-file feature work, dispatch sibling agents partitioned by **folder ownership** (see table above). Give each one:
- The path to this file (`oppr-docs/CLAUDE.md`)
- The path to the status doc (`oppr-docs/oppr-docs-status.md`)
- A scoped file list it owns and a do-not-touch list
- Verification command: `npx tsc -b && npx vite build` (plus `npx convex dev --once` if it owns `convex/`)

This is how the M3–M8 build ran — see `prd.md` §13 for the milestone breakdown.

---

## Highlights from the business doc

(Compressed from `../oppr_business.md`, v0.5 — read the original for nuance.)

- **DOCS sits inside a 3-module loop**: LOGS captures, IDA investigates, DOCS standardizes. Operators close the loop by following updated SOPs and feeding new captures back.
- **8-week paid POC at €25K** converts to **€75–100K annual** if three success criteria are co-signed at Week 0 and met by Week 7. v1.0 makes that conversion repeatable.
- **First ICP**: waste, recycling, waste-to-energy. Pattern: **variable input → operator judgment → expensive asset**. Mutares Holliday is the active POC (June–July 2026).
- **Data model**: Medallion (bronze/silver/gold). App-captured data lands directly in **silver** because metadata is attached at capture time — that's the commercial differentiator vs traditional MES rollouts.
- **Intelligence ladder**: L1 manual exploration → L2 dashboards → L3 conversational (this is the v1.0 ROI moment) → L4 autonomous agents (roadmap).
- **DOCS v1.0 capabilities** (business doc §8 rows 25–29):
  - PDF upload + storage
  - RAG Q&A over docs
  - Desktop authoring (open-source editor + naming convention)
  - QR-scan → asset-linked docs on operator app
  - SOP → log clickable launch reference
- **DOCS v1.1+ (out of scope here)**: AI-assisted SOP authoring inside DOCS, live SOP feedback while operator runs an SOP, logs embedded inside SOPs.
- **Asset/QR registry must be platform-scoped**, not project-scoped. Documents reference assets via `asset_id ↔ document_id` mapping (the human-readable naming code `HOL-OPS-MAN-0001` is metadata, not a lookup key).

---

## Authoring style for any text Claude writes

The user is **Floris** (`floris@oppr.ai`), the founder. Direct, low-fluff, no hedging. He notices padding and unnecessary affirmations. Match that.

- Brief end-of-turn summaries — one or two sentences, what changed, what's next.
- Stand-alone updates while working — one sentence per status check-in.
- Don't narrate "let me", "I'll start by", or "let me think". Just do it and report.
- Don't claim work is done until both `tsc -b` and `vite build` exit 0.
- For UI/visual changes you can't verify yourself, say so explicitly rather than asserting it looks right.

---

## When this file goes stale

Update **CLAUDE.md** when:
- A folder ownership rule changes (move table)
- A new common pitfall surfaces
- A new common task recipe is worth capturing
- The architecture in "5 lines" no longer fits

Update **`oppr-docs-status.md`** when:
- A milestone ticks
- A schema or route changes
- A tech-stack choice shifts
- Anything that would surprise a future Claude

Don't restate things across both files. Status is the snapshot, this file is the orientation.

---

## Agent skills

### Issue tracker

GitHub issues at `oppr-sandbox/oppr-docs-2026H2`, accessed via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default canonical vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.
