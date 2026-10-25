// Reusable Q&A chat panel — wraps the AI/RAG layer with persisted sessions.
//
// The panel is the single chat surface across desktop and mobile. It owns:
//   • Scope chip header — switch between Library / Document / Asset live.
//   • Markdown-rendered messages with inline [N] citation anchors and
//     auto-linked entity codes (EXT-OPS-SOP-0001 / EXL-201).
//   • Citation pills with hover preview + "Open at this location" deep link.
//   • A "Related" rail under each assistant turn (other docs, assets, logs)
//     populated by pure DB joins from the cited document set.
//   • Per-message actions: Copy, Regenerate, Stop (during stream).
//   • Persisted sessions for every scope, including library.
//
// The askQuestion() generator is consumed with a per-stream AbortController
// so the user can cancel mid-response.

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { useLocation } from "wouter"
import { useCheckIn } from "@/lib/checkIn"
import {
  Check,
  Copy,
  History,
  Mic,
  MicOff,
  RefreshCw,
  Send,
  SquarePen,
  Square,
  Trash2,
  Type,
  X,
} from "lucide-react"
import { toast } from "sonner"
import type { Asset, AssetLog, Citation, Doc, QaMessage } from "@/types"
import { useMutation, useQuery } from "convex/react"
import { useAuthToken } from "@convex-dev/auth/react"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import {
  toLegacyCitation,
  toLegacyQaMessage,
} from "@/lib/convex-adapters"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { formatDateTime } from "@/lib/time"
import { useChatSize, useOnline, type ChatSize } from "@/components/mobile/use-mobile-prefs"
import { FloorFeedback, FloorSources } from "@/components/mobile/AskFloor"
import { FloorPrimaryButton, FloorSecondaryButton, MobileSheet } from "@/components/mobile/MobileSheet"
import { cn, isMobilePath } from "@/lib/utils"
import { LogReferenceModal } from "@/components/docs/LogReferenceModal"
import { MessageContent } from "./MessageContent"
import { SourcesBlock } from "./SourcesBlock"
import { RelatedRail } from "./RelatedRail"
import { StarterPrompts } from "./StarterPrompts"
import { ScopeChip } from "./ScopeChip"
import { ClearChatDialog } from "./ClearChatDialog"
import { AskConflictWarning } from "./AskConflictWarning"
import { starterQuestions } from "@/components/wiki/wikiStarters"

// Mobile font-size dial. Mounted in the AskPanel header when `compact`.
// The size lands on the scroll container; bubbles and MessageContent inherit
// it (`.chat-content` resets the .tiptap-content fixed font-size), so all
// three steps actually change the rendered text.
const CHAT_SIZE_CLASS: Record<ChatSize, string> = {
  sm: "text-[11px] leading-snug",
  md: "text-[14px] leading-relaxed",
  lg: "text-[16px] leading-relaxed",
}

function ChatSizeToggle({
  value,
  onChange,
}: {
  value: ChatSize
  onChange: (s: ChatSize) => void
}) {
  return (
    <div
      className="flex items-center gap-0.5 rounded-md border bg-muted/40 px-0.5"
      title="Adjust message text size"
    >
      <Type className="ml-0.5 h-2.5 w-2.5 text-muted-foreground" />
      <button
        type="button"
        onClick={() => onChange("sm")}
        className={cn(
          "rounded px-1 text-[8px] font-semibold transition-colors",
          value === "sm"
            ? "bg-background shadow-sm text-foreground"
            : "text-muted-foreground hover:text-foreground",
        )}
        aria-label="Smaller text"
      >
        A
      </button>
      <button
        type="button"
        onClick={() => onChange("md")}
        className={cn(
          "rounded px-1 text-[10px] font-semibold transition-colors",
          value === "md"
            ? "bg-background shadow-sm text-foreground"
            : "text-muted-foreground hover:text-foreground",
        )}
        aria-label="Default text size"
      >
        A
      </button>
      <button
        type="button"
        onClick={() => onChange("lg")}
        className={cn(
          "rounded px-1 text-[12px] font-semibold transition-colors",
          value === "lg"
            ? "bg-background shadow-sm text-foreground"
            : "text-muted-foreground hover:text-foreground",
        )}
        aria-label="Larger text"
      >
        A
      </button>
    </div>
  )
}

// Ask history is per person (convex/qa.ts). Anonymous questions share one
// thread on this device, and a fresh one starts after someone checks out or
// after a long quiet spell, so the next person never sees earlier questions.
const ANON_KEY = "oppr.ask.anonThread"
const LAST_WHO_KEY = "oppr.ask.lastWho"
const ANON_IDLE_MS = 8 * 60 * 60 * 1000

function readStore(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}
function writeStore(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // private mode: the thread lives for this page only
  }
}

