// Convex validators for the Wiki contract (convex/lib/wikiTypes.ts). Used by
// convex/schema.ts and by function args. The type assertions at the end keep
// the validators and the hand-written interfaces in step.
import { v, type Infer, type ObjectType } from "convex/values"
import type {
  ClaimResult,
  ComposedBlock,
  ComposedSection,
  Coverage,
  DroppedDetail,
  FoundSource,
  GeneratedBlock,
  LegacyWikiContent,
  Outline,
  OutlineSection,
  Point,
  ProposedSection,
  SaveBlockGenerationArgs,
  SaveGenerationArgs,
  SearchStats,
  SourceRef,
  WikiContentV2,
} from "./wikiTypes"

export const blockKindValidator = v.union(
  v.literal("intro"),
  v.literal("prose"),
  v.literal("keyPoints"),
  v.literal("bullets"),
  v.literal("steps"),
  v.literal("table"),
  v.literal("callout"),
  v.literal("images"),
  v.literal("gap"),
)
export const blockOriginValidator = v.union(v.literal("generated"), v.literal("written"), v.literal("edited"))
export const blockStatusValidator = v.union(
  v.literal("generating"),
  v.literal("grounded"),
  v.literal("checked"),
  v.literal("awaitingConfirm"),
  v.literal("unchecked"),
  v.literal("contradicts"),
  v.literal("notCovered"),
  v.literal("needsRecheck"),
  v.literal("gap"),
  v.literal("failed"),
)
export const blockStateValidator = v.union(v.literal("live"), v.literal("staged"), v.literal("removedStaged"))
export const calloutToneValidator = v.union(v.literal("danger"), v.literal("warning"), v.literal("tip"))
export const readingLevelValidator = v.union(v.literal("floor"), v.literal("office"))
export const lengthValidator = v.union(v.literal("oneScreen"), v.literal("normal"), v.literal("full"))
export const sourceSetValidator = v.union(v.literal("scope"), v.object({ documentIds: v.array(v.id("documents")) }))
export const foldValidator = v.union(v.literal("open"), v.literal("closed"))
export const blockFoldValidator = v.object({ closed: v.boolean(), summary: v.string() })

export const citationValidator = v.object({
  chunkId: v.id("chunks"),
  documentId: v.id("documents"),
  namingCode: v.string(),
  version: v.number(),
  section: v.union(v.string(), v.null()),
})

export const disputedValidator = v.object({
  findingId: v.id("findings"),
  otherNamingCode: v.string(),
  otherVersion: v.number(),
  otherQuote: v.string(),
})

export const pointValidator = v.object({
  text: v.string(),
  pointKey: v.string(),
  key: v.optional(v.boolean()),
  cells: v.optional(v.array(v.string())),
  citations: v.array(citationValidator),
  pinned: v.optional(v.boolean()),
  disputed: v.optional(disputedValidator),
})

export const outlineSectionValidator = v.object({
  id: v.string(),
  heading: v.string(),
  role: v.optional(v.literal("intro")),
  instruction: v.optional(v.string()),
  safety: v.optional(v.boolean()),
  fold: foldValidator,
})

export const outlineValidator = v.object({
  sections: v.array(outlineSectionValidator),
  introEnabled: v.boolean(),
})

export const composedBlockValidator = v.object({
  id: v.string(),
  kind: blockKindValidator,
  origin: blockOriginValidator,
  tone: v.optional(calloutToneValidator),
  columns: v.optional(v.array(v.string())),
  fold: v.optional(blockFoldValidator),
  points: v.array(pointValidator),
  authorName: v.optional(v.string()),
  checkedAt: v.optional(v.number()),
  confirmedByName: v.optional(v.string()),
  figureIds: v.optional(v.array(v.id("images"))),
})

export const composedSectionValidator = v.object({
  id: v.string(),
  heading: v.string(),
  role: v.optional(v.literal("intro")),
  safety: v.optional(v.boolean()),
  fold: foldValidator,
  blocks: v.array(composedBlockValidator),
})

export const coverageValidator = v.object({
  documents: v.number(),
  passagesRead: v.number(),
  passagesTotal: v.number(),
  covers: v.array(v.string()),
  notCovered: v.array(v.string()),
  stub: v.optional(v.boolean()),
})

export const contentV2Validator = v.object({
  v: v.literal(2),
  sections: v.array(composedSectionValidator),
  coverage: coverageValidator,
})

