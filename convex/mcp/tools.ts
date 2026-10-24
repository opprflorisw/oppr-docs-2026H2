// The MCP tool catalogue (docs/adr/0004). The ONE list of tools: the endpoint
// (convex/mcp/server.ts) serves it on tools/list and dispatches tools/call by
// these names, and the MCP page reads it through convex/mcp/info.ts.
//
// Descriptions are written for an outside LLM: when to use the tool and what
// it returns. Input schemas are strict JSON Schema (validated in validate.ts
// before a handler runs). No tool can publish, approve, sign off or delete.
import type { Scope } from "./keys"
import type { JsonSchema } from "./validate"

export const SERVER_NAME = "oppr-knowledge"
export const SERVER_VERSION = "0.1.0"

export const PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"] as const
export const DEFAULT_PROTOCOL_VERSION = "2025-06-18"

export const SERVER_INSTRUCTIONS = [
  "Oppr Knowledge is the controlled knowledge base of Pijpwerk Noord, a Dutch plant that extrudes PE pressure pipe.",
  "It holds Documents (SOPs, work instructions, LMRAs and wrapped supplier manuals), each with an immutable naming code such as EXT-OPS-SOP-0001, plus Assets, Trainings and Skills.",
  "Only Published versions are the truth: every read tool returns Published content only, never drafts.",
  "Use oppr_get_structure first when you prepare outside documents, so you map them onto the plant's real areas, disciplines, document types and Assets.",
  "Use oppr_find_similar before importing, so you do not create a duplicate of something that is already Published.",
  "Drafts you create with oppr_import_draft go to human review: an Engineer reviews and publishes them in Oppr.",
  "You cannot publish, approve, sign off or delete anything.",
  "Quote naming codes verbatim and give the Oppr link when you cite a document.",
].join(" ")

export const MAX_DRAFTS_PER_HOUR = 50

export const CALLOUT_LEVELS = ["danger", "warning", "caution", "notice", "tip"] as const

/** The block format oppr_import_draft accepts, explained for the model. */
export const BLOCK_FORMAT = [
  "A draft body is an ordered array of blocks. Each block is one of:",
  '- {"kind":"heading","text":"Start-up","level":2}  (level 1, 2 or 3; use 2 for sections)',
  '- {"kind":"paragraph","text":"Plain text."}',
  '- {"kind":"steps","items":["Step one.","Step two."]}  (numbered procedure steps, one action each)',
  '- {"kind":"bullets","items":["Point one.","Point two."]}',
  '- {"kind":"warning","level":"danger","text":"Hot surface, 230 °C."}  (level: danger, warning, caution, notice or tip)',
  '- {"kind":"table","rows":[["Setting","Value"],["Barrel zone 1","190 °C"]]}  (first row is the header row)',
  '- {"kind":"ppe","items":["gloves","glasses"]}  (PPE slugs from oppr_get_structure)',
  "Text is plain: no Markdown, no HTML. Keep numbers, units and codes exactly as in the source.",
].join("\n")

export type ToolName =
  | "oppr_get_structure"
  | "oppr_search"
  | "oppr_get_document"
  | "oppr_find_similar"
  | "oppr_list_assets"
  | "oppr_skill_coverage"
  | "oppr_training_records"
  | "oppr_import_draft"
  | "oppr_report_signal"

export interface ToolDef {
  name: ToolName
  title: string
  scope: Scope
  readOnly: boolean
  description: string
  inputSchema: JsonSchema
}

const str = (description: string, maxLength = 200, minLength = 1): JsonSchema => ({
  type: "string",
  description,
  minLength,
  maxLength,
})
const areaProp: JsonSchema = {
  type: "string",
  description: "Area code, for example EXT. See oppr_get_structure for the list.",
  minLength: 2,
  maxLength: 12,
}