export function useAskThreadKey(personId: string | null): string {
  const [anon, setAnon] = useState<string>(() => {
    const stored = readStore(ANON_KEY)
    const [key, at] = (stored ?? "").split("@")
    const fresh = key && Date.now() - Number(at || 0) < ANON_IDLE_MS
    return fresh ? key : newAnonKey()
  })
  useEffect(() => {
    if (personId) {
      writeStore(LAST_WHO_KEY, "person")
      return
    }
    // Back to Anonymous after a checked-in person: start a fresh thread.
    let key = anon
    if (readStore(LAST_WHO_KEY) === "person") {
      key = newAnonKey()
      setAnon(key)
    }
    writeStore(LAST_WHO_KEY, "anon")
    writeStore(ANON_KEY, `${key}@${Date.now()}`)
  }, [personId, anon])
  return personId ? `person:${personId}` : `anon:${anon}`
}

function newAnonKey(): string {
  return Math.random().toString(36).slice(2, 12) + Date.now().toString(36)
}

interface SpeechRecognitionInstance {
  lang: string
  interimResults: boolean
  continuous: boolean
  start: () => void
  stop: () => void
  onresult: ((event: SpeechRecognitionEvent) => void) | null
  onerror: ((event: { error?: string }) => void) | null
  onend: (() => void) | null
}
interface SpeechRecognitionEvent {
  resultIndex: number
  results: ArrayLike<ArrayLike<{ transcript: string }>>
}
type SpeechRecognitionCtor = new () => SpeechRecognitionInstance

export type AskPanelScope =
  | { kind: "doc"; id: string }
  | { kind: "asset"; id: string }
  | { kind: "wiki"; id: string }
  | { kind: "training"; id: string }
  | { kind: "skills" }
  | { kind: "library" }

/**
 * Where a scope's thread is saved (qaSessions). The table knows doc, asset and
 * library; a Wiki, Training or Skills thread is kept under the library kind
 * with its own id ("wiki:<id>", "training:<id>", "skills"), so it never mixes
 * with the whole-library thread.
 */
export function askSessionScope(scope: AskPanelScope): {
  scopeKind: "doc" | "asset" | "library"
  scopeId: string
} {
  if (scope.kind === "library") return { scopeKind: "library", scopeId: "library" }
  if (scope.kind === "wiki") return { scopeKind: "library", scopeId: `wiki:${scope.id}` }
  if (scope.kind === "training") return { scopeKind: "library", scopeId: `training:${scope.id}` }
  if (scope.kind === "skills") return { scopeKind: "library", scopeId: "skills" }
  return { scopeKind: scope.kind, scopeId: scope.id }
}

export interface AskPanelProps {
  scope: AskPanelScope
  /** When true, allow the user to swap scope from the chip. Default true. */
  allowScopeSwitch?: boolean
  /** Called when the user picks a different scope from the chip. */
  onScopeChange?: (next: AskPanelScope) => void
  compact?: boolean
  sessionId?: string
  /**
   * Called when a citation is opened. Hosts that already have the document
   * open (the reader page) can scroll-and-highlight; otherwise the panel
   * navigates to /docs/:id?page=N or /m/docs/:id?page=N.
   */
  onCitationClick?: (citation: Citation) => void
  className?: string
  /** Focus the question box on open (the phone's Ask tab). */
  autoFocus?: boolean
  /** Ask this question once on open, e.g. from a search with no match. */
  initialQuestion?: string | null
  /** Called once the initial question has been sent. */
  onInitialQuestionSent?: () => void
  /**
   * "floor": the phone's Ask. No inner card or title (the page header shows
   * the scope), 17px answers, one source chip, no Related rail, a 16px
   * composer with the mic inside, Helpful or Unclear feedback, and offline
   * handling.
   */
  variant?: "default" | "floor"
  /** Shows a close button in the header (the desktop Ask dock). */
  onClose?: () => void
  /** Called with the path just before the panel opens a page itself (a citation, a code). */
  onBeforeNavigate?: (path: string) => void
  /** A line under the header, e.g. that the scope now follows the page. */
  notice?: ReactNode
}

/** No answer starts within this time: stop and say so. */
const ASK_TIMEOUT_MS = 30_000

