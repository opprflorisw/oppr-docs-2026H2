import { useState } from "react"
import { Archive, GitCompare, History, Undo2 } from "lucide-react"
import { formatDate as fmtDay, formatDateTime } from "@/lib/time"
import { useCheckIn } from "@/lib/checkIn"
import { VersionCompareDialog } from "./VersionCompareDialog"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useQuery } from "convex/react"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import type { DocumentStatus } from "@/types"
import { STATUS_LABELS } from "./StatusBadge"

interface VersionHistoryDrawerProps {
  documentId: string
  currentVersion: number
  /** The Published version in use, or null when none (never published). */
  liveVersion: number | null
  /** An archived Document has no version in use any more. */
  archived?: boolean
  /** The Document's status, which is the state of its working version. */
  workingStatus?: DocumentStatus
  /** The version the parent is currently rendering (so we can highlight it). */
  selectedVersion?: number
  onSelect: (version: number) => void
  open: boolean
  onOpenChange: (open: boolean) => void
}

const formatDate = (ms: number) => formatDateTime(ms)
const formatDay = (ms: number) => fmtDay(ms)

const ROLE_LABELS = { author: "Author", reviewer: "Reviewer", approver: "Approver" } as const

export function VersionHistoryDrawer({
  documentId,
  currentVersion,
  liveVersion,
  archived,
  workingStatus,
  selectedVersion,
  onSelect,
  open,
  onOpenChange,
}: VersionHistoryDrawerProps) {
  const versions =
    useQuery(
      api.documents.listVersions,
      open && documentId
        ? { documentId: documentId as Id<"documents"> }
        : "skip",
    ) ?? []
  // Lifecycle events that are not a sign-off: withdrawal, sent back to draft.
  const doc = useQuery(api.documents.get, open && documentId ? { id: documentId as Id<"documents"> } : "skip")
  const { people } = useCheckIn()
  const nameOf = (pid: string | null) => (pid ? (people?.find((p) => p._id === pid)?.name ?? null) : null)
  const events = [...(doc?.history ?? [])].filter((h) => h.kind !== "submitted").sort((x, y) => y.at - x.at)
  const withdrawals = events.filter((e) => e.kind === "withdrawn")
  const [compare, setCompare] = useState<{ from: number; to: number } | null>(null)

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <History className="h-4 w-4" />
            Version history
          </SheetTitle>
          <SheetDescription>
            Every version of this document, newest first, with its state.
          </SheetDescription>
        </SheetHeader>
        {/* Radix wraps the content in a display:table div that grows with its
            widest line; forcing it to block keeps every card inside the sheet. */}
        <ScrollArea className="-mx-6 mt-4 min-h-0 flex-1 px-6 [&_[data-radix-scroll-area-viewport]>div]:!block">
          {versions.length === 0 ? (
            <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              No versions yet.
            </div>
          ) : (
            <ul className="space-y-2 pb-6">
              {withdrawals.map((w) => (
                <li
                  key={`w${w.at}`}
                  className="rounded-md border border-status-archived/30 bg-status-archived-bg p-3 text-sm"
                >
                  <p className="flex items-center gap-1.5 font-medium">
                    <Archive className="h-3.5 w-3.5" />
                    Withdrawn
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(w.at)}
                    {nameOf(w.personId) ? ` by ${nameOf(w.personId)}` : ""}
                  </p>
                  {w.note && <p className="mt-1 text-sm">{w.note}</p>}
                </li>
              ))}
              {versions.map((v) => {
                // Versions are published in order, so everything up to the
                // live version was published once; anything after is a draft.
                const wasPublished = liveVersion != null && v.version <= liveVersion
                const isLive = !archived && v.version === liveVersion
                const isCurrent = v.version === currentVersion
                const isSelected =
                  selectedVersion != null
                    ? v.version === selectedVersion
                    : isCurrent
                // The working version (ahead of the live one) carries the
                // Document's own status: draft, in review or approved.
                const working =
                  !wasPublished && isCurrent && workingStatus && workingStatus !== "archived"
                    ? workingStatus
                    : "draft"
                const state = isLive
                  ? { label: "Published, in use", variant: "success" as const }
                  : wasPublished
                    ? { label: archived && v.version === liveVersion ? "Archived" : "Superseded", variant: "secondary" as const }
                    : { label: STATUS_LABELS[working], variant: "outline" as const }
                // Latest sign-off per role, in lifecycle order.
                const signers = (["author", "reviewer", "approver"] as const)
                  .map((role) => [...v.signers].reverse().find((x) => x.role === role))
                  .filter((x) => x != null)
                const sentBack = events.filter((e) => e.kind === "sent_back" && e.version === v.version)
                const previous = versions.find((x) => x.version === v.version - 1)
                return (
                  <li
                    key={v._id}
                    className="rounded-md border bg-background p-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
                      <div className="min-w-0 flex-1 basis-56 space-y-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="text-sm font-semibold">
                            v{v.version}
                          </span>
                          <Badge variant={state.variant} className="text-xs">
                            {state.label}
                          </Badge>
                          {isSelected && (
                            <Badge variant="secondary" className="text-xs">
                              Viewing
                            </Badge>
                          )}
                          {v.significantChange && (
                            <Badge
                              variant="outline"
                              className="border-amber-300 bg-amber-50 text-xs text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200"
                            >
                              Significant change
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {wasPublished
                            ? `Published ${formatDate(v.publishedAt)}`
                            : `Started ${formatDate(v.publishedAt)}`}
                        </div>
                        {v.changeNote && (
                          <p className="text-sm">
                            <span className="text-muted-foreground">What changed: </span>
                            {v.changeNote}
                          </p>
                        )}
                        {sentBack.map((e) => (
                          <p key={e.at} className="flex items-start gap-1 text-xs text-muted-foreground">
                            <Undo2 className="mt-0.5 h-3 w-3 shrink-0" />
                            <span>
                              Sent back to draft {formatDate(e.at)}
                              {nameOf(e.personId) ? ` by ${nameOf(e.personId)}` : ""}
                              {e.note ? `: ${e.note}` : ""}
                            </span>
                          </p>
                        ))}
                        {previous && (
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                            onClick={() => setCompare({ from: previous.version, to: v.version })}
                          >
                            <GitCompare className="h-3 w-3" />
                            Compare with v{previous.version}
                          </button>
                        )}
                        {signers.length > 0 && (
                          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 pt-1 text-xs">
                            {signers.map((x) => (
                              <div key={x.role} className="contents">
                                <dt className="text-muted-foreground">
                                  {ROLE_LABELS[x.role]}
                                </dt>
                                <dd>
                                  <span className="font-medium">
                                    {x.name ?? "Unknown"}
                                  </span>
                                  <span className="text-muted-foreground">
                                    {x.title ? `, ${x.title}` : ""}
                                    {`, ${formatDay(x.at)}`}
                                  </span>
                                </dd>
                              </div>
                            ))}
                          </dl>
                        )}
                      </div>
                      <Button
                        size="sm"
                        className="shrink-0"
                        variant={isSelected ? "secondary" : "outline"}
                        onClick={() => {
                          onSelect(v.version)
                          onOpenChange(false)
                        }}
                      >
                        View this version
                      </Button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </ScrollArea>
        {compare && (
          <VersionCompareDialog
            documentId={documentId}
            from={compare.from}
            to={compare.to}
            open={compare != null}
            onOpenChange={(o) => !o && setCompare(null)}
          />
        )}
      </SheetContent>
    </Sheet>
  )
}
