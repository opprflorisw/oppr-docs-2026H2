import { useQuery } from "convex/react"
import { Link } from "wouter"
import { ArrowRight } from "lucide-react"
import { api } from "../../../convex/_generated/api"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"

// Extra Knowledge health numbers under the Home health card: is the library
// lean and relevant? Each one opens Knowledge health at its section.
export function HomeInsightsPanel() {
  const s = useQuery(api.insights.homeStats)
  return (
    <Card>
      <CardContent className="space-y-0 p-0">
        <div className="grid grid-cols-3 gap-px overflow-hidden rounded-t-lg bg-border">
          <Mini label="Never used" value={s?.neverUsed} href="/library/health#never-used" warn={(s?.neverUsed ?? 0) > 0} />
          <Mini label="Asked but unclear" value={s?.unclear} href="/library/health#unclear" warn={(s?.unclear ?? 0) > 0} />
          <Mini
            label="Open Findings"
            value={s?.openFindings}
            href="/library/health#contradictions"
            danger={(s?.openFindings ?? 0) > 0}
          />
        </div>
        <Link
          href="/library/health"
          className="flex items-center gap-1 border-t px-3 py-2 text-[11px] font-medium text-primary hover:bg-muted/50"
        >
          {s && s.proposals > 0
            ? `${s.proposals} Proposed ${s.proposals === 1 ? "revision" : "revisions"} waiting`
            : "Is the library lean and relevant?"}
          <ArrowRight className="ml-auto h-3 w-3" />
        </Link>
      </CardContent>
    </Card>
  )
}

function Mini({
  label,
  value,
  href,
  warn,
  danger,
}: {
  label: string
  value: number | undefined
  href: string
  warn?: boolean
  danger?: boolean
}) {
  return (
    <Link href={href} className="bg-card p-2.5 transition-colors hover:bg-muted/50">
      <div
        className={cn(
          "text-base font-semibold tabular-nums",
          warn && "text-amber-600",
          danger && "text-red-600",
        )}
      >
        {value ?? "–"}
      </div>
      <div className="text-[10px] leading-tight text-muted-foreground">{label}</div>
    </Link>
  )
}