export const legacyContentValidator = v.object({
  intro: v.string(),
  sections: v.array(
    v.object({
      heading: v.string(),
      kind: v.optional(v.union(v.literal("bullets"), v.literal("steps"), v.literal("table"))),
      safety: v.optional(v.boolean()),
      columns: v.optional(v.array(v.string())),
      points: v.array(
        v.object({
          text: v.string(),
          key: v.optional(v.boolean()),
          cells: v.optional(v.array(v.string())),
          citations: v.array(citationValidator),
        }),
      ),
    }),
  ),
})

/** `wikis.content`: legacy until migrated, then v2 (spec 6.2). */
export const storedContentValidator = v.union(legacyContentValidator, contentV2Validator)

export const sourceRefValidator = v.object({
  documentId: v.id("documents"),
  namingCode: v.string(),
  title: v.string(),
  version: v.number(),
  excerptsUsed: v.optional(v.number()),
  excerptsTotal: v.optional(v.number()),
})

export const droppedPointValidator = v.object({
  text: v.string(),
  reason: v.string(),
  detail: v.optional(v.string()),
})

export const droppedDetailValidator = v.object({
  text: v.string(),
  reason: v.string(),
  detail: v.string(),
  blockId: v.optional(v.string()),
})

export const dependsOnValidator = v.object({ documentId: v.id("documents"), version: v.number() })

// ---- Check against Published ---------------------------------------------------

export const claimVerdictValidator = v.union(
  v.literal("supported"),
  v.literal("supportedByJudge"),
  v.literal("partly"),
  v.literal("differs"),
  v.literal("notCovered"),
  v.literal("disputed"),
)

export const claimResultValidator = v.object({
  text: v.string(),
  verdict: claimVerdictValidator,
  via: v.union(v.literal("code"), v.literal("judge")),
  reason: v.string(),
  passages: v.array(
    v.object({
      chunkId: v.id("chunks"),
      documentId: v.id("documents"),
      namingCode: v.string(),
      title: v.string(),
      version: v.number(),
      quote: v.string(),
      inScope: v.boolean(),
    }),
  ),
  supportedPart: v.optional(v.string()),
  findingId: v.optional(v.id("findings")),
  conflictPair: v.optional(v.array(v.id("documents"))),
})

export const searchStatsValidator = v.object({
  documentsSearched: v.number(),
  passagesSearched: v.number(),
  documentsNotIndexed: v.number(),
})

export const foundSourceValidator = v.object({
  documentId: v.id("documents"),
  namingCode: v.string(),
  title: v.string(),
  version: v.number(),
  areaCode: v.union(v.string(), v.null()),
  passage: v.object({ chunkId: v.id("chunks"), text: v.string(), section: v.union(v.string(), v.null()) }),
  badge: v.union(v.literal("inWiki"), v.literal("inScopeNotRead"), v.literal("notInScope")),
  disputedFindingId: v.optional(v.id("findings")),
})

// ---- Generation hand-off -------------------------------------------------------

export const generatedBlockValidator = v.object({
  blockId: v.string(),
  points: v.array(pointValidator),
  dropped: v.array(droppedPointValidator),
  gap: v.optional(v.boolean()),
  columns: v.optional(v.array(v.string())),
})

export const proposedSectionValidator = v.object({
  heading: v.string(),
  instruction: v.optional(v.string()),
  safety: v.optional(v.boolean()),
  blocks: v.array(
    v.object({
      kind: blockKindValidator,
      tone: v.optional(calloutToneValidator),
      columns: v.optional(v.array(v.string())),
      points: v.array(pointValidator),
    }),
  ),
})

export const saveGenerationArgs = {
  wikiId: v.id("wikis"),
  ticket: v.number(),
  model: v.string(),
  promptVersion: v.string(),
  sources: v.array(sourceRefValidator),
  status: v.union(v.literal("ready"), v.literal("empty"), v.literal("failed")),
  error: v.union(v.string(), v.null()),
  mode: v.union(v.literal("outline"), v.literal("propose")),
  blocks: v.optional(v.array(generatedBlockValidator)),
  proposed: v.optional(v.array(proposedSectionValidator)),
  intro: v.optional(generatedBlockValidator),
  keyPoints: v.optional(generatedBlockValidator),
  droppedPoints: v.number(),
  droppedDetail: v.optional(v.array(droppedDetailValidator)),
}

/** saveGeneration's args as the server receives them (DroppedPoint.reason widened to string). */
export type SaveGenerationInput = ObjectType<typeof saveGenerationArgs>

