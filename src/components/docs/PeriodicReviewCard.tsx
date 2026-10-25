import { useState } from "react"
import { formatDate } from "@/lib/time"
import { useMutation, useQuery } from "convex/react"
import { toast } from "sonner"
import { CalendarClock, CheckCircle2, GitBranch } from "lucide-react"
import { api } from "../../../convex/_generated/api"
import type { Doc } from "../../../convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { useCheckIn } from "@/lib/checkIn"
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
import { isEngineerOrAdmin } from "@/lib/roles"

const DAY = 24 * 60 * 60 * 1000
const INTERVALS = [6, 12, 24, 36]

function formatDay(at: number) {
  return formatDate(at)
}

// Periodic review (CONTEXT.md) for a Published Document: when it is due, and
// the two possible outcomes. "Still valid" confirms the live version and moves
// the date one interval on; "Start revision" forks the next draft.
export function PeriodicReviewCard({
  doc,
  highlight,
  onStartRevision,
}: {
  doc: Doc<"documents">
  highlight?: boolean
  onStartRevision: () => void
}) {
  const confirm = useMutation(api.documents.confirmReview)
  const setInterval = useMutation(api.documents.setReviewInterval)
  const record = useQuery(api.documents.reviewRecord, { documentId: doc._id })
  const { person } = useCheckIn()
  const org = useQuery(api.orgSettings.get)
  const [confirming, setConfirming] = useState(false)
  const engineer = isEngineerOrAdmin(person) ? person : null

  if (doc.liveVersion == null || doc.status === "archived") return null

  // No interval of its own: the company default (Settings, Documents).
  const months = doc.reviewIntervalMonths ?? org?.documents.reviewIntervalMonths ?? 12
  const intervals = INTERVALS.includes(months)
    ? INTERVALS
    : [...INTERVALS, months].sort((a, b) => a - b)
  const next = doc.nextReviewAt ?? null
  const daysLeft = next == null ? null : Math.ceil((next - Date.now()) / DAY)
  const due = daysLeft != null && daysLeft <= (org?.documents.dueSoonDays ?? 30)
  const revisionInProgress = doc.currentVersion !== doc.liveVersion

  async function run(p: Promise<unknown>, ok: string) {
    try {
      await p
      toast.success(ok)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div
      className={cn(
        "space-y-3 rounded-lg border p-3",
        due && "border-amber-300 bg-amber-50/60 dark:border-amber-500/40 dark:bg-amber-500/10",
        highlight && "ring-2 ring-primary/40",
      )}
    >
      <div className="flex items-center gap-2">
        <CalendarClock className={cn("h-4 w-4", due ? "text-amber-600" : "text-muted-foreground")} />
        <p className="text-xs font-semibold">Periodic review</p>
      </div>
      <div>
        <p className={cn("text-sm font-medium", daysLeft != null && daysLeft < 0 && "text-red-600")}>
          {next == null
            ? "No review date yet"
            : daysLeft! < 0
              ? `Overdue by ${-daysLeft!} ${-daysLeft! === 1 ? "day" : "days"}`
              : daysLeft === 0
                ? "Due today"
                : `Due in ${daysLeft} ${daysLeft === 1 ? "day" : "days"}`}
        </p>
        {next != null && (
          <p className="text-[11px] text-muted-foreground">
            {formatDate(next, true)}
          </p>
        )}
      </div>

      {revisionInProgress ? (
        <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
          <GitBranch className="mt-0.5 h-3 w-3 shrink-0" />
          v{doc.currentVersion} is in progress. Publishing it completes this
          review and sets the next date. Until then v{doc.liveVersion} stays in use.
        </p>
      ) : (
        <div className="flex flex-col gap-1.5">
          <Button
            size="sm"
            variant={due ? "default" : "outline"}
            className="h-7 justify-start gap-1.5 text-xs"
            disabled={!engineer}
            onClick={() => setConfirming(true)}
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            Still valid, confirm v{doc.liveVersion}
          </Button>
          {!engineer && (
            <p className="text-[11px] text-muted-foreground">
              Confirming is a sign-off. Check in as an Engineer (top right) to do it.
            </p>
          )}
          <AlertDialog open={confirming} onOpenChange={setConfirming}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Confirm v{doc.liveVersion} is still valid?</AlertDialogTitle>
                <AlertDialogDescription>
                  This records that {engineer?.name ?? "you"} reviewed v{doc.liveVersion} and
                  it stays in use unchanged. The next review moves to {months} months from
                  today. The record cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => {
                    if (!engineer) return
                    void run(
                      confirm({ id: doc._id, personId: engineer._id }),
                      `v${doc.liveVersion} confirmed as still valid by ${engineer.name}. Next review in ${months} months.`,
                    )
                  }}
                >
                  Confirm as {engineer?.name.split(" ")[0] ?? "Engineer"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          {engineer && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 justify-start gap-1.5 text-xs"
              onClick={onStartRevision}
            >
              <GitBranch className="h-3.5 w-3.5" />
              Needs changes, start revision
            </Button>
          )}
        </div>
      )}

      {record && record.events.length > 0 && (
        <div className="space-y-1 border-t pt-2">
          <p className="text-[11px] font-medium">Review record, v{record.version}</p>
          <ul className="space-y-0.5">
            {record.events.slice(0, 5).map((e, i) => (
              <li key={i} className="text-[11px] text-muted-foreground">
                {e.kind === "published" ? "Published" : "Confirmed still valid"}{" "}
                {formatDay(e.at)}
                {e.by ? ` by ${e.by}` : ""}
              </li>
            ))}
          </ul>
          {record.events.length > 5 && (
            <p className="text-[10px] text-muted-foreground">
              and {record.events.length - 5} earlier
            </p>
          )}
        </div>
      )}

      <div className="flex items-center justify-between gap-2 border-t pt-2">
        <span className="text-[11px] text-muted-foreground">Review every</span>
        <Select
          value={String(months)}
          onValueChange={(v) =>
            void run(
              setInterval({ id: doc._id, months: Number(v) }),
              `Review interval set to ${v} months. The due date now counts from the last review.`,
            )
          }
        >
          <SelectTrigger className="h-7 w-[110px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {intervals.map((m) => (
              <SelectItem key={m} value={String(m)} className="text-xs">
                {m} months
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
