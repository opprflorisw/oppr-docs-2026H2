// Limits and Plan tab of /dev/ai. The Wiki AI limits (spec 6.6) and the kill
// switch, then the Plan (CONTEXT.md): off until an Admin sets one. Amounts and
// plan names are the user's decision; nothing here sets a product price.
import { useEffect, useState } from "react"
import { useMutation, useQuery } from "convex/react"
import { toast } from "sonner"
import { Loader2, Plus, Power, Trash2 } from "lucide-react"
import { api } from "../../../../convex/_generated/api"
import type { Id } from "../../../../convex/_generated/dataModel"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { formatDate } from "@/lib/time"
import { cn } from "@/lib/utils"
import { errorText, useSettingsEditor } from "@/components/settings/SettingsBits"
import { count, featureLabel, usd } from "./aiUsageFormat"

type LimitsData = NonNullable<ReturnType<typeof useLimits>>

function useLimits(personId: Id<"people"> | null) {
  return useQuery(api.aiUsage.limits, personId ? { personId } : "skip")
}

export function AiLimitsPanel() {
  const { editorId } = useSettingsEditor()
  const data = useLimits(editorId)
  if (!editorId) return null
  if (!data) return <Skeleton className="h-64 w-full" />
  return (
    <div className="space-y-5" data-testid="ai-limits">
      <WikiLimits data={data} personId={editorId} />
      <PlanCard data={data} personId={editorId} />
    </div>
  )
}

function Meter({ used, of, label }: { used: number; of: number; label: string }) {
  const share = of > 0 ? Math.min(1, used / of) : 1
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span>{label}</span>
        <span className="tabular-nums text-muted-foreground">
          {count(Math.round(used))} of {count(of)}
        </span>
      </div>
      <div
        className="h-2 overflow-hidden rounded-full bg-muted"
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={of}
        aria-valuenow={used}
      >
        <div className={cn("h-full", share >= 1 ? "bg-destructive" : share >= 0.8 ? "bg-amber-500" : "bg-primary")} style={{ width: `${share * 100}%` }} />
      </div>
    </div>
  )
}

const LIMIT_FIELDS = [
  { key: "deploymentDaily", label: "Deployment, per day", hint: "All Wiki AI actions together." },
  { key: "wikiDaily", label: "One Wiki, per day", hint: "People and system jobs." },
  { key: "systemDaily", label: "System jobs, per day", hint: "Migration, publish rebuilds, nightly." },
  { key: "systemPerWikiDaily", label: "Automatic rebuilds per Wiki, per day", hint: "" },
  { key: "wikiBlock", label: "Block generations per person, per hour", hint: "" },
  { key: "wikiCheck", label: "Checks per person, per hour", hint: "" },
  { key: "wikiFind", label: "Source searches per person, per hour", hint: "" },
] as const
type LimitKey = (typeof LIMIT_FIELDS)[number]["key"]

function currentLimits(d: LimitsData): Record<LimitKey, number> {
  return {
    deploymentDaily: d.caps.deploymentDaily,
    wikiDaily: d.caps.wikiDaily,
    systemDaily: d.caps.systemDaily,
    systemPerWikiDaily: d.caps.systemPerWikiDaily,
    wikiBlock: d.caps.personHourly.wikiBlock,
    wikiCheck: d.caps.personHourly.wikiCheck,
    wikiFind: d.caps.personHourly.wikiFind,
  }
}

function defaultLimits(d: LimitsData): Record<LimitKey, number> {
  return {
    deploymentDaily: d.defaults.deploymentDaily,
    wikiDaily: d.defaults.wikiDaily,
    systemDaily: d.defaults.systemDaily,
    systemPerWikiDaily: d.defaults.systemPerWikiDaily,
    wikiBlock: d.defaults.personHourly.wikiBlock,
    wikiCheck: d.defaults.personHourly.wikiCheck,
    wikiFind: d.defaults.personHourly.wikiFind,
  }
}

