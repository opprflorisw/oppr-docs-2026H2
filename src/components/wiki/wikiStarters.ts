// Starter questions for Ask this Wiki, made from the Wiki's section headings.
// Headings are written as titles ("Before you start at the die head",
// "Never do this on line 2"), so each kind gets its own phrasing.

const SITUATION = /^(before|after|when|while|during|if|once|until)\b/i
const INSTRUCTION = /^(never|always|do|don't|stop|check|keep|avoid|wear|make|use)\b/i

function lowerFirst(s: string) {
  return /^[A-Z][a-z]/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s
}

/** "you start" reads as the person asking: "I start". */
function asAsker(s: string) {
  return s.replace(/\byou(r)?\b/gi, (_m, r) => (r ? "my" : "I"))
}

/** A question from a heading, and how natural it reads (lower is better). */
function questionFrom(heading: string): { q: string; rank: number } {
  const h = heading.trim().replace(/[.:?!]+$/, "")
  const how = h.match(/^how to\s+(.+)$/i)
  if (how) return { q: `How do I ${asAsker(how[1])}?`, rank: 0 }
  if (SITUATION.test(h)) return { q: `What should I do ${asAsker(lowerFirst(h))}?`, rank: 0 }
  if (INSTRUCTION.test(h)) return { q: `What does "${h}" cover?`, rank: 2 }
  return { q: `What should I know about ${asAsker(lowerFirst(h))}?`, rank: 1 }
}

/** Three starter questions, the most natural ones first, in page order within a kind. */
export function starterQuestions(headings: string[]): string[] {
  return headings
    .filter((h) => h.trim().length > 3)
    .map((h, i) => ({ ...questionFrom(h), i }))
    .sort((a, b) => a.rank - b.rank || a.i - b.i)
    .slice(0, 3)
    .map((x) => x.q)
}