export function AskPanel({
  scope: scopeProp,
  allowScopeSwitch = true,
  onScopeChange,
  compact = false,
  sessionId: sessionIdProp,
  onCitationClick,
  className,
  autoFocus = false,
  initialQuestion = null,
  onInitialQuestionSent,
  variant = "default",
  onClose,
  onBeforeNavigate,
  notice,
}: AskPanelProps) {
  const floor = variant === "floor"
  const online = useOnline()
  const [location, navigateRaw] = useLocation()
  const navigate = useCallback(
    (path: string) => {
      onBeforeNavigate?.(path)
      navigateRaw(path)
    },
    [navigateRaw, onBeforeNavigate],
  )
  // Logged with each question (convex/usage.logAsk): who asked, if checked in.
  const { person: checkedInPerson } = useCheckIn()

  const [scope, setScope] = useState<AskPanelScope>(scopeProp)
  useEffect(() => setScope(scopeProp), [scopeProp])

  const [clearOpen, setClearOpen] = useState(false)
  const [input, setInput] = useState("")
  const [pending, setPending] = useState(false)
  const [streamingText, setStreamingText] = useState("")
  const [activeLog, setActiveLog] = useState<AssetLog | null>(null)

  const scrollRef = useRef<HTMLDivElement>(null)
  const taRef = useRef<HTMLTextAreaElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const authToken = useAuthToken()
  const { size: chatSize, setSize: setChatSize } = useChatSize()

  const { scopeKind: scopeKindArg, scopeId: scopeIdArg } = askSessionScope(scope)
  // Ask this Wiki: starter questions from the Wiki's section headings.
  const wikiForStarters = useQuery(
    api.wikis.get,
    scope.kind === "wiki" ? { id: scope.id as Id<"wikis"> } : "skip",
  )
  const wikiStarters =
    scope.kind === "wiki"
      ? starterQuestions(
          wikiForStarters?.contentV2?.sections.filter((s) => s.role !== "intro").map((s) => s.heading) ?? [],
        )
      : null
  // Whose thread this is: the checked-in person, or the current Anonymous one.
  const who = useAskThreadKey(checkedInPerson?._id ?? null)

  const sessionsList = useQuery(api.qa.listSessions, {
    scopeKind: scopeKindArg,
    scopeId: scopeIdArg,
    who,
  })
  // New conversation and History pick a thread; by default the newest one.
  const [pickedSession, setPickedSession] = useState<string | null>(null)
  const sessionId =
    sessionIdProp ?? pickedSession ?? sessionsList?.[0]?._id ?? null

  const messagesRaw = useQuery(
    api.qa.listMessages,
    sessionId ? { sessionId: sessionId as Id<"qaSessions"> } : "skip",
  )
  const messages: QaMessage[] = useMemo(
    () => (messagesRaw ? messagesRaw.map(toLegacyQaMessage) : []),
    [messagesRaw],
  )

  const ensureSession = useMutation(api.qa.ensureSession)
  const createSession = useMutation(api.qa.createSession)
  const addMessage = useMutation(api.qa.addMessage)
  const deleteMessages = useMutation(api.qa.deleteMessages)
  const popLastTurn = useMutation(api.qa.popLastTurn)

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, pending, streamingText])

  // Autosize the composer textarea so dictated / pasted text stays in view.
  // Cap at 6 lines so the input never eats the entire viewport on mobile;
  // scroll internally beyond that.
  useEffect(() => {
    const el = taRef.current
    if (!el) return
    el.style.height = "auto"
    const cs = window.getComputedStyle(el)
    const lineHeight = parseFloat(cs.lineHeight) || 18
    const padTop = parseFloat(cs.paddingTop) || 0
    const padBot = parseFloat(cs.paddingBottom) || 0
    const max = lineHeight * 6 + padTop + padBot
    el.style.height = Math.min(el.scrollHeight, max) + "px"
    el.style.overflowY = el.scrollHeight > max ? "auto" : "hidden"
  }, [input])

  function handleScopeChange(next: AskPanelScope) {
    if (next.kind === scope.kind) {
      if (next.kind === "library" || next.kind === "skills") return
      if ("id" in next && "id" in scope && next.id === scope.id) return
    }
    abortRef.current?.abort()
    abortRef.current = null
    setStreamingText("")
    setPending(false)
    setScope(next)
    onScopeChange?.(next)
  }

  function handleClearChat() {
    if (!sessionId || messages.length === 0) {
      abortRef.current?.abort()
      abortRef.current = null
      setStreamingText("")
      setPending(false)
      return
    }
    setClearOpen(true)
  }

  async function handleClearConfirm() {
    if (sessionId) {
      try {
        await deleteMessages({ sessionId: sessionId as Id<"qaSessions"> })
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Failed to clear chat",
        )
      }
    }
    abortRef.current?.abort()
    abortRef.current = null
    setStreamingText("")
    setPending(false)
    setClearOpen(false)
  }

  async function handleNewConversation() {
    abortRef.current?.abort()
    abortRef.current = null
    setStreamingText("")
    setPending(false)
    try {
      const id = await createSession({ scopeKind: scopeKindArg, scopeId: scopeIdArg, who })
      setPickedSession(id)
      taRef.current?.focus()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not start a new conversation")
    }
  }

  function pickSession(id: string) {
    if (id === sessionId) return
    abortRef.current?.abort()
    abortRef.current = null
    setStreamingText("")
    setPending(false)
    setPickedSession(id)
  }

  function handleStop() {
    abortRef.current?.abort()
  }

  // Default citation handler — navigate to the doc with optional page deep
  // link. Hosts can pass `onCitationClick` to override (e.g., the reader
  // page scrolls inside the open doc instead of navigating).
  const handleCitationOpen = useCallback(
    (citation: Citation, page: number | null) => {
      if (onCitationClick) {
        onCitationClick(citation)
        return
      }
      const isMobile =
        isMobilePath(location)
      const base = isMobile ? `/m/docs/${citation.document_id}` : `/docs/${citation.document_id}`
      // Open at the cited passage: its opening words (a table row's first
      // cell) are found and highlighted in the body; a PDF opens at its page.
      const params = new URLSearchParams()
      if (page != null) params.set("page", String(page))
      // From Ask this Wiki: the document's breadcrumb leads back to the Wiki.
      if (scope.kind === "wiki" && !isMobile) params.set("wiki", scope.id)
      const hl = citation.excerpt.replace(/…$/, "").split(" | ")[0].trim().slice(0, 80)
      if (hl && !hl.startsWith("Figure:")) params.set("hl", hl)
      const qs = params.toString()
      navigate(qs ? `${base}?${qs}` : base)
    },
    [location, navigate, onCitationClick, scope],
  )

  function scrollToCitation(messageId: string, n: number) {
    const el = document.getElementById(`citation-${messageId}-${n}`)
    if (!el) return
    el.scrollIntoView({ behavior: "smooth", block: "center" })
    el.classList.add("ring-2", "ring-primary")
    setTimeout(() => el.classList.remove("ring-2", "ring-primary"), 1200)
  }

  async function send(question: string) {
    if (!question.trim() || pending) return
    if (!online) return
    if (!authToken) {
      toast.error("Not signed in.")
      return
    }
    const siteUrl = import.meta.env.VITE_CONVEX_SITE_URL as
      | string
      | undefined
    if (!siteUrl) {
      toast.error("VITE_CONVEX_SITE_URL is not configured.")
      return
    }

    setInput("")
    setPending(true)
    setStreamingText("")
    if (who.startsWith("anon:")) writeStore(ANON_KEY, `${who.slice(5)}@${Date.now()}`)

    const ac = new AbortController()
    abortRef.current = ac
    // No first words within 30 seconds: give up, keep the question.
    let gotText = false
    let timedOut = false
    const timeout = window.setTimeout(() => {
      if (!gotText) {
        timedOut = true
        ac.abort()
      }
    }, ASK_TIMEOUT_MS)

    let activeSessionId: Id<"qaSessions">
    try {
      // The thread on screen; a first question starts one.
      activeSessionId = sessionId
        ? (sessionId as Id<"qaSessions">)
        : await ensureSession({
            scopeKind: scopeKindArg,
            scopeId: scopeIdArg,
            who,
          })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to start chat")
      setPending(false)
      return
    }

    try {
      await addMessage({
        sessionId: activeSessionId,
        role: "user",
        text: question,
        citations: null,
      })

      const history = messages.map((m) => ({ role: m.role, text: m.text }))
      const askScope =
        scope.kind === "library" || scope.kind === "skills" ? { kind: scope.kind } : { kind: scope.kind, id: scope.id }

      const res = await fetch(`${siteUrl}/ai/askStream`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          scope: askScope,
          question,
          history,
          personId: checkedInPerson?._id ?? null,
          surface: isMobilePath(location) ? "floor" : "desktop",
        }),
        signal: ac.signal,
      })
      if (!res.ok || !res.body) {
        const body = await res.text().catch(() => "")
        throw new Error(`Stream failed: ${res.status} ${body.slice(0, 200)}`)
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""
      let accumulated = ""
      let finalCitations: Citation[] | null = null

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        let nl: number
        while ((nl = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, nl).trim()
          buffer = buffer.slice(nl + 1)
          if (!line) continue
          let event: { type: string; text?: string; citations?: unknown[]; message?: string }
          try {
            event = JSON.parse(line)
          } catch {
            continue
          }
          if (event.type === "delta" && typeof event.text === "string") {
            gotText = true
            accumulated += event.text
            setStreamingText(accumulated)
          } else if (event.type === "done") {
            const raw = (event.citations ?? []) as Array<{
              documentId: string
              documentTitle: string
              chunkId: string
              pageOrSection: string | null
              excerpt: string
              origin: "asset-link" | "cross-link" | "log"
            }>
            finalCitations = raw.map(toLegacyCitation)
          } else if (event.type === "error") {
            throw new Error(event.message ?? "Stream error")
          }
        }
      }

      const stopped = ac.signal.aborted
      if (!accumulated && stopped) {
        setStreamingText("")
        return
      }

      const text = accumulated || "(no response)"
      const citationsForStorage = (finalCitations ?? []).map((c) => ({
        documentId: c.document_id as Id<"documents">,
        documentTitle: c.document_title,
        chunkId: c.chunk_id as Id<"chunks">,
        pageOrSection: c.page_or_section,
        excerpt: c.excerpt,
        origin: c.origin,
      }))
      await addMessage({
        sessionId: activeSessionId,
        role: "assistant",
        text,
        citations: citationsForStorage.length ? citationsForStorage : null,
      })
      setStreamingText("")
    } catch (err) {
      if (timedOut) {
        setStreamingText("")
        setInput(question)
        toast.error("Could not reach Ask. Try again.")
        return
      }
      if (ac.signal.aborted) {
        setStreamingText("")
        return
      }
      const msg = err instanceof Error ? err.message : String(err)
      toast.error(`Q&A failed: ${msg}`)
      try {
        await addMessage({
          sessionId: activeSessionId,
          role: "assistant",
          text: `Error: ${msg}`,
          citations: null,
        })
      } catch {
        // best-effort
      }
      setStreamingText("")
    } finally {
      window.clearTimeout(timeout)
      setPending(false)
      if (abortRef.current === ac) abortRef.current = null
    }
  }

  // Offline: the question stays in the box. Pressing Send (Enter) while
  // offline queues it, and it goes out when the connection is back.
  const queuedRef = useRef(false)
  const [queued, setQueued] = useState(false)
  useEffect(() => {
    if (!online || !queuedRef.current) return
    queuedRef.current = false
    setQueued(false)
    if (input.trim()) void send(input)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online])
  function submit() {
    if (!input.trim()) return
    if (!online) {
      queuedRef.current = true
      setQueued(true)
      return
    }
    void send(input)
  }

  useEffect(() => {
    if (autoFocus) taRef.current?.focus()
  }, [autoFocus])

  // A question handed over by the host is asked once, after the thread loads.
  // A later, different question from the host is asked too.
  const initialSentRef = useRef(false)
  useEffect(() => {
    if (initialQuestion?.trim()) initialSentRef.current = false
  }, [initialQuestion])
  useEffect(() => {
    if (!initialQuestion?.trim() || initialSentRef.current) return
    if (!authToken || sessionsList === undefined) return
    if (sessionId && messagesRaw === undefined) return
    initialSentRef.current = true
    void send(initialQuestion)
    onInitialQuestionSent?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuestion, authToken, sessionsList, sessionId, messagesRaw])

  function handleRegenerate() {
    if (pending || !sessionId) return
    void (async () => {
      const previous = await popLastTurn({
        sessionId: sessionId as Id<"qaSessions">,
      })
      if (!previous) return
      void send(previous)
    })()
  }

  // Suppress unused-warning for legacy adapter (citations reused in messages)
  void toLegacyCitation

  // Voice input -----------------------------------------------------------

  const speechCtor: SpeechRecognitionCtor | undefined =
    typeof window === "undefined"
      ? undefined
      : (window as unknown as Record<string, SpeechRecognitionCtor | undefined>).SpeechRecognition ??
        (window as unknown as Record<string, SpeechRecognitionCtor | undefined>).webkitSpeechRecognition
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null)
  const [listening, setListening] = useState(false)

  const handleMic = useCallback(() => {
    if (!speechCtor) {
      toast.message("Voice input is not supported in this browser.")
      return
    }
    if (listening && recognitionRef.current) {
      recognitionRef.current.stop()
      return
    }
    const rec = new speechCtor()
    rec.lang = typeof navigator !== "undefined" && navigator.language ? navigator.language : "en-US"
    rec.interimResults = true
    rec.continuous = false
    rec.onresult = (event) => {
      let transcript = ""
      for (let i = event.resultIndex; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript
      }
      setInput(transcript)
    }
    rec.onerror = (event) => {
      const code = event?.error ?? "error"
      if (code !== "aborted") toast.error(`Voice input failed: ${code}`)
    }
    rec.onend = () => {
      setListening(false)
      recognitionRef.current = null
    }
    try {
      rec.start()
      recognitionRef.current = rec
      setListening(true)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Voice input failed")
    }
  }, [listening, speechCtor])

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop()
        } catch {
          // already stopped
        }
      }
      abortRef.current?.abort()
    }
  }, [])

  // ----------------------------------------------------------------------

  const visibleMessages = useMemo<QaMessage[]>(() => {
    if (!streamingText) return messages
    return [
      ...messages,
      {
        id: "__streaming__",
        session_id: sessionId ?? "",
        role: "assistant" as const,
        text: streamingText,
        citations: null,
        created_at: new Date().toISOString(),
      },
    ]
  }, [messages, sessionId, streamingText])

  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-col",
        floor ? "bg-background" : "rounded-md border bg-card text-card-foreground",
        !floor && !compact && "shadow-sm",
        className,
      )}
    >
      {!floor && (
      <header className="space-y-2 border-b px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Ask</h2>
          <div className="flex items-center gap-0.5">
            {compact && (
              <ChatSizeToggle value={chatSize} onChange={setChatSize} />
            )}
            <ThreadHistory
              sessions={sessionsList ?? []}
              currentId={sessionId}
              onPick={pickSession}
              canClear={messages.length > 0}
              onClear={handleClearChat}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2 text-xs text-muted-foreground"
              onClick={() => void handleNewConversation()}
              disabled={messages.length === 0 && !pending}
              title="Start a new conversation. The current one stays under History."
            >
              <SquarePen className="h-3.5 w-3.5" />
              New
            </Button>
            {onClose && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground"
                onClick={onClose}
                aria-label="Close Ask"
                title="Close Ask (Ctrl+J)"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
        <div className="flex min-w-0 items-center gap-2">
          {allowScopeSwitch ? (
            <ScopeChip scope={scope} onChange={handleScopeChange} />
          ) : (
            <ScopeChip scope={scope} onChange={() => {}} />
          )}
        </div>
      </header>
      )}
      {!floor && notice}

      <div
        ref={scrollRef}
        className={cn(
          "flex-1 min-h-0 overflow-y-auto",
          floor ? "space-y-4 px-4 py-4 text-[17px] leading-relaxed" : "space-y-3 px-3 py-3",
          !floor && (compact ? CHAT_SIZE_CLASS[chatSize] : "text-sm"),
        )}
      >
        {floor && messages.length > 0 && !pending && (
          <div className="-mb-2 flex justify-end">
            <button
              type="button"
              onClick={handleClearChat}
              className="flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-muted-foreground"
            >
              <Trash2 className="h-4 w-4" />
              Start over
            </button>
          </div>
        )}
        {visibleMessages.length === 0 && !pending && wikiStarters && (
          <WikiStarterPrompts starters={wikiStarters} floor={floor} onPick={(p) => void send(p)} />
        )}
        {visibleMessages.length === 0 && !pending && !wikiStarters && (
          <StarterPrompts scope={scope} floor={floor} onPick={(p) => void send(p)} />
        )}
        {visibleMessages.map((m, i) => (
          <MessageBlock
            key={m.id}
            message={m}
            question={visibleMessages[i - 1]?.role === "user" ? visibleMessages[i - 1].text : null}
            scope={scope}
            isLast={i === visibleMessages.length - 1}
            streaming={m.id === "__streaming__"}
            onCitationOpen={handleCitationOpen}
            onCitationAnchor={(n) => scrollToCitation(m.id, n)}
            onCodeNavigate={(entry) => {
              if (entry.kind === "log") {
                // We have asset id (entry.id) but need the full log row.
                // Cheapest path: synthesize from what we know.
                setActiveLog({
                  asset_id: entry.id,
                  code: entry.code,
                  name: entry.label,
                  description: null,
                })
                return
              }
              const path =
                entry.kind === "asset"
                  ? `/assets/${entry.id}`
                  : `/docs/${entry.id}`
              const isMobile =
                isMobilePath(location)
              navigate(isMobile ? `/m${path}` : path)
            }}
            onAssetNavigate={(a) => {
              const isMobile =
                isMobilePath(location)
              navigate(isMobile ? `/m/assets/${a.id}` : `/assets/${a.id}`)
            }}
            onDocNavigate={(d) => {
              const isMobile =
                isMobilePath(location)
              navigate(isMobile ? `/m/docs/${d.id}` : `/docs/${d.id}`)
            }}
            onLogClick={(l) => setActiveLog(l)}
            onCopy={() => {
              navigator.clipboard
                .writeText(m.text)
                .then(() => toast.success("Copied"))
                .catch(() => toast.error("Copy failed"))
            }}
            onRegenerate={handleRegenerate}
            pending={pending}
            floor={floor}
          />
        ))}
        {pending && !streamingText && (
          <div className={cn("italic text-muted-foreground", floor ? "text-base" : "text-xs")}>
            {floor ? "Looking in the Published documents..." : "Thinking…"}
          </div>
        )}
      </div>

      {floor && (
        <FloorComposer
          taRef={taRef}
          input={input}
          setInput={setInput}
          onSubmit={submit}
          onStop={handleStop}
          onMic={handleMic}
          listening={listening}
          pending={pending}
          online={online}
          queued={queued}
        />
      )}

      {!floor && (
      <div className="border-t p-2">
        <div className="flex items-end gap-2">
          <Textarea
            ref={taRef}
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                void send(input)
              }
            }}
            placeholder="Ask a question"
            aria-label="Your question"
            disabled={pending}
            className={cn(
              "resize-none overflow-hidden",
              compact ? "min-h-[36px] py-2 text-[13px]" : "min-h-[40px] text-sm",
            )}
          />
          <div className="flex flex-col gap-1">
            <Button
              type="button"
              size="icon"
              variant={listening ? "default" : "outline"}
              onClick={handleMic}
              disabled={pending}
              aria-label={listening ? "Stop voice input" : "Start voice input"}
              className={cn(listening && "animate-pulse")}
            >
              {listening ? <MicOff /> : <Mic />}
            </Button>
            {pending ? (
              <Button
                type="button"
                size="icon"
                variant="destructive"
                onClick={handleStop}
                aria-label="Stop generating"
              >
                <Square />
              </Button>
            ) : (
              <Button
                type="button"
                size="icon"
                onClick={() => void send(input)}
                disabled={!input.trim()}
                aria-label="Send"
              >
                <Send />
              </Button>
            )}
          </div>
        </div>
      </div>
      )}

      {floor ? (
        <>
          {activeLog && (
            <MobileSheet
              title={activeLog.name}
              description={<span className="font-mono">{activeLog.code}</span>}
              onClose={() => setActiveLog(null)}
            >
              <p className="px-2 pb-3 text-base text-muted-foreground">
                You fill in this log in Oppr LOGS, the checklist app on this phone.
              </p>
            </MobileSheet>
          )}
          {clearOpen && (
            <MobileSheet
              title="Start over?"
              description="The questions and answers on this phone are cleared. The documents do not change."
              onClose={() => setClearOpen(false)}
              footer={
                <>
                  <FloorPrimaryButton onClick={() => void handleClearConfirm()}>Start over</FloorPrimaryButton>
                  <FloorSecondaryButton onClick={() => setClearOpen(false)}>Keep the conversation</FloorSecondaryButton>
                </>
              }
            />
          )}
        </>
      ) : (
        <>
          <LogReferenceModal
            log={activeLog}
            open={!!activeLog}
            onOpenChange={(o) => !o && setActiveLog(null)}
          />

          <ClearChatDialog
            open={clearOpen}
            onOpenChange={setClearOpen}
            onConfirm={handleClearConfirm}
            scope={scope}
            messageCount={messages.length}
          />
        </>
      )}
    </div>
  )
}

