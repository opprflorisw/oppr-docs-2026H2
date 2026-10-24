import { useMemo, useState } from "react"
import { useAction, useQuery } from "convex/react"
import {
  ArrowDown,
  ArrowUp,
  Camera,
  Check,
  ChevronDown,
  ChevronRight,
  Image as ImageIcon,
  ListChecks,
  Loader2,
  MessageSquareText,
  Plus,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Trash2,
  X,
} from "lucide-react"
import { api } from "../../../../convex/_generated/api"
import type { Id } from "../../../../convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { errorText, GrowTextarea, SourceChip } from "./lib"
import { JustChanged } from "./JobBreakdownEditor"
import { nearDuplicates, questionCount, uid, type DraftObjective, type DraftQuestion, type TrainingDraft } from "./builderModel"

const LETTERS = ["A", "B", "C", "D", "E", "F"]

type Docs = { namingCode: string; version: number }

/**
 * The question bank (CONTEXT.md: Training, Attempt): the questions Attempts
 * draw from, grouped per Learning objective. Each question is multiple choice
 * or open (answered in the person's own words, graded against key points),
 * may show a picture, and cites the objective's Published passage. The AI
 * writes them on request; the Engineer edits, reorders, adds and deletes.
 */
export function QuestionBankEditor({
  draft,
  onChange,
  aiChanged,
  docInfo,
}: {
  draft: TrainingDraft
  onChange: (next: TrainingDraft) => void
  aiChanged: boolean
  docInfo: Map<string, Docs>
}) {
  const write = useAction(api.ai.trainingBuilder.draftQuestions)
  const [busy, setBusy] = useState<string | null>(null)
  const [note, setNote] = useState<{ tone: "info" | "error"; text: string } | null>(null)
  const [choiceN, setChoiceN] = useState(1)
  const [openN, setOpenN] = useState(1)
  const bank = draft.questionBank
  const setBank = (questionBank: DraftQuestion[]) => onChange({ ...draft, questionBank })
  const images = useQuery(
    api.trainingBuilder.imagesForDocuments,
    draft.documentIds.length > 0 ? { documentIds: draft.documentIds } : "skip",
  )

  const objectivesPayload = (list: DraftObjective[]) =>
    list.map((o) => ({ id: o.id, text: o.text, documentId: o.documentId, chunkId: o.chunkId, quote: o.quote }))

  async function writeFor(
    key: string,
    opts: { objectiveIds?: string[]; choice: number; open: number; replaceId?: string },
  ) {
    setBusy(key)
    setNote(null)
    try {
      const res = await write({
        title: draft.title,
        purpose: draft.purpose,
        objectives: objectivesPayload(draft.objectives),
        onlyObjectiveIds: opts.objectiveIds,
        choicePerObjective: opts.choice,
        openPerObjective: opts.open,
        avoid: bank.map((q) => q.prompt),
      })
      const items: DraftQuestion[] = res.items.map((q) => ({
        id: q.id,
        objectiveId: q.objectiveId,
        kind: q.kind,
        prompt: q.prompt,
        options: q.options,
        correctIndex: q.correctIndex,
        keyPoints: q.keyPoints,
        modelAnswer: q.modelAnswer,
        explanation: q.explanation,
        whyWrong: q.whyWrong,
        source: "ai",
        byCode: q.byCode,
      }))
      if (opts.replaceId) {
        const fresh = items[0]
        if (!fresh) throw new Error("No new question came back. Try again.")
        const old = bank.find((q) => q.id === opts.replaceId)
        setBank(
          bank.map((q) =>
            q.id === opts.replaceId ? { ...fresh, id: q.id, imageId: old?.imageId, answerByPhoto: fresh.kind === "open" ? old?.answerByPhoto : undefined } : q,
          ),
        )
      } else {
        // Keep the bank in objective order: new questions go after their objective's last one.
        const order = new Map(draft.objectives.map((o, i) => [o.id, i]))
        setBank([...bank, ...items].sort((a, b) => (order.get(a.objectiveId) ?? 99) - (order.get(b.objectiveId) ?? 99)))
      }
      const parts: string[] = []
      if (res.byCode) parts.push("Some questions were written by code from the passage, because the assistant could not write them. Check them.")
      if (res.dropped > 0) parts.push(`${res.dropped} questions were left out because the passage does not state their answer.`)
      setNote(
        parts.length > 0
          ? { tone: "info", text: parts.join(" ") }
          : { tone: "info", text: `${items.length} ${items.length === 1 ? "question" : "questions"} added. Check each one before sending for review.` },
      )
    } catch (err) {
      setNote({ tone: "error", text: errorText(err, "The questions could not be written. Try again.") })
    } finally {
      setBusy(null)
    }
  }

  const patch = (id: string, p: Partial<DraftQuestion>) =>
    setBank(bank.map((q) => (q.id === id ? { ...q, ...p, source: "engineer", byCode: false } : q)))
  const move = (id: string, d: -1 | 1) => {
    const i = bank.findIndex((q) => q.id === id)
    const j = i + d
    if (i < 0 || j < 0 || j >= bank.length) return
    const next = [...bank]
    ;[next[i], next[j]] = [next[j], next[i]]
    setBank(next)
  }
  const addBlank = (objectiveId: string, kind: "choice" | "open") =>
    setBank(
      insertAfterObjective(bank, draft.objectives, {
        id: uid("qb"),
        objectiveId,
        kind,
        prompt: "",
        options: kind === "choice" ? ["", "", ""] : [],
        correctIndex: 0,
        keyPoints: kind === "open" ? [""] : undefined,
        explanation: "",
        source: "engineer",
      }),
    )

  const empty = draft.objectives.filter((o) => !bank.some((q) => q.objectiveId === o.id))
  const dupes = useMemo(() => nearDuplicates(bank), [bank])
  const perAttempt = questionCount(draft)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl space-y-1">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            Questions {aiChanged && <JustChanged />}
          </h3>
          <p className="text-sm text-muted-foreground">
            {bank.length > 0
              ? `${bank.length} ${bank.length === 1 ? "question" : "questions"} in the bank. Each Attempt draws ${perAttempt} of ${bank.length}, at least one per objective, and each cites its objective's passage.`
              : "No question bank yet: every Attempt writes fresh multiple-choice questions. Write a bank to control exactly what is asked, add open questions answered in the person's own words, or show pictures."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 p-2">
          <CountSelect label="Choice" value={choiceN} onChange={setChoiceN} max={3} />
          <CountSelect label="Open" value={openN} onChange={setOpenN} max={2} />
          <span className="text-xs text-muted-foreground">per objective</span>
          <Button
            size="sm"
            className="gap-1.5"
            disabled={busy !== null || draft.objectives.length === 0 || choiceN + openN === 0}
            onClick={() =>
              void writeFor("all", {
                objectiveIds: bank.length > 0 && empty.length > 0 ? empty.map((o) => o.id) : undefined,
                choice: choiceN,
                open: openN,
              })
            }
          >
            {busy === "all" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {bank.length === 0
              ? "Write questions"
              : empty.length > 0
                ? `Write for ${empty.length} without questions`
                : "Write more for all"}
          </Button>
        </div>
      </div>

      {note && (
        <p
          role={note.tone === "error" ? "alert" : "status"}
          className={cn(
            "rounded-md border px-3 py-2 text-sm",
            note.tone === "error" ? "border-destructive/40 bg-destructive/5 text-destructive" : "bg-muted/40 text-muted-foreground",
          )}
        >
          {note.text}
        </p>
      )}

      {draft.objectives.length === 0 && (
        <p className="rounded-md border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
          Add Learning objectives in Source and goal first. Every question tests one objective.
        </p>
      )}

      {draft.objectives.map((o, oi) => {
        const qs = bank.filter((q) => q.objectiveId === o.id)
        return (
          <ObjectiveGroup
            key={o.id}
            objective={o}
            number={oi + 1}
            doc={docInfo.get(String(o.documentId))}
            count={qs.length}
            onToggleCritical={() =>
              onChange({ ...draft, objectives: draft.objectives.map((x) => (x.id === o.id ? { ...x, critical: !x.critical } : x)) })
            }
            onAdd={(kind) => addBlank(o.id, kind)}
            onAskAi={() => void writeFor(`obj-${o.id}`, { objectiveIds: [o.id], choice: choiceN || 1, open: openN })}
            asking={busy === `obj-${o.id}`}
          >
            {qs.length === 0 ? (
              <p className="rounded-md border border-dashed px-3 py-3 text-sm text-muted-foreground">
                No question for this objective yet.{" "}
                {bank.length > 0 ? "Send for review needs one." : "Attempts write one fresh each time."}
              </p>
            ) : (
              qs.map((q) => (
                <QuestionEditor
                  key={q.id}
                  q={q}
                  number={bank.indexOf(q) + 1}
                  isFirst={bank.indexOf(q) === 0}
                  isLast={bank.indexOf(q) === bank.length - 1}
                  isRound={draft.kind === "round"}
                  similarTo={dupes.get(q.id) ?? null}
                  images={images ?? []}
                  regenerating={busy === `re-${q.id}`}
                  disabled={busy !== null}
                  onPatch={(p) => patch(q.id, p)}
                  onMove={(d) => move(q.id, d)}
                  onRemove={() => setBank(bank.filter((x) => x.id !== q.id))}
                  onRegenerate={() =>
                    void writeFor(`re-${q.id}`, {
                      objectiveIds: [q.objectiveId],
                      choice: q.kind === "choice" ? 1 : 0,
                      open: q.kind === "open" ? 1 : 0,
                      replaceId: q.id,
                    })
                  }
                />
              ))
            )}
          </ObjectiveGroup>
        )
      })}
    </div>
  )
}

function insertAfterObjective(bank: DraftQuestion[], objectives: DraftObjective[], q: DraftQuestion) {
  const order = new Map(objectives.map((o, i) => [o.id, i]))
  const mine = order.get(q.objectiveId) ?? 99
  let at = bank.length
  for (let i = 0; i < bank.length; i++) {
    if ((order.get(bank[i].objectiveId) ?? 99) > mine) {
      at = i
      break
    }
  }
  return [...bank.slice(0, at), q, ...bank.slice(at)]
}

function CountSelect({ label, value, onChange, max }: { label: string; value: number; onChange: (n: number) => void; max: number }) {
  return (
    <label className="flex items-center gap-1.5 text-sm">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-9 rounded-md border bg-background px-2 text-sm"
      >
        {Array.from({ length: max + 1 }, (_, i) => (
          <option key={i} value={i}>
            {i}
          </option>
        ))}
      </select>
    </label>
  )
}

function ObjectiveGroup({
  objective: o,
  number,
  doc,
  count,
  onToggleCritical,
  onAdd,
  onAskAi,
  asking,
  children,
}: {
  objective: DraftObjective
  number: number
  doc: Docs | undefined
  count: number
  onToggleCritical: () => void
  onAdd: (kind: "choice" | "open") => void
  onAskAi: () => void
  asking: boolean
  children: React.ReactNode
}) {
  const [showPassage, setShowPassage] = useState(false)
  return (
    <section className="space-y-2 rounded-lg border p-3" aria-label={`Objective ${number}`}>
      <div className="flex flex-wrap items-start gap-2">
        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
          {number}
        </span>
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-sm font-medium">{o.text}</p>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>
              {count} {count === 1 ? "question" : "questions"}
            </span>
            <SourceChip documentId={o.documentId} namingCode={doc?.namingCode ?? "Source"} version={doc?.version} quote={o.quote} />
            <button
              type="button"
              onClick={() => setShowPassage(!showPassage)}
              className="inline-flex items-center gap-0.5 font-medium text-primary hover:underline"
              aria-expanded={showPassage}
            >
              {showPassage ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              Cited passage
            </button>
          </div>
          {showPassage && (
            <blockquote className="border-l-2 border-primary/40 pl-3 text-sm italic text-muted-foreground">"{o.quote}"</blockquote>
          )}
        </div>
        <label className="flex min-h-9 cursor-pointer items-center gap-2 rounded-md border px-2.5 text-sm">
          <input type="checkbox" checked={Boolean(o.critical)} onChange={onToggleCritical} className="h-4 w-4 accent-red-600" />
          <ShieldAlert className={cn("h-4 w-4", o.critical ? "text-red-600" : "text-muted-foreground")} />
          Must be right
        </label>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline" className="gap-1.5" disabled={asking}>
              {asking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Add question
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={onAskAi}>
              <Sparkles className="mr-2 h-4 w-4" /> Let the AI write one
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onAdd("choice")}>
              <ListChecks className="mr-2 h-4 w-4" /> Multiple choice, written by me
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onAdd("open")}>
              <MessageSquareText className="mr-2 h-4 w-4" /> Open question, written by me
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {o.critical && (
        <p className="pl-8 text-xs text-muted-foreground">
          A wrong answer here fails the Attempt, whatever the score. Attempts ask it twice, from different angles, when the bank has two questions.
        </p>
      )}
      <div className="space-y-2 pl-0 sm:pl-8">{children}</div>
    </section>
  )
}

function QuestionEditor({
  q,
  number,
  isFirst,
  isLast,
  isRound,
  similarTo,
  images,
  regenerating,
  disabled,
  onPatch,
  onMove,
  onRemove,
  onRegenerate,
}: {
  q: DraftQuestion
  number: number
  isFirst: boolean
  isLast: boolean
  isRound: boolean
  /** Bank number of an earlier question on the same objective that asks nearly the same. */
  similarTo: number | null
  images: { imageId: Id<"images">; url: string | null; alt: string; namingCode: string }[]
  regenerating: boolean
  disabled: boolean
  onPatch: (p: Partial<DraftQuestion>) => void
  onMove: (d: -1 | 1) => void
  onRemove: () => void
  onRegenerate: () => void
}) {
  const image = useMemo(() => images.find((i) => i.imageId === q.imageId), [images, q.imageId])
  const whyWrongFor = (optIndex: number) => {
    const wrongPos = optIndex < q.correctIndex ? optIndex : optIndex - 1
    return q.whyWrong?.[wrongPos] ?? ""
  }
  const setWhyWrong = (optIndex: number, text: string) => {
    const wrongCount = q.options.length - 1
    const arr = Array.from({ length: wrongCount }, (_, i) => q.whyWrong?.[i] ?? "")
    const wrongPos = optIndex < q.correctIndex ? optIndex : optIndex - 1
    arr[wrongPos] = text
    onPatch({ whyWrong: arr })
  }
  const setCorrect = (i: number) => {
    // Keep each "why wrong" with its option when the right answer moves.
    const byOption = q.options.map((_, j) => (j === q.correctIndex ? "" : whyWrongFor(j)))
    onPatch({ correctIndex: i, whyWrong: byOption.filter((_, j) => j !== i) })
  }
  const switchKind = (kind: "choice" | "open") => {
    if (kind === q.kind) return
    onPatch(
      kind === "choice"
        ? { kind, options: q.options.length >= 2 ? q.options : ["", "", ""], correctIndex: 0, answerByPhoto: undefined }
        : { kind, keyPoints: q.keyPoints?.length ? q.keyPoints : [""] },
    )
  }

  return (
    <article className={cn("space-y-3 rounded-md border bg-background p-3", regenerating && "opacity-60")} aria-label={`Question ${number}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold tabular-nums text-muted-foreground">Q{number}</span>
        <div className="flex rounded-md border p-0.5" role="group" aria-label="Kind of question">
          {(["choice", "open"] as const).map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={q.kind === k}
              onClick={() => switchKind(k)}
              className={cn(
                "rounded px-2.5 py-1 text-xs font-medium transition-colors",
                q.kind === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {k === "choice" ? "Multiple choice" : "Open answer"}
            </button>
          ))}
        </div>
        {similarTo != null && (
          <span
            className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200"
            title="Two questions on the same objective that ask nearly the same thing make the Attempt feel repetitive. Change one, regenerate it, or remove it."
            data-near-duplicate
          >
            Nearly the same as Q{similarTo}
          </span>
        )}
        {q.byCode ? (
          <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
            Written by code
          </span>
        ) : q.source === "ai" ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
            <Sparkles className="h-3 w-3" /> AI draft
          </span>
        ) : (
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">Edited by you</span>
        )}
        <div className="ml-auto flex items-center gap-0.5">
          <button
            type="button"
            title="Write this question again"
            aria-label={`Write question ${number} again`}
            disabled={disabled}
            onClick={onRegenerate}
            className="inline-flex items-center gap-1 rounded px-2 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
          >
            {regenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Regenerate
          </button>
          <IconBtn label="Move up" disabled={isFirst} onClick={() => onMove(-1)}>
            <ArrowUp className="h-4 w-4" />
          </IconBtn>
          <IconBtn label="Move down" disabled={isLast} onClick={() => onMove(1)}>
            <ArrowDown className="h-4 w-4" />
          </IconBtn>
          <IconBtn label={`Delete question ${number}`} onClick={onRemove} danger>
            <Trash2 className="h-4 w-4" />
          </IconBtn>
        </div>
      </div>

      <GrowTextarea
        value={q.prompt}
        onChange={(e) => onPatch({ prompt: e.target.value })}
        placeholder={q.kind === "choice" ? "The question, e.g. You are about to open the die gate. What do you do first?" : "e.g. Describe in your own words what you do when the melt pressure alarm goes off."}
        aria-label={`Question ${number} text`}
        className="text-sm font-medium"
      />

      {q.kind === "choice" ? (
        <div className="space-y-2" role="radiogroup" aria-label={`Answer options of question ${number}`}>
          {q.options.map((opt, i) => {
            const right = i === q.correctIndex
            return (
              <div
                key={i}
                className={cn(
                  "space-y-1.5 rounded-md border p-2",
                  right && "border-emerald-400 bg-emerald-50/60 dark:border-emerald-500/50 dark:bg-emerald-500/10",
                )}
              >
                <div className="flex items-start gap-2">
                  <button
                    type="button"
                    role="radio"
                    aria-checked={right}
                    aria-label={`Option ${LETTERS[i]} is the right answer`}
                    title={right ? "The right answer" : "Make this the right answer"}
                    onClick={() => setCorrect(i)}
                    className={cn(
                      "mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
                      right ? "border-emerald-600 bg-emerald-600 text-white" : "bg-background text-muted-foreground hover:border-emerald-500",
                    )}
                  >
                    {LETTERS[i]}
                  </button>
                  <div className="min-w-0 flex-1 space-y-1">
                    {right && (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                        <Check className="h-3.5 w-3.5" /> Right answer
                      </span>
                    )}
                    <GrowTextarea
                      value={opt}
                      onChange={(e) => onPatch({ options: q.options.map((x, j) => (j === i ? e.target.value : x)) })}
                      placeholder={right ? "The right answer" : "A wrong answer that sounds right"}
                      aria-label={`Option ${LETTERS[i]}`}
                      className="w-full bg-background text-sm"
                    />
                    {!right && <WhyWrong value={whyWrongFor(i)} onChange={(v) => setWhyWrong(i, v)} letter={LETTERS[i]} />}
                  </div>
                  {!right && (
                    <IconBtn
                      label={`Remove option ${LETTERS[i]}`}
                      disabled={q.options.length <= 2}
                      onClick={() => {
                        const whys = q.options.map((_, j) => (j === q.correctIndex ? "" : whyWrongFor(j)))
                        const options = q.options.filter((_, j) => j !== i)
                        const correctIndex = q.correctIndex > i ? q.correctIndex - 1 : q.correctIndex
                        const keptWhys = whys.filter((_, j) => j !== i)
                        onPatch({ options, correctIndex, whyWrong: keptWhys.filter((_, j) => j !== correctIndex) })
                      }}
                      danger
                    >
                      <X className="h-4 w-4" />
                    </IconBtn>
                  )}
                </div>
              </div>
            )
          })}
          {q.options.length < 6 && (
            <button
              type="button"
              onClick={() => onPatch({ options: [...q.options, ""], whyWrong: [...(q.whyWrong ?? []), ""] })}
              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              <Plus className="h-3.5 w-3.5" /> Option
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs font-medium">Key points a good answer names</p>
          {(q.keyPoints ?? []).map((k, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="w-5 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{i + 1}.</span>
              <GrowTextarea
                value={k}
                onChange={(e) => onPatch({ keyPoints: (q.keyPoints ?? []).map((x, j) => (j === i ? e.target.value : x)) })}
                placeholder="e.g. Lock out the main switch before opening"
                aria-label={`Key point ${i + 1}`}
                className="min-w-0 flex-1 text-sm"
              />
              <IconBtn label={`Remove key point ${i + 1}`} onClick={() => onPatch({ keyPoints: (q.keyPoints ?? []).filter((_, j) => j !== i) })} danger>
                <X className="h-4 w-4" />
              </IconBtn>
            </div>
          ))}
          <button
            type="button"
            onClick={() => onPatch({ keyPoints: [...(q.keyPoints ?? []), ""] })}
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            <Plus className="h-3.5 w-3.5" /> Key point
          </button>
          <Textarea
            value={q.modelAnswer ?? ""}
            onChange={(e) => onPatch({ modelAnswer: e.target.value })}
            rows={2}
            placeholder="A good answer, for the trainer (optional)"
            aria-label="Model answer"
            className="min-h-[44px] resize-none text-sm"
          />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={Boolean(q.answerByPhoto)}
              onChange={(e) => onPatch({ answerByPhoto: e.target.checked || undefined })}
              className="h-4 w-4 accent-primary"
            />
            <Camera className="h-4 w-4 text-muted-foreground" />
            Answer with a photo{isRound ? " at the stop" : ""} (graded against the key points)
          </label>
        </div>
      )}

      <GrowTextarea
        value={q.explanation}
        onChange={(e) => onPatch({ explanation: e.target.value })}
        placeholder="Explanation shown after answering, in the words of the source"
        aria-label="Explanation"
        className="text-sm"
      />

      <div className="flex flex-wrap items-center gap-2">
        {image?.url && (
          <img src={image.url} alt={image.alt} className="h-16 w-24 rounded border object-cover" />
        )}
        <ImagePicker
          images={images}
          selected={q.imageId ?? null}
          onPick={(imageId) => onPatch({ imageId: imageId ?? undefined })}
        />
      </div>
    </article>
  )
}

function ImagePicker({
  images,
  selected,
  onPick,
}: {
  images: { imageId: Id<"images">; url: string | null; alt: string; namingCode: string }[]
  selected: Id<"images"> | null
  onPick: (id: Id<"images"> | null) => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" size="sm" variant="ghost" className="gap-1.5 text-muted-foreground">
          <ImageIcon className="h-4 w-4" />
          {selected ? "Change picture" : "Add a picture"}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96 space-y-2 p-3" align="start">
        <p className="text-sm font-medium">Pictures from the source documents</p>
        {images.length === 0 ? (
          <p className="text-sm text-muted-foreground">The source documents have no pictures.</p>
        ) : (
          <div className="grid max-h-72 grid-cols-3 gap-2 overflow-y-auto">
            {images.map((img) => (
              <button
                key={img.imageId}
                type="button"
                onClick={() => {
                  onPick(img.imageId)
                  setOpen(false)
                }}
                className={cn(
                  "overflow-hidden rounded border text-left",
                  selected === img.imageId ? "ring-2 ring-primary" : "hover:border-primary/50",
                )}
                title={`${img.namingCode}: ${img.alt}`}
              >
                {img.url ? (
                  <img src={img.url} alt={img.alt} className="h-20 w-full object-cover" />
                ) : (
                  <span className="flex h-20 items-center justify-center text-xs text-muted-foreground">No preview</span>
                )}
                <span className="block truncate px-1 py-0.5 font-mono text-xs text-muted-foreground">{img.namingCode}</span>
              </button>
            ))}
          </div>
        )}
        {selected && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              onPick(null)
              setOpen(false)
            }}
          >
            Remove the picture
          </Button>
        )}
      </PopoverContent>
    </Popover>
  )
}

function IconBtn({
  label,
  onClick,
  disabled,
  danger,
  children,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  danger?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn("rounded p-1.5 text-muted-foreground hover:bg-muted disabled:opacity-30", danger && "hover:text-destructive")}
    >
      {children}
    </button>
  )
}

/** "Why it is wrong", collapsed under the option until opened or filled in. */
function WhyWrong({ value, onChange, letter }: { value: string; onChange: (v: string) => void; letter: string }) {
  const [open, setOpen] = useState(false)
  if (!open)
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-start gap-1 text-left text-xs text-muted-foreground [@media(hover:hover)]:hover:text-foreground"
      >
        <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        {value ? (
          <span className="min-w-0">
            <span className="font-medium">Why it is wrong:</span> {value}
          </span>
        ) : (
          <span>Add why it is wrong (shown after a wrong answer)</span>
        )}
      </button>
    )
  return (
    <GrowTextarea
      value={value}
      autoFocus
      onChange={(e) => onChange(e.target.value)}
      onBlur={() => setOpen(false)}
      placeholder="Why it is wrong (shown after a wrong answer)"
      aria-label={`Why option ${letter} is wrong`}
      className="text-xs"
    />
  )
}
