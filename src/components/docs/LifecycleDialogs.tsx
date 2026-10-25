// The two document-control decisions that need more than a click:
//   SubmitForReviewDialog  "Who reviews and approves <code>?" with Engineer
//                          pickers and, for v2 and later, the required change
//                          note "What changed and why".
//   PublishDocumentDialog  "What kind of change is this?" with the impact of
//                          publishing (Trainings, Skill holders, Wikis).
// Four-eyes is enforced on the server (convex/documents.ts); these dialogs
// explain it up front so nobody hits a refusal.

import { useEffect, useMemo, useState } from "react"
import { useMutation, useQuery } from "convex/react"
import { AlertTriangle, BookOpenText, GraduationCap, Loader2, Send, Upload, Users } from "lucide-react"
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
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useCheckIn } from "@/lib/checkIn"
import { cn } from "@/lib/utils"
import { isEngineerOrAdmin } from "@/lib/roles"

export function serverMessage(err: unknown, fallback: string): string {
  if (err && typeof err === "object" && "data" in err && typeof (err as { data: unknown }).data === "string")
    return (err as { data: string }).data
  if (err instanceof Error) {
    const m = err.message.match(/(?:Uncaught (?:Convex)?Error: )([^\n]+)/)
    return m ? m[1] : err.message
  }
  return fallback
}

const NONE = "__none__"

