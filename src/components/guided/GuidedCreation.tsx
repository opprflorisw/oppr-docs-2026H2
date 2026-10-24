import { useEffect, useReducer, useRef, useState, type ReactNode } from "react"
import { AlertCircle, Loader2, RotateCcw, SendHorizonal, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

// Guided creation (CONTEXT.md): the person says what they want, the AI asks
// at most a short follow-up and fills a Draft, the person adjusts the Draft
// with ordinary controls and presses Create. The Draft is the single source of
// truth: the conversation only ever changes it through `ask`'s structured
// result, and every field stays directly editable. Nothing is created without
// pressing Create, and closing never creates anything.
//
// Generic over the Draft type. Two ways to use it:
// - <GuidedCreation>: the ready-made dialog, conversation left, Draft right
//   (Wikis).
// - useGuidedSession + <GuidedConversation>: the same state and conversation
//   inside a workspace of your own, where the conversation is a side panel
//   (the Training builder).

/** What `ask` receives and the model sees: the person's turns and its replies. */
export interface GuidedMessage {
  role: "user" | "assistant"
  text: string
}

export interface GuidedResult<D> {
  reply: string
  draft: D
  ready: boolean
}

export interface GuidedCreationProps<D> {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  greeting: string
  examples: string[]
  initialDraft: D
  /** One conversational turn: returns the reply and the complete next Draft. */
  ask: (messages: GuidedMessage[], draft: D) => Promise<GuidedResult<D>>
  /**
   * Labels of the Draft fields that differ between two Drafts, in display
   * order. Used to show what the AI changed on a turn and to highlight those
   * fields. The same labels come back in `renderDraft`'s `changed`.
   */
  changedFields: (before: D, after: D) => string[]
  /**
   * Renders the Draft as editable fields. `changed` holds the labels of the
   * fields the AI changed on its last turn that the person has not touched
   * since, so the Draft can mark them.
   */
  renderDraft: (draft: D, setDraft: (next: D) => void, changed: ReadonlySet<string>) => ReactNode
  /**
   * Optional one-line summary of what Create will produce, shown next to the
   * Create button so it stays visible without scrolling the Draft.
   */
  renderSummary?: (draft: D) => ReactNode
  /** Optional header above the Draft, for example the steps of a flow. */
  stepHeader?: ReactNode
  /** Null when the Draft can be created, otherwise the reason it cannot. */
  blockedReason: (draft: D) => string | null
  createLabel: string
  onCreate: (draft: D) => Promise<void>
}

type Phase = "idle" | "asking" | "creating"

export interface GuidedEntry extends GuidedMessage {
  /** Fields this assistant turn changed in the Draft. */
  changes?: string[]
}

interface State<D> {
  phase: Phase
  entries: GuidedEntry[]
  /** The Draft as it was when the session (re)started. */
  initial: D
  draft: D
  /** Fields the AI changed on its last turn, minus those edited since. */
  changed: string[]
  /** The Draft before the AI's last turn, while it can still be undone. */
  undo: D | null
  /** The AI ready flag from the last turn. */
  ready: boolean
  askError: string | null
  createError: string | null
  /** True once anything happened that closing would throw away. */
  dirty: boolean
}

type Action<D> =
  | { type: "reset"; draft: D; greeting: string }
  | { type: "send"; text: string }
  | { type: "retry" }
  | { type: "answer"; result: GuidedResult<D>; changes: string[] }
  | { type: "failAsk"; error: string }
  | { type: "edit"; draft: D; touched: string[] }
  | { type: "undo" }
  | { type: "create" }
  | { type: "failCreate"; error: string }
  | { type: "saved" }

function reducer<D>(state: State<D>, action: Action<D>): State<D> {
  switch (action.type) {
    case "reset":
      return {
        phase: "idle",
        entries: [{ role: "assistant", text: action.greeting }],
        initial: action.draft,
        draft: action.draft,
        changed: [],
        undo: null,
        ready: false,
        askError: null,
        createError: null,
        dirty: false,
      }
    case "send":
      return {
        ...state,
        phase: "asking",
        askError: null,
        createError: null,
        dirty: true,
        entries: [...state.entries, { role: "user", text: action.text }],
      }
    case "retry":
      return { ...state, phase: "asking", askError: null }
    case "answer":
      return {
        ...state,
        phase: "idle",
        undo: action.changes.length > 0 ? state.draft : null,
        draft: action.result.draft,
        changed: action.changes,
        ready: action.result.ready,
        dirty: state.dirty || action.changes.length > 0,
        entries: [
          ...state.entries,
          { role: "assistant", text: action.result.reply, changes: action.changes },
        ],
      }
    case "failAsk":
      return { ...state, phase: "idle", askError: action.error }
    case "edit":
      return {
        ...state,
        draft: action.draft,
        dirty: true,
        // Once the person edits, an undo would silently drop their edit.
        undo: null,
        changed: state.changed.filter((f) => !action.touched.includes(f)),
      }
    case "undo": {
      if (state.undo === null) return state
      const entries = [...state.entries]
      const last = entries[entries.length - 1]
      if (last?.role === "assistant") entries[entries.length - 1] = { ...last, changes: undefined }
      return {
        ...state,
        draft: state.undo,
        undo: null,
        changed: [],
        entries: [...entries, { role: "assistant", text: "Undone. The draft is back to how it was before my last change." }],
      }
    }
    case "create":
      return { ...state, phase: "creating", createError: null }
    case "failCreate":
      return { ...state, phase: "idle", createError: action.error }
    case "saved":
      // Saved in place: what is on screen is now the baseline.
      return { ...state, phase: "idle", initial: state.draft, dirty: false, createError: null }
  }
}

/** A short message a person can act on, without request ids or stack noise. */
export function guidedErrorText(err: unknown, fallback: string): string {
  // ConvexError carries its user-facing message in `data`.
  const data = (err as { data?: unknown } | null)?.data
  if (typeof data === "string" && data.trim()) return data
  const raw = err instanceof Error ? err.message : String(err)
  const uncaught = raw.match(/Uncaught (?:Error|ConvexError): (.+?)(?:\n|\s+at |$)/)
  if (uncaught) return uncaught[1]
  if (/\[Request ID|Server Error/.test(raw)) return fallback
  return raw || fallback
}

const ASK_FALLBACK = "The assistant could not answer."

export interface GuidedSession<D> {
  phase: Phase
  busy: boolean
  entries: GuidedEntry[]
  initial: D
  draft: D
  changed: ReadonlySet<string>
  canUndo: boolean
  ready: boolean
  askError: string | null
  createError: string | null
  dirty: boolean
  userTurns: number
  /** Sends a message to the assistant; ignored while it is busy. */
  send: (text: string) => void
  retry: () => void
  undo: () => void
  /** A direct edit by the person. */
  setDraft: (next: D) => void
  /**
   * Runs a save. On success the session keeps going with the saved Draft as
   * its new baseline when `keepOpen` is true; on failure the error is kept
   * in `createError`.
   */
  save: (fn: (draft: D) => Promise<void>, opts?: { keepOpen?: boolean }) => Promise<boolean>
  /** Drops any answer still on its way (for example when closing). */
  cancelPending: () => void
}

/**
 * The state of one Guided creation session: the conversation, the Draft and
 * what the AI changed. It restarts from `initialDraft` every time `open`
 * becomes true.
 */
export function useGuidedSession<D>({
  open,
  greeting,
  initialDraft,
  ask,
  changedFields,
}: {
  open: boolean
  greeting: string
  initialDraft: D
  ask: (messages: GuidedMessage[], draft: D) => Promise<GuidedResult<D>>
  changedFields: (before: D, after: D) => string[]
}): GuidedSession<D> {
  const [state, dispatch] = useReducer(
    reducer as (s: State<D>, a: Action<D>) => State<D>,
    undefined,
    () => reducer<D>({} as State<D>, { type: "reset", draft: initialDraft, greeting }),
  )
  // Each turn gets a number; answers to an older turn (or one from before the
  // dialog was closed and reopened) are ignored.
  const turnRef = useRef(0)

  // Fresh start every time the session opens.
  useEffect(() => {
    if (open) {
      turnRef.current += 1
      dispatch({ type: "reset", draft: initialDraft, greeting })
    }
    // initialDraft is intentionally read only on open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const busy = state.phase !== "idle"

  async function runTurn(entries: GuidedEntry[]) {
    const turn = ++turnRef.current
    try {
      // The greeting is UI only; the model sees the person's turns and its own replies.
      const messages = entries.slice(1).map(({ role, text }) => ({ role, text }))
      const result = await ask(messages, state.draft)
      if (turn !== turnRef.current) return
      dispatch({ type: "answer", result, changes: changedFields(state.draft, result.draft) })
    } catch (err) {
      if (turn !== turnRef.current) return
      dispatch({ type: "failAsk", error: guidedErrorText(err, ASK_FALLBACK) })
    }
  }

  return {
    phase: state.phase,
    busy,
    entries: state.entries,
    initial: state.initial,
    draft: state.draft,
    changed: new Set(state.changed),
    canUndo: state.undo !== null,
    ready: state.ready,
    askError: state.askError,
    createError: state.createError,
    dirty: state.dirty,
    userTurns: state.entries.filter((m) => m.role === "user").length,
    send(text) {
      const trimmed = text.trim()
      if (!trimmed || busy) return
      dispatch({ type: "send", text: trimmed })
      void runTurn([...state.entries, { role: "user", text: trimmed }])
    },
    retry() {
      if (busy) return
      dispatch({ type: "retry" })
      void runTurn(state.entries)
    },
    undo() {
      dispatch({ type: "undo" })
    },
    setDraft(draft) {
      dispatch({ type: "edit", draft, touched: changedFields(state.draft, draft) })
    },
    async save(fn, opts) {
      if (busy) return false
      dispatch({ type: "create" })
      try {
        await fn(state.draft)
        if (opts?.keepOpen) dispatch({ type: "saved" })
        return true
      } catch (err) {
        dispatch({ type: "failCreate", error: guidedErrorText(err, "Could not save. Try again.") })
        return false
      }
    },
    cancelPending() {
      turnRef.current += 1
    },
  }
}

/**
 * The conversation with the assistant: messages, what each turn changed with
 * Undo, errors with Try again, examples and the message box.
 */
export function GuidedConversation<D>({
  session,
  examples,
  placeholder,
  className,
  autoFocus = true,
}: {
  session: GuidedSession<D>
  examples: string[]
  placeholder?: string
  className?: string
  autoFocus?: boolean
}) {
  const [input, setInput] = useState("")
  const [elapsed, setElapsed] = useState(0)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const { phase, entries, askError, userTurns, busy } = session
  const lastIndex = entries.length - 1

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })
  }, [entries.length, phase, askError])

  // Visible latency: count seconds while the assistant is working.
  useEffect(() => {
    if (phase !== "asking") return
    setElapsed(0)
    const started = Date.now()
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000)
    return () => clearInterval(t)
  }, [phase])

  // Hand focus back to the message box when the assistant has answered.
  useEffect(() => {
    if (autoFocus && phase === "idle") inputRef.current?.focus()
  }, [autoFocus, phase])

  function send(text: string) {
    if (!text.trim() || busy) return
    setInput("")
    session.send(text)
  }

  return (
    <section className={cn("flex min-h-0 flex-col", className)} aria-label="Conversation">
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4"
        role="log"
        aria-live="polite"
        aria-relevant="additions"
      >
        {entries.map((m, i) => (
          <div key={i} className={cn("max-w-[88%] space-y-1", m.role === "user" && "ml-auto")}>
            <div
              className={cn(
                "whitespace-pre-wrap rounded-lg px-3 py-2 text-sm",
                m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted",
              )}
            >
              <span className="sr-only">{m.role === "user" ? "You: " : "Assistant: "}</span>
              {m.text}
            </div>
            {m.changes && m.changes.length > 0 && (
              <div className="flex flex-wrap items-center gap-x-2 px-1 text-xs text-muted-foreground">
                <span>
                  <Sparkles className="mr-1 inline h-3 w-3 text-primary" />
                  Changed in the draft: {m.changes.join(", ")}
                </span>
                {i === lastIndex && session.canUndo && !busy && (
                  <button
                    type="button"
                    onClick={session.undo}
                    className="inline-flex items-center gap-0.5 font-medium text-primary hover:underline"
                  >
                    <RotateCcw className="h-3 w-3" /> Undo
                  </button>
                )}
              </div>
            )}
            {m.changes && m.changes.length === 0 && i > 0 && (
              <p className="px-1 text-xs text-muted-foreground">No changes to the draft.</p>
            )}
          </div>
        ))}
        {phase === "asking" && (
          <div className="flex max-w-[88%] items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Updating the draft…
            {elapsed >= 3 && <span className="text-xs tabular-nums">{elapsed}s</span>}
          </div>
        )}
        {askError && (
          <div
            role="alert"
            className="max-w-[88%] space-y-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm"
          >
            <p className="flex items-start gap-1.5 text-destructive">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {askError}
            </p>
            <p className="text-xs text-muted-foreground">
              Your draft is unchanged. Try again, or fill in the draft yourself.
            </p>
            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={session.retry}>
              <RotateCcw className="mr-1.5 h-3 w-3" /> Try again
            </Button>
          </div>
        )}
        {userTurns === 0 && phase === "idle" && examples.length > 0 && (
          <div className="space-y-1.5 pt-1">
            <p className="text-xs font-medium text-muted-foreground">Try one of these</p>
            {examples.map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => send(ex)}
                className="block w-full rounded-md border px-3 py-2 text-left text-xs transition-colors hover:border-primary/50 hover:bg-primary/5"
              >
                {ex}
              </button>
            ))}
          </div>
        )}
      </div>
      <form
        className="border-t p-3"
        onSubmit={(e) => {
          e.preventDefault()
          send(input)
        }}
      >
        <div className="flex items-end gap-2">
          <Textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault()
                send(input)
              }
            }}
            placeholder={placeholder ?? (userTurns === 0 ? "Describe what you need…" : "Reply, or ask for a change…")}
            rows={2}
            className="min-h-[44px] resize-none text-sm"
            // Typing stays possible while the assistant answers; sending waits.
            readOnly={phase === "creating"}
            aria-label="Message to the assistant"
            aria-describedby="guided-input-hint"
          />
          <Button type="submit" size="icon" disabled={busy || !input.trim()} aria-label="Send">
            <SendHorizonal className="h-4 w-4" />
          </Button>
        </div>
        <p id="guided-input-hint" className="mt-1 text-xs text-muted-foreground">
          Enter to send, Shift+Enter for a new line.
        </p>
      </form>
    </section>
  )
}

