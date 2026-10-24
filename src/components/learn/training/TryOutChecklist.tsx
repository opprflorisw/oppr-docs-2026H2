// The try-out checklist (TWI step 3): the trainer watches the person do the
// job and marks each item OK or Coach. Items come from the Training's
// breakdown (each step, its key points, then "Explained the reason"), else
// from the version's own try-out checklist, else from the objectives; the
// server builds that list (tryOuts.get().checklist). Used on the phone at
// /m/tryout/:requestId and on the desktop Skill cell sheet.

import { Check, ShieldAlert, Wrench } from "lucide-react"
import { cn } from "@/lib/utils"
import { Textarea } from "@/components/ui/textarea"
import { useIsFloor } from "./lib"

export type TryOutMark = { result: "ok" | "coach"; note?: string }
export type TryOutMarks = Record<string, TryOutMark>

interface BreakdownLike {
  step: string
  keyPoints: string[]
  keyPointKinds?: ("safety" | "quality" | "knack")[] | null
}

/** Which checklist items are safety key points (shown with a red marker). */
export function safetyItems(breakdown: BreakdownLike[] | null | undefined): Set<string> {
  const out = new Set<string>()
  for (const b of breakdown ?? []) b.keyPoints.forEach((k, i) => b.keyPointKinds?.[i] === "safety" && out.add(k))
  return out
}

/** Step titles of the breakdown, so the list can show them as headings. */
export function stepItems(breakdown: BreakdownLike[] | null | undefined): Set<string> {
  return new Set((breakdown ?? []).map((b) => b.step))
}

/** The marks as tryOuts.sign wants them, in checklist order. */
export function marksToItems(items: string[], marks: TryOutMarks) {
  return items.map((label) => ({
    label,
    result: marks[label]?.result ?? ("coach" as const),
    ...(marks[label]?.note?.trim() ? { note: marks[label]!.note!.trim() } : {}),
  }))
}

export function TryOutChecklist({
  items,
  breakdown,
  marks,
  onChange,
  disabled = false,
}: {
  items: string[]
  breakdown?: BreakdownLike[] | null
  marks: TryOutMarks
  onChange: (next: TryOutMarks) => void
  disabled?: boolean
}) {
  const floor = useIsFloor()
  const safety = safetyItems(breakdown)
  const steps = stepItems(breakdown)
  const set = (label: string, mark: TryOutMark | null) => {
    const next = { ...marks }
    if (mark) next[label] = mark
    else delete next[label]
    onChange(next)
  }
  return (
    <ol className="space-y-2" data-tryout-checklist>
      {items.map((label, i) => {
        const m = marks[label]
        const isStep = steps.has(label)
        return (
          <li
            key={`${i}-${label}`}
            data-tryout-item
            className={cn(
              "space-y-2 rounded-xl border bg-card p-3",
              isStep && "border-primary/40",
              safety.has(label) && "border-red-300 dark:border-red-500/40",
            )}
          >
            <p className={cn("flex items-start gap-2 leading-snug", floor ? "text-base" : "text-sm", isStep && "font-semibold")}>
              {safety.has(label) && <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-600" aria-label="Safety" />}
              <span>{label}</span>
            </p>
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={label}>
              <button
                type="button"
                role="radio"
                aria-checked={m?.result === "ok"}
                disabled={disabled}
                data-mark="ok"
                onClick={() => set(label, m?.result === "ok" ? null : { result: "ok" })}
                className={cn(
                  "flex h-14 items-center justify-center gap-2 rounded-xl border-2 text-base font-semibold transition-colors",
                  m?.result === "ok"
                    ? "border-emerald-600 bg-emerald-600 text-white"
                    : "border-border [@media(hover:hover)]:hover:border-emerald-400",
                )}
              >
                <Check className="h-5 w-5" /> OK
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={m?.result === "coach"}
                disabled={disabled}
                data-mark="coach"
                onClick={() => set(label, m?.result === "coach" ? null : { result: "coach", note: m?.note })}
                className={cn(
                  "flex h-14 items-center justify-center gap-2 rounded-xl border-2 text-base font-semibold transition-colors",
                  m?.result === "coach"
                    ? "border-amber-500 bg-amber-500 text-white"
                    : "border-border [@media(hover:hover)]:hover:border-amber-400",
                )}
              >
                <Wrench className="h-5 w-5" /> Coach
              </button>
            </div>
            {m?.result === "coach" && (
              <Textarea
                value={m.note ?? ""}
                disabled={disabled}
                onChange={(e) => set(label, { result: "coach", note: e.target.value })}
                rows={2}
                placeholder="What to practise"
                className={cn("resize-none bg-background", floor ? "text-base" : "text-sm")}
              />
            )}
          </li>
        )
      })}
    </ol>
  )
}
