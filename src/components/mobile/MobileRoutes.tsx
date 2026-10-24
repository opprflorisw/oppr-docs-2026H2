import { Redirect, Route, Switch, useParams, useSearch } from "wouter"
import { MobileHomePage } from "@/pages/mobile/MobileHomePage"
import { MobileScanPage } from "@/pages/mobile/MobileScanPage"
import { MobileAssetsPage } from "@/pages/mobile/MobileAssetsPage"
import { MobileAssetPage } from "@/pages/mobile/MobileAssetPage"
import { MobileDocsPage } from "@/pages/mobile/MobileDocsPage"
import { MobileDocPage } from "@/pages/mobile/MobileDocPage"
import { MobileAskPage } from "@/pages/mobile/MobileAskPage"
import { MobileRoundPage } from "@/pages/mobile/MobileRoundPage"
import { MobileAttemptPage } from "@/pages/mobile/MobileAttemptPage"
import { MobileMePage } from "@/pages/mobile/MobileMePage"
import { MobileTryOutPage } from "@/pages/mobile/MobileTryOutPage"
import { MobileWikiPage } from "@/pages/mobile/MobileWikiPage"
import { MobileCapturePage } from "@/pages/mobile/MobileCapturePage"
import { MobileCaptureDetailPage } from "@/pages/mobile/MobileCaptureDetailPage"
import { MobileFindPage } from "./MobileFind"

/**
 * Every route of the floor app. Used by App.tsx under /m, by the desktop
 * phone preview and by the Floor simulator's phone (in-memory location).
 *
 * Tabs: Home (/m), Find (/m/find), Capture (/m/capture), Ask (/m/ask), Me (/m/me).
 */
export function MobileRoutes() {
  return (
    <Switch>
      <Route path="/m" component={MobileHomePage} />
      <Route path="/m/find" component={MobileFindPage} />
      <Route path="/m/scan" component={MobileScanPage} />
      <Route path="/m/assets" component={MobileAssetsPage} />
      <Route path="/m/assets/:id" component={MobileAssetPage} />
      <Route path="/m/docs" component={MobileDocsPage} />
      <Route path="/m/docs/:id" component={MobileDocPage} />
      <Route path="/m/wiki/:id" component={MobileWikiPage} />
      <Route path="/m/ask" component={MobileAskPage} />
      <Route path="/m/capture" component={MobileCapturePage} />
      <Route path="/m/capture/:id" component={MobileCaptureDetailPage} />
      <Route path="/m/me" component={MobileMePage} />
      <Route path="/m/round/:attemptId" component={MobileRoundPage} />
      <Route path="/m/attempt/:attemptId" component={MobileAttemptPage} />
      <Route path="/m/tryout/:requestId" component={MobileTryOutPage} />
      {/* Shared components (Ask sources, cited passages, Training links)
          sometimes build the desktop address. Inside the phone that means
          the phone page. */}
      <Route path="/docs/:id">
        <ToMobile to={(id) => `/m/docs/${id}`} />
      </Route>
      <Route path="/assets/:id">
        <ToMobile to={(id) => `/m/assets/${id}`} />
      </Route>
      <Route path="/wiki/:id">
        <ToMobile to={(id) => `/m/wiki/${id}`} />
      </Route>
      <Route path="/learn/attempts/:id">
        <ToMobile to={(id) => `/m/attempt/${id}`} />
      </Route>
      <Route path="/captures/:id">
        <ToMobile to={(id) => `/m/capture/${id}`} />
      </Route>
      <Route>
        <Redirect to="/m" replace />
      </Route>
    </Switch>
  )
}

function ToMobile({ to }: { to: (id: string) => string }) {
  const { id } = useParams<{ id: string }>()
  const search = useSearch()
  return <Redirect to={`${to(id)}${search ? `?${search}` : ""}`} replace />
}
