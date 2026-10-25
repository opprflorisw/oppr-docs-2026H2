// Content for the MCP page (docs/adr/0004). Everything here is illustrative:
// the scenarios replay what an outside assistant would do over MCP, with the
// plant's real seeded codes, so a visitor can step through them. The live
// parts of the page (endpoint, tools, keys, audit log) come from Convex.

export type Scope = "read:published" | "read:people" | "write:drafts" | "write:signals"
/** Where the model runs. "none" is a system (CMMS, ERP) calling tools with no model at all. */
export type ModelHost = "customer-cloud" | "self-hosted" | "oppr" | "none"

export const SCOPE_INFO: Record<
  Scope,
  { label: string; allows: string; tools: string[]; risk: string; write: boolean }
> = {
  "read:published": {
    label: "Read Published",
    allows: "Search and read Published versions, the naming structure and the Asset list. Drafts are never visible.",
    tools: ["oppr_search", "oppr_get_document", "oppr_get_structure", "oppr_find_similar", "oppr_list_assets"],
    risk: "Low. The same knowledge an Operator can read on the floor.",
    write: false,
  },
  "read:people": {
    label: "Read people",
    allows: "Skill coverage per line and Training records. This is personal data, so it is a separate scope.",
    tools: ["oppr_skill_coverage", "oppr_training_records"],
    risk: "Medium. Names and qualifications leave Oppr. Give it only to assistants your privacy rules allow.",
    write: false,
  },
  "write:drafts": {
    label: "Write drafts",
    allows: "Create new drafts, marked \"Imported via MCP\". An Engineer reviews them like any draft.",
    tools: ["oppr_import_draft"],
    risk: "Low to medium. Drafts change nothing until a person publishes them, but many drafts cost review time.",
    write: true,
  },
  "write:signals": {
    label: "Write signals",
    allows: "Report an unclear step or an incident against a Published document.",
    tools: ["oppr_report_signal"],
    risk: "Low. Signals feed Document insights and Knowledge health; they never change a document.",
    write: true,
  },
}

export const SCOPES = Object.keys(SCOPE_INFO) as Scope[]

export const AREAS = [
  { code: "MIX", label: "Hall 1 · Mixing" },
  { code: "EXT", label: "Hall 2 · Extrusion" },
  { code: "QCL", label: "Quality lab" },
]

export const MODEL_LOCATIONS: {
  id: Exclude<ModelHost, "none">
  title: string
  examples: string
  documentsGo: string
  pays: string
  bestFor: string
  limits: string
  /** A line under the column, for what sets it apart. */
  note?: string
}[] = [
  {
    id: "customer-cloud",
    title: "Your own assistant",
    examples: "Claude, ChatGPT or Copilot, in your company's cloud tenant.",
    documentsGo: "Into your AI provider's cloud, under the contract you already have. Oppr receives only the structured result.",
    pays: "You, on your existing AI subscription.",
    bestFor: "Big one-off jobs: onboarding hundreds of files, cleanup, translation, long documents.",
    limits: "Your provider's data policy applies, not Oppr's. Check what your tenant may process.",
  },
  {
    id: "self-hosted",
    title: "A model on your own site",
    examples: "Self-hosted, for example Ollama with Open WebUI or LibreChat, on a server in the plant.",
    documentsGo: "Nowhere. Files stay on site. Only structured results (codes, intervals, short passages) reach Oppr.",
    pays: "You: the hardware and someone to run it.",
    bestFor: "Confidential supplier manuals, export-controlled drawings, sites without cloud AI.",
    limits: "Small local models are weaker at long documents and careful rewriting. Expect more review.",
  },
  {
    id: "oppr",
    title: "Oppr's own AI",
    examples: "Ask, Guided creation and the Consistency check, built into Oppr.",
    documentsGo: "Only what is already in Oppr. Answers use Published versions and cite their sources.",
    pays: "Included in Oppr. We run it.",
    bestFor: "Daily use on the floor: grounded answers, Trainings, Wikis, checking new versions for conflicts.",
    limits: "Works on knowledge inside Oppr only. It is not built to clean up your legacy file share.",
    note: "It does not use MCP. It checks what arrives through MCP once it is inside Oppr: the Consistency check on publish, and Ask.",
  },
]

