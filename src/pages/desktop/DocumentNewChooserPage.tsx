// Document creation chooser, as a dialog over the Documents list (or Home),
// so starting a document never adds a navigation level: list, then the new
// item in the editor. Start blank, from a template, or by importing a PDF.
// The old /docs/new address redirects to /library?new=1, which opens it.

import { useState } from "react"
import { Redirect, useLocation } from "wouter"
import { WrapManualDialog } from "@/components/manuals/WrapManualDialog"
import { useQuery } from "convex/react"
import { BookLock, FileText, LayoutTemplate, PlusCircle, Sparkles, Upload } from "lucide-react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { TypeBadge } from "@/components/docs/TypeBadge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"
import { api } from "../../../convex/_generated/api"

export function DocumentNewChooserPage() {
  return <Redirect to="/library?new=1" replace />
}

export function NewDocumentChooserDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [, setLocation] = useLocation()
  const templates = useQuery(api.templates.list, open ? {} : "skip")
  const [wrapOpen, setWrapOpen] = useState(false)
  const navigate = (to: string) => {
    onOpenChange(false)
    setLocation(to)
  }

  return (
    <>
    <WrapManualDialog open={wrapOpen} onOpenChange={setWrapOpen} />
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <div>
          <DialogTitle className="flex items-center gap-2 text-base">
            <PlusCircle className="h-4 w-4 text-primary" />
            New document
          </DialogTitle>
          <DialogDescription className="text-xs">
            Start blank, from a template, or from a PDF. You set the title,
            area, discipline and reviewers in the editor.
          </DialogDescription>
        </div>
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2">
          <ChooserCard
            icon={FileText}
            title="Blank document"
            description="Open the editor on an empty page and build the document from scratch."
            onClick={() => navigate("/docs/new/compose?blank=1")}
          />
          <ChooserCard
            icon={Upload}
            title="Attach a PDF"
            description="Embed a PDF as a scrollable attachment inside a normal document you author around."
            onClick={() => navigate("/docs/new/import")}
          />
          <ChooserCard
            icon={Sparkles}
            title="Import & convert"
            description="Extract a PDF's text and images into an editable pre-draft. Shape it, then fit it to a template."
            onClick={() => navigate("/import")}
          />
          <ChooserCard
            icon={BookLock}
            title="Wrap a supplier manual"
            description="Keep a manufacturer's PDF unchanged. Oppr stamps its naming code, version and status on every page and controls it like any document."
            onClick={() => {
              onOpenChange(false)
              setWrapOpen(true)
            }}
          />
        </div>

        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <LayoutTemplate className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">Or start from a template</h2>
          </div>
          {templates === undefined ? (
            <p className="text-xs text-muted-foreground">Loading templates…</p>
          ) : templates.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No templates yet. Create them under{" "}
              <button
                className="text-primary hover:underline"
                onClick={() => navigate("/settings?tab=templates")}
              >
                Templates
              </button>
              .
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {templates.map((t) => (
                <Card
                  key={t._id}
                  role="button"
                  tabIndex={0}
                  onClick={() => navigate(`/docs/new/compose?template=${t._id}`)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault()
                      navigate(`/docs/new/compose?template=${t._id}`)
                    }
                  }}
                  className="cursor-pointer transition-colors hover:border-primary"
                >
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <TypeBadge type={t.type} />
                      {t.name}
                    </CardTitle>
                  </CardHeader>
                  {t.description && (
                    <CardContent className="pt-0">
                      <CardDescription className="text-xs">
                        {t.description}
                      </CardDescription>
                    </CardContent>
                  )}
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
      </DialogContent>
    </Dialog>
    </>
  )
}

function ChooserCard({
  icon: Icon,
  title,
  description,
  onClick,
}: {
  icon: typeof FileText
  title: string
  description: string
  onClick: () => void
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
      className="cursor-pointer transition-colors hover:border-primary"
    >
      <CardHeader className="pb-3">
        <Icon className="h-10 w-10 text-primary" />
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <CardDescription className="text-xs">{description}</CardDescription>
      </CardContent>
    </Card>
  )
}
