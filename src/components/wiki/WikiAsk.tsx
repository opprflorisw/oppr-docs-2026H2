import { useEffect, useMemo, useRef, useState } from "react"
import { useAuthToken } from "@convex-dev/auth/react"
import { useMutation, useQuery } from "convex/react"
import { api } from "../../../convex/_generated/api"
import { useLocation } from "wouter"
import { ArrowUp, Loader2, Sparkles, Square, X } from "lucide-react"
import type { Id } from "../../../convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { MessageContent } from "@/components/ai/MessageContent"
import { SourcesBlock } from "@/components/ai/SourcesBlock"
import { AskConflictWarning } from "@/components/ai/AskConflictWarning"
import { ScopeChip, type AnyAskScope } from "@/components/ai/ScopeChip"
import { askSessionScope, useAskThreadKey } from "@/components/ai/AskPanel"
import { starterQuestions } from "./wikiStarters"
import { useCheckIn } from "@/lib/checkIn"
import { toLegacyCitation } from "@/lib/convex-adapters"
import { cn, isMobilePath } from "@/lib/utils"
import type { Citation } from "@/types"

// Ask this Wiki (plan, Wiki addition 2): questions answered only from the
// documents the Wiki is built from, at the versions it cites. The thread is
// saved like any other Ask thread (scope "This Wiki"), so the inline box on
// the Wiki page and the Ask sheet show the same questions.

interface Turn {
  question: string
  answer: string
  citations: Citation[]
  error?: string
}

