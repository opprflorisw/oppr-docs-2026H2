import { Doc, Id } from "../_generated/dataModel"
import { QueryCtx } from "../_generated/server"
import { isPublished } from "./published"

// A Scope (CONTEXT.md) is the boundary of Knowledge something draws from: any
// combination of areas, disciplines, Assets and Documents. A Document is in
// scope when it is Published AND any of these holds:
//   - it is listed explicitly,
//   - it is linked to a listed Asset,
//   - it matches the area/discipline filter (an empty dimension means "any",
//     but at least one of the two must be set for the filter to apply).
// An empty Scope contains nothing. It never means "the whole library".

export interface Scope {
  areas: string[]
  disciplines: string[]
  assetIds: Id<"assets">[]
  documentIds: Id<"documents">[]
}

export function scopeIsEmpty(scope: Scope): boolean {
  return (
    scope.areas.length === 0 &&
    scope.disciplines.length === 0 &&
    scope.assetIds.length === 0 &&
    scope.documentIds.length === 0
  )
}

interface ScopeMatch {
  /** Published documents in scope, sorted by naming code. */
  published: Doc<"documents">[]
  /** Documents that would match but are not Published (drafts, archived). */
  excluded: Doc<"documents">[]
}

export async function resolveScope(
  ctx: QueryCtx,
  scope: Scope,
): Promise<ScopeMatch> {
  if (scopeIsEmpty(scope)) return { published: [], excluded: [] }

  const explicit = new Set(scope.documentIds.map(String))
  const viaAsset = new Set<string>()
  for (const assetId of scope.assetIds) {
    const links = await ctx.db
      .query("documentAssets")
      .withIndex("by_assetId", (q) => q.eq("assetId", assetId))
      .take(500)
    for (const l of links) viaAsset.add(String(l.documentId))
  }
  const filterActive = scope.areas.length > 0 || scope.disciplines.length > 0

  const all = await ctx.db.query("documents").take(2000)
  const published: Doc<"documents">[] = []
  const excluded: Doc<"documents">[] = []
  for (const d of all) {
    if (d.status === "pre_draft") continue
    const byFilter =
      filterActive &&
      (scope.areas.length === 0 || scope.areas.includes(d.location ?? "")) &&
      (scope.disciplines.length === 0 ||
        scope.disciplines.includes(d.discipline ?? ""))
    const inScope =
      explicit.has(String(d._id)) || viaAsset.has(String(d._id)) || byFilter
    if (!inScope) continue
    if (isPublished(d)) published.push(d)
    else excluded.push(d)
  }
  const byCode = (a: Doc<"documents">, b: Doc<"documents">) =>
    a.namingCode.localeCompare(b.namingCode)
  return { published: published.sort(byCode), excluded: excluded.sort(byCode) }
}
