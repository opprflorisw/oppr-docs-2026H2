// The Wiki contract every lane imports (docs/specs/wiki-upgrade.md 6.1).
// Pure: no Convex ctx, no I/O, so the browser and the browser checks can
// import it too. Convex validators that mirror these types live in
// ./wikiValidators.ts. Change this file only additively.
import type { Doc, Id } from "../_generated/dataModel"
import type { DroppedPoint } from "../ai/grounding"

export type { DroppedPoint }

// ---- Blocks ------------------------------------------------------------------

export const BLOCK_KINDS = [
  "intro",
  "prose",
  "keyPoints",
  "bullets",
  "steps",
  "table",
  "callout",
  "images",
  "gap",
] as const
// Phase 2: | "checklist" | "faq" | "glossary" | "contacts"
export type BlockKind = (typeof BLOCK_KINDS)[number]

export const BLOCK_ORIGINS = ["generated", "written", "edited"] as const
export type BlockOrigin = (typeof BLOCK_ORIGINS)[number]

export const BLOCK_STATUSES = [
  "generating",
  "grounded",
  "checked",
  "awaitingConfirm",
  "unchecked",
  "contradicts",
  "notCovered",
  "needsRecheck",
  "gap",
  "failed",
] as const
export type BlockStatus = (typeof BLOCK_STATUSES)[number]

/** Only these statuses are composed into `wikis.content` (spec 2.4). */
export const VISIBLE_STATUSES: readonly BlockStatus[] = ["grounded", "checked", "gap"]

/** Staged blocks in these statuses refuse Apply (spec 3.1). */
export const BLOCKS_APPLY: readonly BlockStatus[] = ["unchecked", "contradicts", "notCovered", "generating"]

export const CALLOUT_TONES = ["danger", "warning", "tip"] as const
export type CalloutTone = (typeof CALLOUT_TONES)[number]

export type ReadingLevel = "floor" | "office"
export type Length = "oneScreen" | "normal" | "full"
export type SourceSet = "scope" | { documentIds: Id<"documents">[] }
export type BlockState = "live" | "staged" | "removedStaged"

/** Danger callouts per Wiki: default and the most an Engineer may allow (D5). */
export const DEFAULT_MAX_DANGER = 2
export const MAX_MAX_DANGER = 5
/** Pinned passages per block (spec 2.5). */
export const MAX_PINNED_CHUNKS = 12
/** Hand-written text per block (spec 3.5). */
export const MAX_WRITTEN_CHARS = 1200
/** Claims per check (spec 3.5). */
export const MAX_CLAIMS = 12
/** Entries kept in `wikis.droppedDetail`. */
export const MAX_DROPPED_DETAIL = 20

// ---- Points ------------------------------------------------------------------

export interface Citation {
  chunkId: Id<"chunks">
  documentId: Id<"documents">
  namingCode: string
  version: number
  section: string | null
}

/** Set by code when a point cites one side of an open contradiction Finding (spec 5.4). */
export interface Disputed {
  findingId: Id<"findings">
  otherNamingCode: string
  otherVersion: number
  otherQuote: string
}

/** The UI calls a point a fact. One cited sentence, list item or table row. */
export interface Point {
  text: string
  pointKey: string
  key?: boolean
  cells?: string[]
  citations: Citation[]
  pinned?: boolean
  disputed?: Disputed
}

// ---- Outline -----------------------------------------------------------------

export interface OutlineSection {
  id: string
  heading: string
  role?: "intro"
  instruction?: string
  safety?: boolean
  fold: "open" | "closed"
}

export interface Outline {
  sections: OutlineSection[]
  introEnabled: boolean
}

// ---- Composed content (the read model in `wikis.content`) -------------------

export interface BlockFold {
  closed: boolean
  summary: string
}

export interface ComposedBlock {
  id: string
  kind: BlockKind
  origin: BlockOrigin
  tone?: CalloutTone
  columns?: string[]
  fold?: BlockFold
  points: Point[]
  authorName?: string
  checkedAt?: number
  confirmedByName?: string
  figureIds?: Id<"images">[]
}

export interface ComposedSection {
  id: string
  heading: string
  role?: "intro"
  safety?: boolean
  fold: "open" | "closed"
  blocks: ComposedBlock[]
}

/** Data for the code-written coverage line under the introduction (spec 2.2). */
export interface Coverage {
  documents: number
  passagesRead: number
  passagesTotal: number
  /** Headings of sections with content. */
  covers: string[]
  /** Headings of sections that are only a gap. */
  notCovered: string[]
  /** Built without AI (OPPR_AI_STUB or no key): "Offline stand-in, no AI". */
  stub?: boolean
}

export interface WikiContentV2 {
  v: 2
  sections: ComposedSection[]
  coverage: Coverage
}

