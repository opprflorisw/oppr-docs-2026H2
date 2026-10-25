// Analysis page: should the backend move from Convex to Google Cloud, and can
// we try EmbeddingGemma? Research write-up (docs/research/backend-gcp-and-gemma.md)
// The live Embeddings lab moved to the Developer section (/dev/embeddings).
// Status: outstanding. Nothing has been migrated or provisioned.

import { Link } from "wouter"
import { CheckCircle2, ChevronRight, CircleDashed, FlaskConical, XCircle } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"
import { AnalysisLayout, Section } from "./_AnalysisLayout"

export function BackendGcpGemmaAnalysis() {
  return (
    <AnalysisLayout
      title="Backend on Google Cloud and Gemma embeddings"
      subtitle="Convex says we are over the Free plan limits. Should we move the backend to Google Cloud? Short answer: not to fix this. Our data is tiny; what runs out is the Free plan's monthly throughput, which a paid Convex plan and a few fixes solve in days. EmbeddingGemma can be tried in the browser today in the Embeddings lab, without Google Cloud; a Google Cloud project is only worth it if that test shows it beats our current search on Dutch questions."
      date="2026-10-25"
      scopes={["data-model", "AI", "desktop"]}
    >
      <OutcomeCard />
      <WhatIsHappening />
      <OptionsSection />
      <PlanSection />
      <NeedsSection />
      <GemmaSection />
      <Section
        title="Embeddings lab"
        description="Try EmbeddingGemma on our own Published passages and photos and compare it with the search we use in production. Works without Google Cloud."
      >
        <Link
          href="/dev/embeddings"
          className="group flex items-start gap-3 rounded-lg border border-violet-500/30 bg-card p-4 transition-colors hover:bg-muted/30"
        >
          <FlaskConical className="mt-0.5 h-5 w-5 shrink-0 text-violet-600" aria-hidden />
          <span className="min-w-0 flex-1 space-y-0.5">
            <span className="block text-sm font-semibold">Open the Embeddings lab (Developer)</span>
            <span className="block text-xs text-muted-foreground">
              Compare text search, search the image library by words or a photo with the multimodal model, score a Dutch
              and English test set (hit@1, hit@5, MRR), and see what is loaded and cached.
            </span>
          </span>
          <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground group-hover:text-foreground" aria-hidden />
        </Link>
      </Section>
      <OpenQuestions />
      <SourcesSection />
    </AnalysisLayout>
  )
}

function OutcomeCard() {
  return (
    <Card className="border-amber-500/40 bg-amber-500/5">
      <CardContent className="space-y-2 p-4 text-sm leading-relaxed">
        <div className="flex flex-wrap items-center gap-2">
          <Badge className="border-0 bg-amber-500/20 text-amber-900 dark:text-amber-200">Outstanding · decision needed</Badge>
          <Badge variant="outline">Recommendation: stay on Convex, paid plan, fix waste</Badge>
        </div>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>The limit is throughput, not size.</strong> The whole database is a few tens of MB.
            We burn the Free plan's 1M function calls and 1 GB of database reads a month, mostly through
            development: agent test logins, reseeds, background jobs and queries that read embedding
            vectors they do not need.
          </li>
          <li>
            <strong>Do now:</strong> check which metric the Convex dashboard shows as exceeded, then
            upgrade the team (Starter, pay as you go) so nothing gets switched off. Upgrading is the
            immediate fix: on Free, cutting usage mid-month may not restore service, because usage is
            counted over the billing month. Then cut the waste. Expected cost for one plant: about $0
            to $25 a month on Starter, or $25 per developer a month on Professional.
          </li>
          <li>
            <strong>Spending cap:</strong> Convex documents spend limits (a warning and a disable
            threshold) for Professional teams only. On Starter we found only notification emails and
            metered overage. Check the billing page; if a hard cap matters, choose Professional.
          </li>
          <li>
            <strong>Do not</strong> rewrite onto native Google Cloud for this: about 3 to 5 months of
            work to fix a problem that costs around $25 a month.
          </li>
          <li>
            <strong>Google Cloud for AI, later:</strong> test EmbeddingGemma in the browser, in the Embeddings lab
            first (GPU route in desktop Chrome or Edge), then score it on Dutch questions. Only if it
            wins is a Google Cloud project worth setting up, starting with a small CPU-only Cloud Run
            service.
          </li>
        </ul>
      </CardContent>
    </Card>
  )
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-md border bg-background p-3">
      <div className="text-lg font-semibold">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  )
}

