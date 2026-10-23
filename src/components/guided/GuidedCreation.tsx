import { useEffect, useReducer, useRef, useState, type ReactNode } from "react"
import { Loader2, SendHorizonal, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

// Guided creation (CONTEXT.md): the person says what they want, the AI asks
// at most a short follow-up and fills a Draft, the person adjusts the Draft
// with ordinary controls and presses Create. The Draft is the single source of
// truth: the conversation only ever changes it through `ask`'s structured
// result, and every field stays directly editable. Nothing is created without
// pressing Create.
//
// Generic over the Draft type. Wikis are the first use; Trainings, Skill
// profiles and Documents will reuse it with their own draft and fields.

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
  /** Renders the Draft as editable fields. */
  renderDraft: (draft: D, setDraft: (next: D) => void, aiTouched: number) => ReactNode
  /** Null when the Draft can be created, otherwise the reason it cannot. */
  blockedReason: (draft: D) => string | null
  createLabel: string
  onCreate: (draft: D) => Promise<void>
}

type Phase = "idle" | "asking" | "creating"

interface State<D> {
  phase: Phase
  messages: GuidedMessage[]
  draft: D
  /** Incremented whenever the AI changed the Draft, to flash the panel. */
  aiTouched: number
  error: string | null
}

type Action<D> =
  | { type: "reset"; draft: D; greeting: string }
  | { type: "send"; text: string }
  | { type: "answer"; result: GuidedResult<D> }
  | { type: "failAsk"; error: string }
  | { type: "edit"; draft: D }
  | { type: "create" }
  | { type: "failCreate"; error: string }

function reducer<D>(state: State<D>, action: Action<D>): State<D> {
  switch (action.type) {
    case "reset":
      return {
        phase: "idle",
        messages: [{ role: "assistant", text: action.greeting }],
        draft: action.draft,
        aiTouched: 0,
        error: null,
      }
    case "send":
      return {
        ...state,
        phase: "asking",
        error: null,
        messages: [...state.messages, { role: "user", text: action.text }],
      }
    case "answer":
      return {
        ...state,
        phase: "idle",
        draft: action.result.draft,
        aiTouched: state.aiTouched + 1,
        messages: [...state.messages, { role: "assistant", text: action.result.reply }],
      }
    case "failAsk":
      return { ...state, phase: "idle", error: action.error }
    case "edit":
      return { ...state, draft: action.draft }
    case "create":
      return { ...state, phase: "creating", error: null }
    case "failCreate":
      return { ...state, phase: "idle", error: action.error }
  }
}

export function GuidedCreation<D>(props: GuidedCreationProps<D>) {
  const { open, onOpenChange, title, greeting, examples, initialDraft } = props
  const [state, dispatch] = useReducer(
    reducer as (s: State<D>, a: Action<D>) => State<D>,
    undefined,
    () => reducer<D>({} as State<D>, { type: "reset", draft: initialDraft, greeting }),
  )
  const [input, setInput] = useState("")
  const scrollRef = useRef<HTMLDivElement>(null)

  // Fresh start every time the dialog opens.
  useEffect(() => {
    if (open) {
      dispatch({ type: "reset", draft: initialDraft, greeting })
      setInput("")
    }
    // initialDraft is intentionally read only on open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })
  }, [state.messages.length, state.phase])

  const busy = state.phase !== "idle"
  const blocked = props.blockedReason(state.draft)
  const userTurns = state.messages.filter((m) => m.role === "user").length

  async function send(text: string) {
    const trimmed = text.trim()
    if (!trimmed || busy) return
    setInput("")
    const messages: GuidedMessage[] = [...state.messages, { role: "user", text: trimmed }]
    dispatch({ type: "send", text: trimmed })
    try {
      // The greeting is UI only; the model sees the person's turns and its own replies.
      const result = await props.ask(messages.slice(1), state.draft)
      dispatch({ type: "answer", result })
    } catch (err) {
      dispatch({
        type: "failAsk",
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  async function create() {
    if (blocked || busy) return
    dispatch({ type: "create" })
    try {
      await props.onCreate(state.draft)
    } catch (err) {
      dispatch({
        type: "failCreate",
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="flex h-[min(720px,90vh)] max-w-5xl flex-col gap-0 overflow-hidden p-0">
        <div className="border-b px-5 py-3">
          <DialogTitle className="text-sm">{title}</DialogTitle>
          <DialogDescription className="text-xs">
            Describe what you need on the left. The draft on the right fills in
            as you talk, and you can change any field yourself.
          </DialogDescription>
        </div>

        <div className="grid min-h-0 flex-1 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          {/* Conversation */}
          <section className="flex min-h-0 flex-col border-r">
            <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
              {state.messages.map((m, i) => (
                <div
                  key={i}
                  className={cn(
                    "max-w-[85%] rounded-lg px-3 py-2 text-sm",
                    m.role === "user"
                      ? "ml-auto bg-primary text-primary-foreground"
                      : "bg-muted",
                  )}
                >
                  {m.text}
                </div>
              ))}
              {state.phase === "asking" && (
                <div className="flex max-w-[85%] items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Updating the draft…
                </div>
              )}
              {userTurns === 0 && state.phase === "idle" && (
                <div className="space-y-1.5 pt-1">
                  <p className="text-[11px] font-medium text-muted-foreground">Try one of these</p>
                  {examples.map((ex) => (
                    <button
                      key={ex}
                      type="button"
                      onClick={() => void send(ex)}
                      className="block w-full rounded-md border px-3 py-2 text-left text-xs transition-colors hover:border-primary/50 hover:bg-primary/5"
                    >
                      {ex}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <form
              className="flex items-end gap-2 border-t p-3"
              onSubmit={(e) => {
                e.preventDefault()
                void send(input)
              }}
            >
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault()
                    void send(input)
                  }
                }}
                placeholder="Describe what you need…"
                rows={2}
                className="min-h-[44px] resize-none text-sm"
                disabled={busy}
                aria-label="Message"
              />
              <Button type="submit" size="icon" disabled={busy || !input.trim()} aria-label="Send">
                <SendHorizonal className="h-4 w-4" />
              </Button>
            </form>
          </section>

          {/* Draft */}
          <section className="flex min-h-0 flex-col bg-muted/20">
            <div className="flex items-center gap-1.5 border-b px-4 py-2">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              <span className="text-xs font-semibold">Draft</span>
              <span className="text-[11px] text-muted-foreground">· yours to change</span>
            </div>
            <div
              className={cn(
                "min-h-0 flex-1 overflow-y-auto p-4 transition-opacity",
                // While the AI is answering, its result replaces the Draft, so
                // edits made in that moment would be lost: pause them.
                state.phase === "asking" && "pointer-events-none opacity-60",
              )}
              aria-busy={state.phase === "asking"}
            >
              {props.renderDraft(state.draft, (draft) => dispatch({ type: "edit", draft }), state.aiTouched)}
            </div>
            <div className="flex items-center justify-between gap-3 border-t bg-background px-4 py-3">
              <p className="min-w-0 text-[11px] text-muted-foreground">
                {state.error ? (
                  <span className="text-destructive">{state.error}</span>
                ) : blocked ? (
                  blocked
                ) : (
                  "Nothing is created until you press the button."
                )}
              </p>
              <Button size="sm" onClick={() => void create()} disabled={Boolean(blocked) || busy} className="shrink-0">
                {state.phase === "creating" && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                {props.createLabel}
              </Button>
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  )
}