function WikiLimits({ data, personId }: { data: LimitsData; personId: Id<"people"> }) {
  const setLimits = useMutation(api.aiUsage.setLimits)
  const [form, setForm] = useState<Record<LimitKey, string>>(() => strings(currentLimits(data)))
  const [busy, setBusy] = useState(false)
  const saved = currentLimits(data)
  const defaults = defaultLimits(data)
  useEffect(() => setForm(strings(currentLimits(data))), [data])
  const changed = LIMIT_FIELDS.some((f) => form[f.key].trim() !== String(saved[f.key]))
  const off = data.killSwitch.env || data.killSwitch.setting

  async function save(extra?: { wikiAiOff: boolean }) {
    setBusy(true)
    try {
      const n = (k: LimitKey) => Number(form[k])
      await setLimits({
        personId,
        ...(extra ?? {
          deploymentDailyCap: n("deploymentDaily"),
          wikiDailyCap: n("wikiDaily"),
          systemDailyCap: n("systemDaily"),
          systemPerWikiDaily: n("systemPerWikiDaily"),
          personHourly: { wikiBlock: n("wikiBlock"), wikiCheck: n("wikiCheck"), wikiFind: n("wikiFind") },
        }),
      })
      toast.success(extra ? (extra.wikiAiOff ? "Wiki AI is switched off." : "Wiki AI is switched on.") : "Limits saved.")
    } catch (err) {
      toast.error(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card data-tour="developer-ai-limits-wiki">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Wiki AI limits</CardTitle>
        <CardDescription className="text-sm">
          Every Wiki AI action (build, Generate, Check against Published, Find sources) counts against these. A failed
          action does not count. Other AI features are only counted on the AI usage tab.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className={cn("flex flex-wrap items-center justify-between gap-3 rounded-md border p-3", off && "border-destructive/50 bg-destructive/5")}>
          <div className="flex items-start gap-2">
            <Power className={cn("mt-0.5 h-4 w-4", off ? "text-destructive" : "text-muted-foreground")} aria-hidden />
            <div>
              <p className="text-sm font-medium">{off ? "Wiki AI is switched off" : "Wiki AI is on"}</p>
              <p className="text-xs text-muted-foreground">
                {data.killSwitch.env
                  ? "Switched off on the deployment (OPPR_WIKI_AI_OFF=1). Reading, editing and applying still work."
                  : "Kill switch: when off, every Wiki AI action is refused. Reading, editing and applying still work."}
              </p>
            </div>
          </div>
          {data.canEdit && !data.killSwitch.env && (
            <div className="flex items-center gap-2">
              <Label htmlFor="wiki-ai-off" className="text-sm">
                Switch off
              </Label>
              <Switch id="wiki-ai-off" checked={data.killSwitch.setting} disabled={busy} onCheckedChange={(v) => void save({ wikiAiOff: v })} />
            </div>
          )}
        </div>

        <Meter used={data.actionsToday} of={data.caps.deploymentDaily} label="Wiki AI actions in the last 24 hours" />

        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault()
            void save()
          }}
        >
          {LIMIT_FIELDS.map((f) => (
            <div key={f.key} className="space-y-1">
              <Label htmlFor={`limit-${f.key}`}>{f.label}</Label>
              <Input
                id={`limit-${f.key}`}
                inputMode="numeric"
                value={form[f.key]}
                disabled={!data.canEdit}
                onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                {f.hint ? `${f.hint} ` : ""}Default {count(defaults[f.key])}.
              </p>
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
            {data.canEdit ? (
              <>
                <Button type="submit" size="sm" disabled={busy || !changed}>
                  {busy && <Loader2 className="animate-spin" aria-hidden />}
                  Save limits
                </Button>
                {changed && (
                  <Button type="button" size="sm" variant="ghost" onClick={() => setForm(strings(saved))}>
                    Undo changes
                  </Button>
                )}
              </>
            ) : (
              <p className="text-xs text-muted-foreground">Check in as an Admin to change limits.</p>
            )}
            {data.updatedAt && <span className="text-xs text-muted-foreground">Last changed {formatDate(data.updatedAt)}</span>}
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

function strings<K extends string>(r: Record<K, number>): Record<K, string> {
  return Object.fromEntries(Object.entries(r).map(([k, v]) => [k, String(v)])) as Record<K, string>
}

interface PlanForm {
  enabled: boolean
  name: string
  monthlyActions: string
  monthlyCredits: string
  features: { feature: string; monthly: string }[]
  overage: boolean
  atLimit: "warn" | "stop"
}

function planForm(plan: LimitsData["plan"]): PlanForm {
  return {
    enabled: plan?.enabled ?? false,
    name: plan?.name ?? "",
    monthlyActions: plan?.monthlyActions !== undefined ? String(plan.monthlyActions) : "",
    monthlyCredits: plan?.monthlyCredits !== undefined ? String(plan.monthlyCredits) : "",
    features: (plan?.featureLimits ?? []).map((f) => ({ feature: f.feature, monthly: String(f.monthly) })),
    overage: plan?.overage ?? false,
    atLimit: plan?.atLimit ?? "warn",
  }
}

function PlanCard({ data, personId }: { data: LimitsData; personId: Id<"people"> }) {
  const setPlan = useMutation(api.aiUsage.setPlan)
  const [form, setForm] = useState<PlanForm>(() => planForm(data.plan))
  const [busy, setBusy] = useState(false)
  useEffect(() => setForm(planForm(data.plan)), [data.plan])
  const u = data.planUsage
  const plan = data.plan
  const readOnly = !data.canEdit

  async function save(next: PlanForm) {
    setBusy(true)
    try {
      const num = (s: string) => (s.trim() === "" ? undefined : Number(s.replace(",", ".")))
      await setPlan({
        personId,
        plan: {
          enabled: next.enabled,
          name: next.name,
          monthlyActions: num(next.monthlyActions),
          monthlyCredits: num(next.monthlyCredits),
          featureLimits: next.features
            .filter((f) => f.feature.trim() && f.monthly.trim())
            .map((f) => ({ feature: f.feature, monthly: Number(f.monthly) })),
          overage: next.overage,
          atLimit: next.atLimit,
        },
      })
      toast.success(next.enabled ? "Plan saved." : "Plan saved and turned off.")
    } catch (err) {
      toast.error(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card data-tour="developer-ai-limits-plan">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0 pb-3">
        <div className="space-y-1.5">
          <CardTitle className="flex items-center gap-2 text-sm">
            Plan
            <Badge variant={plan?.enabled ? "default" : "outline"}>{plan?.enabled ? "On" : "Off"}</Badge>
          </CardTitle>
          <CardDescription className="max-w-2xl text-sm">
            The AI allowance this organisation has bought. Off until set: without a Plan only the Wiki AI limits above
            apply. An AI action is one model call that worked; one credit is one USD of estimated model cost. Amounts
            and names are yours to decide.
          </CardDescription>
        </div>
        {!readOnly && (
          <div className="flex items-center gap-2">
            <Label htmlFor="plan-on" className="text-sm">
              Use a Plan
            </Label>
            <Switch
              id="plan-on"
              checked={form.enabled}
              disabled={busy}
              onCheckedChange={(v) => {
                const next = { ...form, enabled: v }
                setForm(next)
                if (!v && plan?.enabled) void save(next)
              }}
            />
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-5">
        {u && plan?.enabled && (
          <div className="space-y-3 rounded-md border p-3">
            <p className="text-xs text-muted-foreground">This month (UTC), from {formatDate(u.monthStart)}</p>
            {plan.monthlyActions !== undefined && <Meter used={u.actions} of={plan.monthlyActions} label="AI actions" />}
            {plan.monthlyCredits !== undefined && (
              <div className="space-y-1">
                <Meter used={u.credits} of={plan.monthlyCredits} label="Credits" />
                <p className="text-xs text-muted-foreground">{usd(u.credits)} estimated model cost so far.</p>
              </div>
            )}
            {u.features.map((f) => (
              <Meter key={f.feature} used={f.used} of={f.monthly} label={featureLabel(f.feature)} />
            ))}
            {plan.monthlyActions === undefined && plan.monthlyCredits === undefined && u.features.length === 0 && (
              <p className="text-sm text-muted-foreground">{count(u.actions)} AI actions this month. The Plan sets no allowance yet.</p>
            )}
            {u.overall && (
              <p className="text-sm font-medium text-destructive">
                {u.overall}.{" "}
                {plan.atLimit === "stop" && !plan.overage ? "New AI calls are refused until next month." : "AI keeps working; this is a warning."}
              </p>
            )}
            {u.truncated && <p className="text-xs text-muted-foreground">More calls than one read takes: the numbers are a lower bound.</p>}
          </div>
        )}

        {(form.enabled || plan) && (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              void save(form)
            }}
          >
            <fieldset disabled={readOnly || busy} className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <Label htmlFor="plan-name">Name</Label>
                <Input id="plan-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="plan-actions">AI actions per month</Label>
                <Input
                  id="plan-actions"
                  inputMode="numeric"
                  placeholder="No allowance"
                  value={form.monthlyActions}
                  onChange={(e) => setForm({ ...form, monthlyActions: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="plan-credits">Credits per month</Label>
                <Input
                  id="plan-credits"
                  inputMode="decimal"
                  placeholder="No allowance"
                  value={form.monthlyCredits}
                  onChange={(e) => setForm({ ...form, monthlyCredits: e.target.value })}
                />
              </div>
            </fieldset>

            <fieldset disabled={readOnly || busy} className="space-y-2">
              <legend className="text-sm font-medium">Limits per feature, per month</legend>
              <p className="text-xs text-muted-foreground">
                A feature such as "wiki" covers every Wiki feature (wiki.build, wiki.block...); "ask" covers Ask only.
              </p>
              {form.features.map((f, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2">
                  <Input
                    aria-label="Feature"
                    className="w-48"
                    list="plan-features"
                    value={f.feature}
                    onChange={(e) => setForm({ ...form, features: form.features.map((x, j) => (j === i ? { ...x, feature: e.target.value } : x)) })}
                  />
                  <Input
                    aria-label={`AI actions per month for ${f.feature || "this feature"}`}
                    className="w-36"
                    inputMode="numeric"
                    value={f.monthly}
                    onChange={(e) => setForm({ ...form, features: form.features.map((x, j) => (j === i ? { ...x, monthly: e.target.value } : x)) })}
                  />
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    aria-label={`Remove the limit for ${f.feature || "this feature"}`}
                    onClick={() => setForm({ ...form, features: form.features.filter((_, j) => j !== i) })}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </Button>
                </div>
              ))}
              <datalist id="plan-features">
                {["wiki", "wiki.build", "wiki.block", "wiki.check", "ask", "writer", "training", "capture", "image.generate", "mcp", "embed"].map((x) => (
                  <option key={x} value={x} />
                ))}
              </datalist>
              {!readOnly && (
                <Button type="button" size="sm" variant="outline" onClick={() => setForm({ ...form, features: [...form.features, { feature: "", monthly: "" }] })}>
                  <Plus aria-hidden /> Add a feature limit
                </Button>
              )}
            </fieldset>

            <fieldset disabled={readOnly || busy} className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <p id="plan-at-limit" className="text-sm font-medium">
                  At the limit
                </p>
                <RadioGroup aria-labelledby="plan-at-limit" value={form.atLimit} onValueChange={(v) => setForm({ ...form, atLimit: v as "warn" | "stop" })}>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="warn" id="plan-warn" />
                    <Label htmlFor="plan-warn" className="font-normal">
                      Warn, keep working
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="stop" id="plan-stop" />
                    <Label htmlFor="plan-stop" className="font-normal">
                      Stop new AI calls until next month
                    </Label>
                  </div>
                </RadioGroup>
              </div>
              <div className="flex items-start gap-2">
                <Switch id="plan-overage" checked={form.overage} onCheckedChange={(v) => setForm({ ...form, overage: v })} />
                <div>
                  <Label htmlFor="plan-overage">Overage allowed</Label>
                  <p className="text-xs text-muted-foreground">Use past the allowance is counted, not refused, even with Stop.</p>
                </div>
              </div>
            </fieldset>

            {!readOnly ? (
              <Button type="submit" size="sm" disabled={busy}>
                {busy && <Loader2 className="animate-spin" aria-hidden />}
                Save Plan
              </Button>
            ) : (
              <p className="text-xs text-muted-foreground">Check in as an Admin to change the Plan.</p>
            )}
          </form>
        )}
        {!form.enabled && !plan && (
          <p className="text-sm text-muted-foreground">
            No Plan. {readOnly ? "An Admin can set one." : "Turn on Use a Plan to set the allowance for this organisation."}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
