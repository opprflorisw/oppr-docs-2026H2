import { useLocation } from "wouter"
import { MessageSquareText } from "lucide-react"
import { Button } from "@/components/ui/button"
import { AskIdaSheet } from "./AskIdaSheet"
import type { AskPanelScope } from "./AskPanel"

// Floating Q&A button. One per desktop shell. Resolves scope from the
// current route. Returns null on routes where IDA isn't useful (Settings,
// Analysis, document drafting). Print mode hides via the print:hidden class.

function scopeForLocation(loc: string): AskPanelScope | null {
  if (loc === "/settings") return null
  if (loc.startsWith("/analysis")) return null
  if (loc.startsWith("/docs/new")) return null
  if (loc.startsWith("/import")) return null
  // The Floor simulator has its own Ask inside the phone.
  if (loc.startsWith("/floor")) return null
  // Doing an Attempt: no help from Ask during the test.
  if (loc.startsWith("/learn/attempts")) return null
  if (/^\/docs\/[^/]+\/edit$/.test(loc)) return null

  const docMatch = loc.match(/^\/docs\/([^/]+)$/)
  if (docMatch) return { kind: "doc", id: docMatch[1] }

  const assetMatch = loc.match(/^\/assets\/([^/]+)$/)
  if (assetMatch) return { kind: "asset", id: assetMatch[1] }

  return { kind: "library" }
}

export function FloatingAskIda() {
  const [location] = useLocation()
  const scope = scopeForLocation(location)
  if (!scope) return null

  return (
    <AskIdaSheet
      scope={scope}
      trigger={
        <Button
          size="icon"
          aria-label="Ask"
          className="fixed bottom-6 right-6 z-40 h-12 w-12 rounded-full shadow-lg print:hidden"
        >
          <MessageSquareText className="h-5 w-5" />
        </Button>
      }
    />
  )
}
