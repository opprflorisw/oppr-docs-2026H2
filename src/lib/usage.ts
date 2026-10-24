import { useEffect } from "react"
import { useMutation } from "convex/react"
import { useLocation } from "wouter"
import { api } from "../../convex/_generated/api"
import type { Id } from "../../convex/_generated/dataModel"
import { useCheckIn } from "@/lib/checkIn"

/**
 * Records one usage event (a Document view or an Asset Scan) when the id is
 * known. Feeds Document insights and Knowledge health. Anonymous unless the
 * person is checked in. Fire and forget: a failure never bothers the reader.
 */
export function useRecordUsage(args: {
  kind: "view" | "scan"
  documentId?: Id<"documents">
  assetId?: Id<"assets">
}) {
  const record = useMutation(api.usage.record)
  const { person } = useCheckIn()
  const [location] = useLocation()
  const surface = location.startsWith("/m") ? "floor" : "desktop"
  const personId = person?._id ?? null
  const { kind, documentId, assetId } = args
  useEffect(() => {
    if (!documentId && !assetId) return
    record({ kind, documentId, assetId, personId, surface }).catch(() => {})
    // Once per open of this item (and per check-in change).
  }, [record, kind, documentId, assetId, personId, surface])
}
