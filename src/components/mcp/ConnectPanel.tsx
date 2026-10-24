import { useQuery } from "convex/react"
import { Copy, Lock, Plug, Wrench } from "lucide-react"
import { api } from "../../../convex/_generated/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { Scope } from "./data"
import { copyText } from "./KeysPanel"
import { ScopeBadge } from "./ScopeBadge"

function snippets(url: string) {
  return [
    {
      id: "claude-code",
      label: "Claude Code",
      note: "Run once in a terminal. Replace <your key> with the key from below.",
      code: `claude mcp add --transport http oppr ${url} --header "Authorization: Bearer <your key>"`,
    },
    {
      id: "json",
      label: "Claude Desktop / JSON",
      note: "For clients that take an mcpServers JSON block with a remote URL. Clients that only start local servers can use the mcp-remote bridge.",
      code: JSON.stringify(
        { mcpServers: { oppr: { type: "http", url, headers: { Authorization: "Bearer <your key>" } } } },
        null,
        2,
      ),
    },
    {
      id: "self-hosted",
      label: "Self-hosted",
      note: "LibreChat (librechat.yaml). Open WebUI accepts the same URL and header as a Streamable HTTP tool server. The model runs on site; only tool calls reach Oppr.",
      code: `mcpServers:\n  oppr:\n    type: streamable-http\n    url: ${url}\n    headers:\n      Authorization: "Bearer \${OPPR_MCP_KEY}"`,
    },
  ]
}

/** Endpoint, tools and copyable config, live from the backend. */
export function ConnectPanel() {
  const info = useQuery(api.mcp.info.endpointInfo)

  if (info === undefined) {
    return (
      <Card>
        <CardContent className="space-y-2 p-4">
          <Skeleton className="h-6 w-1/2" />
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    )
  }

  const items = snippets(info.url)

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <Card className="min-w-0">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Plug className="h-4 w-4 text-primary" /> Endpoint
          </CardTitle>
          <CardDescription className="text-xs">
            Streamable HTTP. Every request carries a key as a Bearer token.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2 rounded-md border bg-muted/40 p-2">
            <code className="min-w-0 flex-1 break-all font-mono text-xs">{info.url}</code>
            <Button size="sm" variant="outline" className="shrink-0 gap-1" onClick={() => void copyText(info.url, "Endpoint copied")}>
              <Copy className="h-3.5 w-3.5" /> Copy
            </Button>
          </div>
          <Tabs defaultValue="claude-code">
            <TabsList className="h-auto flex-wrap justify-start">
              {items.map((s) => (
                <TabsTrigger key={s.id} value={s.id} className="text-xs">
                  {s.label}
                </TabsTrigger>
              ))}
            </TabsList>
            {items.map((s) => (
              <TabsContent key={s.id} value={s.id} className="space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-xs text-muted-foreground">{s.note}</p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 shrink-0 gap-1 px-2 text-xs"
                    onClick={() => void copyText(s.code, "Config copied")}
                    aria-label={`Copy the ${s.label} config`}
                  >
                    <Copy className="h-3 w-3" /> Copy
                  </Button>
                </div>
                <pre className="overflow-x-auto rounded-md border bg-muted/40 p-3 font-mono text-[11px] leading-relaxed">
                  {s.code}
                </pre>
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>

      <Card className="min-w-0">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Wrench className="h-4 w-4 text-primary" /> Tools ({info.tools.length})
          </CardTitle>
          <CardDescription className="text-xs">
            What a connected assistant can call. A key sees only the tools its scopes allow.
          </CardDescription>
        </CardHeader>
        <CardContent className="max-h-[420px] space-y-2 overflow-y-auto">
          {info.tools.map((t) => (
            <div key={t.name} className="rounded-md border p-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs font-semibold">{t.name}</span>
                <ScopeBadge scope={t.scope as Scope} />
                {t.readOnly && (
                  <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                    <Lock className="h-3 w-3" /> read-only
                  </span>
                )}
              </div>
              <p className="mt-1 line-clamp-3 text-xs leading-snug text-muted-foreground" title={t.description}>
                {t.description}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
