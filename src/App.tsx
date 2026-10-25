import { Link, Redirect, Route, Switch, useLocation, useRoute } from "wouter"
import { useConvexAuth } from "convex/react"
import { Factory, FileQuestion, GraduationCap, Library } from "lucide-react"
import { isMobilePath } from "@/lib/utils"
import { ThemeProvider } from "next-themes"
import { Toaster } from "@/components/ui/sonner"
import { DesktopShell } from "@/components/layout/DesktopShell"
import { NarrowViewportGuard } from "@/components/layout/NarrowViewportGuard"
import { PageHeader } from "@/components/layout/PageHeader"
import { TopBar } from "@/components/layout/TopBar"
import { Button } from "@/components/ui/button"
import { SignInForm } from "@/auth/SignInForm"
import { MobileShell } from "@/components/mobile/MobileShell"
import { MobileRoutes } from "@/components/mobile/MobileRoutes"
import { HomePage } from "@/pages/desktop/HomePage"
import { LearnPage } from "@/pages/desktop/LearnPage"
import { WikiListPage } from "@/pages/desktop/WikiListPage"
import { WikiPage } from "@/pages/desktop/WikiPage"
import { FloorSimulatorPage } from "@/pages/desktop/FloorSimulatorPage"
import { LibraryPage } from "@/pages/desktop/LibraryPage"
import { ImageLibraryPage } from "@/pages/desktop/ImageLibraryPage"
import { PlantPage } from "@/pages/desktop/PlantPage"
import { AssetDetailPage } from "@/pages/desktop/AssetDetailPage"
import { DocumentReadPage } from "@/pages/desktop/DocumentReadPage"
import { DocumentEditPage } from "@/pages/desktop/DocumentEditPage"
import { DocumentNewPage } from "@/pages/desktop/DocumentNewPage"
import { DocumentNewChooserPage } from "@/pages/desktop/DocumentNewChooserPage"
import { SettingsPage } from "@/pages/desktop/SettingsPage"
import { TemplateEditPage } from "@/pages/desktop/TemplateEditPage"
import { ImportPage } from "@/pages/desktop/ImportPage"
import { getAnalysisBySlug } from "@/pages/desktop/analysis/registry"
import { AuthGate } from "@/auth/AuthGate"
import { FindingsPage } from "@/pages/desktop/FindingsPage"
import { KnowledgeHealthPage } from "@/pages/desktop/KnowledgeHealthPage"
import { TrainingPage } from "@/pages/desktop/TrainingPage"
import { AttemptPage } from "@/pages/desktop/AttemptPage"
import { PersonSkillsPage } from "@/pages/desktop/PersonSkillsPage"
import { SkillsWorkspacePage } from "@/pages/desktop/SkillsWorkspacePage"
import { DevHomePage } from "@/pages/desktop/dev/DevHomePage"
import { EmbeddingsLabPage } from "@/pages/desktop/dev/EmbeddingsLabPage"
import { DevMcpPage } from "@/pages/desktop/dev/DevMcpPage"
import { DevAiPage } from "@/pages/desktop/dev/DevAiPage"
import { DevAnalysisPage } from "@/pages/desktop/dev/DevAnalysisPage"
import { DevNotice } from "@/components/dev/DevFrame"
import { useIsDeveloper } from "@/components/dev/devTools"
import { Iso9001Page } from "@/pages/desktop/Iso9001Page"
import { PhonePreviewHost } from "@/components/phone/PhonePreview"
import { CapturesPage } from "@/pages/desktop/CapturesPage"
import { CaptureDetailPage } from "@/pages/desktop/CaptureDetailPage"
import { CaptureSetPage } from "@/pages/desktop/CaptureSetPage"

