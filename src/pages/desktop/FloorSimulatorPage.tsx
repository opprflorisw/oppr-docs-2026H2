import { Map as MapIcon, QrCode, Smartphone } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { TopBar } from "@/components/layout/TopBar"
import { PageHeader } from "@/components/layout/PageHeader"

// Floor simulator (CONTEXT.md): placeholder only. Its design is decided later.
// It will stand in for being in the field, on the desktop: a floor plan with
// about five Assets next to an emulated phone screen. No real phone, no real
// scanning.

const MACHINES = [
  { x: 14, y: 30, label: "MXR-101" },
  { x: 40, y: 62, label: "EXL-201" },
  { x: 62, y: 30, label: "SAW-202" },
  { x: 80, y: 66, label: "?" },
  { x: 30, y: 82, label: "?" },
]

export function FloorSimulatorPage() {
  function openFloorView() {
    window.open(
      `${window.location.origin}/m`,
      "oppr-floor",
      "width=390,height=844,resizable=yes,scrollbars=yes",
    )
  }

  return (
    <div className="flex flex-col">
      <TopBar breadcrumb={[{ label: "Assets", href: "/assets" }, { label: "Floor simulator" }]} />
      <PageHeader
        icon={MapIcon}
        title="Floor simulator"
        subtitle="What being in the field will look like, shown on the desktop. Placeholder: designed in a later slice."
        actions={
          <Button size="sm" variant="outline" className="gap-1.5" onClick={openFloorView}>
            <Smartphone className="h-3.5 w-3.5" />
            Open today's floor view
          </Button>
        }
      />
      <div className="grid max-w-5xl gap-6 p-6 lg:grid-cols-[minmax(0,1fr)_220px]">
        <Card>
          <CardContent className="p-4">
            <div className="relative aspect-[16/9] rounded-md border border-dashed bg-muted/30">
              <span className="absolute left-3 top-2 text-[10px] uppercase tracking-wide text-muted-foreground">
                Floor plan (sketch)
              </span>
              {MACHINES.map((m, i) => (
                <div
                  key={i}
                  className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1"
                  style={{ left: `${m.x}%`, top: `${m.y}%` }}
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-md border bg-background shadow-sm">
                    <QrCode className="h-4 w-4 text-muted-foreground" />
                  </span>
                  <span className="font-mono text-[10px] text-muted-foreground">{m.label}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="mx-auto flex h-[360px] w-[200px] flex-col rounded-[28px] border-4 border-foreground/80 bg-background p-3 shadow-lg">
          <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-foreground/20" />
          <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-lg bg-muted/40 p-3 text-center">
            <Smartphone className="h-5 w-5 text-muted-foreground" />
            <p className="text-[11px] font-medium">Emulated phone</p>
            <p className="text-[10px] text-muted-foreground">
              Shows what the operator sees at the machine.
            </p>
          </div>
        </div>

        <div className="space-y-2 text-sm lg:col-span-2">
          <p className="font-medium">What will come here</p>
          <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
            <li>A floor plan with about five machines, each with its QR code.</li>
            <li>An emulated phone screen next to it that shows what an operator sees.</li>
            <li>Picking a machine plays the "walking there" moment, then opens its knowledge.</li>
            <li>
              During a Round: at the wrong machine you get "You're at the wrong
              machine, go to EXL-201".
            </li>
            <li>No real phone and no real scanning. This page only emulates the field.</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
