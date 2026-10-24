import { useQuery } from "convex/react"
import { Link } from "wouter"
import { Sparkles } from "lucide-react"
import { api } from "../../../convex/_generated/api"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

const MAX_ROWS = 5

// Home: Proposed revisions waiting for an Engineer. The AI prepared a draft;
// a person reviews it and takes it through the normal review. Renders nothing
// when there are none.
export function HomeRevisionRows() {
  const all = useQuery(api.revisions.list, {})
  const waiting = all?.filter((r) => r.status === "ready" || r.status === "in_review") ?? []
  if (waiting.length === 0) return null
  const shown = waiting.slice(0, MAX_ROWS)

  return (
    <section className="space-y-3 pt-3">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold">Proposed revisions</h2>
        <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
          {waiting.length}
        </Badge>
        <Link href="/library/health" className="ml-auto text-xs text-muted-foreground hover:text-foreground">
          Knowledge health
        </Link>
      </div>
      <Card>
        <CardContent className="divide-y p-0">
          {shown.map((r) => (
            <Link
              key={r._id}
              href={`/docs/${r.documentId}`}
              className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-violet-500/10 text-violet-600">
                <Sparkles className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium" title={r.summary}>
                  {r.summary || r.title}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  <span className="font-mono">{r.namingCode}</span> · draft v{r.draftVersion} prepared by the assistant,
                  not yet reviewed
                </span>
              </span>
              <Button size="sm" variant="outline" className="h-7 shrink-0 text-xs group-hover:border-primary/50" tabIndex={-1}>
                Review the changes
              </Button>
            </Link>
          ))}
        </CardContent>
      </Card>
    </section>
  )
}
