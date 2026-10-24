import { useCallback, useEffect, useMemo, useRef, useState } from "react"

// The phone app's own history (plan: "Back follows history"). Every /m
// navigation is pushed; the header Back pops it, and falls back to a static
// parent only on a deep link. Works for the real browser (/m) and for the
// in-memory router of the phone preview and the Floor simulator, which have
// no browser history to go back in.

/** Root tabs: no Back, and opening one starts a fresh stack. */
export const ROOT_PATHS = ["/m", "/m/find", "/m/capture", "/m/ask", "/m/me"] as const

export function isRootPath(path: string): boolean {
  const p = path.split("?")[0]
  return (ROOT_PATHS as readonly string[]).includes(p)
}

export type NavDirection = "push" | "pop" | "none"

export interface NavStack {
  /** Every entry, oldest first. The last one is the current page. */
  entries: string[]
  /** How the current page was reached, for the enter animation. */
  direction: NavDirection
  canGoBack: boolean
  /** Go back one entry. Returns false when there is nothing to go back to. */
  back: () => boolean
  /** Remembered scroll position of a path, for restoring it on Back. */
  scrollFor: (path: string) => number | undefined
  rememberScroll: (path: string, top: number) => void
}

const LIMIT = 50

/**
 * Tracks the location (path plus search) and keeps a stack. A location equal
 * to the entry below the top counts as Back (browser Back, the phone preview's
 * Back button and our own header Back all land here).
 */
export function useNavStack(
  location: string,
  navigate: (to: string, opts?: { replace?: boolean }) => void,
): NavStack {
  const stackRef = useRef<string[]>([location])
  const [entries, setEntries] = useState<string[]>(stackRef.current)
  const [direction, setDirection] = useState<NavDirection>("none")
  const scroll = useRef(new Map<string, number>())

  useEffect(() => {
    const s = stackRef.current
    const top = s[s.length - 1]
    if (top === location) return
    let next: string[]
    let dir: NavDirection
    if (s.length >= 2 && s[s.length - 2] === location) {
      next = s.slice(0, -1)
      dir = "pop"
    } else if (isRootPath(location)) {
      next = [location]
      dir = top && isRootPath(top) ? "none" : "pop"
      // A fresh tab starts at the top.
      scroll.current.delete(location)
    } else if (top && top.split("?")[0] === location.split("?")[0]) {
      // Same page, other filter (a tab inside the page): replace, no animation.
      next = [...s.slice(0, -1), location]
      dir = "none"
    } else {
      next = [...s, location].slice(-LIMIT)
      dir = "push"
      scroll.current.delete(location)
    }
    stackRef.current = next
    setEntries(next)
    setDirection(dir)
  }, [location])

  const back = useCallback(() => {
    const s = stackRef.current
    if (s.length < 2) return false
    // Replace, not history.back(): a page that navigated with replace (Ask,
    // a filter) would otherwise make the browser skip past our entry.
    navigate(s[s.length - 2], { replace: true })
    return true
  }, [navigate])

  const scrollFor = useCallback((path: string) => scroll.current.get(path), [])
  const rememberScroll = useCallback((path: string, top: number) => {
    scroll.current.set(path, top)
  }, [])

  return useMemo(
    () => ({
      entries,
      direction,
      canGoBack: entries.length >= 2,
      back,
      scrollFor,
      rememberScroll,
    }),
    [entries, direction, back, scrollFor, rememberScroll],
  )
}
