import { useEffect } from "react"

export const APP_TITLE = "Oppr Knowledge"

/**
 * Sets the browser tab title to "<record or page> · Oppr Knowledge", so five
 * open SOP tabs (and the back menu) can be told apart. PageHeader calls it
 * with its title; pages without a PageHeader can call it directly. An empty
 * title leaves the plain app name.
 */
export function useDocumentTitle(title: string | null | undefined) {
  useEffect(() => {
    const t = title?.trim()
    document.title = t ? `${t} · ${APP_TITLE}` : APP_TITLE
  }, [title])
}
