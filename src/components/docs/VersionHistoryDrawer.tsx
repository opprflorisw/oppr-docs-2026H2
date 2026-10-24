import { format } from "date-fns"
import { History } from "lucide-react"
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

function formatDate(ms: number): string {
  try {
    return format(new Date(ms), "MMM d, yyyy · HH:mm")
  } catch {
    return String(ms)
  }
}

function formatDay(ms: number): string {
  try {
    return format(new Date(ms), "MMM d, yyyy")
  } catch {
    return String(ms)
  }
}

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
        <ScrollArea className="-mx-6 mt-4 flex-1 px-6">
          {versions.length === 0 ? (
            <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              No versions yet.
            </div>
          ) : (
            <ul className="space-y-2 pb-6">
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
                return (
                  <li
                    key={v._id}
                    className="rounded-md border bg-background p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold">
                            v{v.version}
                          </span>
                          <Badge variant={state.variant} className="text-[10px]">
                            {state.label}
                          </Badge>
                          {isSelected && (
                            <Badge variant="secondary" className="text-[10px]">
                              Viewing
                            </Badge>
                          )}
                          {v.significantChange && (
                            <Badge
                              variant="outline"
                              className="border-amber-300 bg-amber-50 text-[10px] text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200"
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
                          <p className="text-xs italic text-foreground/80">
                            {v.changeNote}
                          </p>
                        )}
                        {signers.length > 0 && (
                          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 pt-1 text-[11px]">
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
      </SheetContent>
    </Sheet>
  )
}