export function WikiAsk({
  wikiId,
  wikiTitle,
  headings,
  variant = "inline",
  onScopeChange,
  className,
}: {
  wikiId: Id<"wikis">
  wikiTitle: string
  headings: string[]
  variant?: "inline" | "panel"
  /** The person picked another scope in the chip: hand over to the full Ask. */
  onScopeChange?: (scope: AnyAskScope) => void
  className?: string
}) {
  const authToken = useAuthToken()
  const { person } = useCheckIn()
  const [location, navigate] = useLocation()
  const [input, setInput] = useState("")
  // Saved turns come from the thread; the turn being asked lives here until saved.
  const [live, setLive] = useState<Turn | null>(null)
  const [pending, setPending] = useState(false)
  const who = useAskThreadKey(person?._id ?? null)
  const sessionScope = askSessionScope({ kind: "wiki", id: wikiId })
  const sessions = useQuery(api.qa.listSessions, { ...sessionScope, who })
  const sessionId = sessions?.[0]?._id ?? null
  const messages = useQuery(api.qa.listMessages, sessionId ? { sessionId } : "skip")
  const ensureSession = useMutation(api.qa.ensureSession)
  const addMessage = useMutation(api.qa.addMessage)
  const deleteMessages = useMutation(api.qa.deleteMessages)
  const saved = useMemo<Turn[]>(() => {
    const out: Turn[] = []
    for (const m of messages ?? []) {
      if (m.role === "user") out.push({ question: m.text, answer: "", citations: [] })
      else if (out.length > 0 && !out[out.length - 1].answer) {
        const last = out[out.length - 1]
        last.answer = m.text
        last.citations = (m.citations ?? []).map(toLegacyCitation)
      }
    }
    return out.filter((t) => t.answer)
  }, [messages])
  const turns = useMemo(() => (live ? [...saved, live] : saved), [saved, live])
  const abortRef = useRef<AbortController | null>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const starters = starterQuestions(headings)

  useEffect(() => () => abortRef.current?.abort(), [])
  useEffect(() => {
    if (variant === "panel") endRef.current?.scrollIntoView({ block: "end" })
  }, [turns, variant])

  async function ask(question: string) {
    const q = question.trim()
    if (!q || pending) return
    const siteUrl = import.meta.env.VITE_CONVEX_SITE_URL as string | undefined
    if (!authToken || !siteUrl) {
      setLive({ question: q, answer: "", citations: [], error: "You are not signed in." })
      return
    }
    setInput("")
    setPending(true)
    const history = turns
      .filter((t) => !t.error)
      .slice(-3)
      .flatMap((t) => [
        { role: "user" as const, text: t.question },
        { role: "assistant" as const, text: t.answer },
      ])
    setLive({ question: q, answer: "", citations: [] })
    const ac = new AbortController()
    abortRef.current = ac
    const patch = (p: Partial<Turn>) => setLive((x) => (x ? { ...x, ...p } : x))
    let answer = ""
    let finalCitations: Parameters<typeof toLegacyCitation>[0][] = []
    try {
      const res = await fetch(`${siteUrl}/ai/askStream`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({
          scope: { kind: "wiki", id: wikiId },
          question: q,
          history,
          personId: person?._id ?? null,
          surface: isMobilePath(location) ? "floor" : "desktop",
        }),
        signal: ac.signal,
      })
      if (!res.ok || !res.body) throw new Error(`Ask is not available right now (${res.status}).`)
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""
      let text = ""
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        let nl: number
        while ((nl = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, nl).trim()
          buffer = buffer.slice(nl + 1)
          if (!line) continue
          let event: { type: string; text?: string; citations?: Parameters<typeof toLegacyCitation>[0][]; message?: string }
          try {
            event = JSON.parse(line)
          } catch {
            continue
          }
          if (event.type === "delta" && event.text) {
            text += event.text
            answer = text
            patch({ answer: text })
          } else if (event.type === "done") {
            finalCitations = event.citations ?? []
            patch({ citations: finalCitations.map(toLegacyCitation) })
          } else if (event.type === "error") {
            throw new Error(event.message ?? "Ask failed.")
          }
        }
      }
      if (!text) {
        patch({ answer: "No answer came back. Try asking it another way." })
      } else {
        // Save the turn to the thread; the saved copy then replaces the live one.
        try {
          const sid = await ensureSession({ ...sessionScope, who })
          await addMessage({ sessionId: sid, role: "user", text: q, citations: null })
          await addMessage({
            sessionId: sid,
            role: "assistant",
            text: answer,
            citations: finalCitations.length
              ? finalCitations.map((c) => ({
                  documentId: c.documentId as Id<"documents">,
                  documentTitle: c.documentTitle,
                  chunkId: c.chunkId as Id<"chunks">,
                  pageOrSection: c.pageOrSection,
                  excerpt: c.excerpt,
                  origin: c.origin,
                }))
              : null,
          })
          setLive(null)
        } catch {
          // Not saved: the answer stays on screen for this visit.
        }
      }
    } catch (err) {
      if (!ac.signal.aborted) patch({ error: err instanceof Error ? err.message : String(err) })
    } finally {
      setPending(false)
      if (abortRef.current === ac) abortRef.current = null
    }
  }

  function openCitation(c: Citation) {
    const mobile = isMobilePath(location)
    const params = new URLSearchParams()
    if (!mobile) params.set("wiki", wikiId)
    const hl = c.excerpt.replace(/…$/, "").split(" | ")[0].trim().slice(0, 80)
    if (hl) params.set("hl", hl)
    navigate(`${mobile ? "/m/docs" : "/docs"}/${c.document_id}?${params.toString()}`)
  }

  const composer = (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void ask(input)
      }}
      className="rounded-xl border bg-background shadow-sm focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/15"
    >
      <Textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault()
            void ask(input)
          }
        }}
        rows={1}
        placeholder={`Ask about ${wikiTitle.charAt(0).toLowerCase()}${wikiTitle.slice(1)}`}
        aria-label="Ask this Wiki"
        className="min-h-[44px] resize-none border-0 bg-transparent px-3 pt-3 text-sm shadow-none focus-visible:ring-0"
      />
      <div className="flex items-center gap-2 px-2 pb-2">
        <ScopeChip
          scope={{ kind: "wiki", id: wikiId }}
          onChange={(next) => {
            if (next.kind === "wiki") return
            onScopeChange?.(next)
          }}
          className="min-w-0"
        />
        <span className="ml-auto" />
        {pending ? (
          <Button type="button" size="icon" variant="outline" className="h-8 w-8" aria-label="Stop" onClick={() => abortRef.current?.abort()}>
            <Square className="h-3.5 w-3.5" />
          </Button>
        ) : (
          <Button type="submit" size="icon" className="h-8 w-8" aria-label="Ask" disabled={!input.trim()}>
            <ArrowUp className="h-4 w-4" />
          </Button>
        )}
      </div>
    </form>
  )

  const thread = turns.map((t, i) => (
    <div key={i} className="space-y-2">
      <p className="text-sm font-medium">{t.question}</p>
      {t.error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {t.error}
        </p>
      ) : t.answer ? (
        <MessageContent
          text={t.answer}
          streaming={pending && i === turns.length - 1}
          citationCount={t.citations.length}
          className="text-sm"
        />
      ) : (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Reading the sources of this Wiki
        </p>
      )}
      {t.citations.length > 0 && (
        <>
          <SourcesBlock citations={t.citations} domIdPrefix={`wiki-ask-${i}`} onOpen={(c) => openCitation(c)} />
          <AskConflictWarning
            citations={t.citations.map((c) => ({ documentId: c.document_id, chunkId: c.chunk_id }))}
            text={`${t.question} ${t.answer}`}
          />
        </>
      )}
    </div>
  ))

  if (variant === "panel") {
    return (
      <div className={cn("flex h-full min-h-0 flex-col", className)}>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-1">
          {turns.length === 0 ? (
            <div className="space-y-3 pt-2">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <Sparkles className="h-4 w-4 text-primary" /> Ask this Wiki
              </p>
              <p className="text-sm text-muted-foreground">
                Answers come only from the documents this Wiki is built from, at the versions it cites.
              </p>
              <Starters starters={starters} onPick={(q) => void ask(q)} />
            </div>
          ) : (
            thread
          )}
          <div ref={endRef} />
        </div>
        <div className="pt-2">{composer}</div>
      </div>
    )
  }

  return (
    <section aria-label="Ask this Wiki" className={cn("space-y-3", className)} data-print="hide">
      {composer}
      {turns.length === 0 ? (
        <Starters starters={starters} onPick={(q) => void ask(q)} />
      ) : (
        <div className="space-y-5 rounded-xl border bg-muted/20 p-4">
          {thread}
          <div className="flex justify-end">
            <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" onClick={() => {
              setLive(null)
              if (sessionId) void deleteMessages({ sessionId })
            }} disabled={pending}>
              <X className="h-3.5 w-3.5" /> Clear
            </Button>
          </div>
        </div>
      )}
    </section>
  )
}

function Starters({ starters, onPick }: { starters: string[]; onPick: (q: string) => void }) {
  if (starters.length === 0) return null
  return (
    <div className="flex flex-wrap gap-2">
      {starters.map((q) => (
        <button
          key={q}
          type="button"
          onClick={() => onPick(q)}
          className="rounded-full border bg-background px-3 py-1.5 text-left text-xs text-muted-foreground transition-colors [@media(hover:hover)]:hover:border-primary/50 [@media(hover:hover)]:hover:text-foreground"
        >
          {q}
        </button>
      ))}
    </div>
  )
}