export const saveBlockGenerationArgs = {
  wikiId: v.id("wikis"),
  blockId: v.string(),
  ticket: v.number(),
  points: v.array(pointValidator),
  dropped: v.array(droppedPointValidator),
  gap: v.boolean(),
  model: v.string(),
  columns: v.optional(v.array(v.string())),
  error: v.optional(v.string()),
}

// ---- Table fields --------------------------------------------------------------

/** One `wikiBlocks` row without system fields; also the block snapshot in `wikiBuilds.blocks`. */
export const wikiBlockFields = {
  wikiId: v.id("wikis"),
  sectionId: v.string(),
  blockId: v.string(),
  /** Fractional order key within the section; compare as strings. */
  order: v.string(),
  state: blockStateValidator,
  /** For a staged edit of a live block: the live row it replaces on Apply. */
  stagedOf: v.optional(v.id("wikiBlocks")),
  kind: blockKindValidator,
  origin: blockOriginValidator,
  status: blockStatusValidator,
  tone: v.optional(calloutToneValidator),
  columns: v.optional(v.array(v.string())),
  fold: v.optional(blockFoldValidator),
  instruction: v.optional(v.string()),
  readingLevel: v.optional(readingLevelValidator),
  length: v.optional(lengthValidator),
  sourceSet: sourceSetValidator,
  pinnedChunkIds: v.array(v.id("chunks")),
  hiddenPointKeys: v.array(v.string()),
  points: v.array(pointValidator),
  writtenText: v.optional(v.string()),
  checkId: v.optional(v.id("wikiChecks")),
  checkedAt: v.optional(v.number()),
  confirmedBy: v.optional(v.id("people")),
  confirmedAt: v.optional(v.number()),
  /** "Send back" note for the author (spec 3.1). */
  sentBackNote: v.optional(v.string()),
  dependsOn: v.array(dependsOnValidator),
  generationTicket: v.number(),
  droppedPoints: v.number(),
  /** Why the last AI job failed (status `failed`). */
  error: v.optional(v.string()),
  figureIds: v.optional(v.array(v.id("images"))),
  authorPersonId: v.optional(v.id("people")),
  updatedAt: v.number(),
  updatedBy: v.optional(v.id("people")),
}
export const wikiBlockSnapshotValidator = v.object(wikiBlockFields)

export const wikiEventKindValidator = v.union(
  v.literal("created"),
  v.literal("scopeChanged"),
  v.literal("outlineChanged"),
  v.literal("blockAdded"),
  v.literal("blockChanged"),
  v.literal("blockRemoved"),
  v.literal("checkRun"),
  v.literal("confirmed"),
  v.literal("sentBack"),
  v.literal("applied"),
  v.literal("rebuilt"),
  v.literal("restored"),
  v.literal("migrated"),
  v.literal("revisionProposed"),
  v.literal("settingChanged"),
  v.literal("deleted"),
  // Phase 1.5
  v.literal("pointPinned"),
  v.literal("pointHidden"),
)
export type WikiEventKind = Infer<typeof wikiEventKindValidator>

// ---- Keep validators and interfaces in step (compile-time only) -----------------

type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false
function same<T extends true>(): T | undefined {
  return undefined
}
same<Same<Infer<typeof pointValidator>, Point>>()
same<Same<Infer<typeof outlineSectionValidator>, OutlineSection>>()
same<Same<Infer<typeof outlineValidator>, Outline>>()
same<Same<Infer<typeof composedBlockValidator>, ComposedBlock>>()
same<Same<Infer<typeof composedSectionValidator>, ComposedSection>>()
same<Same<Infer<typeof coverageValidator>, Coverage>>()
same<Same<Infer<typeof contentV2Validator>, WikiContentV2>>()
same<Same<Infer<typeof legacyContentValidator>, LegacyWikiContent>>()
same<Same<Infer<typeof sourceRefValidator>, SourceRef>>()
same<Same<Infer<typeof droppedDetailValidator>, DroppedDetail>>()
same<Same<Infer<typeof claimResultValidator>, ClaimResult>>()
same<Same<Infer<typeof searchStatsValidator>, SearchStats>>()
same<Same<Infer<typeof foundSourceValidator>, FoundSource>>()
same<Same<Infer<typeof proposedSectionValidator>, ProposedSection>>()
// Producers may pass the interfaces where the validators are expected.
same<GeneratedBlock extends Infer<typeof generatedBlockValidator> ? true : false>()
same<SaveGenerationArgs extends Infer<ReturnType<typeof v.object<typeof saveGenerationArgs>>> ? true : false>()
same<SaveBlockGenerationArgs extends Infer<ReturnType<typeof v.object<typeof saveBlockGenerationArgs>>> ? true : false>()