/** "Discard this draft?" before closing a dirty session. */
export function DiscardDraftDialog({
  open,
  onOpenChange,
  onDiscard,
  description = "The conversation and the draft will be lost. Nothing has been created or saved.",
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onDiscard: () => void
  description?: string
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Discard this draft?</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep working</AlertDialogCancel>
          <AlertDialogAction onClick={onDiscard}>Discard</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

/**
 * The footer pattern of a guided flow: what will be made, why the primary
 * action is not available yet (next to the button, in plain words) and the
 * actions.
 */
export function GuidedFooter({
  summary,
  reason,
  error,
  children,
}: {
  summary?: ReactNode
  reason: ReactNode
  error?: string | null
  children: ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-t bg-background px-4 py-3">
      <div className="min-w-0 space-y-0.5">
        {summary && (
          <div className="text-xs" aria-live="polite">
            {summary}
          </div>
        )}
        <p className="min-w-0 text-xs text-muted-foreground" aria-live="polite">
          {error ? (
            <span className="text-destructive" role="alert">
              {error}
            </span>
          ) : (
            reason
          )}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  )
}

export function GuidedCreation<D>(props: GuidedCreationProps<D>) {
  const { open, onOpenChange, title, greeting, examples, initialDraft } = props
  const session = useGuidedSession<D>({
    open,
    greeting,
    initialDraft,
    ask: props.ask,
    changedFields: props.changedFields,
  })
  const [confirmClose, setConfirmClose] = useState(false)

  useEffect(() => {
    if (open) setConfirmClose(false)
  }, [open])

  // Pressing the button with nothing changed would only repeat what exists.
  const blocked =
    props.blockedReason(session.draft) ??
    (props.changedFields(session.initial, session.draft).length === 0 ? "No changes yet." : null)

  async function create() {
    if (blocked || session.busy) return
    await session.save(props.onCreate)
  }

  function requestClose() {
    if (session.phase === "creating") return
    if (session.dirty) setConfirmClose(true)
    else onOpenChange(false)
  }

  function discard() {
    setConfirmClose(false)
    session.cancelPending() // drop any answer still on its way
    onOpenChange(false)
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : requestClose())}>
        <DialogContent
          className="flex h-[min(760px,90vh)] max-w-5xl flex-col gap-0 overflow-hidden p-0"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <div className="border-b px-5 py-3 pr-14">
            <DialogTitle className="text-sm">{title}</DialogTitle>
            <DialogDescription className="text-xs">
              Describe what you need on the left. The draft on the right fills in as you talk, and you can
              change any field yourself.
            </DialogDescription>
          </div>

          <div className="grid min-h-0 flex-1 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
            <GuidedConversation session={session} examples={examples} className="border-r" />

            <section className="flex min-h-0 flex-col bg-muted/20" aria-label="Draft">
              {props.stepHeader ?? (
                <div className="flex items-center gap-1.5 border-b px-4 py-2">
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                  <span className="text-xs font-semibold">Draft</span>
                  <span className="text-xs text-muted-foreground">· yours to change</span>
                </div>
              )}
              <div
                className={cn(
                  "min-h-0 flex-1 overflow-y-auto p-4 transition-opacity",
                  session.phase === "asking" && "pointer-events-none opacity-60",
                )}
                aria-busy={session.phase === "asking"}
              >
                {props.renderDraft(session.draft, session.setDraft, session.changed)}
              </div>
              <GuidedFooter
                summary={props.renderSummary?.(session.draft)}
                error={session.createError}
                reason={
                  blocked
                    ? blocked
                    : session.ready
                      ? `The draft looks complete. Check it, then press ${props.createLabel}.`
                      : `Nothing is saved until you press ${props.createLabel}.`
                }
              >
                <Button size="sm" variant="ghost" onClick={requestClose} disabled={session.phase === "creating"}>
                  Cancel
                </Button>
                <Button size="sm" onClick={() => void create()} disabled={Boolean(blocked) || session.busy}>
                  {session.phase === "creating" && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                  {props.createLabel}
                </Button>
              </GuidedFooter>
            </section>
          </div>
        </DialogContent>
      </Dialog>

      <DiscardDraftDialog open={confirmClose} onOpenChange={setConfirmClose} onDiscard={discard} />
    </>
  )
}
