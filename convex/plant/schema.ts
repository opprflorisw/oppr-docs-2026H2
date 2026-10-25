// Tables owned by the plant module. Spread into convex/schema.ts.
//
// The Plant ontology for Knowledge (docs/adr/0006): the organization's
// background, its structure (site > area > line > Asset), processes,
// products, materials, hazards, roles, teams and the glossary. Areas are the
// naming locations (namingLocations, one source); plantAreas only adds a
// description and a site per area code.
import { defineTable } from "convex/server"
import { v } from "convex/values"

export const plantItemKind = v.union(
  v.literal("site"),
  v.literal("line"),
  v.literal("process"),
  v.literal("product"),
  v.literal("material"),
  v.literal("hazard"),
  v.literal("role"),
  v.literal("team"),
  v.literal("term"),
)

/** Typed relations between Plant items. Read "from <type> to". */
export const plantRelationType = v.union(
  v.literal("part_of"),
  v.literal("produces"),
  v.literal("uses"),
  v.literal("runs_on"),
  v.literal("has_hazard"),
  v.literal("done_by"),
  v.literal("feeds"),
  v.literal("related_to"),
)

export const plantLinks = v.object({
  documentIds: v.array(v.id("documents")),
  assetIds: v.array(v.id("assets")),
  trainingIds: v.array(v.id("trainings")),
  skillIds: v.array(v.id("skills")),
})

export const plantTables = {
  // One row: who the organization is. The company name and logo live in
  // coverSettings (single source) and are not repeated here.
  plantProfile: defineTable({
    about: v.string(),
    history: v.string(),
    productsAndCustomers: v.string(),
    qualityPolicy: v.string(),
    certifications: v.array(v.string()),
    headcount: v.union(v.number(), v.null()),
    keyFacts: v.array(v.object({ label: v.string(), value: v.string() })),
    updatedAt: v.number(),
    updatedByPersonId: v.union(v.id("people"), v.null()),
  }),

  // Extra facts per area. The area itself is a namingLocations row.
  plantAreas: defineTable({
    areaCode: v.string(),
    description: v.string(),
    siteId: v.union(v.id("plantItems"), v.null()),
  }).index("by_areaCode", ["areaCode"]),

  plantItems: defineTable({
    kind: plantItemKind,
    name: v.string(),
    code: v.union(v.string(), v.null()),
    description: v.string(),
    // The area (namingLocations.code) the item belongs to, if any.
    areaCode: v.union(v.string(), v.null()),
    // Glossary: abbreviations and other words for the same thing (incl. Dutch).
    synonyms: v.array(v.string()),
    links: plantLinks,
    source: v.union(v.literal("manual"), v.literal("seed"), v.literal("ai")),
    sortOrder: v.number(),
    updatedAt: v.number(),
  })
    .index("by_kind", ["kind", "sortOrder"])
    .index("by_areaCode", ["areaCode"]),

  plantRelations: defineTable({
    fromId: v.id("plantItems"),
    toId: v.id("plantItems"),
    type: plantRelationType,
  })
    .index("by_from", ["fromId"])
    .index("by_to", ["toId"]),

  // AI proposals from Published documents. Pending until an Engineer accepts
  // (creates a plantItems row) or rejects it. The AI never adds items itself.
  plantProposals: defineTable({
    kind: plantItemKind,
    name: v.string(),
    description: v.string(),
    areaCode: v.union(v.string(), v.null()),
    synonyms: v.array(v.string()),
    reason: v.string(),
    sourceDocumentIds: v.array(v.id("documents")),
    status: v.union(v.literal("pending"), v.literal("accepted"), v.literal("rejected")),
    createdAt: v.number(),
    decidedAt: v.union(v.number(), v.null()),
    decidedByPersonId: v.union(v.id("people"), v.null()),
    itemId: v.union(v.id("plantItems"), v.null()),
  }).index("by_status", ["status", "createdAt"]),
}