/** The floor composer: a 16px box with the mic inside, and a big Send. */
function FloorComposer({
  taRef,
  input,
  setInput,
  onSubmit,
  onStop,
  onMic,
  listening,
  pending,
  online,
  queued,
}: {
  taRef: React.RefObject<HTMLTextAreaElement | null>
  input: string
  setInput: (v: string) => void
  onSubmit: () => void
  onStop: () => void
  onMic: () => void
  listening: boolean
  pending: boolean
  online: boolean
  queued: boolean
}) {
  return (
    <div
      className="border-t bg-background px-3 pt-2"
      style={{ paddingBottom: "max(14px, var(--sab, env(safe-area-inset-bottom, 0px)))" }}
    >
      {!online && (
        <p role="status" className="mb-2 rounded-xl bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-200">
          {queued
            ? "No connection. Your question is sent as soon as you are back online."
            : "Ask needs a connection. Your question stays here and is sent when you are back online."}
        </p>
      )}
      <div className="flex items-end gap-2">
        <div className="relative min-w-0 flex-1">
          <Textarea
            ref={taRef}
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                onSubmit()
              }
            }}
            placeholder={listening ? "Listening..." : "Ask a question"}
            aria-label="Your question"
            disabled={pending}
            enterKeyHint="send"
            className="min-h-12 resize-none overflow-hidden rounded-2xl py-3 pl-4 pr-12 text-base leading-6"
          />
          <button
            type="button"
            onClick={onMic}
            disabled={pending}
            aria-label={listening ? "Stop voice input" : "Speak your question"}
            className={cn(
              "absolute bottom-0.5 right-0.5 flex h-11 w-11 items-center justify-center rounded-full transition",
              listening ? "bg-red-600 text-white motion-safe:animate-pulse" : "text-muted-foreground",
            )}
          >
            {listening ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
          </button>
        </div>
        {pending ? (
          <button
            type="button"
            onClick={onStop}
            aria-label="Stop the answer"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-slate-700 text-white"
          >
            <Square className="h-5 w-5" />
          </button>
        ) : (
          <button
            type="button"
            onClick={onSubmit}
            disabled={!input.trim() || !online}
            aria-label="Send"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#6E59A5] text-white shadow-sm transition active:scale-95 disabled:opacity-40"
          >
            <Send className="h-5 w-5" />
          </button>
        )}
      </div>
    </div>
  )
}

