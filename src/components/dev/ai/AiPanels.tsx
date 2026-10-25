import { useState, type ReactNode } from "react"
import { useAction, useMutation, useQuery } from "convex/react"
import { Link } from "wouter"
import { toast } from "sonner"
import { ArrowUpRight, BellOff, CalendarClock, Gauge, Loader2, Microscope, RefreshCw } from "lucide-react"
import { api } from "../../../../convex/_generated/api"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
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
import { Skeleton } from "@/components/ui/skeleton"
import { formatDateTime } from "@/lib/time"
import { cn } from "@/lib/utils"
import { errorText, useSettingsEditor } from "@/components/settings/SettingsBits"

// AI models and jobs (/dev/ai), formerly Settings "AI and connections":
// which models do what, whether search is up to date, what runs by itself,
// and where usage shows. The index buttons need an Engineer or Admin check-in
// (the server checks it too).

/** Which model does what. Keys stay on the server. */
export function ModelsCard() {
  const overview = useQuery(api.settings.connections.overview)
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">AI models</CardTitle>
        <CardDescription className="text-sm">
          AI prepares, people publish: no model publishes or approves anything. Keys stay on the server.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!overview ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <ul className="divide-y" data-testid="settings-models">
            {overview.models.map((m) => (
              <li key={m.use} className="grid gap-1 py-3 first:pt-0 last:pb-0 sm:grid-cols-[12rem_minmax(0,1fr)] sm:gap-4">
                <div className="space-y-0.5">
                  <p className="text-sm font-medium">{m.use}</p>
                  {!m.ready && (
                    <Badge variant="outline" className="border-amber-500/50 text-amber-800 dark:text-amber-200">
                      No key set
                    </Badge>
                  )}
                </div>
                <div className="min-w-0 space-y-0.5">
                  <p className="font-mono text-xs">{m.model}</p>
                  <p className="text-xs text-muted-foreground">{m.what}</p>
                  {m.note && <p className="text-xs text-muted-foreground">{m.note}</p>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

/** What runs by itself, and the notifications that are not sent yet. */
export function SchedulesCard() {
  const overview = useQuery(api.settings.connections.overview)
  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <CalendarClock className="h-4 w-4 text-muted-foreground" aria-hidden />
            Schedules
          </CardTitle>
          <CardDescription className="text-sm">What runs by itself (Convex crons). Times are in UTC.</CardDescription>
        </CardHeader>
        <CardContent>
          {!overview ? (
            <Skeleton className="h-24 w-full" />
          ) : (
            <ul className="divide-y" data-testid="settings-schedules">
              {overview.schedules.map((s) => (
                <li key={s.name} className="grid gap-1 py-3 first:pt-0 last:pb-0 sm:grid-cols-[12rem_minmax(0,1fr)] sm:gap-4">
                  <div>
                    <p className="text-sm font-medium">{s.label}</p>
                    <p className="text-xs text-muted-foreground">{s.when}</p>
                  </div>
                  <p className="text-xs text-muted-foreground sm:text-sm">{s.what}</p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <BellOff className="h-4 w-4 text-muted-foreground" aria-hidden />
            Notifications
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm">Not sent yet.</p>
          <p className="text-sm text-muted-foreground">
            Oppr sends no email, text or push messages in this showcase. Reviews due, assignments, reminders and
            Findings show on Home and in Learn.
          </p>
        </CardContent>
      </Card>
    </>
  )
}

// The deployment name is the first part of the Convex URL.
const DEPLOYMENT = /^https:\/\/([^.]+)\./.exec(import.meta.env.VITE_CONVEX_URL ?? "")?.[1] ?? null

/** Where usage shows, and what the Free plan finding was. */
export function UsageHints() {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Gauge className="h-4 w-4 text-muted-foreground" aria-hidden />
            Where usage shows
          </CardTitle>
          <CardDescription className="text-sm">
            Function calls, database reads, storage and bandwidth are counted by Convex, per team and per billing month.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {DEPLOYMENT && (
            <a
              href={`https://dashboard.convex.dev/d/${DEPLOYMENT}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-primary underline-offset-2 hover:underline"
            >
              Open {DEPLOYMENT} in the Convex dashboard <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
            </a>
          )}
          <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
            <li>Team usage: in the dashboard, open the team menu, then Usage. It breaks calls and reads down by function.</li>
            <li>Per deployment: the Logs and Functions pages show which functions run most and which fail.</li>
            <li>From a terminal: npx convex logs, and npx convex insights for the heaviest readers.</li>
          </ul>
        </CardContent>
      </Card>

      <Card className="border-amber-500/40 bg-amber-500/5">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">The Free plan finding (2026-10-25)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <ul className="list-disc space-y-1 pl-5 text-xs leading-relaxed">
            <li>
              The limit we hit is throughput, not size: the Free plan allows 1M function calls and 1 GB of database
              reads a month, while the whole database is a few tens of MB.
            </li>
            <li>
              Most of it is development: agent test logins, reseeds, background jobs, and queries that read the inline
              768-number embeddings they do not need (image search ranking reads about 215 KB per call).
            </li>
            <li>
              The fix is a paid Convex plan plus cutting that waste, not a move to Google Cloud. Moving embeddings into
              their own tables is likely the biggest single saving.
            </li>
          </ul>
          <Link
            href="/analysis/backend-gcp-and-gemma"
            className="inline-flex items-center gap-1.5 text-xs text-primary underline-offset-2 hover:underline"
          >
            <Microscope className="h-3.5 w-3.5" aria-hidden /> Read the case file
          </Link>
        </CardContent>
      </Card>
    </div>
  )
}

/** Passages and images indexed for search, with the Engineer-only rebuild buttons. */
export function SearchIndexCard() {
  const chunks = useQuery(api.ai.embed.embedStatus)
  const images = useQuery(api.ai.imageEmbed.embedStatus)
  const embedMissing = useAction(api.ai.embed.embedMissing)
  const reembedAll = useAction(api.ai.embed.reembedAll)
  const startImages = useMutation(api.ai.imageEmbed.startBackfill)
  const { editorId } = useSettingsEditor()
  const [busy, setBusy] = useState(false)
  const [confirmAll, setConfirmAll] = useState(false)

  const outstanding = (chunks?.outstanding ?? 0) + (images?.outstanding ?? 0)

  async function run(all: boolean) {
    if (!editorId) return
    setBusy(true)
    const id = toast.loading(all ? "Clearing and rebuilding the search index…" : "Indexing what is missing…")
    try {
      const r = all ? await reembedAll({ personId: editorId }) : await embedMissing({ personId: editorId })
      if (all || (images?.outstanding ?? 0) > 0) await startImages({ personId: editorId, reembedAll: all })
      toast.success(
        all
          ? `Rebuilt ${r.embedded} of ${r.total} passages. Images are indexed in the background.`
          : r.total === 0
            ? "Every passage was already indexed. Missing images are indexed in the background."
            : `Indexed ${r.embedded} of ${r.total} passages. Missing images are indexed in the background.`,
        { id },
      )
    } catch (err) {
      toast.error(errorText(err), { id })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Search index</CardTitle>
        <CardDescription className="text-sm">
          Ask and search find passages of Published documents, and photos, by meaning. Every passage and image needs to
          be indexed once; new ones are indexed when they are published or uploaded.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <IndexStat
            label="Passages"
            loading={chunks === undefined}
            done={chunks?.embedded ?? 0}
            total={chunks?.total ?? 0}
            last={chunks?.lastEmbeddedAt ?? null}
          />
          <IndexStat
            label="Images"
            loading={images === undefined}
            done={images?.embedded ?? 0}
            total={images?.total ?? 0}
            last={images?.lastEmbeddedAt ?? null}
            extra={
              images && images.byCaption > 0 ? `${images.byCaption} found by their description only` : undefined
            }
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => void run(false)}
            disabled={busy || outstanding === 0 || !editorId}
          >
            {busy ? <Loader2 className="animate-spin" aria-hidden /> : null}
            Index what is missing
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setConfirmAll(true)} disabled={busy || !editorId}>
            <RefreshCw aria-hidden />
            Rebuild everything
          </Button>
          {!editorId && <span className="text-xs text-muted-foreground">Check in as an Engineer or Admin to index.</span>}
          {editorId && outstanding === 0 && chunks !== undefined && images !== undefined && (
            <span className="text-xs text-muted-foreground">Everything is indexed.</span>
          )}
        </div>
        <AlertDialog open={confirmAll} onOpenChange={setConfirmAll}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Rebuild the whole search index?</AlertDialogTitle>
              <AlertDialogDescription>
                Every passage and image is indexed again. Ask and search may be weaker until it finishes, usually
                within a minute. Only needed after a model change.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => void run(true)}>Rebuild</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  )
}

function IndexStat({
  label,
  loading,
  done,
  total,
  last,
  extra,
}: {
  label: string
  loading: boolean
  done: number
  total: number
  last: number | null
  extra?: ReactNode
}) {
  if (loading) return <Skeleton className="h-16 w-full" />
  const missing = total - done
  return (
    <div className="rounded-md border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("text-sm font-medium tabular-nums", missing > 0 && "text-status-review")}>
        {done} of {total} indexed{missing > 0 ? `, ${missing} missing` : ""}
      </p>
      <p className="text-xs text-muted-foreground">{last ? `Last indexed ${formatDateTime(last)}` : "Not indexed yet"}</p>
      {extra && <p className="text-xs text-muted-foreground">{extra}</p>}
    </div>
  )
}
