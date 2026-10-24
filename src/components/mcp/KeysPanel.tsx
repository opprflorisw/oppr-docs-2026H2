import { useState } from "react"
import { useMutation, useQuery } from "convex/react"
import { Link } from "wouter"
import { toast } from "sonner"
import { AlertTriangle, Check, Copy, KeyRound, Loader2, Plus, ScrollText, XCircle } from "lucide-react"
import { api } from "../../../convex/_generated/api"
import { formatDate, formatDateTime } from "@/lib/time"
import type { Id } from "../../../convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { errorText } from "@/components/insights/PrepareRevisionDialog"
import { useCheckIn } from "@/lib/checkIn"
import { cn } from "@/lib/utils"
import { AREAS, SCOPE_INFO, SCOPES, type Scope } from "./data"
import { ScopeBadge } from "./ScopeBadge"

type KeyHost = "customer-cloud" | "self-hosted" | "other"

const HOST_TEXT: Record<KeyHost, { label: string; hint: string }> = {
  "customer-cloud": { label: "Your own assistant (cloud)", hint: "Claude, ChatGPT, Copilot in your tenant" },
  "self-hosted": { label: "A model on your own site", hint: "Ollama, Open WebUI, LibreChat" },
  other: { label: "Another system", hint: "For example a CMMS or ERP calling tools directly" },
}

export async function copyText(text: string, what = "Copied") {
  try {
    await navigator.clipboard.writeText(text)
    toast.success(what)
  } catch {
    toast.error("Copy did not work. Select the text and copy it by hand.")
  }
}

function when(ts: number | null | undefined): string {
  if (!ts) return "Never"
  const mins = Math.round((Date.now() - ts) / 60000)
  if (mins < 1) return "Just now"
  if (mins < 60) return `${mins} min ago`
  if (mins < 24 * 60) return `${Math.round(mins / 60)} h ago`
  return formatDate(ts)
}

function time(ts: number): string {
  return formatDateTime(ts)
}

