import { createContext, useContext } from "react"
import type { Id } from "../../../convex/_generated/dataModel"

// When the mobile app runs inside the Floor simulator's phone, a Scan is not
// a tap on a list: the person walks to the Asset on the floor plan first.
// The simulator provides this bridge; on a real phone it is null and the
// mobile pages scan directly.
export interface FloorBridge {
  /** Walk to the Asset on the plan, then Scan it. */
  walkTo: (assetId: Id<"assets">) => void
}

export const FloorBridgeContext = createContext<FloorBridge | null>(null)

export function useFloorBridge(): FloorBridge | null {
  return useContext(FloorBridgeContext)
}
