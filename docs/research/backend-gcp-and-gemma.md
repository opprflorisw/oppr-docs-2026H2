# Backend on Google Cloud and Gemma embeddings

Date: 2026-10-25 (revised the same day after a fact check) · Status: investigation, nothing migrated or provisioned · In-app page: `/analysis/backend-gcp-and-gemma`; the Embeddings lab is at `/dev/embeddings` (Developer section)

## Outcome

- **Do not move the backend to Google Cloud to fix the Convex warning.** The data is tiny (a few tens of MB). What runs out is the Free plan's monthly *throughput*: function calls (1M) and database I/O (1 GB), shared by all deployments on the team (dev and prod).
- **Now:** read the dashboard Usage page (which metric, which functions), upgrade the team to Starter (pay as you go), then remove the waste, starting with inline embeddings read by list queries, then agent test logins, reseeds and publish fan-out. Upgrading is the immediate fix: on Free, usage is counted over the billing month, so cutting waste may not restore service until the month rolls over (community reports, likely). Expected cost for one plant: about $0 to $25 a month on Starter (assumptions below), or $25 per developer a month on Professional.
- **Spending cap:** Convex documents spend limits (a warning and a disable threshold) for **Pro teams only** (news.convex.dev, "Making Convex plans more friendly"). For Starter we found only notification emails and metered overage (pricing FAQ). Check the billing page; if a hard cap matters, choose Professional.
- **Ask Convex:** reply to their message, ask what exactly is over, and whether startup credits or a plan review are available, before spending engineering time on a move.
- **Google Cloud:** not needed yet. Sequence: (a) test EmbeddingGemma 2 in the browser lab on a real WebGPU desktop, (b) score it against gemini-embedding-2 on Dutch questions, (c) only then create an EU project (europe-west4) and start with a small CPU-only Cloud Run service (option D). Keep a self-hosted Convex on GCP (option B) as a documented fallback for a hard customer or residency requirement. A native GCP rewrite (option C) is 3 to 5 months of work and is not recommended now.
- **EmbeddingGemma:** not reachable with our Gemini API key (live model list) and not yet on Google Cloud Model Garden ("coming soon" per Google's launch post). It runs today in the browser (transformers.js 4.3.1); the Embeddings lab in the Developer section (`/dev/embeddings`) does this, for text and, with the vision encoder, for images. v1 is verified on CPU; v2 needs WebGPU for text and images alike.

## 1. What is happening with Convex

Measured read-only on DEV (`different-newt-869`) on 2026-10-25.

| Fact | Confidence |
|---|---|
| 20 documents, 23 versions, 1,650 chunks (all embedded, gemini-embedding-2@768), 52 images, 118 stored files (about 68 MB), 722 usageEvents, 448 authSessions, 5 users. Every other table under 100 rows. | verified |
| Database is a few tens of MB; chunk vectors about 1,650 × 768 × 8 B ≈ 10 MB. Storage limits are not what is hit. | likely |
| A 22.5-minute window (07:51 to 08:14 UTC): 1,178 completions; 993 queries (638 cached), 67 mutations, 80 actions, 38 HTTP actions. About 29 MB of DB reads excluding my own count queries. About 3.7 GB-seconds of action compute. | verified |
| Heaviest readers: `imageSearch:rank` (about 215 KB per call), `insights:homeStats`, `images:urlsFor`, `wikis:get`, `home:skillAttention`, `wikis:list`, `images:list`, `images:facets`, `ai/imageEmbed:embedStatus`. Most image reads are inline 768-dim vectors (about 6 KB per row). | likely |
| Callers: SyncWorker (live subscriptions) 992, Action 108, HttpEndpoint 38, HttpApi 34. `auth:signIn` ran 44 times in 22 minutes: agent test logins. | verified |
| Since 2026-10-23 13:48 UTC: 804 scheduled functions (78 failed): embedMissingInternal 489, wiki.generate 168, stampVersion 27, training.generateQuestions 26, imageEmbed.backfill 20, consistency.runAll 18, consistency.checkDocument 12. | verified |
| `npx convex insights`: bytes-read-limit exceeded in `trainingSelfTest:run`; near-limit reads in `seed/trainings:checkObjectives`; OCC conflicts in `seedKnowledge:wipeBatch`, `seedKnowledge:run`, `documents:saveContent`. | verified |
| 4 crons, all daily or weekly; not a meaningful load. | verified |
| Scheduler used in 47 places; every save or publish fans out to embedMissingInternal, findings.resolveStale, a wiki regenerate and a consistency check 5 s later. A seed staggers embeds, runs consistency.runAll at 90 s and an image backfill that reschedules itself every 1 s. | verified |
| At about 77 MB of DB reads and 3,100 calls per active development hour, the Free quotas last roughly 1 to 2 weeks. | likely |
| Whether cached query results count as billable calls. Convex docs list client calls, scheduled runs, subscription updates and file accesses as calls, and do not say. The 1 to 3M calls estimate below carries this uncertainty. | unsure |

Convex features the app depends on (verified by scanning the repo): 47 tables in `convex/schema.ts` plus the Convex Auth tables; about 509 server functions (147 query, 164 mutation, 16 action, 68 internalQuery, 82 internalMutation, 27 internalAction, 5 httpAction); 2 vector indexes (`chunks.by_embedding`, `images.by_embedding`, 768 dims); `ctx.storage` in 28 modules; Convex Auth (password + Resend magic link); HTTP routes (`/ai/askStream`, `/mcp`, auth); 4 crons; 47 scheduler calls; about 480 React hook call sites (284 `useQuery`, 179 `useMutation`, 19 `useAction`). Vercel builds with `npx convex deploy --cmd 'tsc -b && vite build'`.

### Convex plans (convex.dev/pricing, fetched 2026-10-25)

| | Free / Starter | Professional ($25 per developer per month) |
|---|---|---|
| Function calls | 1M (Starter overage $2.20 per M) | 25M (overage $2 per M) |
| Action compute | 20 GB-hours | 250 GB-hours |
| DB storage | 0.5 GB | 50 GB |
| DB I/O | 1 GB a month (Starter overage $0.22/GB) | 50 GB (overage $0.20/GB) |
| File storage / egress | 1 GB / 1 GB | 100 GB / 50 GB |
| Vector storage | 0.5 GB | 1 GB |

Not in the table: action compute overage ($0.33 per GB-hour on Starter) and DB storage overage; both are minor for us.

On Free, the official FAQ says a deployment over its limits "for an extended period of time ... may return HTTP errors". Reports of whole projects being disabled, and of usage being measured over the billing month (so cutting usage mid-month may not restore service), come from community threads (likely). Upgrading is the immediate fix. We have not seen the actual message Convex sent; which metric it names matters more than anything else in this document.

Spend limits: "If you're a pro customer, you can now go to your team settings and set a warning or a disable limit" (news.convex.dev). Nothing found for Starter (verified absence in pricing, FAQ and the Starter changelog; check the dashboard).

Regions (docs.convex.dev/production/regions, verified): US East (standard), EU West (Dublin, launched 2026-02-06), AP Southeast 2, CA Central. "Usage in regions outside the US is billed at 1.3x the standard rate (a 30% regional surcharge)." "An existing deployment's region cannot be changed"; move by creating a new deployment and export/import with the CLI. All deployments on a team share the team's quota, so dev traffic eats prod's allowance; agent tests belong on a local backend or a separate Free team.

Estimated need for one plant in production (5 to 20 users, 1 to 3 active hours a day, current query patterns): 1 to 3M calls, 10 to 70 GB DB I/O, under 5 GB-hours compute, under 1 GB DB storage, 1 to 10 GB files a month. (unsure: extrapolated from one 22-minute DEV window; user counts are assumptions)

Cost at those numbers: Starter DB I/O (10 to 70 GB minus 1 GB free) × $0.22 = about $2 to $15, calls (1 to 3M minus 1M free) × $2.20 = $0 to $4.40, so about **$2 to $20 a month, up to about $26 in the EU region** (×1.3). Professional: $25 per developer; its 50 GB I/O is below the 70 GB top estimate, which would add about 20 GB × $0.20 = $4. Fixing the inline embeddings should pull reads well below the top of this range.

## 2. Options

| Option | Effort | Monthly cost (1 plant) | Risks | Verdict |
|---|---|---|---|---|
| **A. Stay on Convex**: paid plan, fix waste, optionally prod to EU region | 1 h plan change; 2 to 5 days fixes; about 0.5 week EU move | Starter about $0 to $25 (assumptions above); Professional $25 to $50 (1 to 2 devs); usage ×1.3 in EU | Lock-in stays; EU is Dublin not NL; region fixed at creation; spend cap documented for Pro only | **Recommended now** |
| **B. Self-host open-source Convex on GCP** (VM + Cloud SQL Postgres 17, europe-west4) | 1 to 3 person-weeks, then about 0.5 day a month (rough estimate, not costed in detail) | About $60 to $120 (rough estimate) | We own uptime, backups, upgrades; single node; GCS-as-S3 unverified; Convex Auth needs manual key setup; some cloud-only features missing | Fallback only if GCP or NL hosting is required |
| **C. Native GCP rewrite** (Cloud Run API, Cloud SQL + pgvector, GCS, Cloud Tasks/Scheduler, Identity Platform or Auth.js) | 12 to 20 person-weeks + 3 to 4 for parity and migration | About $50 to $100 (+ engineering) | See "Hidden costs of leaving Convex" below; high regression risk; feature freeze for a quarter | Not now |
| **D. Hybrid**: Convex stays, AI workloads on GCP (Cloud Run, later Model Garden) | 1 to 3 days for project, billing, service account | A few dollars at experiment volume (CPU service, scale to zero) | Needs a GCP project, billing and a service account key in Convex env; not needed while the browser Embeddings lab is enough | **Later**, only if the lab and a Dutch eval show EmbeddingGemma is worth hosting |
| **E. Firebase** (Firestore + Functions, or SQL Connect) | 15 to 25 person-weeks | About $10 to $60, rising with reads | Poor fit for a relational transactional model; lock-in again | Not recommended |

Notes on B (verified from the self-hosted README unless marked): self-hosted Convex "supports all the free-tier features of the cloud-hosted product"; SQLite by default, Postgres or MySQL for production; backend must be close to its database; deploy with `CONVEX_SELF_HOSTED_URL` and `CONVEX_SELF_HOSTED_ADMIN_KEY` so Vercel can still run `npx convex deploy`. Licence FSL-1.1-Apache-2.0: internal use is allowed, offering it as a competing hosted service is not (fine for us). Cloud Run has known issues (32 MB deploy request limit, WebSocket over HTTP/2), so a VM is safer (likely, community reports). Cloud SQL db-g1-small about $26 to $38 a month (likely; third-party price list, bytebase.com, not Google). The $60 to $120 total and 1 to 3 person-weeks are rough estimates with no detailed costing.

### Hidden costs of leaving Convex (options B, C, E)

- **Auth.** Convex Auth stores password hashes, sessions and magic-link tokens in its own tables. Moving to Identity Platform or Auth.js needs a hash-compatible import (unverified for Convex Auth's hash format) or a forced password reset for every user. Every table that references a user ID needs remapping if IDs change. Option B keeps Convex Auth but needs its keys set up by hand.
- **Realtime.** 284 `useQuery` sites rely on reactive subscriptions. A Cloud Run API needs WebSockets or SSE plus server-side invalidation, or polling (more requests, staler screens). This is the single largest part of option C and is not in its estimate as a separate line; treat 12 to 20 person-weeks as optimistic.
- **Data residency.** Today all text, files and vectors live in the Convex deployment's region (US East unless chosen otherwise). Gemini API calls from a Convex action are not pinned to the EU; EU processing needs Vertex AI with an EU endpoint. Moving only AI calls to an EU GCP project does not change where the data lives. For NL/EU customers check the Convex DPA and subprocessor list (and Anthropic's for Claude calls).
- **Cutover.** Any move needs an export, a period of dual running or a freeze, an env swap on Vercel and a rollback path. Export/import itself is cheap at our size (tens of MB plus 68 MB of files).

## 3. Recommendation and phased plan

1. **Today (hours):** read the dashboard Usage page (metric and per-function breakdown); upgrade to Starter; check whether a spend limit is offered on Starter (documented for Pro only); confirm whether prod shares the team and which regions are in use; reply to Convex about the message, credits and a plan review.
2. **Week 1, in order of likely saving (estimates, re-measure after each):** (1) split embeddings into their own tables, likely the largest win since most image-table reads are 6 KB vectors; (2) move agent tests and reseeds to `npx convex dev --local` or a separate Free team; (3) debounce publish fan-out; (4) batch the image backfill; (5) fix `trainingSelfTest:run` and the OCC hot spots.
3. **Week 2 (if NL/EU customers need it):** rehearse `npx convex export --include-file-storage` and `npx convex import` into an EU deployment; set env and Convex Auth keys; smoke test; swap Vercel env through a preview; keep the old deployment for rollback.
4. **Only if the lab and a Dutch eval justify it:** a GCP project with a small CPU-only Cloud Run service for EmbeddingGemma 2 (text 270M plus vision 170M if photos are in scope), called from a Convex action; an L4 GPU only for bulk re-embedding. Optional time-boxed self-hosted Convex spike as a fallback.

## 4. What we need from the user

- Which Convex metric is exceeded and on which deployment; approval for Starter or Professional.
- Whether "move to Google Cloud" has a business reason (residency, customer IT policy, credits, partnership).
- A GCP project under oppr.ai in europe-west4 with billing, a budget alert and an EU location policy.
- An interactive `gcloud auth login` (stored tokens have expired; no project is configured).
- Whether any EU location (Convex Dublin) is acceptable or data must stay in the Netherlands.

## 5. EmbeddingGemma

We assume "gemma2 embedding" means **EmbeddingGemma 2**, released this month. It could also mean the original EmbeddingGemma (300M, v1); the Embeddings lab runs both.

| Fact | Confidence |
|---|---|
| The app embeds text and images with gemini-embedding-2 at 768 dims; `chunks` and `images` each have a 768-dim `by_embedding` vector index. | verified |
| Our GEMINI_API_KEY sees 60 models. Embedding: gemini-embedding-001, gemini-embedding-2-preview, gemini-embedding-2. Gemma: gemma-4-26b-a4b-it, gemma-4-31b-it (generateContent only). No EmbeddingGemma. | verified (live models list; key never printed) |
| EmbeddingGemma 2: released 2026-10-06, Apache 2.0; 740M params total (270M text, 170M vision, 300M audio, loadable separately); text, code, images, video, audio in one 768-dim space; 768 default with 512/256/128; 8K context; weights on Hugging Face and Kaggle; runs via Ollama, llama.cpp, vLLM, transformers.js and others. | verified (launch blog, re-checked) |
| "Built on Gemma 4". | from the model card read during research; not re-checked |
| Matryoshka truncation with L2 re-normalisation. Multilingual MTEB v2: 61.36 (768), 61.17 (512), 60.41 (256), 57.89 (128). 128 dims hurts multimodal retrieval a lot. | from the model card; not re-checked |
| "100+ languages"; Dutch is not named. Dutch quality must be tested on our data. | verified |
| Prefixes: query `task: search result \| query: {q}`; document `title: {title or none} \| text: {content}`. | verified |
| EmbeddingGemma v1 (300M): text only, 2K context, Gemma licence; `google/` repo gated, `onnx-community/embeddinggemma-300m-ONNX` not gated. | verified |
| ONNX sizes (text / vision / audio): q4 175 / 109 / 189 MB; q8 314 / 195 / 340 MB. q4 on WebGPU recommended (text cosine vs fp32 0.988). Keep WebGPU batches under about 2,700 tokens. | from the HF file tree and model card; not re-checked |
| transformers.js 4.3.1 adds EmbeddingGemma 2; available on jsDelivr. | verified |
| Model Garden: the launch post says EmbeddingGemma 2 is "coming soon" to Model Garden (named there as Gemini Enterprise Agent Platform Model Garden). No listing found on 2026-10-25. | verified (blog); listing absence likely |
| Google codelab serves EmbeddingGemma on Cloud Run (Ollama, 1× L4, europe-west1, private, max 1 instance). | verified |
| Cloud Run GPU facts: L4 in asia-southeast1, europe-west1, europe-west4, us-central1, us-east4; new projects get 3 GPUs of quota per region with zonal redundancy off; zonal redundancy is on by default and costs more per GPU-second, off is cheaper with best-effort failover; instance-based billing; L4 needs at least 4 CPU and 16 GiB; "GPU is billed for the entire duration of the instance lifecycle"; min instances "are charged at the full rate even when idle"; services can scale to zero; instance start about 5 s, model load comes on top. | verified (Cloud Run GPU docs) |
| Cloud Run L4 hourly price. An earlier draft said $0.67 to $0.80 per hour and "always-on $500+ a month"; neither is confirmed. | unsure (pricing page did not render; check cloud.google.com/run/pricing for europe-west4 with zonal redundancy off) |
| Cold start with a GPU: about 5 s plus loading the model (likely tens of seconds), each billed. Bad for an interactive search path unless one instance is kept warm, which is billed full time. For the 270M text model a CPU-only Cloud Run service is the cheaper experiment. | likely |
| HF serverless: embeddinggemma-300m live; embeddinggemma-2 not mapped yet. | likely |
| gemini-embedding-2 pricing: text $0.20 per 1M tokens ($0.10 batch); image about $0.00012 each. | verified |

### Ways to run it

| Route | Works today? | Notes |
|---|---|---|
| Gemini API key | No | Not served |
| Browser, transformers.js 4.3.1 | **Yes** (v1 on CPU verified; v2 needs WebGPU) | The Embeddings lab (`/dev/embeddings`). v2 text encoder 175 MB q4, or text plus vision encoder about 284 MB q4 (plus a 32 MB tokenizer) for image search, on WebGPU; v1 197 MB q4 on WebGPU or 309 MB q8 on CPU; desktop Chrome/Edge |
| Ollama, llama.cpp (GGUF) or vLLM on a laptop or a small VM | Yes, no GCP needed for a laptop | Quickest server-like test outside the browser. Ollama `embeddinggemma-2` (:latest, :740m, :440m) lists Text and Image; llama.cpp needs the mmproj file for images; sentence-transformers 6.1+ in bf16 or fp32 (never fp16) |
| Cloud Run CPU only (europe-west4) | Needs GCP | **First choice on GCP**: cheap service for text and images, scale to zero; slower in bulk |
| Cloud Run + L4 GPU (europe-west4) | Needs GCP | Only for bulk re-embedding or if CPU latency is too high; see billing notes above |
| Model Garden | No | "Coming soon" |
| HF Inference | Partly | v1 only on serverless; another vendor |

Important: Gemma and Gemini vectors are both 768 dims but live in **different spaces**. Never write Gemma vectors into the existing `by_embedding` indexes; a future switch needs its own field and vector index (or a full re-embed and a model swap).

## 6. The Embeddings lab (what was built)

- Page: `/dev/embeddings` in the Developer section (Engineers and Admins), `src/pages/desktop/dev/EmbeddingsLabPage.tsx` with tabs Compare, Images, Test set and Models; components in `src/components/dev/embeddings/`. The analysis page `backend-gcp-and-gemma` links to it.
- Images tab (multimodal): EmbeddingGemma 2 with the text and vision encoders (audio skipped) on WebGPU, q4. Embeds the raster images of the library (four per call, one embedding per image), then searches by words (query prefix) or by a photo (an upload or a library image), side by side with the production `imageSearch.search` (gemini-embedding-2). Word-to-image and image-to-image scores are shown on their own scales. Without a WebGPU adapter the tab says so and offers nothing heavier (the fp32 wasm files are about 1.76 GB).
- Test set tab: 16 Dutch and English plant questions with the expected document codes, editable and kept in localStorage; runs both models and reports hit@1, hit@5 and MRR at document level.
- Models tab: what is loaded (ids, dtype, device, load time), the transformers.js browser cache with a clear button, and the server routes.
- Server: `convex/lab/embeddings.ts`, read-only, signed-in users only. `sample` returns up to 300 live Published passages spread over the Published documents; `geminiSearch` embeds the query with gemini-embedding-2@768, runs `chunks.by_embedding` (limit 256) and keeps only live Published passages via `internal.mcp.data.passages`. Both are actions called on a button press, not live queries, so they do not add subscription load.
- Browser: dynamic import (inside the worker) of `@huggingface/transformers@4.3.1` from jsDelivr (no npm dependency), `onnx-community/embeddinggemma-2-ONNX` q4 with only the text encoder (Compare, Test set) or the text and vision encoders (Images), or the v1 300M as fallback. Download progress shown; the browser caches the files. Passages embedded in batches of 4 with the document prefix; the query with the search prefix. Ranking by cosine after truncating to 768/512/256/128 and re-normalising. Shows both top-10 lists side by side, overlap and timing. Gemini can be limited to the same sample (default, fair) or the whole library. If loading fails (gated repo, no WebGPU, blocked CDN) the page explains why and points to Cloud Run or Vertex.
- Device choice (GPU via WebGPU, or CPU via wasm), remembered in localStorage. Model loading and embedding run in a Web Worker (`src/components/dev/embeddings/embeddingGemma.worker.ts`), so the page stays responsive. After a failed session ONNX Runtime stays broken in its JavaScript context, so each load starts a fresh worker and the old one is terminated (no page reload needed).
- Download sizes differ by route: GPU uses q4 files, CPU q8 (v1: about 197 MB vs 309 MB). The page states this next to the model cards.

### Browser test results (Playwright, headless Chromium, 2026-10-25)

- **CPU (wasm):** EmbeddingGemma v1 300M at q8 (about 309 MB) loaded in 204 s on first download, embedded 300 Published passages from 17 documents in 246 s (about 0.8 s per passage), query 304 ms, rank 3.7 ms. Gemini side: embed 343 ms + vector search 187 ms. Overlap with gemini-embedding-2 top 10 for "Wat moet ik doen als de extruder te heet wordt?": 3 of 10 at 768 dims, 5 of 10 at 128 dims. A tester's later run gave 4 to 5 of 10 at every size. Overlap only measures agreement on one query; it says nothing about which model is better. That needs the Dutch eval on the to-do list.
- **Embeddings lab in Developer (2026-10-25, later the same day):** CPU route again (v1, q8): load 16.8 s from cache, 300 passages from 17 documents embedded in about 145 s. Test set (16 Dutch and English questions, document level, Gemini limited to the same sample): EmbeddingGemma v1 hit@1 69%, hit@5 81%, MRR 0.750; gemini-embedding-2 hit@1 69%, hit@5 81%, MRR 0.740. Three expected documents (EXT-OPS-WI-0001, EXT-OPS-WI-0003, MIX-OPS-SOP-0001) were not in the sample, which caps both. A tie on 16 questions says nothing yet.
- **WebGPU, software only:** headless Chromium here gets a working WebGPU device only through SwiftShader over Vulkan (`--enable-unsafe-webgpu --enable-features=Vulkan,WebGPU --use-vulkan=swiftshader --use-webgpu-adapter=swiftshader`); the default D3D12 adapter fails to create a device (missing dxil.dll). On SwiftShader, EmbeddingGemma 2 with the text and vision encoders (q4) loads and runs: text queries take about 2 s each, but every image takes about 470 s (three in a row: 465, 471 and 476 s; it is the CPU-emulated GPU, not shader compilation), so the whole library (53 raster images, about 7 hours) is not feasible there. One synthetic test: a red 64 px square scored 0.716 against "a red square" and 0.542 against "a forklift in a warehouse", in line with Google's match versus non-match scale. Through the Images tab with the newest 4 library images (company logo and three CLR-204 coil photos; about 415 s per image): words to image ranked the right image first for "company logo" (0.644 vs at most 0.587), "logo van het bedrijf" (0.675 vs 0.578), "label on a coil of pipe" (0.721 vs 0.715) and "hands threading a pipe end into a drum clamp" (0.724 vs 0.697), but not for "straps around a coil of pipe" (the strapped coil came third, 0.692 vs 0.728). Unrelated queries ("extruder die head") scored 0.56 to 0.60 on all four, so on our photos the match versus non-match gap is narrow and starts higher than Google's 0.46 to 0.51. Photo to image with the coil label photo: the other coil photos 0.787 and 0.774, the logo 0.639. Production (gemini-embedding-2 over all 53 images, so not a like-for-like list) found the logo first for "company logo" but not for the Dutch "logo van het bedrijf", and found the matching photo first for the coil queries. A real GPU in desktop Chrome or Edge is still needed for library-scale timing and quality.
- **Responsiveness (fixed):** the first version embedded on the main thread, so the tab froze for about 4 minutes during a CPU run (a Playwright screenshot timed out mid-embed). Embedding now runs in a Web Worker (`embeddingGemma.worker.ts`); a fresh worker per load also replaces the old "reload the page after a failed GPU attempt" workaround.
- **EmbeddingGemma 2 on wasm does not work:** both the q4 and q8 ("quantized") files use the `GatherBlockQuantized` operator, which ONNX Runtime's wasm backend lacks (`Could not find an implementation for GatherBlockQuantized(1)`). fp32 (about 1 GB) was not tried. v2 therefore needs WebGPU in the lab.
- **WebGPU could not be tested here:** headless Chromium sees an Intel gen-12lp adapter but device creation fails ("Device failed at creation"), for v1 and v2 alike. Whether v2 runs on WebGPU in a normal desktop Chrome or Edge is **unverified**; try it in a real browser.

## Open questions

- Which Convex metric is exceeded; is prod on the same Free team; which regions?
- Business reason behind "move to Google Cloud"?
- Which GCP project, billing account and region?
- EmbeddingGemma 2 (assumed) or the original 300M?
- Dutch quality vs gemini-embedding-2?
- Exact Cloud Run L4 price in europe-west4, with and without zonal redundancy.
- What exactly did Convex's message say? Credits or a plan review available?
- Is a spend limit available on Starter, or only on Pro?
- Can GCS (S3 XML API with HMAC keys) back self-hosted Convex file storage?
- One deployment for all plants or one per plant at 10 plants?

## Sources

- DEV deployment: `npx convex run --inline-query` counts, `npx convex logs --history 5000 --success --jsonl`, `npx convex insights`, `_scheduled_functions` (2026-10-25)
- Repo: `convex/schema.ts`, `convex/http.ts`, `convex/auth.ts`, `convex/crons.ts`, `convex/ai/constants.ts`, `vercel.json`
- https://www.convex.dev/pricing · https://www.convex.dev/pricing/faq · https://docs.convex.dev/production/state/limits · https://docs.convex.dev/production/usage-limits · https://docs.convex.dev/production/regions · https://docs.convex.dev/self-hosting
- https://news.convex.dev/making-convex-plans-more-friendly/ (spend limits for Pro) · https://ship.convex.dev/changelog/starter-plan-pay-as-you-go
- https://github.com/get-convex/convex-backend/blob/main/self-hosted/README.md and `self-hosted/advanced/postgres_or_mysql.md`
- https://ship.convex.dev/changelog/eu-region-hosting-dublin
- https://cloud.google.com/run/pricing · https://docs.cloud.google.com/run/docs/configuring/services/gpu
- https://www.bytebase.com/dbcost/cloudsql/instance/db-g1-small.md
- https://cloud.google.com/python/docs/reference/firestore/latest/google.cloud.firestore_v1.types.StructuredQuery.FindNearest · https://firebase.google.com/docs/data-connect
- https://blog.google/innovation-and-ai/technology/developers-tools/embeddinggemma-2/
- https://huggingface.co/onnx-community/embeddinggemma-2-ONNX · https://huggingface.co/google/embeddinggemma-2 · https://huggingface.co/blog/embeddinggemma · https://ollama.com/library/embeddinggemma-2
- https://codelabs.developers.google.com/codelabs/embeddinggemma-cloud-run
- https://ai.google.dev/gemini-api/docs/pricing
