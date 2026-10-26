// Test console for the MCP server: call a tool with a real key, exactly as an
// outside assistant would (JSON-RPC over POST /mcp). The key is held in this
// page's memory only and is never stored. Every call lands in the audit log.
import { useEffect, useMemo, useState } from "react"
import { useQuery } from "convex/react"
import { AlertTriangle, ListTree, Loader2, Play } from "lucide-react"
import { api } from "../../../../convex/_generated/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

const EXAMPLES: Record<string, Record<string, unknown>> = {
  oppr_search: { query: "what to do when the vacuum drops", limit: 3 },
  oppr_get_document: { code: "EXT-OPS-SOP-0001" },
  oppr_find_similar: { title: "Cleaning the mixer", text: "Clean the mixer before a colour change." },
}

type Schema = { type?: string; properties?: Record<string, Schema>; required?: string[]; minimum?: number; description?: string }

/** Arguments to start from: a hand-picked example, else the required fields. */
function example(name: string, schema: unknown): string {
  if (EXAMPLES[name]) return JSON.stringify(EXAMPLES[name], null, 2)
  const s = schema as Schema
  const out: Record<string, unknown> = {}
  for (const key of s.required ?? []) {
    const p = s.properties?.[key] ?? {}
    const eg = /for example ([^,.;]+)/i.exec(p.description ?? "")?.[1]?.trim()
    out[key] =
      p.type === "integer" || p.type === "number" ? (p.minimum ?? 1) : p.type === "array" ? [] : p.type === "object" ? {} : (eg ?? "")
  }
  return JSON.stringify(out, null, 2)
}

interface Reply {
  status: number
  ms: number
  body: unknown
}

export function TestConsole() {
  const info = useQuery(api.mcp.info.endpointInfo)
  const [key, setKey] = useState("")
  const [tool, setTool] = useState("oppr_search")
  const [args, setArgs] = useState("")
  const [busy, setBusy] = useState(false)
  const [reply, setReply] = useState<Reply | null>(null)
  const [error, setError] = useState<string | null>(null)

  const meta = useMemo(() => info?.tools.find((t) => t.name === tool), [info, tool])
  useEffect(() => {
    if (meta) setArgs(example(meta.name, meta.inputSchema))
  }, [meta])

  async function call(method: "tools/call" | "tools/list") {
    if (!info) return
    setError(null)
    let params: Record<string, unknown> | undefined
    if (method === "tools/call") {
      try {
        params = { name: tool, arguments: args.trim() ? JSON.parse(args) : {} }
      } catch {
        setError("The arguments are not valid JSON.")
        return
      }
    }
    setBusy(true)
    const t0 = performance.now()
    try {
      const res = await fetch(info.url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key.trim()}`,
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          "Mcp-Protocol-Version": "2025-06-18",
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, ...(params ? { params } : {}) }),
      })
      const text = await res.text()
      let body: unknown = text
      try {
        body = JSON.parse(text)
      } catch {
        // Not JSON: show the raw text.
      }
      setReply({ status: res.status, ms: performance.now() - t0, body })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const result = (reply?.body as { result?: { content?: { type: string; text?: string }[]; isError?: boolean } } | undefined)
    ?.result
  const texts = result?.content?.filter((c) => c.type === "text" && c.text).map((c) => c.text as string) ?? []
  const validKey = /^opk_\S+$/.test(key.trim())

  return (
    <Card className="min-w-0" data-tour="developer-mcp-console">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Test console</CardTitle>
        <CardDescription className="text-xs">
          Calls the live endpoint with a key, the way an outside assistant does. A key is shown once, when it is made on the Keys tab; here it stays in this page only. Each
          call is written to the audit log (Activity tab).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="mcp-console-key" className="text-xs">
              Key
            </Label>
            <Input
              id="mcp-console-key"
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="opk_..."
              className="h-9 font-mono text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Tool</Label>
            <Select value={tool} onValueChange={setTool}>
              <SelectTrigger className="h-9 text-xs" aria-label="Tool">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(info?.tools ?? []).map((t) => (
                  <SelectItem key={t.name} value={t.name} className="text-xs">
                    <span className="font-mono">{t.name}</span>
                    {!t.readOnly && <span className="ml-2 text-amber-700">writes</span>}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-1">
          <Label htmlFor="mcp-console-args" className="text-xs">
            Arguments (JSON)
          </Label>
          <Textarea
            id="mcp-console-args"
            value={args}
            onChange={(e) => setArgs(e.target.value)}
            spellCheck={false}
            rows={5}
            className="font-mono text-xs"
          />
        </div>
        {meta && !meta.readOnly && (
          <p className="flex items-start gap-1.5 text-xs text-amber-800 dark:text-amber-300">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            This tool writes for real: it creates an Imported draft or a signal that Engineers will see.
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" disabled={!validKey || busy || !info} onClick={() => void call("tools/call")}>
            {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Play aria-hidden />}
            Run {tool}
          </Button>
          <Button size="sm" variant="outline" disabled={!validKey || busy || !info} onClick={() => void call("tools/list")}>
            <ListTree aria-hidden /> Tools this key can use
          </Button>
          {!validKey && <span className="text-xs text-muted-foreground">Paste a key that starts with opk_.</span>}
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
        {reply && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              <span
                className={cn(
                  "font-medium",
                  reply.status >= 400 || result?.isError ? "text-destructive" : "text-emerald-700 dark:text-emerald-400",
                )}
              >
                HTTP {reply.status}
                {result?.isError ? ", tool error" : ""}
              </span>{" "}
              in {reply.ms.toFixed(0)} ms
            </p>
            {texts.length > 0 && (
              <pre tabIndex={0} className="max-h-80 overflow-auto whitespace-pre-wrap rounded-md border bg-muted/40 p-3 text-[11px] leading-relaxed">
                {texts.join("\n\n")}
              </pre>
            )}
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground">Raw response</summary>
              <pre tabIndex={0} className="mt-1 max-h-80 overflow-auto rounded-md border bg-muted/40 p-3 font-mono text-[11px]">
                {typeof reply.body === "string" ? reply.body : JSON.stringify(reply.body, null, 2)}
              </pre>
            </details>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
