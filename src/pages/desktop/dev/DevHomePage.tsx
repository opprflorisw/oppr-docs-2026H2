// Developer home (/dev): one card per tool, what it is for and how it stands.
import type { ReactNode } from "react"
import { Link } from "wouter"
import { useQuery } from "convex/react"
import { ChevronRight } from "lucide-react"
import { api } from "../../../../convex/_generated/api"
import { Skeleton } from "@/components/ui/skeleton"
import { formatDate } from "@/lib/time"
import { DevPage } from "@/components/dev/DevFrame"
import { DEV_HOME, DEV_TOOL, useIsDeveloper, type DevTool } from "@/components/dev/devTools"
import { imageEngine, textEngine, useGpuProbe, useStore } from "@/components/dev/embeddings/engine"
import { ANALYSES } from "../analysis/registry"

export function DevHomePage() {
  const allowed = useIsDeveloper()
  return (
    <DevPage tool={DEV_HOME} statusLine="Tools for Engineers and Admins to try out models, connections and AI setups.">
      {allowed && (
        <div className="grid gap-4 md:grid-cols-2">
          <ToolCard tool={DEV_TOOL.embeddings} status={<LabStatus />} />
          <ToolCard tool={DEV_TOOL.mcp} status={<McpStatus />} />
          <ToolCard tool={DEV_TOOL.ai} status={<AiStatus />} />
          <ToolCard tool={DEV_TOOL.analysis} status={<AnalysisStatus />} />
        </div>
      )}
    </DevPage>
  )
}

function ToolCard({ tool, status }: { tool: DevTool; status: ReactNode }) {
  const Icon = tool.icon
  return (
    <Link
      href={tool.href}
      className="group flex items-start gap-3 rounded-lg border bg-card p-5 transition-colors hover:border-primary/40 hover:bg-muted/30"
    >
      <Icon className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
      <span className="min-w-0 flex-1 space-y-1">
        <span className="block text-sm font-semibold">{tool.label}</span>
        <span className="block text-sm text-muted-foreground">{tool.lead}</span>
        <span className="block pt-1 text-xs">{status}</span>
      </span>
      <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground group-hover:text-foreground" aria-hidden />
    </Link>
  )
}

function LabStatus() {
  const text = useStore(textEngine.state)
  const image = useStore(imageEngine.state)
  const gpu = useGpuProbe()
  const loaded = [text, image].filter((s) => s.kind === "ready").length
  return (
    <>
      {gpu === null ? "Checking WebGPU" : gpu.adapter ? "WebGPU available here" : "No WebGPU here: text on CPU only, no image search"}
      {" · "}
      {loaded ? `${loaded} model${loaded === 1 ? "" : "s"} loaded in this tab` : "No model loaded"}
    </>
  )
}

function McpStatus() {
  const keys = useQuery(api.mcp.keys.listKeys)
  if (keys === undefined) return <Skeleton className="h-3 w-40" />
  const active = keys.filter((k) => k.revokedAt == null)
  const last = Math.max(0, ...active.map((k) => k.lastUsedAt ?? 0))
  const calls = active.reduce((s, k) => s + k.calls7d, 0)
  return (
    <>
      {active.length} active key{active.length === 1 ? "" : "s"} · {calls} call{calls === 1 ? "" : "s"} in 7 days
      {last ? ` · last used ${formatDate(last)}` : ""}
    </>
  )
}

// Cheap on purpose: the index counts read every passage row, so they stay
// on the Search index tab instead of loading on every visit here.
function AiStatus() {
  const overview = useQuery(api.settings.connections.overview)
  if (!overview) return <Skeleton className="h-3 w-40" />
  const missing = overview.models.filter((m) => !m.ready).length
  return (
    <span className={missing ? "text-status-review" : undefined}>
      {overview.models.length} model roles{missing ? `, ${missing} without a key` : ", all keys set"} ·{" "}
      {overview.schedules.length} schedules
    </span>
  )
}

function AnalysisStatus() {
  const outstanding = ANALYSES.filter((a) => a.status === "outstanding").length
  const newest = ANALYSES.reduce((m, a) => (a.updatedAt > m ? a.updatedAt : m), "")
  return (
    <>
      {ANALYSES.length} case files · {outstanding} outstanding · newest {newest}
    </>
  )
}
