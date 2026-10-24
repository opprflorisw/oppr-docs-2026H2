// The edit page of a Wrapped manual (CONTEXT.md). There is no body to edit:
// the supplier PDF is never edited, only replaced. What can change is the
// outline Oppr puts around it (title, supplier, supplier document number and
// revision, Assets, review roles), and the manual goes through the normal
// lifecycle: submit, approve, publish, each sign-off by a checked-in Engineer.

import { useEffect, useMemo, useState } from "react"
import { useLocation } from "wouter"
import { useMutation } from "convex/react"
import { toast } from "sonner"
import { BookLock, Hash, Replace } from "lucide-react"
import { api } from "../../../convex/_generated/api"
import type { Doc, Id } from "../../../convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { StatusBadge } from "@/components/docs/StatusBadge"
import { TypeBadge } from "@/components/docs/TypeBadge"
import { AssetMultiSelect } from "@/components/docs/AssetMultiSelect"
import { PdfViewer } from "@/components/docs/PdfViewer"
import { PublishDocumentDialog, SubmitForReviewDialog, serverMessage } from "@/components/docs/LifecycleDialogs"
import { TopBar } from "@/components/layout/TopBar"
import { PageHeader } from "@/components/layout/PageHeader"
import { useCheckIn } from "@/lib/checkIn"
import { ReplacePdfDialog } from "./ReplacePdfDialog"
import { WrappedManualStrip } from "./WrappedManualView"
import { useWrappedManual } from "./useWrappedManual"

type Action = "save" | "submit" | "approve" | "publish" | "revert"
const NONE = "__none__"

interface Details {
  title: string
  supplier: string
  supplierDocNo: string
  supplierRevision: string
  assetIds: string[]
  ownerPersonId: string
  reviewerPersonId: string
  approverPersonId: string
}

