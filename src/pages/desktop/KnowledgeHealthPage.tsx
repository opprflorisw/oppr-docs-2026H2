import { TopBar } from "@/components/layout/TopBar"

// SCAFFOLD placeholder page, owned by the Insights track. Keep the export name:
// it is already routed in App.tsx.
// /library/health: is the library lean and relevant? never used, overlaps, asked but unclear, open findings, reviews due.
export function KnowledgeHealthPage() {
  return (
    <div className="flex h-full flex-col">
      <TopBar breadcrumb={[{ label: "Knowledge health" }]} />
      <div className="p-6 text-sm text-muted-foreground">Coming in this build.</div>
    </div>
  )
}