/** The pre-upgrade shape still stored on un-migrated Wikis. */
export interface LegacyWikiContent {
  intro: string
  sections: {
    heading: string
    kind?: "bullets" | "steps" | "table"
    safety?: boolean
    columns?: string[]
    points: { text: string; key?: boolean; cells?: string[]; citations: Citation[] }[]
  }[]
}

export type StoredWikiContent = WikiContentV2 | LegacyWikiContent

/** One source version a build read (`wikis.sources`). */
export interface SourceRef {
  documentId: Id<"documents">
  namingCode: string
  title: string
  version: number
  excerptsUsed?: number
  excerptsTotal?: number
}

export interface DroppedDetail {
  text: string
  reason: string
  detail: string
  blockId?: string
}

// ---- Check against Published (Lane C) ---------------------------------------

export type ClaimVerdict = "supported" | "supportedByJudge" | "partly" | "differs" | "notCovered" | "disputed"

export interface ClaimPassage {
  chunkId: Id<"chunks">
  documentId: Id<"documents">
  namingCode: string
  title: string
  version: number
  quote: string
  inScope: boolean
}

export interface ClaimResult {
  text: string
  verdict: ClaimVerdict
  via: "code" | "judge"
  reason: string
  passages: ClaimPassage[]
  supportedPart?: string
  findingId?: Id<"findings">
  /** Two retrieved Published Documents that disagree with each other (always 2 ids). */
  conflictPair?: Id<"documents">[]
}

export interface SearchStats {
  documentsSearched: number
  passagesSearched: number
  documentsNotIndexed: number
}

export interface CheckResult {
  checkId: Id<"wikiChecks">
  claims: ClaimResult[]
  stats: SearchStats
}

export interface FoundSource {
  documentId: Id<"documents">
  namingCode: string
  title: string
  version: number
  areaCode: string | null
  passage: { chunkId: Id<"chunks">; text: string; section: string | null }
  badge: "inWiki" | "inScopeNotRead" | "notInScope"
  disputedFindingId?: Id<"findings">
}

export interface FindSourcesResult {
  sources: FoundSource[]
  /** "3 documents are still being indexed and are not searchable yet", or null. */
  indexingNote: string | null
}

// ---- Generation hand-off (Lane B -> Lane A) ---------------------------------

/** What Lane B's full build hands to `internal.wikis.saveGeneration`. */
export interface GeneratedBlock {
  blockId: string
  points: Point[]
  dropped: DroppedPoint[]
  gap?: boolean
  /** Table columns, set when the block row has none yet. */
  columns?: string[]
}

export interface ProposedBlock {
  kind: BlockKind
  tone?: CalloutTone
  columns?: string[]
  points: Point[]
}

export interface ProposedSection {
  heading: string
  instruction?: string
  safety?: boolean
  blocks: ProposedBlock[]
}

export interface SaveGenerationArgs {
  wikiId: Id<"wikis">
  ticket: number
  model: string
  promptVersion: string
  sources: SourceRef[]
  /** ready: content made; empty: nothing Published in Scope; failed: keep the previous content. */
  status: "ready" | "empty" | "failed"
  error: string | null
  /** outline: fill known blockIds; propose: no outline yet, first build. */
  mode: "outline" | "propose"
  blocks?: GeneratedBlock[]
  proposed?: ProposedSection[]
  intro?: GeneratedBlock
  keyPoints?: GeneratedBlock
  /** Total points dropped by grounding in this build. */
  droppedPoints: number
  /** The first MAX_DROPPED_DETAIL dropped points with plain-language reasons. */
  droppedDetail?: DroppedDetail[]
}

/** What `ai.wikiBlock.generateBlock` hands to `internal.wikiBlocks.saveBlockGeneration`. */
export interface SaveBlockGenerationArgs {
  wikiId: Id<"wikis">
  blockId: string
  ticket: number
  points: Point[]
  dropped: DroppedPoint[]
  gap: boolean
  model: string
  /** Table columns, set when the block row has none yet. */
  columns?: string[]
  /** Set when the AI job failed: the block goes to `failed`, previous content stays. */
  error?: string
}

// ---- AI allowance (spec 6.6), shown in the edit bar -------------------------

export type WikiAiAction = "wikiBuild" | "wikiBlock" | "wikiCheck" | "wikiFind" | "wikiRestyle"

export interface AiAllowance {
  /** OPPR_WIKI_AI_OFF or the settings kill switch. */
  off: boolean
  /** Left this hour for the viewer; null when nobody is checked in. */
  person: { wikiBlock: number; wikiCheck: number; wikiFind: number } | null
  /** Left today for this Wiki (all people plus system). */
  wiki: number
  /** Left today for the whole deployment. */
  deployment: number
}

// ---- Editor read model (api.wikiBlocks.editorState, api.wikiBlocks.builds) --

/** A `wikiBlocks` row as the editor gets it (live and staged rows). */
/** A stored Check against Published (wikiChecks row) as the editor shows it. */
export interface StoredCheck extends CheckResult {
  /** The text that was checked. */
  text: string
  at: number
  personId: Id<"people">
  personName: string | null
}

