import { useMemo, useState } from "react"
import { Link } from "wouter"
import { useAction, useMutation, useQuery } from "convex/react"
import { toast } from "sonner"
import { Check, FileText, Loader2, Sparkles, X } from "lucide-react"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { useCheckIn } from "@/lib/checkIn"
import { errorText } from "@/components/captures/captureUi"
import { KIND, type PlantKind } from "./plantModel"

/** Same cap as convex/ai/plantPropose.ts: past this many waiting, check those first. */
const MAX_PENDING_PROPOSALS = 40

/** Runs "Propose from documents". Returns a starter the header can call. */
export function usePropose() {
  const { person } = useCheckIn()
  const propose = useAction(api.ai.plantPropose.propose)
  const [busy, setBusy] = useState(false)
  async function run(onDone?: () => void, waiting = 0) {
    if (!person || busy) return
    if (waiting >= MAX_PENDING_PROPOSALS) {
      toast.info(`${waiting} proposals are still waiting. Accept or reject those first.`)
      onDone?.()
      return
    }
    setBusy(true)
    const id = toast.loading("Reading Published documents. This takes about a minute.")
    try {
      const r = await propose({ personId: person._id })
      toast.success(
        r.added === 0
          ? `Read ${r.read} documents. Nothing new to propose.`
          : `Read ${r.read} documents. ${r.added} proposal${r.added === 1 ? "" : "s"} to check.`,
        { id },
      )
      if (r.added > 0) onDone?.()
    } catch (e) {
      toast.error(errorText(e, "No proposals this time. Try again later."), { id })
    } finally {
      setBusy(false)
    }
  }
  return { run, busy }
}

/** The proposals waiting for an Engineer. Accepting adds the item; nothing is added without it. */
export function PlantProposalsSheet({
  open,
  onOpenChange,
  editor,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  editor: boolean
}) {
  const { person } = useCheckIn()
  const rows = useQuery(api.plant.plant.proposals, open ? {} : "skip")
  const accept = useMutation(api.plant.plant.acceptProposal)
  const reject = useMutation(api.plant.plant.rejectProposal)
  const decideAll = useMutation(api.plant.plant.decideAllProposals)
  const [pending, setPending] = useState<string | null>(null)

  const groups = useMemo(() => {
    const m = new Map<PlantKind, NonNullable<typeof rows>>()
    for (const p of rows ?? []) m.set(p.kind, [...(m.get(p.kind) ?? []), p])
    return (Object.keys(KIND) as PlantKind[]).filter((k) => m.has(k)).map((k) => ({ kind: k, rows: m.get(k)! }))
  }, [rows])

  async function act(id: Id<"plantProposals">, ok: boolean) {
    if (!person) return
    setPending(id)
    try {
      if (ok) await accept({ personId: person._id, id })
      else await reject({ personId: person._id, id })
    } catch (e) {
      toast.error(errorText(e, "That did not work."))
    } finally {
      setPending(null)
    }
  }

  async function actAll(decision: "accept" | "reject", kind?: PlantKind) {
    if (!person) return
    const n = kind ? (groups.find((g) => g.kind === kind)?.rows.length ?? 0) : (rows?.length ?? 0)
    const what = kind ? KIND[kind].plural.toLowerCase() : "proposals"
    if (decision === "accept" && !window.confirm(`Add all ${n} ${what} to the Plant? Check them first if you are not sure.`))
      return
    setPending(`all:${kind ?? ""}`)
    try {
      const done = await decideAll({ personId: person._id, decision, kind })
      toast.success(`${decision === "accept" ? "Accepted" : "Rejected"} ${done} ${done === 1 ? "proposal" : "proposals"}.`)
    } catch (e) {
      toast.error(errorText(e, "That did not work."))
    } finally {
      setPending(null)
    }
  }

  const busyAll = pending?.startsWith("all:") ?? false

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader className="text-left">
          <SheetTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" aria-hidden /> Proposed from documents
            {rows && rows.length > 0 && (
              <Badge variant="secondary" className="font-normal tabular-nums">
                {rows.length}
              </Badge>
            )}
          </SheetTitle>
          <SheetDescription>
            The AI read the Published documents and proposes what the Plant is missing. Accept what is right, reject the
            rest. Nothing is added until an Engineer accepts it.
          </SheetDescription>
        </SheetHeader>
        {editor && rows && rows.length > 1 && (
          <div className="mt-3 flex justify-end">
            <Button size="sm" variant="ghost" disabled={busyAll} onClick={() => void actAll("reject")}>
              <X className="h-4 w-4" /> Reject all {rows.length}
            </Button>
          </div>
        )}
        <div className="mt-2 space-y-5">
          {rows === undefined && <p className="text-sm text-muted-foreground">Loading...</p>}
          {rows?.length === 0 && (
            <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              Nothing waiting. Choose Propose from documents in the menu to get new proposals.
            </p>
          )}
          {groups.map((g) => (
            <section key={g.kind} className="space-y-3">
              <div className="flex items-center gap-2 border-b pb-1.5">
                <h3 className="flex-1 text-sm font-semibold">
                  {g.kind === "term" ? "Glossary terms" : KIND[g.kind].plural}{" "}
                  <span className="font-normal text-muted-foreground tabular-nums">{g.rows.length}</span>
                </h3>
                {editor && g.rows.length > 1 && (
                  <>
                    <Button size="sm" variant="ghost" className="h-7" disabled={busyAll} onClick={() => void actAll("accept", g.kind)}>
                      <Check className="h-3.5 w-3.5" /> Accept all
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7" disabled={busyAll} onClick={() => void actAll("reject", g.kind)}>
                      <X className="h-3.5 w-3.5" /> Reject all
                    </Button>
                  </>
                )}
              </div>
              {g.rows.map((p) => (
                <article key={p._id} className="space-y-2 rounded-lg border bg-card p-4">
                  <div className="flex items-start gap-2">
                    <h4 className="flex-1 font-medium">{p.name}</h4>
                    {p.areaCode && (
                      <Badge variant="outline" className="font-mono text-[11px]">
                        {p.areaCode}
                      </Badge>
                    )}
                  </div>
                  {p.description && <p className="text-sm text-muted-foreground">{p.description}</p>}
                  {p.synonyms.length > 0 && <p className="text-xs text-muted-foreground">Also: {p.synonyms.join(", ")}</p>}
                  <p className="text-xs italic text-muted-foreground">{p.reason}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {p.sources.map((s) => (
                      <Link
                        key={s.id}
                        href={`/docs/${s.id}`}
                        className="inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-xs hover:bg-muted"
                        title={s.title}
                      >
                        <FileText className="h-3 w-3" aria-hidden /> {s.code}
                      </Link>
                    ))}
                  </div>
                  {p.existsAs && (
                    <p className="text-xs text-muted-foreground">Already in the Plant. Accepting adds its words and sources.</p>
                  )}
                  {editor && (
                    <div className="flex gap-2 pt-1">
                      <Button size="sm" disabled={pending === p._id || busyAll} onClick={() => void act(p._id, true)}>
                        {pending === p._id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                        Accept
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pending === p._id || busyAll}
                        onClick={() => void act(p._id, false)}
                      >
                        <X className="h-4 w-4" /> Reject
                      </Button>
                    </div>
                  )}
                </article>
              ))}
            </section>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  )
}
