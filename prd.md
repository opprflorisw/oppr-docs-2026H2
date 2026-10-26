# Oppr DOCS v1.0 — Showcase PRD

**Version:** 0.1 (initial)
**Created:** 2026-05-05
**Owner:** Floris
**Source business doc:** `../oppr_business.md` (v0.5)
**Design system source:** `../oppr-design-showcase`
**Build target folder:** `./` (this folder, `oppr-docs`)

> **Status (2026-10-26): historical.** This is the original DOCS v1.0 PRD from May 2026. All of section 3 shipped, but on Convex instead of sql.js (backend database, file storage, vector index, server-side Gemini, real auth), so sections 2, 7, 9 (cross-window sync) and 12 no longer describe the build. Since October the app is **Oppr Knowledge** (Documents, Trainings, Skills, Wikis). Current sources of truth: [`CONTEXT.md`](./CONTEXT.md) (language and scope), [`oppr-docs-status.md`](./oppr-docs-status.md) (what is built), [`docs/product/function-map.md`](./docs/product/function-map.md) (what to sell first), `docs/adr/`. Section 3 is ticked; the checkboxes after it were not maintained and are left as written.

This PRD was also the progress tracker for the May build.

---

## 1. Goal

Build a **frontend-only showcase** of the Oppr DOCS v1.0 module so prospects, internal stakeholders, and engineering can see, click, and feel the full DOCS experience — desktop authoring, asset-linked documents, QR-scan operator flow, SOP→log references, and document Q&A — without standing up production infrastructure.

This is a **demo/showcase build**, not the production system. It must be runnable from `npm run dev` with nothing more than a Google API key.