function EngineerPicker({
  id,
  label,
  value,
  onChange,
  exclude,
}: {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  exclude?: string[]
}) {
  const { people } = useCheckIn()
  const engineers = (people ?? []).filter((p) => isEngineerOrAdmin(p))
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value || NONE} onValueChange={(v) => onChange(v === NONE ? "" : v)}>
        <SelectTrigger id={id} className="h-9">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>Choose an Engineer</SelectItem>
          {engineers.map((p) => (
            <SelectItem key={p._id} value={p._id} disabled={exclude?.includes(p._id)}>
              {p.name} <span className="text-muted-foreground">· {p.role}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

export function SubmitForReviewDialog({
  open,
  onOpenChange,
  documentId,
  namingCode,
  isNewVersion,
  initialReviewer,
  initialApprover,
  initialNote,
  beforeSubmit,
  onSubmitted,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  documentId: Id<"documents">
  namingCode: string
  /** v2 and later: the change note is required. */
  isNewVersion: boolean
  initialReviewer?: string | null
  initialApprover?: string | null
  initialNote?: string | null
  /** Save the editor first; return false to stop. */
  beforeSubmit?: (roles: { reviewerPersonId: string; approverPersonId: string }) => Promise<boolean>
  onSubmitted?: () => void
}) {
  const { person } = useCheckIn()
  const submit = useMutation(api.documents.submitForReview)
  // Approval rules (Settings, Documents): four-eyes and the change note.
  const rules = useQuery(api.orgSettings.get)?.documents
  const fourEyes = rules?.fourEyes ?? true
  const noteRequired = isNewVersion && (rules?.requireChangeNote ?? true)
  const [reviewer, setReviewer] = useState("")
  const [approver, setApprover] = useState("")
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setReviewer(initialReviewer ?? "")
    setApprover(initialApprover ?? "")
    setNote(initialNote ?? "")
    setError(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const blocked = !person
    ? "Check in to submit it in your name."
    : !reviewer
      ? "Choose who reviews it."
      : fourEyes && person && reviewer === person._id
        ? "You are writing it, so another Engineer must review it."
        : fourEyes && approver && approver === reviewer
          ? "The reviewer and the approver must be two different Engineers."
          : noteRequired && !note.trim()
            ? "Write what changed and why."
            : null

  async function go() {
    if (blocked || !person) return
    setBusy(true)
    setError(null)
    try {
      if (beforeSubmit && !(await beforeSubmit({ reviewerPersonId: reviewer, approverPersonId: approver }))) return
      await submit({
        id: documentId,
        personId: person._id,
        reviewerPersonId: reviewer as Id<"people">,
        ...(approver ? { approverPersonId: approver as Id<"people"> } : {}),
        ...(note.trim() ? { changeNote: note.trim() } : {}),
      })
      onSubmitted?.()
      onOpenChange(false)
    } catch (err) {
      setError(serverMessage(err, "It could not be submitted for review."))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Who reviews and approves {namingCode}?</DialogTitle>
          <DialogDescription>
            The reviewer reads it and approves it, then the approver publishes it. Neither can be the
            person who wrote it, and they must be two different Engineers.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <EngineerPicker
              id="submit-reviewer"
              label="Reviewer"
              value={reviewer}
              onChange={setReviewer}
              exclude={fourEyes && person ? [person._id] : []}
            />
            <EngineerPicker id="submit-approver" label="Approver" value={approver} onChange={setApprover} exclude={fourEyes && reviewer ? [reviewer] : []} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="submit-note">
              What changed and why{noteRequired ? "" : isNewVersion ? " (optional)" : " (optional for a first version)"}
            </Label>
            <Textarea
              id="submit-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="For example: purge time raised from 3 to 5 minutes after the October trial."
            />
            <p className="text-xs text-muted-foreground">
              Shown in the version history and to everyone re-trained after this change.
            </p>
          </div>
          {error && (
            <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
        <DialogFooter className="items-center gap-2">
          {blocked && <span className="mr-auto text-xs text-muted-foreground">{blocked}</span>}
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => void go()} disabled={busy || blocked != null}>
            {busy ? <Loader2 className="animate-spin" /> : <Send />}
            Submit for review
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

type ChangeKind = "minor" | "significant"

export function PublishDocumentDialog({
  open,
  onOpenChange,
  documentId,
  namingCode,
  version,
  initialNote,
  onPublished,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  documentId: Id<"documents">
  namingCode: string
  version: number
  initialNote?: string | null
  onPublished?: () => void
}) {
  const { person } = useCheckIn()
  const engineer = isEngineerOrAdmin(person) ? person : null
  const publish = useMutation(api.documents.publish)
  const impact = useQuery(api.documents.publishImpact, open ? { id: documentId } : "skip")
  const [kind, setKind] = useState<ChangeKind | null>(null)
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const isNewVersion = impact?.isNewVersion ?? false

  useEffect(() => {
    if (!open) return
    setKind(null)
    setNote(initialNote ?? "")
    setError(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])
  // Significant is forced when a cited passage is gone, and preselected when a
  // number, unit or WARNING/DANGER passage changed.
  useEffect(() => {
    if (!open || !impact || kind != null) return
    if (impact.suggestedSignificant) setKind("significant")
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, impact])

  const impactLines = useMemo(() => {
    if (!impact) return []
    const lines: { icon: typeof Users; text: string; tone?: "warn" }[] = []
    const sig = kind === "significant"
    const skillNames = impact.skills.map((s) => s.name)
    if (impact.holders > 0)
      lines.push({
        icon: Users,
        text: sig
          ? `Flags re-training for ${impact.holders} ${impact.holders === 1 ? "holder" : "holders"} of ${skillNames.join(", ")}.`
          : `${impact.holders} ${impact.holders === 1 ? "person holds" : "people hold"} ${skillNames.join(", ")}. A wording change does not flag them.`,
        tone: sig ? "warn" : undefined,
      })
    if (impact.trainings.length > 0)
      lines.push({
        icon: GraduationCap,
        text: sig
          ? `Sends ${impact.trainings.map((t) => t.code).join(", ")} back to review.`
          : `${impact.trainings.map((t) => t.code).join(", ")} ${impact.trainings.length === 1 ? "uses" : "use"} this document and stay as they are.`,
        tone: sig ? "warn" : undefined,
      })
    if (impact.wikis.length > 0)
      lines.push({
        icon: BookOpenText,
        text: `Rebuilds ${impact.wikis.length} ${impact.wikis.length === 1 ? "Wiki" : "Wikis"}: ${impact.wikis.map((w) => w.title).join(", ")}.`,
      })
    return lines
  }, [impact, kind])

  const blocked = !engineer
    ? "Check in as an Engineer to publish."
    : impact === undefined
      ? "Working out the impact..."
      : isNewVersion && kind == null
        ? "Choose what kind of change this is."
        : null

  async function go() {
    if (blocked || !engineer) return
    setBusy(true)
    setError(null)
    try {
      await publish({
        id: documentId,
        personId: engineer._id,
        ...(isNewVersion ? { significantChange: kind === "significant" } : {}),
        ...(note.trim() ? { changeNote: note.trim() } : {}),
      })
      onPublished?.()
      onOpenChange(false)
    } catch (err) {
      setError(serverMessage(err, "It could not be published."))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            Publish {namingCode} v{version}?
          </DialogTitle>
          <DialogDescription>
            Publishing makes this version Knowledge: Operators, Ask and Wikis start using it
            {isNewVersion ? ` and v${impact?.liveVersion} stops being used` : ""}. The sign-off is recorded in the
            name of {engineer?.name ?? "the checked-in Engineer"}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {isNewVersion && (
            <fieldset className="space-y-2">
              <legend className="mb-1 text-sm font-medium">What kind of change is this?</legend>
              <div role="radiogroup" aria-label="What kind of change is this?" className="space-y-2">
                <ChangeOption
                  value="minor"
                  selected={kind === "minor"}
                  disabled={impact?.forcedSignificant ?? false}
                  onSelect={() => setKind("minor")}
                  title="Wording or typo only"
                  text="How the work is done stays the same. Trainings and Skills are not affected."
                />
                <ChangeOption
                  value="significant"
                  selected={kind === "significant"}
                  onSelect={() => setKind("significant")}
                  title="Changes how the work is done (Significant change)"
                  text="Trainings built on it go back to review and holders of linked Skills are flagged for re-training."
                />
              </div>
              {impact && impact.reasons.length > 0 && (
                <p className="flex items-start gap-1.5 text-xs text-amber-800 dark:text-amber-200">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    {impact.reasons.join(" ")}
                    {impact.forcedSignificant ? " So this is a Significant change." : " That usually means a Significant change."}
                  </span>
                </p>
              )}
            </fieldset>
          )}

          <div className="space-y-2 rounded-md border bg-muted/30 p-3">
            <p className="text-sm font-medium">What publishing does</p>
            {impact === undefined ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Working out the impact...
              </p>
            ) : impactLines.length === 0 ? (
              <p className="text-sm text-muted-foreground">No Training, Skill or Wiki uses this document yet.</p>
            ) : (
              <ul className="space-y-1.5" data-testid="publish-impact">
                {impactLines.map((l, i) => (
                  <li key={i} className={cn("flex items-start gap-2 text-sm", l.tone === "warn" && "text-amber-900 dark:text-amber-100")}>
                    <l.icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <span>{l.text}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {isNewVersion && (
            <div className="space-y-1.5">
              <Label htmlFor="publish-note">What changed and why</Label>
              <Textarea id="publish-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
            </div>
          )}

          {error && (
            <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
        </div>

        <DialogFooter className="items-center gap-2">
          {blocked && <span className="mr-auto text-xs text-muted-foreground">{blocked}</span>}
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => void go()} disabled={busy || blocked != null}>
            {busy ? <Loader2 className="animate-spin" /> : <Upload />}
            Publish v{version}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ChangeOption({
  value,
  selected,
  disabled,
  onSelect,
  title,
  text,
}: {
  value: ChangeKind
  selected: boolean
  disabled?: boolean
  onSelect: () => void
  title: string
  text: string
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      data-value={value}
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        "flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors",
        selected ? "border-primary bg-primary/5" : "hover:bg-muted/50",
        disabled && "cursor-not-allowed opacity-60 hover:bg-transparent",
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
          selected ? "border-primary" : "border-muted-foreground/40",
        )}
      >
        {selected && <span className="h-2 w-2 rounded-full bg-primary" />}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium">{title}</span>
        <span className="block text-xs text-muted-foreground">{text}</span>
      </span>
    </button>
  )
}
