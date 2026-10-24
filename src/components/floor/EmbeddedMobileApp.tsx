import { useEffect } from "react"
import { Router, useLocation } from "wouter"
import type { memoryLocation } from "wouter/memory-location"
import { MobileShell } from "@/components/mobile/MobileShell"
import { MobileRoutes } from "@/components/mobile/MobileRoutes"
import { FloorBridgeContext, type FloorBridge } from "@/components/mobile/floorBridge"

/**
 * The real mobile app, inline: same components, same Convex client and the
 * same check-in, on an in-memory location so the desktop page keeps its URL.
 */
export function EmbeddedMobileApp({
  location,
  bridge,
  onLocation,
}: {
  location: Pick<ReturnType<typeof memoryLocation>, "hook" | "searchHook">
  bridge: FloorBridge
  /** Called with the phone's path whenever it changes. */
  onLocation?: (path: string) => void
}) {
  return (
    <FloorBridgeContext.Provider value={bridge}>
      <Router hook={location.hook} searchHook={location.searchHook}>
        {onLocation && <LocationSpy onLocation={onLocation} />}
        <MobileShell embedded>
          <MobileRoutes />
        </MobileShell>
      </Router>
    </FloorBridgeContext.Provider>
  )
}

function LocationSpy({ onLocation }: { onLocation: (path: string) => void }) {
  const [path] = useLocation()
  useEffect(() => onLocation(path), [path, onLocation])
  return null
}
