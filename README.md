# Oppr DOCS

[![status](https://img.shields.io/badge/status-production-green)](https://oppr-docs-2026-h2.vercel.app)

Operator-facing knowledge base for manufacturing floors. Author SOPs in a rich editor, attach them to assets, retrieve them via QR, and ask questions through IDA (RAG over the document corpus).

Built on **React 19 + Vite + TypeScript + Tailwind + shadcn/ui** with **Convex** as the backend (auth, database, file storage, vector search, server-side AI). Streaming chat via **Gemini** behind a Convex HTTP action.

## New here? Read this first (60 seconds)

Oppr DOCS is the **standardize** half of the Oppr platform (LOGS captures →
IDA investigates → DOCS standardizes). It does five things:

1. **Author** SOPs/manuals in a TipTap rich editor with custom blocks (safety
   callouts, PPE, diagrams, step lists, asset pills, log launch-references).
2. **File** every document under an immutable naming code
   `{LOCATION}-{DISCIPLINE}-{TYPE}-{NNNN}` allocated server-side.
3. **Version** them: a published edition stays live for operators while the
   next edition is drafted; publishing pins the new live version.
4. **Retrieve** them on the floor — operators scan a QR on an asset and get
   that asset's linked documents on the mobile shell (`/m/*`).
5. **Ask IDA** — a RAG chat over the corpus, scoped to one document, one
   asset's documents, or the whole library.

Three things that surprise newcomers, so internalize them early:

- **The whole app is Convex.** There is no REST layer and no client-side
  store. Pages call `useQuery`/`useMutation`/`useAction` with `api.*`; every
  open window live-updates on a write. The only non-Convex fetch is the
  streaming `/ai/askStream` endpoint.
- **Naming codes are identity and never change.** Re-filing a document mints a
  *new* document with a new code (`documents.refile`). Filing (location /
  discipline / type) is parsed back out of the code.
- **Assets and logs are shared, platform-scoped registries** — see below.
  Don't bind documents to their human-readable codes; bind to ids.

Orientation files, in order: **`CLAUDE.md`** (conventions + common-task
recipes) → **`oppr-docs-status.md`** (what's shipped, schema, routes) →
**`prd.md`** (full scope). The `/analysis` route inside the running app is a
browsable case file of every major decision — start at **Ask IDA scoping** and
**Authoring hardening** for the most recent work.

## Quick start (local)

```bash
npm install
npx convex dev          # terminal 1 — provisions / connects the dev deployment, watches convex/
npm run dev             # terminal 2 — starts Vite at http://localhost:5173
```

`npx convex dev` writes `CONVEX_DEPLOYMENT`, `VITE_CONVEX_URL`, and `VITE_CONVEX_SITE_URL` into `.env.local` (see `.env.example`; `VITE_GEMINI_API_KEY` there is legacy-local only — Gemini runs server-side). Sign in with an `@oppr.ai` magic link (configured via Convex Auth + Resend).

### One-time dev env

```bash
npx convex env set GEMINI_API_KEY <key>
npx convex env set AUTH_RESEND_KEY <resend api key>
npx convex env set AUTH_EMAIL "Oppr DOCS <onboarding@resend.dev>"
```

`SITE_URL` is set automatically by `npx @convex-dev/auth`. `JWT_PRIVATE_KEY` and `JWKS` are also provisioned by that command.

### Seed data

```bash
npx convex run seedMinimal:run
```

Wipes every app table (templates and signed-in users are preserved) and seeds the minimal test set: assets EXT-201 / MIX-101, placeholder logs AMS-OPS-LOG-0001..0005, a published manual (AMS-OPS-MAN-0001), a draft SOP that exercises every authoring primitive (AMS-OPS-SOP-0001), and two stored SVG images.

`npx convex run admin:wipeAll` is the CLI-only full wipe (no reseed). `npx convex run seedTemplates:seedBestPracticeSop` seeds the reference SOP template.

## Production deploy

The production stack runs **Vercel** (static Vite bundle) + **Convex prod deployment** (functions, DB, storage, vector index).

### 1. Push the branch

```bash
git push -u origin <branch>
```

### 2. Provision the prod Convex deployment

```bash
npx convex deploy --cmd "echo skip"
```

The first run prompts you to create a production deployment under your team. It writes the prod `CONVEX_DEPLOY_KEY` and prints the prod `CONVEX_URL` + `CONVEX_SITE_URL`. Note both URLs — you'll paste them into Vercel.

Set the prod env on the new deployment:

```bash
npx convex env set GEMINI_API_KEY <key>          --prod
npx convex env set ANTHROPIC_API_KEY <key>       --prod   # Claude: Consistency check, Captures, Trainings, insights
npx convex env set ANTHROPIC_WORKSPACE_ID <id>  --prod   # required unless the key is scoped to a workspace
npx convex env set AUTH_RESEND_KEY <key>         --prod
npx convex env set AUTH_EMAIL "Oppr DOCS <noreply@yourdomain>" --prod
npx convex env set SITE_URL https://<vercel-prod-url> --prod
```

`JWT_PRIVATE_KEY` + `JWKS` are auto-set when you ran `npx @convex-dev/auth` against the prod deployment (re-run with `--prod` if needed).

### 3. Connect Vercel

In the Vercel dashboard:

1. **Import** the GitHub repo.
2. **Framework**: Vite (auto-detected via `vercel.json`).
3. **Environment variables**:
   - `VITE_CONVEX_URL` = prod Convex URL (`https://*.convex.cloud`)
   - `VITE_CONVEX_SITE_URL` = prod Convex site URL (`https://*.convex.site`)
4. **Deploy**.

After the first deploy, copy the Vercel URL back into Convex prod's `SITE_URL` env (step 2) so magic-link redirects land on the right host. Push a trivial change to redeploy and pick up the corrected SITE_URL.

### 4. Smoke test

- Sign in with an `@oppr.ai` email — magic link arrives.
- Library loads.
- Open a doc, ask IDA a question — streaming response with citations.
- Import a PDF via `/import`, finalize it, ask about it.

## Architecture

- **Auth**: Convex Auth (magic-link via Resend), gated to `@oppr.ai` in the `createOrUpdateUser` callback.
- **DB**: Convex tables (`documents`, `documentVersions`, `templates`, `assets`, `assetLogs`, `documentAssets`, `logs`, `documentLogRefs`, `chunks`, `qaSessions`, `qaMessages`, `images`, `imageUsages`, `importJobs`, `namingLocations`, `namingDisciplines`, `namingCounters`, `meta`) plus the `authTables` from `@convex-dev/auth`. Schema source of truth: `convex/schema.ts`.
- **Naming codes**: `{LOCATION}-{DISCIPLINE}-{TYPE}-{NNNN}`, allocated server-side from per-triplet counters (`convex/naming.ts`); immutable once allocated — refiling mints a new document (`documents.refile`). Vocabulary managed at `/settings/naming`.
- **AI**: Gemini behind `convex/ai/`:
  - `embed.ts` — embedding pipeline (idempotent on `chunkId + modelVersion`, 768-dim Convex vector index on `chunks`). Auto-scheduled on doc publish.
  - `ask.ts` — `askStream` HTTP action (NDJSON streaming to the client). Scope slicing: doc scope filters the vector search to one document, asset scope filters to the documents linked to that asset (with a flagged library-wide fallback), library searches everything. See the **Ask IDA scoping** analysis page for the full breakdown.
- **Shared registries**: `assets` and `logs` are platform-scoped concepts in the wider Oppr toolset, not owned by DOCS. This deployment keeps its own copy, but every row can carry `source` + `externalId` provenance, and all access goes through `convex/assets.ts` / `convex/logs.ts` (no component reads those tables directly) so swapping in the real imported registry is a server-side change. See `docs/adr/0001-shared-asset-and-log-registries.md`.
- **File storage**: PDFs and images in Convex storage; uploads via `generateUploadUrl` → POST → mutation; reads via signed URLs.
- **Importer**: `convex/importer/*` + `src/lib/import/*` — multi-stage `importJobs` pipeline (extract → map → resolve links → finalize) that turns external PDFs into native documents.
- **PDF export**: `src/lib/pdf-export/*` — client-side print pipeline with title page, document-overview front matter, and inlined diagram backgrounds.
- **Routing**: `wouter` — top-level switch on `/m/*` for the mobile shell.

## Folder layout

```
oppr-docs/
├── convex/                      Backend (functions, schema, AI, importer, seed)
│   ├── schema.ts                Schema source of truth
│   ├── auth.ts, auth.config.ts
│   ├── http.ts                  HTTP routes incl. /ai/askStream
│   ├── documents.ts             Lifecycle, versioning, refile, archive
│   ├── naming.ts                Code allocation + vocabulary
│   ├── assets.ts, logs.ts, qa.ts, files.ts, users.ts, images.ts
│   ├── templates.ts, seedTemplates.ts
│   ├── seedMinimal.ts           npx convex run seedMinimal:run
│   ├── admin.ts                 wipeAll (CLI-only)
│   ├── ai/                      constants, embed, ask (+ askStream)
│   ├── importer/                jobs, map (Gemini), templates
│   └── lib/                     auth guards, asset/image walkers
├── src/
│   ├── auth/                    AuthGate, SignInForm
│   ├── components/
│   │   ├── ui/                  shadcn primitives
│   │   ├── layout/              DesktopShell, TopBar, PageHeader
│   │   ├── mobile/              MobileShell + mobile widgets
│   │   ├── docs/                Editor, read view, custom nodes, dialogs
│   │   └── ai/                  AskPanel, AskDock (the one Ask side panel), SourcesBlock, etc.
│   ├── pages/
│   │   ├── desktop/             /, /library, /assets/*, /docs/*, /templates,
│   │   │                        /images, /import, /settings, /analysis/*
│   │   └── mobile/              /m, /m/scan, /m/assets/*, /m/docs/*, /m/ask
│   ├── lib/
│   │   ├── convex-adapters.ts   Convex doc → legacy domain types
│   │   ├── namingCode.ts        Client-side naming-code parse/format
│   │   ├── pdf-export/          buildPrintDoc + openPrintWindow
│   │   └── import/              PDF extraction + StructuredDoc → TipTap
│   └── types/                   Shared domain types
└── vercel.json                  Vite framework + SPA rewrite for client routing
```

## Verification gates

```bash
npx tsc -b              # type-check (must exit 0)
npx vite build          # production build (must exit 0)
```

Both must pass before any change is considered done. If you changed anything under `convex/` and the `npx convex dev` watcher isn't running, push with `npx convex dev --once`.
