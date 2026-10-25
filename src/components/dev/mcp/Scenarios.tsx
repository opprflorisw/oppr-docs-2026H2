import { useEffect, useState, type ComponentType, type ReactNode } from "react"
import type { LucideProps } from "lucide-react"
import {
  Bot,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Cpu,
  FileStack,
  Hammer,
  Lock,
  Moon,
  Pause,
  Play,
  RotateCcw,
  ScrollText,
  ShieldCheck,
  User,
  Wrench,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { SCENARIOS, type ModelHost, type Scenario, type Step } from "./data"
import { HOST_ICON, HOST_LABEL } from "./ModelLocations"
import { ScopeBadge } from "./ScopeBadge"

const ICON: Record<Scenario["icon"], ComponentType<LucideProps>> = {
  files: FileStack,
  lock: Lock,
  moon: Moon,
  wrench: Wrench,
  clipboard: ClipboardCheck,
}

const PLAY_MS = 2800

/** Five scenario cards; the chosen one plays below as a step-through. */
export function Scenarios({ highlight }: { highlight: ModelHost | null }) {
  const [activeId, setActiveId] = useState(SCENARIOS[0].id)
  const active = SCENARIOS.find((s) => s.id === activeId) ?? SCENARIOS[0]

  return (
    <div className="space-y-4">
      <div role="group" aria-label="Scenarios" data-tour="developer-mcp-scenarios" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 xl:pr-14">
        {SCENARIOS.map((s, i) => {
          const Icon = ICON[s.icon]
          const on = s.id === activeId
          const dim = highlight != null && s.model !== highlight && !(highlight === "oppr" && s.opprAi)
          const HostIcon = HOST_ICON[s.model]
          return (
            <button
              key={s.id}
              type="button"
              id={`scenario-tab-${s.id}`}
              aria-pressed={on}
              aria-controls="scenario-player"
              onClick={() => setActiveId(s.id)}
              className={cn(
                "flex flex-col gap-2 rounded-lg border bg-card p-3 text-left transition-all",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                on ? "border-primary ring-1 ring-primary" : "hover:border-primary/50",
                dim && "opacity-45",
                highlight != null && !dim && !on && "border-primary/60",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <Icon className="h-3.5 w-3.5 text-primary" /> Scenario {i + 1}
                </span>
                <HostIcon className="h-3.5 w-3.5 text-muted-foreground" aria-label={HOST_LABEL[s.model]} />
              </div>
              <div className="text-sm font-semibold leading-snug">{s.title}</div>
              <div className="text-xs leading-snug text-muted-foreground">{s.blurb}</div>
            </button>
          )
        })}
      </div>
      <ScenarioPlayer key={active.id} scenario={active} />
    </div>
  )
}

function ScenarioPlayer({ scenario }: { scenario: Scenario }) {
  const [step, setStep] = useState(0)
  const [playing, setPlaying] = useState(false)
  const last = scenario.steps.length - 1
  const current = scenario.steps[step]

  useEffect(() => {
    if (!playing) return
    if (step >= last) {
      setPlaying(false)
      return
    }
    const t = window.setTimeout(() => setStep((s) => Math.min(s + 1, last)), PLAY_MS)
    return () => window.clearTimeout(t)
  }, [playing, step, last])

  function togglePlay() {
    if (playing) return setPlaying(false)
    if (step >= last) setStep(0)
    setPlaying(true)
  }

  return (
    <Card id="scenario-player" role="region" aria-labelledby={`scenario-tab-${scenario.id}`}>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0 pb-3">
        <div className="min-w-0">
          <CardTitle className="text-base">{scenario.title}</CardTitle>
          <p className="mt-0.5 text-xs text-muted-foreground">{scenario.who}</p>
        </div>
        <div className="flex items-center gap-1.5">
          <Button size="sm" variant="outline" onClick={() => { setPlaying(false); setStep((s) => Math.max(0, s - 1)) }} disabled={step === 0} aria-label="Previous step">
            <ChevronLeft className="h-3.5 w-3.5" /> Back
          </Button>
          <Button size="sm" variant="outline" onClick={togglePlay} className="w-[84px] gap-1" aria-label={playing ? "Pause" : step >= last ? "Replay" : "Play"}>
            {playing ? <Pause className="h-3.5 w-3.5" /> : step >= last ? <RotateCcw className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            {playing ? "Pause" : step >= last ? "Replay" : "Play"}
          </Button>
          <Button size="sm" onClick={() => { setPlaying(false); setStep((s) => Math.min(last, s + 1)) }} disabled={step === last} aria-label="Next step">
            Next <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="min-w-0 space-y-4">
          <ol className="flex flex-wrap items-center gap-1" aria-label="Steps">
            {scenario.steps.map((s, i) => (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => { setPlaying(false); setStep(i) }}
                  aria-current={i === step ? "step" : undefined}
                  aria-label={`Step ${i + 1}${s.call ? `: ${s.call.tool}` : ""}`}
                  className={cn(
                    "flex h-6 min-w-6 items-center justify-center rounded-full border px-2 text-[11px] font-medium transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    i === step
                      ? "border-primary bg-primary text-primary-foreground"
                      : i < step
                        ? "border-primary/40 bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-muted",
                  )}
                >
                  {i + 1}
                </button>
              </li>
            ))}
            <li className="ml-2 text-[11px] text-muted-foreground">
              Step {step + 1} of {scenario.steps.length}
            </li>
          </ol>

          {scenario.funnel && <Funnel stages={scenario.funnel} reached={current.funnel ?? 0} />}

          <div className="grid gap-3 md:grid-cols-2" aria-live="polite">
            <StepPane step={current} model={scenario.model} />
            <OpprPane step={current} />
          </div>
        </div>

        <aside className="space-y-4 text-xs lg:border-l lg:pl-5">
          <Meta icon={ShieldCheck} title="Access needed">
            <div className="flex flex-wrap gap-1">
              {scenario.scopes.map((s) => (
                <ScopeBadge key={s} scope={s} />
              ))}
            </div>
            <p className="mt-1 text-muted-foreground">Areas: {scenario.areas}</p>
          </Meta>
          <Meta icon={User} title="Stays human">
            <ul className="list-disc space-y-0.5 pl-4">
              {scenario.staysHuman.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </Meta>
          <Meta icon={Hammer} title="What Oppr did not have to build">
            <ul className="list-disc space-y-0.5 pl-4">
              {scenario.notBuilt.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </Meta>
          <Meta icon={HOST_ICON[scenario.model]} title="Where the model runs">
            <p className="font-medium">{HOST_LABEL[scenario.model]}</p>
            <p className="text-muted-foreground">{scenario.modelWhy}</p>
            {scenario.opprAi && (
              <p className="mt-1.5 text-muted-foreground">
                <span className="font-medium text-foreground">{HOST_LABEL.oppr}, inside Oppr: </span>
                {scenario.opprAi}
              </p>
            )}
          </Meta>
        </aside>
      </CardContent>
    </Card>
  )
}

function Funnel({ stages, reached }: { stages: { label: string; value: number }[]; reached: number }) {
  const max = stages[0].value
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Example counts">
      {stages.map((s, i) => (
        <div
          key={s.label}
          className={cn(
            "rounded-md border p-2 transition-all",
            i <= reached ? "border-primary/40 bg-primary/5" : "opacity-40",
            i === reached && "ring-1 ring-primary",
          )}
        >
          <div className="text-lg font-semibold tabular-nums leading-none">{s.value}</div>
          <div className="mt-1 text-[11px] leading-tight text-muted-foreground">{s.label}</div>
          <div className="mt-2 h-1 rounded-full bg-muted">
            <div className="h-1 rounded-full bg-primary" style={{ width: `${(s.value / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  )
}

const WHO: Record<Step["who"], { label: string; icon: ComponentType<LucideProps> }> = {
  person: { label: "Person", icon: User },
  assistant: { label: "Assistant", icon: Bot },
  system: { label: "System", icon: Cpu },
}

function StepPane({ step, model }: { step: Step; model: ModelHost }) {
  const who = WHO[step.who]
  const place = step.who === "system" ? "Outside the assistant" : model === "self-hosted" ? "On site" : model === "none" || model === "oppr" ? "Calling system" : "In the assistant"
  return (
    <div className="flex min-h-[180px] flex-col gap-2 rounded-md border bg-muted/30 p-3">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        <who.icon className="h-3.5 w-3.5" /> {place}
      </div>
      {step.say && (
        <div
          className={cn(
            "rounded-lg px-3 py-2 text-sm leading-snug",
            step.who === "person" ? "self-end bg-primary text-primary-foreground" : "bg-background shadow-sm",
          )}
        >
          <span className="sr-only">{who.label}: </span>
          {step.say}
        </div>
      )}
      {step.call && (
        <div className="overflow-hidden rounded-md border bg-background font-mono text-[11px]">
          <div className="flex items-center gap-1.5 border-b bg-muted/50 px-2 py-1 font-semibold text-primary">
            <ScrollText className="h-3 w-3" /> {step.call.tool}
          </div>
          <pre className="whitespace-pre-wrap break-words px-2 py-1.5 text-foreground">{compactJson(step.call.args)}</pre>
          {step.call.result && (
            <div className="border-t px-2 py-1.5 text-muted-foreground">
              <span className="text-emerald-700 dark:text-emerald-400">→ </span>
              {step.call.result}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/** One line per argument, values kept compact. */
function compactJson(args: Record<string, unknown>): string {
  const entries = Object.entries(args)
  if (entries.length === 0) return "{}"
  // "[12 blocks]" stands for an elided array, so it is shown as one, not as a string.
  const lines = entries.map(([k, v]) => `  "${k}": ${typeof v === "string" && /^\[.*\]$/.test(v) ? v : JSON.stringify(v)}`)
  return ["{", lines.join(",\n"), "}"].join("\n")
}

const TONE: Record<NonNullable<Step["oppr"]["tone"]>, string> = {
  neutral: "border-border",
  none: "border-dashed border-border text-muted-foreground",
  log: "border-slate-300 dark:border-slate-700",
  draft: "border-sky-300 bg-sky-50/60 dark:border-sky-800 dark:bg-sky-950/40",
  human: "border-emerald-300 bg-emerald-50/60 dark:border-emerald-800 dark:bg-emerald-950/40",
  signal: "border-amber-300 bg-amber-50/60 dark:border-amber-800 dark:bg-amber-950/40",
}

function OpprPane({ step }: { step: Step }) {
  const tone = step.oppr.tone ?? "neutral"
  return (
    <div className={cn("flex min-h-[180px] flex-col gap-2 rounded-md border p-3", TONE[tone])}>
      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">In Oppr</div>
      <div className="text-sm font-semibold">{step.oppr.title}</div>
      {step.oppr.lines.length > 0 && (
        <ul className="space-y-1 text-xs">
          {step.oppr.lines.map((l) => (
            <li key={l} className="leading-snug">
              {l}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Meta({ icon: Icon, title, children }: { icon: ComponentType<LucideProps>; title: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5 font-semibold">
        <Icon className="h-3.5 w-3.5 text-primary" /> {title}
      </div>
      {children}
    </div>
  )
}
