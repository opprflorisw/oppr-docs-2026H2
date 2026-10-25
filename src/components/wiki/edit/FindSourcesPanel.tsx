import { useState } from "react"
import { Link } from "wouter"
import { useAction, useMutation, useQuery } from "convex/react"
import { Check, ChevronsUpDown, Loader2, Pin, Plus, Search, Sparkles } from "lucide-react"
import { toast } from "sonner"
import { api } from "../../../../convex/_generated/api"
import type { Id } from "../../../../convex/_generated/dataModel"
import { MAX_PINNED_CHUNKS, type FindSourcesResult, type FoundSource } from "../../../../convex/lib/wikiTypes"
import { Button } from "@/components/ui/button"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Pill, effectiveRow, errorText, headingOf, plural, useRun, type EditCtx, type Panel } from "./editShared"

const BADGE: Record<FoundSource["badge"], { label: string; tone: "green" | "blue" | "grey" }> = {
  inWiki: { label: "In this Wiki", tone: "green" },
  inScopeNotRead: { label: "In Scope, not read", tone: "blue" },
  notInScope: { label: "Not in Scope", tone: "grey" },
}

/**
 * Find sources for a block (spec 3.4): by words, by AI search, or by title
 * and code. Searches run only on a button press. Results are grouped by
 * Document with Add to Scope, Use for this block and Pin passage.
 */
