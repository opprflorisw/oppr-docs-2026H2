import { Redirect, Route, Switch, useLocation, useRoute } from "wouter"
import { ThemeProvider } from "next-themes"
import { Toaster } from "@/components/ui/sonner"
import { DesktopShell } from "@/components/layout/DesktopShell"
import { MobileShell } from "@/components/mobile/MobileShell"
import { HomePage } from "@/pages/desktop/HomePage"
import { LearnPage } from "@/pages/desktop/LearnPage"
import { WikiListPage } from "@/pages/desktop/WikiListPage"
import { WikiPage } from "@/pages/desktop/WikiPage"
import { FloorSimulatorPage } from "@/pages/desktop/FloorSimulatorPage"
import { LibraryPage } from "@/pages/desktop/LibraryPage"
import { AssetsPage } from "@/pages/desktop/AssetsPage"
import { AssetDetailPage } from "@/pages/desktop/AssetDetailPage"
import { DocumentReadPage } from "@/pages/desktop/DocumentReadPage"
import { DocumentEditPage } from "@/pages/desktop/DocumentEditPage"
import { DocumentNewPage } from "@/pages/desktop/DocumentNewPage"
import { DocumentNewChooserPage } from "@/pages/desktop/DocumentNewChooserPage"
import { SettingsPage } from "@/pages/desktop/SettingsPage"
import { TemplateEditPage } from "@/pages/desktop/TemplateEditPage"
import { ImportPage } from "@/pages/desktop/ImportPage"
import { AnalysisIndexPage } from "@/pages/desktop/AnalysisIndexPage"
import { getAnalysisBySlug } from "@/pages/desktop/analysis/registry"
import { MobileHomePage } from "@/pages/mobile/MobileHomePage"
import { MobileScanPage } from "@/pages/mobile/MobileScanPage"
import { MobileAssetsPage } from "@/pages/mobile/MobileAssetsPage"
import { MobileAssetPage } from "@/pages/mobile/MobileAssetPage"
import { MobileDocsPage } from "@/pages/mobile/MobileDocsPage"
import { MobileDocPage } from "@/pages/mobile/MobileDocPage"
import { MobileAskPage } from "@/pages/mobile/MobileAskPage"
import { AuthGate } from "@/auth/AuthGate"

function AnalysisRoute() {
  const [, params] = useRoute<{ slug: string }>("/analysis/:slug")
  const meta = params ? getAnalysisBySlug(params.slug) : undefined
  if (!meta) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold">Analysis not found</h1>
      </div>
    )
  }
  const Component = meta.Component
  return <Component />
}

function App() {
  const [location] = useLocation()
  const isMobile = location.startsWith("/m")

  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
      <AuthGate>
        <Toaster richColors position="bottom-right" />
        {isMobile ? (
          <MobileShell>
            <Switch>
              <Route path="/m" component={MobileHomePage} />
              <Route path="/m/scan" component={MobileScanPage} />
              <Route path="/m/assets" component={MobileAssetsPage} />
              <Route path="/m/assets/:id" component={MobileAssetPage} />
              <Route path="/m/docs" component={MobileDocsPage} />
              <Route path="/m/docs/:id" component={MobileDocPage} />
              <Route path="/m/ask" component={MobileAskPage} />
            </Switch>
          </MobileShell>
        ) : (
          <DesktopShell>
            <Switch>
              <Route path="/" component={HomePage} />
              <Route path="/library" component={LibraryPage} />
              <Route path="/documents">
                <Redirect to="/library" replace />
              </Route>
              <Route path="/learn" component={LearnPage} />
              <Route path="/wiki" component={WikiListPage} />
              <Route path="/wiki/:id" component={WikiPage} />
              <Route path="/assets" component={AssetsPage} />
              <Route path="/assets/:id" component={AssetDetailPage} />
              <Route path="/floor" component={FloorSimulatorPage} />
              <Route path="/docs/new" component={DocumentNewChooserPage} />
              <Route path="/docs/new/compose" component={DocumentNewPage} />
              <Route path="/docs/new/import" component={DocumentNewPage} />
              <Route path="/docs/:id/edit" component={DocumentEditPage} />
              <Route path="/docs/:id" component={DocumentReadPage} />
              <Route path="/templates/new" component={TemplateEditPage} />
              <Route path="/templates/:id/edit" component={TemplateEditPage} />
              <Route path="/settings" component={SettingsPage} />
              {/* Old addresses: these are tabs of Settings now. */}
              <Route path="/templates">
                <Redirect to="/settings?tab=templates" replace />
              </Route>
              <Route path="/settings/naming">
                <Redirect to="/settings?tab=naming" replace />
              </Route>
              <Route path="/images">
                <Redirect to="/settings?tab=images" replace />
              </Route>
              <Route path="/import" component={ImportPage} />
              <Route path="/import/:jobId" component={ImportPage} />
              <Route path="/analysis" component={AnalysisIndexPage} />
              <Route path="/analysis/:slug" component={AnalysisRoute} />
              <Route>
                <div className="space-y-2 p-8">
                  <h1 className="text-2xl font-bold">Page not found</h1>
                  <a href="/" className="text-sm text-primary hover:underline">
                    Go to Home
                  </a>
                </div>
              </Route>
            </Switch>
          </DesktopShell>
        )}
      </AuthGate>
    </ThemeProvider>
  )
}

export default App
