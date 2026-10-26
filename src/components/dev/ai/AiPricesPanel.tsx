// Prices tab of /dev/ai: the Price table (CONTEXT.md). Everyone in the
// Developer section sees it; only an Admin changes it. A new price applies
// from its date on; calls already recorded keep their cost. Removing a
// mistaken row prices the calls it priced again.
import { useState } from "react"
import { useMutation, useQuery } from "convex/react"
import { toast } from "sonner"
import { Loader2, Plus, Trash2 } from "lucide-react"
import { api } from "../../../../convex/_generated/api"
import type { Id } from "../../../../convex/_generated/dataModel"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatDate } from "@/lib/time"
import { errorText, useSettingsEditor } from "@/components/settings/SettingsBits"
import { count, usd } from "./aiUsageFormat"

type Kind = "tokens" | "image" | "embedding"

const KIND_LABEL: Record<Kind, string> = {
  tokens: "Per 1M tokens",
  image: "Per image",
  embedding: "Per 1k items",
}

export function AiPricesPanel() {
  const { editorId } = useSettingsEditor()
  const data = useQuery(api.aiPrices.list, editorId ? { personId: editorId } : "skip")
  const addDefaults = useMutation(api.aiPrices.addDefaults)
  const priceUnpriced = useMutation(api.aiPrices.priceUnpriced)
  const removePrice = useMutation(api.aiPrices.removePrice)
  const [busy, setBusy] = useState<string | null>(null)

  if (!editorId) return null

  async function run(key: string, fn: () => Promise<string>) {
    setBusy(key)
    try {
      toast.success(await fn())
    } catch (err) {
      toast.error(errorText(err))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-5" data-testid="ai-prices">
      <Card data-tour="developer-ai-prices-table">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Price table</CardTitle>
          <CardDescription className="text-sm">
            List prices of the models in use, in USD, each from the date it applies. Every cost on the AI usage tab is an
            estimate from this table. It is not what Oppr charges a customer.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {!data ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <>
              {data.rows.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No prices yet. They are added the first time a model is used, or with the button below.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Model</TableHead>
                      <TableHead>Price</TableHead>
                      <TableHead>From</TableHead>
                      <TableHead className="hidden lg:table-cell">Note</TableHead>
                      {data.canEdit && <TableHead className="w-10" aria-label="Remove" />}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.rows.map((r) => (
                      <TableRow key={r._id} className={r.inForce ? undefined : "text-muted-foreground"}>
                        <TableCell>
                          <p className="font-mono text-xs">{r.model}</p>
                          <div className="text-xs text-muted-foreground">
                            {r.provider}
                            {r.inForce && (
                              <Badge variant="outline" className="ml-2 h-5 px-1.5 text-[10px]">
                                In force
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="tabular-nums text-sm">{priceText(r)}</TableCell>
                        <TableCell className="whitespace-nowrap text-xs">
                          {r.effectiveFrom === 0 ? "From the start" : formatDate(r.effectiveFrom)}
                          {r.updatedByName && <p className="text-muted-foreground">by {r.updatedByName}</p>}
                        </TableCell>
                        <TableCell className="hidden max-w-[22rem] text-xs text-muted-foreground lg:table-cell">{r.note}</TableCell>
                        {data.canEdit && (
                          <TableCell>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8"
                              aria-label={`Remove the price of ${r.model} from ${r.effectiveFrom === 0 ? "the start" : formatDate(r.effectiveFrom)}`}
                              disabled={busy !== null}
                              onClick={() =>
                                void run(`rm-${r._id}`, async () => {
                                  const n = await removePrice({ personId: editorId, priceId: r._id })
                                  return n > 0
                                    ? `Price removed. ${n} ${n === 1 ? "call it priced was" : "calls it priced were"} priced again.`
                                    : "Price removed."
                                })
                              }
                            >
                              <Trash2 className="h-4 w-4" aria-hidden />
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
              {data.canEdit ? (
                <div className="flex flex-wrap gap-2">
                  {data.missingDefaults.length > 0 && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy !== null}
                      onClick={() =>
                        void run("defaults", async () => {
                          const n = await addDefaults({ personId: editorId })
                          return `Added ${n} default ${n === 1 ? "price" : "prices"}.`
                        })
                      }
                    >
                      {busy === "defaults" && <Loader2 className="animate-spin" aria-hidden />}
                      Add default list prices ({data.missingDefaults.length})
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy !== null}
                    onClick={() =>
                      void run("reprice", async () => {
                        const n = await priceUnpriced({ personId: editorId })
                        return n === 0 ? "Every call of the last 30 days already has a cost." : `Priced ${count(n)} earlier calls.`
                      })
                    }
                  >
                    {busy === "reprice" && <Loader2 className="animate-spin" aria-hidden />}
                    Price earlier calls without a cost
                  </Button>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Check in as an Admin to change prices.</p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {data?.canEdit && <SetPriceForm personId={editorId} models={[...new Set(data.rows.map((r) => r.model))]} />}
    </div>
  )
}

function priceText(r: { kind: Kind; inPerMTok?: number; outPerMTok?: number; perImage?: number; perKItems?: number }): string {
  if (r.kind === "tokens") return `${usd(r.inPerMTok ?? 0)} in, ${usd(r.outPerMTok ?? 0)} out per 1M tokens`
  if (r.kind === "image") return `${usd(r.perImage ?? 0)} per image`
  return `${usd(r.perKItems ?? 0)} per 1k items`
}

function SetPriceForm({ personId, models }: { personId: Id<"people">; models: string[] }) {
  const setPrice = useMutation(api.aiPrices.setPrice)
  const [model, setModel] = useState(models[0] ?? "")
  const [provider, setProvider] = useState("")
  const [kind, setKind] = useState<Kind>("tokens")
  const [a, setA] = useState("")
  const [b, setB] = useState("")
  const [from, setFrom] = useState(() => new Date().toISOString().slice(0, 10))
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState(false)

  const num = (s: string) => (s.trim() === "" ? undefined : Number(s.replace(",", ".")))

  async function save() {
    setBusy(true)
    try {
      await setPrice({
        personId,
        provider: provider || (model.startsWith("claude") ? "anthropic" : model.startsWith("gemini") ? "google" : "other"),
        model,
        kind,
        ...(kind === "tokens" ? { inPerMTok: num(a), outPerMTok: num(b) ?? 0 } : {}),
        ...(kind === "image" ? { perImage: num(a) } : {}),
        ...(kind === "embedding" ? { perKItems: num(a) } : {}),
        effectiveFrom: Date.parse(`${from}T00:00:00.000Z`),
        note,
      })
      toast.success(`New price for ${model} from ${from}. Earlier calls keep their cost.`)
      setA("")
      setB("")
      setNote("")
    } catch (err) {
      toast.error(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Set a price</CardTitle>
        <CardDescription className="text-sm">
          Applies from the start of the chosen day (UTC). The same model and day replaces that price.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
          onSubmit={(e) => {
            e.preventDefault()
            void save()
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="price-model">Model</Label>
            <Input id="price-model" list="price-models" value={model} onChange={(e) => setModel(e.target.value)} />
            <datalist id="price-models">
              {models.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="price-provider">Provider</Label>
            <Input id="price-provider" placeholder="anthropic, google" value={provider} onChange={(e) => setProvider(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="price-kind">Priced</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as Kind)}>
              <SelectTrigger id="price-kind">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(KIND_LABEL) as Kind[]).map((k) => (
                  <SelectItem key={k} value={k}>
                    {KIND_LABEL[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="price-a">{kind === "tokens" ? "USD per 1M input tokens" : kind === "image" ? "USD per image" : "USD per 1k items"}</Label>
            <Input id="price-a" inputMode="decimal" value={a} onChange={(e) => setA(e.target.value)} />
          </div>
          {kind === "tokens" && (
            <div className="space-y-1.5">
              <Label htmlFor="price-b">USD per 1M output tokens</Label>
              <Input id="price-b" inputMode="decimal" value={b} onChange={(e) => setB(e.target.value)} />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="price-from">From</Label>
            <Input id="price-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-1.5 sm:col-span-2 lg:col-span-3">
            <Label htmlFor="price-note">Note</Label>
            <Input id="price-note" placeholder="Where the price comes from" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <div className="sm:col-span-2 lg:col-span-3">
            <Button type="submit" size="sm" disabled={busy || !model.trim() || a.trim() === "" || !from}>
              {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Plus aria-hidden />}
              Save price
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
