import { forwardRef } from "react"
import { Factory, FileX2, Loader2, MoreHorizontal, Trash2 } from "lucide-react"
import type { Doc } from "../../../convex/_generated/dataModel"
import { formatTime } from "@/lib/time"
import { cn } from "@/lib/utils"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ENTRY_META, formatDuration } from "./captureUi"

/** An Entry as the Capture queries return it: the row plus its media URL and Asset. */
export type EntryView = Doc<"captureEntries"> & {
  url?: string | null
  mediaUrl?: string | null
  assetCode?: string | null
  assetName?: string | null
  asset?: { code: string; name: string } | null
}

export function entryUrl(e: EntryView): string | null {
  if (e.mediaDeletedAt) return null
  return e.url ?? e.mediaUrl ?? null
}

export function entryAsset(e: EntryView): { code: string; name: string } | null {
  if (e.asset) return e.asset
  if (e.assetCode) return { code: e.assetCode, name: e.assetName ?? "" }
  return null
}

function hasMedia(e: EntryView) {
  return e.kind === "photo" || e.kind === "video" || e.kind === "voice"
}

/**
 * The stream of Entries of one Capture, oldest first. `phone` is the compact
 * live list on the recording screen; `desk` plays media inline and shows the
 * AI transcripts and descriptions.
 */
export function EntryTimeline({
  entries,
  variant,
  highlight,
  onDeleteMedia,
  canDeleteMedia,
  entryRef,
  startedAt,
}: {
  entries: EntryView[]
  variant: "phone" | "desk"
  highlight?: Set<string>
  onDeleteMedia?: (e: EntryView) => void
  canDeleteMedia?: boolean
  entryRef?: (id: string, el: HTMLLIElement | null) => void
  startedAt?: number
}) {
  return (
    <ol className={cn("relative", variant === "desk" ? "space-y-3" : "space-y-2")}>
      {entries.map((e, i) => (
        <EntryRow
          key={e._id}
          ref={(el) => entryRef?.(e._id, el)}
          entry={e}
          index={i + 1}
          variant={variant}
          highlighted={highlight?.has(e._id) ?? false}
          onDeleteMedia={canDeleteMedia && hasMedia(e) && !!e.storageId && !e.mediaDeletedAt ? onDeleteMedia : undefined}
          startedAt={startedAt}
        />
      ))}
    </ol>
  )
}

const EntryRow = forwardRef<
  HTMLLIElement,
  {
    entry: EntryView
    index: number
    variant: "phone" | "desk"
    highlighted: boolean
    onDeleteMedia?: (e: EntryView) => void
    startedAt?: number
  }
