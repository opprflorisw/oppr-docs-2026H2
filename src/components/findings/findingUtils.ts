import type { FunctionReturnType } from "convex/server"
import type { api } from "../../../convex/_generated/api"

// Shared helpers of the Findings UI (CONTEXT.md: Finding, Consistency check).

export type FindingView = FunctionReturnType<typeof api.findings.list>[number]
export type FindingSide = FindingView["a"]
export type FindingKind = FindingView["kind"]

/** A short message a person can act on, without request ids or stack noise. */
export function errorText(err: unknown, fallback: string): string {
  // ConvexError carries its user-facing message in `data`.
  const data = (err as { data?: unknown } | null)?.data
  if (typeof data === "string" && data.trim()) return data
  const raw = err instanceof Error ? err.message : String(err)
  const uncaught = raw.match(/Uncaught (?:Error|ConvexError): (.+?)(?:\n|\s+at |$)/)
  if (uncaught) return uncaught[1]
  if (/\[Request ID|Server Error/.test(raw)) return fallback
  return raw || fallback
}

export const KIND_LABEL: Record<FindingKind, string> = {
  contradiction: "Contradiction",
  duplicate: "Duplicate",
}

export const TRIGGER_LABEL: Record<FindingView["detectedBy"], string> = {
  publish: "the check on publish",
  weekly: "the weekly check",
  manual: "a check run by hand",
  seed: "the check after setup",
}

/**
 * The start of a quote, for /docs/:id?hl= (the reader highlights the first
 * block that contains it). A table row quote is cut to its first cell, and a
 * column header the check put in front of a cell is left out.
 */
export function highlightFor(quote: string): string {
  const cells = quote.split(" | ")
  let first = cells[0]
  if (cells.length > 1) first = first.replace(/^[^:|]{1,40}:\s+/, "")
  return first.trim().slice(0, 80)
}

export function passageHref(side: { documentId: string; quote: string; section?: string | null }): string {
  // A supplier manual's passage sits on a PDF page: open the reader there.
  const page = /^Page (\d+)$/.exec(side.section ?? "")?.[1]
  return `/docs/${side.documentId}?${page ? `page=${page}&` : ""}hl=${encodeURIComponent(highlightFor(side.quote))}`
}

export function findingHref(id: string): string {
  return `/library/findings?f=${id}`
}

const DAY = 24 * 60 * 60 * 1000

/** "today", "yesterday", "3 days ago", else a date. */
export function whenText(at: number): string {
  const days = Math.floor((startOfDay(Date.now()) - startOfDay(at)) / DAY)
  if (days <= 0) return `today at ${new Date(at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`
  if (days === 1) return "yesterday"
  if (days < 7) return `${days} days ago`
  return new Date(at).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })
}

function startOfDay(at: number) {
  const d = new Date(at)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}
