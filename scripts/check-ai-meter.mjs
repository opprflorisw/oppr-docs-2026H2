// Dev check M2 (spec 6.7): every AI model call goes through the meter.
//
//   node scripts/check-ai-meter.mjs
//
// 1. Raw model access (the Anthropic SDK, the Gemini SDK, fetch to the
//    Gemini or Anthropic API) appears only in the two metered gateways,
//    convex/ai/llm.ts and convex/ai/gemini.ts, and never in the browser code.
// 2. Every claudeJson(...) call passes `meter`, so the call lands in aiUsage.
//    (The Gemini gateway functions take the MeterSpec as a required first
//    argument, so TypeScript already enforces that part.)
//
// Exits 1 and lists file:line for each violation. Comment lines are skipped.
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative, sep } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = join(fileURLToPath(import.meta.url), "..", "..")
const GATEWAYS = new Set(["convex/ai/llm.ts", "convex/ai/gemini.ts"])
const RAW = [
  /generativelanguage\.googleapis\.com/,
  /api\.anthropic\.com/,
  /new\s+Anthropic\s*\(/,
  /new\s+GoogleGenerativeAI\s*\(/,
  /\.getGenerativeModel\s*\(/,
  /from\s+["']@anthropic-ai\/sdk["']/,
  /from\s+["']@google\/generative-ai["']/,
]
// Type-only imports of the SDKs are fine (schema types such as SchemaType are values, see below).
const ALLOWED_IMPORT = /import\s+(type\s+)?\{[^}]*\}\s+from\s+["']@google\/generative-ai["']/

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "_generated" || name.startsWith(".")) continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(ts|tsx|mjs|js)$/.test(name) && !name.endsWith(".d.ts")) out.push(p)
  }
  return out
}

const isComment = (line) => /^\s*(\/\/|\/\*|\*)/.test(line)

/** The argument text of a call that starts at `open` (the index of "("). */
function callArgs(src, open) {
  let depth = 0
  for (let i = open; i < src.length; i++) {
    const c = src[i]
    if (c === "(") depth++
    else if (c === ")" && --depth === 0) return src.slice(open + 1, i)
  }
  return src.slice(open + 1)
}

const problems = []
const files = [...walk(join(ROOT, "convex")), ...walk(join(ROOT, "src"))]
for (const file of files) {
  const rel = relative(ROOT, file).split(sep).join("/")
  const src = readFileSync(file, "utf8")
  const lines = src.split(/\r?\n/)

  if (!GATEWAYS.has(rel)) {
    lines.forEach((line, i) => {
      if (isComment(line)) return
      for (const re of RAW) {
        if (!re.test(line)) continue
        // A named import of schema helpers (SchemaType, ResponseSchema) from the Gemini SDK makes no call.
        if (re.source.includes("generative-ai") && ALLOWED_IMPORT.test(line) && !/GoogleGenerativeAI/.test(line)) continue
        problems.push(`${rel}:${i + 1}  raw model call outside the metered gateways: ${line.trim().slice(0, 120)}`)
      }
    })
  }

  if (rel === "convex/ai/llm.ts") continue
  const re = /\bclaudeJson\s*\(/g
  let m
  while ((m = re.exec(src))) {
    const before = src.slice(Math.max(0, m.index - 20), m.index)
    if (/function\s+$/.test(before)) continue
    const line = src.slice(0, m.index).split(/\r?\n/).length
    if (isComment(lines[line - 1])) continue
    if (!/\bmeter\b/.test(callArgs(src, m.index + m[0].length - 1)))
      problems.push(`${rel}:${line}  claudeJson(...) without meter: the call is not in the AI usage tracker`)
  }
}

if (problems.length) {
  console.log(`AI meter check: ${problems.length} problem(s)`)
  for (const p of problems) console.log(`  ${p}`)
  process.exit(1)
}
console.log(`AI meter check: ok (${files.length} files; model calls only in ${[...GATEWAYS].join(" and ")})`)
