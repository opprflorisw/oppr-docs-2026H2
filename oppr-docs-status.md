# Oppr DOCS — Build Status

**Snapshot:** 2026-06-10
**Build state:** Green. `npx tsc -b` and `npx vite build` both exit 0.
**Dev:** `npx convex dev` (terminal 1) + `npm run dev` (terminal 2) → http://localhost:5173
**Backend:** Convex dev deployment `dev:different-newt-869`, project `oppr-docs-2026h2`

This file is a living record of what's actually shipped in `oppr-docs/`. Update it whenever work lands. For requirements, read [`prd.md`](./prd.md). For business context, read [`../oppr_business.md`](../oppr_business.md). For Claude orientation, read [`CLAUDE.md`](./CLAUDE.md).

---

## What Oppr DOCS is

A showcase build of the DOCS module from the Oppr v1.0 platform — the standardize half of the LOGS → IDA → DOCS continuous-improvement loop. A Vite/React frontend on a **Convex** backend (database, file storage, vector search, auth, server-side AI). Production-shaped, demo-sized.

Three visible surfaces:

1. **Desktop knowledge-worker app** — author SOPs, manage assets/templates/images, import external PDFs, browse the library, ask IDA across documents.
2. **Mobile-window operator app** — sidebar "Mobile" link opens a popup at `/m`. Resize manually to phone size. Simulated QR scan → asset → linked docs → ask IDA.
3. **Settings** — AI/embedding status + re-embed tools, naming vocabulary management at `/settings/naming`, theme.

---

## Tech stack (concrete versions)

| Layer | Choice | Why |
|---|---|---|
| Runtime | React 19 + TypeScript 5.8 | strict-off TS per `tsconfig.app.json` |
| Build | Vite 7 | Fast dev, native ESM |
| Backend | Convex 1.37 | DB + file storage + vector index + server functions + live queries in one |
| Auth | `@convex-dev/auth` 0.0.92 | Magic-link via Resend, gated to `@oppr.ai`; `AuthGate`/`SignInForm` in `src/auth/` |
| Styling | Tailwind 3 + shadcn/ui (Radix) + CSS custom-property tokens | Light/dark theme |
| Routing | `wouter` 3 | `/m/*` branch renders mobile shell, everything else desktop |
| Editor | TipTap 2.10 (StarterKit + Link + Placeholder + Table family + 9 custom nodes) | Open source, React-native, extensible |
| PDF view | `react-pdf` 10 (bundles pdfjs) | Viewing + text extraction; `pdf-lib` assists the importer |
| PDF export | `src/lib/pdf-export/*` | Print-window pipeline; no server rendering |
| AI | Gemini via `convex/ai/*` — `gemini-embedding-2` (768-dim) + `gemini-3.1-flash-lite` | Server-side only; key lives in Convex env (`GEMINI_API_KEY`); streaming over the `/ai/askStream` HTTP action |
| Markdown | `react-markdown` 10 + `remark-gfm` 4 | AI chat panel; throttled re-parse during streaming |
| Forms | `react-hook-form` 7 + `zod` 4 | MetadataPanel and dialogs |
| Toasts | `sonner` 2 | Used everywhere |
| Theming | `next-themes` 0.4 | Defaults light |

---

## What's shipped

### Core document lifecycle
- **Statuses:** `pre_draft → draft → in_review → approved → published → archived`, gated transitions in `convex/documents.ts` (`submitForReview`, `approve`, `publish`, `revertToDraft`, `archive`) with per-version signoff trail (author/reviewer/approver) on `documentVersions`.
- **Versioning:** `currentVersion` (working edition) vs `liveVersion` (what operators/QR/RAG are served). **Saving never bumps a version.** Publish pins `liveVersion`. Editing a published doc forks via `documents.createNewVersion`; published versions are read-only. Readers use `getServingVersion`.
- **Chunks are reconciled on save** (delete + reinsert per version) and superseded editions' chunks are dropped on publish — only the live version feeds RAG.

