// Analysis page: Oppr Knowledge slices 0 and 1. What was built, how it was
// verified, what the outside judge found and what is still open. Static
// documentation; no live data.

import type { ReactNode } from "react"
import { CheckCircle2, CircleDashed, XCircle } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { AnalysisLayout, Section } from "./_AnalysisLayout"

export function KnowledgeSlice01Analysis() {
  return (
    <AnalysisLayout
      title="Oppr Knowledge: slice 0 (foundation) and slice 1 (Wiki via Guided creation)"
      subtitle="The first build of Oppr Knowledge on top of the DOCS codebase. Only Published content counts as truth; people create a Wiki by describing it. This page records what was built, the decisions behind it, the proof, and what is still open."
      date="2026-10-23"
      scopes={["desktop", "AI", "data-model"]}
    >
      <Summary />
      <Built />
      <Decisions />
      <Proof />
      <Team />
      <Judge />
      <Open />
    </AnalysisLayout>
  )
}

function Summary() {
  return (
    <Card className="border-emerald-500/40 bg-emerald-500/5">
      <CardContent className="grid gap-4 p-5 md:grid-cols-3">
        <Stat label="Automated checks" value="7 of 7 pass" note="devChecks:run on the fresh seed, real AI" />
        <Stat label="Wiki grounding" value="52 of 52 points traceable" note="0 of 24 real Claude points dropped by the stricter check" />
        <Stat label="Rebuild after publish" value="about 12 s" note="target was under 60 s" />
      </CardContent>
    </Card>
  )
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
      <div className="text-xs text-muted-foreground">{note}</div>
    </div>
  )
}

function List({ items }: { items: ReactNode[] }) {
  return (
    <ul className="list-disc space-y-1 pl-5 text-sm">
      {items.map((it, i) => (
        <li key={i}>{it}</li>
      ))}
    </ul>
  )
}

function Built() {
  return (
    <Section title="What was built" description="Branch feature/knowledge-slice-0-1, Convex dev deployment only.">
      <p className="text-sm font-medium">Slice 0: foundation</p>
      <List
        items={[
          "Renamed to Oppr Knowledge. Desktop menu is exactly six places: Home, Documents, Learn, Wiki, Assets, Settings. Settings is one page with flat tabs (?tab=); old addresses redirect.",
          "Home: an inbox (documents waiting for review or publishing, periodic reviews due within 30 days or overdue) and a Knowledge health snapshot. New document opens as a dialog, never as an extra page.",
          "Periodic review: every Published document gets a review date (12 months by default, adjustable). Confirming \"still valid\" needs a checked-in Engineer and an explicit confirm, and is recorded on the version.",
          "Check-in: exactly two modes, Anonymous and Checked in (useCheckIn in src/lib/checkIn.ts), picker in the top bar, People tab in Settings.",
          "Published-only everywhere: convex/lib/published.ts is the single rule. Ask (all scopes, overview, related, code links), the floor views, Wikis and Home all use it. A never-published document is invisible to Ask.",
          "Document control: changing text after review or approval sends the edition back to draft; publish dates and version history labels are true; archived and unpublished documents say so.",
          "Fresh minimal seed (convex/seedKnowledge.ts): plant Pijpwerk Noord, 2 areas, 3 disciplines, 3 Assets, 6 documents, 5 people, 1 Wiki, with draft-only sentinels for leak tests.",
          "Learn and Floor simulator placeholder pages that name what is coming.",
        ]}
      />
      <p className="pt-2 text-sm font-medium">Slice 1: Wiki via Guided creation</p>
      <List
        items={[
          "GuidedCreation (src/components/guided): a generic, typed component. The Draft is the single source of truth, the assistant returns the complete next Draft, changed fields are marked, the last AI turn can be undone, closing asks before discarding, Create is always a button.",
          "Wiki scope over areas, disciplines, Assets and documents (convex/lib/scope.ts), with a live Built from preview that also lists what is in scope but not published.",
          "Generation with Claude (convex/ai/llm.ts, structured output). Every point cites excerpt keys; convex/ai/grounding.ts drops any point without a valid source, with codes or quantities not in the cited text, with weak wording support, with flipped polarity, direction, restriction or order.",
          "Fair passage budget for broad scopes; Built from shows read-in-part sources, versions and publish dates.",
          "Ticketed regeneration on publish, archive, refile and delete, plus a daily cron. Points from outdated or removed sources are withheld until the rebuild.",
          "Wiki page: source chips with the passage on hover; a click opens the document with the passage highlighted and a breadcrumb back to the Wiki.",
        ]}
      />
    </Section>
  )
}

function Decisions() {
  return (
    <Section title="Decisions" description="Captured in CONTEXT.md and docs/adr; these are the ones a future reader will ask about.">
      <List
        items={[
          "ADR 0003: AI prepares, humans publish. Wikis and generated questions are derived output and need no approval of their own.",
          "Grounding is enforced in code, not trusted to the prompt. The check is lexical and strict: it would rather drop a correct point than show a wrong one.",
          "Wiki generation uses Claude (claude-opus-5-5) when ANTHROPIC_API_KEY is set; Gemini stays the fallback and still powers Ask (embeddings and answers). An offline stand-in (OPPR_AI_STUB=1, dev only) exists for when no key works.",
          "Approve and publish do not check that the actor is the assigned reviewer or approver: the showcase has one login. Segregation of duties is a later step.",
          "Asset links come from the working body, so a draft can change which Published documents an Asset-scoped Wiki includes (text never leaks). Left as is for now.",
        ]}
      />
    </Section>
  )
}

