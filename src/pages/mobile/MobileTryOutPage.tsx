// A try-out on the phone: /m/tryout/:requestId (TWI step 3). The trainer
// stands next to the trainee at the line, watches them do the job, and marks
// every item of the checklist OK or Coach. A note, an optional photo and the
// Asset go with it. "Sign as <name>" signs as the checked-in person. All OK
// raises the linked Skills to level 2 (Can do it); any Coach keeps the level
// and the trainee sees what to practise.

import { useRef, useState } from "react"
import { useLocation, useRoute } from "wouter"
import { useMutation, useQuery } from "convex/react"
import { Camera, CheckCircle2, ImageIcon, Loader2, MapPin, PenLine, UserRound, Wrench, XCircle } from "lucide-react"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { useMobileShell } from "@/components/mobile/MobileShell"
import { looksLikeConvexId } from "@/components/mobile/use-mobile-prefs"
import { ProofHeader, StickyBar } from "@/components/mobile/round/ProofChrome"
import { marksToItems, TryOutChecklist, type TryOutMarks } from "@/components/learn/training/TryOutChecklist"
import { errorText, fmtDate, LEVEL_WORDS, uploadBlob } from "@/components/learn/training/lib"
import { useCheckIn } from "@/lib/checkIn"

export function MobileTryOutPage() {
  const [, params] = useRoute<{ requestId: string }>("/m/tryout/:requestId")
  const [, navigate] = useLocation()
  const id = params?.requestId ?? ""
  const valid = looksLikeConvexId(id)
  const r = useQuery(api.tryOuts.get, valid ? { requestId: id as Id<"tryOutRequests"> } : "skip")
  const { person } = useCheckIn()

  let body: React.ReactNode
  if (!valid || r === null) {
    body = (
      <Centered icon={<XCircle className="h-6 w-6" />} title="This try-out is not available">
        It may have been cancelled. Open your to-do list on Home.
      </Centered>
    )
  } else if (r === undefined) {
    body = (
      <div className="space-y-3 p-3">
        <Skeleton className="h-20 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    )
  } else if (r.status !== "open") {
    body = <Signed r={r} />
  } else if (!person) {
    body = <CheckInFirst />
  } else if (person._id === r.personId) {
    body = (
      <Centered icon={<UserRound className="h-6 w-6" />} title="This is your own try-out">
        {r.trainerName ? `${r.trainerName} watches you do the job and signs it.` : "A trainer watches you do the job and signs it."}{" "}
        Hand the phone to your trainer, or let them open it on theirs.
      </Centered>
    )
  } else {
    body = <Sign r={r} personId={person._id} personName={person.name} />
  }

  return (
    <div className="flex min-h-full flex-col">
      <ProofHeader
        title={r ? `Try-out: ${r.personName}` : "Try-out"}
        subtitle={r ? `${r.trainingCode} · ${r.trainingTitle}` : undefined}
        onClose={() => navigate("/m")}
      />
      {body}
    </div>
  )
}

type Request = NonNullable<ReturnType<typeof useTryOut>>
function useTryOut(id: Id<"tryOutRequests">) {
  return useQuery(api.tryOuts.get, { requestId: id })
}

function Sign({ r, personId, personName }: { r: Request; personId: Id<"people">; personName: string }) {
  const sign = useMutation(api.tryOuts.sign)
  const uploadUrl = useMutation(api.files.generateUploadUrl)
  const [marks, setMarks] = useState<TryOutMarks>({})
  const [note, setNote] = useState("")
  const [photo, setPhoto] = useState<{ storageId: Id<"_storage">; url: string } | null>(null)
  const [uploading, setUploading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const items = r.checklist
  const marked = items.filter((l) => marks[l]).length
  const anyCoach = items.some((l) => marks[l]?.result === "coach")
  const coachNoted = !anyCoach || !!note.trim() || items.some((l) => marks[l]?.result === "coach" && marks[l]?.note?.trim())
  const ready = marked === items.length && items.length > 0 && coachNoted
  const firstName = r.personName.split(" ")[0]

  async function addPhoto(file: File) {
    setUploading(true)
    try {
      const storageId = await uploadBlob(() => uploadUrl(), file)
      setPhoto({ storageId, url: URL.createObjectURL(file) })
    } catch (err) {
      setError(errorText(err))
    } finally {
      setUploading(false)
    }
  }

  async function doSign() {
    setBusy(true)
    setError(null)
    try {
      await sign({
        requestId: r._id,
        items: marksToItems(items, marks),
        note: note.trim() || undefined,
        assetId: r.asset?._id ?? null,
        photoStorageId: photo?.storageId ?? null,
        result: anyCoach ? "again" : "passed",
        personId,
      })
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="space-y-4 p-3">
        <div className="space-y-1 rounded-xl border bg-card p-4">
          <p className="text-base font-semibold">Watch {firstName} do the job</p>
          <p className="text-sm text-muted-foreground">
            Mark each point OK when it is done right, or Coach when it needs practice. Asked on {fmtDate(r.createdAt)}.
          </p>
          {r.skills.length > 0 && (
            <p className="text-sm">
              All OK raises <span className="font-medium">{r.skills.map((s) => s.name).join(", ")}</span> to level 2 ({LEVEL_WORDS[2]}).
            </p>
          )}
        </div>

        {items.length === 0 ? (
          <p className="rounded-xl border bg-muted/40 p-4 text-sm text-muted-foreground">
            This Training has no checklist. An Engineer adds the job breakdown first.
          </p>
        ) : (
          <TryOutChecklist items={items} breakdown={r.breakdown} marks={marks} onChange={setMarks} disabled={busy} />
        )}

        <div className="space-y-2">
          <label htmlFor="tryout-note" className="text-sm font-medium">
            Note {anyCoach ? "(what to practise)" : "(optional)"}
          </label>
          <Textarea
            id="tryout-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder={anyCoach ? "For example: check the purge time on the display before opening the valve." : "Anything worth keeping with the record."}
            className="resize-none text-base"
          />
        </div>

        <div className="space-y-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void addPhoto(f)
              e.target.value = ""
            }}
          />
          {photo && <img src={photo.url} alt="Photo with the try-out" className="max-h-56 w-full rounded-xl border object-cover" />}
          <Button
            variant="outline"
            className="h-12 w-full gap-2 rounded-xl text-base"
            disabled={uploading || busy}
            onClick={() => fileRef.current?.click()}
          >
            {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : photo ? <ImageIcon className="h-5 w-5" /> : <Camera className="h-5 w-5" />}
            {photo ? "Take another photo" : "Add a photo (optional)"}
          </Button>
        </div>

        {r.asset && (
          <p className="flex min-h-11 items-center gap-2 rounded-xl border bg-card px-3 text-base">
            <MapPin className="h-4 w-4 text-primary" />
            <span className="font-mono font-semibold">{r.asset.code}</span>
            <span className="truncate text-muted-foreground">{r.asset.name}</span>
          </p>
        )}
        {error && <p className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200">{error}</p>}
      </div>
      <StickyBar className="flex-col items-stretch">
        {!ready && items.length > 0 && (
          <p className="text-center text-[13px] text-muted-foreground">
            {marked < items.length ? `${items.length - marked} of ${items.length} points still to mark` : "Write what to practise first"}
          </p>
        )}
        <Button className="h-12 w-full gap-2 rounded-xl text-base" disabled={!ready || busy} onClick={() => void doSign()} data-sign>
          {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : anyCoach ? <Wrench className="h-5 w-5" /> : <PenLine className="h-5 w-5" />}
          Sign as {personName}
        </Button>
      </StickyBar>
    </div>
  )
}

function Signed({ r }: { r: Request }) {
  const [, navigate] = useLocation()
  const t = r.tryOut
  const passed = r.result === "passed" || t?.result === "passed"
  const firstName = r.personName.split(" ")[0]
  return (
    <div className="flex flex-1 flex-col">
      <div className="space-y-3 p-3">
        <div
          className={
            passed
              ? "flex items-start gap-3 rounded-xl border border-emerald-300 bg-emerald-50 p-4 dark:border-emerald-500/40 dark:bg-emerald-500/10"
              : "flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-500/40 dark:bg-amber-500/10"
          }
        >
          {passed ? <CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-600" /> : <Wrench className="h-6 w-6 shrink-0 text-amber-600" />}
          <div className="space-y-1">
            <p className="text-base font-semibold" data-tryout-result>
              {r.status === "cancelled" ? "This request was cancelled" : passed ? "Try-out passed" : "Coach and try again"}
            </p>
            <p className="text-sm text-muted-foreground">
              {r.status === "cancelled"
                ? "Nothing was signed."
                : passed
                  ? `${firstName} is now level 2 (${LEVEL_WORDS[2]}) on ${r.skills.map((s) => s.name).join(", ") || "the linked Skills"}.`
                  : `${firstName} sees the notes and asks again when ready.`}
            </p>
            {t?.signedByName && (
              <p className="text-sm text-muted-foreground">
                Signed by {t.signedByName} on {fmtDate(t.at, true)}
              </p>
            )}
          </div>
        </div>
        {t?.items && t.items.length > 0 && (
          <ul className="divide-y rounded-xl border bg-card">
            {t.items.map((i, n) => (
              <li key={n} className="flex items-start gap-2 px-3 py-2.5 text-base">
                {i.result === "ok" ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                ) : (
                  <Wrench className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                )}
                <span>
                  {i.label}
                  {i.note && <span className="block text-sm text-muted-foreground">{i.note}</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
        {t?.note && <p className="rounded-xl border bg-card p-3 text-base">{t.note}</p>}
        {t?.photoUrl && <img src={t.photoUrl} alt="Photo with the try-out" className="max-h-56 w-full rounded-xl border object-cover" />}
      </div>
      <StickyBar>
        <Button variant="outline" className="h-12 flex-1 rounded-xl text-base" onClick={() => navigate("/m")}>
          Back to Home
        </Button>
      </StickyBar>
    </div>
  )
}

function CheckInFirst() {
  const { openCheckIn } = useMobileShell()
  return (
    <Centered icon={<UserRound className="h-6 w-6" />} title="Check in to sign">
      A try-out is signed by a named trainer. Check in as yourself first.
      <Button className="mt-3 h-12 gap-2 rounded-xl px-6 text-base" onClick={openCheckIn}>
        <UserRound className="h-5 w-5" /> Check in
      </Button>
    </Centered>
  )
}

function Centered({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">{icon}</div>
      <p className="text-base font-semibold">{title}</p>
      <div className="flex flex-col items-center gap-1 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </div>
  )
}
