import { defineSchema, defineTable } from "convex/server"
import { v } from "convex/values"
import { authTables } from "@convex-dev/auth/server"

export default defineSchema({
  ...authTables,

  meta: defineTable({
    key: v.string(),
    value: v.string(),
  }).index("by_key", ["key"]),

  // The asset registry is a PLATFORM-SCOPED concept in the wider Oppr toolset:
  // LOGS/IDA and DOCS share one asset list. This showcase keeps its own copy,
  // but `source`/`externalId` let a row carry its platform identity so the
  // future swap to an imported registry is a server-side change only. Access
  // assets exclusively through convex/assets.ts — no component reads this table
  // directly. See docs/adr/0001-shared-asset-and-log-registries.md.
  assets: defineTable({
    code: v.string(),
    name: v.string(),
    site: v.string(),
    location: v.union(v.string(), v.null()),
    qrToken: v.string(),
    description: v.union(v.string(), v.null()),
    level: v.number(),
    floorplan: v.union(v.string(), v.null()),
    isLinked: v.boolean(),
    linkedLogCode: v.union(v.string(), v.null()),
    linkedLogName: v.union(v.string(), v.null()),
    linkedLogDescription: v.union(v.string(), v.null()),
    pinNumber: v.union(v.number(), v.null()),
    pinX: v.union(v.number(), v.null()),
    pinY: v.union(v.number(), v.null()),
    // Optional asset photo stored in Convex storage.
    imageStorageId: v.optional(v.union(v.id("_storage"), v.null())),
    // Provenance for the shared registry. "local" (default) or "platform";
    // externalId is the asset's id in the wider Oppr platform, used to dedup
    // on import. Both optional so existing rows stay valid.
    source: v.optional(v.string()),
    externalId: v.optional(v.string()),
  })
    .index("by_qrToken", ["qrToken"])
    .index("by_code", ["code"])
    .index("by_externalId", ["externalId"]),

  assetLogs: defineTable({
    assetId: v.id("assets"),
    code: v.string(),
    name: v.string(),
    description: v.union(v.string(), v.null()),
  }).index("by_assetId", ["assetId"]),

  documents: defineTable({
    namingCode: v.string(),
    // Naming code is derived from these three tokens + an auto sequence.
    location: v.optional(v.union(v.string(), v.null())),
    discipline: v.optional(v.union(v.string(), v.null())),
    title: v.string(),
    // Type slug. Was a fixed 4-literal union; now references the editable
    // namingTypes vocabulary, so stored as a string. Existing slugs
    // (sop/manual/work_instruction/lmra) stay valid.
    type: v.string(),
    status: v.union(
      v.literal("pre_draft"),
      v.literal("draft"),
      v.literal("in_review"),
      v.literal("approved"),
      v.literal("published"),
      v.literal("archived"),
    ),
    // The highest / working edition number. Advances only when a published
    // document is forked for a new edit (see createNewVersion), never on save.
    currentVersion: v.number(),
    // The published edition operators / QR / RAG are served. Stays pinned to the
    // live version while a newer edition is being drafted, so v1 remains live
    // until v2 completes the cycle. Null/undefined until first publish — readers
    // fall back to currentVersion in that case.
    liveVersion: v.optional(v.number()),
    ownerId: v.union(v.id("users"), v.null()),
    // Lifecycle roles. Nullable so a draft can start before they are set;
    // gated transitions enforce they exist before advancing.
    authorId: v.optional(v.union(v.id("users"), v.null())),
    reviewerId: v.optional(v.union(v.id("users"), v.null())),
    approverId: v.optional(v.union(v.id("users"), v.null())),
    tags: v.array(v.string()),
    updatedAt: v.number(),
    // Periodic review (CONTEXT.md). Set on publish to publish time plus
    // reviewIntervalMonths (default 12); confirming a review pushes it forward.
    nextReviewAt: v.optional(v.union(v.number(), v.null())),
    reviewIntervalMonths: v.optional(v.number()),
    lastReviewedAt: v.optional(v.union(v.number(), v.null())),
    // Where the body comes from (CONTEXT.md): written in the editor, converted
    // from a PDF, or a supplier PDF wrapped unchanged (Wrapped manual).
    origin: v.optional(
      v.union(v.literal("editor"), v.literal("convert"), v.literal("wrapped")),
    ),
    // Wrapped manuals: the manufacturer that supplied the PDF.
    supplier: v.optional(v.union(v.string(), v.null())),
  })
    .index("by_namingCode", ["namingCode"])
    .index("by_ownerId", ["ownerId"]),

  documentVersions: defineTable({
    documentId: v.id("documents"),
    version: v.number(),
    bodyKind: v.union(v.literal("tiptap"), v.literal("pdf")),
    bodyJson: v.union(v.any(), v.null()),
    pdfStorageId: v.union(v.id("_storage"), v.null()),
    // Wrapped manuals (bodyKind "pdf"): pdfStorageId is the copy stamped with
    // our naming code, version and status; sourcePdfStorageId is the supplier's
    // original file, kept unchanged. stampLabel says what the stamp shows.
    sourcePdfStorageId: v.optional(v.union(v.id("_storage"), v.null())),
    pdfPageCount: v.optional(v.number()),
    stampLabel: v.optional(v.union(v.string(), v.null())),
    // Set by the author on a new version (CONTEXT.md: Significant change).
    // Only a significant change sends linked Trainings back to review and
    // flags Skill holders as "re-train needed".
    significantChange: v.optional(v.boolean()),
    changeNote: v.optional(v.union(v.string(), v.null())),
    publishedAt: v.number(),
    // Per-version approval trail. Recorded as the document advances through
    // review → approved → published.
    signoffs: v.optional(
      v.array(
        v.object({
          role: v.union(
            v.literal("author"),
            v.literal("reviewer"),
            v.literal("approver"),
          ),
          userId: v.id("users"),
          at: v.number(),
          // The checked-in Engineer who gave the sign-off (CONTEXT.md).
          personId: v.optional(v.id("people")),
        }),
      ),
    ),
    // Periodic review record for this version: who confirmed it as still
    // valid, and when. Publishing itself is the approver sign-off above.
    reviewConfirmations: v.optional(
      v.array(
        v.object({
          userId: v.id("users"),
          at: v.number(),
          // The checked-in Engineer who confirmed it (CONTEXT.md: Checked in).
          personId: v.optional(v.id("people")),
        }),
      ),
    ),
  }).index("by_documentId_and_version", ["documentId", "version"]),

  // ---- Templates -----------------------------------------------------------
  // DB-backed document templates. Seeded from the original code skeletons;
  // managed via the /templates page.
  templates: defineTable({
    name: v.string(),
    // Type slug — see documents.type. References namingTypes.
    type: v.string(),
    description: v.union(v.string(), v.null()),
    bodyJson: v.any(),
    updatedAt: v.number(),
  }).index("by_type", ["type"]),

  // ---- PDF cover settings ---------------------------------------------------
  // Single-row table (upserted): org-wide configuration for how exported PDFs
  // look. Every export consumes this; there is no per-document override.
  coverSettings: defineTable({
    companyName: v.union(v.string(), v.null()),
    headerText: v.union(v.string(), v.null()),
    footerText: v.union(v.string(), v.null()),
    titleSize: v.union(v.literal("sm"), v.literal("md"), v.literal("lg")),
    logoImageId: v.optional(v.union(v.id("images"), v.null())),
    showPageNumbers: v.boolean(),
    confidentialityLabel: v.union(v.string(), v.null()),
    defaultWatermark: v.union(
      v.literal("none"),
      v.literal("controlled"),
      v.literal("draft"),
      v.literal("review"),
      v.null(),
    ),
    accentColor: v.union(v.string(), v.null()),
    updatedAt: v.number(),
  }),

  // ---- PPE catalog ----------------------------------------------------------
  // Configurable required-PPE items shown in the editor's PPE block and on the
  // Safety tab. `storageId` points at a real ISO 7010 pictogram PNG stored in
  // Convex (seeded from the public standard via ppeImages.ts); `pictogramId`
  // is the bundled SVG fallback used until the image is seeded or for custom
  // items. `labelEn`/`labelNl` carry the bilingual captions; `label` stays as
  // the legacy/default caption. Built-in items can be deactivated, never
  // deleted; custom items are deletable. The slug is what the ppe TipTap node
  // stores, so the eight original ids are kept as factory slugs.
  ppeItems: defineTable({
    slug: v.string(),
    label: v.string(),
    labelEn: v.optional(v.union(v.string(), v.null())),
    labelNl: v.optional(v.union(v.string(), v.null())),
    // `description` is the English copy; `descriptionNl` its Dutch counterpart.
    description: v.union(v.string(), v.null()),
    descriptionNl: v.optional(v.union(v.string(), v.null())),
    pictogramId: v.string(),
    storageId: v.optional(v.union(v.id("_storage"), v.null())),
    active: v.boolean(),
    builtIn: v.boolean(),
    sortOrder: v.number(),
  }).index("by_slug", ["slug"]),

  // ---- Naming vocabulary + counters ----------------------------------------
  namingLocations: defineTable({
    code: v.string(),
    label: v.string(),
  }).index("by_code", ["code"]),

  namingDisciplines: defineTable({
    code: v.string(),
    label: v.string(),
  }).index("by_code", ["code"]),

  // Document types — the third naming vocabulary. `slug` is the stored
  // documents.type value (sop/manual/…); `token` is the naming-code segment
  // (SOP/MAN/…). `icon`/`color` drive the type badge. Built-in rows can be
  // deactivated (never deleted — naming codes are immutable, so a deleted type
  // would orphan codes); custom rows are deletable only while unused.
  namingTypes: defineTable({
    slug: v.string(),
    token: v.string(),
    label: v.string(),
    icon: v.string(),
    color: v.string(),
    active: v.boolean(),
    builtIn: v.boolean(),
    sortOrder: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_token", ["token"]),

  // One row per (location, discipline, type) triplet. `value` is the last
  // allocated sequence number; the next code uses value + 1. Patched
  // atomically inside the create mutation so concurrent creates can't collide.
  namingCounters: defineTable({
    key: v.string(),
    value: v.number(),
  }).index("by_key", ["key"]),

  documentAssets: defineTable({
    documentId: v.id("documents"),
    assetId: v.id("assets"),
  })
    .index("by_documentId", ["documentId"])
    .index("by_assetId", ["assetId"])
    .index("by_documentId_and_assetId", ["documentId", "assetId"]),

  // Logs originate in the Oppr LOGS module and will be IMPORTED into DOCS so a
  // SOP can launch-reference the exact log it standardizes. This showcase
  // seeds placeholders; `source`/`externalId` mark which rows came from the
  // platform vs were seeded locally. Access through convex/logs.ts only.
  // See docs/adr/0001-shared-asset-and-log-registries.md.
  logs: defineTable({
    // Placeholder identity for the LOGS module, e.g. AMS-OPS-LOG-0001.
    code: v.optional(v.string()),
    name: v.string(),
    type: v.string(),
    description: v.optional(v.union(v.string(), v.null())),
    // Provenance for the shared registry — see the assets table note.
    source: v.optional(v.string()),
    externalId: v.optional(v.string()),
  }).index("by_externalId", ["externalId"]),

  documentLogRefs: defineTable({
    documentId: v.id("documents"),
    version: v.number(),
    logId: v.id("logs"),
    anchorId: v.string(),
  }).index("by_documentId_and_version", ["documentId", "version"]),

  chunks: defineTable({
    documentId: v.id("documents"),
    version: v.number(),
    seq: v.number(),
    text: v.string(),
    pageOrSection: v.union(v.string(), v.null()),
    embedding: v.union(v.array(v.float64()), v.null()),
    embeddingModel: v.union(v.string(), v.null()),
    // When this chunk's embedding was last written. Drives the AI status panel.
    embeddedAt: v.optional(v.number()),
  })
    .index("by_documentId_and_version", ["documentId", "version"])
    .vectorIndex("by_embedding", {
      vectorField: "embedding",
      dimensions: 768,
      filterFields: ["documentId"],
    }),

  qaSessions: defineTable({
    userId: v.id("users"),
    scopeKind: v.union(
      v.literal("doc"),
      v.literal("asset"),
      v.literal("library"),
    ),
    scopeId: v.string(),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_and_scopeKind_and_scopeId", [
      "userId",
      "scopeKind",
      "scopeId",
    ]),

  images: defineTable({
    source: v.union(v.literal("upload"), v.literal("url")),
    storageId: v.union(v.id("_storage"), v.null()),
    externalUrl: v.union(v.string(), v.null()),
    filename: v.string(),
    contentType: v.string(),
    byteSize: v.union(v.number(), v.null()),
    width: v.union(v.number(), v.null()),
    height: v.union(v.number(), v.null()),
    sha256: v.union(v.string(), v.null()),
    altText: v.string(),
    uploadedBy: v.union(v.id("users"), v.null()),
    createdAt: v.number(),
  })
    .index("by_sha256", ["sha256"])
    .index("by_uploadedBy", ["uploadedBy"]),

  imageUsages: defineTable({
    imageId: v.id("images"),
    documentId: v.id("documents"),
    documentVersion: v.number(),
    context: v.union(
      v.literal("body"),
      v.literal("thumbnail"),
      v.literal("asset"),
    ),
    createdAt: v.number(),
  })
    .index("by_imageId", ["imageId"])
    .index("by_documentId", ["documentId"])
    .index("by_documentId_and_version", ["documentId", "documentVersion"]),

  importJobs: defineTable({
    sourceStorageId: v.union(v.id("_storage"), v.null()),
    sourceFilename: v.string(),
    sourceContentType: v.string(),
    sourceByteSize: v.number(),
    sourceSha256: v.union(v.string(), v.null()),
    targetTemplate: v.union(
      v.literal("sop"),
      v.literal("workInstructionLog"),
      v.literal("manual"),
      v.literal("lmra"),
      v.literal("auto"),
    ),
    defaultMode: v.union(v.literal("verbatim"), v.literal("improve")),
    stage: v.union(
      v.literal("uploaded"),
      v.literal("extracted"),
      v.literal("mapped"),
      v.literal("linksResolved"),
      v.literal("finalized"),
      v.literal("failed"),
    ),
    classification: v.union(
      v.object({
        kind: v.union(
          v.literal("digitalPdf"),
          v.literal("scannedPdf"),
          v.literal("unsupported"),
        ),
        pageCount: v.number(),
        detectedLanguage: v.union(v.string(), v.null()),
      }),
      v.null(),
    ),
    extractedMarkdown: v.union(v.string(), v.null()),
    extractedPages: v.union(
      v.array(
        v.object({
          pageNumber: v.number(),
          text: v.string(),
        }),
      ),
      v.null(),
    ),
    extractedImageIds: v.array(v.id("images")),
    extractStats: v.optional(
      v.union(
        v.object({
          imagesDetected: v.number(),
          imagesExtracted: v.number(),
          imagesSkipped: v.number(),
          pageFallbackImages: v.number(),
          jpegImages: v.number(),
          pngImages: v.number(),
        }),
        v.null(),
      ),
    ),
    mappedBody: v.union(v.any(), v.null()),
    mappedLogSpec: v.union(v.any(), v.null()),
    mappingNotes: v.union(v.string(), v.null()),
    structuredDoc: v.optional(v.union(v.any(), v.null())),
    linkResolutions: v.union(
      v.array(
        v.object({
          match: v.string(),
          kind: v.union(
            v.literal("document"),
            v.literal("asset"),
            v.literal("log"),
          ),
          confidence: v.number(),
          targetId: v.union(v.string(), v.null()),
          targetLabel: v.union(v.string(), v.null()),
          accepted: v.boolean(),
        }),
      ),
      v.null(),
    ),
    suggestedNamingCode: v.union(v.string(), v.null()),
    suggestedTitle: v.union(v.string(), v.null()),
    suggestedAssetIds: v.array(v.id("assets")),
    finalizedDocumentId: v.union(v.id("documents"), v.null()),
    error: v.union(v.string(), v.null()),
    createdBy: v.union(v.id("users"), v.null()),
    updatedAt: v.number(),
  })
    .index("by_createdBy", ["createdBy"])
    .index("by_stage", ["stage"]),

  // ---- People ----------------------------------------------------------------
  // Showcase people (CONTEXT.md: Operator, Engineer). Not login accounts: a
  // person "checks in" by picking their name; Anonymous is the default.
  people: defineTable({
    name: v.string(),
    kind: v.union(v.literal("operator"), v.literal("engineer")),
    role: v.string(),
    area: v.union(v.string(), v.null()),
    sortOrder: v.number(),
    // Skill profiles this person is measured against (Skill matrix).
    profileIds: v.optional(v.array(v.id("skillProfiles"))),
  }),

  // ---- Wikis -----------------------------------------------------------------
  // AI-generated overviews of Published Knowledge inside a Scope. Never written
  // by hand; regenerated on a schedule and when an in-scope Document publishes.
  wikis: defineTable({
    title: v.string(),
    purpose: v.string(),
    scope: v.object({
      areas: v.array(v.string()),
      disciplines: v.array(v.string()),
      assetIds: v.array(v.id("assets")),
      documentIds: v.array(v.id("documents")),
    }),
    status: v.union(
      v.literal("generating"),
      v.literal("ready"),
      v.literal("empty"),
      v.literal("failed"),
    ),
    content: v.union(
      v.null(),
      v.object({
        intro: v.string(),
        sections: v.array(
          v.object({
            heading: v.string(),
            points: v.array(
              v.object({
                text: v.string(),
                citations: v.array(
                  v.object({
                    chunkId: v.id("chunks"),
                    documentId: v.id("documents"),
                    namingCode: v.string(),
                    version: v.number(),
                    section: v.union(v.string(), v.null()),
                  }),
                ),
              }),
            ),
          }),
        ),
      }),
    ),
    // The exact Published versions this content was built from.
    sources: v.array(
      v.object({
        documentId: v.id("documents"),
        namingCode: v.string(),
        title: v.string(),
        version: v.number(),
        // How many of the version's passages the generator read. Lower than
        // excerptsTotal when the Scope was too large to read in full.
        excerptsUsed: v.optional(v.number()),
        excerptsTotal: v.optional(v.number()),
      }),
    ),
    generatedAt: v.union(v.number(), v.null()),
    // Bumped on every generation request; a run only writes if it still holds
    // the latest ticket, so an older run can never overwrite a newer one.
    generationTicket: v.number(),
    requestedAt: v.union(v.number(), v.null()),
    lastTrigger: v.union(v.string(), v.null()),
    droppedPoints: v.number(),
    error: v.union(v.string(), v.null()),
    createdBy: v.union(v.id("users"), v.null()),
    updatedAt: v.number(),
  }),

  // ---- Seed media cache --------------------------------------------------------
  // AI-generated seed images and supplier PDFs, keyed by a stable key. Never
  // wiped by the seed, so a reseed does not pay to regenerate them.
  seedMedia: defineTable({
    key: v.string(),
    promptHash: v.string(),
    storageId: v.id("_storage"),
    contentType: v.string(),
    byteSize: v.number(),
    createdAt: v.number(),
  }).index("by_key", ["key"]),

  // ---- Consistency check (CONTEXT.md: Consistency check, Finding) -------------
  findings: defineTable({
    kind: v.union(v.literal("contradiction"), v.literal("duplicate")),
    status: v.union(
      v.literal("open"),
      v.literal("resolved"),
      v.literal("dismissed"),
    ),
    // One sentence, written for an Engineer: what disagrees or repeats.
    summary: v.string(),
    // The two sides, each quoting a passage of a Published version.
    a: v.object({
      documentId: v.id("documents"),
      namingCode: v.string(),
      title: v.string(),
      version: v.number(),
      chunkId: v.union(v.id("chunks"), v.null()),
      section: v.union(v.string(), v.null()),
      quote: v.string(),
    }),
    b: v.object({
      documentId: v.id("documents"),
      namingCode: v.string(),
      title: v.string(),
      version: v.number(),
      chunkId: v.union(v.id("chunks"), v.null()),
      section: v.union(v.string(), v.null()),
      quote: v.string(),
    }),
    // Copies of a.documentId / b.documentId for indexing.
    documentA: v.id("documents"),
    documentB: v.id("documents"),
    // Stable identity of the pair at these versions. A dismissed pair is not
    // reported again until one side gets a new Published version.
    pairKey: v.string(),
    detectedBy: v.union(
      v.literal("publish"),
      v.literal("weekly"),
      v.literal("manual"),
      v.literal("seed"),
    ),
    detectedAt: v.number(),
    resolvedAt: v.union(v.number(), v.null()),
    resolution: v.union(v.string(), v.null()),
    dismissedReason: v.union(v.string(), v.null()),
    dismissedBy: v.union(v.id("people"), v.null()),
    proposedRevisionId: v.optional(v.union(v.id("proposedRevisions"), v.null())),
  })
    .index("by_status", ["status"])
    .index("by_pairKey", ["pairKey"])
    .index("by_documentA_and_status", ["documentA", "status"])
    .index("by_documentB_and_status", ["documentB", "status"]),

  consistencyRuns: defineTable({
    trigger: v.union(
      v.literal("publish"),
      v.literal("weekly"),
      v.literal("manual"),
      v.literal("seed"),
    ),
    documentId: v.union(v.id("documents"), v.null()),
    status: v.union(v.literal("running"), v.literal("done"), v.literal("failed")),
    pairsChecked: v.number(),
    findingsNew: v.number(),
    startedAt: v.number(),
    finishedAt: v.union(v.number(), v.null()),
    error: v.union(v.string(), v.null()),
  }).index("by_startedAt", ["startedAt"]),

  // ---- Proposed revisions (CONTEXT.md; ADR 0003: AI prepares, humans publish)
  proposedRevisions: defineTable({
    documentId: v.id("documents"),
    // The Published version the proposal starts from.
    baseVersion: v.number(),
    // The draft version created for it (null until ready).
    draftVersion: v.union(v.number(), v.null()),
    state: v.union(
      v.literal("generating"),
      v.literal("ready"),
      v.literal("failed"),
      v.literal("discarded"),
    ),
    // The signal that triggered it.
    source: v.object({
      kind: v.union(
        v.literal("finding"),
        v.literal("insight"),
        v.literal("health"),
      ),
      findingId: v.optional(v.id("findings")),
      note: v.string(),
    }),
    summary: v.string(),
    changes: v.array(
      v.object({
        before: v.string(),
        after: v.string(),
        reason: v.string(),
        chunkId: v.union(v.id("chunks"), v.null()),
      }),
    ),
    error: v.union(v.string(), v.null()),
    createdBy: v.union(v.id("users"), v.null()),
    createdAt: v.number(),
  })
    .index("by_documentId", ["documentId"])
    .index("by_state", ["state"]),

  // ---- Usage and Ask signals (Document insights, Knowledge health) -----------
  // Append-only. Written server-side; people cannot delete them.
  askEvents: defineTable({
    at: v.number(),
    scopeKind: v.union(v.literal("doc"), v.literal("asset"), v.literal("library")),
    scopeId: v.string(),
    question: v.string(),
    // False when the answer said the information is not in the library.
    answerFound: v.boolean(),
    citedDocumentIds: v.array(v.id("documents")),
    // The Document the question is "about": the scope document, else the
    // first cited one. Null when nothing was cited.
    primaryDocumentId: v.union(v.id("documents"), v.null()),
    // Checked-in person, or null when Anonymous.
    personId: v.union(v.id("people"), v.null()),
    surface: v.union(v.literal("desktop"), v.literal("floor")),
  })
    .index("by_at", ["at"])
    .index("by_primaryDocumentId", ["primaryDocumentId"]),

  usageEvents: defineTable({
    at: v.number(),
    kind: v.union(v.literal("view"), v.literal("scan")),
    documentId: v.union(v.id("documents"), v.null()),
    assetId: v.union(v.id("assets"), v.null()),
    personId: v.union(v.id("people"), v.null()),
    surface: v.union(v.literal("desktop"), v.literal("floor")),
  })
    .index("by_at", ["at"])
    .index("by_documentId", ["documentId"])
    .index("by_assetId", ["assetId"]),

  // "Unclear or wrong" marks on content, e.g. from a Training question.
  contentFlags: defineTable({
    documentId: v.id("documents"),
    version: v.number(),
    chunkId: v.union(v.id("chunks"), v.null()),
    source: v.union(v.literal("attempt"), v.literal("ask"), v.literal("reader")),
    attemptId: v.optional(v.union(v.id("trainingAttempts"), v.null())),
    note: v.string(),
    personId: v.union(v.id("people"), v.null()),
    at: v.number(),
  }).index("by_documentId", ["documentId"]),

  // AI summary of a Document's insights: themes in what people ask and where
  // it seems unclear. Informs the next revision, not the current one.
  insightReports: defineTable({
    documentId: v.id("documents"),
    version: v.number(),
    state: v.union(v.literal("generating"), v.literal("ready"), v.literal("failed")),
    questionCount: v.number(),
    unansweredCount: v.number(),
    flagCount: v.number(),
    themes: v.array(
      v.object({
        title: v.string(),
        detail: v.string(),
        severity: v.union(v.literal("info"), v.literal("unclear"), v.literal("gap")),
        examples: v.array(v.string()),
      }),
    ),
    generatedAt: v.union(v.number(), v.null()),
    error: v.union(v.string(), v.null()),
  }).index("by_documentId", ["documentId"]),

  // ---- Learn: Trainings (ADR 0002: Trainings controlled, Attempts generated) -
  trainings: defineTable({
    // Immutable code, e.g. EXT-TRN-0001.
    code: v.string(),
    title: v.string(),
    // "course" is done at a desk or on the phone; "round" is walked in the
    // plant, Asset by Asset (CONTEXT.md: Round).
    kind: v.union(v.literal("course"), v.literal("round")),
    status: v.union(
      v.literal("draft"),
      v.literal("in_review"),
      v.literal("approved"),
      v.literal("published"),
      v.literal("archived"),
    ),
    currentVersion: v.number(),
    liveVersion: v.union(v.number(), v.null()),
    // Set when a source Document got a Significant change: the Training must
    // be reviewed again. Its live version keeps counting until then.
    needsReview: v.boolean(),
    needsReviewReason: v.union(v.string(), v.null()),
    area: v.union(v.string(), v.null()),
    createdBy: v.union(v.id("users"), v.null()),
    updatedAt: v.number(),
  })
    .index("by_code", ["code"])
    .index("by_status", ["status"]),

  trainingVersions: defineTable({
    trainingId: v.id("trainings"),
    version: v.number(),
    purpose: v.string(),
    objectives: v.array(
      v.object({
        id: v.string(),
        text: v.string(),
        // Every objective is traceable to a Published Document passage.
        documentId: v.id("documents"),
        namingCode: v.string(),
        documentVersion: v.number(),
        chunkId: v.union(v.id("chunks"), v.null()),
        quote: v.string(),
      }),
    ),
    // Rounds only: the Assets to visit, in order, and what is tested there.
    stops: v.array(
      v.object({
        assetId: v.id("assets"),
        objectiveIds: v.array(v.string()),
        hint: v.string(),
        // Ask for a photo or a voice note at this stop.
        evidence: v.union(v.literal("none"), v.literal("photo"), v.literal("note")),
      }),
    ),
    passMark: v.number(),
    questionsPerObjective: v.number(),
    signoffs: v.array(
      v.object({
        role: v.union(v.literal("author"), v.literal("reviewer"), v.literal("approver")),
        personId: v.union(v.id("people"), v.null()),
        userId: v.union(v.id("users"), v.null()),
        at: v.number(),
      }),
    ),
    publishedAt: v.union(v.number(), v.null()),
  }).index("by_trainingId_and_version", ["trainingId", "version"]),

  trainingAttempts: defineTable({
    trainingId: v.id("trainings"),
    trainingVersion: v.number(),
    personId: v.id("people"),
    status: v.union(
      v.literal("generating"),
      v.literal("in_progress"),
      v.literal("passed"),
      v.literal("failed"),
      v.literal("abandoned"),
      v.literal("error"),
    ),
    questions: v.array(
      v.object({
        id: v.string(),
        objectiveId: v.string(),
        stopIndex: v.union(v.number(), v.null()),
        prompt: v.string(),
        options: v.array(v.string()),
        correctIndex: v.number(),
        explanation: v.string(),
        citation: v.object({
          documentId: v.id("documents"),
          namingCode: v.string(),
          version: v.number(),
          chunkId: v.union(v.id("chunks"), v.null()),
          quote: v.string(),
        }),
        answerIndex: v.union(v.number(), v.null()),
        answeredAt: v.union(v.number(), v.null()),
        flag: v.union(v.string(), v.null()),
      }),
    ),
    // Rounds: walking progress through the stops.
    round: v.union(
      v.null(),
      v.object({
        currentStop: v.number(),
        visited: v.array(v.id("assets")),
        wrongScans: v.number(),
        evidence: v.array(
          v.object({
            stopIndex: v.number(),
            kind: v.union(v.literal("photo"), v.literal("note")),
            text: v.union(v.string(), v.null()),
            storageId: v.union(v.id("_storage"), v.null()),
            at: v.number(),
          }),
        ),
      }),
    ),
    score: v.union(v.number(), v.null()),
    startedAt: v.number(),
    finishedAt: v.union(v.number(), v.null()),
    error: v.union(v.string(), v.null()),
  })
    .index("by_personId", ["personId"])
    .index("by_trainingId", ["trainingId"]),

  // Proof that a named person passed (CONTEXT.md: Training record).
  trainingRecords: defineTable({
    personId: v.id("people"),
    trainingId: v.id("trainings"),
    trainingVersion: v.number(),
    attemptId: v.id("trainingAttempts"),
    trainingCode: v.string(),
    trainingTitle: v.string(),
    score: v.number(),
    passedAt: v.number(),
  })
    .index("by_personId", ["personId"])
    .index("by_trainingId", ["trainingId"]),

  // ---- Learn: Skills ------------------------------------------------------------
  skills: defineTable({
    name: v.string(),
    description: v.string(),
    area: v.union(v.string(), v.null()),
    documentIds: v.array(v.id("documents")),
    trainingIds: v.array(v.id("trainings")),
    // Months a level stays valid; null = does not expire.
    validityMonths: v.union(v.number(), v.null()),
    sortOrder: v.number(),
  }),

  skillLevels: defineTable({
    personId: v.id("people"),
    skillId: v.id("skills"),
    // 0 not trained, 1 trained, 2 qualified, 3 can train others.
    level: v.number(),
    source: v.union(v.literal("training"), v.literal("signoff"), v.literal("seed")),
    recordId: v.union(v.id("trainingRecords"), v.null()),
    signedOffBy: v.union(v.id("people"), v.null()),
    achievedAt: v.number(),
    expiresAt: v.union(v.number(), v.null()),
    retrainNeeded: v.boolean(),
    retrainReason: v.union(v.string(), v.null()),
  })
    .index("by_personId", ["personId"])
    .index("by_skillId", ["skillId"])
    .index("by_personId_and_skillId", ["personId", "skillId"]),

  // Audit trail of every level change.
  skillEvents: defineTable({
    personId: v.id("people"),
    skillId: v.id("skills"),
    fromLevel: v.number(),
    toLevel: v.number(),
    reason: v.string(),
    byPersonId: v.union(v.id("people"), v.null()),
    at: v.number(),
  }).index("by_personId", ["personId"]),

  skillProfiles: defineTable({
    name: v.string(),
    description: v.string(),
    targets: v.array(v.object({ skillId: v.id("skills"), level: v.number() })),
    sortOrder: v.number(),
  }),


  qaMessages: defineTable({
    sessionId: v.id("qaSessions"),
    role: v.union(v.literal("user"), v.literal("assistant")),
    text: v.string(),
    citations: v.union(
      v.array(
        v.object({
          documentId: v.id("documents"),
          documentTitle: v.string(),
          chunkId: v.id("chunks"),
          pageOrSection: v.union(v.string(), v.null()),
          excerpt: v.string(),
          origin: v.union(
            v.literal("asset-link"),
            v.literal("cross-link"),
            v.literal("log"),
          ),
        }),
      ),
      v.null(),
    ),
  }).index("by_sessionId", ["sessionId"]),
})