export function WrappedManualEditor({
  doc,
  assets,
}: {
  doc: Doc<"documents">
  assets: Doc<"assets">[]
}) {
  const [, navigate] = useLocation()
  const updateDetails = useMutation(api.manuals.updateDetails)
  const approveDoc = useMutation(api.documents.approve)
  const revertToDraft = useMutation(api.documents.revertToDraft)
  const { person, people } = useCheckIn()
  const engineer = person?.kind === "engineer" ? person : null
  const engineers = useMemo(() => (people ?? []).filter((p) => p.kind === "engineer"), [people])

  const { data: wrapped, late } = useWrappedManual(doc._id, doc.currentVersion)

  const saved: Details = useMemo(
    () => ({
      title: doc.title,
      supplier: doc.supplier ?? "",
      supplierDocNo: doc.supplierDocNo ?? "",
      supplierRevision: doc.supplierRevision ?? "",
      assetIds: assets.map((a) => a._id as string).sort(),
      ownerPersonId: doc.ownerPersonId ?? "",
      reviewerPersonId: doc.reviewerPersonId ?? "",
      approverPersonId: doc.approverPersonId ?? "",
    }),
    [doc, assets],
  )
  const [details, setDetails] = useState<Details>(saved)
  const [touched, setTouched] = useState(false)
  // Follow the server until the person starts changing things.
  useEffect(() => {
    if (!touched) setDetails(saved)
  }, [saved, touched])
  const dirty =
    JSON.stringify({ ...details, assetIds: [...details.assetIds].sort() }) !== JSON.stringify(saved)

  const [running, setRunning] = useState<Action | null>(null)
  const [replaceOpen, setReplaceOpen] = useState(false)
  const [approveOpen, setApproveOpen] = useState(false)
  const [submitOpen, setSubmitOpen] = useState(false)
  const [publishOpen, setPublishOpen] = useState(false)

  const status = doc.status
  const busy = running !== null
  const nameOf = (id: string | null | undefined) => engineers.find((p) => p._id === id)?.name ?? null
  // Four-eyes in the UI: only the named reviewer approves and only the named
  // approver publishes. Everyone else sees who it waits for.
  const waitingFor =
    status === "in_review" && doc.reviewerPersonId && doc.reviewerPersonId !== person?._id
      ? nameOf(doc.reviewerPersonId)
      : status === "approved" && doc.approverPersonId && doc.approverPersonId !== person?._id
        ? nameOf(doc.approverPersonId)
        : null

  function patch(p: Partial<Details>) {
    setTouched(true)
    setDetails((d) => ({ ...d, ...p }))
  }

  async function save(roles?: { reviewerPersonId: string; approverPersonId: string }): Promise<boolean> {
    const d = roles ? { ...details, ...roles } : details
    if (!d.title.trim()) {
      toast.error("Give the manual a title.")
      return false
    }
    if (!d.supplier.trim()) {
      toast.error("Name the supplier of this manual.")
      return false
    }
    const res = await updateDetails({
      documentId: doc._id,
      title: d.title,
      supplier: d.supplier,
      supplierDocNo: d.supplierDocNo.trim() || null,
      supplierRevision: d.supplierRevision.trim() || null,
      assetIds: d.assetIds as Id<"assets">[],
      ownerPersonId: (d.ownerPersonId || null) as Id<"people"> | null,
      reviewerPersonId: (d.reviewerPersonId || null) as Id<"people"> | null,
      approverPersonId: (d.approverPersonId || null) as Id<"people"> | null,
    })
    setTouched(false)
    if (res.backToDraft) toast.info("The title or supplier changed after review, so it is a draft again.")
    return true
  }

  async function run(action: Action) {
    if (action === "submit") {
      if (dirty && !(await save().catch(() => false))) return
      setSubmitOpen(true)
      return
    }
    if (action === "approve" || action === "publish") {
      if (dirty) {
        toast.error("Save your changes first: a sign-off applies to the saved version.")
        return
      }
      if (!engineer) {
        toast.error("Check in as an Engineer (top right) to sign this off.")
        return
      }
      if (action === "publish") {
        setPublishOpen(true)
        return
      }
      if (!approveOpen) {
        setApproveOpen(true)
        return
      }
    }

    setRunning(action)
    try {
      if (action === "revert") {
        await revertToDraft({ id: doc._id, ...(person ? { personId: person._id } : {}) })
        toast.success("Sent back to draft")
      } else if (action === "approve") {
        if (!engineer) return
        await approveDoc({ id: doc._id, personId: engineer._id })
        toast.success(`Approved by ${engineer.name}`)
      } else {
        if (dirty && !(await save())) return
        toast.success("Saved")
      }
    } catch (err) {
      toast.error(serverMessage(err, "That did not work. Try again."))
    } finally {
      setRunning(null)
      setApproveOpen(false)
    }
  }

  return (
    <div className="flex flex-col">
      <TopBar
        breadcrumb={[
          { label: "Documents", href: "/library" },
          { label: `${doc.namingCode} · ${doc.title}`, href: `/docs/${doc._id}` },
          { label: "Edit" },
        ]}
      />
      <PageHeader
        icon={BookLock}
        title={`${doc.namingCode} · ${details.title || "Untitled manual"}`}
        statusLine={
          <span className="flex flex-wrap items-center gap-2">
            <TypeBadge type={doc.type} />
            <StatusBadge status={status} />
            <span className="font-mono text-xs">v{doc.currentVersion}</span>
            <span>Wrapped manual</span>
          </span>
        }
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => navigate(`/docs/${doc._id}`)}>
              View
            </Button>
            <Button variant="outline" size="sm" disabled={busy} onClick={() => setReplaceOpen(true)}>
              <Replace />
              Replace PDF
            </Button>
            <Button variant="outline" size="sm" disabled={busy || !dirty} onClick={() => void run("save")}>
              {running === "save" ? "Saving..." : dirty ? "Save" : "Saved"}
            </Button>
            {(status === "in_review" || status === "approved") && (
              <Button variant="outline" size="sm" disabled={busy} onClick={() => void run("revert")}>
                {running === "revert" ? "Sending back..." : "Send back to draft"}
              </Button>
            )}
            {(status === "draft" || status === "pre_draft") && (
              <Button size="sm" disabled={busy} onClick={() => void run("submit")}>
                Submit for review
              </Button>
            )}
            {waitingFor && <span className="text-sm text-muted-foreground">Waiting for {waitingFor}</span>}
            {status === "in_review" && !waitingFor && (
              <Button size="sm" disabled={busy} onClick={() => void run("approve")}>
                {running === "approve" ? "Approving..." : "Approve"}
              </Button>
            )}
            {status === "approved" && !waitingFor && (
              <Button size="sm" disabled={busy} onClick={() => void run("publish")}>
                Publish
              </Button>
            )}
          </>
        }
      />

      <NextStep status={status} waitingFor={waitingFor} busy={busy} running={running} onAct={(a) => void run(a)} />

      <div className="grid grid-cols-1 gap-6 px-6 pb-6 pt-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-3">
          {wrapped === undefined ? (
            <div className="h-[600px] animate-pulse rounded-md border bg-muted/30" />
          ) : wrapped === null ? (
            <div className="rounded-md border border-dashed p-12 text-center text-sm text-muted-foreground">
              This version has no PDF yet. Use Replace PDF to add the supplier file.
            </div>
          ) : (
            <>
              <WrappedManualStrip documentId={doc._id} data={wrapped} late={late} />
              {wrapped.changeNote && (
                <p className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
                  <span className="font-medium">What changed in v{doc.currentVersion}: </span>
                  {wrapped.changeNote}
                </p>
              )}
              <PdfViewer url={wrapped.stampedUrl ?? wrapped.sourceUrl} />
            </>
          )}
        </div>

        <aside className="space-y-4 self-start rounded-lg border bg-card p-4 lg:sticky lg:top-32">
          <header className="space-y-0.5">
            <h2 className="text-sm font-semibold">Manual details</h2>
            <p className="text-xs text-muted-foreground">The outline Oppr adds around the supplier&apos;s PDF.</p>
          </header>
          <div className="space-y-1">
            <Label htmlFor="wm-title">Title</Label>
            <Input id="wm-title" className="h-9" value={details.title} onChange={(e) => patch({ title: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="wm-supplier">Supplier</Label>
            <Input
              id="wm-supplier"
              className="h-9"
              value={details.supplier}
              onChange={(e) => patch({ supplier: e.target.value })}
              placeholder="Krauss Extrusionstechnik GmbH"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="wm-supplier-no">Supplier document no.</Label>
              <Input
                id="wm-supplier-no"
                className="h-9"
                value={details.supplierDocNo}
                onChange={(e) => patch({ supplierDocNo: e.target.value })}
                placeholder="BA-KX90-EN"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="wm-supplier-rev">Supplier revision</Label>
              <Input
                id="wm-supplier-rev"
                className="h-9"
                value={details.supplierRevision}
                onChange={(e) => patch({ supplierRevision: e.target.value })}
                placeholder="Rev. C"
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Document ID</Label>
            <div className="flex h-9 items-center gap-2 rounded-md border bg-muted/70 px-3 font-mono text-sm text-muted-foreground">
              <Hash className="h-3.5 w-3.5" />
              {doc.namingCode}
            </div>
            <p className="text-xs text-muted-foreground">Fixed. Stamped on every page with the version and status.</p>
          </div>
          <Separator />
          <div className="space-y-1">
            <Label>Assets</Label>
            <AssetMultiSelect
              value={details.assetIds}
              onChange={(ids) => patch({ assetIds: ids })}
              placeholder="Which machines is this manual for?"
            />
            <p className="text-xs text-muted-foreground">Scanning one of these Assets shows the Published manual.</p>
          </div>
          <Separator />
          <div className="space-y-2">
            <Label className="text-xs font-semibold">Review flow</Label>
            <RolePick label="Owner" value={details.ownerPersonId} people={engineers} onChange={(id) => patch({ ownerPersonId: id })} />
            <RolePick label="Reviewer" value={details.reviewerPersonId} people={engineers} onChange={(id) => patch({ reviewerPersonId: id })} />
            <RolePick label="Approver" value={details.approverPersonId} people={engineers} onChange={(id) => patch({ approverPersonId: id })} />
          </div>
        </aside>
      </div>

      <ReplacePdfDialog doc={doc} open={replaceOpen} onOpenChange={setReplaceOpen} />

      <AlertDialog open={approveOpen} onOpenChange={setApproveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Approve {doc.namingCode} v{doc.currentVersion}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This records your review of this version of the supplier PDF. It is not published yet: the approver does
              that next. The sign-off is recorded in the name of {engineer?.name ?? "the checked-in Engineer"}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                void run("approve")
              }}
              disabled={busy}
            >
              Approve as {engineer?.name.split(" ")[0] ?? "Engineer"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <SubmitForReviewDialog
        open={submitOpen}
        onOpenChange={setSubmitOpen}
        documentId={doc._id}
        namingCode={doc.namingCode}
        isNewVersion={doc.liveVersion != null}
        initialReviewer={details.reviewerPersonId || null}
        initialApprover={details.approverPersonId || null}
        initialNote={wrapped?.changeNote ?? null}
        beforeSubmit={async (roles) => {
          try {
            return await save(roles)
          } catch (err) {
            toast.error(serverMessage(err, "The details could not be saved."))
            return false
          }
        }}
        onSubmitted={() => toast.success(`${doc.namingCode} is submitted for review`)}
      />
      <PublishDocumentDialog
        open={publishOpen}
        onOpenChange={setPublishOpen}
        documentId={doc._id}
        namingCode={doc.namingCode}
        version={doc.currentVersion}
        initialNote={wrapped?.changeNote ?? null}
        onPublished={() => {
          toast.success(`${doc.namingCode} v${doc.currentVersion} is Published`, {
            description: "Oppr is stamping every page as the controlled copy.",
          })
          navigate(`/docs/${doc._id}`)
        }}
      />
    </div>
  )
}

/** The one decision this manual is waiting for, in words, with its action. */
function NextStep({
  status,
  waitingFor,
  busy,
  running,
  onAct,
}: {
  status: Doc<"documents">["status"]
  waitingFor: string | null
  busy: boolean
  running: Action | null
  onAct: (a: Action) => void
}) {
  let title: string
  let text: string
  let action: Action | null = null
  let label = ""
  if (status === "draft" || status === "pre_draft") {
    title = "Draft"
    text = "Check the PDF and the details, then submit it for review."
    action = "submit"
    label = "Submit for review"
  } else if (status === "in_review") {
    title = "Waiting for review and approval"
    text = waitingFor
      ? `Waiting for ${waitingFor}, the named reviewer.`
      : "Check that this is the right supplier file for these Assets, then approve. Approving does not publish yet."
    action = waitingFor ? null : "approve"
    label = "Approve"
  } else if (status === "approved") {
    title = "Approved, ready to publish"
    text = waitingFor
      ? `Waiting for ${waitingFor}, the named approver.`
      : "Publishing makes this version Knowledge and stamps every page as the controlled copy."
    action = waitingFor ? null : "publish"
    label = "Publish"
  } else {
    return null
  }
  return (
    <div
      role="status"
      className="mx-6 mt-3 flex flex-wrap items-center gap-3 rounded-md border border-primary/30 bg-primary/5 px-3 py-2"
    >
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{text}</p>
      </div>
      {action && (
        <Button size="sm" disabled={busy} onClick={() => onAct(action)}>
          {running === action ? "Working..." : label}
        </Button>
      )}
    </div>
  )
}

function RolePick({
  label,
  value,
  people,
  onChange,
}: {
  label: string
  value: string
  people: { _id: string; name: string; role: string }[]
  onChange: (id: string) => void
}) {
  const current = people.find((p) => p._id === value)
  return (
    <div className="grid grid-cols-[72px_minmax(0,1fr)] items-center gap-2">
      <span className="text-sm text-muted-foreground">{label}</span>
      <Select value={value || NONE} onValueChange={(v) => onChange(v === NONE ? "" : v)}>
        <SelectTrigger className="h-9 text-sm">
          <SelectValue>{value ? (current?.name ?? "Engineer") : "Not chosen yet"}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>Not chosen yet</SelectItem>
          {people.map((p) => (
            <SelectItem key={p._id} value={p._id}>
              {p.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
