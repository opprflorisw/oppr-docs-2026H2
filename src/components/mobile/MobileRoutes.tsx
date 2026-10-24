import { Redirect, Route, Switch, useParams, useSearch } from "wouter"
import { MobileHomePage } from "@/pages/mobile/MobileHomePage"
import { MobileScanPage } from "@/pages/mobile/MobileScanPage"
import { MobileAssetsPage } from "@/pages/mobile/MobileAssetsPage"
import { MobileAssetPage } from "@/pages/mobile/MobileAssetPage"
import { MobileDocsPage } from "@/pages/mobile/MobileDocsPage"
import { MobileDocPage } from "@/pages/mobile/MobileDocPage"
import { MobileAskPage } from "@/pages/mobile/MobileAskPage"
import { MobileRoundPage } from "@/pages/mobile/MobileRoundPage"

/**
 * Every route of the mobile (floor) app. Used by App.tsx under /m and by the
 * Floor simulator's phone, which runs the same app on an in-memory location.
 */
export function MobileRoutes() {
  return (
    <Switch>
      <Route path="/m" component={MobileHomePage} />
      <Route path="/m/scan" component={MobileScanPage} />
      <Route path="/m/assets" component={MobileAssetsPage} />
      <Route path="/m/assets/:id" component={MobileAssetPage} />
      <Route path="/m/docs" component={MobileDocsPage} />
      <Route path="/m/docs/:id" component={MobileDocPage} />
      <Route path="/m/ask" component={MobileAskPage} />
      <Route path="/m/round/:attemptId" component={MobileRoundPage} />
      {/* Shared components (Ask sources, cited passages) sometimes link to the
          desktop address. Inside the phone that means the mobile page. */}
      <Route path="/docs/:id">
        <ToMobile kind="docs" />
      </Route>
      <Route path="/assets/:id">
        <ToMobile kind="assets" />
      </Route>
      <Route>
        <Redirect to="/m" replace />
      </Route>
    </Switch>
  )
}

function ToMobile({ kind }: { kind: "docs" | "assets" }) {
  const { id } = useParams<{ id: string }>()
  const search = useSearch()
  return <Redirect to={`/m/${kind}/${id}${search ? `?${search}` : ""}`} replace />
}
