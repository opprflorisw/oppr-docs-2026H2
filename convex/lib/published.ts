import { Doc } from "../_generated/dataModel"

// The one rule for "Published" (CONTEXT.md): a Document counts as Knowledge
// only when it has a live version and is not archived. Ask, Wikis and every
// later reader must serve exactly that live version and nothing else. A draft
// (never published, or the next edition being worked on) is never Knowledge.

export function isPublished(doc: Doc<"documents">): boolean {
  return doc.liveVersion != null && doc.status !== "archived"
}

/** The version readers may see, or null when the Document is not Published. */
export function publishedVersion(doc: Doc<"documents">): number | null {
  return isPublished(doc) ? (doc.liveVersion as number) : null
}
