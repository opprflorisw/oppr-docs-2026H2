import { Redirect } from "wouter"

// Documents are browsed in Find (one place for Assets, documents and
// Wikis). The address stays so old links keep working.
export function MobileDocsPage() {
  return <Redirect to="/m/find?in=docs" replace />
}
