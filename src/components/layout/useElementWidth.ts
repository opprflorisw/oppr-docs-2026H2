import { useEffect, useState, type RefObject } from "react"

/**
 * The content width of an element, kept up to date. Pages use it to lay out
 * by the width they actually get (the Ask panel and a docked phone take
 * some), not by the screen width.
 */
export function useElementWidth(ref: RefObject<HTMLElement | null>, fallback = 1200): number {
  const [w, setW] = useState(fallback)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new ResizeObserver(([e]) => setW(e.contentRect.width))
    obs.observe(el)
    return () => obs.disconnect()
  })
  return w
}