>(function EntryRow({ entry: e, index, variant, highlighted, onDeleteMedia, startedAt }, ref) {
  const meta = ENTRY_META[e.kind]
  const Icon = meta.icon
  const url = entryUrl(e)
  const asset = entryAsset(e)
  const desk = variant === "desk"
  const offset = startedAt ? Math.max(0, e.at - startedAt) : null
  const dur = formatDuration(e.durationMs)

  return (
    <li
      ref={ref}
      id={`entry-${e._id}`}
      className={cn(
        "flex gap-3 rounded-xl border bg-card transition-colors duration-500",
        desk ? "p-3" : "p-2.5",
        highlighted && "border-[#9b87f5] bg-[#9b87f5]/10 ring-2 ring-[#9b87f5]/40",
      )}
    >
      <div className="flex shrink-0 flex-col items-center gap-1">
        <span
          className={cn(
            "flex items-center justify-center rounded-full",
            e.kind === "scan" ? "bg-slate-800 text-white" : "bg-muted text-foreground",
            desk ? "h-8 w-8" : "h-9 w-9",
          )}
        >
          <Icon className="h-4 w-4" />
        </span>
        {desk && <span className="text-xs tabular-nums text-muted-foreground">{index}</span>}
      </div>

      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className={cn("font-medium", desk ? "text-sm" : "text-[15px]")}>
            {e.kind === "scan" && asset ? `Scanned ${asset.code}` : meta.label}
          </span>
          <span className="text-[13px] tabular-nums text-muted-foreground">
            {formatTime(e.at)}
            {desk && offset !== null && ` · +${Math.round(offset / 60000)} min`}
            {dur && ` · ${dur}`}
          </span>
          {asset && e.kind !== "scan" && (
            <span className="inline-flex items-center gap-1 rounded-full border bg-background px-1.5 py-0.5 font-mono text-xs text-muted-foreground" title={asset.name}>
              <Factory className="h-3 w-3" />
              {asset.code}
            </span>
          )}
          {onDeleteMedia && (
            <DropdownMenu>
              <DropdownMenuTrigger
                className="ml-auto flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
                aria-label="More for this Entry"
              >
                <MoreHorizontal className="h-4 w-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem className="text-red-700 focus:text-red-700" onSelect={() => onDeleteMedia(e)}>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete the {meta.label.toLowerCase()}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {e.kind === "scan" && asset?.name && <p className="text-sm text-muted-foreground">{asset.name}. The next Entries are tagged with it.</p>}
        {e.text && <p className={cn("whitespace-pre-wrap", desk ? "text-sm" : "text-[15px] leading-snug")}>{e.text}</p>}

        {e.mediaDeletedAt ? (
          <p className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
            <FileX2 className="h-3.5 w-3.5" />
            Media deleted for privacy
          </p>
        ) : (
          <Media entry={e} url={url} desk={desk} />
        )}

        {desk && e.transcript && (
          <p className="rounded-lg bg-muted/60 px-2.5 py-1.5 text-sm">
            <span className="mr-1 text-xs font-medium text-muted-foreground">Transcript</span>
            {e.transcript}
          </p>
        )}
        {desk && e.description && (
          <p className="rounded-lg bg-muted/60 px-2.5 py-1.5 text-sm">
            <span className="mr-1 text-xs font-medium text-muted-foreground">What the AI sees</span>
            {e.description}
          </p>
        )}
        {desk && e.analysis === "failed" && (
          <p className="text-xs text-amber-800">{e.analysisNote ?? "Not analyzed."}</p>
        )}
        {desk && e.analysis === "skipped" && e.analysisNote && (
          <p className="text-xs text-muted-foreground">{e.analysisNote}</p>
        )}
        {!desk && e.analysis === "pending" && (
          <p className="flex items-center gap-1 text-[13px] text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            Being analyzed
          </p>
        )}
        {!desk && (e.transcript || e.description) && (
          <p className="line-clamp-3 text-sm text-muted-foreground">{e.transcript ?? e.description}</p>
        )}
      </div>
    </li>
  )
})

function Media({ entry: e, url, desk }: { entry: EntryView; url: string | null; desk: boolean }) {
  if (!url) {
    if (hasMedia(e) && e.kind === "voice" && !e.storageId)
      return <p className="text-[13px] text-muted-foreground">Voice note kept as a transcript only</p>
    return null
  }
  if (e.kind === "photo")
    return (
      <a href={url} target="_blank" rel="noreferrer" className="block w-fit">
        <img
          src={url}
          alt={e.description ?? "Photo"}
          loading="lazy"
          className={cn("rounded-lg border object-cover", desk ? "max-h-56 max-w-full" : "h-24 w-32")}
        />
      </a>
    )
  if (e.kind === "video")
    return (
      <video
        src={url}
        controls
        playsInline
        preload="metadata"
        className={cn("rounded-lg border bg-black", desk ? "max-h-64 max-w-full" : "h-28 w-full max-w-[220px]")}
      />
    )
  if (e.kind === "voice") return <audio src={url} controls preload="none" className={cn("h-10", desk ? "w-full max-w-sm" : "w-full")} />
  return null
}
