import { useEffect, useState } from "react"
import { useQuery } from "convex/react"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"

// A stamp normally lands within seconds; after this long the reader offers
// to try again instead of waiting forever.
const LATE_MS = 60_000

/** One version of a Wrapped manual, plus whether its stamp is late. */
export function useWrappedManual(documentId: Id<"documents"> | null, version: number | null) {
  const data = useQuery(
    api.manuals.getWrapped,
    documentId && version != null ? { documentId, version } : "skip",
  )
  const [now, setNow] = useState(() => Date.now())
  const waiting = data?.stamping ?? false
  useEffect(() => {
    if (!waiting) return
    const t = window.setInterval(() => setNow(Date.now()), 5_000)
    return () => window.clearInterval(t)
  }, [waiting])
  const late = Boolean(data && data.stamping && now - data.waitingSince > LATE_MS)
  return { data, late }
}

/**
 * Save a stored file under a readable name. Storage links live on another
 * origin, where the download attribute is ignored, so fetch it first; if that
 * fails, open it in a new tab instead.
 */
export async function downloadFile(url: string, filename: string) {
  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error(String(res.status))
    const blob = await res.blob()
    const href = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = href
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    window.setTimeout(() => URL.revokeObjectURL(href), 10_000)
  } catch {
    window.open(url, "_blank", "noopener")
  }
}
