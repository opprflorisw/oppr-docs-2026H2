import { useEffect, useState } from "react"
import { useLocation } from "wouter"
import { MessageSquareText } from "lucide-react"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet"
import { AskPanel, type AskPanelScope } from "./AskPanel"

// Ask, one per desktop shell. The panel resolves its scope from the current
// route. The Ask button lives in the top bar (AskTopBarButton), so it never
// covers page content, and hides on routes where Ask isn't useful (Settings,
// Analysis, document drafting, an Attempt). Ctrl+J opens it anywhere, and
// global search opens it with a question (openAsk).

const OPEN_EVENT = "oppr-open-ask"

function scopeForLocation(loc: string): AskPanelScope | null {
  if (loc === "/settings" || loc.startsWith("/settings/")) return null
  if (loc.startsWith("/mcp")) return null
  if (loc.startsWith("/analysis")) return null
  if (loc.startsWith("/docs/new")) return null
  if (loc.startsWith("/import")) return null
  if (loc.startsWith("/templates")) return null
  // The Floor simulator has its own Ask inside the phone.
  if (loc.startsWith("/floor")) return null
  // Doing an Attempt: no help from Ask during the test.
  if (loc.startsWith("/learn/attempts")) return null
  if (/^\/docs\/[^/]+\/edit$/.test(loc)) return null

  const docMatch = loc.match(/^\/docs\/([^/]+)$/)
  if (docMatch) return { kind: "doc", id: docMatch[1] }

  const assetMatch = loc.match(/^\/assets\/([^/]+)$/)
  if (assetMatch) return { kind: "asset", id: assetMatch[1] }

  // Ask this Wiki: answers only from the Wiki's sources at their cited versions.
  const wikiMatch = loc.match(/^\/wiki\/([a-z0-9]{32})$/)
  if (wikiMatch) return { kind: "wiki", id: wikiMatch[1] }

  return { kind: "library" }
}

/** True when the Ask button shows on this route. */
export function askButtonShownAt(location: string): boolean {
  return scopeForLocation(location) !== null
}

/** Opens Ask from anywhere, optionally asking `question` straight away. */
export function openAsk(question?: string) {
  window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: { question } }))
}

/** The Ask button in the top bar. Opens the panel scoped to this page. */
export function AskTopBarButton() {
  const [location] = useLocation()
  if (!askButtonShownAt(location)) return null
  return (
    <button
      type="button"
      onClick={() => openAsk()}
      aria-label="Ask (Ctrl+J)"
      aria-keyshortcuts="Control+J"
      title="Ask a question, answered from Published documents (Ctrl+J)"
      className="flex h-8 items-center gap-1.5 rounded-md border border-primary/40 bg-primary/10 px-2.5 text-xs font-medium text-primary-strong transition-colors print:hidden [@media(hover:hover)]:hover:bg-primary/15"
    >
      <MessageSquareText className="h-3.5 w-3.5" aria-hidden />
      Ask
      <kbd className="hidden rounded border border-primary/30 px-1 font-sans text-xs text-primary-strong/80 lg:inline">Ctrl J</kbd>
    </button>
  )
}

export function FloatingAskIda() {
  const [location] = useLocation()
  const routeScope = scopeForLocation(location)
  const [open, setOpen] = useState(false)
  const [question, setQuestion] = useState<string | null>(null)
  // Each opening is a fresh panel, so a new question is asked once. A
  // question from search is about everything; otherwise Ask follows the page.
  const [session, setSession] = useState(0)
  const [scope, setScope] = useState<AskPanelScope>({ kind: "library" })

  useEffect(() => {
    // Ctrl+J is blocked during an Attempt (no help during the test).
    const blocked = location.startsWith("/learn/attempts")
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "j") {
        if (blocked) return
        e.preventDefault()
        setQuestion(null)
        setScope(routeScope ?? { kind: "library" })
        setSession((s) => s + 1)
        setOpen((o) => !o)
      }
    }
    const onOpen = (e: Event) => {
      if (blocked) return
      const q = (e as CustomEvent<{ question?: string }>).detail?.question?.trim()
      setQuestion(q ? q : null)
      setScope(q ? { kind: "library" } : (routeScope ?? { kind: "library" }))
      setSession((s) => s + 1)
      setOpen(true)
    }
    window.addEventListener("keydown", onKey)
    window.addEventListener(OPEN_EVENT, onOpen)
    return () => {
      window.removeEventListener("keydown", onKey)
      window.removeEventListener(OPEN_EVENT, onOpen)
    }
    // routeScope is derived from location.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location])

  return (
    <>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="right"
          className="flex w-full flex-col gap-0 p-0 sm:max-w-md md:max-w-lg"
        >
          <SheetTitle className="sr-only">Ask</SheetTitle>
          <SheetDescription className="sr-only">
            Questions answered from Published documents, for this page or the
            whole library.
          </SheetDescription>
          <div className="min-h-0 flex-1 p-3">
            {open && (
              <AskPanel
                key={session}
                scope={scope}
                autoFocus
                initialQuestion={question}
                onInitialQuestionSent={() => setQuestion(null)}
                className="h-full border-0 shadow-none"
              />
            )}
          </div>
          <p className="border-t px-4 py-2 text-xs text-muted-foreground">
            Ctrl+J opens and closes Ask.
          </p>
        </SheetContent>
      </Sheet>
    </>
  )
}