### Naming codes (immutable, server-allocated)
- Format `{LOCATION}-{DISCIPLINE}-{TYPE}-{NNNN}` (e.g. `HOL-OPS-SOP-0001`). Allocated atomically from `namingCounters` per (location, discipline, type) triplet in `convex/naming.ts`; `peekNextCode` previews in the metadata panel.
- The code is **immutable once allocated**; location/discipline/type are locked in the editor. Changing filing goes through `documents.refile` — mints a NEW document with a fresh code, copies content + roles, optionally archives the old (`RefileDocumentDialog`).
- Vocabulary (locations, disciplines) managed at `/settings/naming`. Older docs missing location/discipline are backfilled by parsing the code (`parseNamingCode` in `convex/naming.ts`, client mirror in `src/lib/namingCode.ts`).

### Authoring
- `DocumentEditor` — toolbar + slash menu, StarterKit + Link + Table family + custom nodes: `ImageWithRef`, `LaunchLog`, `LinkedAsset`, `ReferenceDoc`, `Callout`, `Ppe`, `Diagram` (preset + builder, curved connectors), `StepList`/`StepItem`, `PdfAttachment`. `TiptapReadOnly` mirrors the list exactly.
- `MetadataPanel` — sticky right rail with title, filing (locked once coded), roles, tags, plus **derived** cards: Linked machines, Reference documents, and **Linked logs** — all computed from body pills (`src/lib/bodyAssets.ts`, `bodyRefs.ts`, `bodyLogs.ts`); no manual linking.
- **Launch-log pills** — `launchLog` node carries `logId`/`anchorId`/`label`/`code`; pills show the log code; the Linked logs card aggregates them.
- **Keyboard shortcuts hint** (`ShortcutsHint` popover in the editor header).
- Templates are **DB-backed** (`templates` table) and managed at `/templates` (create/edit/duplicate/delete); `templates.seedIfEmpty` + `seedTemplates:seedBestPracticeSop` seed defaults.

