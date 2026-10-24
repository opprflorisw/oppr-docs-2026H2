import { TopBar } from "@/components/layout/TopBar"

// SCAFFOLD placeholder page, owned by the Skills track. Keep the export name:
// it is already routed in App.tsx.
// /learn/people/:id: one person: Skills with levels, history, records, gaps against their profile.
export function PersonSkillsPage() {
  return (
    <div className="flex h-full flex-col">
      <TopBar breadcrumb={[{ label: "Person" }]} />
      <div className="p-6 text-sm text-muted-foreground">Coming in this build.</div>
    </div>
  )
}
