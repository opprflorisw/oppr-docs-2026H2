// Shared shell for analysis pages.
//
// Analyses are static documents that live inside the app at /analysis/<slug>.
// They use real shadcn primitives so the proposed UX can be rendered as a
// genuine React mock instead of a figma export. Pure presentational — no
// DB, no AI, no live data. See .claude/skills/analysis-page/SKILL.md.

import type { ReactNode } from "react"
import { Microscope } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { TopBar } from "@/components/layout/TopBar"

interface AnalysisLayoutProps {
  title: string
  subtitle?: string
  date: string
  scopes: Array<"desktop" | "mobile" | "AI" | "data-model" | "tracking">
  children: ReactNode
}

export function AnalysisLayout({
  title,
  subtitle,
  date,
  scopes,
  children,
}: AnalysisLayoutProps) {
  return (
    <div className="flex flex-1 flex-col">
      <TopBar
        breadcrumb={[
          { label: "Developer", href: "/dev" },
          { label: "Analysis", href: "/dev/analysis" },
          { label: title },
        ]}
      />
      <main className="flex-1 overflow-y-auto bg-muted/20">
        <div className="mx-auto w-full max-w-5xl px-8 py-8">
          <header className="mb-6">
            <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
              <Microscope className="h-3 w-3" />
              Analysis
              <span aria-hidden>·</span>
              <span>{date}</span>
            </div>
            <h1 className="text-2xl font-semibold leading-tight">{title}</h1>
            {subtitle && (
              <p className="mt-1.5 max-w-3xl text-sm text-muted-foreground">{subtitle}</p>
            )}
            <div className="mt-3 flex flex-wrap gap-1.5">
              {scopes.map((s) => (
                <Badge key={s} variant="secondary" className="font-mono text-[10px]">
                  {s}
                </Badge>
              ))}
            </div>
          </header>
          <Separator className="mb-6" />
          <div className="space-y-8">{children}</div>
        </div>
      </main>
    </div>
  )
}

export function Section({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: ReactNode
}) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-base font-semibold">{title}</h2>
        {description && (
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        )}
      </div>
      {children}
    </section>
  )
}