/** A case file. Part of the Developer section: Engineers and Admins only. */
function AnalysisRoute() {
  const [, params] = useRoute<{ slug: string }>("/analysis/:slug")
  const allowed = useIsDeveloper()
  const meta = params ? getAnalysisBySlug(params.slug) : undefined
  if (!allowed) {
    return (
      <div className="flex flex-col">
        <TopBar breadcrumb={[{ label: "Developer", href: "/dev" }, { label: "Analysis", href: "/dev/analysis" }]} />
        <DevNotice />
      </div>
    )
  }
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

/** Inside the shell, so the way on is always visible. */
function NotFound({ what }: { what?: string }) {
  const [location] = useLocation()
  return (
    <div className="flex flex-col">
      <TopBar breadcrumb={[{ label: "Page not found" }]} />
      <PageHeader icon={FileQuestion} title="Page not found" statusLine={location} />
      <div className="max-w-xl space-y-4 p-6">
        <p className="text-sm text-muted-foreground">
          {what ?? "There is nothing at this address. It may have moved, or the link is old."}{" "}
          Search with Ctrl+K, or go to one of these places.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/library">
              <Library aria-hidden /> Documents
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/learn">
              <GraduationCap aria-hidden /> Learn
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/plant">
              <Factory aria-hidden /> Plant
            </Link>
          </Button>
        </div>
      </div>
    </div>
  )
}

function DesktopRoutes() {
  return (
    <Switch>
      <Route path="/" component={HomePage} />
      <Route path="/library" component={LibraryPage} />
      <Route path="/library/findings" component={FindingsPage} />
      <Route path="/library/health" component={KnowledgeHealthPage} />
      <Route path="/library/captures" component={CapturesPage} />
      <Route path="/library/images" component={ImageLibraryPage} />
      <Route path="/library/captures/:id" component={CaptureDetailPage} />
      <Route path="/library/capture-sets/:id" component={CaptureSetPage} />
      <Route path="/documents">
        <Redirect to="/library" replace />
      </Route>
      <Route path="/learn" component={LearnPage} />
      <Route path="/learn/trainings/:id" component={TrainingPage} />
      <Route path="/learn/attempts/:id" component={AttemptPage} />
      <Route path="/learn/people/:id" component={PersonSkillsPage} />
      <Route path="/learn/skills" component={SkillsWorkspacePage} />
      <Route path="/learn/skills/:tab" component={SkillsWorkspacePage} />
      <Route path="/wiki" component={WikiListPage} />
      <Route path="/wiki/:id" component={WikiPage} />
      <Route path="/plant" component={PlantPage} />
      <Route path="/plant/:tab" component={PlantPage} />
      <Route path="/assets">
        <Redirect to="/plant/assets" replace />
      </Route>
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
      {/* Old addresses: these are sections of Settings now. */}
      <Route path="/templates">
        <Redirect to="/settings?tab=templates" replace />
      </Route>
      <Route path="/settings/naming">
        <Redirect to="/settings?tab=naming" replace />
      </Route>
      <Route path="/images">
        <Redirect to="/library/images" replace />
      </Route>
      <Route path="/import" component={ImportPage} />
      <Route path="/import/:jobId" component={ImportPage} />
      <Route path="/iso-9001" component={Iso9001Page} />
      {/* Developer section (Engineers and Admins). */}
      <Route path="/dev" component={DevHomePage} />
      <Route path="/dev/embeddings" component={EmbeddingsLabPage} />
      <Route path="/dev/embeddings/:tab" component={EmbeddingsLabPage} />
      <Route path="/dev/mcp" component={DevMcpPage} />
      <Route path="/dev/mcp/:tab" component={DevMcpPage} />
      <Route path="/dev/ai" component={DevAiPage} />
      <Route path="/dev/ai/:tab" component={DevAiPage} />
      <Route path="/dev/analysis" component={DevAnalysisPage} />
      <Route path="/analysis/:slug" component={AnalysisRoute} />
      {/* Old addresses of Developer pages. */}
      <Route path="/mcp">
        <Redirect to="/dev/mcp" replace />
      </Route>
      <Route path="/analysis">
        <Redirect to="/dev/analysis" replace />
      </Route>
      <Route>
        <NotFound />
      </Route>
    </Switch>
  )
}

/**
 * The desktop renders its shell at once: while sign-in is still being
 * checked the sidebar is there and the page shows skeletons, never a blank
 * spinner.
 */
function DesktopApp() {
  const { isLoading, isAuthenticated } = useConvexAuth()
  if (!isLoading && !isAuthenticated) return <SignInForm />
  return (
    <NarrowViewportGuard>
      {/* Toasts sit bottom right, left of a docked Ask panel or phone
          (AskDock sets --dock-right). The phone app mounts its own (top
          centre) in MobileShell. */}
      <Toaster richColors position="bottom-right" offset={{ bottom: 24, right: "calc(var(--dock-right, 0px) + 24px)" }} />
      <DesktopShell loading={isLoading}>
        {!isLoading && (
          <>
            <PhonePreviewHost />
            <DesktopRoutes />
          </>
        )}
      </DesktopShell>
    </NarrowViewportGuard>
  )
}

function App() {
  const [location] = useLocation()
  const isMobile = isMobilePath(location)

  // Light only until every surface passes in dark (the toggle is hidden).
  return (
    <ThemeProvider attribute="class" defaultTheme="light" forcedTheme="light" enableSystem={false}>
      {isMobile ? (
        <AuthGate>
          <MobileShell>
            <MobileRoutes />
          </MobileShell>
        </AuthGate>
      ) : (
        <DesktopApp />
      )}
    </ThemeProvider>
  )
}

export default App
