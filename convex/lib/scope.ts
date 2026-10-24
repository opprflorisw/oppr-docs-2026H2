import { Doc, Id } from "../_generated/dataModel"
import { QueryCtx } from "../_generated/server"
import { isPublished } from "./published"

// A Scope (CONTEXT.md) is the boundary of Knowledge something draws from: any
// combination of areas, disciplines, Assets and Documents. A Document is in
// scope when it is Published AND any of these holds:
//   - it is listed explicitly,
//   - it is linked to a listed Asset,
//   - it matches the area/discipline filter (an empty dimension means "any",
//     but at least one of the two must be set for the filter to apply),
// AND it is not on the Scope's exclusion list.
// An empty Scope contains nothing. It never means "the whole library".

export interface Scope {
  areas: string[]
  disciplines: string[]
  assetIds: Id<"assets">[]
  documentIds: Id<"documents">[]
  /** Documents taken out by hand, even though a rule above matches them. */
  excludedDocumentIds?: Id<"documents">[]
}

export function scopeIsEmpty(scope: Scope): boolean {
  return (
    scope.areas.length === 0 &&
    scope.disciplines.length === 0 &&
    scope.assetIds.length === 0 &&
    scope.documentIds.length === 0
  )
}

/** Why a document is in scope, strongest reason first. */
export type ScopeReason =
  | { kind: "picked" }
  | { kind: "asset"; assetCode: string }
  | { kind: "filter"; area: string | null; discipline: string | null }

interface ScopeMatch {
  /** Published documents in scope, sorted by naming code. */
  published: Doc<"documents">[]
  /** Documents that would match but are not Published (drafts, archived). */
  excluded: Doc<"documents">[]
  /** Published documents that match but were taken out by hand. */
  removed: Doc<"documents">[]
  /** Why each matching document (by id) is in scope. */
  reasons: Map<string, ScopeReason>
}

export async function resolveScope(
  ctx: QueryCtx,
  scope: Scope,
): Promise<ScopeMatch> {
  const reasons = new Map<string, ScopeReason>()
  if (scopeIsEmpty(scope)) return { published: [], excluded: [], removed: [], reasons }

  const explicit = new Set(scope.documentIds.map(String))
  const viaAsset = new Map<string, string>()
  for (const assetId of scope.assetIds) {
    const asset = await ctx.db.get(assetId)
    const links = await ctx.db
      .query("documentAssets")
      .withIndex("by_assetId", (q) => q.eq("assetId", assetId))
      .take(500)
    for (const l of links) {
      if (!viaAsset.has(String(l.documentId))) viaAsset.set(String(l.documentId), asset?.code ?? "")
    }
  }
  const filterActive = scope.areas.length > 0 || scope.disciplines.length > 0
  const takenOut = new Set((scope.excludedDocumentIds ?? []).map(String))

  const all = await ctx.db.query("documents").take(2000)
  const published: Doc<"documents">[] = []
  const excluded: Doc<"documents">[] = []
  const removed: Doc<"documents">[] = []
  for (const d of all) {
    if (d.status === "pre_draft") continue
    const id = String(d._id)
    const byFilter =
      filterActive &&
      (scope.areas.length === 0 || scope.areas.includes(d.location ?? "")) &&
      (scope.disciplines.length === 0 ||
        scope.disciplines.includes(d.discipline ?? ""))
    const inScope = explicit.has(id) || viaAsset.has(id) || byFilter
    if (!inScope) continue
    reasons.set(
      id,
      explicit.has(id)
        ? { kind: "picked" }
        : viaAsset.has(id)
          ? { kind: "asset", assetCode: viaAsset.get(id)! }
          : {
              kind: "filter",
              area: scope.areas.length ? (d.location ?? null) : null,
              discipline: scope.disciplines.length ? (d.discipline ?? null) : null,
            },
    )
    // A document picked by name wins over the exclusion list.
    if (takenOut.has(id) && !explicit.has(id)) {
      if (isPublished(d)) removed.push(d)
      continue
    }
    if (isPublished(d)) published.push(d)
    else excluded.push(d)
  }
  const byCode = (a: Doc<"documents">, b: Doc<"documents">) =>
    a.namingCode.localeCompare(b.namingCode)
  return {
    published: published.sort(byCode),
    excluded: excluded.sort(byCode),
    removed: removed.sort(byCode),
    reasons,
  }
}
