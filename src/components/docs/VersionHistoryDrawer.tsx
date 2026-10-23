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

interface VersionHistoryDrawerProps {
  documentId: string
  currentVersion: number
  /** The Published version in use, or null when none (never published). */
  liveVersion: number | null
  /** An archived Document has no version in use any more. */
  archived?: boolean
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

export function VersionHistoryDrawer({
  documentId,
  currentVersion,
  liveVersion,
  archived,
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
                const state = isLive
                  ? { label: "Published, in use", variant: "success" as const }
                  : wasPublished
                    ? { label: archived && v.version === liveVersion ? "Archived" : "Superseded", variant: "secondary" as const }
                    : { label: "Draft, not published", variant: "outline" as const }
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
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {wasPublished
                            ? `Published ${formatDate(v.publishedAt)}`
                            : `Started ${formatDate(v.publishedAt)}`}
                        </div>
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
