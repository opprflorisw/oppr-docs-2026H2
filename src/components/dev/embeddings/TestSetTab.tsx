// Test set: a small, editable list of Dutch and English plant questions with
// the document(s) that should answer them. Runs both models and scores them
// with hit@1, hit@5 and MRR at document level. The list lives in this
// browser (localStorage); nothing is stored on the server.
import { useMemo, useState } from "react"
import { useAction } from "convex/react"
import { Loader2, Play, Plus, RotateCcw, Trash2 } from "lucide-react"
import { api } from "../../../../convex/_generated/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"
import { corpus, dot, errorText, normalize, textEngine, TEXT_QUERY, useStore } from "./engine"
import { TextModelSteps } from "./CompareTab"
import { Bar, ErrorLine, Step } from "./LabBits"

interface Question {
  id: string
  q: string
  /** Naming codes of the documents that answer it; any one counts. */
  expect: string[]
}

const DEFAULTS: Omit<Question, "id">[] = [
  { q: "Hoe vergrendel ik lijn 2 voordat ik ga schoonmaken?", expect: ["EXT-HSE-SOP-0001"] },
  { q: "lockout tagout before cleaning the puller", expect: ["EXT-HSE-SOP-0001"] },
  { q: "Wat doe ik bij een brandwond door hete smelt?", expect: ["EXT-HSE-SOP-0002"] },
  { q: "How do I change the screen pack on the extruder?", expect: ["EXT-MNT-SOP-0001"] },
  { q: "Kleurwissel op extrusielijn 2", expect: ["EXT-OPS-SOP-0001"] },
  { q: "How do I start line 2 from cold?", expect: ["EXT-OPS-SOP-0002"] },
  { q: "Lijn 2 uitzetten aan het eind van de dienst", expect: ["EXT-OPS-SOP-0003"] },
  { q: "zaagblad controleren op de zaag", expect: ["EXT-OPS-WI-0001"] },
  { q: "How do I set up the vacuum calibration tank?", expect: ["EXT-OPS-WI-0002"] },
  { q: "Hoe stel ik de haspel in?", expect: ["EXT-OPS-WI-0003"] },
  { q: "Welke PBM bij stof van masterbatch?", expect: ["MIX-HSE-LMRA-0001"] },
  { q: "Mixer MXR-101 schoonmaken", expect: ["MIX-OPS-SOP-0001"] },
  { q: "How long do I dry PE granulate?", expect: ["MIX-OPS-SOP-0002"] },
  { q: "Wanddikte en buitendiameter meten", expect: ["QCL-QA-SOP-0001"] },
  { q: "What do I do with pipe that is out of tolerance?", expect: ["QCL-QA-WI-0001"] },
  { q: "Working near the hot die head, what are the risks?", expect: ["EXT-HSE-LMRA-0001"] },
]

const KEY = "embeddingLab.testSet.v1"

function withIds(list: Omit<Question, "id">[]): Question[] {
  return list.map((x, i) => ({ ...x, id: `${Date.now().toString(36)}-${i}` }))
}

function readSet(): Question[] {
  try {
    const raw = window.localStorage.getItem(KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Question[]
      if (Array.isArray(parsed)) return parsed.filter((x) => typeof x.q === "string" && Array.isArray(x.expect))
    }
  } catch {
    // Unreadable or blocked storage: start from the defaults.
  }
  return withIds(DEFAULTS)
}

function writeSet(list: Question[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list))
  } catch {
    // Not remembered; the run still works.
  }
}

/** 1-based rank of the first expected code, or null when not in the top 10. */
function rankOf(codes: string[], expect: string[]): number | null {
  const i = codes.slice(0, 10).findIndex((c) => expect.includes(c))
  return i < 0 ? null : i + 1
}

function score(ranks: (number | null)[]) {
  const n = Math.max(1, ranks.length)
  return {
    hit1: ranks.filter((r) => r === 1).length / n,
    hit5: ranks.filter((r) => r !== null && r <= 5).length / n,
    mrr: ranks.reduce<number>((s, r) => s + (r ? 1 / r : 0), 0) / n,
  }
}

interface RowResult {
  gemma: { rank: number | null; top: string | null }
  gemini: { rank: number | null; top: string | null }
}