// --- Per-message block ------------------------------------------------------

interface MessageBlockProps {
  message: QaMessage
  /** The question this answer replies to. */
  question: string | null
  scope: AskPanelScope
  isLast: boolean
  streaming: boolean
  onCitationOpen: (c: Citation, page: number | null) => void
  onCitationAnchor: (n: number) => void
  onCodeNavigate: (entry: import("./useCodeIndex").CodeEntry) => void
  onAssetNavigate: (a: Asset) => void
  onDocNavigate: (d: Doc) => void
  onLogClick: (l: AssetLog) => void
  onCopy: () => void
  onRegenerate: () => void
  pending: boolean
  floor?: boolean
}

function MessageBlock({
  message,
  question,
  scope,
  isLast,
  streaming,
  onCitationOpen,
  onCitationAnchor,
  onCodeNavigate,
  onAssetNavigate,
  onDocNavigate,
  onLogClick,
  onCopy,
  onRegenerate,
  pending,
  floor = false,
}: MessageBlockProps) {
  const isUser = message.role === "user"

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div
          className={cn(
            "max-w-[85%] whitespace-pre-wrap break-words",
            floor ? "rounded-2xl rounded-br-md bg-[#6E59A5] px-4 py-2.5 text-white" : "rounded-lg bg-primary px-3 py-2 text-primary-foreground",
          )}
        >
          {message.text}
        </div>
      </div>
    )
  }

  return (
    <div className="flex justify-start">
      <div
        className={cn(
          "text-foreground",
          floor ? "w-full space-y-3 rounded-2xl rounded-bl-md bg-muted/60 px-4 py-3" : "max-w-[92%] space-y-2.5 rounded-lg bg-muted px-3 py-2",
        )}
      >
        <MessageContent
          text={message.text}
          streaming={streaming}
          onCitationClick={onCitationAnchor}
          onCodeClick={onCodeNavigate}
          citationCount={message.citations?.length ?? 0}
        />

        {floor && message.citations && message.citations.length > 0 && (
          <FloorSources
            citations={message.citations}
            domIdPrefix={`citation-${message.id}`}
            onOpen={onCitationOpen}
          />
        )}
        {!floor && message.citations && message.citations.length > 0 && (
          <SourcesBlock
            citations={message.citations}
            domIdPrefix={`citation-${message.id}`}
            onOpen={onCitationOpen}
          />
        )}

        {/* Open contradiction Findings on the cited documents. */}
        {!streaming && message.citations && message.citations.length > 0 && (
          <AskConflictWarning
            citations={message.citations.map((c) => ({ documentId: c.document_id, chunkId: c.chunk_id }))}
            text={`${question ?? ""} ${message.text}`}
          />
        )}

        {!floor &&
          !streaming &&
          message.citations &&
          message.citations.length > 0 && (
            <RelatedRail
              citedDocumentIds={Array.from(
                new Set(message.citations.map((c) => c.document_id)),
              )}
              hidden={scope.kind !== "library"}
              onDocClick={onDocNavigate}
              onAssetClick={onAssetNavigate}
              onLogClick={onLogClick}
            />
          )}

        {floor && !streaming && !message.text.startsWith("Error:") && (
          <FloorFeedback question={question} citations={message.citations ?? []} />
        )}

        {!floor && !streaming && (
          <div className="flex items-center gap-1 pt-1">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 gap-1 px-2 text-[11px]"
              onClick={onCopy}
            >
              <Copy className="h-3 w-3" />
              Copy
            </Button>
            {isLast && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 gap-1 px-2 text-[11px]"
                onClick={onRegenerate}
                disabled={pending}
              >
                <RefreshCw className="h-3 w-3" />
                Regenerate
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/** Earlier conversations in this scope, newest first, and clearing the one on screen. */
function ThreadHistory({
  sessions,
  currentId,
  onPick,
  canClear,
  onClear,
}: {
  sessions: { _id: string; _creationTime: number }[]
  currentId: string | null
  onPick: (id: string) => void
  canClear: boolean
  onClear: () => void
}) {
  const [open, setOpen] = useState(false)
  if (sessions.length < 2 && !canClear) return null
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 gap-1 px-2 text-xs text-muted-foreground"
          title="Earlier conversations about this scope"
        >
          <History className="h-3.5 w-3.5" />
          History
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-1">
        <p className="px-2 pb-1 pt-1.5 text-xs font-medium text-muted-foreground">Conversations about this scope</p>
        <ul className="max-h-64 overflow-y-auto">
          {sessions.map((x, i) => (
            <li key={x._id}>
              <button
                type="button"
                onClick={() => {
                  onPick(x._id)
                  setOpen(false)
                }}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted"
              >
                <span className="min-w-0 flex-1 truncate">
                  {i === 0 ? "Latest, " : ""}
                  {formatDateTime(x._creationTime)}
                </span>
                {x._id === currentId && <Check className="h-3.5 w-3.5 shrink-0 text-primary" aria-label="On screen" />}
              </button>
            </li>
          ))}
        </ul>
        {canClear && (
          <button
            type="button"
            onClick={() => {
              setOpen(false)
              onClear()
            }}
            className="mt-1 flex w-full items-center gap-2 rounded-md border-t px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-muted hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Clear the conversation on screen
          </button>
        )}
      </PopoverContent>
    </Popover>
  )
}

/** Ask this Wiki: starter questions made from the Wiki's section headings. */
function WikiStarterPrompts({
  starters,
  floor,
  onPick,
}: {
  starters: string[]
  floor: boolean
  onPick: (q: string) => void
}) {
  return (
    <div className="space-y-2">
      <p className={cn("text-muted-foreground", floor ? "text-sm" : "text-xs")}>
        Answers come only from the documents this Wiki is built from, at the versions it cites.
      </p>
      <div className={cn("flex flex-col", floor ? "gap-2" : "gap-1.5")}>
        {starters.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => onPick(q)}
            className={cn(
              "border bg-background text-left text-muted-foreground transition-colors [@media(hover:hover)]:hover:border-primary/50 [@media(hover:hover)]:hover:text-foreground",
              floor ? "min-h-12 rounded-2xl px-4 py-3 text-base" : "rounded-md px-3 py-2 text-xs",
            )}
          >
            {q}
          </button>
        ))}
      </div>
    </div>
  )
}
