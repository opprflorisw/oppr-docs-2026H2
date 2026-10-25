import { useEffect, useRef, useState } from "react"
import { useAction, useMutation } from "convex/react"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import type { FunctionReturnType } from "convex/server"
import { useCheckIn } from "@/lib/checkIn"
import { uploadBlob } from "./uploadImage"

export type ImageHit = FunctionReturnType<typeof api.imageSearch.search>[number]

/**
 * Debounced library search by words and/or a photo (convex/imageSearch.ts).
 * `active` is false when there is neither text nor a photo; then `hits` is
 * empty and the caller shows its normal view.
 */
export function useImageSearch(opts: {
  limit?: number
  areaCodes?: string[]
  assetIds?: Id<"assets">[]
} = {}) {
  const search = useAction(api.imageSearch.search)
  const personId = useCheckIn().person?._id
  const generateUploadUrl = useMutation(api.files.generateUploadUrl)
  const [text, setText] = useState("")
  const [photo, setPhoto] = useState<{ storageId: Id<"_storage">; previewUrl: string } | null>(null)
  const [hits, setHits] = useState<ImageHit[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const seq = useRef(0)
  const { limit = 24, areaCodes, assetIds } = opts
  const contextKey = JSON.stringify([areaCodes ?? [], assetIds ?? []])

  const query = text.trim()
  const active = query.length > 1 || photo !== null

  useEffect(() => {
    if (!active) {
      setHits([])
      setLoading(false)
      return
    }
    const my = ++seq.current
    setLoading(true)
    const t = window.setTimeout(
      () => {
        const [areas, assets] = JSON.parse(contextKey) as [string[], Id<"assets">[]]
        search({
          ...(query ? { query } : {}),
          ...(photo ? { storageId: photo.storageId } : {}),
          limit,
          ...(areas.length ? { areaCodes: areas } : {}),
          ...(assets.length ? { assetIds: assets } : {}),
          ...(personId ? { personId } : {}),
        })
          .then((r) => {
            if (seq.current !== my) return
            setHits(r)
            setError(null)
          })
          .catch((e: unknown) => {
            if (seq.current !== my) return
            setError(e instanceof Error ? e.message : "Search failed")
          })
          .finally(() => {
            if (seq.current === my) setLoading(false)
          })
      },
      photo && !query ? 0 : 350,
    )
    return () => window.clearTimeout(t)
  }, [active, query, photo, limit, contextKey, search, personId])

  async function searchByPhoto(file: File) {
    if (!file.type.startsWith("image/")) throw new Error("That file is not an image.")
    setLoading(true)
    const storageId = await uploadBlob(generateUploadUrl, file)
    setPhoto((prev) => {
      if (prev) URL.revokeObjectURL(prev.previewUrl)
      return { storageId, previewUrl: URL.createObjectURL(file) }
    })
  }

  function clearPhoto() {
    setPhoto((prev) => {
      if (prev) URL.revokeObjectURL(prev.previewUrl)
      return null
    })
  }

  function clear() {
    setText("")
    clearPhoto()
  }

  return { text, setText, photo, searchByPhoto, clearPhoto, clear, hits, loading, error, active }
}

// Below this a vector match is a guess, not a reason worth showing.
const STRONG_MATCH = 0.5
const STOP = new Set(
  "the and for with from into that this its are was not but you your use when then after before last first next minute work make sure start starting check keep set".split(" "),
)
const tokens = (s: string) => s.toLowerCase().split(/[^a-z0-9À-ɏ-]+/).filter((w) => w.length > 2)

/**
 * Why a hit is shown, in words a person can check: the caption or tags share
 * words with the search, the picture looks like the photo, or it is close in
 * meaning. Null for weak matches, so a badge never vouches for a guess.
 */
export function matchReason(
  hit: { altText: string; description?: string | null; tags?: string[]; matchedBy?: ImageHit["matchedBy"]; score?: number },
  opts: { query?: string; byPhoto?: boolean },
): { label: string; title: string } | null {
  const hay = new Set(tokens(`${hit.altText} ${hit.description ?? ""} ${(hit.tags ?? []).join(" ")}`))
  const words = Array.from(new Set(tokens(opts.query ?? "").filter((w) => !STOP.has(w))))
  // Whole words; longer words also match their plural or longer form (screen, screens).
  const shared = words.filter((w) => hay.has(w) || (w.length >= 4 && [...hay].some((h) => h.startsWith(w))))
  // A long step sentence shares a couple of words with almost anything.
  const needed = words.length <= 2 ? 1 : Math.max(2, Math.ceil(words.length / 4))
  if (shared.length > 0 && shared.length >= needed) {
    return { label: `Mentions ${shared.slice(0, 2).join(", ")}`, title: `Its caption, description or tags mention: ${shared.slice(0, 5).join(", ")}` }
  }
  const strong = (hit.score ?? 0) >= STRONG_MATCH
  if (!strong || !hit.matchedBy || hit.matchedBy === "text") return null
  if (opts.byPhoto && hit.matchedBy === "image") return { label: "Looks alike", title: "The picture looks like your photo" }
  return {
    label: "Close in meaning",
    title: hit.matchedBy === "caption" ? "Its description is close to your words" : "What the picture shows is close to your words",
  }
}
