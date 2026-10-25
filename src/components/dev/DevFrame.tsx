// Frame and notice of the Developer pages (see devTools.ts).
import type { ReactNode } from "react"
import { ShieldCheck } from "lucide-react"
import { TopBar, type BreadcrumbItem } from "@/components/layout/TopBar"
import { PageHeader, type HeaderAction } from "@/components/layout/PageHeader"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { DEV_HOME, useIsDeveloper, type DevTab, type DevTool } from "./devTools"

/** Shown instead of a Developer page to everyone else. */
export function DevNotice() {
  return (
    <div className="mx-auto w-full max-w-xl p-6">
      <div role="status" className="flex items-start gap-3 rounded-lg border bg-card p-5">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
        <div className="space-y-1">
          <p className="text-sm font-medium">This page is for Engineers and Admins</p>
          <p className="text-sm text-muted-foreground">
            The Developer section holds tools for trying out models and connections. Check in as an Engineer or
            Admin (top right) to open it.
          </p>
        </div>
      </div>
    </div>
  )
}

/**
 * Frame of every Developer page: breadcrumb, header, a row of tabs in the
 * URL, and the notice for people who are not Engineers or Admins.
 */
export function DevPage({
  tool,
  statusLine,
  tabs,
  tab,
  onTab,
  primary,
  crumbs,
  children,
}: {
  tool: DevTool
  statusLine: ReactNode
  tabs?: DevTab[]
  tab?: string
  onTab?: (t: string) => void
  primary?: HeaderAction
  /** Extra breadcrumb items after the tool. */
  crumbs?: BreadcrumbItem[]
  children: ReactNode
}) {
  const allowed = useIsDeveloper()
  const tabLabel = tabs?.find((t) => t.value === tab)?.label
  const isHome = tool.href === DEV_HOME.href
  const breadcrumb: BreadcrumbItem[] = isHome
    ? [{ label: "Developer" }]
    : [
        { label: "Developer", href: "/dev" },
        tabLabel && tab !== tabs?.[0].value ? { label: tool.label, href: tool.href } : { label: tool.label },
        ...(tabLabel && tab !== tabs?.[0].value ? [{ label: tabLabel }] : []),
        ...(crumbs ?? []),
      ]
  return (
    <div className="flex flex-col">
      <TopBar breadcrumb={breadcrumb} />
      <PageHeader
        icon={tool.icon}
        title={isHome ? "Developer" : tool.label}
        statusLine={statusLine}
        documentTitle={tabLabel ? `${tabLabel} · ${tool.label}` : isHome ? "Developer" : tool.label}
        primary={allowed ? primary : undefined}
      />
      {!allowed ? (
        <DevNotice />
      ) : (
        <div className="mx-auto w-full max-w-6xl space-y-5 p-6">
          {tabs && tab && onTab ? (
            <Tabs value={tab} onValueChange={onTab} className="space-y-5">
              <TabsList className="h-auto flex-wrap" data-tour={`developer-${tool.href.split("/")[2]}-tabs`}>
                {tabs.map((t) => (
                  <TabsTrigger key={t.value} value={t.value} data-tour={`developer-${tool.href.split("/")[2]}-tab-${t.value}`}>
                    {t.label}
                  </TabsTrigger>
                ))}
              </TabsList>
              <TabsContent value={tab} className="mt-0 space-y-5">
                {children}
              </TabsContent>
            </Tabs>
          ) : (
            children
          )}
        </div>
      )}
    </div>
  )
}
