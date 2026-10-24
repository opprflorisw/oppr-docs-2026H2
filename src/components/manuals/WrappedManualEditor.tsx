// The edit page of a Wrapped manual (CONTEXT.md). There is no body to edit:
// the supplier PDF is never edited, only replaced. What can change is the
// outline Oppr puts around it (title, supplier, Assets, review roles), and the
// manual goes through the normal lifecycle: submit, approve, publish, each
// sign-off by a checked-in Engineer.

import { useEffect, useMemo, useState } from "react"
import { useLocation } from "wouter"
import { useMutation, useQuery } from "convex/react"
import { toast } from "sonner"
import { BookLock, Hash, Replace } from "lucide-react"
import { api } from "../../../convex/_generated/api"
import type { Doc, Id } from "../../../convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Checkbox } from "@/components/ui/checkbox"
import { Textarea } from "@/components/ui/textarea"
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
  assetIds: string[]
  ownerId: string
  reviewerId: string
  approverId: string
}

export function WrappedManualEditor({
  doc,
  assets,
}: {
  doc: Doc<"documents">
  assets: Doc<"assets">[]
}) {
  const [, navigate] = useLocation()
  const users = useQuery(api.users.list) ?? []
  const updateDetails = useMutation(api.manuals.updateDetails)
  const submitForReview = useMutation(api.documents.submitForReview)
  const approveDoc = useMutation(api.documents.approve)
  const publishDoc = useMutation(api.documents.publish)
  const revertToDraft = useMutation(api.documents.revertToDraft)
  const { person } = useCheckIn()
  const engineer = person?.kind === "engineer" ? person : null

  const { data: wrapped, late } = useWrappedManual(doc._id, doc.currentVersion)

  const saved: Details = useMemo(
    () => ({
      title: doc.title,
      supplier: doc.supplier ?? "",
      assetIds: assets.map((a) => a._id as string).sort(),
      ownerId: doc.ownerId ?? "",
      reviewerId: doc.reviewerId ?? "",
      approverId: doc.approverId ?? "",
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
  const [signOff, setSignOff] = useState<"approve" | "publish" | null>(null)
  const [significant, setSignificant] = useState(false)
  const [changeNote, setChangeNote] = useState("")

  const status = doc.status
  const busy = running !== null
  const isNewVersion = doc.liveVersion != null && doc.currentVersion !== doc.liveVersion

  function patch(p: Partial<Details>) {
    setTouched(true)
    setDetails((d) => ({ ...d, ...p }))
  }

  async function save(): Promise<boolean> {
    if (!details.title.trim()) {
      toast.error("Give the manual a title.")
      return false
    }
    if (!details.supplier.trim()) {
      toast.error("Name the supplier of this manual.")
      return false
    }
    const res = await updateDetails({
      documentId: doc._id,
      title: details.title,
      supplier: details.supplier,
      assetIds: details.assetIds as Id<"assets">[],
      ownerId: (details.ownerId || null) as Id<"users"> | null,
      reviewerId: (details.reviewerId || null) as Id<"users"> | null,
      approverId: (details.approverId || null) as Id<"users"> | null,
    })
    setTouched(false)
    if (res.backToDraft) toast.info("The title or supplier changed after review, so it is a draft again.")
    return true
  }

  async function run(action: Action) {
    if (action === "submit" && !details.reviewerId) {
      toast.error("Assign a reviewer before submitting for review.")
      return
    }
    if (action === "approve" && !details.approverId) {
      toast.error("Assign an approver before approving.")
      return
    }
    if ((action === "approve" || action === "publish") && signOff !== action) {
      if (dirty) {
        toast.error("Save your changes first: a sign-off applies to the saved version.")
        return
      }
      if (!engineer) {
        toast.error("Check in as an Engineer (top right) to sign this off.")
        return
      }
      if (action === "publish") {
        setSignificant(false)
        setChangeNote(wrapped?.changeNote ?? "")
      }
      setSignOff(action)
      return
    }

    setRunning(action)
    try {
      if (action === "revert") {
        await revertToDraft({ id: doc._id })
        toast.success("Reverted to draft")
      } else if (action === "approve") {
        if (!engineer) return
        await approveDoc({ id: doc._id, personId: engineer._id })
        toast.success(`Approved by ${engineer.name}`)
      } else if (action === "publish") {
        if (!engineer) return
        await publishDoc({
          id: doc._id,
          personId: engineer._id,
          significantChange: isNewVersion ? significant : undefined,
          changeNote: changeNote.trim() || undefined,
        })
        toast.success(`Published by ${engineer.name}`, {
          description: "Oppr is stamping every page as the controlled copy.",
        })
        navigate(`/docs/${doc._id}`)
      } else {
        if (dirty && !(await save())) return
        if (action === "save") toast.success("Saved")
        if (action === "submit") {
          await submitForReview({ id: doc._id })
          toast.success("Submitted for review")
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed")
    } finally {
      setRunning(null)
      setSignOff(null)
    }
  }

  const userLabel = (id: string) => {
    const u = users.find((x) => x.id === id)
    return u ? (u.name ?? u.email ?? "User") : "User"
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
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <TypeBadge type={doc.type} />
            <StatusBadge status={status} />
            <span className="font-mono text-[10px]">v{doc.currentVersion}</span>
            <span>Wrapped manual</span>
          </span>
        }
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => navigate(`/docs/${doc._id}`)}>
              View
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={busy}
              onClick={() => setReplaceOpen(true)}
            >
              <Replace className="h-3.5 w-3.5" />
              Replace PDF
            </Button>
            <Button variant="outline" size="sm" disabled={busy || !dirty} onClick={() => void run("save")}>
              {running === "save" ? "Saving…" : dirty ? "Save" : "Saved"}
            </Button>
            {(status === "in_review" || status === "approved") && (
              <Button variant="outline" size="sm" disabled={busy} onClick={() => void run("revert")}>
                {running === "revert" ? "Reverting…" : "Revert to draft"}
              </Button>
            )}
            {(status === "draft" || status === "pre_draft") && (
              <Button
                size="sm"
                disabled={busy}
                onClick={() => void run("submit")}
                title={!details.reviewerId ? "Assign a reviewer first" : undefined}
              >
                {running === "submit" ? "Submitting…" : "Submit for review"}
              </Button>
            )}
            {status === "in_review" && (
              <Button size="sm" disabled={busy} onClick={() => void run("approve")}>
                {running === "approve" ? "Approving…" : "Approve"}
              </Button>
            )}
            {status === "approved" && (
              <Button size="sm" disabled={busy} onClick={() => void run("publish")}>
                {running === "publish" ? "Publishing…" : "Publish"}
              </Button>
            )}
          </>
        }
      />

      <NextStep
        status={status}
        hasReviewer={Boolean(details.reviewerId)}
        hasApprover={Boolean(details.approverId)}
        busy={busy}
        running={running}
        onAct={(a) => void run(a)}
      />

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
                <p className="rounded-md border bg-muted/30 px-3 py-2 text-xs">
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
            <p className="text-xs text-muted-foreground">
              The outline Oppr adds around the supplier&apos;s PDF.
            </p>
          </header>
          <div className="space-y-1">
            <Label htmlFor="wm-title" className="text-xs font-medium">
              Title
            </Label>
            <Input id="wm-title" value={details.title} onChange={(e) => patch({ title: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="wm-supplier" className="text-xs font-medium">
              Supplier
            </Label>
            <Input
              id="wm-supplier"
              value={details.supplier}
              onChange={(e) => patch({ supplier: e.target.value })}
              placeholder="Krauss Extrusionstechnik GmbH"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-medium">Naming code</Label>
            <div className="flex items-center gap-2 rounded-md border bg-muted/70 px-3 py-2 font-mono text-sm text-muted-foreground">
              <Hash className="h-3.5 w-3.5" />
              {doc.namingCode}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Fixed. Stamped on every page with the version and status.
            </p>
          </div>
          <Separator />
          <div className="space-y-1">
            <Label className="text-xs font-medium">Assets</Label>
            <AssetMultiSelect
              value={details.assetIds}
              onChange={(ids) => patch({ assetIds: ids })}
              placeholder="Which machines is this manual for?"
            />
            <p className="text-[11px] text-muted-foreground">
              Scanning one of these Assets shows the Published manual.
            </p>
          </div>
          <Separator />
          <div className="space-y-2">
            <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Review flow
            </Label>
            <RolePick label="Owner" value={details.ownerId} users={users} display={userLabel} onChange={(id) => patch({ ownerId: id })} />
            <RolePick label="Reviewer" value={details.reviewerId} users={users} display={userLabel} onChange={(id) => patch({ reviewerId: id })} />
            <RolePick label="Approver" value={details.approverId} users={users} display={userLabel} onChange={(id) => patch({ approverId: id })} />
          </div>
        </aside>
      </div>

      <ReplacePdfDialog doc={doc} open={replaceOpen} onOpenChange={setReplaceOpen} />

      <AlertDialog open={signOff !== null} onOpenChange={(o) => !o && setSignOff(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {signOff === "approve" ? "Approve" : "Publish"} {doc.namingCode} v{doc.currentVersion}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {signOff === "approve"
                ? "This records your approval of this version of the supplier PDF. It is not published yet."
                : "Publishing makes this version Knowledge: Operators, Ask, Wikis and Trainings start using it, and every page is stamped as the controlled copy."}{" "}
              The sign-off is recorded in the name of {engineer?.name ?? "the checked-in Engineer"}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {signOff === "publish" && (
            <div className="space-y-3">
              {isNewVersion && (
                <label className="flex items-start gap-2 rounded-md border p-3 text-sm">
                  <Checkbox
                    checked={significant}
                    onCheckedChange={(c) => setSignificant(c === true)}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="font-medium">Significant change</span>
                    <span className="block text-xs text-muted-foreground">
                      The new PDF changes how the work is done. Linked Trainings go back to review and
                      holders of linked Skills are flagged for re-training.
                    </span>
                  </span>
                </label>
              )}
              <div className="space-y-1">
                <Label htmlFor="wm-change" className="text-xs font-medium">
                  What changed <span className="font-normal text-muted-foreground">(optional)</span>
                </Label>
                <Textarea
                  id="wm-change"
                  rows={2}
                  value={changeNote}
                  onChange={(e) => setChangeNote(e.target.value)}
                />
              </div>
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                if (signOff) void run(signOff)
              }}
              disabled={busy}
            >
              {signOff === "approve" ? "Approve" : "Publish"} as {engineer?.name.split(" ")[0] ?? "Engineer"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

/** The one decision this manual is waiting for, in words, with its action. */
function NextStep({
  status,
  hasReviewer,
  hasApprover,
  busy,
  running,
  onAct,
}: {
  status: Doc<"documents">["status"]
  hasReviewer: boolean
  hasApprover: boolean
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
    text = hasReviewer
      ? "Check the PDF and the details, then submit it for review."
      : "Assign a reviewer in the details, then submit it for review."
    action = hasReviewer ? "submit" : null
    label = "Submit for review"
  } else if (status === "in_review") {
    title = "Waiting for review and approval"
    text = hasApprover
      ? "Check that this is the right supplier file for these Assets, then approve. Approving does not publish yet."
      : "Assign an approver in the details, then approve. Approving does not publish yet."
    action = hasApprover ? "approve" : null
    label = "Approve"
  } else if (status === "approved") {
    title = "Approved, ready to publish"
    text = "Publishing makes this version Knowledge and stamps every page as the controlled copy."
    action = "publish"
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
          {running === action ? "Working…" : label}
        </Button>
      )}
    </div>
  )
}

function RolePick({
  label,
  value,
  users,
  display,
  onChange,
}: {
  label: string
  value: string
  users: { id: string; name: string | null; email: string | null }[]
  display: (id: string) => string
  onChange: (id: string) => void
}) {
  return (
    <div className="grid grid-cols-[72px_minmax(0,1fr)] items-center gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <Select value={value || NONE} onValueChange={(v) => onChange(v === NONE ? "" : v)}>
        <SelectTrigger className="h-8 text-xs">
          <SelectValue>{value ? display(value) : "Unassigned"}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>Unassigned</SelectItem>
          {users.map((u) => (
            <SelectItem key={u.id} value={u.id}>
              {u.name ?? u.email ?? "User"}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
