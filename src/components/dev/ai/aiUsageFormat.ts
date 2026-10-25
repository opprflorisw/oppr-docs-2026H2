// Labels and number formats for the AI usage, Prices and Limits tabs.

const FEATURE_LABEL: Record<string, string> = {
  "wiki.build": "Wiki build",
  "wiki.block": "Wiki block",
  "wiki.check": "Check against Published",
  "wiki.find": "Find sources",
  "wiki.restyle": "Wiki restyle",
  "wiki.rewrite": "Use the Published wording",
  "wiki.guide": "Wiki Guided creation",
  ask: "Ask",
  writer: "Guided writer",
  training: "Trainings",
  capture: "Captures",
  consistency: "Consistency check",
  revision: "Proposed revisions",
  insights: "Document insights",
  plant: "Plant",
  "image.generate": "Create an image",
  "image.describe": "Image descriptions",
  "embed.passage": "Indexing passages",
  "embed.query": "Search queries",
  "embed.image": "Indexing images",
  mcp: "MCP tools",
  import: "Importer",
  other: "Other",
}

export function featureLabel(feature: string): string {
  return FEATURE_LABEL[feature] ?? feature
}

/** An estimated amount in USD: small amounts keep four decimals. */
export function usd(n: number): string {
  if (n === 0) return "$0.00"
  if (Math.abs(n) < 0.01) return `$${n.toFixed(4)}`
  if (Math.abs(n) < 100) return `$${n.toFixed(2)}`
  return `$${Math.round(n).toLocaleString("en")}`
}

export function count(n: number): string {
  return n.toLocaleString("en")
}

/** 12,345 tokens as "12.3k", 1,234,567 as "1.23M". */
export function tokens(n: number): string {
  if (n < 1000) return String(n)
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`
  return `${(n / 1_000_000).toFixed(2)}M`
}

export function todayUtc(): string {
  return new Date().toISOString().slice(0, 10)
}