### Success looks like
- A live demo can take a viewer through the full LOGS→IDA→DOCS loop (DOCS half) in under 5 minutes.
- Every v1.0 DOCS capability from the business doc (rows #25–29 in §8) is demonstrable end-to-end.
- The mobile QR-scan operator flow is convincing in a resized browser window.
- Data persists across reloads. A "Reset demo" button restores seed state in one click.

---

## 2. Locked Decisions

| # | Decision | Choice | Rationale |
|---|----------|--------|-----------|
| 1 | Frontend stack | React 19 + TypeScript + Vite | Same as `oppr-design-showcase` — direct cherry-pick. |
| 2 | Styling | Tailwind 3 + shadcn/ui tokens | Inherits design system unchanged. |
| 3 | Routing | `wouter` | Already used in showcase; lightweight. |
| 4 | Database | `sql.js` (SQLite WASM) persisted to IndexedDB | Pure frontend, no backend, simplest delivery. |
| 5 | AI for Q&A | **Google Gemini API** | `text-embedding-004` for embeddings, `gemini-2.0-flash` (or `1.5-flash`) for chat. |
| 6 | Vector search | In-memory cosine similarity over embeddings stored as JSON in SQLite | "Simple vectorized documents" — no vector DB. |
| 7 | Rich-text editor | TipTap | Open-source, React-native, extensible (needed for "Launch Log" custom block). |
| 8 | PDF rendering | `react-pdf` | Standard React PDF viewer. |
| 9 | Mobile pattern | Sidebar "Mobile" link → `window.open()` to `/m` route, user resizes manually | User-specified. Same codebase, separate window. |
| 10 | Component sourcing | Cherry-pick from `oppr-design-showcase/src/components/ui` into this app | Avoid coupling; this app stands alone. |
| 11 | Auth / multi-tenancy | None | Showcase is single-user, single-tenant. |

---

## 3. In Scope (v1.0 DOCS capabilities)

Mirrors business doc §8 rows 25–29 plus the §6 asset/QR registry dependency.

- [x] **PDF upload & storage** (cap #25) — drop-zone, metadata form, BLOB stored in SQLite.
- [x] **RAG Q&A over documents** (cap #26) — chat panel scoped to one doc or to all docs of an asset.
- [x] **Desktop authoring** (cap #27) — TipTap editor, metadata sidebar, naming convention, save/version.
- [x] **QR scan → asset-linked documents (mobile sim)** (cap #28) — pick asset, list docs, open or ask.
- [x] **SOP → Log clickable launch reference** (cap #29) — custom TipTap block bound to a log id.
- [x] **Platform-scoped asset/QR registry** (§6) — assets are first-class, docs link many-to-many.
- [x] **Document metadata** — naming convention `{SITE}-{DEPT}-{TYPE}-{NNNN}` (e.g., `HOL-OPS-MAN-0001`), title, type, status, version, owner, linked assets, tags.
- [x] **Document statuses** — Draft / In review / Published / Archived.
- [x] **Version history** — every publish creates a new immutable version.
- [x] **Search & filter** — across the doc library by title, naming code, type, asset, status, tag.

---

## 4. Out of Scope (mirrors business doc §9)

- [ ] AI-assisted SOP authoring inside the editor (v1.1)
- [ ] Live SOP feedback while operator runs an SOP (v1.1)
- [ ] Logs embedded inside SOPs as the work-instruction layer (v1.1+)
- [ ] Pre-built best-practice SOP templates (post-v1.0)
- [ ] Real authentication, user management, multi-tenancy
- [ ] Real-time collaborative editing
- [ ] Mobile-native app (we simulate in a resized browser window only)
- [ ] LOGS module, IDA module, dashboards (DOCS-only build)
- [ ] Real QR-camera scanning (we simulate with an asset picker)

---

## 5. Personas & Stakeholder Coverage

Three personas from business doc §13. Each one needs a demonstrable flow.

- [ ] **Process Engineer** (desktop, primary author)
  - Flows: author SOP, upload PDF, link to assets, insert "Launch Log" reference, publish, manage versions.
- [ ] **Operator** (mobile-window simulation)
  - Flows: scan QR (simulated) → see asset's documents → open PDF or native doc → ask question via voice/text chat.
- [ ] **Operations Manager** (desktop, glance/review)
  - Flows: filter doc library by status/asset, see what changed, review pending approvals.

---

## 6. User Flows (acceptance-grade)

### 6.1 Engineer authoring flow
- [ ] Click "New document" → choose type (SOP / Manual / Work Instruction / LMRA Card).
- [ ] System auto-suggests next naming code per type; engineer can override.
- [ ] Write content in TipTap editor with headings, lists, tables, callouts, images.
- [ ] Sidebar metadata form: title, owner, review cadence, tags, **linked assets (multi-select)**.
- [ ] Save as Draft → preview → Publish (creates version 1).
- [ ] Subsequent edits → Save → Publish (creates version 2, prior version preserved).

### 6.2 Engineer PDF import flow
- [ ] Click "Upload PDF" → drag-drop or pick file.
- [ ] Metadata form: title, naming code, type, linked assets, tags.
- [ ] On save: PDF stored as BLOB in SQLite, **text extracted + chunked + embedded** for Q&A.
- [ ] PDF viewable in `react-pdf` with page navigation.

### 6.3 Engineer SOP→Log reference flow
- [ ] Inside editor, slash-command `/launch-log` opens a log picker.
- [ ] Pick a log → custom block inserted with log name + button.
- [ ] At read time, button is clickable; in showcase it opens a "Would launch log: [Log Name]" modal.

### 6.4 Operator QR-scan flow (mobile window)
- [ ] Click "Mobile" in desktop sidebar → opens new browser window at `/m`.
- [ ] User manually resizes window to phone dimensions (we show guide overlay first time).
- [ ] Mobile home: "Scan QR" button (large) + asset picker fallback.
- [ ] Pick or scan an asset → asset page → list of all linked documents.
- [ ] Tap doc → reads (PDF viewer or rendered TipTap content).
- [ ] Floating "Ask IDA" button → chat panel scoped to this asset's docs.

### 6.5 Q&A flow
- [ ] Chat input (text + voice button placeholder).
- [ ] User question → top-k chunks retrieved by cosine similarity → sent with question to Gemini → answer streamed back.
- [ ] Answer renders with **citations** (doc name + page or section, clickable to jump to source).

### 6.6 Manager review flow
- [ ] Library view filtered by status = "In review".
- [ ] Open doc, see version diff (textual at v1.0).
- [ ] One-click approve → status → Published.

---

## 7. Data Model (SQLite schema)

- [ ] `assets` — `id`, `code`, `name`, `site`, `location`, `qr_token`, `created_at`
- [ ] `documents` — `id`, `naming_code`, `title`, `type` (sop|manual|work_instruction|lmra), `status`, `current_version`, `owner_id`, `tags_json`, `created_at`, `updated_at`
- [ ] `document_versions` — `id`, `document_id`, `version`, `body_json` (TipTap doc) OR `pdf_blob_id`, `published_at`
- [ ] `document_assets` — `document_id`, `asset_id` (junction)
- [ ] `pdf_blobs` — `id`, `filename`, `mime`, `bytes` (BLOB), `page_count`
- [ ] `logs` — `id`, `name`, `type` (stub table; seeded only)
- [ ] `document_log_refs` — `document_id`, `version`, `log_id`, `anchor_id` (TipTap node id)
- [ ] `chunks` — `id`, `document_id`, `version`, `seq`, `text`, `page_or_section`
- [ ] `embeddings` — `chunk_id`, `vector_json` (768-dim float array as JSON)
- [ ] `qa_sessions` — `id`, `scope` (doc_id or asset_id), `created_at`
- [ ] `qa_messages` — `id`, `session_id`, `role` (user|assistant), `text`, `citations_json`, `created_at`
- [ ] `users` — `id`, `name`, `role` (engineer|operator|manager) — single-row stub

### Seed data
- [ ] 6–8 assets across 1 site (mix: extruder, shredder, sorter, intake, oven, conveyor)
- [ ] 8–10 documents (mix of authored TipTap + uploaded PDFs)
- [ ] 4–5 logs to support SOP→Log references
- [ ] 1 user per role
- [ ] Pre-computed embeddings for all chunks so first demo is instant

---

## 8. Information Architecture / Routes

### Desktop (`/`)
- [ ] `/` — Library (doc list + filters + search + "New" / "Upload PDF")
- [ ] `/docs/:id` — Read view + Q&A panel + version history
- [ ] `/docs/:id/edit` — Authoring view (editor + metadata sidebar)
- [ ] `/docs/new?type=sop` — Creation
- [ ] `/assets` — Asset registry
- [ ] `/assets/:id` — Asset detail with linked docs
- [ ] `/settings` — Demo controls (Reset, API key entry, theme)

### Mobile-window (`/m`)
- [ ] `/m` — Home (Scan + asset picker)
- [ ] `/m/scan` — Simulated scan picker (lists assets as scannable QR cards)
- [ ] `/m/assets/:id` — Asset's linked docs
- [ ] `/m/docs/:id` — Doc reader (PDF or rendered)
- [ ] `/m/ask?scope=asset:123` — Chat scoped to an asset
- [ ] `/m/ask?scope=doc:456` — Chat scoped to a single doc

---

## 9. UI Requirements

### Desktop
- [ ] Left sidebar (cherry-pick `ui/sidebar.tsx`) with sections: Library, Assets, **Mobile** (opens new window), Settings.
- [ ] Top bar: search command palette (`ui/command.tsx` + `cmd+k`), theme toggle, user avatar.
- [ ] Information-dense lists. shadcn Table for the library.
- [ ] Light + dark theme parity (use existing CSS variables from showcase `index.css`).

### Mobile (in resized window)
- [ ] Detects `/m/*` route → renders mobile shell (no sidebar; bottom-nav style).
- [ ] Large tap targets (min 44px), high contrast.
- [ ] Voice-input button on chat (visual only at v1.0; hooks to `SpeechRecognition` if available).
- [ ] Each screen reachable in ≤2 taps from QR scan.
- [ ] First-load: small overlay telling user to resize the window to phone width (~390px).

### Cross-window data sync
- [ ] Both windows share the same IndexedDB-backed SQLite, so data is consistent.
- [ ] Use `BroadcastChannel('oppr-docs')` to notify the other window of changes (optional polish; reload-to-refresh is acceptable v1).

---

## 10. Component Cherry-Pick List (from `oppr-design-showcase`)

Copy these into `oppr-docs/src/components/ui/` verbatim. Plus their dependencies in `package.json`.

**Definitely needed:**
- [ ] `button`, `card`, `badge`, `input`, `textarea`, `label`, `select`, `checkbox`, `switch`
- [ ] `dialog`, `sheet`, `drawer`, `popover`, `dropdown-menu`, `tooltip`
- [ ] `tabs`, `accordion`, `separator`, `scroll-area`, `resizable`
- [ ] `table`, `pagination`, `command` (for cmd+k search)
- [ ] `form` (react-hook-form + zod plumbing)
- [ ] `sidebar`, `breadcrumb`, `navigation-menu`
- [ ] `toast`, `sonner`, `toaster`
- [ ] `avatar`, `skeleton`, `progress`
- [ ] `alert`, `alert-dialog`

**Probably needed:**
- [ ] `radio-group`, `slider`, `toggle`, `toggle-group`, `hover-card`

**Skip:**
- Calendar, carousel, OTP input, menubar, context-menu, chart (not needed for DOCS).

**Plus:**
- [ ] `lib/utils.ts` (the `cn()` helper)
- [ ] `hooks/use-toast.ts`
- [ ] Global CSS (design tokens) from `src/index.css`
- [ ] Tailwind + PostCSS configs

---

## 11. New Components (DOCS-specific)

To be built in `src/components/docs/`:

- [ ] `DocumentEditor.tsx` — TipTap shell with toolbar
- [ ] `LaunchLogBlock.tsx` — TipTap custom node + log picker dialog
- [ ] `LinkedAssetBlock.tsx` — inline asset reference
- [ ] `PdfViewer.tsx` — `react-pdf` wrapper with controls
- [ ] `MetadataPanel.tsx` — right-rail metadata form
- [ ] `AssetMultiSelect.tsx` — multi-select bound to asset registry
- [ ] `NamingCodeField.tsx` — generates and validates naming code
- [ ] `VersionHistoryDrawer.tsx`
- [ ] `DocumentLibraryTable.tsx`
- [ ] `QrScanCard.tsx` (mobile) — simulates a QR card
- [ ] `AskIdaPanel.tsx` — chat with citations
- [ ] `MobileShell.tsx` — bottom-nav layout for `/m/*` routes

---

## 12. Tech Implementation Notes

### SQLite layer (`src/db/`)
- [ ] Load `sql.js` WASM on app boot.
- [ ] On boot: try to load DB blob from IndexedDB → if absent, run migrations + seed.
- [ ] Auto-save: after every write, serialize DB and write to IndexedDB (debounced ~500ms).
- [ ] Expose typed query helpers: `db.documents.list()`, `db.documents.get(id)`, etc.
- [ ] `db.reset()` — clears IndexedDB and reseeds.

### Gemini integration (`src/ai/`)
- [ ] API key read from `import.meta.env.VITE_GEMINI_API_KEY`.
- [ ] `embed(text: string): Promise<number[]>` using `text-embedding-004`.
- [ ] `chat(messages, context): AsyncIterable<string>` streaming from `gemini-2.0-flash`.
- [ ] Cosine similarity utility for top-k chunk retrieval.
- [ ] Settings page surfaces a "Test Gemini connection" button.

### PDF text extraction
- [ ] Use `pdfjs-dist` (already a dep of `react-pdf`) to extract text per page → chunk by paragraph or by ~500 tokens → store rows in `chunks`.
- [ ] Embedding done inline on upload (with a progress toast); cached in `embeddings`.

### Mobile-window opening
- [ ] Sidebar "Mobile" item handler:
  ```ts
  window.open('/m', 'oppr-mobile', 'width=390,height=844,resizable=yes');
  ```
- [ ] On `/m` first paint: show a 5-second hint overlay if window width > 500px.

### Routing
- [ ] One `wouter` Router. Top-level switch: if path starts `/m`, render `<MobileShell>`; else `<DesktopShell>`.

---

## 13. Build Milestones (sequential, each independently demoable)

### M1 — Foundation
- [ ] Scaffold Vite + React 19 + TS in `oppr-docs/`
- [ ] Tailwind + PostCSS configured
- [ ] Cherry-pick `ui/` components + `lib/utils.ts` + global CSS from showcase
- [ ] Wouter routing with desktop and mobile shells
- [ ] Sidebar with "Mobile" link that opens new window
- [ ] Theme toggle works

### M2 — SQLite layer + seed
- [ ] sql.js loaded, IndexedDB persistence working
- [ ] All schema tables created
- [ ] Seed script populates 6 assets, 8 docs (5 authored + 3 PDFs), 4 logs, 1 user
- [ ] "Reset demo" button in `/settings`

### M3 — Library & assets
- [ ] `/` library table with filters, search, status badges
- [ ] `/assets` registry with linked-doc count per asset
- [ ] `/assets/:id` shows linked documents

### M4 — PDF path
- [ ] Upload PDF → metadata form → stored as BLOB
- [ ] `/docs/:id` PDF viewer with page nav
- [ ] PDF text extracted, chunked, persisted (no embeddings yet)

### M5 — Authoring
- [ ] TipTap editor with full toolbar
- [ ] Naming-code generator + uniqueness check
- [ ] Save Draft + Publish → creates version
- [ ] Version history drawer

### M6 — SOP → Log reference
- [ ] `/launch-log` slash command
- [ ] Custom node renders pill + button
- [ ] Read view: click button → modal "Would launch log: X"

### M7 — Mobile window flow
- [ ] `/m` home with Scan button + asset picker
- [ ] `/m/assets/:id` shows asset's docs
- [ ] `/m/docs/:id` reader (PDF + rendered TipTap)
- [ ] BroadcastChannel sync between desktop and mobile windows

### M8 — Q&A (Gemini)
- [ ] API key entry in `/settings`
- [ ] Embed all chunks on first run (progress toast)
- [ ] Chat panel on doc read view (desktop + mobile)
- [ ] Citations clickable
- [ ] Asset-scoped chat (`/m/ask?scope=asset:123`)

### M9 — Manager review
- [ ] Status filter on library
- [ ] Approve flow (In review → Published)
- [ ] Textual diff between versions

### M10 — Polish
- [ ] Empty states with "Load demo data" CTA
- [ ] Mobile-window first-load hint overlay
- [ ] Keyboard shortcuts (cmd+k, cmd+s)
- [ ] Light/dark parity sweep
- [ ] README with setup steps + demo script

---

## 14. Acceptance Criteria

- [ ] Engineer authors a new SOP, links it to 2 assets, inserts a Launch-Log block, publishes — full round trip works.
- [ ] Engineer uploads a PDF, links it to an asset, opens it, and sees text on every page.
- [ ] In the mobile window, picking an asset surfaces all its linked docs in ≤2 taps.
- [ ] Asking "What's the procedure for unblocking the sorter?" returns an answer with at least one citation that opens the source location.
- [ ] Reload the page → all data persists.
- [ ] "Reset demo" returns to clean seed in <2 seconds.
- [ ] Light and dark mode both look intentional across desktop and mobile.

---

## 15. Open Questions / Risks

- [ ] **PDF size.** sql.js holds the whole DB in RAM. PDFs >5 MB stored as BLOB will bloat memory. **Mitigation:** cap upload at 10 MB and/or store PDF bytes in a separate IndexedDB key, leave SQLite to hold metadata only.
- [ ] **Cross-window writes.** If desktop writes while mobile has DB loaded, mobile won't see it without a reload or BroadcastChannel re-sync. Acceptable for showcase; document the limitation.
- [ ] **Gemini API key in browser.** This is a showcase, but the key is exposed in `VITE_*` env. Document clearly in README. For real demos use a restricted key.
- [ ] **Embedding cost.** All chunks embedded on first boot. For 8 seed docs this is trivial. If catalog grows, add a background queue.
- [ ] **TipTap → JSON storage.** Storing TipTap doc as JSON is fine; rendering for read view uses TipTap in read-only mode.
- [ ] **Mobile resize hint UX.** Confirm whether to use a manual overlay or just style the layout to look fine at any width.

---

## 16. Setup (for the dev who will build this)

- [ ] Node 20+
- [ ] `cd oppr-docs && npm create vite@latest . -- --template react-ts`
- [ ] Install deps (Tailwind, shadcn deps from showcase, `sql.js`, `@google/generative-ai`, `@tiptap/react` + extensions, `react-pdf`, `pdfjs-dist`, `wouter`)
- [ ] Copy `oppr-design-showcase/src/components/ui/*` → `src/components/ui/`
- [ ] Copy `oppr-design-showcase/src/index.css`, `tailwind.config.js`, `postcss.config.js`
- [ ] Create `.env.local` with `VITE_GEMINI_API_KEY=...`
- [ ] `npm run dev`

---

## 17. Changelog

- **0.1 (2026-05-05)** — Initial PRD. Locked stack, scope, and milestones. Awaiting first build pass.
