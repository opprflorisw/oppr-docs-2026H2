import { useState } from "react"
import { Link } from "wouter"
import { useAction, useMutation } from "convex/react"
import { Loader2, ShieldCheck } from "lucide-react"
import { toast } from "sonner"
import { api } from "../../../../convex/_generated/api"
import type { Id } from "../../../../convex/_generated/dataModel"
import {
  MAX_WRITTEN_CHARS,
  type CheckResult,
  type ClaimResult,
  type ClaimVerdict,
  type EditorBlock,
} from "../../../../convex/lib/wikiTypes"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { Pill, STATUS, StatusPill, errorText, plural, pointLines, useRun, type EditCtx } from "./editShared"

const VERDICT: Record<ClaimVerdict, { label: string; tone: "green" | "amber" | "red" | "grey" | "blue" }> = {
  supported: { label: "Supported", tone: "green" },
  supportedByJudge: { label: "Supported by AI judge", tone: "blue" },
  partly: { label: "Partly supported", tone: "amber" },
  differs: { label: "Differs from Published", tone: "red" },
  notCovered: { label: "Not covered", tone: "grey" },
  disputed: { label: "Already disputed", tone: "amber" },
}

/** "Searched 20 documents, 160 passages; 2 documents are not indexed yet." */
function searchLine(stats: CheckResult["stats"]): string {
  const base = `Searched ${plural(stats.documentsSearched, "document")}, ${plural(stats.passagesSearched, "passage")}`
  return stats.documentsNotIndexed > 0
    ? `${base}; ${plural(stats.documentsNotIndexed, "document")} ${stats.documentsNotIndexed === 1 ? "is" : "are"} not indexed yet.`
    : `${base}.`
}

function didNotRun(err: unknown): string {
  const m = errorText(err).replace(/\.\s*$/, "")
  return /^The check did not run/i.test(m) ? `${m}.` : `The check did not run: ${m}. Try again.`
}

/**
 * Write by hand, then Check against Published (spec 3.5). Typing calls
 * nothing; the text is saved and checked only when Check is pressed. The
 * verdicts come back claim by claim, with how each was reached and the
 * verbatim Published passage.
 */
export function WriteAndCheck({ ctx, row }: { ctx: EditCtx; row: EditorBlock }) {
  const [text, setText] = useState(row.writtenText ?? pointLines(row).join(" "))
  // The block's stored check (wikiChecks), so the verdicts survive a reload.
  const result = row.check
  const [checking, setChecking] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const setWrittenText = useMutation(api.wikiBlocks.setWrittenText)
  const checkText = useAction(api.ai.wikiCheck.checkText)
  const save = useRun()

  const trimmed = text.trim()
  const stale = !!result && result.text.trim() !== trimmed
  const textId = `write-${row.blockId}`

  async function check() {
    if (!trimmed) return
    setFailure(null)
    setChecking(true)
    try {
      if (trimmed !== (row.writtenText ?? "")) {
        await setWrittenText({ wikiId: ctx.wikiId, blockId: row.blockId, text: trimmed, personId: ctx.personId })
      }
      await checkText({ wikiId: ctx.wikiId, blockId: row.blockId, text: trimmed, personId: ctx.personId })
    } catch (err) {
      setFailure(didNotRun(err))
    } finally {
      setChecking(false)
    }
  }

  function replaceClaim(claim: string, by: string) {
    setText((t) => (t.includes(claim) ? t.replace(claim, by) : t).replace(/\s{2,}/g, " ").trim())
  }

  return (
    <div className="space-y-3 rounded-md border bg-muted/20 p-3">
      <div className="space-y-1.5">
        <Label htmlFor={textId}>Your text</Label>
        <Textarea
          id={textId}
          value={text}
          rows={4}
          maxLength={MAX_WRITTEN_CHARS}
          onChange={(e) => setText(e.target.value)}
          placeholder="Cool a burn under running water for 20 minutes."
          autoFocus={ctx.writingBlockId === row.blockId}
        />
        <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
          <span>Every claim must be said by a Published passage. Nothing is checked while you type.</span>
          <span>
            {text.length} / {MAX_WRITTEN_CHARS}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => void check()} disabled={!trimmed || checking}>
          {checking ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="mr-1.5 h-3.5 w-3.5" />}
          Check against Published
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={!trimmed || save.pending || checking || trimmed === (row.writtenText ?? "")}
          onClick={() =>
            void save.run(() =>
              setWrittenText({ wikiId: ctx.wikiId, blockId: row.blockId, text: trimmed, personId: ctx.personId }),
            )
          }
        >
          Save without checking
        </Button>
        {ctx.writingBlockId === row.blockId && (
          <Button size="sm" variant="ghost" onClick={() => ctx.setWriting(null)}>
            Close
          </Button>
        )}
        {checking && <span className="text-xs text-muted-foreground">Checking each claim against Published passages.</span>}
      </div>

      {failure && (
        <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {failure} The block stays not checked, and this does not count against your allowance.
        </p>
      )}

      {result && (
        <CheckResultView
          ctx={ctx}
          row={row}
          result={result}
          stale={stale}
          onReplace={replaceClaim}
        />
      )}
    </div>
  )
}

