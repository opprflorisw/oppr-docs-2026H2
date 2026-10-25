// "Create an image" through a few guided questions: what, where, viewpoint,
// style and safety marks. The answers become a prompt the person sees and may
// edit, the Gemini image model draws it, and the image lands in the library
// (kind "generated", prompt and alt text kept). Insert places it; nothing is
// placed without pressing Insert.
import { useEffect, useMemo, useState } from "react"
import { useAction } from "convex/react"
import { ArrowLeft, ImagePlus, Loader2, RotateCcw, Wand2 } from "lucide-react"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { useCheckIn } from "@/lib/checkIn"
import { cn } from "@/lib/utils"
import type { PickedImage } from "@/components/images/ImagePickerDialog"
import { guidedErrorText } from "./GuidedCreation"

export interface ImageAnswers {
  what: string
  where: string
  viewpoint: string
  style: string
  safety: string[]
}

const EMPTY_IMAGE_ANSWERS: ImageAnswers = { what: "", where: "", viewpoint: "", style: "", safety: [] }

const VIEWPOINTS = ["Close-up of the hands at work", "Operator's view", "Side view of the machine", "Overview of the area"]
const STYLES = ["Realistic photo", "Simple illustration", "Technical line drawing"]
const SAFETY = [
  "PPE worn correctly",
  "Warning sign in view",
  "Danger zone marked on the floor",
  "Lockout padlock and tag",
  "Emergency stop highlighted",
]

const STYLE_PROMPT: Record<string, string> = {
  "Realistic photo": "Realistic documentary photo, natural factory light, sharp focus",
  "Simple illustration": "Clean flat vector illustration, limited colour palette, white background",
  "Technical line drawing": "Technical line drawing in black on white, isometric, like a maintenance manual",
}

/** "Operator checks" -> "operator checks"; codes and abbreviations ("EXL-201", "PPE") stay. */
function lowerFirst(s: string): string {
  return /^[A-Z][a-z]/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s
}

const upperFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

// Verbs a step usually starts with. A step sentence ("Inspect the saw blade
// for wear") is an instruction, not a picture: it becomes "an operator
// inspecting the saw blade for wear".
const STEP_VERBS = new Set(
  "add adjust apply attach brush call carry change check clean clear close confirm connect cool cut disconnect do drain dry empty ensure fill fit flush grease heat hold inspect install isolate keep label lift load lock log lower lubricate make measure mix mount move note open perform place pour press pull purge push put read record refit release remove replace report reset restart rinse run scan scrape secure set sign spray start stop store sweep switch take tighten loosen test turn unload unlock vacuum verify wait walk wear weigh wipe write".split(" "),
)
// "Do the LMRA ..." : a first word followed by one of these reads as an instruction.
const DETERMINERS = new Set(["the", "a", "an", "all", "each", "every", "both", "it", "them", "that", "this", "these", "those", "any", "your"])
const NAMING_CODE = /\s*\b[A-Z]{2,4}-[A-Z]{2,4}-[A-Z]+-\d{4}\b/g

function gerund(verb: string): string {
  if (verb === "lie") return "lying"
  if (/ie$/.test(verb)) return verb.slice(0, -2) + "ying"
  if (/[^aeiou]e$/.test(verb) && verb !== "be") return verb.slice(0, -1) + "ing"
  // Short verbs that end consonant-vowel-consonant double the last letter (cut, set, put, stop, run).
  if (/^[^aeiou]*[aeiou][bdgklmnprt]$/.test(verb)) return verb + verb.slice(-1) + "ing"
  return verb + "ing"
}

/**
 * The subject as a picture: a step sentence becomes "an operator <verb>ing
 * ...", up to the first comma or "and", so the image shows one moment.
 */
function pictureSubject(what: string): string {
  // Document codes mean nothing in a picture (and the image has no text).
  const t = what.replace(NAMING_CODE, "").trim().replace(/[.!]+$/, "")
  const m = t.match(/^([A-Za-z]+)\b\s*(.*)$/)
  const verb = m?.[1].toLowerCase() ?? ""
  const next = m?.[2].split(/\s+/)[0]?.toLowerCase() ?? ""
  if (!m || !(STEP_VERBS.has(verb) || (DETERMINERS.has(next) && !DETERMINERS.has(verb)))) return lowerFirst(t)
  const rest = m[2]
    .split(/,|;|\s+and\s+|\s+then\s+|\s+if\s+|\s+because\s+|\s+so that\s+|\s+until\s+|\s+before\s+|\s+after\s+/i)[0]
    .trim()
  return `an operator ${gerund(verb)}${rest ? ` ${rest}` : ""}`
}