/** MCP keys: list, make (Engineer check-in), revoke. Used on /mcp and in Settings. */
export function KeysPanel() {
  const keys = useQuery(api.mcp.keys.listKeys)
  const { person } = useCheckIn()
  const engineer = person?.kind === "engineer" ? person : null
  const [newOpen, setNewOpen] = useState(false)
  const [showRevoked, setShowRevoked] = useState(false)
  const [revoking, setRevoking] = useState<{ id: Id<"mcpKeys">; name: string } | null>(null)
  const revoke = useMutation(api.mcp.keys.revokeKey)

  const revokedCount = keys?.filter((k) => k.revokedAt != null).length ?? 0
  const shown = keys?.filter((k) => showRevoked || k.revokedAt == null) ?? []

  async function doRevoke() {
    if (!revoking || !engineer) return
    try {
      await revoke({ keyId: revoking.id, personId: engineer._id })
      toast.success(`Key "${revoking.name}" revoked. It stops working at once.`)
    } catch (err) {
      toast.error(errorText(err))
    } finally {
      setRevoking(null)
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0 pb-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-sm">
            <KeyRound className="h-4 w-4 text-primary" /> Keys
          </CardTitle>
          <CardDescription className="text-xs">
            One key per assistant or system. Making or revoking a key needs an Engineer check-in.
          </CardDescription>
        </div>
        <Button size="sm" className="gap-1.5" onClick={() => setNewOpen(true)}>
          <Plus className="h-3.5 w-3.5" /> New key
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        {keys === undefined ? (
          <div className="space-y-2 p-4">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : shown.length === 0 && revokedCount === 0 ? (
          <p className="px-6 pb-6 text-xs text-muted-foreground">
            No keys yet. Make one for the assistant or system that should connect.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="text-xs">
                  <TableHead>Name</TableHead>
                  <TableHead>Access</TableHead>
                  <TableHead>Areas</TableHead>
                  <TableHead className="hidden lg:table-cell">Model</TableHead>
                  <TableHead>Last used</TableHead>
                  <TableHead className="text-right">Calls 7d</TableHead>
                  <TableHead className="w-[90px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.map((k) => {
                  const revoked = k.revokedAt != null
                  return (
                    <TableRow key={k._id} className={cn("align-top text-xs", revoked && "opacity-55")}>
                      <TableCell>
                        <div className="font-medium">{k.name}</div>
                        <div className="font-mono text-[11px] text-muted-foreground">{k.prefix}…</div>
                        <div className="text-[11px] text-muted-foreground">by {k.createdByName}</div>
                      </TableCell>
                      <TableCell>
                        <div className="flex max-w-[220px] flex-wrap gap-1">
                          {k.scopes.map((s) => (
                            <ScopeBadge key={s} scope={s as Scope} />
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>{k.areaCodes.length ? k.areaCodes.join(", ") : "All"}</TableCell>
                      <TableCell className="hidden lg:table-cell">{HOST_TEXT[k.modelHost as KeyHost]?.label ?? k.modelHost}</TableCell>
                      <TableCell className="whitespace-nowrap">{when(k.lastUsedAt)}</TableCell>
                      <TableCell className="text-right tabular-nums">{k.calls7d}</TableCell>
                      <TableCell className="text-right">
                        {revoked ? (
                          <span className="text-[11px] font-medium text-destructive">Revoked</span>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                            onClick={() => setRevoking({ id: k._id, name: k.name })}
                          >
                            Revoke
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
            {revokedCount > 0 && (
              <div className="border-t px-4 py-2">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs text-muted-foreground"
                  aria-pressed={showRevoked}
                  onClick={() => setShowRevoked((v) => !v)}
                >
                  {showRevoked ? "Hide revoked keys" : `Show revoked keys (${revokedCount})`}
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>

      <NewKeyDialog open={newOpen} onOpenChange={setNewOpen} />

      <AlertDialog open={revoking != null} onOpenChange={(o) => !o && setRevoking(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke "{revoking?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              The assistant or system using this key loses access at once. Its calls stay in the audit log. This
              cannot be undone; make a new key to reconnect.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {!engineer && (
            <p className="text-xs text-amber-700 dark:text-amber-300">
              Revoking a key needs an Engineer. Check in as an Engineer (top right) to do it.
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={!engineer}
              onClick={() => void doRevoke()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Revoke key
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}

function NewKeyDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const create = useMutation(api.mcp.keys.createKey)
  const vocab = useQuery(api.naming.listVocabulary, open ? {} : "skip")
  const { person } = useCheckIn()
  const engineer = person?.kind === "engineer" ? person : null
  const [name, setName] = useState("")
  const [scopes, setScopes] = useState<Scope[]>(["read:published"])
  const [areas, setAreas] = useState<string[]>([])
  const [host, setHost] = useState<KeyHost>("customer-cloud")
  const [busy, setBusy] = useState(false)
  const [secret, setSecret] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const areaList = vocab?.locations.length ? vocab.locations.map((l) => ({ code: l.code, label: l.label })) : AREAS

  function reset() {
    setName("")
    setScopes(["read:published"])
    setAreas([])
    setHost("customer-cloud")
    setSecret(null)
    setCopied(false)
  }

  function close(o: boolean) {
    if (busy) return
    if (!o) reset()
    onOpenChange(o)
  }

  async function submit() {
    if (!engineer) return
    setBusy(true)
    try {
      const res = await create({ name, scopes, areaCodes: areas, modelHost: host, personId: engineer._id })
      setSecret(res.secret)
    } catch (err) {
      toast.error(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        {secret ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base">
                <KeyRound className="h-4 w-4 text-primary" /> Your new key
              </DialogTitle>
              <DialogDescription>Paste it into the assistant's MCP settings as a Bearer token.</DialogDescription>
            </DialogHeader>
            <div className="flex items-center gap-2 rounded-md border bg-muted/40 p-2">
              <code className="min-w-0 flex-1 break-all font-mono text-xs">{secret}</code>
              <Button
                size="sm"
                variant="outline"
                className="shrink-0 gap-1"
                onClick={() => {
                  void copyText(secret, "Key copied")
                  setCopied(true)
                }}
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} Copy
              </Button>
            </div>
            <p className="flex gap-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              This is the only time the key is shown. Oppr stores only a hash of it. If you lose it, revoke it and
              make a new one.
            </p>
            <DialogFooter>
              <Button size="sm" onClick={() => close(false)}>
                Done
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base">
                <KeyRound className="h-4 w-4 text-primary" /> New MCP key
              </DialogTitle>
              <DialogDescription>
                Give as little access as the job needs. No key can publish, approve, sign off or delete.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="mcp-key-name" className="text-xs">
                  Name
                </Label>
                <Input
                  id="mcp-key-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="For example: Sanne's Claude (onboarding)"
                  maxLength={80}
                  className="text-sm"
                />
              </div>

              <fieldset className="space-y-2">
                <legend className="text-xs font-medium">Access</legend>
                {SCOPES.map((s) => (
                  <label key={s} className="flex cursor-pointer items-start gap-2.5 rounded-md border p-2 hover:bg-muted/40">
                    <Checkbox
                      checked={scopes.includes(s)}
                      onCheckedChange={() => setScopes((l) => toggle(l, s))}
                      className="mt-0.5"
                      aria-describedby={`scope-help-${s.replace(":", "-")}`}
                    />
                    <span className="min-w-0">
                      <ScopeBadge scope={s} />
                      <span id={`scope-help-${s.replace(":", "-")}`} className="mt-1 block text-xs leading-snug text-muted-foreground">
                        {SCOPE_INFO[s].allows}
                      </span>
                    </span>
                  </label>
                ))}
              </fieldset>

              <fieldset className="space-y-2">
                <legend className="text-xs font-medium">
                  Areas <span className="font-normal text-muted-foreground">(none ticked means the whole plant)</span>
                </legend>
                <div className="flex flex-wrap gap-2">
                  {areaList.map((a) => (
                    <label key={a.code} className="flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs hover:bg-muted/40">
                      <Checkbox checked={areas.includes(a.code)} onCheckedChange={() => setAreas((l) => toggle(l, a.code))} />
                      <span className="font-mono font-medium">{a.code}</span>
                      <span className="text-muted-foreground">{a.label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <fieldset className="space-y-2">
                <legend className="text-xs font-medium">Where the model runs</legend>
                <RadioGroup value={host} onValueChange={(v) => setHost(v as KeyHost)} className="gap-1.5">
                  {(Object.keys(HOST_TEXT) as KeyHost[]).map((h) => (
                    <label key={h} className="flex cursor-pointer items-center gap-2.5 rounded-md border px-2.5 py-1.5 text-xs hover:bg-muted/40">
                      <RadioGroupItem value={h} />
                      <span className="font-medium">{HOST_TEXT[h].label}</span>
                      <span className="text-muted-foreground">{HOST_TEXT[h].hint}</span>
                    </label>
                  ))}
                </RadioGroup>
              </fieldset>

              {!engineer && (
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  A key can bring drafts in and data out. Check in as an Engineer (top right) to make one.
                </p>
              )}
            </div>
            <DialogFooter className="sticky -bottom-6 -mx-6 -mb-6 border-t bg-background px-6 py-3">
              <Button variant="outline" size="sm" onClick={() => close(false)} disabled={busy}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={() => void submit()}
                disabled={!engineer || busy || !name.trim() || scopes.length === 0}
                className="gap-1.5"
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <KeyRound className="h-3.5 w-3.5" />}
                Make the key
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

/** The latest MCP calls, allowed and refused. */
export function AuditLog() {
  const calls = useQuery(api.mcp.keys.recentCalls, { limit: 50 })
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <ScrollText className="h-4 w-4 text-primary" /> Audit log
        </CardTitle>
        <CardDescription className="text-xs">Every MCP call, allowed or refused. The latest 50.</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {calls === undefined ? (
          <div className="p-4">
            <Skeleton className="h-8 w-full" />
          </div>
        ) : calls.length === 0 ? (
          <p className="px-6 pb-6 text-xs text-muted-foreground">No calls yet. They appear here as soon as a key is used.</p>
        ) : (
          <div className="max-h-[420px] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow className="text-xs">
                  <TableHead className="w-[120px]">Time</TableHead>
                  <TableHead>Key</TableHead>
                  <TableHead>Tool</TableHead>
                  <TableHead className="w-[90px]">Result</TableHead>
                  <TableHead>Summary</TableHead>
                  <TableHead>Document</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {calls.map((c) => (
                  <TableRow key={c._id} className="align-top text-xs">
                    <TableCell className="whitespace-nowrap text-muted-foreground">{time(c.at)}</TableCell>
                    <TableCell>{c.keyName}</TableCell>
                    <TableCell className="font-mono text-[11px]">{c.tool}</TableCell>
                    <TableCell>
                      {c.ok ? (
                        <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
                          <Check className="h-3.5 w-3.5" /> ok
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-destructive">
                          <XCircle className="h-3.5 w-3.5" /> refused
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="max-w-[360px] leading-snug">{c.summary}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      {c.documentId ? (
                        <Link href={`/docs/${c.documentId}`} className="font-mono text-[11px] text-primary hover:underline">
                          {c.documentCode ?? "Open"}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
