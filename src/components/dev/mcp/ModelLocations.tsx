import type { ComponentType } from "react"
import type { LucideProps } from "lucide-react"
import { Building2, Cloud, Plug, Server } from "lucide-react"
import { cn } from "@/lib/utils"
import { MODEL_LOCATIONS, type ModelHost } from "./data"

export const HOST_ICON: Record<ModelHost, ComponentType<LucideProps>> = {
  "customer-cloud": Cloud,
  "self-hosted": Server,
  oppr: Building2,
  none: Plug,
}

export const HOST_LABEL: Record<ModelHost, string> = {
  "customer-cloud": "Your own assistant",
  "self-hosted": "A model on your own site",
  oppr: "Oppr's own AI",
  none: "No model: a system calls the tools",
}

/**
 * "Where the model runs": three columns. Clicking one highlights it and the
 * scenarios that recommend it; clicking it again clears the highlight.
 */
export function ModelLocations({
  selected,
  onSelect,
}: {
  selected: ModelHost | null
  onSelect: (id: ModelHost | null) => void
}) {
  return (
    <div className="grid gap-3 md:grid-cols-3">
      {MODEL_LOCATIONS.map((m) => {
        const Icon = HOST_ICON[m.id]
        const on = selected === m.id
        return (
          <button
            key={m.id}
            type="button"
            aria-pressed={on}
            onClick={() => onSelect(on ? null : m.id)}
            className={cn(
              "flex flex-col gap-3 rounded-lg border bg-card p-4 text-left transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              on ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:border-primary/50",
              selected && !on && "opacity-60",
            )}
          >
            <div className="flex items-start gap-3">
              <span
                className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-md",
                  m.id === "oppr" ? "bg-primary/15 text-primary" : "bg-muted text-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <div className="text-sm font-semibold">{m.title}</div>
                <div className="text-xs text-muted-foreground">{m.examples}</div>
              </div>
            </div>
            <dl className="space-y-2 text-xs">
              <Fact label="Where the documents go" value={m.documentsGo} />
              <Fact label="Who pays for the model" value={m.pays} />
              <Fact label="Best for" value={m.bestFor} />
              <Fact label="Limits" value={m.limits} muted />
            </dl>
            {m.note && <p className="mt-auto rounded-md bg-primary/5 px-2 py-1.5 text-xs leading-snug text-primary">{m.note}</p>}
          </button>
        )
      })}
    </div>
  )
}

function Fact({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div>
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className={cn("leading-snug", muted && "text-muted-foreground")}>{value}</dd>
    </div>
  )
}