const CHECKS: [string, string, string][] = [
  ["3", "Ask never serves draft or unpublished text", "10 scopes, 169 excerpts, all live versions; no sentinel text"],
  ["4", "Wiki never uses draft text", "Built from shows live v1, not the v2 draft; never-published document not used"],
  ["5", "Every Wiki point traceable to a Published passage in scope", "52 of 52"],
  ["G", "Grounding check cases", "32 of 32 (numbers, units, ranges, codes, negation, meaning flips, table cells)"],
  ["B", "Broad scope passage budget", "[3, 40, 117, 0] of 160; safety passage kept"],
  ["7", "Scope with nothing Published", "empty Wiki, no invented content"],
  ["6", "Rebuild after a source is published", "about 12 s with real Claude"],
]

function Proof() {
  return (
    <Section title="Proof" description="npx convex run devChecks:run on the fresh seed (see docs/test-set.md). Browser tasks were walked by the verifier and lens D.">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12">#</TableHead>
            <TableHead>Check</TableHead>
            <TableHead>Evidence</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {CHECKS.map(([id, name, ev]) => (
            <TableRow key={id}>
              <TableCell className="font-mono text-xs">{id}</TableCell>
              <TableCell className="text-sm">
                <span className="inline-flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                  {name}
                </span>
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">{ev}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <List
        items={[
          "Browser tasks (from Home): find what needs review, 0 clicks to see and 1 to open; periodic reviews due, 1 click; check in and out, 2 clicks each way; create a Wiki by describing it, about 10 to 25 s end to end; open a citation, 1 click with the passage highlighted; Floor simulator, 2 clicks.",
          "Real Claude Wiki for the seed names the deliberate contradiction by itself: the changeover SOP gives 40 Nm, the supplier manual 45 Nm, both cited.",
          "Live Ask (Gemini) answers PX-4400 for the purge compound, never the draft PX-9917, and gives both torque values with both sources.",
        ]}
      />
    </Section>
  )
}

function Team() {
  return (
    <Section title="How it was built" description="One builder, four expert passes in sequence, a verifier and an outside judge on a different model.">
      <List
        items={[
          "Builder (Opus): slices 0 and 1, the seed, devChecks and the test set.",
          "Lens A, conversational AI UX (Opus): changed-field marks, undo, safe close, in-conversation retry, focus and accessibility.",
          "Lens B, ISO 9001 document control (Opus): floor views Published-only, review record, true publish dates, Wiki provenance and withholding outdated points.",
          "Lens C, retrieval and grounding (Opus): stricter grounding (units, ranges, number words, wording support, polarity), fair passage budget, Ask states both values when sources disagree.",
          "Lens D, product design (Opus): one obvious decision per screen, decision strip in the editor, check-in in two clicks, confirm before deleting a Wiki, way back from a citation.",
          "Verifier (Sonnet): all checks and browser tasks with evidence; found the New document page one level too deep (fixed).",
          "Outside judge (Sonnet), two rounds, reviewing cold with only the app, the diff, the glossary and the goals.",
        ]}
      />
    </Section>
  )
}

function Judge() {
  return (
    <Section title="Outside judge" description="Round 1 findings and what was done with them. Round 2 results are in the final run report.">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Finding</TableHead>
            <TableHead className="w-28">Outcome</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <JudgeRow text="Grounding passed meaning flips (above/below, increase/reduce, on/off, dropped only, reversed order, 15 pipes vs 15 minutes)" fixed />
          <JudgeRow text="Text could change after review or approval and still be published" fixed />
          <JudgeRow text="Periodic review confirmed in one click while Anonymous" fixed />
          <JudgeRow text="Unpublished documents selectable in Ask's document picker" fixed />
          <JudgeRow text="After a scope edit, points from a removed document stayed visible until the rebuild" fixed />
          <JudgeRow text="A Wiki could be created without a purpose" fixed />
          <JudgeRow text="/documents showed a bare Not found; seed dates out of order" fixed />
          <JudgeRow text="Approve and publish do not check the assigned reviewer or approver" />
          <JudgeRow text="Asset links follow the working draft" />
          <JudgeRow text="Ask shows sources next to an answer that says it has no information" />
          <JudgeRow text="Regeneration resolves every Wiki's scope on each publish (fine at showcase size)" />
        </TableBody>
      </Table>
    </Section>
  )
}

function JudgeRow({ text, fixed }: { text: string; fixed?: boolean }) {
  return (
    <TableRow>
      <TableCell className="text-sm">{text}</TableCell>
      <TableCell className="text-xs">
        {fixed ? (
          <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="h-3.5 w-3.5" /> Fixed
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <CircleDashed className="h-3.5 w-3.5" /> Open
          </span>
        )}
      </TableCell>
    </TableRow>
  )
}

function Open() {
  return (
    <Section title="Still open" description="Known limits, and where the next slice (Consistency check and Findings) should start.">
      <List
        items={[
          <span key="g" className="inline-flex items-start gap-1.5"><XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />The grounding check is lexical. A swapped attribution (the SOP says 45, the manual says 40) or a change of meaning that keeps all the wording can pass. Next step: per-claim quotes that code verifies.</span>,
          "The production Gemini key is invalid, so Ask on the live app does not work until a new key is set there. Dev has a working key.",
          "Nothing is pushed or deployed. Production data and settings are untouched.",
          "Next slice: Consistency check and Findings. The seed already contains the 40 vs 45 Nm contradiction to find, and the Wiki shows it today.",
        ]}
      />
    </Section>
  )
}