export function FindSourcesPanel({
  ctx,
  panel,
  onClose,
}: {
  ctx: EditCtx
  panel: Extract<Panel, { kind: "find" }>
  onClose: () => void
}) {
  const block = panel.blockId ? effectiveRow(ctx.rows.get(panel.blockId)) : null
  const [mode, setMode] = useState<"words" | "ai" | "title">(panel.query ? "words" : "ai")
  const [query, setQuery] = useState(panel.query ?? "")
  const [result, setResult] = useState<(FindSourcesResult & { viaAi: boolean }) | null>(null)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const findSources = useAction(api.ai.wikiCheck.findSources)
  const allowance = ctx.state.allowance
  const searchesLeft = allowance.person?.wikiFind ?? null

  async function search(kind: "words" | "ai") {
    if (kind === "words" && !query.trim()) return
    setError(null)
    setSearching(true)
    try {
      const r = await findSources({
        wikiId: ctx.wikiId,
        blockId: panel.blockId,
        query: kind === "words" ? query.trim() : panel.blockId ? undefined : headingOf(ctx, panel.sectionId),
        mode: kind,
        personId: ctx.personId,
      })
      setResult({ ...r, viaAi: kind === "ai" })
    } catch (err) {
      setError(errorText(err))
    } finally {
      setSearching(false)
    }
  }

  const forWhat = block?.instruction ?? headingOf(ctx, panel.sectionId)
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-lg">
        <SheetHeader className="space-y-1">
          <SheetTitle>Find sources</SheetTitle>
          <SheetDescription>
            For "{forWhat}". Only Published passages appear; Drafts never do.
          </SheetDescription>
        </SheetHeader>

        <Tabs value={mode} onValueChange={(v) => setMode(v as typeof mode)} className="mt-4 space-y-3">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="ai">AI search</TabsTrigger>
            <TabsTrigger value="words">By words</TabsTrigger>
            <TabsTrigger value="title">By title or code</TabsTrigger>
          </TabsList>

          <TabsContent value="ai" className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Searches the whole library with the section heading and the block's instruction, widened with Glossary
              words.
            </p>
            <Button onClick={() => void search("ai")} disabled={searching || allowance.off} className="gap-1.5">
              {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Search for this block
            </Button>
          </TabsContent>

          <TabsContent value="words">
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                void search("words")
              }}
            >
              <Label htmlFor="find-words" className="sr-only">
                Words to search for
              </Label>
              <Input
                id="find-words"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="first aider extension"
                maxLength={200}
              />
              <Button type="submit" disabled={searching || !query.trim() || allowance.off} className="gap-1.5">
                {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                Search
              </Button>
            </form>
          </TabsContent>

          <TabsContent value="title">
            <TitlePicker ctx={ctx} blockId={panel.blockId ?? null} />
          </TabsContent>
        </Tabs>

        {mode !== "title" && searchesLeft !== null && (
          <p className="mt-2 text-xs text-muted-foreground">{plural(searchesLeft, "search", "searches")} left this hour.</p>
        )}
        {allowance.off && mode !== "title" && (
          <p className="mt-2 text-sm text-muted-foreground">AI is switched off for Wikis. Search by title or code still works.</p>
        )}
        {error && (
          <p role="alert" className="mt-3 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}

        {result && mode !== "title" && (
          <section aria-label="Sources found" className="mt-4 space-y-3" aria-live="polite">
            {result.indexingNote && <p className="text-xs text-amber-800 dark:text-amber-200">{result.indexingNote}</p>}
            {result.sources.length === 0 ? (
              <p className="text-sm text-muted-foreground">No Published passage matched.</p>
            ) : (
              <ul className="space-y-2.5">
                {result.sources.map((s) => (
                  <SourceRow key={s.documentId} ctx={ctx} blockId={panel.blockId ?? null} source={s} viaAi={result.viaAi} />
                ))}
              </ul>
            )}
          </section>
        )}
      </SheetContent>
    </Sheet>
  )
}

function SourceRow({
  ctx,
  blockId,
  source,
  viaAi,
}: {
  ctx: EditCtx
  blockId: string | null
  source: FoundSource
  viaAi: boolean
}) {
  const b = BADGE[source.badge]
  return (
    <li className="space-y-1.5 rounded-md border bg-background p-2.5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        <Link href={`/docs/${source.documentId}`} className="font-mono font-medium hover:underline">
          {source.namingCode} v{source.version}
        </Link>
        <span className="min-w-0 flex-1 truncate text-sm">{source.title}</span>
        <Pill tone={b.tone}>{b.label}</Pill>
        {source.disputedFindingId && (
          <Link href={`/library/findings?f=${source.disputedFindingId}`}>
            <Pill tone="amber">Open finding</Pill>
          </Link>
        )}
      </div>
      <blockquote className="border-l-2 pl-2 text-xs text-foreground/90">
        {source.passage.section && <span className="text-muted-foreground">{source.passage.section}: </span>}
        <span className="line-clamp-4 whitespace-pre-line">{source.passage.text}</span>
      </blockquote>
      {source.areaCode && <p className="text-[11px] text-muted-foreground">Area {source.areaCode}</p>}
      <SourceActions
        ctx={ctx}
        blockId={blockId}
        documentId={source.documentId}
        chunkId={source.passage.chunkId}
        inScope={source.badge !== "notInScope"}
        viaAi={viaAi}
      />
    </li>
  )
}

function SourceActions({
  ctx,
  blockId,
  documentId,
  chunkId,
  inScope,
  viaAi,
}: {
  ctx: EditCtx
  blockId: string | null
  documentId: Id<"documents">
  chunkId: Id<"chunks"> | null
  inScope: boolean
  viaAi: boolean
}) {
  const addToScope = useMutation(api.wikiBlocks.addToScope)
  const updateBlock = useMutation(api.wikiBlocks.updateBlock)
  const { run, pending } = useRun()
  const block = blockId ? effectiveRow(ctx.rows.get(blockId)) : null
  const inSet = !!block && block.sourceSet !== "scope" && block.sourceSet.documentIds.includes(documentId)
  const pinned = !!block && !!chunkId && block.pinnedChunkIds.includes(chunkId)
  const pinFull = !!block && block.pinnedChunkIds.length >= MAX_PINNED_CHUNKS

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {!inScope && (
        <Button
          size="sm"
          variant="outline"
          className="h-7 gap-1 text-xs"
          disabled={pending}
          onClick={() =>
            void run(async () => {
              await addToScope({
                wikiId: ctx.wikiId,
                documentId,
                viaAi,
                ...(blockId ? { forBlockId: blockId } : {}),
                personId: ctx.personId,
              })
              toast.success(blockId ? "Added to Scope. Only this block is regenerated." : "Added to Scope.")
            })
          }
        >
          <Plus className="h-3 w-3" aria-hidden /> Add to Scope
        </Button>
      )}
      {inScope && block && (
        <Button
          size="sm"
          variant="outline"
          className="h-7 gap-1 text-xs"
          disabled={pending || inSet}
          onClick={() =>
            void run(async () => {
              const ids = block.sourceSet === "scope" ? [] : block.sourceSet.documentIds
              await updateBlock({
                wikiId: ctx.wikiId,
                blockId: block.blockId,
                sourceSet: { documentIds: [...ids, documentId] },
                personId: ctx.personId,
              })
              toast.success("This block now reads that Document. Regenerate to use it.")
            })
          }
        >
          {inSet ? <Check className="h-3 w-3" aria-hidden /> : <Plus className="h-3 w-3" aria-hidden />}
          {inSet ? "Used for this block" : "Use for this block"}
        </Button>
      )}
      {inScope && block && chunkId && (
        <Button
          size="sm"
          variant="ghost"
          className="h-7 gap-1 text-xs"
          disabled={pending || pinned || pinFull}
          title={pinFull ? `At most ${MAX_PINNED_CHUNKS} pinned passages per block` : undefined}
          onClick={() =>
            void run(async () => {
              await updateBlock({
                wikiId: ctx.wikiId,
                blockId: block.blockId,
                pinnedChunkIds: [...block.pinnedChunkIds, chunkId],
                personId: ctx.personId,
              })
              toast.success("Passage pinned. It is always read for this block.")
            })
          }
        >
          <Pin className="h-3 w-3" aria-hidden />
          {pinned ? "Pinned" : "Pin passage"}
        </Button>
      )}
      {pending && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" aria-label="Saving" />}
    </div>
  )
}

/** By hand, by title or code: the Published Documents of the library. Filters locally only. */
function TitlePicker({ ctx, blockId }: { ctx: EditCtx; blockId: string | null }) {
  const options = useQuery(api.wikis.scopeOptions)
  const [open, setOpen] = useState(false)
  const [picked, setPicked] = useState<Id<"documents"> | null>(null)
  const docs = options?.documents ?? []
  const doc = docs.find((d) => d._id === picked) ?? null
  const inWiki = new Set(ctx.wiki.sources.map((s) => s.documentId))
  return (
    <div className="space-y-3">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between font-normal">
            {doc ? (
              <span className="truncate">
                <span className="font-mono">{doc.namingCode}</span> {doc.title}
              </span>
            ) : (
              <span className="text-muted-foreground">Pick a Published document</span>
            )}
            <ChevronsUpDown className="h-4 w-4 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <Command>
            <CommandInput placeholder="Title or code" />
            <CommandList>
              <CommandEmpty>No Published document found.</CommandEmpty>
              <CommandGroup>
                {docs.map((d) => (
                  <CommandItem
                    key={d._id}
                    value={`${d.namingCode} ${d.title}`}
                    onSelect={() => {
                      setPicked(d._id)
                      setOpen(false)
                    }}
                  >
                    <span className="font-mono text-xs text-muted-foreground">{d.namingCode}</span>
                    <span className="ml-1.5 truncate text-sm">{d.title}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {doc && (
        <div className="space-y-1.5 rounded-md border bg-background p-2.5">
          <div className="flex items-center gap-2 text-xs">
            <span className="font-mono font-medium">{doc.namingCode}</span>
            <span className="min-w-0 flex-1 truncate text-sm">{doc.title}</span>
            {inWiki.has(doc._id) && <Pill tone="green">In this Wiki</Pill>}
          </div>
          <SourceActions
            ctx={ctx}
            blockId={blockId}
            documentId={doc._id}
            chunkId={null}
            inScope={inWiki.has(doc._id)}
            viaAi={false}
          />
        </div>
      )}
    </div>
  )
}
