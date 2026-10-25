// Starter questions for Ask about this Wiki, made from the Wiki's section
// headings. Headings are written as titles ("Main hazards on line 2", "Before
// you start at the die head", "Never do this on line 2"), so each type of
// heading gets its own phrasing.

const QUESTION = /^(who|what|when|where|which|why|how)\b/i
const SITUATION = /^(before|after|when|while|during|if|once|until)\b/i
const INSTRUCTION = /^(never|always|do|don't|stop|keep|avoid|wear|make|use)\b/i
/** Headings that name a set of things: "Main hazards", "Critical process limits". */
const SET = /\b(hazards|risks|limits|settings|values|rules|responsibilities|roles|contacts|checks|steps|tools|materials)\b/i
/** Headings about a recurring check: "Measuring wall thickness", "Daily checks". */
const CHECKING = /\b(measur|inspect|calibrat|sampl|test)\w*/i

const CHECK_VERB: Record<string, string> = { measur: "measure", inspect: "inspect", calibrat: "calibrate", sampl: "take a sample", test: "test" }

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
  if (QUESTION.test(h)) return { q: `${asAsker(h)}?`, rank: 0 }
  const how = h.match(/^how to\s+(.+)$/i)
  if (how) return { q: `How do I ${asAsker(how[1])}?`, rank: 0 }
  if (SITUATION.test(h)) return { q: `What should I do ${asAsker(lowerFirst(h))}?`, rank: 0 }
  if (SET.test(h) && !INSTRUCTION.test(h)) return { q: `What are the ${asAsker(lowerFirst(h))}?`, rank: 0 }
  const check = h.match(CHECKING)
  if (check) {
    const stem = Object.keys(CHECK_VERB).find((k) => check[0].toLowerCase().startsWith(k))
    if (stem) return { q: `When should I ${CHECK_VERB[stem]}?`, rank: 1 }
  }
  if (INSTRUCTION.test(h)) return { q: `What does "${h}" cover?`, rank: 2 }
  return { q: `What should I know about ${asAsker(lowerFirst(h))}?`, rank: 1 }
}

/** Three starter questions, the most natural ones first, in page order within a rank. */
export function starterQuestions(headings: string[]): string[] {
  const seen = new Set<string>()
  return headings
    .filter((h) => h.trim().length > 3)
    .map((h, i) => ({ ...questionFrom(h), i }))
    .sort((a, b) => a.rank - b.rank || a.i - b.i)
    .filter((x) => !seen.has(x.q) && seen.add(x.q))
    .slice(0, 3)
    .map((x) => x.q)
}
