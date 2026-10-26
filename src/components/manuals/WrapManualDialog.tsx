// Dialog to wrap a supplier PDF as a new Wrapped manual (CONTEXT.md). The PDF
// is kept unchanged; Oppr gives it a naming code and stamps code, version and
// status on every page. It starts as a draft and follows the normal lifecycle.

import { errorText } from "@/lib/errorText"
import { useEffect, useState, type ReactNode } from "react"
import { useLocation } from "wouter"
import { useMutation, useQuery } from "convex/react"
import { toast } from "sonner"
import { BookLock, Check, Loader2 } from "lucide-react"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { AssetMultiSelect } from "@/components/docs/AssetMultiSelect"
import { PdfDropZone } from "./PdfDropZone"
import { useCheckIn } from "@/lib/checkIn"
import { titleFromFilename, useUploadPdf, type ReadPdf } from "./readPdf"

type Step = "idle" | "uploading" | "creating"

export function WrapManualDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [, navigate] = useLocation()
  const { person } = useCheckIn()
  const vocab = useQuery(api.naming.listVocabulary, open ? {} : "skip")
  const createManual = useMutation(api.manuals.create)
  const upload = useUploadPdf()

  const [pdf, setPdf] = useState<ReadPdf | null>(null)
  const [title, setTitle] = useState("")
  const [supplier, setSupplier] = useState("")
  const [supplierDocNo, setSupplierDocNo] = useState("")
  const [supplierRevision, setSupplierRevision] = useState("")
  const [location, setLocation] = useState("")
  const [discipline, setDiscipline] = useState("")
  const [assetIds, setAssetIds] = useState<string[]>([])
  const [step, setStep] = useState<Step>("idle")

  // Manuals are mostly maintenance documents: start there when it exists.
  useEffect(() => {
    if (open && !discipline && vocab?.disciplines.some((d) => d.code === "MNT"))
      setDiscipline("MNT")
  }, [open, vocab, discipline])

  const preview = useQuery(
    api.naming.peekNextCode,
    open && location && discipline ? { location, discipline, type: "manual" } : "skip",
  )

  function reset() {
    setPdf(null)
    setTitle("")
    setSupplier("")
    setLocation("")
    setDiscipline("")
    setAssetIds([])
    setStep("idle")
  }

  function close(next: boolean) {
    if (step !== "idle") return
    if (!next) reset()
    onOpenChange(next)
  }

  function pick(next: ReadPdf | null) {
    setPdf(next)
    if (next && !title.trim()) setTitle(titleFromFilename(next.file.name))
  }

  const missing = !pdf
    ? "Add the supplier PDF"
    : !title.trim()
      ? "Give it a title"
      : !supplier.trim()
        ? "Name the supplier"
        : !location
          ? "Pick an area"
          : !discipline
            ? "Pick a discipline"
            : null

  async function submit() {
    if (!pdf || missing) return
    try {
      setStep("uploading")
      const storageId = await upload(pdf)
      setStep("creating")
      const res = await createManual({
        storageId,
        filename: pdf.file.name,
        pageTexts: pdf.pageTexts,
        title: title.trim(),
        supplier: supplier.trim(),
        ...(supplierDocNo.trim() ? { supplierDocNo: supplierDocNo.trim() } : {}),
        ...(supplierRevision.trim() ? { supplierRevision: supplierRevision.trim() } : {}),
        location,
        discipline,
        assetIds: assetIds as Id<"assets">[],
        ...(person ? { personId: person._id } : {}),
      })
      toast.success(`${res.namingCode} created as a draft`, {
        description: "Oppr is stamping every page. Submit it for review when it is ready.",
      })
      reset()
      onOpenChange(false)
      navigate(`/docs/${res.id}`)
    } catch (err) {
      setStep("idle")
      toast.error(errorText(err, "Could not wrap the manual. Try again."))
    }
  }

  const busy = step !== "idle"
  const code = preview?.code ?? null

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <BookLock className="h-4 w-4 text-primary" />
            Wrap a supplier manual
          </DialogTitle>
          <DialogDescription className="text-xs">
            The manufacturer&apos;s PDF stays exactly as it is. Oppr gives it a naming code,
            links it to Assets and controls it like any document.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <PdfDropZone value={pdf} onChange={pick} disabled={busy} />

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="wrap-title" className="text-xs font-medium">
                Title
              </Label>
              <Input
                id="wrap-title"
                value={title}
                disabled={busy}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Krauss KX-60 single-screw extruder: operating and maintenance manual"
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="wrap-supplier" className="text-xs font-medium">
                Supplier
              </Label>
              <Input
                id="wrap-supplier"
                value={supplier}
                disabled={busy}
                onChange={(e) => setSupplier(e.target.value)}
                placeholder="Krauss Extrusionstechnik GmbH"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="wrap-supplier-no" className="text-xs font-medium">
                Supplier document no. (optional)
              </Label>
              <Input
                id="wrap-supplier-no"
                className="h-9"
                value={supplierDocNo}
                disabled={busy}
                onChange={(e) => setSupplierDocNo(e.target.value)}
                placeholder="BA-KX60-EN"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="wrap-supplier-rev" className="text-xs font-medium">
                Supplier revision (optional)
              </Label>
              <Input
                id="wrap-supplier-rev"
                className="h-9"
                value={supplierRevision}
                disabled={busy}
                onChange={(e) => setSupplierRevision(e.target.value)}
                placeholder="Rev. C"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-medium">Area</Label>
              <Select value={location} onValueChange={setLocation} disabled={busy}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Pick an area" />
                </SelectTrigger>
                <SelectContent>
                  {(vocab?.locations ?? []).map((l) => (
                    <SelectItem key={l._id} value={l.code}>
                      <span className="font-mono">{l.code}</span> · {l.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-medium">Discipline</Label>
              <Select value={discipline} onValueChange={setDiscipline} disabled={busy}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Pick a discipline" />
                </SelectTrigger>
                <SelectContent>
                  {(vocab?.disciplines ?? []).map((d) => (
                    <SelectItem key={d._id} value={d.code}>
                      <span className="font-mono">{d.code}</span> · {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label className="text-xs font-medium">Assets</Label>
              <AssetMultiSelect
                value={assetIds}
                onChange={setAssetIds}
                disabled={busy}
                placeholder="Which machines is this manual for?"
              />
              <p className="text-[11px] text-muted-foreground">
                Scanning one of these Assets shows the manual once it is Published.
              </p>
            </div>
          </div>

          <div className="space-y-1.5 rounded-md border bg-muted/30 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              What Oppr will do
            </p>
            <ul className="space-y-1 text-xs">
              <Commitment>
                Stamps <span className="font-mono font-semibold">{code ?? "its naming code"}</span>{" "}
                v1 and its status on every page
                {pdf ? ` (${pdf.pageCount} ${pdf.pageCount === 1 ? "page" : "pages"})` : ""}, in a
                band above and below the supplier&apos;s content
              </Commitment>
              <Commitment>
                Keeps the supplier original unchanged, downloadable next to the stamped copy
              </Commitment>
              <Commitment>
                Starts as a draft: review, approval by a checked-in Engineer and publishing as usual
              </Commitment>
              <Commitment>Once Published, Ask, Wikis and Trainings cite it by page</Commitment>
            </ul>
          </div>
        </div>

        <DialogFooter className="items-center gap-2 sm:justify-between">
          <p className="text-xs text-muted-foreground">
            {step === "uploading"
              ? "Uploading the PDF…"
              : step === "creating"
                ? "Creating the document…"
                : (missing ?? "Ready to wrap")}
          </p>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={busy} onClick={() => close(false)}>
              Cancel
            </Button>
            <Button size="sm" disabled={busy || missing != null} onClick={() => void submit()}>
              {busy && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
              {busy ? "Wrapping…" : "Wrap manual"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Commitment({ children }: { children: ReactNode }) {
  return (
    <li className="flex items-start gap-1.5">
      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
      <span>{children}</span>
    </li>
  )
}
