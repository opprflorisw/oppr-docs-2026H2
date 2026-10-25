// The Developer section: tools for Engineers and Admins to try out models,
// MCP and AI setups. Not one of the six places (CONTEXT.md); it is a small
// group under them in the left nav, like "Try it", and only Engineers and
// Admins see it. Everyone else who opens a /dev address gets a short notice.
import type { ComponentType } from "react"
import type { LucideProps } from "lucide-react"
import { Cable, Cpu, FlaskConical, Microscope, TerminalSquare } from "lucide-react"
import { useLocation, useRoute } from "wouter"
import { useCheckIn } from "@/lib/checkIn"
import { isEngineerOrAdmin } from "@/lib/roles"

export interface DevTool {
  label: string
  href: string
  icon: ComponentType<LucideProps>
  /** One line: what it is for. */
  lead: string
}

export const DEV_HOME: DevTool = {
  label: "Overview",
  href: "/dev",
  icon: TerminalSquare,
  lead: "Tools to try out models, connections and AI setups.",
}

export const DEV_TOOL = {
  embeddings: {
    label: "Embeddings lab",
    href: "/dev/embeddings",
    icon: FlaskConical,
    lead: "Run EmbeddingGemma 2 in this browser on text and photos, and compare it with production search.",
  },
  mcp: {
    label: "MCP",
    href: "/dev/mcp",
    icon: Cable,
    lead: "Connect an outside assistant: endpoint, keys, tools with a test console, and every call made.",
  },
  ai: {
    label: "AI models and jobs",
    href: "/dev/ai",
    icon: Cpu,
    lead: "Which model does what, the search index, what runs by itself and what every AI call costs.",
  },
  analysis: {
    label: "Analysis",
    href: "/dev/analysis",
    icon: Microscope,
    lead: "Case files: investigations, gap analyses and design proposals.",
  },
} satisfies Record<string, DevTool>

export const DEV_TOOLS: DevTool[] = Object.values(DEV_TOOL)

/** Engineers and Admins (checked in) see the Developer section. */
export function useIsDeveloper(): boolean {
  const { person } = useCheckIn()
  return isEngineerOrAdmin(person)
}

export interface DevTab {
  value: string
  label: string
}

/**
 * The tab of a Developer page, read from the path (/dev/mcp/keys). The first
 * tab has no segment of its own. An unknown segment falls back to the first.
 */
export function useDevTab(base: string, tabs: DevTab[]): [string, (t: string) => void] {
  const [, params] = useRoute<{ tab: string }>(`${base}/:tab`)
  const [, navigate] = useLocation()
  const tab = tabs.some((t) => t.value === params?.tab) ? params!.tab : tabs[0].value
  const go = (t: string) => navigate(t === tabs[0].value ? base : `${base}/${t}`)
  return [tab, go]
}
