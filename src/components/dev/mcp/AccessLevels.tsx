import { Ban, MapPin } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { SCOPE_INFO, SCOPES } from "./data"
import { ScopeBadge } from "./ScopeBadge"

/** The four scopes, the fixed "never" row, and how area limits work. */
export function AccessLevels() {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]" data-tour="developer-mcp-access">
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[140px]">Scope</TableHead>
                <TableHead>What it allows</TableHead>
                <TableHead className="hidden xl:table-cell">Example tools</TableHead>
                <TableHead>Risk</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {SCOPES.map((s) => {
                const info = SCOPE_INFO[s]
                return (
                  <TableRow key={s} className="align-top text-xs">
                    <TableCell>
                      <ScopeBadge scope={s} />
                      <div className="mt-1 text-[11px] text-muted-foreground">{info.write ? "Write" : "Read"}</div>
                    </TableCell>
                    <TableCell className="leading-snug">{info.allows}</TableCell>
                    <TableCell className="hidden font-mono text-[11px] leading-relaxed xl:table-cell">
                      {info.tools.map((t) => (
                        <div key={t}>{t}</div>
                      ))}
                    </TableCell>
                    <TableCell className="leading-snug text-muted-foreground">{info.risk}</TableCell>
                  </TableRow>
                )
              })}
              <TableRow className="bg-destructive/5 text-xs hover:bg-destructive/5">
                <TableCell>
                  <span className="inline-flex items-center gap-1 font-semibold text-destructive">
                    <Ban className="h-3.5 w-3.5" /> Never
                  </span>
                </TableCell>
                <TableCell colSpan={3} className="leading-snug">
                  <span className="font-medium">Publish, approve, sign off or delete.</span> No key can do these,
                  whatever its scopes. Published means a person reviewed it, so a person decides. MCP reads see
                  Published versions only, the same rule as Ask.
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="space-y-2 p-4 text-xs leading-snug">
          <div className="flex items-center gap-1.5 text-sm font-semibold">
            <MapPin className="h-4 w-4 text-primary" /> Area limits
          </div>
          <p>
            A key can be limited to areas, for example only EXT for the line 2 shift leader. It then finds and
            reads only documents, Assets and people in those areas, and it can only import drafts into them.
          </p>
          <p className="text-muted-foreground">
            A key without areas works across the whole plant. Each call is checked against the key's scopes and
            areas, and every call, allowed or refused, lands in the audit log.
          </p>
          <p className="text-muted-foreground">
            Only a hash of each key is stored. Revoke a key and it stops working at once.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