export interface Step {
  /** Who acts in this step. */
  who: "person" | "assistant" | "system"
  /** A short chat line, as said in the assistant or the system. */
  say?: string
  /** A tool call over MCP. */
  call?: { tool: string; args: Record<string, unknown>; result?: string }
  /** The panel on the right: what appears or is logged in Oppr. */
  oppr: { title: string; lines: string[]; tone?: "neutral" | "draft" | "log" | "human" | "signal" | "none" }
  /** S1 only: which stage of the counts funnel this step reaches. */
  funnel?: number
}

export interface Scenario {
  id: string
  title: string
  who: string
  blurb: string
  icon: "files" | "lock" | "moon" | "wrench" | "clipboard"
  model: ModelHost
  modelWhy: string
  /** Where Oppr's own AI takes over inside Oppr, after the MCP part. Also highlights the scenario for "Oppr's own AI". */
  opprAi?: string
  scopes: Scope[]
  areas: string
  staysHuman: string[]
  notBuilt: string[]
  funnel?: { label: string; value: number }[]
  steps: Step[]
}

export const SCENARIOS: Scenario[] = [
  {
    id: "onboard",
    title: "300 legacy documents to onboard",
    who: "Process engineer with the company's own assistant",
    blurb: "A file share full of Word and PDF files becomes clean drafts in Oppr, ready for review.",
    icon: "files",
    model: "customer-cloud",
    modelWhy: "Long documents, many files and rewriting: the big cloud models do this best, on the budget you already have.",
    opprAi: "Step 8: after publish, the Consistency check compares each new version with Published knowledge.",
    scopes: ["read:published", "write:drafts"],
    areas: "MIX, EXT, QCL",
    staysHuman: ["Reviewing and approving each draft", "Publishing", "Deciding which version wins when two disagree"],
    notBuilt: ["OCR and cleanup of scans", "A bulk classifier for 300 files", "Translation of the German supplier texts", "Merging duplicate versions inside the file share (300 to 212)"],
    funnel: [
      { label: "Files in the folder", value: 300 },
      { label: "Unique after merging versions", value: 212 },
      { label: "Already in Oppr", value: 41 },
      { label: "Drafts imported", value: 171 },
    ],
    steps: [
      {
        who: "person",
        say: "Here is our old Q-drive folder \"Procedures 2009-2024\". Prepare everything for Oppr. Skip what Oppr already has.",
        oppr: { title: "Nothing yet", lines: ["The files are in your assistant, not in Oppr."], tone: "none" },
        funnel: 0,
      },
      {
        who: "assistant",
        say: "First I will fetch how Oppr is organised, so I can map every file onto it.",
        call: { tool: "oppr_get_structure", args: {}, result: "3 areas (MIX, EXT, QCL), 4 disciplines, 4 types, 7 Assets" },
        oppr: {
          title: "Audit log",
          lines: ["oppr_get_structure, ok", "Key: Sanne's Claude (onboarding)"],
          tone: "log",
        },
        funnel: 0,
      },
      {
        who: "assistant",
        say: "Read 300 files. Many are copies: \"v2\", \"final\", \"final-NEW\". Merged versions of the same procedure, kept the newest.",
        oppr: { title: "Nothing in Oppr", lines: ["Reading, OCR and merging happened in your assistant."], tone: "none" },
        funnel: 1,
      },
      {
        who: "assistant",
        say: "Classified each file. Example: \"Kleurwissel lijn 2.docx\" is area EXT, discipline OPS, type SOP.",
        oppr: { title: "Nothing in Oppr", lines: ["Classification is the assistant's work, against Oppr's structure."], tone: "none" },
        funnel: 1,
      },
      {
        who: "assistant",
        say: "Checking each one against Published knowledge.",
        call: {
          tool: "oppr_find_similar",
          args: { title: "Kleurwissel lijn 2", text: "Stop dosing and let the hopper run empty. Purge with 25 kg PE100 natural..." },
          result: "Overlaps: EXT-OPS-SOP-0001 Colour and product changeover on extrusion line 2",
        },
        oppr: {
          title: "Audit log",
          lines: ["212 x oppr_find_similar, ok", "41 files are already Published and are skipped. Overlaps are noted for the reviewer."],
          tone: "log",
        },
        funnel: 2,
      },
      {
        who: "assistant",
        say: "Rewrote the remaining files into Oppr blocks: steps, warnings, PPE, Assets. Importing as drafts.",
        call: {
          tool: "oppr_import_draft",
          args: {
            title: "Cleaning the vacuum tank VAC-203",
            type: "work_instruction",
            area: "EXT",
            discipline: "MNT",
            assetCodes: ["VAC-203"],
            sourceNote: "Q-drive/Procedures 2016/Vacuumbak.docx",
            blocks: "[12 blocks]",
          },
          result: "Draft created, status Draft, origin MCP",
        },
        oppr: {
          title: "Documents: 171 new drafts",
          lines: ["Each marked \"Imported via MCP\"", "Status: Draft. Not visible to Ask, Wikis or Trainings.", "Source file name kept on the draft"],
          tone: "draft",
        },
        funnel: 3,
      },
      {
        who: "system",
        say: "In Oppr, Sanne opens the drafts, fixes two steps and sends them for review.",
        oppr: {
          title: "Engineer review",
          lines: ["Reviewer approves", "Engineer publishes", "MCP could not do either of these."],
          tone: "human",
        },
        funnel: 3,
      },
      {
        who: "system",
        say: "On publish, Oppr's Consistency check compares each new version with existing Published knowledge.",
        oppr: {
          title: "Findings",
          lines: ["1 contradiction: purge with 25 kg PE100 natural vs purge compound PX-4400 for about 15 minutes in EXT-OPS-SOP-0001", "Banner on both documents until an Engineer resolves it"],
          tone: "signal",
        },
        funnel: 3,
      },
    ],
  },
  {
    id: "manuals",
    title: "Confidential supplier manuals",
    who: "Maintenance engineer with a model on site",
    blurb: "Supplier manuals never leave the plant. Only codes, intervals and short passages reach Oppr.",
    icon: "lock",
    model: "self-hosted",
    modelWhy: "The supplier contract forbids sending the manuals to a cloud. A local model keeps them on site.",
    scopes: ["read:published", "write:drafts"],
    areas: "EXT",
    staysHuman: ["Checking the extracted intervals against the manual", "Reviewing and publishing the new work instruction"],
    notBuilt: ["An on-premise AI install of Oppr", "A PDF extraction pipeline per supplier", "Contract-specific data handling"],
    steps: [
      {
        who: "person",
        say: "Open WebUI, local model: \"Go through the Krauss KX-60 manual. List asset codes, maintenance intervals and safety warnings.\"",
        oppr: { title: "Nothing yet", lines: ["The PDF is on the plant's server."], tone: "none" },
      },
      {
        who: "assistant",
        say: "Found: screen pack change every 500 operating hours, gearbox oil every 4,000 hours, 9 safety warnings. Applies to the extruder EXL-201.",
        oppr: { title: "Nothing in Oppr", lines: ["Extraction ran on the local model. No document left the site."], tone: "none" },
      },
      {
        who: "assistant",
        call: {
          tool: "oppr_find_similar",
          args: { title: "Krauss KX-60 maintenance intervals", text: "Screen pack change every 500 operating hours on EXL-201. Gearbox oil every 4,000 hours..." },
          result: "Verdict new. Closest: EXT-MNT-MAN-0001 Krauss KX-60 manual (wrapped, Published), similarity 0.78",
        },
        oppr: { title: "Audit log", lines: ["oppr_find_similar, ok", "Key: Plant server (Open WebUI)"], tone: "log" },
      },
      {
        who: "assistant",
        say: "The manual itself is already wrapped in Oppr. What is missing is a short work instruction for the 500 hour interval. Importing that as a draft, with the warnings as callouts.",
        call: {
          tool: "oppr_import_draft",
          args: {
            title: "Screen pack change interval on EXL-201",
            type: "work_instruction",
            area: "EXT",
            discipline: "MNT",
            assetCodes: ["EXL-201"],
            sourceNote: "Extracted on site from the Krauss KX-60 manual, chapter 6",
            blocks: "[7 blocks]",
          },
          result: "Draft created, status Draft, origin MCP",
        },
        oppr: {
          title: "Documents: 1 new draft",
          lines: ["Linked to Asset EXL-201", "Steps and warnings as Oppr blocks", "The supplier PDF never left the site"],
          tone: "draft",
        },
      },
      {
        who: "system",
        say: "Mark checks the intervals against the paper manual, sends the draft for review and publishes it.",
        oppr: { title: "Engineer review", lines: ["Mark Jansen approves and publishes", "Scanning EXL-201 now shows the new work instruction"], tone: "human" },
      },
    ],
  },
  {
    id: "shift",
    title: "Shift leader's assistant tonight",
    who: "Night shift leader in Copilot",
    blurb: "Who can run line 2 tonight, and how long do they purge before a restart? Answered from Oppr, with sources.",
    icon: "moon",
    model: "customer-cloud",
    modelWhy: "The shift leader already plans in Copilot. A short question needs no special model.",
    scopes: ["read:published", "read:people"],
    areas: "EXT",
    staysHuman: ["Making the roster", "Signing off a person on a Skill"],
    notBuilt: ["A rostering screen", "A chat app for shift leaders"],
    steps: [
      {
        who: "person",
        say: "Who can run line 2 tonight, and how long do we purge before a restart?",
        oppr: { title: "Nothing yet", lines: [], tone: "none" },
      },
      {
        who: "assistant",
        call: { tool: "oppr_skill_coverage", args: { profile: "Line 2 operator" }, result: "Meets every target: Jan de Vries (night shift), Fatima El Amrani (early shift). Not there yet: Ahmed Yilmaz (late shift), Lockout/tagout line 2 expired" },
        oppr: { title: "Audit log", lines: ["oppr_skill_coverage, ok", "Personal data: read:people scope"], tone: "log" },
      },
      {
        who: "assistant",
        call: { tool: "oppr_search", args: { query: "purge before restart", area: "EXT" }, result: "EXT-OPS-SOP-0001 v1, Procedure: purge with PX-4400 at 190 °C until the melt runs clean, about 15 minutes" },
        oppr: { title: "Audit log", lines: ["oppr_search, ok", "Published versions only"], tone: "log" },
      },
      {
        who: "assistant",
        say: "On the night shift, Jan de Vries meets every target for Line 2 operator. Ahmed Yilmaz is on the late shift, and his Lockout/tagout line 2 has expired. Purge with PX-4400 at 190 °C until the melt runs clean, about 15 minutes. Source: EXT-OPS-SOP-0001 v1.",
        oppr: { title: "Nothing changes in Oppr", lines: ["Read-only. The answer cites the Published version."], tone: "none" },
      },
    ],
  },
  {
    id: "cmms",
    title: "Maintenance system loop",
    who: "The CMMS (work orders) over MCP",
    blurb: "A work order fetches the right procedure by asset code. A technician's note comes back as a signal.",
    icon: "wrench",
    model: "none",
    modelWhy: "No model at all: the CMMS calls the tools directly with its own key, like any other integration.",
    opprAi: "Step 4: inside Oppr, an Engineer asks Oppr's AI to prepare a revision from the signal.",
    scopes: ["read:published", "write:signals"],
    areas: "EXT",
    staysHuman: ["Deciding whether step 8 is rewritten", "Publishing the revision"],
    notBuilt: ["A connector per CMMS brand", "Work order screens inside Oppr"],
    steps: [
      {
        who: "system",
        say: "Work order 24-1187: screen pack change on EXL-201.",
        call: { tool: "oppr_search", args: { query: "screen pack change EXL-201" }, result: "EXT-MNT-SOP-0001 Changing the screen pack on EXL-201 (Published v1)" },
        oppr: { title: "Audit log", lines: ["oppr_search, ok", "Key: CMMS work orders"], tone: "log" },
      },
      {
        who: "system",
        say: "The work order shows the procedure link and EXT-HSE-SOP-0001 (lockout) as a prerequisite.",
        oppr: { title: "Nothing changes in Oppr", lines: ["The technician opens the Published version on a phone."], tone: "none" },
      },
      {
        who: "person",
        say: "Technician closes the order with a note: \"step 8 unclear, which torque for the clamp bolts?\"",
        call: {
          tool: "oppr_report_signal",
          args: { documentCode: "EXT-MNT-SOP-0001", kind: "unclear", section: "Changing the screens", note: "Step 8: which torque for the clamp bolts? The step only points to the manual." },
          result: "Signal recorded on EXT-MNT-SOP-0001 v1",
        },
        oppr: { title: "Document insights", lines: ["EXT-MNT-SOP-0001: \"Changing the screens\" marked unclear", "Counts in Knowledge health"], tone: "signal" },
      },
      {
        who: "system",
        say: "In Oppr, an Engineer asks Oppr's AI to prepare a revision from the insights.",
        oppr: { title: "Proposed revision", lines: ["Before and after for step 8, with the reason linked to the signal", "Mark Jansen reviews and publishes"], tone: "human" },
      },
    ],
  },
  {
    id: "audit",
    title: "Audit preparation",
    who: "Quality manager's assistant",
    blurb: "Pull Training records and review dates for the wall thickness SOP before the ISO audit. Read-only.",
    icon: "clipboard",
    model: "customer-cloud",
    modelWhy: "The quality manager builds the audit file in her own assistant, next to the other evidence.",
    scopes: ["read:published", "read:people"],
    areas: "QCL",
    staysHuman: ["Answering the auditor", "Any change to the SOP"],
    notBuilt: ["An audit report builder", "Export formats for each certification body"],
    steps: [
      {
        who: "person",
        say: "Prepare the evidence for QCL-QA-SOP-0001 for next week's audit.",
        oppr: { title: "Nothing yet", lines: [], tone: "none" },
      },
      {
        who: "assistant",
        call: { tool: "oppr_get_document", args: { code: "QCL-QA-SOP-0001" }, result: "v1, Published 24 March 2026, next review 24 March 2027, approved by Ruud Kok" },
        oppr: { title: "Audit log", lines: ["oppr_get_document, ok"], tone: "log" },
      },
      {
        who: "assistant",
        call: { tool: "oppr_training_records", args: { documentCode: "QCL-QA-SOP-0001" }, result: "Kevin Mulder passed QCL-TRN-0001 v1 on 9 September 2026, score 100%" },
        oppr: { title: "Audit log", lines: ["oppr_training_records, ok", "Personal data: read:people scope"], tone: "log" },
      },
      {
        who: "assistant",
        say: "Evidence table ready: Published version, approver, review date and who is trained on it, with links back to Oppr.",
        oppr: { title: "Nothing changes in Oppr", lines: ["Read-only. Training records stay the proof in Oppr."], tone: "none" },
      },
    ],
  },
]
