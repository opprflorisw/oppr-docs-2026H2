// Route placeholders in tour steps resolve to a real item through the same
// list queries the app already uses. A query only runs while a running tour
// needs it. Each "first" placeholder stands for a whole route:
//   {firstDocument}      /docs/<id>        a Published Document
//   {firstDocumentEdit}  /docs/<id>/edit   a Draft (else one in review or approved)
//   {firstWiki}          /wiki/<id>
//   {firstTraining}      /learn/trainings/<id>   a startable Published one when there is one
//   {firstAsset}         /assets/<id>
// {me} is only the checked-in person's id: /learn/people/{me}.
import { useQuery } from "convex/react"
import { api } from "../../../convex/_generated/api"
import type { Tour } from "./types"

export const PLACEHOLDERS = [
  "firstDocument",
  "firstDocumentEdit",
  "firstWiki",
  "firstTraining",
  "firstAsset",
  "me",
] as const
export type Placeholder = (typeof PLACEHOLDERS)[number]

/** undefined while loading, null when there is nothing to point at. */
export type PlaceholderValues = Partial<Record<Placeholder, string | null | undefined>>

const PATTERN = /\{(\w+)\}/g

/** What a missing placeholder means, in plain words for the step card. */
export const MISSING_TEXT: Record<Placeholder, string> = {
  firstDocument: "There is no Published document yet to show here.",
  firstDocumentEdit: "There is no Document you can edit yet to show here.",
  firstWiki: "There is no Wiki yet to show here.",
  firstTraining: "There is no Training yet to show here.",
  firstAsset: "There is no Asset yet to show here.",
  me: "This step opens your own page. End the tour, check in at the top right, then take the tour again.",
}

export function placeholdersIn(route: string | undefined): Placeholder[] {
  if (!route) return []
  return [...route.matchAll(PATTERN)]
    .map((m) => m[1])
    .filter((p): p is Placeholder => (PLACEHOLDERS as readonly string[]).includes(p))
}

export function neededPlaceholders(tour: Tour | undefined): Set<Placeholder> {
  return new Set(tour?.steps.flatMap((s) => placeholdersIn(s.route)) ?? [])
}

/** Whether the person should check in before starting this tour. */
export function tourNeedsCheckIn(tour: Tour): boolean {
  return !!tour.needsCheckIn || neededPlaceholders(tour).has("me")
}

export type ResolvedRoute =
  | { kind: "none" }
  | { kind: "loading" }
  | { kind: "missing"; placeholder: Placeholder }
  | { kind: "route"; route: string }

export function resolveRoute(route: string | undefined, values: PlaceholderValues): ResolvedRoute {
  if (!route) return { kind: "none" }
  for (const p of placeholdersIn(route)) {
    const v = values[p]
    if (v === undefined) return { kind: "loading" }
    if (v === null) return { kind: "missing", placeholder: p }
  }
  // A "first" placeholder is a whole route: drop anything written before it
  // ("/assets/{firstAsset}" means the same as "{firstAsset}").
  const at = route.search(/\{first\w*\}/)
  if (at > 0) route = route.slice(at)
  return {
    kind: "route",
    route: route.replace(PATTERN, (whole, name: string) => {
      const v = values[name as Placeholder]
      return typeof v === "string" ? v : whole
    }),
  }
}

export function usePlaceholderValues(needed: Set<Placeholder>, personId: string | null): PlaceholderValues {
  const published = useQuery(api.documents.list, needed.has("firstDocument") ? { publishedOnly: true } : "skip")
  const allDocs = useQuery(api.documents.list, needed.has("firstDocumentEdit") ? {} : "skip")
  const wikis = useQuery(api.wikis.list, needed.has("firstWiki") ? {} : "skip")
  const trainings = useQuery(api.trainings.list, needed.has("firstTraining") ? {} : "skip")
  const assets = useQuery(api.assets.list, needed.has("firstAsset") ? {} : "skip")

  const first = <T>(list: T[] | undefined, pick: (items: T[]) => T | undefined, id: (t: T) => string) =>
    list === undefined ? undefined : (() => {
      const item = pick(list)
      return item ? id(item) : null
    })()

  return {
    firstDocument: first(published, (l) => l[0], (d) => `/docs/${d._id}`),
    // A Draft that has a body to edit (a Wrapped manual has none), else one
    // in review or approved. Never a Published one: its edit page sends the
    // person back to the read page, so the step would find nothing.
    firstDocumentEdit: first(
      allDocs,
      (l) => {
        const editable = l.filter(
          (d) =>
            d.origin !== "wrapped" &&
            (d.status === "draft" || d.status === "pre_draft" || d.status === "in_review" || d.status === "approved"),
        )
        return editable.find((d) => d.status === "draft" || d.status === "pre_draft") ?? editable[0]
      },
      (d) => `/docs/${d._id}/edit`,
    ),
    firstWiki: first(wikis, (l) => l[0], (w) => `/wiki/${w._id}`),
    firstTraining: first(
      trainings,
      // One the person can start: a Published Training (not a Round) without
      // a "Review after change" flag, which hides the Start button.
      (l) =>
        l.find((t) => t.status === "published" && t.kind !== "round" && !t.needsReview) ??
        l.find((t) => t.status === "published" && !t.needsReview) ??
        l.find((t) => t.status === "published") ??
        l[0],
      (t) => `/learn/trainings/${t._id}`,
    ),
    firstAsset: first(assets, (l) => l[0], (a) => `/assets/${a._id}`),
    me: personId,
  }
}
