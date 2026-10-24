import { useRef, useState } from "react"
import { useMutation, useQuery } from "convex/react"
import { toast } from "sonner"
import { Camera, CheckCircle2, Loader2, MapPin, Navigation, QrCode, StickyNote, TriangleAlert } from "lucide-react"
import { api } from "../../../../convex/_generated/api"
import type { Id } from "../../../../convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import type { AttemptView } from "./AttemptReview"
import { QuestionCard } from "./QuestionCard"
import { errorText } from "./lib"

type ScanResult =
  | { ok: true; stopIndex: number }
  | { ok: false; reason: "wrong_asset" | "finish_here_first" | "round_complete"; expected: { code: string; name: string } | null }

/**
 * A Round on the desktop, stop by stop: Scan the Asset (here: pick it from
 * the plant's list), answer its questions, add the photo or note it asks
 * for. The wrong Asset gets "wrong machine, go to X". The Floor simulator
 * builds the in-phone version on the same API.
 */
export function RoundRunner({ a, personId }: { a: AttemptView; personId: Id<"people"> }) {
  const assets = useQuery(api.assets.list)
  const scan = useMutation(api.attempts.scanAt)
  const [assetId, setAssetId] = useState<string>("")
  const [scanning, setScanning] = useState(false)
  const [result, setResult] = useState<ScanResult | null>(null)
  // The stop on screen. It stays after its last answer, so the feedback can
  // be read, until the person moves on.
  const [viewStop, setViewStop] = useState<number | null>(null)

  const round = a.round!
  const current = round.currentStop
  const here = a.stops[current]
  const atStop = here && here.visited
  const done = current >= a.stops.length
  const showStop = viewStop ?? (atStop ? current : null)

  async function doScan() {
    if (!assetId) return
    setScanning(true)
    try {
      const r = (await scan({ id: a._id, personId, assetId: assetId as Id<"assets"> })) as ScanResult
      setResult(r)
      if (r.ok) {
        setAssetId("")
        setViewStop(r.stopIndex)
      }
    } catch (err) {
      toast.error(errorText(err))
    } finally {
      setScanning(false)
    }
  }

  return (
    <div className="grid gap-4 md:grid-cols-[240px_minmax(0,1fr)]">
      <ol className="space-y-1.5" aria-label="Stops">
        {a.stops.map((s) => {
          const state = s.done ? "done" : s.index === current ? (s.visited ? "here" : "next") : "later"
          return (
            <li
              key={s.index}
              className={cn(
                "flex items-start gap-2 rounded-md border px-2.5 py-2 text-xs",
                state === "here" && "border-primary bg-primary/5",
                state === "next" && "border-dashed border-primary/60",
                state === "later" && "opacity-60",
              )}
            >
              <span
                className={cn(
                  "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold",
                  state === "done" ? "bg-emerald-500 text-white" : "bg-muted text-muted-foreground",
                  (state === "here" || state === "next") && "bg-primary text-primary-foreground",
                )}
              >
                {state === "done" ? <CheckCircle2 className="h-3 w-3" /> : s.index + 1}
              </span>
              <span className="min-w-0">
                <span className="block font-mono font-medium">{s.code}</span>
                <span className="block text-muted-foreground">{s.name}</span>
                {state === "next" && <span className="mt-0.5 block text-[11px] text-primary">Go here next</span>}
                {state === "here" && <span className="mt-0.5 block text-[11px] text-primary">You are here</span>}
              </span>
            </li>
          )
        })}
        <li className="px-1 pt-1 text-[11px] text-muted-foreground">
          {round.wrongScans} wrong {round.wrongScans === 1 ? "scan" : "scans"} so far
        </li>
      </ol>

      <div className="min-w-0 space-y-4">
        {showStop !== null ? (
          <StopWork
            a={a}
            personId={personId}
            stopIndex={showStop}
            onNext={() => {
              setViewStop(null)
              setResult(null)
            }}
          />
        ) : done ? (
          <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-200">
            <p className="flex items-center gap-1.5 font-semibold">
              <CheckCircle2 className="h-4 w-4" /> Every stop is done
            </p>
            <p className="mt-1 text-xs">See your result to finish the Round.</p>
          </div>
        ) : (
          <div className="space-y-3 rounded-lg border p-4">
            <p className="flex items-center gap-1.5 text-sm font-semibold">
              <Navigation className="h-4 w-4 text-primary" />
              Stop {current + 1}: go to {here.code}
            </p>
            {here.hint && <p className="text-sm text-muted-foreground">{here.hint}</p>}
            <div className="flex flex-wrap items-center gap-2">
              <Select value={assetId} onValueChange={(v) => { setAssetId(v); setResult(null) }}>
                <SelectTrigger className="h-8 w-[280px] text-xs" aria-label="Asset you are at">
                  <SelectValue placeholder="Which Asset are you at?" />
                </SelectTrigger>
                <SelectContent>
                  {(assets ?? []).map((x) => (
                    <SelectItem key={x._id} value={x._id} className="text-xs">
                      <span className="font-mono">{x.code}</span> {x.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button size="sm" className="gap-1.5" disabled={!assetId || scanning} onClick={() => void doScan()}>
                {scanning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <QrCode className="h-3.5 w-3.5" />}
                Scan its QR code
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              On the floor you scan the QR code on the machine. Here you pick the Asset you are standing at.
            </p>
            {result && "expected" in result && result.expected && (
              <p
                role="alert"
                className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100"
              >
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                {result.reason === "finish_here_first"
                  ? `Finish this stop first: ${result.expected.code} ${result.expected.name}.`
                  : `You're at the wrong machine. Go to ${result.expected.code} ${result.expected.name}.`}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function StopWork({
  a,
  personId,
  stopIndex,
  onNext,
}: {
  a: AttemptView
  personId: Id<"people">
  stopIndex: number
  onNext: () => void
}) {
  const stop = a.stops[stopIndex]
  const questions = a.questions.filter((q) => q.stopIndex === stopIndex)
  const allAnswered = questions.every((q) => q.answerIndex !== null)
  const needsEvidence = stop.evidence !== "none" && stop.evidenceGiven.length === 0
  const next = a.stops[stopIndex + 1]
  return (
    <div className="space-y-3">
      <p className="flex items-center gap-1.5 text-sm font-semibold">
        <MapPin className="h-4 w-4 text-primary" />
        Stop {stopIndex + 1}: {stop.code} {stop.name}
      </p>
      {questions.map((q) => (
        <QuestionCard
          key={q.id}
          attemptId={a._id}
          personId={personId}
          question={q}
          number={a.questions.findIndex((x) => x.id === q.id) + 1}
          total={a.questions.length}
          canAnswer
        />
      ))}
      {stop.evidence !== "none" && (allAnswered || questions.length === 0) && (
        needsEvidence ? (
          <EvidenceForm a={a} personId={personId} stopIndex={stopIndex} kind={stop.evidence} />
        ) : (
          <p className="flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 className="h-3.5 w-3.5" /> {stop.evidence === "photo" ? "Photo" : "Note"} added.
          </p>
        )
      )}
      {stop.done && next && (
        <Button size="sm" className="gap-1.5" onClick={onNext}>
          <Navigation className="h-3.5 w-3.5" /> Next stop: {next.code}
        </Button>
      )}
      {stop.done && !next && (
        <Button size="sm" variant="outline" className="gap-1.5" onClick={onNext}>
          <CheckCircle2 className="h-3.5 w-3.5" /> All stops done
        </Button>
      )}
    </div>
  )
}

function EvidenceForm({
  a,
  personId,
  stopIndex,
  kind,
}: {
  a: AttemptView
  personId: Id<"people">
  stopIndex: number
  kind: "photo" | "note"
}) {
  const addEvidence = useMutation(api.attempts.addEvidence)
  const uploadUrl = useMutation(api.files.generateUploadUrl)
  const [text, setText] = useState("")
  const [saving, setSaving] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function sendNote() {
    setSaving(true)
    try {
      await addEvidence({ id: a._id, personId, stopIndex, kind: "note", text })
    } catch (err) {
      toast.error(errorText(err))
    } finally {
      setSaving(false)
    }
  }

  async function sendPhoto(file: File) {
    setSaving(true)
    try {
      const url = await uploadUrl()
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": file.type }, body: file })
      if (!res.ok) throw new Error("The photo could not be uploaded. Try again.")
      const { storageId } = (await res.json()) as { storageId: Id<"_storage"> }
      await addEvidence({ id: a._id, personId, stopIndex, kind: "photo", storageId })
    } catch (err) {
      toast.error(errorText(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-4">
      <p className="flex items-center gap-1.5 text-sm font-semibold">
        {kind === "photo" ? <Camera className="h-4 w-4 text-primary" /> : <StickyNote className="h-4 w-4 text-primary" />}
        {kind === "photo" ? "Take a photo here" : "Add a short note"}
      </p>
      {kind === "note" ? (
        <>
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={2}
            placeholder="What do you see? For example the reading on the gauge."
            className="resize-none bg-background text-sm"
          />
          <Button size="sm" disabled={saving || !text.trim()} onClick={() => void sendNote()}>
            {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Add note
          </Button>
        </>
      ) : (
        <>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void sendPhoto(f)
              e.target.value = ""
            }}
          />
          <Button size="sm" className="gap-1.5" disabled={saving} onClick={() => fileRef.current?.click()}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
            Choose a photo
          </Button>
        </>
      )}
    </div>
  )
}
