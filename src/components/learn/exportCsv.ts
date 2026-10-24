// CSV export for Learn lists (Training records, the Skill matrix). Excel
// friendly: UTF-8 with a byte order mark, comma separated, every cell quoted
// when it holds a comma, quote or line break.

function cell(value: unknown): string {
  const s = value == null ? "" : String(value)
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv(rows: unknown[][]): string {
  return rows.map((r) => r.map(cell).join(",")).join("\r\n")
}

/** Builds the CSV and hands it to the browser as a download. */
export function downloadCsv(filename: string, rows: unknown[][]) {
  const name = filename.toLowerCase().endsWith(".csv") ? filename : `${filename}.csv`
  const blob = new Blob(["﻿", toCsv(rows)], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** "2026-10-24" for file names. */
export function fileDate(at = Date.now()) {
  const d = new Date(at)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}