function WhatIsHappening() {
  return (
    <Section
      title="What is happening with Convex, and why"
      description="Measured on the DEV deployment (different-newt-869) on 2026-10-25, read-only."
    >
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Stat value="~tens of MB" label="Total data: 20 documents, 1,650 passages, 52 images, 68 MB of files" />
        <Stat value="1,178" label="Function calls in a 22.5 minute sample (about 3,100 per active hour)" />
        <Stat value="~77 MB/h" label="Database reads per active hour of development" />
        <Stat value="1 to 2 weeks" label="Until the Free plan's monthly calls and reads are used up at that rate" />
      </div>
      <Card>
        <CardContent className="space-y-3 p-4 text-sm leading-relaxed">
          <p>
            The Free plan includes 1M function calls, 1 GB of database reads and writes, 0.5 GB of
            database storage and 1 GB of file storage a month, shared by every deployment on the team
            (dev and prod together). Storage is nowhere near its limit. Calls and database reads are.
          </p>
          <p><strong>Where the usage comes from:</strong></p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong>Embeddings stored inside rows.</strong> Every passage and image row carries its
              768-number vector (about 6 KB). Any list, count or status query on those tables reads it.
              Image search ranking reads about 215 KB per call.
            </li>
            <li>
              <strong>Automated test runs.</strong> 44 sign-ins in 22 minutes and 448 login sessions for
              5 users: these are agents, not people.
            </li>
            <li>
              <strong>Background job fan-out.</strong> Every save or publish schedules re-embedding, a
              Wiki rebuild and a consistency check. About 400 scheduled jobs a day since 2026-10-23
              (489 embedding runs, 168 Wiki rebuilds). A reseed re-embeds everything.
            </li>
            <li>
              <strong>Live queries.</strong> About 480 Convex hooks in the app (284 live queries). Each
              live query re-runs when the data it read changes.
            </li>
          </ul>
          <p className="text-xs text-muted-foreground">
            Not confirmed: which metric the Convex dashboard actually shows as exceeded (the CLI cannot
            see billing), and what the Convex message said exactly. Convex docs list client calls,
            scheduled runs, subscription updates and file accesses as function calls, but do not say
            whether cached query results count; the call estimates below carry that uncertainty. On
            Free, the FAQ says a deployment over its limits for an extended period "may return HTTP
            errors". Reports of whole projects being disabled come from community threads.
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="space-y-2 p-4 text-sm leading-relaxed">
          <p><strong>What leaving Convex means.</strong> The app uses almost every Convex feature:</p>
          <div className="flex flex-wrap gap-1.5">
            {[
              "47 tables + auth tables",
              "about 509 server functions",
              "2 vector indexes (768 dims)",
              "file storage in 28 modules",
              "Convex Auth (password + magic link)",
              "47 scheduler calls",
              "4 crons",
              "HTTP routes: MCP, askStream",
              "live queries on every screen",
              "transactional mutations",
            ].map((t) => (
              <Badge key={t} variant="secondary" className="font-normal">{t}</Badge>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Estimated need for one plant in production (5 to 20 users, a few active hours a day): 1 to 3M
            calls and 10 to 70 GB of database reads a month, extrapolated from one 22-minute window on
            DEV. At Starter rates ($2.20 per 1M calls over 1M, $0.22 per GB of reads over 1 GB) that is
            about $2 to $20 a month, or up to about $26 in the EU region. Professional includes 50 GB of
            reads, so the top estimate would add about $4 there. The user numbers are assumptions.
          </p>
        </CardContent>
      </Card>
    </Section>
  )
}

const OPTIONS = [
  {
    name: "A. Stay on Convex: paid plan, fix the waste, optionally move prod to the EU region",
    effort: "1 hour for the plan; 2 to 5 days for fixes; about half a day for an EU move",
    cost: "Starter about $0 to $25/month (assumes 1 to 3M calls, 10 to 70 GB reads); Professional $25 per developer/month. Usage outside the US is billed at 1.3x.",
    risk: "Vendor lock-in stays. EU region is Dublin, not the Netherlands. A region cannot be changed; moving is export and import. Spend caps documented for Professional only.",
    verdict: "Recommended now",
    tone: "good" as const,
  },
  {
    name: "B. Self-host open-source Convex on Google Cloud (europe-west4)",
    effort: "1 to 3 weeks, then about half a day a month of upkeep (rough estimate)",
    cost: "About $60 to $120/month (VM + Cloud SQL Postgres + storage; rough estimate, Cloud SQL price from a third-party site)",
    risk: "We own uptime, backups and upgrades. Single server. Some cloud-only features missing. Storing files in Google Cloud Storage via its S3 interface is untested. Licence (FSL) allows internal use, not a competing hosted service.",
    verdict: "Fallback, only if a customer requires GCP or NL hosting",
    tone: "maybe" as const,
  },
  {
    name: "C. Rewrite onto native Google Cloud (Cloud Run, Cloud SQL + pgvector, Cloud Storage, Cloud Tasks)",
    effort: "12 to 20 person-weeks plus 3 to 4 for testing and data migration",
    cost: "About $50 to $100/month for one plant, plus the engineering time",
    risk: "284 live queries need WebSockets or polling plus invalidation logic; transactional guarantees lost; Convex Auth password hashes and sessions do not move cleanly (users may need to reset passwords); needs a dual-run and cutover; feature work frozen for a quarter.",
    verdict: "Not now",
    tone: "no" as const,
  },
  {
    name: "D. Hybrid: keep Convex, run AI workloads on Google Cloud",
    effort: "1 to 3 days for a project, billing and a service account",
    cost: "A few dollars a month at experiment volume (CPU service, scale to zero)",
    risk: "Needs a Google Cloud project, billing and a service account key in Convex env. Not needed yet: the Embeddings lab runs EmbeddingGemma in the browser without it.",
    verdict: "Later, only if the lab and a Dutch test show EmbeddingGemma is worth hosting",
    tone: "maybe" as const,
  },
  {
    name: "E. Firebase (Firestore + Cloud Functions)",
    effort: "15 to 25 person-weeks (data model redesign)",
    cost: "About $10 to $60/month, rising with every live read",
    risk: "Poor fit for a relational, transactional model; lock-in to another vendor.",
    verdict: "Not recommended",
    tone: "no" as const,
  },
]

function Verdict({ tone, text }: { tone: "good" | "maybe" | "no"; text: string }) {
  const Icon = tone === "good" ? CheckCircle2 : tone === "maybe" ? CircleDashed : XCircle
  return (
    <span
      className={cn(
        "inline-flex items-start gap-1 font-medium",
        tone === "good" && "text-emerald-700 dark:text-emerald-400",
        tone === "maybe" && "text-amber-700 dark:text-amber-400",
        tone === "no" && "text-rose-700 dark:text-rose-400",
      )}
    >
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      {text}
    </span>
  )
}

function OptionsSection() {
  return (
    <Section title="The options compared" description="Costs are for one plant unless stated. Convex prices from convex.dev/pricing (fetched 2026-10-25); Google Cloud prices are estimates.">
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[28%]">Option</TableHead>
                <TableHead>Effort</TableHead>
                <TableHead>Monthly cost</TableHead>
                <TableHead>Risk</TableHead>
                <TableHead className="w-[16%]">Verdict</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {OPTIONS.map((o) => (
                <TableRow key={o.name}>
                  <TableCell className="align-top text-xs font-medium">{o.name}</TableCell>
                  <TableCell className="align-top text-xs">{o.effort}</TableCell>
                  <TableCell className="align-top text-xs">{o.cost}</TableCell>
                  <TableCell className="align-top text-xs">{o.risk}</TableCell>
                  <TableCell className="align-top text-xs"><Verdict tone={o.tone} text={o.verdict} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </Section>
  )
}

const PHASES = [
  {
    when: "Today (hours)",
    title: "Stop the risk of being switched off",
    items: [
      "Open the Convex dashboard Usage page: note which metric is red, and which functions use the most.",
      "Upgrade the team (Starter, pay as you go). Check whether the billing page offers a spend limit on Starter; it is documented for Professional only.",
      "Confirm whether prod shares the team with dev (all deployments on a team share its quota), and which region each is in.",
      "Reply to Convex: ask what exactly is over, and whether startup credits or a plan review are available.",
    ],
  },
  {
    when: "Week 1",
    title: "Cut the waste",
    items: [
      "First, likely the biggest win: move embeddings out of the passage and image rows into their own tables (most image reads are the 6 KB vectors).",
      "Run agent tests and reseeds against a local Convex (npx convex dev --local) or a separate Free team, not the team prod uses.",
      "Debounce the publish fan-out (Wiki rebuild, consistency check, resolve stale findings).",
      "Stop the image backfill that reschedules itself every second; check what the crons scan.",
      "Re-measure per function on the Usage page after each fix, so the order is based on data.",
    ],
  },
  {
    when: "Week 2 (if NL/EU customers need it)",
    title: "Move production to the Convex EU region",
    items: [
      "Rehearse export and import into a fresh EU deployment, with files.",
      "Smoke test login, search, trainings, captures, MCP and crons; then swap Vercel env through a preview.",
    ],
  },
  {
    when: "When a Google Cloud project exists",
    title: "AI experiments on Google Cloud (option D)",
    items: [
      "Only after the Embeddings lab (GPU route) and its Dutch test set show EmbeddingGemma is worth it.",
      "Start with a small CPU-only Cloud Run service (Ollama embeddinggemma-2, or sentence-transformers 6.1+ in bf16 or fp32), text and images; an L4 GPU only for bulk re-embedding.",
      "Optional time-boxed spike: self-hosted Convex on a VM + Cloud SQL in europe-west4, as a fallback (option B).",
    ],
  },
]

function PlanSection() {
  return (
    <Section title="Recommendation and phased plan" description="Convex stays the source of truth throughout. Every move is export, import and an environment swap, with the old deployment kept for rollback.">
      <div className="grid gap-3 md:grid-cols-2">
        {PHASES.map((p) => (
          <Card key={p.title}>
            <CardContent className="space-y-2 p-4 text-sm">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">{p.when}</div>
              <div className="font-semibold">{p.title}</div>
              <ul className="list-disc space-y-1 pl-5 text-xs leading-relaxed">
                {p.items.map((i) => <li key={i}>{i}</li>)}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>
    </Section>
  )
}

function NeedsSection() {
  const needs = [
    ["Convex dashboard", "Check the Usage page: which limit is exceeded, on which deployment. Approve the move to Starter or Professional."],
    ["Why Google Cloud?", "Is it only the limit warning, or also data residency, customer IT policy, Google credits or a partnership? This decides between A, B and C."],
    ["Google Cloud project", "A new project under oppr.ai in europe-west4 (Netherlands), linked to a billing account, with a budget alert."],
    ["gcloud login", "Run gcloud auth login yourself. It is interactive and cannot be done from here; the stored tokens have expired."],
    ["APIs and access", "Enable Cloud Run and Artifact Registry (and Vertex AI if wanted); a service account for Convex to call the embedding service."],
    ["Customer requirements", "Is any EU location (Convex Dublin) acceptable, or must data stay in the Netherlands? Today all text, files and vectors sit in the Convex deployment's region (US East unless chosen otherwise), and Gemini API calls are not pinned to the EU. Moving only AI calls to an EU Google project does not change where the data lives. Check the DPA and subprocessor list with customers."],
  ]
  return (
    <Section title="What we need from you">
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableBody>
              {needs.map(([a, b]) => (
                <TableRow key={a}>
                  <TableCell className="w-[22%] align-top text-xs font-medium">{a}</TableCell>
                  <TableCell className="align-top text-xs">{b}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </Section>
  )
}

const RUN_OPTIONS = [
  { name: "Gemini API key (what we have)", today: "no", text: "Not served. Our key lists gemini-embedding-001, gemini-embedding-2 and Gemma 4 chat models, but no EmbeddingGemma." },
  { name: "In the browser (transformers.js + WebGPU)", today: "yes", text: "Works today with no Google project: the Embeddings lab in Developer. Tested 2026-10-25: v1 on CPU (wasm, q8) loads and embeds 300 passages (about 0.8 s each). v2 needs WebGPU for text and images alike (its quantized files do not run on wasm); the lab loads the text encoder alone (175 MB) or text plus vision (about 284 MB) to search photos. Desktop only." },
  { name: "Cloud Run, CPU only (first choice on GCP)", today: "later", text: "Cheapest server test for the 270M text model (Ollama or sentence-transformers in a small container), scales to zero. Slower on bulk re-embedding. Needs a GCP project." },
  { name: "Cloud Run with an L4 GPU", today: "later", text: "Google codelab exists. L4 in europe-west1 and europe-west4; new projects get 3 GPUs of quota with zonal redundancy off. Instance-based billing, at least 4 CPU and 16 GiB, GPU billed for the whole instance life. Scale to zero removes idle cost, but every cold start bills about 5 s of start plus model load (likely tens of seconds), too slow for interactive search. One warm instance is billed full time. Hourly price not verified (pricing page did not load)." },
  { name: "Model Garden (Google Cloud)", today: "no", text: "Google's launch post says EmbeddingGemma 2 is 'coming soon' to Model Garden; no listing found on 2026-10-25." },
  { name: "Ollama, llama.cpp or vLLM on a laptop or VM", today: "yes", text: "Google lists these routes. Ollama embeddinggemma-2 (the :latest, :740m and :440m tags list Text and Image) on a developer laptop is the quickest local test outside the browser; llama.cpp needs the GGUF with its mmproj file for images. No Google project needed." },
  { name: "Hugging Face Inference", today: "partly", text: "v1 (300M, text only) is on serverless today; v2 (multimodal) is not. Another vendor; data may leave the EU." },
]

function GemmaSection() {
  return (
    <Section
      title="Gemma embeddings: what it is and how to run it"
      description="We assume 'gemma2 embedding' means EmbeddingGemma 2, released this month. It could also mean the original EmbeddingGemma (300M); the Embeddings lab can run both."
    >
      <div className="grid gap-3 md:grid-cols-2">
        <Card>
          <CardContent className="space-y-2 p-4 text-sm leading-relaxed">
            <div className="font-semibold">What it is</div>
            <ul className="list-disc space-y-1 pl-5 text-xs">
              <li>Open-weight embedding model from Google DeepMind. Version 2 was released 2026-10-06 under Apache 2.0: 740M parameters (270M text, 170M vision, 300M audio).</li>
              <li>Version 2 is multimodal: text, code, images, video and audio in one 768-dim space, 8K token context.</li>
              <li>Matryoshka sizes: vectors can be cut to 512, 256 or 128 numbers (re-normalised). The model card reports little quality loss down to 256 (not re-checked).</li>
              <li>Small enough to run on a laptop or a single small GPU. We host it ourselves; there is no per-token price.</li>
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-2 p-4 text-sm leading-relaxed">
            <div className="font-semibold">What it is not</div>
            <ul className="list-disc space-y-1 pl-5 text-xs">
              <li>Not available through our Gemini API key (checked against the live model list), and not yet on Google Cloud Model Garden.</li>
              <li>The original EmbeddingGemma (300M) is text only, 2K context and under the Gemma licence. Our production model, gemini-embedding-2, is already multimodal (we embed photos with it).</li>
              <li>Not compatible with our stored vectors. Both are 768 dims, but the spaces differ: Gemma vectors need their own field and index and must never be mixed into the existing ones.</li>
              <li>Dutch is not named in its language list. Quality on our Dutch plant documents has to be tested; that is what the lab's test set is for.</li>
            </ul>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[28%]">Way to run it</TableHead>
                <TableHead className="w-[12%]">Works today?</TableHead>
                <TableHead>Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {RUN_OPTIONS.map((r) => (
                <TableRow key={r.name}>
                  <TableCell className="align-top text-xs font-medium">{r.name}</TableCell>
                  <TableCell className="align-top text-xs">
                    <Verdict
                      tone={r.today === "yes" ? "good" : r.today === "no" ? "no" : "maybe"}
                      text={r.today === "yes" ? "Yes" : r.today === "no" ? "No" : r.today === "later" ? "Needs GCP" : "Partly"}
                    />
                  </TableCell>
                  <TableCell className="align-top text-xs">{r.text}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <Card className="border-sky-500/30 bg-sky-500/5">
        <CardContent className="space-y-1 p-4 text-xs leading-relaxed">
          <div className="font-semibold">Can our Gemini API key reach a Gemma embedding model?</div>
          <p>
            <strong>No.</strong> Checked live on 2026-10-25 with the key the app uses (the key itself was
            never printed). It can see 60 models. Embedding models: gemini-embedding-001,
            gemini-embedding-2-preview, gemini-embedding-2. Gemma models: gemma-4-26b-a4b-it and
            gemma-4-31b-it, which generate text and cannot embed. EmbeddingGemma is not among them.
          </p>
          <p>
            For reference, gemini-embedding-2 costs $0.20 per 1M text tokens ($0.10 in batch). At our
            volume, a self-hosted GPU only pays off for data-residency or control reasons, not price.
          </p>
        </CardContent>
      </Card>
    </Section>
  )
}

function OpenQuestions() {
  const qs = [
    "Which Convex metric is actually exceeded, and is prod on the same Free team as dev?",
    "Is there a business reason (residency, customer policy, credits) behind 'move to Google Cloud'?",
    "Which GCP project, billing account and region? (We propose a new oppr.ai project in europe-west4.)",
    "Did 'gemma2 embedding' mean EmbeddingGemma 2 (assumed) or the original 300M?",
    "How good is EmbeddingGemma on Dutch plant passages compared with gemini-embedding-2?",
    "What exactly did Convex's message say, and can Convex offer credits or a plan review?",
    "Does the Convex billing page offer a spend limit on Starter, or only on Professional?",
    "Exact Cloud Run L4 price in europe-west4, with and without zonal redundancy (the pricing page did not load).",
    "Does EmbeddingGemma 2 run on the GPU route in a normal desktop Chrome or Edge?",
  ]
  return (
    <Section title="Open questions">
      <Card>
        <CardContent className="p-4">
          <ul className="list-disc space-y-1 pl-5 text-xs leading-relaxed">
            {qs.map((q) => <li key={q}>{q}</li>)}
          </ul>
        </CardContent>
      </Card>
    </Section>
  )
}

function SourcesSection() {
  const sources = [
    "DEV deployment counts and logs (npx convex run, npx convex logs, npx convex insights), 2026-10-25",
    "convex.dev/pricing and /pricing/faq; docs.convex.dev/production/state/limits; docs.convex.dev/production/regions (1.3x outside the US, region fixed); news.convex.dev/making-convex-plans-more-friendly (spend limits for Pro)",
    "docs.cloud.google.com/run/docs/configuring/services/gpu (L4 regions, billing, quota, zonal redundancy)",
    "github.com/get-convex/convex-backend self-hosted README and Postgres guide",
    "huggingface.co/onnx-community/embeddinggemma-2-ONNX model card; huggingface.co/google/embeddinggemma-2",
    "blog.google EmbeddingGemma 2 launch post; codelabs.developers.google.com/codelabs/embeddinggemma-cloud-run",
    "ai.google.dev/gemini-api/docs/pricing; live models list from the Gemini API",
    "Full write-up: docs/research/backend-gcp-and-gemma.md. Follow-ups: docs/todo.md",
  ]
  return (
    <Section title="Sources">
      <Card>
        <CardContent className="p-4">
          <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
            {sources.map((s) => <li key={s}>{s}</li>)}
          </ul>
        </CardContent>
      </Card>
    </Section>
  )
}
