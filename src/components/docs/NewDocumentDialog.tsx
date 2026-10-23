// Modal "New document" picker. Wraps a trigger element. On click of a card,
// closes the modal and routes to /docs/new/compose or /docs/new/import.

import { useState, type ReactNode } from "react"
import { useLocation } from "wouter"
import { FileText, PlusCircle, Sparkles, Upload } from "lucide-react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

interface NewDocumentDialogProps {
  trigger: ReactNode
}

export function NewDocumentDialog({ trigger }: NewDocumentDialogProps) {
  const [open, setOpen] = useState(false)
  const [, navigate] = useLocation()

  function pick(path: string) {
    setOpen(false)
    navigate(path)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <PlusCircle className="h-4 w-4 text-primary" />
            New document
          </DialogTitle>
          <DialogDescription className="text-xs">
            Pick how you want to start. Each path lands you in the editor (or
            log spec) with metadata next.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 py-2 md:grid-cols-3">
          <PickerCard
            icon={FileText}
            title="Compose new"
            description="Open the editor blank or from a template, then set location, discipline, and reviewers."
            onClick={() => pick("/docs/new")}
          />
          <PickerCard
            icon={Upload}
            title="Attach PDF"
            description="Embed an existing PDF as a scrollable attachment inside an editable document. Per-page text is extracted for Ask."
            onClick={() => pick("/docs/new/import")}
          />
          <PickerCard
            icon={Sparkles}
            title="Convert external"
            description="Convert a PDF SOP or Work Instruction into a database-built Oppr document or LOG spec via markitdown + AI."
            onClick={() => pick("/import")}
            accent
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}

function PickerCard({
  icon: Icon,
  title,
  description,
  onClick,
  accent,
}: {
  icon: typeof FileText
  title: string
  description: string
  onClick: () => void
  accent?: boolean
}) {
  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          onClick()
        }
      }}
      className={
        accent
          ? "cursor-pointer border-primary/40 bg-primary/5 transition-colors hover:border-primary"
          : "cursor-pointer transition-colors hover:border-primary"
      }
    >
      <CardHeader className="pb-2">
        <Icon className="h-8 w-8 text-primary" />
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <CardDescription className="text-xs">{description}</CardDescription>
      </CardContent>
    </Card>
  )
}
