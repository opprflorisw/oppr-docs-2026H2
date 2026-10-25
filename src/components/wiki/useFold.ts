import { useCallback, useEffect, useRef, useState } from "react"
import type { WikiContentView, WikiSectionView } from "./wikiShared"

// Fold state of a Wiki's sections and folded blocks, per viewer (spec 4.3).
// Stored in localStorage under wiki:<wikiId>:fold:<id>; every read and write
// is in try/catch, so the page folds correctly (from the defaults) without it.

const keyOf = (wikiId: string, id: string) => `wiki:${wikiId}:fold:${id}`

function readStored(wikiId: string, id: string): boolean | null {
  try {
    const v = window.localStorage.getItem(keyOf(wikiId, id))
    return v === "open" ? true : v === "closed" ? false : null
  } catch {
    return null
  }
}

function writeStored(wikiId: string, id: string, open: boolean) {
  try {
    window.localStorage.setItem(keyOf(wikiId, id), open ? "open" : "closed")
  } catch {
    // Storage blocked: the fold still works for this visit.
  }
}

/** Over this reading time, sections after the first two start closed. */
const LONG_READ_MINUTES = 8

/**
 * Default fold per section: intro and safety sections open; the first two
 * other sections open; the rest open unless the read is over 8 minutes. An
 * Engineer's "Closed by default" overrides, except on a safety section.
 */
export function foldDefaults(content: WikiContentView | null | undefined, minutes: number): Record<string, boolean> {
  const out: Record<string, boolean> = {}
  let other = 0
  for (const s of content?.sections ?? []) {
    if (s.role === "intro" || s.safety) {
      out[s.id] = true
      continue
    }
    other += 1
    if (s.fold === "closed") out[s.id] = false
    else out[s.id] = other <= 2 || minutes <= LONG_READ_MINUTES
  }
  return out
}

export interface Fold {
  /** Is this section or folded block open? `dflt` is its default when the viewer never toggled it. */
  isOpen: (id: string, dflt: boolean) => boolean
  toggle: (id: string, dflt: boolean) => void
  /** Opens one section (hash links, trust line jumps); not counted as a toggle. */
  open: (id: string) => void
  setAll: (ids: string[], open: boolean) => void
  /** Manual toggles this visit, for the read measures. */
  toggles: () => number
}

/**
 * `slugs` maps section ids to their #anchors: a #slug in the address opens
 * that section and scrolls to it, on load and on every hash change.
 * `forceOpen` (edit mode, print) shows everything without changing the stored state.
 */
export function useFold(wikiId: string, slugs: Record<string, string>, forceOpen = false): Fold {
  const [state, setState] = useState<Record<string, boolean>>({})
  const toggleCount = useRef(0)

  const isOpen = useCallback(
    (id: string, dflt: boolean) => {
      if (forceOpen) return true
      if (id in state) return state[id]
      return readStored(wikiId, id) ?? dflt
    },
    [state, wikiId, forceOpen],
  )

  const set = useCallback(
    (id: string, open: boolean) => {
      writeStored(wikiId, id, open)
      setState((s) => ({ ...s, [id]: open }))
    },
    [wikiId],
  )

  const toggle = useCallback(
    (id: string, dflt: boolean) => {
      toggleCount.current += 1
      set(id, !isOpen(id, dflt))
    },
    [isOpen, set],
  )

  const open = useCallback((id: string) => set(id, true), [set])

  const setAll = useCallback(
    (ids: string[], value: boolean) => {
      toggleCount.current += 1
      for (const id of ids) writeStored(wikiId, id, value)
      setState((s) => ({ ...s, ...Object.fromEntries(ids.map((id) => [id, value])) }))
    },
    [wikiId],
  )

  // #slug links open their section, then scroll to it once it is laid out.
  const slugKey = Object.entries(slugs)
    .map(([id, s]) => `${id}=${s}`)
    .join("|")
  useEffect(() => {
    const onHash = () => {
      const hash = decodeURIComponent(window.location.hash.slice(1))
      if (!hash) return
      const id = Object.keys(slugs).find((k) => slugs[k] === hash)
      if (id) set(id, true)
      window.requestAnimationFrame(() => document.getElementById(hash)?.scrollIntoView({ block: "start" }))
    }
    onHash()
    window.addEventListener("hashchange", onHash)
    return () => window.removeEventListener("hashchange", onHash)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slugKey, set])

  return { isOpen, toggle, open, setAll, toggles: () => toggleCount.current }
}

/** Ids of the sections that fold (every body section). */
export function foldableIds(sections: WikiSectionView[]): string[] {
  return sections.filter((s) => s.role !== "intro").map((s) => s.id)
}
