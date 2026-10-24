import { useQuery } from "convex/react"
import { Link } from "wouter"
import { Copy, FileWarning, SearchCheck } from "lucide-react"
import { api } from "../../../convex/_generated/api"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { findingHref, whenText } from "./findingUtils"

const MAX_ROWS = 5

// Home: open Findings as inbox rows (an Engineer settles each one). Same look
// as the Home inbox rows. Renders nothing when there are none.
export function HomeFindingsRows() {
  const findings = useQuery(api.findings.list, { status: "open" })
  if (!findings || findings.length === 0) return null
  const shown = findings.slice(0, MAX_ROWS)
  const more = findings.length - shown.length

  return (
    <section className="space-y-3 pt-3">
      <div className="flex items-center gap-2">
        <SearchCheck className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold">Findings</h2>
        <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
          {findings.length}
        </Badge>
        <Link href="/library/findings" className="ml-auto text-xs text-muted-foreground hover:text-foreground">
          All Findings
        </Link>
      </div>
      <Card>
        <CardContent className="divide-y p-0">
          {shown.map((f) => {
            const contradiction = f.kind === "contradiction"
            const Icon = contradiction ? FileWarning : Copy
            return (
              <Link
                key={f._id}
                href={findingHref(f._id)}
                className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50"
              >
                <span
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-md",
                    contradiction ? "bg-red-500/10 text-red-600" : "bg-amber-500/10 text-amber-600",
                  )}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium" title={f.summary}>
                    {f.summary}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    <span className="font-mono">
                      {f.a.namingCode} / {f.b.namingCode}
                    </span>{" "}
                    · {contradiction ? "Contradiction" : "Duplicate"} found {whenText(f.detectedAt)}
                  </span>
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 shrink-0 text-xs group-hover:border-primary/50"
                  tabIndex={-1}
                >
                  Open
                </Button>
              </Link>
            )
          })}
          {more > 0 && (
            <Link
              href="/library/findings"
              className="block px-4 py-2.5 text-center text-xs text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
            >
              {more} more open {more === 1 ? "Finding" : "Findings"}
            </Link>
          )}
        </CardContent>
      </Card>
    </section>
  )
}
