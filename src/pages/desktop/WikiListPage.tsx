import { useState } from "react"
import { useQuery } from "convex/react"
import { Link } from "wouter"
import { BookOpenText, Loader2, Plus } from "lucide-react"
import { api } from "../../../convex/_generated/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { TopBar } from "@/components/layout/TopBar"
import { PageHeader } from "@/components/layout/PageHeader"
import { WikiGuidedCreation } from "@/components/wiki/WikiGuidedCreation"
import { formatAgo } from "@/lib/time"

export function WikiListPage() {
  const wikis = useQuery(api.wikis.list)
  const [creating, setCreating] = useState(false)

  return (
    <div className="flex flex-col">
      <TopBar breadcrumb={[{ label: "Wiki" }]} />
      <PageHeader
        icon={BookOpenText}
        title="Wiki"
        subtitle="Overviews generated from published documents only. Each one shows exactly which versions it was built from."
        actions={
          <Button size="sm" className="gap-1.5" onClick={() => setCreating(true)}>
            <Plus className="h-3.5 w-3.5" />
            New Wiki
          </Button>
        }
      />
      <div className="p-6">
        {wikis === undefined ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : wikis.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
              <BookOpenText className="h-8 w-8 text-muted-foreground/50" />
              <div>
                <p className="text-sm font-medium">No Wikis yet</p>
                <p className="max-w-sm text-xs text-muted-foreground">
                  Describe who a Wiki is for and what it should cover. It is
                  built from published documents only, and rebuilt whenever
                  one of them changes.
                </p>
              </div>
              <Button size="sm" onClick={() => setCreating(true)}>
                Create the first Wiki
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {wikis.map((w) => (
              <Link key={w._id} href={`/wiki/${w._id}`}>
                <Card className="h-full transition-colors hover:border-primary/50">
                  <CardContent className="flex h-full flex-col gap-2 p-4">
                    <p className="text-sm font-semibold">{w.title}</p>
                    {w.purpose && (
                      <p className="line-clamp-2 text-xs text-muted-foreground">{w.purpose}</p>
                    )}
                    <div className="mt-auto flex items-center gap-2 pt-2 text-[11px] text-muted-foreground">
                      {w.status === "generating" ? (
                        <span className="inline-flex items-center gap-1 text-primary">
                          <Loader2 className="h-3 w-3 animate-spin" /> Building
                        </span>
                      ) : w.status === "empty" ? (
                        <span className="text-amber-600">Nothing published in scope</span>
                      ) : w.status === "failed" ? (
                        <span className="text-destructive">Build failed</span>
                      ) : (
                        <span>
                          {w.pointCount} points from {w.sourceCount}{" "}
                          {w.sourceCount === 1 ? "document" : "documents"}
                        </span>
                      )}
                      {w.outdatedCount > 0 && w.status !== "generating" && (
                        <span className="text-amber-600">Out of date</span>
                      )}
                      {w.generatedAt && <span className="ml-auto">{formatAgo(w.generatedAt)}</span>}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
      <WikiGuidedCreation open={creating} onOpenChange={setCreating} />
    </div>
  )
}
