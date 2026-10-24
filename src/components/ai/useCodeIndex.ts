// Build a lookup of every doc naming code, asset code, and log code in the
// database. The Markdown renderer uses this to auto-link bare codes that
// appear in the assistant's prose ("Inspect HOL-OPS-MAN-0001 …" or
// "RMR-101"). Codes that aren't in the DB stay plain text — we never
// fabricate links to entities that don't exist.

import { useMemo } from "react"
import { useQuery } from "convex/react"
import { api } from "../../../convex/_generated/api"

export type CodeKind = "doc" | "asset" | "log"

export interface CodeEntry {
  kind: CodeKind
  code: string
  /** Doc/asset id, OR for logs the asset id that owns them. */
  id: string
  /** Friendly label: doc title, asset name, or log name. */
  label: string
}

export type CodeIndex = Map<string, CodeEntry>

export function useCodeIndex(): CodeIndex {
  const docs = useQuery(api.documents.list, { publishedOnly: true })
  const assets = useQuery(api.assets.list)

  return useMemo(() => {
    const idx: CodeIndex = new Map()
    for (const d of docs ?? []) {
      idx.set(d.namingCode, {
        kind: "doc",
        code: d.namingCode,
        id: d._id,
        label: d.title,
      })
    }
    for (const a of assets ?? []) {
      idx.set(a.code, {
        kind: "asset",
        code: a.code,
        id: a._id,
        label: a.name,
      })
      if (a.linkedLogCode) {
        idx.set(a.linkedLogCode, {
          kind: "log",
          code: a.linkedLogCode,
          id: a._id,
          label: a.linkedLogName ?? a.linkedLogCode,
        })
      }
    }
    return idx
  }, [docs, assets])
}

/**
 * Pattern for entity codes used by the Oppr Knowledge naming convention.
 */
export const CODE_PATTERN =
  /\b[A-Z]{2,4}-[A-Z0-9]{2,5}(?:-[A-Z]{2,5}-\d{3,5})?\b/g
