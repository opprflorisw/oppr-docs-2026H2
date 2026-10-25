// Document creation chooser, as a dialog over the Documents list (or Home),
// so starting a document never adds a navigation level: list, then the new
// item in the editor. Start blank, from a template, or by importing a PDF.
// The old /docs/new address redirects to /library?new=1, which opens it.

import { useState } from "react"
import { Redirect, useLocation } from "wouter"
import { WrapManualDialog } from "@/components/manuals/WrapManualDialog"
import { useQuery } from "convex/react"
import { BookLock, Cable, FileText, LayoutTemplate, MessageSquareText, PlusCircle, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"
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
            Write it with the assistant or yourself, or start from a PDF. You set the title, location, discipline and
            reviewers next.
          </DialogDescription>
        </div>
      <div className="space-y-6">
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">Write</h2>
          <ChooserCard
            icon={MessageSquareText}
            title="Write with the assistant"
            description="Say what the document should cover. The assistant asks a few questions, drafts the steps and proposes images, PPE and hazards from your library and Plant. You check everything before it goes in."
            featured
            onClick={() => navigate("/docs/new/compose?assistant=1")}
          />
          <div className="grid gap-3 md:grid-cols-2">
            <ChooserCard
              icon={FileText}
              title="Blank"
              description="Open the editor on an empty page and write the document from scratch."
              onClick={() => navigate("/docs/new/compose?blank=1")}
            />
            <ChooserCard
              icon={LayoutTemplate}
              title="From template"
              description="Start from one of your templates below, with the sections already in place."
              onClick={() => document.getElementById("chooser-templates")?.scrollIntoView({ behavior: "smooth" })}
            />
          </div>
        </section>
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">From a PDF</h2>
          <div className="grid gap-3 md:grid-cols-2">
            <ChooserCard
              icon={Sparkles}
              title="Convert to an editable document"
              description="Take the text and images out of a PDF into an editable draft. Shape it, then fit it to a template."
              onClick={() => navigate("/import")}
            />
            <ChooserCard
              icon={BookLock}
              title="Wrap a supplier manual (kept unchanged)"
              description="Keep a manufacturer PDF as it is. Oppr stamps its document ID, version and status on every page and controls it like any document."
              onClick={() => {
                onOpenChange(false)
                setWrapOpen(true)
              }}
            />
          </div>
        </section>

        <button
          type="button"
          onClick={() => navigate("/mcp")}
          className="flex w-full items-center gap-2 rounded-md border border-dashed px-3 py-2 text-left text-xs text-muted-foreground transition-colors hover:border-primary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Cable className="h-3.5 w-3.5 shrink-0 text-primary" />
          <span>
            <span className="font-medium text-foreground">Bring documents in with your own AI.</span>{" "}
            Many files at once? Let your company's assistant prepare them over MCP.
          </span>
        </button>

        <div className="space-y-3">
          <div id="chooser-templates" className="flex items-center gap-2">
            <LayoutTemplate className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">Templates</h2>
          </div>
          {templates === undefined ? (
            <p className="text-sm text-muted-foreground">Loading templates...</p>
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
  featured,
}: {
  icon: typeof FileText
  title: string
  description: string
  onClick: () => void
  /** The suggested way to start: drawn a little stronger. */
  featured?: boolean
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
      className={cn("cursor-pointer transition-colors hover:border-primary", featured && "border-primary/40 bg-primary/5")}
    >
      <CardHeader className="flex-row items-start gap-3 space-y-0 p-4">
        <Icon className="mt-0.5 h-6 w-6 shrink-0 text-primary" />
        <div className="space-y-1">
          <CardTitle className="text-sm">{title}</CardTitle>
          <CardDescription className="text-sm">{description}</CardDescription>
        </div>
      </CardHeader>
    </Card>
  )
}