export type EditorBlock = Doc<"wikiBlocks"> & {
  authorName: string | null
  confirmedByName: string | null
  /** The block's last successful check (row.checkId), or null. */
  check: StoredCheck | null
}

export interface EditorEvent {
  _id: Id<"wikiEvents">
  at: number
  personName: string | null
  kind: Doc<"wikiEvents">["kind"]
  blockId: string | null
  sectionId: string | null
  detail: string
}

export interface WikiSettings {
  confirmByAnother: boolean
  maxDanger: number
  readingLevel: ReadingLevel | null
  length: Length | null
}

export interface EditorState {
  wikiId: Id<"wikis">
  outline: Outline | null
  /** Unapplied changes to the Outline, or null when there are none. */
  outlineStaged: Outline | null
  stagedVersion: number
  /** Live and staged block rows (removedStaged too), with names. */
  blocks: EditorBlock[]
  /** Number of unapplied changes (outline edits plus staged block rows). */
  stagedCount: number
  /** Other people who staged a change in the last 10 minutes. */
  alsoEditing: { personId: Id<"people">; name: string; at: number }[]
  allowance: AiAllowance
  settings: WikiSettings
  /** Last 20 events, newest first. */
  events: EditorEvent[]
}

export interface BuildSummary {
  _id: Id<"wikiBuilds">
  builtAt: number
  reason: "build" | "apply" | "confirm" | "restore" | "preMigration"
  trigger: string | null
  personName: string | null
  points: number
  sources: string[]
  /** False for compact pre-upgrade rows that cannot be restored. */
  restorable: boolean
}

// ---- Pure helpers ------------------------------------------------------------

const SUPERSCRIPTS = /[¹²³⁰-₟]/g
const BRACKET_MARKERS = /\[\d+(?:\s*[,-]\s*\d+)*\]/g

/**
 * NFKC, lower case, cite markers (superscripts, [n]) removed, punctuation
 * removed except a decimal point inside a number, whitespace collapsed.
 */
export function normaliseForKey(text: string): string {
  return text
    .replace(SUPERSCRIPTS, " ")
    .normalize("NFKC")
    .replace(BRACKET_MARKERS, " ")
    .toLowerCase()
    // A private-use mark keeps a decimal point through the punctuation strip.
    .replace(/(\d)[.,](\d)/g, "$1$2")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(//g, ".")
    .replace(/\s+/g, " ")
    .trim()
}

/** FNV-1a over UTF-16 code units, two seeds, 16 hex chars. Stable across runtimes. */
function hash64(s: string): string {
  let h1 = 0x811c9dc5
  let h2 = 0x01000193 ^ 0x5bd1e995
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0
    h2 = Math.imul(h2 ^ c, 0x01000193 + 0x2000) >>> 0
  }
  return h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0")
}

/** Stable identity of a point's wording: a short hash of normaliseForKey(text). */
export function pointKey(text: string): string {
  return hash64(normaliseForKey(text))
}

export function isContentV2(content: StoredWikiContent | null | undefined): content is WikiContentV2 {
  return !!content && (content as WikiContentV2).v === 2
}

const STUB_PREFIX = "Offline stand-in"

/**
 * Reads any stored content as v2. Legacy sections become one generated
 * block each, with ids derived from their position, so a legacy Wiki still
 * renders. `sources` fills the coverage counts for legacy content.
 */
export function normaliseContent(
  content: StoredWikiContent | null | undefined,
  sources: SourceRef[] = [],
): WikiContentV2 | null {
  if (!content) return null
  if (isContentV2(content)) return content
  const sections: ComposedSection[] = content.sections.map((s, i) => ({
    id: `legacy-${i}`,
    heading: s.heading,
    ...(s.safety ? { safety: true } : {}),
    fold: "open",
    blocks: [
      {
        id: `legacy-${i}-0`,
        kind: s.kind ?? "bullets",
        origin: "generated",
        ...(s.columns ? { columns: s.columns } : {}),
        points: s.points.map((p) => ({ ...p, pointKey: pointKey(p.text) })),
      },
    ],
  }))
  return {
    v: 2,
    sections,
    coverage: {
      documents: sources.length,
      passagesRead: sources.reduce((n, s) => n + (s.excerptsUsed ?? 0), 0),
      passagesTotal: sources.reduce((n, s) => n + (s.excerptsTotal ?? 0), 0),
      covers: sections.filter((s) => s.blocks.some((b) => b.points.length > 0)).map((s) => s.heading),
      notCovered: [],
      ...(content.intro.startsWith(STUB_PREFIX) ? { stub: true } : {}),
    },
  }
}

/** Every point of every block, in reading order. Used by check 5, get, MCP and Ask. */
export function allPoints(content: StoredWikiContent | null | undefined): Point[] {
  const v2 = normaliseContent(content)
  if (!v2) return []
  return v2.sections.flatMap((s) => s.blocks.flatMap((b) => b.points))
}