function joinList(items: string[]): string {
  if (items.length <= 1) return items.join("")
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`
}

/** The prompt the image model receives (before the server's house rules). */
function composeImagePrompt(a: ImageAnswers): string {
  const parts = [
    a.what.trim() && `Show ${pictureSubject(a.what)}.`,
    a.where.trim() && `Setting: ${lowerFirst(a.where.trim().replace(/\.$/, ""))}.`,
    a.viewpoint.trim() && `Viewpoint: ${lowerFirst(a.viewpoint.trim())}.`,
    a.style.trim() && `${STYLE_PROMPT[a.style] ?? a.style.trim()}.`,
    a.safety.length > 0 && `Make these clearly visible: ${joinList(a.safety.map(lowerFirst))}.`,
  ]
  return parts.filter(Boolean).join(" ")
}

const STYLE_CAPTION: Record<string, string> = {
  "Simple illustration": "Illustration: ",
  "Technical line drawing": "Line drawing: ",
}

/** A caption that says what the picture shows, not the step it belongs to. */
function composeAlt(a: ImageAnswers): string {
  const subject = upperFirst(pictureSubject(a.what))
  const close = /close-up/i.test(a.viewpoint) ? ", close-up" : ""
  return `${STYLE_CAPTION[a.style] ?? ""}${subject}${close}`.slice(0, 160)
}

type Step = "what" | "where" | "viewpoint" | "style" | "safety" | "prompt" | "result"
const QUESTION_STEPS: Step[] = ["what", "where", "viewpoint", "style", "safety"]

export function CreateImageDialog({
  open,
  onOpenChange,
  initial,
  whereSuggestions = [],
  areaCodes,
  assetIds,
  onInsert,
  insertLabel = "Insert",
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  initial?: Partial<ImageAnswers>
  /** Quick answers for "Where", for example the Document's area and Assets. */
  whereSuggestions?: string[]
  areaCodes?: string[]
  assetIds?: Id<"assets">[]
  onInsert: (image: PickedImage) => void
  insertLabel?: string
}) {
  const generate = useAction(api.ai.imageGen.generate)
  const { person } = useCheckIn()
  const engineer = person && (person.kind === "engineer" || (person.kind as string) === "admin") ? person : null
  const [answers, setAnswers] = useState<ImageAnswers>(EMPTY_IMAGE_ANSWERS)
  const [step, setStep] = useState<Step>("what")
  const [prompt, setPrompt] = useState("")
  const [alt, setAlt] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<PickedImage | null>(null)

  useEffect(() => {
    if (!open) return
    setAnswers({ ...EMPTY_IMAGE_ANSWERS, ...initial, safety: initial?.safety ?? [] })
    setStep(initial?.what?.trim() ? "where" : "what")
    setPrompt("")
    setAlt("")
    setError(null)
    setResult(null)
    setBusy(false)
    // initial is read only on open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const set = (patch: Partial<ImageAnswers>) => setAnswers((a) => ({ ...a, ...patch }))
  const index = QUESTION_STEPS.indexOf(step)

  function next() {
    if (index >= 0 && index < QUESTION_STEPS.length - 1) setStep(QUESTION_STEPS[index + 1])
    else if (step === "safety") {
      setPrompt(composeImagePrompt(answers))
      setAlt(composeAlt(answers))
      setStep("prompt")
    }
  }
  function back() {
    if (step === "result") setStep("prompt")
    else if (step === "prompt") setStep("safety")
    else if (index > 0) setStep(QUESTION_STEPS[index - 1])
  }

  async function run() {
    if (!engineer || busy) return
    setBusy(true)
    setError(null)
    try {
      const r = await generate({
        personId: engineer._id,
        prompt,
        altText: alt,
        ...(areaCodes?.length ? { areaCodes } : {}),
        ...(assetIds?.length ? { assetIds } : {}),
      })
      setResult({ imageId: r.imageId, url: r.url, altText: r.altText })
      setStep("result")
    } catch (err) {
      setError(guidedErrorText(err, "The image could not be created. Try again."))
    } finally {
      setBusy(false)
    }
  }

  const canNext = step !== "what" || answers.what.trim().length >= 3
  const title = useMemo(() => {
    switch (step) {
      case "what":
        return "What should the image show?"
      case "where":
        return "Where in the plant?"
      case "viewpoint":
        return "From which viewpoint?"
      case "style":
        return "In which style?"
      case "safety":
        return "Which safety marks should be visible?"
      case "prompt":
        return "Check the description"
      case "result":
        return "Your image"
    }
  }, [step])

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-w-lg gap-0 p-0" onOpenAutoFocus={(e) => e.preventDefault()}>
        <div className="border-b px-5 py-3 pr-12">
          <DialogTitle className="flex items-center gap-1.5 text-sm">
            <Wand2 className="h-4 w-4 text-primary" /> Create an image
          </DialogTitle>
          <DialogDescription className="text-xs">
            {index >= 0
              ? `Question ${index + 1} of ${QUESTION_STEPS.length}. Skip what does not matter.`
              : "The image is saved in the image library, so it can be reused."}
          </DialogDescription>
          {index >= 0 && (
            <div className="mt-2 flex gap-1" aria-hidden>
              {QUESTION_STEPS.map((s, i) => (
                <span key={s} className={cn("h-1 flex-1 rounded-full", i <= index ? "bg-primary" : "bg-muted")} />
              ))}
            </div>
          )}
        </div>

        <div className="space-y-3 px-5 py-4">
          <p className="text-sm font-medium">{title}</p>

          {step === "what" && (
            <Textarea
              autoFocus
              value={answers.what}
              onChange={(e) => set({ what: e.target.value })}
              rows={3}
              placeholder="For example: an operator checking the melt temperature on the extruder display"
              aria-label="What the image shows"
            />
          )}

          {step === "where" && (
            <>
              <Input
                autoFocus
                value={answers.where}
                onChange={(e) => set({ where: e.target.value })}
                placeholder="For example: at extrusion line 2"
                aria-label="Where in the plant"
              />
              <Chips options={whereSuggestions} value={answers.where} onPick={(where) => set({ where })} />
            </>
          )}

          {step === "viewpoint" && (
            <Chips options={VIEWPOINTS} value={answers.viewpoint} onPick={(viewpoint) => set({ viewpoint })} />
          )}

          {step === "style" && <Chips options={STYLES} value={answers.style} onPick={(style) => set({ style })} />}

          {step === "safety" && (
            <div className="flex flex-wrap gap-1.5">
              {SAFETY.map((s) => {
                const on = answers.safety.includes(s)
                return (
                  <button
                    key={s}
                    type="button"
                    aria-pressed={on}
                    onClick={() => set({ safety: on ? answers.safety.filter((x) => x !== s) : [...answers.safety, s] })}
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-xs transition-colors",
                      on ? "border-primary bg-primary/10 font-medium text-primary" : "hover:border-primary/50",
                    )}
                  >
                    {s}
                  </button>
                )
              })}
            </div>
          )}

          {step === "prompt" && (
            <div className="space-y-3">
              <label className="block space-y-1">
                <span className="text-xs text-muted-foreground">What the image model is asked to draw</span>
                <Textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={5} />
              </label>
              <label className="block space-y-1">
                <span className="text-xs text-muted-foreground">Caption readers see under the picture</span>
                <Input value={alt} onChange={(e) => setAlt(e.target.value)} />
              </label>
              {!engineer && (
                <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100">
                  Check in as an Engineer (top right) to create images.
                </p>
              )}
            </div>
          )}

          {step === "result" && result && (
            <div className="space-y-2">
              {result.url ? (
                <img src={result.url} alt={result.altText} className="max-h-80 w-full rounded-md border object-contain" />
              ) : (
                <p className="text-sm text-muted-foreground">The image is saved but cannot be shown yet.</p>
              )}
              <p className="text-xs text-muted-foreground">{result.altText}</p>
              <p className="text-xs text-muted-foreground">Saved in the image library as a generated image.</p>
            </div>
          )}

          {error && (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t px-5 py-3">
          <Button size="sm" variant="ghost" onClick={back} disabled={busy || step === "what"}>
            <ArrowLeft className="mr-1 h-3.5 w-3.5" /> Back
          </Button>
          <div className="flex items-center gap-2">
            {index >= 0 && (
              <Button size="sm" onClick={next} disabled={!canNext}>
                {step === "safety" ? "Show description" : "Next"}
              </Button>
            )}
            {step === "prompt" && (
              <Button size="sm" onClick={() => void run()} disabled={busy || !engineer || prompt.trim().length < 10 || !alt.trim()}>
                {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Wand2 className="mr-1.5 h-3.5 w-3.5" />}
                {busy ? "Creating, about 10 s" : "Create image"}
              </Button>
            )}
            {step === "result" && result && (
              <>
                <Button size="sm" variant="outline" onClick={() => void run()} disabled={busy}>
                  {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="mr-1.5 h-3.5 w-3.5" />}
                  Try again
                </Button>
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={() => {
                    onInsert(result)
                    onOpenChange(false)
                  }}
                >
                  <ImagePlus className="mr-1.5 h-3.5 w-3.5" /> {insertLabel}
                </Button>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Chips({ options, value, onPick }: { options: string[]; value: string; onPick: (v: string) => void }) {
  if (options.length === 0) return null
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          aria-pressed={value === o}
          onClick={() => onPick(value === o ? "" : o)}
          className={cn(
            "rounded-full border px-2.5 py-1 text-xs transition-colors",
            value === o ? "border-primary bg-primary/10 font-medium text-primary" : "hover:border-primary/50",
          )}
        >
          {o}
        </button>
      ))}
    </div>
  )
}
