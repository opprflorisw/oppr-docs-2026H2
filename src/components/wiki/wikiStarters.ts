/** Three starter questions made from the Wiki's section headings (Ask this Wiki). */
export function starterQuestions(headings: string[]): string[] {
  const lower = (s: string) => (/^[A-Z][a-z]/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s)
  return headings
    .filter((h) => h.length > 3)
    .slice(0, 3)
    .map((h) => `What should I know about ${lower(h).replace(/[.:]+$/, "")}?`)
}