const blockSchema: JsonSchema = {
  oneOf: [
    {
      type: "object",
      properties: {
        kind: { const: "heading" },
        text: str("Heading text.", 200),
        level: { type: "integer", enum: [1, 2, 3] },
      },
      required: ["kind", "text", "level"],
      additionalProperties: false,
    },
    {
      type: "object",
      properties: { kind: { const: "paragraph" }, text: str("Paragraph text.", 4000) },
      required: ["kind", "text"],
      additionalProperties: false,
    },
    {
      type: "object",
      properties: {
        kind: { const: "steps" },
        items: { type: "array", items: str("One step.", 2000), minItems: 1, maxItems: 100 },
      },
      required: ["kind", "items"],
      additionalProperties: false,
    },
    {
      type: "object",
      properties: {
        kind: { const: "bullets" },
        items: { type: "array", items: str("One point.", 2000), minItems: 1, maxItems: 100 },
      },
      required: ["kind", "items"],
      additionalProperties: false,
    },
    {
      type: "object",
      properties: {
        kind: { const: "warning" },
        level: { type: "string", enum: [...CALLOUT_LEVELS] },
        text: str("The safety message.", 2000),
      },
      required: ["kind", "level", "text"],
      additionalProperties: false,
    },
    {
      type: "object",
      properties: {
        kind: { const: "table" },
        rows: {
          type: "array",
          description: "First row is the header row.",
          items: { type: "array", items: str("Cell text.", 500, 0), minItems: 1, maxItems: 12 },
          minItems: 1,
          maxItems: 100,
        },
      },
      required: ["kind", "rows"],
      additionalProperties: false,
    },
    {
      type: "object",
      properties: {
        kind: { const: "ppe" },
        items: { type: "array", items: str("PPE slug.", 40), minItems: 1, maxItems: 12 },
      },
      required: ["kind", "items"],
      additionalProperties: false,
    },
  ],
}

