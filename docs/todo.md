# To-dos for later

## 2026-10-25 · Backend on Google Cloud and Gemma embeddings

Context: `/analysis/backend-gcp-and-gemma` and `docs/research/backend-gcp-and-gemma.md`.

### Reduce Convex usage now
- [ ] Check the Convex dashboard Usage page: which metric is exceeded (function calls, database I/O, egress), which functions use the most, and is prod on the same team as DEV (all deployments share the team quota)?
- [ ] Reply to Convex's message: what exactly is over; ask about startup credits or a plan review.
- [x] (2026-10-26, done by Floris) Upgrade the Convex team to Starter (pay as you go) now; upgrading, not cutting waste, is what keeps a Free team from being cut off this month.
- [ ] Check whether the billing page offers a spend limit on Starter. Convex documents warning/disable spend limits for Pro only; if a hard cap matters, go to Professional.
- [x] (2026-10-26: `chunkVectors` / `imageVectors`, `convex/lib/vectors.ts`) First fix, likely the biggest saving: move the 768-dim embeddings out of `chunks` and `images` rows into their own tables, so lists, facets, `imageSearch:rank` and `insights:homeStats` stop reading about 6 KB per row.
- [x] (2026-10-26: saves now keep unchanged passages and their vectors, embeddings are written 20 per mutation; Wiki rebuilds already coalesce; the per-publish Consistency check stays) Debounce the publish fan-out (embedMissingInternal, wiki regenerate, consistency checkDocument, findings.resolveStale).
- [x] (2026-10-26: loops within one run for up to 4 minutes) Stop `ai/imageEmbed:backfill` rescheduling itself every second; batch it instead.
- [ ] Review what the crons scan (wiki rebuild daily, consistency weekly, refreshers daily, capture media retention daily) and what a reseed triggers (re-embed everything plus consistency.runAll at 90 s).
- [ ] Run agent tests and reseeds against a local Convex (`npx convex dev --local`) or a separate Free team, not the team prod uses; stop repeated test sign-ins.
- [ ] Re-measure per function on the Usage page after each fix.
- [ ] Fix `trainingSelfTest:run` (bytes read limit exceeded) and the OCC conflicts in `seedKnowledge:wipeBatch` / `documents:saveContent` reported by `npx convex insights`.

### Decide the backend option
- [ ] Decide between A (stay on Convex, paid plan), B (self-hosted Convex on GCP), C (native GCP rewrite). Recommended: A now, B as a documented fallback, C only for a hard customer requirement.
- [ ] Ask why "move to Google Cloud": limit warning only, or residency, customer IT policy, credits, partnership?
- [ ] Confirm whether any EU location (Convex Dublin, usage billed at 1.3x) is acceptable or data must stay in NL. Check the Convex DPA and subprocessors; note Gemini API calls are not EU-pinned (Vertex EU endpoint would be).
- [ ] If leaving Convex is ever chosen: plan the auth move (password hashes, sessions, user ID remapping, or a forced reset), the realtime replacement for 284 live queries, and a dual-run cutover with rollback.

### Google Cloud setup (only after the EmbeddingGemma tests below justify it, or for option B)
- [ ] Create a GCP project under oppr.ai in europe-west4, link billing, add a budget alert and an org policy for EU locations.
- [ ] User runs `gcloud auth login` interactively (stored tokens have expired) and sets the project.
- [ ] Enable Cloud Run and Artifact Registry (Vertex AI, Cloud SQL, Secret Manager if needed); create a least-privilege service account for Convex to call.

### Spikes
- [ ] Export/import rehearsal: `npx convex export --include-file-storage` into a fresh deployment (EU region), set env and auth keys, smoke test login, search, trainings, captures, MCP, crons.
- [ ] Optional, time-boxed: self-hosted Convex on a GCE VM + Cloud SQL Postgres 17 in europe-west4; test GCS via the S3 API for file storage; load test with about 50 subscriptions.

### EmbeddingGemma
- [ ] Try the lab's GPU (WebGPU) route in a normal desktop Chrome or Edge with a real GPU: text and image embedding are verified on a software (SwiftShader) adapter only, far too slow to embed the library there (about 8 minutes per image).
- [ ] Use the Embeddings lab (`/dev/embeddings`) to compare EmbeddingGemma 2 with gemini-embedding-2 on Dutch and English plant queries (768/512/256/128), and on image search by words and by photo (Images tab).
- [ ] Grow the lab's Test set (16 questions now, document level) into a proper Dutch retrieval eval and score both models.
- [ ] Optional local server test without GCP: Ollama (or llama.cpp / vLLM) on a developer laptop.
- [ ] If worth pursuing: a small CPU-only Cloud Run service (Ollama embeddinggemma-2 or sentence-transformers 6.1+ in bf16/fp32; text, and images if photo search moves to it) in europe-west4, scale to zero, called from a Convex action with a service account.
- [ ] Only for bulk re-embedding or if CPU latency is too high: Cloud Run with an L4 GPU. Check the L4 price on cloud.google.com/run/pricing first (zonal redundancy off is cheaper; the GPU is billed for the whole instance life; cold starts bill model load time).
- [ ] Recheck Google Cloud Model Garden for an EmbeddingGemma 2 listing ("coming soon" per the launch post).
- [ ] Re-measure the cold (first) model download in the lab; the last check ran with a warm browser cache.
- [ ] Decide: separate `gemmaEmbedding` field and vector index (never mixed with gemini-embedding-2 vectors), or stay on Gemini.
