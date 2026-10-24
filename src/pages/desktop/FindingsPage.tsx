import { TopBar } from "@/components/layout/TopBar"

// SCAFFOLD placeholder page, owned by the Consistency track. Keep the export name:
// it is already routed in App.tsx.
// /library/findings: all Findings (open, resolved, dismissed), dismiss with reason, prepare a revision, run a check now.
export function FindingsPage() {
  return (
    <div className="flex h-full flex-col">
      <TopBar breadcrumb={[{ label: "Findings" }]} />
      <div className="p-6 text-sm text-muted-foreground">Coming in this build.</div>
    </div>
  )
}