export const TOOLS: ToolDef[] = [
  {
    name: "oppr_get_structure",
    title: "Plant structure",
    scope: "read:published",
    readOnly: true,
    description:
      "Get the structure of the plant that every Oppr document is filed under: areas, disciplines, document types, the naming code pattern with examples, Assets (code, name, area), PPE slugs, warning levels and the block format that oppr_import_draft accepts. Call this first when you prepare or classify outside documents, and map them onto these exact codes. Returns text and the same data as structuredContent.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "oppr_search",
    title: "Search Published knowledge",
    scope: "read:published",
    readOnly: true,
    description:
      "Search the Published knowledge base for passages that answer a question or match a topic, for example 'die bolt torque line 2' or 'what to do when the vacuum drops'. Returns up to 10 passages, each with the document's naming code, title, Published version, section, the quoted passage and an Oppr link. Drafts are never searched. Use oppr_get_document to read a whole document.",
    inputSchema: {
      type: "object",
      properties: {
        query: str("What to search for, in natural language.", 500),
        area: areaProp,
        limit: { type: "integer", minimum: 1, maximum: 10, description: "How many passages. Default 5." },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "oppr_get_document",
    title: "Read a Published document",
    scope: "read:published",
    readOnly: true,
    description:
      "Read the Published version of one document by naming code, for example EXT-OPS-SOP-0001. Returns the content as readable text (headings, numbered steps, tables as rows, warnings marked) plus metadata: type, area, discipline, version, published date, next review, approver and linked Asset codes. For a wrapped supplier manual it returns the page passages and a link to the stamped PDF page. A draft that was never Published cannot be read.",
    inputSchema: {
      type: "object",
      properties: { code: str("The naming code, for example EXT-OPS-SOP-0001.", 40) },
      required: ["code"],
      additionalProperties: false,
    },
  },
  {
    name: "oppr_find_similar",
    title: "Find similar Published documents",
    scope: "read:published",
    readOnly: true,
    description:
      "Check an incoming legacy document against the Published library before importing it. Give its title and text (plain text, up to about 20,000 characters). Returns the closest Published documents with a similarity score from 0 to 1 and a verdict: 'likely the same document' (do not import, point to the existing one), 'overlaps' (import only what is new, or propose a revision to an Engineer) or 'new' (safe to import as a draft).",
    inputSchema: {
      type: "object",
      properties: {
        title: str("Title of the incoming document.", 300),
        text: str("Its text, cleaned up (OCR output is fine).", 20000),
      },
      required: ["title", "text"],
      additionalProperties: false,
    },
  },
  {
    name: "oppr_list_assets",
    title: "List Assets",
    scope: "read:published",
    readOnly: true,
    description:
      "List the plant's Assets (physical equipment with a QR code), with code, name, area and how many Published documents each has. Use it to link documents to the right equipment or to find Assets without documentation.",
    inputSchema: {
      type: "object",
      properties: { area: areaProp },
      additionalProperties: false,
    },
  },
  {
    name: "oppr_skill_coverage",
    title: "Skill coverage",
    scope: "read:people",
    readOnly: true,
    description:
      "Who is qualified for what. Give a Skill name (for example 'Lockout/tagout line 2') to see everyone who holds it, at which level (1 trained, 2 qualified, 3 can train others), grouped by shift, with expired, expiring and re-train flags. Give a Skill profile name (for example 'Line 2 operator') to see who meets every target, by shift, and who is close. With neither, returns an overview of all Skills and profiles. Contains personal data.",
    inputSchema: {
      type: "object",
      properties: {
        skill: str("Skill name or part of it.", 120),
        profile: str("Skill profile name or part of it.", 120),
      },
      additionalProperties: false,
    },
  },
  {
    name: "oppr_training_records",
    title: "Training records",
    scope: "read:people",
    readOnly: true,
    description:
      "Training records: proof that a named person passed a Training, with training code, version, date and score. Filter by a document's naming code (Trainings built on that document) and/or a person's name. Contains personal data. Returns at most 100 records, newest first.",
    inputSchema: {
      type: "object",
      properties: {
        documentCode: str("Naming code of a source document, for example EXT-OPS-SOP-0001.", 40),
        person: str("Person name or part of it.", 120),
      },
      additionalProperties: false,
    },
  },
  {
    name: "oppr_import_draft",
    title: "Import as draft",
    scope: "write:drafts",
    readOnly: false,
    description:
      "Create a new DRAFT document in Oppr from content you prepared, for example a cleaned-up legacy SOP. Call oppr_get_structure first for valid codes and oppr_find_similar to avoid duplicates. Give title, type (document type slug), area, discipline, optional Asset codes, a sourceNote saying where the original came from, and the body as blocks (see the block format in oppr_get_structure). Oppr allocates the naming code. The result is a draft only: an Engineer reviews and publishes it in Oppr. Returns the new naming code and link. At most 50 drafts per key per hour.",
    inputSchema: {
      type: "object",
      properties: {
        title: str("Document title, short and specific.", 160),
        type: str("Document type slug, for example sop or work_instruction.", 40),
        area: areaProp,
        discipline: str("Discipline code, for example OPS.", 12),
        assetCodes: {
          type: "array",
          description: "Codes of the Assets this document is about, for example EXL-201.",
          items: str("Asset code.", 40),
          maxItems: 20,
        },
        sourceNote: str(
          "Where the original came from, for example 'Legacy Word file Extruder start.docx, 2019'.",
          500,
        ),
        blocks: { type: "array", items: blockSchema, minItems: 1, maxItems: 400 },
      },
      required: ["title", "type", "area", "discipline", "sourceNote", "blocks"],
      additionalProperties: false,
    },
  },
  {
    name: "oppr_report_signal",
    title: "Report a signal",
    scope: "write:signals",
    readOnly: false,
    description:
      "Report a signal about a Published document: a step that is unclear, an incident related to it, or a suggestion. It is attached to the live Published version (and to the section, when given) and shows up in Document insights and Knowledge health, where an Engineer decides what to change. It does not change the document.",
    inputSchema: {
      type: "object",
      properties: {
        documentCode: str("Naming code of the Published document.", 40),
        kind: { type: "string", enum: ["unclear", "incident", "suggestion"] },
        note: str("What is unclear, what happened, or what you suggest. One or two sentences.", 1000),
        section: str("Section heading or 'Page N' the signal is about.", 200),
      },
      required: ["documentCode", "kind", "note"],
      additionalProperties: false,
    },
  },
]

export function toolByName(name: string): ToolDef | null {
  return TOOLS.find((t) => t.name === name) ?? null
}
