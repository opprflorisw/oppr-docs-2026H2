import { useEffect, useState } from "react"
import { Link } from "wouter"
import { useMutation } from "convex/react"
import { CheckCircle2, ClipboardCheck, FileText, GraduationCap, ListChecks, Loader2, ShieldAlert } from "lucide-react"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { errorText } from "./captureUi"

const TYPES = [
  { code: "SOP", label: "SOP", hint: "The standard way to run the job, step by step.", icon: FileText },
  { code: "WI", label: "Work instruction", hint: "One task at one Asset, with photos per step.", icon: ClipboardCheck },
  { code: "LMRA", label: "LMRA", hint: "Last minute risk check from the safety points.", icon: ShieldAlert },
  { code: "LOG", label: "LOGS checklist proposal", hint: "A proposal for a new checklist in Oppr LOGS.", icon: ListChecks },
] as const

/**
 * "Make a Draft" from a Capture or a Capture set. The Draft is a normal
 * document Draft (origin capture): it goes through review like any other and
 * is never Published by the AI. "Make a Training" makes the same Draft and
 * explains that the Training follows once it is Published (ADR 0005).
 */
export function MakeDraftDialog({
  open,
  onOpenChange,
  personId,
  captureId,
  setId,
  defaultTitle,
  forTraining = false,
  blockedReason,
  openVariations = 0,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  personId: Id<"people">
  captureId?: Id<"captures">
  setId?: Id<"captureSets">
  defaultTitle: string
  forTraining?: boolean
  /** Shown above the button when the Draft cannot be made yet. */
  blockedReason?: string | null
  /** Capture set steps whose Variations are still "To decide". */
  openVariations?: number
}) {
  const makeDraft = useMutation(api.captures.drafts.makeDraft)
  const [type, setType] = useState<string>("SOP")
  const [title, setTitle] = useState(defaultTitle)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [made, setMade] = useState<{ documentId: Id<"documents">; namingCode: string; title: string } | null>(null)

  useEffect(() => {
    if (open) {
      setTitle(defaultTitle)
      setError(null)
      setMade(null)
      setType("SOP")
    }
  }, [open, defaultTitle, forTraining])

  async function submit() {
    setBusy(true)
    setError(null)
    try {
      const res = await makeDraft({ personId, captureId, setId, typeCode: type, title: title.trim() || undefined })
      setMade(res)
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="sm:max-w-lg">
        {made ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                Draft {made.namingCode} is ready
              </DialogTitle>
              <DialogDescription>
                {made.title}. It is a Draft: read it, fix what the AI got wrong, then send it for review as usual.
              </DialogDescription>
            </DialogHeader>
            {forTraining && (
              <div className="flex gap-3 rounded-lg border border-[#9b87f5]/40 bg-[#9b87f5]/10 p-3 text-sm">
                <GraduationCap className="mt-0.5 h-4 w-4 shrink-0 text-[#6E59A5]" />
                <p>
                  The Training comes next. Trainings are made only from Published documents, so once {made.namingCode} is
                  reviewed and Published, open it and choose "Make a Training" under Trainings.
                </p>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Close
              </Button>
              <Button asChild>
                <Link href={`/docs/${made.documentId}/edit`}>Open the Draft</Link>
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{forTraining ? "Make a Training" : "Make a Draft"}</DialogTitle>
              <DialogDescription>
                {forTraining
                  ? "A Training needs a Published document first. Oppr makes the Draft now; after review and publishing, you make the Training from it."
                  : setId
                    ? "Oppr writes a Draft from the combined steps and your choices, with the evidence photos and a note of which Captures it came from."
                    : "Oppr writes a Draft from the Moments of this Capture, with the evidence photos and a note of where it came from."}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Type</Label>
                <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Document type">
                  {TYPES.filter((t) => !forTraining || t.code === "SOP" || t.code === "WI").map((t) => {
                    const Icon = t.icon
                    const on = type === t.code
                    return (
                      <button
                        key={t.code}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        onClick={() => setType(t.code)}
                        className={cn(
                          "flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors",
                          on ? "border-[#6E59A5] bg-[#9b87f5]/10 ring-1 ring-[#6E59A5]" : "hover:bg-muted/50",
                        )}
                      >
                        <span className="flex items-center gap-1.5 text-sm font-medium">
                          <Icon className="h-4 w-4" />
                          {t.label}
                        </span>
                        <span className="text-xs text-muted-foreground">{t.hint}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="draft-title">Title</Label>
                <Input id="draft-title" value={title} onChange={(e) => setTitle(e.target.value)} />
              </div>
              {openVariations > 0 && !blockedReason && (
                <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                  {openVariations} {openVariations === 1 ? "step is" : "steps are"} still To decide. The Draft uses the
                  common way and lists {openVariations === 1 ? "it" : "them"} as open points to settle before review.
                </p>
              )}
              {(error || blockedReason) && (
                <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900" role="alert">
                  {error ?? blockedReason}
                </p>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
                Cancel
              </Button>
              <Button onClick={() => void submit()} disabled={busy || !!blockedReason}>
                {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                {busy ? "Writing the Draft" : "Make the Draft"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
