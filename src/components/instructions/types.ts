// Instructions: one guided tour per function of the app.
// A tour has an introduction page (what, why, how it helps, what it can do)
// and then walks the person through the real screens step by step.
// Steps point at elements marked with data-tour="<id>" in the app.

export type Area = "start" | "documents" | "learn" | "wiki" | "plant" | "settings" | "developer"

export type Audience = "operator" | "engineer" | "admin"

export type Placement = "top" | "bottom" | "left" | "right" | "center"

export type TourStep = {
  /** Unique within the tour. */
  id: string
  title: string
  /** One to three short sentences. No em dashes. */
  body: string
  /**
   * Where this step happens. Omit to stay on the current page.
   * Use a concrete route, or "{firstDocument}", "{firstWiki}", "{firstTraining}",
   * "{firstAsset}" as placeholders the engine resolves to a real item.
   */
  route?: string
  /** Value of a data-tour attribute on the page. Omit for a centred card. */
  target?: string
  placement?: Placement
  /**
   * The data-tour target that appears once the highlighted element is
   * pressed (the Ask panel, the Wiki editor). When it is not on screen as
   * the person presses Next, the engine presses the highlighted element for
   * them, so the next steps have something to point at.
   */
  opens?: string
  /** Only shown to these people. Omit for everyone who can take the tour. */
  audience?: Audience[]
}

export type Capability = {
  title: string
  body: string
}

export type Tour = {
  /** Used in the URL: /instructions/<id> */
  id: string
  area: Area
  title: string
  /** lucide-react icon name, for example "Library". */
  icon: string
  /** One line for the overview card. */
  summary: string
  /** Introduction page: what this function does. */
  what: string
  /** Why it exists: the problem in the plant it answers. */
  why: string
  /** How it will help you, as short benefits. */
  helps: string[]
  /** What it can do, on a high level. */
  capabilities: Capability[]
  /** Who the tour is for. Operators never see Engineer-only tours. */
  audience: Audience[]
  /** Rough minutes to complete. */
  minutes: number
  /**
   * The tour shows the person's own data, so they should check in before
   * starting (the top bar is dimmed during a tour). Tours with a "{me}"
   * route count as this too.
   */
  needsCheckIn?: boolean
  steps: TourStep[]
}
