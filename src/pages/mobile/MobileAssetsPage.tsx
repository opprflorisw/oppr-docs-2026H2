import { Redirect } from "wouter"

// Assets are browsed in Find (one place for Assets, documents and Wikis).
// The address stays so old links and saved shortcuts keep working.
export function MobileAssetsPage() {
  return <Redirect to="/m/find?in=assets" replace />
}
