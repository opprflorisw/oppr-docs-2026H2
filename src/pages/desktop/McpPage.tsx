import { useEffect, useState, type ReactNode } from "react"
import { ArrowRight, Cable, CheckCircle2, Sparkles } from "lucide-react"
import { TopBar } from "@/components/layout/TopBar"
import { PageHeader } from "@/components/layout/PageHeader"
import { Card, CardContent } from "@/components/ui/card"
import { ModelLocations } from "@/components/mcp/ModelLocations"
import { Scenarios } from "@/components/mcp/Scenarios"
import { AccessLevels } from "@/components/mcp/AccessLevels"
import { ConnectPanel } from "@/components/mcp/ConnectPanel"
import { AuditLog, KeysPanel } from "@/components/mcp/KeysPanel"
import type { ModelHost } from "@/components/mcp/data"

// MCP (docs/adr/0004): connect the AI a company already uses to Oppr. The
// messy pre-work happens in that model; Oppr keeps the structure, the
// duplicate check, a draft import and human review. Reached from Settings and
// the New document chooser, not from the main navigation.
export function McpPage() {
  const [host, setHost] = useState<ModelHost | null>(null)

  // Arriving with #connect (from Settings or a link): scroll to it.
  useEffect(() => {
    const id = window.location.hash.slice(1)
    if (!id) return
    const t = window.setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }), 150)
    return () => window.clearTimeout(t)
  }, [])

  return (
    <div className="flex flex-col">
      <TopBar breadcrumb={[{ label: "Settings", href: "/settings" }, { label: "MCP" }]} />
      <PageHeader
        icon={Cable}
        title="MCP"
        statusLine="The messy work happens in your own AI; only clean, reviewed knowledge lives here."
        primary={{
          label: "Connect an assistant",
          icon: Cable,
          onClick: () =>
            document.getElementById("connect")?.scrollIntoView({ behavior: "smooth", block: "start" }),
        }}
      />
      <div className="mx-auto w-full max-w-6xl space-y-10 p-6">
        <Section
          id="where"
          title="Where the model runs"
          lead="Three places a model can do the work. Click one to see which scenarios use it."
        >
          <ModelLocations selected={host} onSelect={setHost} />
          <DoLess />
        </Section>

        <Section id="scenarios" title="Scenarios" lead="Five real situations at Pijpwerk Noord. Pick one and step through it.">
          <Scenarios highlight={host} />
        </Section>

        <Section
          id="access"
          title="Access levels"
          lead="Each key gets only the scopes it needs. Read and write are separate, and personal data is its own scope."
        >
          <AccessLevels />
        </Section>

        <Section id="connect" title="Connect" lead="Live: the endpoint, its tools, your keys and every call made with them.">
          <ConnectPanel />
          <KeysPanel />
          <AuditLog />
        </Section>
      </div>
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
