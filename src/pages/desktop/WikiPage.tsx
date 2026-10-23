import { useState } from "react"
import { useMutation, useQuery } from "convex/react"
import { Link, useLocation, useRoute } from "wouter"
import { toast } from "sonner"
import {
  AlertTriangle,
  BookOpenText,
  FileText,
  Loader2,
  MoreHorizontal,
  RefreshCw,
  SlidersHorizontal,
  Trash2,
} from "lucide-react"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"
import { TopBar } from "@/components/layout/TopBar"
import { PageHeader } from "@/components/layout/PageHeader"
import { WikiGuidedCreation } from "@/components/wiki/WikiGuidedCreation"
import { formatAgo } from "@/lib/time"

export function WikiPage() {
  const [, params] = useRoute<{ id: string }>("/wiki/:id")
  const id = params?.id as Id<"wikis"> | undefined
  const wiki = useQuery(api.wikis.get, id ? { id } : "skip")
  const regenerate = useMutation(api.wikis.regenerate)
  const remove = useMutation(api.wikis.remove)
  const [, navigate] = useLocation()
  const [editing, setEditing] = useState(false)

  if (wiki === undefined) {
    return <p className="p-6 text-sm text-muted-foreground">Loading…</p>
  }
  if (wiki === null) {
    return (
      <div className="space-y-2 p-6">
        <h1 className="text-lg font-semibold">Wiki not found</h1>
        <Link href="/wiki" className="text-sm text-primary hover:underline">
          Back to all Wikis
        </Link>
      </div>
    )
  }

  const building = wiki.status === "generating"
  const content = wiki.content

  async function rebuild() {
    try {
      await regenerate({ id: wiki!._id })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    }
  }

  async function onDelete() {
    try {
      await remove({ id: wiki!._id })
      toast.success("Wiki deleted")
      navigate("/wiki")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div className="flex flex-col">
      <TopBar breadcrumb={[{ label: "Wiki", href: "/wiki" }, { label: wiki.title }]} />
      <PageHeader
        icon={BookOpenText}
        title={wiki.title}
        subtitle={wiki.purpose || "No purpose given"}
        actions={
          <>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setEditing(true)}>
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Edit scope
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="More">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => void rebuild()} disabled={building}>
                  <RefreshCw className="mr-2 h-3.5 w-3.5" /> Rebuild now
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => void onDelete()} className="text-destructive">
                  <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete Wiki
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      <div className="grid gap-6 p-6 lg:grid-cols-[minmax(0,1fr)_280px]">
        <main className="min-w-0 space-y-4">
          {building && (
            <StatusBar tone="info">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {content
                ? `Rebuilding${wiki.lastTrigger ? ` after: ${wiki.lastTrigger}` : ""}. The version below stays visible until it's done.`
                : "Building this Wiki from published documents…"}
            </StatusBar>
          )}
          {!building && wiki.outdated.length > 0 && (
            <StatusBar tone="warn">
              <AlertTriangle className="h-3.5 w-3.5" />
              {wiki.outdated.join(", ")} changed since this was built. A rebuild is queued.
            </StatusBar>
          )}
          {wiki.error && (
            <StatusBar tone="error">
              <AlertTriangle className="h-3.5 w-3.5" />
              {content ? `The last rebuild failed, showing the previous version. ${wiki.error}` : wiki.error}
              <Button size="sm" variant="outline" className="ml-auto h-6 text-[11px]" onClick={() => void rebuild()}>
                Try again
              </Button>
            </StatusBar>
          )}

          {wiki.status === "empty" && (
            <Card>
              <CardContent className="space-y-2 py-10 text-center">
                <p className="text-sm font-medium">Nothing published in this scope</p>
                <p className="mx-auto max-w-md text-xs text-muted-foreground">
                  A Wiki only uses published documents, and none match this
                  scope yet. Widen the scope, or publish the documents it
                  should cover.
                </p>
                <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                  Edit scope
                </Button>
              </CardContent>
            </Card>
          )}

          {content && (
            <article className="space-y-6 rounded-lg border bg-background p-6">
              <p className="text-xs text-muted-foreground">{content.intro}</p>
              {content.sections.map((section, i) => (
                <section key={i} className="space-y-2">
                  <h2 className="text-base font-semibold">{section.heading}</h2>
                  <ul className="space-y-2">
                    {section.points.map((point, j) => (
                      <li key={j} className="flex gap-2 text-sm leading-relaxed">
                        <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/60" />
                        <span>
                          {point.text}{" "}
                          {point.citations.map((c) => (
                            <SourceChip
                              key={c.chunkId}
                              documentId={c.documentId}
                              namingCode={c.namingCode}
                              version={c.version}
                              section={c.section}
                              excerpt={wiki.excerpts[c.chunkId]}
                            />
                          ))}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </article>
          )}
        </main>

        <aside className="space-y-4">
          <div className="space-y-2 rounded-lg border p-3">
            <p className="text-xs font-semibold">Built from</p>
            {wiki.sources.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">No sources yet.</p>
            ) : (
              <ul className="space-y-1.5">
                {wiki.sources.map((s) => (
                  <li key={s.documentId}>
                    <Link
                      href={`/docs/${s.documentId}`}
                      className="flex items-start gap-1.5 text-[11px] hover:text-primary"
                    >
                      <FileText className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
                      <span className="min-w-0">
                        <span className="block font-mono text-muted-foreground">
                          {s.namingCode} · v{s.version}
                        </span>
                        <span className="block truncate">{s.title}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <p className="border-t pt-2 text-[11px] text-muted-foreground">
              {wiki.generatedAt ? `Generated ${formatAgo(wiki.generatedAt)}` : "Not generated yet"}
              {wiki.droppedPoints > 0 &&
                ` · ${wiki.droppedPoints} ${wiki.droppedPoints === 1 ? "point" : "points"} left out because ${wiki.droppedPoints === 1 ? "it" : "they"} could not be traced to a source`}
            </p>
          </div>

          <div className="space-y-2 rounded-lg border p-3">
            <p className="text-xs font-semibold">Scope</p>
            <ScopeLine label="Areas" items={wiki.scopeLabels.areas} />
            <ScopeLine label="Disciplines" items={wiki.scopeLabels.disciplines} />
            <ScopeLine label="Machines" items={wiki.scopeLabels.assets} />
            <ScopeLine label="Documents" items={wiki.scopeLabels.documents} />
            <p className="border-t pt-2 text-[11px] text-muted-foreground">
              Rebuilt automatically when a document in scope is published, and every night.
            </p>
          </div>
        </aside>
      </div>

      <WikiGuidedCreation
        open={editing}
        onOpenChange={setEditing}
        wikiId={wiki._id}
        initial={{ title: wiki.title, purpose: wiki.purpose, scope: wiki.scope }}
      />
    </div>
  )
}

function StatusBar({ tone, children }: { tone: "info" | "warn" | "error"; children: React.ReactNode }) {
  const styles = {
    info: "border-primary/30 bg-primary/5 text-primary",
    warn: "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100",
    error: "border-destructive/40 bg-destructive/5 text-destructive",
  }[tone]
  return <div className={`flex items-center gap-2 rounded-md border px-3 py-2 text-xs ${styles}`}>{children}</div>
}

function ScopeLine({ label, items }: { label: string; items: string[] }) {
  if (items.length === 0) return null
  return (
    <div className="text-[11px]">
      <span className="text-muted-foreground">{label}: </span>
      {items.join(", ")}
    </div>
  )
}

function SourceChip({
  documentId,
  namingCode,
  version,
  section,
  excerpt,
}: {
  documentId: Id<"documents">
  namingCode: string
  version: number
  section: string | null
  excerpt: string | undefined
}) {
  const hl = excerpt ? excerpt.split(" | ")[0].slice(0, 80) : ""
  const href = `/docs/${documentId}${hl ? `?hl=${encodeURIComponent(hl)}` : ""}`
  return (
    <HoverCard openDelay={150}>
      <HoverCardTrigger asChild>
        <Link
          href={href}
          className="ml-0.5 inline-flex items-center rounded border bg-muted/60 px-1.5 py-0 align-baseline font-mono text-[10px] text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
        >
          {namingCode}
        </Link>
      </HoverCardTrigger>
      <HoverCardContent className="w-80 space-y-1.5 text-xs" align="start">
        <p className="font-mono text-[10px] text-muted-foreground">
          {namingCode} · v{version}
          {section ? ` · ${section}` : ""}
        </p>
        <p className="leading-relaxed">{excerpt ?? "This passage is no longer in the published version."}</p>
        <p className="text-[10px] text-primary">Click to open it in the document</p>
      </HoverCardContent>
    </HoverCard>
  )
}
