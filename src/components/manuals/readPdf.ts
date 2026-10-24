// Reading a supplier PDF in the browser before it is wrapped or replaced:
// page count, the text of every page (chunked server-side into "Page N"
// passages for Ask, Wikis and Trainings) and a check that Oppr can stamp it.

import * as pdfjs from "pdfjs-dist"
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url"
import { useMutation } from "convex/react"
import { useCallback } from "react"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"

if (!pdfjs.GlobalWorkerOptions.workerSrc) {
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl
}

// Stamping runs in a Convex action with limited memory; larger files are
// refused up front with a clear message instead of failing later.
export const MAX_PDF_BYTES = 20 * 1024 * 1024

export interface ReadPdf {
  file: File
  bytes: Uint8Array
  pageCount: number
  pageTexts: string[]
  // Pages with (almost) no text: a scanned manual cannot be searched by Ask.
  pagesWithoutText: number
}

export class PdfReadError extends Error {}

interface TextItem {
  str: string
  transform: number[]
  height: number
  hasEOL?: boolean
}

/**
 * Page text with line and paragraph breaks recovered from item positions,
 * so the server can split a page into passages on blank lines.
 */
function pageText(items: TextItem[]): string {
  let out = ""
  let lastY: number | null = null
  let lastH = 10
  for (const it of items) {
    // Empty items (end-of-line markers) carry no useful position.
    if (!it.str.trim()) {
      if (out && !/\s$/.test(out)) out += " "
      continue
    }
    const y = it.transform[5]
    const h = Math.abs(it.transform[3]) || it.height || lastH
    if (lastY != null && Math.abs(lastY - y) > Math.min(h, lastH) * 0.5) {
      out += Math.abs(lastY - y) > Math.max(h, lastH) * 1.9 ? "\n\n" : "\n"
    } else if (out && !/\s$/.test(out) && it.str && !/^\s/.test(it.str)) {
      out += " "
    }
    out += it.str
    if (it.str.trim()) {
      lastY = y
      lastH = h
    }
  }
  return out
    .split("\n")
    .map((l) => l.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

export async function readPdf(file: File): Promise<ReadPdf> {
  const isPdf = file.type.includes("pdf") || file.name.toLowerCase().endsWith(".pdf")
  if (!isPdf) throw new PdfReadError("That file is not a PDF.")
  if (file.size > MAX_PDF_BYTES)
    throw new PdfReadError(
      `That PDF is ${(file.size / 1024 / 1024).toFixed(0)} MB. Wrapped manuals can be up to ${MAX_PDF_BYTES / 1024 / 1024} MB.`,
    )
  const bytes = new Uint8Array(await file.arrayBuffer())

  // Oppr stamps every page with pdf-lib: make sure it can open the file.
  const { PDFDocument } = await import("pdf-lib")
  try {
    const probe = await PDFDocument.load(bytes.slice(), { ignoreEncryption: true })
    if (probe.isEncrypted)
      throw new PdfReadError(
        "This PDF is password protected, so Oppr cannot stamp it. Ask the supplier for an unprotected copy.",
      )
  } catch (err) {
    if (err instanceof PdfReadError) throw err
    throw new PdfReadError("This PDF could not be opened. It may be damaged.")
  }

  let pdf: pdfjs.PDFDocumentProxy
  try {
    pdf = await pdfjs.getDocument({ data: bytes.slice() }).promise
  } catch {
    throw new PdfReadError("This PDF could not be read. It may be damaged.")
  }
  const pageTexts: string[] = []
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    pageTexts.push(
      pageText(content.items.filter((it) => "str" in it) as unknown as TextItem[]),
    )
  }
  await pdf.destroy()
  return {
    file,
    bytes,
    pageCount: pageTexts.length,
    pageTexts,
    pagesWithoutText: pageTexts.filter((t) => t.replace(/\s/g, "").length < 20).length,
  }
}

/** Upload PDF bytes to Convex storage; returns the storage id. */
export function useUploadPdf() {
  const generateUploadUrl = useMutation(api.files.generateUploadUrl)
  return useCallback(
    async (pdf: ReadPdf): Promise<Id<"_storage">> => {
      const url = await generateUploadUrl()
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/pdf" },
        body: pdf.bytes.slice(),
      })
      if (!res.ok) throw new Error(`Upload failed (${res.status}). Try again.`)
      const { storageId } = (await res.json()) as { storageId: Id<"_storage"> }
      return storageId
    },
    [generateUploadUrl],
  )
}

/** "Krauss_KX-60_manual_EN.pdf" → "Krauss KX-60 manual EN" */
export function titleFromFilename(name: string): string {
  return name
    .replace(/\.pdf$/i, "")
    .replace(/[_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}