export function TestSetTab() {
  const gemini = useAction(api.lab.embeddings.geminiSearch)
  const c = useStore(corpus)
  const [list, setList] = useState<Question[]>(readSet)
  const [sampleOnly, setSampleOnly] = useState(true)
  const [running, setRunning] = useState<{ done: number; total: number } | null>(null)
  const [results, setResults] = useState<Record<string, RowResult>>({})
  const [error, setError] = useState<string | null>(null)

  const update = (next: Question[]) => {
    setList(next)
    writeSet(next)
  }

  const sampled = useMemo(() => new Set((c.passages ?? []).map((p) => p.namingCode)), [c.passages])
  const missing = useMemo(
    () => [...new Set(list.flatMap((x) => x.expect))].filter((code) => c.passages && !sampled.has(code)),
    [list, sampled, c.passages],
  )

  async function run() {
    const passages = c.passages
    const vectors = c.vectors
    if (!passages || !vectors || !textEngine.ready) return
    const todo = list.filter((x) => x.q.trim() && x.expect.length)
    setError(null)
    setResults({})
    setRunning({ done: 0, total: todo.length })
    const inSample = new Set(passages.map((p) => String(p.chunkId)))
    const docVectors = vectors.map((v) => normalize(v, 768))
    try {
      for (const [i, item] of todo.entries()) {
        const [qv] = await textEngine.embedTexts([TEXT_QUERY(item.q.trim())])
        const q = normalize(qv, 768)
        // Document level: a document scores its best passage.
        const best = new Map<string, number>()
        passages.forEach((p, j) => {
          const s = dot(q, docVectors[j])
          if (s > (best.get(p.namingCode) ?? -2)) best.set(p.namingCode, s)
        })
        const gemmaCodes = [...best.entries()].sort((a, b) => b[1] - a[1]).map(([code]) => code)
        const g = await gemini({ query: item.q.trim() })
        const geminiCodes: string[] = []
        for (const h of g.hits) {
          if (sampleOnly && !inSample.has(String(h.chunkId))) continue
          if (!geminiCodes.includes(h.namingCode)) geminiCodes.push(h.namingCode)
        }
        setResults((r) => ({
          ...r,
          [item.id]: {
            gemma: { rank: rankOf(gemmaCodes, item.expect), top: gemmaCodes[0] ?? null },
            gemini: { rank: rankOf(geminiCodes, item.expect), top: geminiCodes[0] ?? null },
          },
        }))
        setRunning({ done: i + 1, total: todo.length })
      }
    } catch (err) {
      setError(errorText(err))
    } finally {
      setRunning(null)
    }
  }

  const scored = useMemo(() => {
    const rows = list.map((x) => results[x.id]).filter(Boolean)
    if (rows.length === 0) return null
    return {
      n: rows.length,
      gemma: score(rows.map((r) => r.gemma.rank)),
      gemini: score(rows.map((r) => r.gemini.rank)),
    }
  }, [list, results])

  const pct = (x: number) => `${Math.round(x * 100)}%`

  return (
    <div className="space-y-5 rounded-lg border bg-card p-5 text-sm">
      <TextModelSteps compact />

      <Step n={3} title="Questions and the documents that should answer them">
        <p className="text-xs text-muted-foreground">
          Saved in this browser only. A question counts as found when any of its document codes comes up; documents
          rank by their best passage.
        </p>
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow className="text-xs">
                <TableHead className="w-[44%]">Question</TableHead>
                <TableHead className="w-[22%]">Expected documents</TableHead>
                <TableHead>EmbeddingGemma</TableHead>
                <TableHead>Gemini</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.map((x, i) => {
                const r = results[x.id]
                return (
                  <TableRow key={x.id} className="align-top text-xs">
                    <TableCell className="py-1.5">
                      <Input
                        value={x.q}
                        aria-label={`Question ${i + 1}`}
                        className="h-8 text-xs"
                        onChange={(e) => update(list.map((y) => (y.id === x.id ? { ...y, q: e.target.value } : y)))}
                      />
                    </TableCell>
                    <TableCell className="py-1.5">
                      <Input
                        value={x.expect.join(", ")}
                        aria-label={`Expected documents for question ${i + 1}`}
                        className="h-8 font-mono text-[11px]"
                        onChange={(e) =>
                          update(
                            list.map((y) =>
                              y.id === x.id
                                ? { ...y, expect: e.target.value.split(/[,\s]+/).map((s) => s.trim().toUpperCase()).filter(Boolean) }
                                : y,
                            ),
                          )
                        }
                      />
                    </TableCell>
                    <TableCell className="py-1.5">{r && <RankCell {...r.gemma} />}</TableCell>
                    <TableCell className="py-1.5">{r && <RankCell {...r.gemini} />}</TableCell>
                    <TableCell className="py-1.5">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        aria-label={`Remove question ${i + 1}`}
                        onClick={() => update(list.filter((y) => y.id !== x.id))}
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden />
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => update([...list, ...withIds([{ q: "", expect: [] }])])}>
            <Plus aria-hidden /> Add a question
          </Button>
          <Button size="sm" variant="ghost" onClick={() => update(withIds(DEFAULTS))}>
            <RotateCcw aria-hidden /> Back to the default set
          </Button>
        </div>
        {missing.length > 0 && (
          <p className="text-xs text-amber-700 dark:text-amber-300">
            Not in the passage sample, so EmbeddingGemma cannot find them: {missing.join(", ")}.
          </p>
        )}
      </Step>

      <Step n={4} title="Run both models">
        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm" disabled={!c.vectors || running !== null} onClick={() => void run()}>
            {running ? <Loader2 className="animate-spin" aria-hidden /> : <Play aria-hidden />}
            Run {list.filter((x) => x.q.trim() && x.expect.length).length} questions
          </Button>
          <label className="flex items-center gap-1.5 text-xs">
            <input type="checkbox" checked={sampleOnly} onChange={(e) => setSampleOnly(e.target.checked)} />
            <span>Gemini: only passages in the sample (fair comparison)</span>
          </label>
        </div>
        {!c.vectors && <p className="text-xs text-muted-foreground">Load a model and embed the passages first.</p>}
        {running && (
          <div className="space-y-1">
            <Bar value={running.done / Math.max(1, running.total)} tone="sky" />
            <p className="text-xs text-muted-foreground">
              {running.done} of {running.total} questions
            </p>
          </div>
        )}
        {error && <ErrorLine text={error} />}
        {scored && (
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow className="text-xs">
                  <TableHead>Model ({scored.n} questions)</TableHead>
                  <TableHead className="text-right">hit@1</TableHead>
                  <TableHead className="text-right">hit@5</TableHead>
                  <TableHead className="text-right">MRR</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[
                  { name: c.embeddedWith ?? "EmbeddingGemma", s: scored.gemma },
                  { name: "gemini-embedding-2 (production)", s: scored.gemini },
                ].map((m) => (
                  <TableRow key={m.name} className="text-xs">
                    <TableCell className="font-medium">{m.name}</TableCell>
                    <TableCell className="text-right tabular-nums">{pct(m.s.hit1)}</TableCell>
                    <TableCell className="text-right tabular-nums">{pct(m.s.hit5)}</TableCell>
                    <TableCell className="text-right tabular-nums">{m.s.mrr.toFixed(3)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          hit@1: the right document comes first. hit@5: it is in the top five. MRR: the average of 1 divided by its
          rank (0 when not in the top 10). A small set like this shows direction, not proof.
        </p>
      </Step>
    </div>
  )
}

function RankCell({ rank, top }: { rank: number | null; top: string | null }) {
  return (
    <div className="space-y-0.5">
      <span
        className={cn(
          "inline-block rounded px-1.5 py-0.5 font-medium tabular-nums",
          rank === 1
            ? "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300"
            : rank !== null && rank <= 5
              ? "bg-amber-500/15 text-amber-800 dark:text-amber-300"
              : "bg-rose-500/10 text-rose-800 dark:text-rose-300",
        )}
      >
        {rank === null ? "not in top 10" : `rank ${rank}`}
      </span>
      {top && <div className="font-mono text-[10px] text-muted-foreground">first: {top}</div>}
    </div>
  )
}
