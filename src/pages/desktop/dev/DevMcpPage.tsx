import { useState, type ReactNode } from "react"
import { ArrowRight, CheckCircle2, KeyRound, Sparkles } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { DevPage } from "@/components/dev/DevFrame"
import { DEV_TOOL, useDevTab } from "@/components/dev/devTools"
import { ModelLocations } from "@/components/dev/mcp/ModelLocations"
import { Scenarios } from "@/components/dev/mcp/Scenarios"
import { AccessLevels } from "@/components/dev/mcp/AccessLevels"
import { EndpointCard, ToolsCard } from "@/components/dev/mcp/EndpointAndTools"
import { AuditLog, KeysPanel } from "@/components/dev/mcp/KeysPanel"
import { TestConsole } from "@/components/dev/mcp/TestConsole"
import type { ModelHost } from "@/components/dev/mcp/data"
import { useCompanyName } from "@/components/settings/useCompanyName"

// MCP (docs/adr/0004): connect the AI a company already uses to Oppr. The
// messy pre-work happens in that model; Oppr keeps the structure, the
// duplicate check, a draft import and human review. Lives in the Developer
// section; /mcp redirects here.

const TABS = [
  { value: "overview", label: "Overview and connection" },
  { value: "keys", label: "Keys" },
  { value: "tools", label: "Tools and test console" },
  { value: "activity", label: "Activity" },
]

export function DevMcpPage() {
  const [tab, go] = useDevTab("/dev/mcp", TABS)
  return (
    <DevPage
      tool={DEV_TOOL.mcp}
      statusLine="The messy work happens in your own AI; only clean, reviewed knowledge lives here."
      tabs={TABS}
      tab={tab}
      onTab={go}
      primary={tab === "overview" ? { label: "Make a key", icon: KeyRound, href: "/dev/mcp/keys" } : undefined}
    >
      {tab === "overview" && <Overview />}
      {tab === "keys" && <KeysPanel />}
      {tab === "tools" && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <TestConsole />
          <ToolsCard />
        </div>
      )}
      {tab === "activity" && <AuditLog />}
    </DevPage>
  )
}

function Overview() {
  const [host, setHost] = useState<ModelHost | null>(null)
  const plant = useCompanyName()
  return (
    <div className="space-y-10">
      <Section id="connect" title="Connect" lead="The endpoint and the config to paste into an assistant.">
        <EndpointCard />
      </Section>
      <Section id="where" title="Where the model runs" lead="Three places a model can do the work. Click one to see which scenarios use it.">
        <ModelLocations selected={host} onSelect={setHost} />
        <DoLess />
      </Section>
      <Section id="scenarios" title="Scenarios" lead={`Five real situations at ${plant ?? "your plant"}. Pick one and step through it.`}>
        <Scenarios highlight={host} />
      </Section>
      <Section
        id="access"
        title="Access levels"
        lead="Each key gets only the scopes it needs. Read and write are separate, and personal data is its own scope."
      >
        <AccessLevels />
      </Section>
    </div>
  )
}

function Section({ id, title, lead, children }: { id: string; title: string; lead: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-32 space-y-4">
      <div className="space-y-1">
        <h2 id={`${id}-title`} className="text-lg font-semibold">
          {title}
        </h2>
        <p className="text-sm text-muted-foreground">{lead}</p>
      </div>
      {children}
    </section>
  )
}

/** How MCP lets Oppr do less: the split of work in one glance. */
function DoLess() {
  return (
    <Card>
      <CardContent className="grid gap-4 p-4 text-xs md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:items-center">
        <div className="space-y-1.5">
          <div className="text-sm font-semibold">The messy work, in your model</div>
          <ul className="space-y-1 text-muted-foreground">
            {["OCR and cleanup of scans", "Classifying hundreds of legacy files", "Splitting, merging and translating", "Finding duplicates on the file share"].map((t) => (
              <li key={t} className="flex gap-1.5">
                <Sparkles className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" /> {t}
              </li>
            ))}
          </ul>
        </div>
        <ArrowRight className="hidden h-5 w-5 text-muted-foreground md:block" aria-hidden />
        <div className="space-y-1.5">
          <div className="text-sm font-semibold">Small and strict, in Oppr</div>
          <ul className="space-y-1">
            {["The structure to map onto: areas, disciplines, types, Assets", "Duplicate checks against Published knowledge", "A draft import, marked \"Imported via MCP\"", "Human review and publish, then the Consistency check"].map((t) => (
              <li key={t} className="flex gap-1.5">
                <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-primary" /> {t}
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  )
}
