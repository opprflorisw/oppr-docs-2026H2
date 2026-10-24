import { useRef, useState } from "react"
import { AlertTriangle, FileText, Loader2, UploadCloud, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { formatBytes, PdfReadError, readPdf, type ReadPdf } from "./readPdf"

/**
 * Drop or pick one supplier PDF. Reads it in the browser (pages, text, can it
 * be stamped) and reports the result; shows the picked file once read.
 */
export function PdfDropZone({
  value,
  onChange,
  disabled,
  compact,
}: {
  value: ReadPdf | null
  onChange: (pdf: ReadPdf | null) => void
  disabled?: boolean
  compact?: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [reading, setReading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function take(file: File | undefined) {
    if (!file || disabled) return
    setError(null)
    setReading(file.name)
    try {
      onChange(await readPdf(file))
    } catch (err) {
      onChange(null)
      setError(err instanceof PdfReadError ? err.message : "This PDF could not be read.")
    } finally {
      setReading(null)
    }
  }

  if (value) {
    const scanned = value.pagesWithoutText > value.pageCount / 2
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-3 rounded-md border bg-muted/30 px-3 py-2.5">
          <FileText className="h-8 w-8 shrink-0 text-red-600/80" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{value.file.name}</p>
            <p className="text-xs text-muted-foreground">
              {value.pageCount} {value.pageCount === 1 ? "page" : "pages"} ·{" "}
              {formatBytes(value.file.size)}
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 gap-1 text-xs"
            disabled={disabled}
            onClick={() => onChange(null)}
          >
            <X className="h-3.5 w-3.5" />
            Change
          </Button>
        </div>
        {scanned && (
          <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Most pages have no text, it looks like a scan. Operators can read it, but
            Ask, Wikis and Trainings cannot quote it.
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-1.5">
      <button
        type="button"
        disabled={disabled || reading != null}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          void take(e.dataTransfer.files?.[0])
        }}
        className={cn(
          "flex w-full flex-col items-center justify-center gap-1.5 rounded-md border-2 border-dashed px-4 text-center transition-colors",
          compact ? "py-5" : "py-8",
          dragging ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/60",
          (disabled || reading) && "cursor-default opacity-70",
        )}
      >
        {reading ? (
          <>
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <span className="text-sm font-medium">Reading {reading}…</span>
            <span className="text-xs text-muted-foreground">Counting pages and reading the text</span>
          </>
        ) : (
          <>
            <UploadCloud className="h-6 w-6 text-muted-foreground" />
            <span className="text-sm font-medium">Drop the supplier PDF here, or click to pick it</span>
            <span className="text-xs text-muted-foreground">One PDF, up to 20 MB</span>
          </>
        )}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(e) => {
          void take(e.target.files?.[0])
          e.target.value = ""
        }}
      />
      {error && (
        <p className="flex items-start gap-1.5 text-xs text-destructive">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {error}
        </p>
      )}
    </div>
  )
}