### Images
- `images` + `imageUsages` tables; uploads deduped by sha256; usages recomputed per document version (`images.recomputeUsagesForVersion`).
- **Image library at `/images`** — flat view, group-by-document view, and a **diagrams tab** (diagram SVGs cached to storage); usage/status surfaced per image; detail modal with replace/alt-text/delete.
- `ImageWithRef` node — `data-image-id` round-trip, `width` percent attr with on-canvas resize + alignment, drag-to-move handled by ProseMirror (wrapper `draggable` + `data-drag-handle`; inner `<img draggable={false}>` so the browser doesn't start a native drag).
- `InsertImageDialog` — library pick / upload / URL.

### External Document Importer
- `convex/importer/*` + `src/pages/desktop/ImportPage.tsx` (`/import`, `/import/:jobId`).
- Multi-stage `importJobs` pipeline: `uploaded → extracted → mapped → linksResolved → finalized` (or `failed`). Client extraction in `src/lib/import/*` (pdf text + image extraction, StructuredDoc, render to TipTap); server mapping via Gemini (`importer/map.ts`); link resolution against existing docs/assets/logs; finalize creates a real document.
- Imported figures insert at **width 35%, centered**.

### PDF export
- `src/lib/pdf-export/*` (`buildPrintDoc`, `openPrintWindow`, `printStyles`) + `PublishToPdfDialog`.
- Compact **title page** with prominent code badge and PPE band; **"Document overview" front-matter page** with revision history, Linked machines (always on), Linked logs, References; then the body. Watermark support (e.g. drafts).
- Self-contained output: diagram backgrounds (Convex storage URLs inside cached SVGs) are pre-fetched and inlined as data URLs; `pdfAttachment` pages are rasterised to data URLs.

### Assets + logs
- Asset registry with QR tokens, floorplan pins, optional photo (`imageStorageId`), per-asset logs (`assetLogs`).
- `logs` table now has an optional `code` (placeholders `AMS-OPS-LOG-0001`..`0005` seeded). Write defensively — older rows may lack it.

### AI / RAG (server-side)
- `convex/ai/embed.ts` — embeddings written onto `chunks.embedding` (768-dim Convex `vectorIndex`, filterable by `documentId`), idempotent on `chunkId + modelVersion`, auto-scheduled on publish; `embedStatus` drives the Settings AI panel; `embedMissing` / `reembedAll` actions.
- `convex/ai/ask.ts` — `askStream` HTTP action (NDJSON streaming) registered in `convex/http.ts` at `/ai/askStream` (browser hits `VITE_CONVEX_SITE_URL`). The non-streaming `askQuestion` action was removed (no callers).
- Scopes: doc / asset / library. Q&A persists per-user in `qaSessions` + `qaMessages` with typed citations.
- Chat UI: `AskPanel` inside `AskDock`, one side panel docked on the right (pushes the page, resizable, follows the page scope; overlay below 1024px free width); markdown rendering, citation pills, `SourcesBlock`, `RelatedRail`, `ScopeChip`, starter prompts, copy/regenerate/stop. Mobile parity via `/m/ask`.

### Mobile
- `MobileShell` with bottom nav; home, simulated QR scan, asset list/detail, doc list/reader, ask. Global search, doc summary with PPE + asset chips above the fold.

### Seeding / reset
- `convex/seedMinimal.ts` — internalAction `run`: **`npx convex run seedMinimal:run`** wipes all app tables (templates + auth users preserved) and seeds the minimal test set: assets EXT-201 / MIX-101, logs AMS-OPS-LOG-0001..0005, docs **AMS-OPS-MAN-0001** (published) + **AMS-OPS-SOP-0001** (draft that exercises every authoring primitive), 2 stored SVG images.
- `convex/admin.ts` `wipeAll` — CLI-only full wipe (also deletes storage blobs), no reseed.
- There is no in-app "Reset demo" button anymore.

---

## Architecture

```
┌─────────────────────────────┐        ┌──────────────────────────────────────┐
│  Browser                    │        │  Convex deployment                    │
│                             │        │  (dev:different-newt-869)             │
│  Desktop window  /          │ live   │                                       │
│  Mobile popup    /m         │◀──────▶│  schema.ts tables + authTables        │
│  (useQuery subscriptions)   │ queries│  queries/mutations/actions            │
│                             │        │  file storage (PDFs, images, SVGs)    │
│  AskPanel ── POST NDJSON ───┼───────▶│  http.ts /ai/askStream ── Gemini      │
│  (VITE_CONVEX_SITE_URL)     │        │  vectorIndex on chunks (768-dim)      │
└─────────────────────────────┘        └──────────────────────────────────────┘
```

Single source of truth: the Convex database. Every open window (desktop + mobile popup) subscribes via `useQuery` and live-updates on writes — no client persistence, no cross-tab sync code. Auth wraps the whole app (`AuthGate`); every Convex function calls `requireUser`/`requireUserId`.

---

## Folder structure

```
oppr-docs/
├── prd.md                       ← requirements (PRD + checklist)
├── oppr-docs-status.md          ← THIS FILE
├── CLAUDE.md                    ← Claude orientation
├── README.md
├── package.json
├── vite.config.ts
├── vercel.json                  ← Vite framework + SPA rewrite
├── .env.example                 ← VITE_CONVEX_URL / VITE_CONVEX_SITE_URL notes
├── .env.local                   ← gitignored; CONVEX_DEPLOYMENT + URLs
├── convex/                      ← backend
│   ├── schema.ts                ← schema source of truth
│   ├── auth.ts, auth.config.ts  ← @convex-dev/auth (magic link, @oppr.ai gate)
│   ├── http.ts                  ← /ai/askStream routes
│   ├── documents.ts             ← lifecycle, versioning, refile, archive
│   ├── naming.ts                ← code allocation, vocabulary, parseNamingCode
│   ├── assets.ts, logs.ts, qa.ts, files.ts, users.ts
│   ├── images.ts                ← image library + usage reconciliation
│   ├── templates.ts, seedTemplates.ts
│   ├── seedMinimal.ts           ← npx convex run seedMinimal:run
│   ├── admin.ts                 ← wipeAll (CLI-only)
│   ├── ai/                      ← constants, embed, ask (+ askStream)
│   ├── importer/                ← jobs, map (Gemini), templates
│   └── lib/                     ← auth guards, assetWalker, imageWalker
└── src/
    ├── main.tsx                 ← ConvexAuthProvider wiring
    ├── App.tsx                  ← route switch (desktop vs mobile) inside AuthGate
    ├── index.css                ← Tailwind + tokens + .tiptap-content
    ├── auth/                    ← AuthGate, SignInForm
    ├── components/
    │   ├── ui/                  ← shadcn primitives (cherry-picked)
    │   ├── layout/              ← DesktopShell, TopBar, PageHeader, UserMenu
    │   ├── mobile/              ← MobileShell + mobile widgets
    │   ├── docs/                ← editor, read view, custom nodes, dialogs, chunking.ts
    │   └── ai/                  ← AskPanel, AskDock, SourcesBlock, …
    ├── pages/
    │   ├── desktop/             ← dashboard, library, assets, docs, templates,
    │   │                          images, import, settings, naming, analysis/
    │   └── mobile/              ← /m pages
    ├── lib/
    │   ├── utils.ts             ← cn()
    │   ├── convex-adapters.ts   ← Convex doc → legacy domain types
    │   ├── namingCode.ts        ← client-side parse/format mirror
    │   ├── bodyAssets/bodyLogs/bodyRefs.ts  ← derived metadata from body pills
    │   ├── pdf-export/          ← buildPrintDoc, openPrintWindow, printStyles
    │   └── import/              ← extractPdf, structuredDoc, renderToTiptap, …
    ├── types/                   ← shared domain types
    └── hooks/
```

### Folder ownership rules (for parallel agent work)
- `convex/**` — backend only. Schema, functions, importer, AI. Auth check in every function.
- `convex/ai/**` — Gemini lives here; never in the browser.
- `src/components/ui/**` — shadcn primitives. Don't edit; replace if needed.
- `src/components/{layout,mobile,docs,ai}/**` — feature components.
- `src/pages/desktop/**` and `src/pages/mobile/**` — route components only.
- `src/lib/**` — pure helpers/adapters; no server logic.

---

## Data model

Schema source of truth: `convex/schema.ts` (plus `authTables` from `@convex-dev/auth`).

| Table | Purpose |
|---|---|
| `meta` | key/value flags |
| `assets` | registry: code, name, site, location, qrToken, floorplan pin, optional photo |
| `assetLogs` | per-asset log placeholders |
| `documents` | namingCode (immutable), location/discipline, title, type (sop/manual/work_instruction/lmra), status (pre_draft→archived), currentVersion, liveVersion, owner + author/reviewer/approver roles, tags |
| `documentVersions` | per-version body (tiptap or pdf), pdfStorageId, signoffs trail |
| `templates` | DB-backed document templates (managed at /templates) |
| `namingLocations` / `namingDisciplines` | naming vocabulary (managed at /settings/naming) |
| `namingCounters` | last allocated sequence per (location, discipline, type) triplet |
| `documentAssets` | doc ↔ asset links |
| `logs` | LOGS-module placeholders; optional `code` (AMS-OPS-LOG-…) |
| `documentLogRefs` | launchLog anchors per doc version |
| `chunks` | RAG chunks per doc version; `embedding` (768-dim vectorIndex, filter by documentId), embeddingModel, embeddedAt |
| `qaSessions` / `qaMessages` | per-user Q&A with typed citations; scope doc/asset/library |
| `images` / `imageUsages` | image library + per-version usage tracking |
| `importJobs` | importer pipeline state (stage, classification, extraction, mapping, link resolutions, finalized doc) |

---

## Routes

### Desktop
| Path | Component | Purpose |
|---|---|---|
| `/` | DashboardPage | Overview + entry points |
| `/library` | LibraryPage | Doc library + filters + Ask IDA (library scope) |
| `/assets` | AssetsPage | Asset registry |
| `/assets/:id` | AssetDetailPage | Asset + linked docs |
| `/docs/new` | DocumentNewChooserPage | Compose vs import chooser |
| `/docs/new/compose` | DocumentNewPage | New TipTap doc from template |
| `/docs/new/import` | DocumentNewPage | Import entry |
| `/docs/:id` | DocumentReadPage | Read view (serving version) + Ask IDA + history + PDF export |
| `/docs/:id/edit` | DocumentEditPage | Editor + MetadataPanel |
| `/templates` | TemplatesPage | DB-backed templates |
| `/templates/new`, `/templates/:id/edit` | TemplateEditPage | Template editor |
| `/images` | ImageLibraryPage | Flat / by-document / diagrams views |
| `/import`, `/import/:jobId` | ImportPage | Importer pipeline |
| `/settings` | SettingsPage | AI status, embed/re-embed, theme |
| `/settings/naming` | NamingSettingsPage | Locations + disciplines vocabulary |
| `/analysis`, `/analysis/:slug` | Analysis pages | Case files for bugs/UX deep-dives |

### Mobile (popup window)
| Path | Component |
|---|---|
| `/m` | MobileHomePage |
| `/m/scan` | MobileScanPage |
| `/m/assets`, `/m/assets/:id` | MobileAssetsPage / MobileAssetPage |
| `/m/docs`, `/m/docs/:id` | MobileDocsPage / MobileDocPage |
| `/m/ask` | MobileAskPage (`?scope=doc:id` / `asset:id` / library) |

---

## AI / RAG flow

1. **Chunking** — client-side (`src/components/docs/chunking.ts`): `chunksFromTipTap` (per paragraph/list item/heading, section-labelled) or `chunksFromPdfPages`. Chunks passed into create/save mutations and reconciled per version.
2. **Embedding** — `gemini-embedding-2` at 768 dims, server-side, idempotent on `chunkId + modelVersion`. Auto-scheduled on publish; manual `embedMissing` / `reembedAll` from Settings.
3. **Retrieval** — Convex `vectorSearch` on `chunks.by_embedding`. Doc scope filters by `documentId`; **asset scope resolves linked documents from `documentAssets` first and filters the search to them** (`q.or(eq(documentId,…))`, capped 64) with a flagged library-wide fallback when they don't fill `k`; library is unfiltered. `lookupAfterSearch` then keeps only the served version (live, or working for never-published) and drops archived docs for asset/library scope.
4. **Generation** — `gemini-3.1-flash-lite` via the `askStream` HTTP action (NDJSON streaming) — the only chat path. Citations carry `origin` (`asset-link` / `cross-link` / `log`); `cross-link` marks library-wide fallback sources and drives the "Not linked" badge.
5. **Persistence** — all scopes persist per-user (`qaSessions.scopeKind`: doc/asset/library; library uses `scopeId = 'library'`).

---

## Build & verification

```bash
npx tsc -b              # type-check (must exit 0)
npx vite build          # production build (must exit 0)
npx convex dev --once   # push convex/ changes if the watcher isn't running
```

Production: Vercel (static Vite bundle) + Convex prod deployment. See README for deploy steps.

---

## Known issues / quirks

- **Editor/read-view/PDF-export must stay in sync.** A node added to `DocumentEditor` but not `TiptapReadOnly` is silently stripped; `buildPrintDoc.ts` needs a renderer too.
- **`logs.code` is optional** — older rows lack it; render defensively.
- **Embedding-model swap requires re-embed** (Settings → "Re-embed all"); embeddings are keyed on `chunkId + modelVersion` so stale vectors are detectable but not auto-fixed.
- **Diagram SVG backgrounds are storage URLs** — fine in-app, but anything that snapshots the SVG (PDF export) must inline them as data URLs (export already does).
- **`peekNextCode` can be stale by one** if a concurrent create lands first — cosmetic only; the real code is allocated inside the create mutation.
- **Naming code immutability** means a mis-filed document can't be renamed — `documents.refile` creates a new document (new Convex id, new code). Inbound links to the old id keep pointing at the archived doc.
- **Analysis pages** under `/analysis` are dev-facing case files, not product surface.
- **Convex Free plan limits exceeded (2026-10-25).** Throughput (function calls, database I/O), not data size. See `/analysis/backend-gcp-and-gemma` and `docs/research/backend-gcp-and-gemma.md`.

## Later

- **Backend on Google Cloud and EmbeddingGemma**: investigation only. Recommendation is to stay on Convex (upgrade now, cut waste; spend caps are documented for Pro only) and set up a GCP project only if the browser lab and a Dutch eval show EmbeddingGemma is worth hosting (then CPU-only Cloud Run first). The lab embeds in a Web Worker; its WebGPU route is still untested. Follow-ups are in `docs/todo.md` (2026-10-25). The in-browser Embedding lab lives on `/analysis/backend-gcp-and-gemma` and uses the read-only `convex/lab/embeddings.ts`.

---

## Recent diffs worth knowing about

- **2026-06-11 (pm)** — Four-workstream batch. (1) **Senior status counts**: `effectiveStatus()` (`src/lib/docStatus.ts` + mirror in `convex/documents.ts`) counts a published doc with a draft fork as published; applied to the dashboard, Recently-published, and the library status filter. (2) **Document types are an editable vocabulary** (`namingTypes` table; `convex/namingTypes.ts`): `documents.type`/`templates.type` widened to `v.string()`; tokens resolve from the table with a legacy fallback (`resolveTypeToken`); `TypeBadge` is data-driven via `useDocTypes` (`src/lib/typeMeta.ts` — icon registry + 10 color tones); third card on `/settings/naming` with icon/color pickers; factory set of 6 (SOP/MAN/WI/LMRA/TBOX/POL), built-ins deactivatable not deletable. Self-seeds on first settings visit; in `seedMinimal`. (3) **PDF document overview rework**: revision history moved onto the title page (no pill, capped 3); machines/logs/references tables dropped the code-pills and tinted section chips — headers are now Linked machine/Name, Linked log/Name, Reference/Title with plain monospace codes. (4) **PPE configurator**: `ppeItems` table (`convex/ppe.ts`) + Safety tab on `/templates`; 20 self-drawn ISO-7010-style blue pictograms (`src/lib/ppePictograms.ts`); editor/read/mobile/PDF all render pictogram + label via `usePpeCatalog` (`src/lib/ppeCatalog.ts`); the original 8 PPE ids are kept as factory slugs so existing docs render unchanged. New schema needs a push; `npx convex dev --once` already applied to dev.
- **2026-06-11** — Ask IDA scope verification + cleanup. Asset scope now slices the vector search to the asset's linked documents at the index level (was a library-wide search post-filtered, which lost recall and made the cross-link badge dead UI); added a flagged library-wide fallback and archived-doc exclusion. Chat text-size dial fixed (was overridden three layers down — now inherits; small step 11px); citation `[N]` anchors explained in the Sources header + tooltips; cross-link popover copy de-staled. Dead code removed: `askQuestion` action, `documents.attachPdf`, 20 unused shadcn/UI files (incl. the toast cluster — app uses sonner), and 6 npm deps (`tippy.js`, `input-otp`, `vaul`, `react-resizable-panels`, plus orphaned Radix). New schema: `assets`/`logs` gain optional `source`/`externalId` provenance + `by_externalId` index for the shared platform registry (ADR `docs/adr/0001-shared-asset-and-log-registries.md`). Two new analysis pages: **Ask IDA scoping** and **How Oppr DOCS works (colleague guide)**.
- **2026-06-10** — Image library: group-by-document view + diagrams tab + per-image status. Importer figures now insert at 35% width centered. Image drag-drop fixed (ProseMirror owns the drag; inner img `draggable=false`). Launch-log pills carry log codes; derived "Linked logs" card in MetadataPanel. Editor keyboard-shortcuts hint. Naming lifecycle hardened (immutable codes, locked filing, `refile` flow, parse-based backfill). PDF export overhaul (compact title page, Document overview front-matter, inlined diagram backgrounds). `seedMinimal` replaces all previous seed/reset paths.
- **2026-06 (earlier)** — Versioning model landed: `liveVersion` vs `currentVersion`, signoffs, read-only published versions, `createNewVersion` fork. Chat model moved to `gemini-3.1-flash-lite`.
- **2026-05 → 2026-06** — Migration off sql.js/IndexedDB to Convex: auth, server-side AI, file storage, importer, templates, image library. `src/db/**`, `src/ai/**`, `src/admin/**`, `convex/seed.ts`, `convex/reset.ts`, `convex/seedAssets.ts`, and the in-app "Reset demo" flow were all deleted.

---

## How to update this file

When you ship work that materially changes:
- a tech choice → update the **Tech stack** table
- a feature → update **What's shipped**
- a folder or contract → update **Folder structure** / **Folder ownership rules**
- a schema → update **Data model**
- a route → update **Routes**

Append a row to **Recent diffs worth knowing about** for anything that would surprise a future Claude or future you.