function CheckResultView({
  ctx,
  row,
  result,
  stale,
  onReplace,
}: {
  ctx: EditCtx
  row: EditorBlock
  result: CheckResult
  stale: boolean
  onReplace: (claim: string, by: string) => void
}) {
  const s = STATUS[row.status]
  return (
    <section aria-label="Check result" className="space-y-2" aria-live="polite">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <StatusPill status={row.status} />
        <span className="text-muted-foreground">{s.hint}</span>
      </div>
      {stale && (
        <p className="text-xs text-amber-800 dark:text-amber-200">
          The text changed since this check. Check again before you apply.
        </p>
      )}
      <p className="text-xs text-muted-foreground">{searchLine(result.stats)}</p>
      <ol className={cn("space-y-2", stale && "opacity-70")}>
        {result.claims.map((c, i) => (
          <ClaimRow key={i} ctx={ctx} row={row} result={result} claim={c} index={i} onReplace={onReplace} />
        ))}
      </ol>
    </section>
  )
}

function ClaimRow({
  ctx,
  row,
  result,
  claim,
  index,
  onReplace,
}: {
  ctx: EditCtx
  row: EditorBlock
  result: CheckResult
  claim: ClaimResult
  index: number
  onReplace: (claim: string, by: string) => void
}) {
  const rewrite = useAction(api.ai.wikiBlock.rewriteFromPassage)
  const propose = useAction(api.ai.wikiCheck.proposeRevisionFromCheck)
  const consistency = useAction(api.ai.wikiCheck.runConsistencyOnPair)
  const { run, pending } = useRun()
  const v = VERDICT[claim.verdict]
  const target = claim.passages[0] ?? null
  // Already disputed: the Engineer may decide either side is wrong, so both Documents are offered.
  const proposeTo =
    claim.verdict === "differs" || claim.verdict === "notCovered"
      ? target
        ? [target]
        : []
      : claim.verdict === "disputed"
        ? [...new Map(claim.passages.map((p) => [p.documentId, p])).values()]
        : []

  async function applyPublishedWording() {
    const r = await run(() => rewrite({ checkId: result.checkId, claimIndex: index, personId: ctx.personId }))
    if (r === null) toast.error("No Published wording was found for this claim.")
    else if (r) {
      onReplace(claim.text, r.text)
      toast.success("Replaced with the Published wording. Check again to verify it.")
    }
  }

  async function proposeRevision(documentId: Id<"documents">, code: string) {
    const r = await run(() =>
      propose({ checkId: result.checkId, documentId, claimIndexes: [index], personId: ctx.personId }),
    )
    if (!r) return
    if (!r.proposedRevisionId) toast.error("The Proposed revision was not created.")
    else if (r.created) toast.success(`Proposed revision created for ${code}. The Document's reviewers decide on it.`)
    else toast.success(`Added to the Proposed revision for ${code} from this check.`)
  }

  async function runPair() {
    const r = await run(() => consistency({ checkId: result.checkId, claimIndex: index, personId: ctx.personId }))
    if (!r) return
    if (r.started) toast.success("The Consistency check is running on these two Documents. Any Finding shows under Findings.")
    else toast.error("The Consistency check did not start.")
  }

  const canFix = claim.verdict === "differs" || claim.verdict === "notCovered" || claim.verdict === "partly"
  return (
    <li className={cn("space-y-1.5 rounded-md border bg-background p-2.5", claim.verdict === "differs" && "border-red-300")}>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Pill tone={v.tone}>{v.label}</Pill>
        <span className="text-muted-foreground">{claim.via === "code" ? "Checked by code" : "Found by the AI judge"}</span>
      </div>
      <p className="text-sm">
        {claim.verdict === "partly" && claim.supportedPart ? (
          <PartlyText text={claim.text} supported={claim.supportedPart} />
        ) : (
          claim.text
        )}
      </p>
      {claim.verdict === "supportedByJudge" && (
        <p className="text-xs text-sky-800 dark:text-sky-200">
          Only the AI judge found this; a second Engineer must confirm.
        </p>
      )}
      {claim.verdict === "notCovered" && (
        <p className="text-xs text-muted-foreground">No Published passage says this. {searchLine(result.stats)}</p>
      )}
      {claim.reason && <p className="text-xs text-muted-foreground">{claim.reason}</p>}

      {claim.passages.length > 0 && (
        <div className="space-y-1.5">
          {claim.verdict === "notCovered" && <p className="text-[11px] font-medium text-muted-foreground">Closest passages</p>}
          {claim.passages.map((p) => (
            <blockquote key={p.chunkId} className="border-l-2 pl-2 text-xs">
              <span className="font-mono text-muted-foreground">
                {p.namingCode} v{p.version}
              </span>{" "}
              <span className="text-muted-foreground">{p.title}</span>
              {!p.inScope && (
                <span className="ml-1.5">
                  <Pill tone="grey">Not in Scope</Pill>
                </span>
              )}
              <span className="mt-0.5 block whitespace-pre-line text-foreground/90">"{p.quote}"</span>
            </blockquote>
          ))}
        </div>
      )}

      {claim.findingId && (
        <p className="text-xs">
          This passage is one side of an open Finding.{" "}
          <Link href={`/library/findings?f=${claim.findingId}`} className="font-medium text-primary-strong underline-offset-2 hover:underline">
            Open finding
          </Link>
          {claim.verdict === "disputed" && " Keep the claim only if it states both values."}
        </p>
      )}

      {claim.conflictPair && claim.conflictPair.length === 2 && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span>These two Published passages may disagree.</span>
          <Button size="sm" variant="outline" className="h-7 text-xs" disabled={pending} onClick={() => void runPair()}>
            Run the Consistency check on these two Documents
          </Button>
        </div>
      )}

      {(canFix || claim.verdict === "disputed") && (
        <div className="flex flex-wrap gap-1.5 pt-0.5">
          {claim.verdict === "differs" && target && (
            <Button size="sm" variant="outline" className="h-7 text-xs" disabled={pending} onClick={() => void applyPublishedWording()}>
              Use the Published wording
            </Button>
          )}
          {claim.verdict === "partly" && claim.supportedPart && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() => onReplace(claim.text, claim.supportedPart!)}
            >
              Remove the unsupported part
            </Button>
          )}
          {claim.verdict === "notCovered" && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() => ctx.open({ kind: "find", sectionId: row.sectionId, blockId: row.blockId, query: claim.text })}
            >
              Find sources
            </Button>
          )}
          {proposeTo.map((p) => (
            <Button
              key={p.documentId}
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              disabled={pending}
              onClick={() => void proposeRevision(p.documentId, p.namingCode)}
            >
              Propose a revision to {p.namingCode}
            </Button>
          ))}
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => onReplace(claim.text, "")}>
            Remove claim
          </Button>
          {pending && <Loader2 className="h-3.5 w-3.5 animate-spin self-center text-muted-foreground" aria-label="Working" />}
        </div>
      )}
    </li>
  )
}

/** The supported part highlighted, the rest struck through (spec 3.5 Partly supported). */
function PartlyText({ text, supported }: { text: string; supported: string }) {
  const at = text.indexOf(supported)
  if (at < 0)
    return (
      <>
        <mark className="rounded bg-emerald-100 px-0.5 dark:bg-emerald-500/20">{supported}</mark>{" "}
        <s className="text-muted-foreground">{text}</s>
      </>
    )
  return (
    <>
      {at > 0 && <s className="text-muted-foreground">{text.slice(0, at)}</s>}
      <mark className="rounded bg-emerald-100 px-0.5 dark:bg-emerald-500/20">{supported}</mark>
      {at + supported.length < text.length && <s className="text-muted-foreground">{text.slice(at + supported.length)}</s>}
    </>
  )
}
