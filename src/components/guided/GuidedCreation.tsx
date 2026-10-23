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
// Generic over the Draft type. Wikis are the first use; Trainings, Skill
// profiles and Documents will reuse it with their own draft and fields.

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
  /** Null when the Draft can be created, otherwise the reason it cannot. */
  blockedReason: (draft: D) => string | null
  createLabel: string
  onCreate: (draft: D) => Promise<void>
}

type Phase = "idle" | "asking" | "creating"

interface Entry extends GuidedMessage {
  /** Fields this assistant turn changed in the Draft. */
  changes?: string[]
}

interface State<D> {
  phase: Phase
  entries: Entry[]
  /** The Draft as it was when the dialog opened. */
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
  }
}

/** A short message a person can act on, without request ids or stack noise. */
function errorText(err: unknown, fallback: string): string {
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

export function GuidedCreation<D>(props: GuidedCreationProps<D>) {
  const { open, onOpenChange, title, greeting, examples, initialDraft } = props
  const [state, dispatch] = useReducer(
    reducer as (s: State<D>, a: Action<D>) => State<D>,
    undefined,
    () => reducer<D>({} as State<D>, { type: "reset", draft: initialDraft, greeting }),
  )
  const [input, setInput] = useState("")
  const [confirmClose, setConfirmClose] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  // Each turn gets a number; answers to an older turn (or one from before the
  // dialog was closed and reopened) are ignored.
  const turnRef = useRef(0)

  // Fresh start every time the dialog opens.
  useEffect(() => {
    if (open) {
      turnRef.current += 1
      dispatch({ type: "reset", draft: initialDraft, greeting })
      setInput("")
      setConfirmClose(false)
    }
    // initialDraft is intentionally read only on open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })
  }, [state.entries.length, state.phase, state.askError])

  // Visible latency: count seconds while the assistant is working.
  useEffect(() => {
    if (state.phase !== "asking") return
    setElapsed(0)
    const started = Date.now()
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000)
    return () => clearInterval(t)
  }, [state.phase])

  // Hand focus back to the message box when the assistant has answered.
  useEffect(() => {
    if (open && state.phase === "idle") inputRef.current?.focus()
  }, [open, state.phase])

  const busy = state.phase !== "idle"
  // Pressing the button with nothing changed would only repeat what exists.
  const blocked =
    props.blockedReason(state.draft) ??
    (props.changedFields(state.initial, state.draft).length === 0 ? "No changes yet." : null)
  const userTurns = state.entries.filter((m) => m.role === "user").length
  const changedSet = new Set(state.changed)
  const lastIndex = state.entries.length - 1

  async function runTurn(entries: Entry[]) {
    const turn = ++turnRef.current
    try {
      // The greeting is UI only; the model sees the person's turns and its own replies.
      const messages = entries.slice(1).map(({ role, text }) => ({ role, text }))
      const result = await props.ask(messages, state.draft)
      if (turn !== turnRef.current) return
      dispatch({ type: "answer", result, changes: props.changedFields(state.draft, result.draft) })
    } catch (err) {
      if (turn !== turnRef.current) return
      dispatch({ type: "failAsk", error: errorText(err, ASK_FALLBACK) })
    }
  }

  function send(text: string) {
    const trimmed = text.trim()
    if (!trimmed || busy) return
    setInput("")
    dispatch({ type: "send", text: trimmed })
    void runTurn([...state.entries, { role: "user", text: trimmed }])
  }

  function retry() {
    if (busy) return
    dispatch({ type: "retry" })
    void runTurn(state.entries)
  }

  async function create() {
    if (blocked || busy) return
    dispatch({ type: "create" })
    try {
      await props.onCreate(state.draft)
    } catch (err) {
      dispatch({ type: "failCreate", error: errorText(err, "Could not save. Try again.") })
    }
  }

  function requestClose() {
    if (state.phase === "creating") return
    if (state.dirty) setConfirmClose(true)
    else onOpenChange(false)
  }

  function discard() {
    setConfirmClose(false)
    turnRef.current += 1 // drop any answer still on its way
    onOpenChange(false)
  }

  // The person may edit while the AI is still answering. Its result would
  // replace the Draft and lose that edit, so the Draft is paused meanwhile.
  const setDraft = (draft: D) =>
    dispatch({ type: "edit", draft, touched: props.changedFields(state.draft, draft) })

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : requestClose())}>
        <DialogContent
          className="flex h-[min(720px,90vh)] max-w-5xl flex-col gap-0 overflow-hidden p-0"
          onOpenAutoFocus={(e) => {
            e.preventDefault()
            inputRef.current?.focus()
          }}
        >
          <div className="border-b px-5 py-3 pr-14">
            <DialogTitle className="text-sm">{title}</DialogTitle>
            <DialogDescription className="text-xs">
              Describe what you need on the left. The draft on the right fills in
              as you talk, and you can change any field yourself.
            </DialogDescription>
          </div>

          <div className="grid min-h-0 flex-1 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
            {/* Conversation */}
            <section className="flex min-h-0 flex-col border-r" aria-label="Conversation">
              <div
                ref={scrollRef}
                className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4"
                role="log"
                aria-live="polite"
                aria-relevant="additions"
              >
                {state.entries.map((m, i) => (
                  <div key={i} className={cn("max-w-[85%] space-y-1", m.role === "user" && "ml-auto")}>
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
                      <div className="flex flex-wrap items-center gap-x-2 px-1 text-[11px] text-muted-foreground">
                        <span>
                          <Sparkles className="mr-1 inline h-3 w-3 text-primary" />
                          Changed in the draft: {m.changes.join(", ")}
                        </span>
                        {i === lastIndex && state.undo !== null && !busy && (
                          <button
                            type="button"
                            onClick={() => dispatch({ type: "undo" })}
                            className="inline-flex items-center gap-0.5 font-medium text-primary hover:underline"
                          >
                            <RotateCcw className="h-3 w-3" /> Undo
                          </button>
                        )}
                      </div>
                    )}
                    {m.changes && m.changes.length === 0 && i > 0 && (
                      <p className="px-1 text-[11px] text-muted-foreground">No changes to the draft.</p>
                    )}
                  </div>
                ))}
                {state.phase === "asking" && (
                  <div className="flex max-w-[85%] items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Updating the draft…
                    {elapsed >= 3 && <span className="text-[11px] tabular-nums">{elapsed}s</span>}
                  </div>
                )}
                {state.askError && (
                  <div
                    role="alert"
                    className="max-w-[85%] space-y-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm"
                  >
                    <p className="flex items-start gap-1.5 text-destructive">
                      <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      {state.askError}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Your draft is unchanged. Try again, or fill in the draft yourself.
                    </p>
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={retry}>
                      <RotateCcw className="mr-1.5 h-3 w-3" /> Try again
                    </Button>
                  </div>
                )}
                {userTurns === 0 && state.phase === "idle" && examples.length > 0 && (
                  <div className="space-y-1.5 pt-1">
                    <p className="text-[11px] font-medium text-muted-foreground">Try one of these</p>
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
                    placeholder={userTurns === 0 ? "Describe what you need…" : "Reply, or ask for a change…"}
                    rows={2}
                    className="min-h-[44px] resize-none text-sm"
                    // Typing stays possible while the assistant answers; sending waits.
                    readOnly={state.phase === "creating"}
                    aria-label="Message to the assistant"
                    aria-describedby="guided-input-hint"
                  />
                  <Button type="submit" size="icon" disabled={busy || !input.trim()} aria-label="Send">
                    <SendHorizonal className="h-4 w-4" />
                  </Button>
                </div>
                <p id="guided-input-hint" className="mt-1 text-[10px] text-muted-foreground">
                  Enter to send, Shift+Enter for a new line.
                </p>
              </form>
            </section>

            {/* Draft */}
            <section className="flex min-h-0 flex-col bg-muted/20" aria-label="Draft">
              <div className="flex items-center gap-1.5 border-b px-4 py-2">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                <span className="text-xs font-semibold">Draft</span>
                <span className="text-[11px] text-muted-foreground">· yours to change</span>
              </div>
              <div
                className={cn(
                  "min-h-0 flex-1 overflow-y-auto p-4 transition-opacity",
                  state.phase === "asking" && "pointer-events-none opacity-60",
                )}
                aria-busy={state.phase === "asking"}
              >
                {props.renderDraft(state.draft, setDraft, changedSet)}
              </div>
              <div className="flex items-center justify-between gap-3 border-t bg-background px-4 py-3">
                <div className="min-w-0 space-y-0.5">
                {props.renderSummary && (
                  <div className="text-xs" aria-live="polite">{props.renderSummary(state.draft)}</div>
                )}
                <p className="min-w-0 text-[11px] text-muted-foreground" aria-live="polite">
                  {state.createError ? (
                    <span className="text-destructive" role="alert">{state.createError}</span>
                  ) : blocked ? (
                    blocked
                  ) : state.ready ? (
                    `The draft looks complete. Check it, then press ${props.createLabel}.`
                  ) : (
                    `Nothing is saved until you press ${props.createLabel}.`
                  )}
                </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button size="sm" variant="ghost" onClick={requestClose} disabled={state.phase === "creating"}>
                    Cancel
                  </Button>
                  <Button size="sm" onClick={() => void create()} disabled={Boolean(blocked) || busy}>
                    {state.phase === "creating" && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                    {props.createLabel}
                  </Button>
                </div>
              </div>
            </section>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmClose} onOpenChange={setConfirmClose}>
        <AlertDialogContent
          onCloseAutoFocus={(e) => {
            // Back to the conversation, not to whatever had focus before.
            e.preventDefault()
            inputRef.current?.focus()
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>Discard this draft?</AlertDialogTitle>
            <AlertDialogDescription>
              The conversation and the draft will be lost. Nothing has been created or saved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep working</AlertDialogCancel>
            <AlertDialogAction onClick={discard}>Discard</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
