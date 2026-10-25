import type { Tour } from "../types"

// Tours for the Documents place (/library and what sits under it).
// Every target is a data-tour attribute on the real screen, in the pages
// under src/pages/desktop and the components under src/components/{docs,
// findings,insights}. Shared targets (nav-*) come from the shell.

const FIND_AND_READ: Tour = {
  id: "documents-find-and-read",
  area: "documents",
  title: "Find and read a Document",
  icon: "Library",
  summary: "Find the right instruction fast and know it is the version in use.",
  what:
    "Documents holds every controlled Document of the plant: SOPs, work instructions, manuals and more. You search by title or document ID, filter by status and type, and open a Document to read the version that is in use.",
  why:
    "On the floor, an old printout or a copy in someone's inbox can send you the wrong way. Here there is one list, and only the Published version of each Document counts. You always see which version you are reading and who approved it.",
  helps: [
    "You find the right instruction in seconds, by title or by document ID.",
    "You always read the Published version, not an old copy.",
    "You see who wrote, reviewed and approved it, and when.",
    "You see which Assets, Trainings and Wikis use it.",
  ],
  capabilities: [
    { title: "Search and filter", body: "Search by title or document ID, and filter by status, type or what was Published in the last 7 days." },
    { title: "One clear status", body: "Every Document shows its status (Draft, In review, Approved, Published, Archived) and its version." },
    { title: "Read with context", body: "A Document opens with its document ID, sign-offs, PPE and linked Assets, with the body below." },
    { title: "History", body: "Every earlier version stays on record. Superseded versions are clearly marked so nobody works from them." },
    { title: "Print and PDF", body: "Print or save the version in use. The stamp on every copy says whether it may be used." },
  ],
  audience: ["operator", "engineer", "admin"],
  minutes: 3,
  steps: [
    {
      id: "nav",
      title: "Documents",
      body: "Everything controlled lives here. You can open it from the left at any time.",
      route: "/library",
      target: "nav-documents",
      placement: "right",
    },
    {
      id: "search",
      title: "Search",
      body: "Type a few words of the title, or the document ID, for example the code on a printout.",
      target: "documents-search",
      placement: "bottom",
    },
    {
      id: "filters",
      title: "Narrow the list",
      body: "Filter by status or type, or show only what was Published in the last 7 days. Columns adds Owner, Approved by and Effective.",
      target: "documents-filters",
      placement: "bottom",
    },
    {
      id: "list",
      title: "The list",
      body: "Each row shows the document ID, type, status and version, plus the linked Assets and the next Periodic review. Click a row to open it.",
      target: "documents-list",
      placement: "top",
    },
    {
      id: "hero",
      title: "What you are reading",
      body: "The top card shows the document ID, the version, who wrote, reviewed and approved it, the PPE and the Assets it belongs to.",
      route: "{firstDocument}",
      target: "documents-read-hero",
      placement: "bottom",
    },
    {
      id: "history",
      title: "History",
      body: "Every earlier version is kept with its sign-offs. An older version is marked superseded, so nobody works from it by accident. On a narrow screen, History sits under the ... button.",
      target: "documents-history-button",
      placement: "bottom",
    },
    {
      id: "side",
      title: "Around the Document",
      body: "On the side: the Periodic review date, the Trainings and Wikis built on this Document, and how people use it.",
      target: "documents-read-side",
      placement: "left",
    },
    {
      id: "next",
      title: "What to do next",
      body: "Open a Document you use every day and check its version. Stuck on a step? Ask a question about it: the answer comes from Published Documents only.",
    },
  ],
}

const WRITE_NEW: Tour = {
  id: "documents-write-new",
  area: "documents",
  title: "Write a new Document",
  icon: "MessageSquareText",
  summary: "Write an SOP or work instruction with the assistant, or start blank or from a template.",
  what:
    "New document starts a Document in the editor. You can write it with the assistant, start blank or start from one of your templates. The document ID is made for you from the location, discipline and type.",
  why:
    "Much of how the plant runs sits in people's heads, and writing it down takes time nobody has. The assistant asks the right questions and proposes the steps, PPE and hazards, so a first Draft is there in minutes. You stay in charge of every word.",
  helps: [
    "You get from an idea to a first Draft in minutes.",
    "The assistant suggests PPE, hazards and pictures from your own library and Plant.",
    "Templates keep every Document in the same shape.",
    "The document ID follows your naming rules, so you never have to work it out.",
  ],
  capabilities: [
    { title: "Write with the assistant", body: "Say what the Document should cover. The assistant asks a few questions and fills a Draft you check before it goes in." },
    { title: "Blank or from a template", body: "Open an empty page, or start from a template with the sections already in place." },
    { title: "Rich blocks", body: "Steps, callouts, PPE, diagrams, images, linked Assets and references to other Documents. Type / to add one." },
    { title: "Details and sign-offs", body: "Title, type, location, discipline, owner, reviewer and approver are set on the right." },
    { title: "Nothing is Published by itself", body: "A new Document starts as a Draft. It counts as Knowledge only after review, approval and publishing." },
  ],
  audience: ["engineer", "admin"],
  minutes: 3,
  steps: [
    {
      id: "new",
      title: "New document",
      body: "Start here. You choose: write with the assistant, start blank, use a template, or start from a PDF.",
      route: "/library",
      target: "documents-new-button",
      placement: "bottom",
    },
    {
      id: "body",
      title: "The editor",
      body: "Write the body here. Type / for blocks such as steps, callouts, PPE, diagrams and images.",
      route: "/docs/new/compose?blank=1",
      target: "documents-compose-body",
      placement: "right",
    },
    {
      id: "assistant",
      title: "Write with the assistant",
      body: "Say what the Document should cover. The assistant asks a few questions, drafts the steps and proposes PPE, hazards and images. Nothing goes in until you insert it.",
      target: "documents-compose-assistant",
      placement: "bottom",
    },
    {
      id: "details",
      title: "The details",
      body: "Set the title, type, location and discipline. Together they make the document ID. Choose the owner, reviewer and approver here too.",
      target: "documents-compose-details",
      placement: "left",
    },
    {
      id: "create",
      title: "Create",
      body: "Create saves it as a Draft and opens it in the editor. Operators, Ask and Wikis do not see it until it is Published.",
      target: "documents-compose-create",
      placement: "bottom",
    },
    {
      id: "next",
      title: "What to do next",
      body: "Write one short work instruction for a job you know well. When it is ready, submit it for review. The tour Edit, review and publish shows what happens then.",
    },
  ],
}

const IMPORT: Tour = {
  id: "documents-import",
  area: "documents",
  title: "Bring in existing documents",
  icon: "FileUp",
  summary: "Turn a PDF into an editable Document, or keep a supplier manual as it is.",
  what:
    "Most plants already have SOPs in PDF and binders of supplier manuals. You can convert a PDF into an editable Draft, or wrap a supplier manual so Oppr controls it without changing a page.",
  why:
    "Retyping old instructions is slow and nobody does it, so the old files stay scattered and uncontrolled. Bringing them in gives every file a document ID, a status and a review, in the same place as the rest.",
  helps: [
    "Your existing SOPs become editable Drafts without retyping.",
    "Supplier manuals get a document ID, a version and a review, untouched.",
    "Every copy printed from a manual says if it is the controlled copy.",
    "Everything ends up in one list with one review flow.",
  ],
  capabilities: [
    { title: "Convert a PDF", body: "Text and images come out of a digital PDF into a new Draft in the editor. The source PDF is kept for the record." },
    { title: "Scanned PDFs", body: "A scan has no text to take out. It is attached as it is inside a new Draft, so you can write around it." },
    { title: "Wrap a supplier manual", body: "Keep a manufacturer PDF unchanged. Oppr stamps the document ID, version and status on every page." },
    { title: "Controlled copy", body: "Only the Published version of a wrapped manual says Controlled copy. Every other copy says not for use." },
  ],
  audience: ["engineer", "admin"],
  minutes: 2,
  steps: [
    {
      id: "new",
      title: "Start from New document",
      body: "Under From a PDF you choose: convert it to an editable document, or wrap a supplier manual and keep it unchanged.",
      route: "/library",
      target: "documents-new-button",
      placement: "bottom",
    },
    {
      id: "card",
      title: "Convert a PDF",
      body: "This page turns a PDF into a new Draft. You set the document ID, Assets and reviewers in the editor afterwards.",
      route: "/import",
      target: "documents-import-card",
      placement: "right",
    },
    {
      id: "drop",
      title: "Drop the file",
      body: "Drop a PDF here or click to choose one, up to 50 MB. A digital PDF opens in the editor with its text and images. A scan is attached as it is.",
      target: "documents-import-drop",
      placement: "bottom",
    },
    {
      id: "wrap",
      title: "Supplier manuals",
      body: "Wrap a supplier manual from New document. Oppr adds a band with the document ID, version and status above and below every page. It goes through review like any Document.",
    },
    {
      id: "next",
      title: "What to do next",
      body: "Pick one SOP that only exists as a PDF and convert it. Then check the text in the editor and submit it for review.",
    },
  ],
}

const REVIEW_PUBLISH: Tour = {
  id: "documents-review-publish",
  area: "documents",
  title: "Edit, review and publish",
  icon: "GitBranch",
  summary: "Start a new version, get it reviewed and approved, and publish it.",
  what:
    "A Published Document is never changed in place. You start a new version, edit it, and send it for review. The named reviewer approves it and the named approver publishes it. The old version stays in use until then.",
  why:
    "An instruction that changes without anyone checking it is a risk on the floor and a problem in an audit. Four eyes on every change, and a record of who signed off, make the Published version something people can trust.",
  helps: [
    "Operators keep working from the Published version while you edit the next one.",
    "Every sign-off is recorded with a name and a date.",
    "A Significant change flags who needs re-training.",
    "Periodic reviews remind you when a Document must be checked again.",
  ],
  capabilities: [
    { title: "New version", body: "Editing a Published Document starts a Draft of the next version. The document ID never changes." },
    { title: "Review and approval", body: "Submit for review, choose the reviewer and approver, and add a change note. Only the named people sign off." },
    { title: "Publish", body: "Publishing makes the version Knowledge. Mark it a Significant change when it changes how the work is done." },
    { title: "Proposed revisions", body: "The AI can prepare a revision from questions, Knowledge health or a Finding. It never publishes: you review it like any Draft." },
    { title: "Periodic review", body: "When the review date comes, confirm the Document is still right or start a revision." },
    { title: "PDF and print", body: "Export exactly the version on screen. The stamp shows if it is the controlled copy or not for use." },
  ],
  audience: ["engineer", "admin"],
  minutes: 4,
  steps: [
    {
      id: "revise",
      title: "Start a new version",
      body: "On a Published Document this says New version. The live version stays in use for Operators until the new one is Published.",
      route: "{firstDocument}",
      target: "documents-revise-button",
      placement: "bottom",
    },
    {
      id: "review",
      title: "Periodic review",
      body: "When the review date comes, confirm the Document is still right or start a revision. You can change the interval here too.",
      target: "documents-periodic-review",
      placement: "left",
    },
    {
      id: "insights",
      title: "Document insights",
      body: "Views, Scans and the questions people Ask about this Document. Use them to see what is unclear before the next version.",
      target: "documents-insights",
      placement: "left",
    },
    {
      id: "pdf",
      title: "PDF and print",
      body: "Exports exactly this version. A Published version prints as a controlled copy, anything else says not for use. On a narrow screen, PDF sits under the ... button.",
      target: "documents-pdf-button",
      placement: "bottom",
    },
    {
      id: "status",
      title: "Where it stands",
      body: "In the editor you always see the type, the status and the version you are working on.",
      route: "{firstDocumentEdit}",
      target: "documents-edit-status",
      placement: "bottom",
    },
    {
      id: "body",
      title: "Edit the body",
      body: "Change the text here. Write with the assistant drafts new parts, and Find pulls in images and passages from your library.",
      target: "documents-edit-body",
      placement: "right",
    },
    {
      id: "details",
      title: "Reviewer and approver",
      body: "Set who reviews and who approves in the details. Only those people sign off.",
      target: "documents-edit-details",
      placement: "left",
    },
    {
      id: "save",
      title: "Save, submit, approve, publish",
      body: "Save keeps your Draft. Next to it you find Submit for review, then Approve, then Publish, as the Document moves along.",
      target: "documents-edit-save",
      placement: "bottom",
    },
    {
      id: "next",
      title: "What to do next",
      body: "Check Home for Documents waiting for your review. When you publish, mark a Significant change only if the work itself changes: that flags re-training.",
    },
  ],
}

const FINDINGS: Tour = {
  id: "documents-findings",
  area: "documents",
  title: "Findings and Consistency check",
  icon: "SearchCheck",
  summary: "See where Published Documents contradict or repeat each other.",
  what:
    "The Consistency check compares Published Documents with each other. When two disagree or repeat the same section, it records a Finding with both passages quoted.",
  why:
    "When two instructions say different things, people on the floor guess, and Ask cannot give one clear answer. Findings show you these clashes so you can fix them before they cause a mistake.",
  helps: [
    "You catch contradictions before someone acts on the wrong one.",
    "Both passages are quoted, so you can judge in seconds.",
    "One click prepares a revision to fix it.",
    "Your library gets smaller and clearer over time.",
  ],
  capabilities: [
    { title: "Runs by itself", body: "On every publish, and every Sunday across the whole library. Drafts never take part." },
    { title: "Contradictions and overlaps", body: "Contradictions come first. Overlaps are lower priority: keep the text in one place and refer to it." },
    { title: "Fix or dismiss", body: "Prepare a revision to fix it, or dismiss it with a reason. A dismissed pair is not reported again until one side changes." },
    { title: "Warnings where it matters", body: "Open Findings show as a banner on both Documents, and Ask warns people about them." },
  ],
  audience: ["engineer", "admin"],
  minutes: 2,
  steps: [
    {
      id: "tab",
      title: "Findings",
      body: "Findings sits under Documents. The number shows how many are open.",
      route: "/library",
      target: "documents-tab-findings",
      placement: "bottom",
    },
    {
      id: "tabs",
      title: "Open, resolved, dismissed",
      body: "Open Findings need a decision. Resolved and dismissed ones stay here as a record of how each was settled.",
      route: "/library/findings",
      target: "documents-findings-tabs",
      placement: "bottom",
    },
    {
      id: "list",
      title: "Each Finding",
      body: "Each one quotes both passages. Prepare a revision to fix it, or dismiss it with a reason.",
      target: "documents-findings-list",
      placement: "right",
    },
    {
      id: "check",
      title: "How the check works",
      body: "When it last ran and what it found. The AI picks likely pairs, then code checks that both quotes really are in the Documents.",
      target: "documents-findings-check",
      placement: "left",
    },
    {
      id: "run",
      title: "Run it now",
      body: "You do not have to wait for Sunday. Run the check across the whole library when you need it.",
      target: "documents-findings-run",
      placement: "bottom",
    },
    {
      id: "next",
      title: "What to do next",
      body: "Start with the contradictions. Publishing a revision of either Document resolves the Finding.",
    },
  ],
}

const HEALTH: Tour = {
  id: "documents-knowledge-health",
  area: "documents",
  title: "Knowledge health",
  icon: "HeartPulse",
  summary: "See which Documents are never used, unclear, in conflict or due for review.",
  what:
    "Knowledge health looks at all Published Documents together. It shows which are never used, which people find unclear, which contradict or repeat each other, and which are due for a Periodic review.",
  why:
    "A library only grows, until nobody can find anything in it. This view helps you keep it small and correct: drop what nobody uses, fix what confuses people and merge what is said twice.",
  helps: [
    "You see in one place which Documents need a decision.",
    "You learn which questions no Document answers yet.",
    "You catch overdue reviews before an audit does.",
    "You can prepare a revision straight from a signal.",
  ],
  capabilities: [
    { title: "One summary", body: "Views, Scans and questions in the last 90 days, and how many questions Published Documents could answer." },
    { title: "Never used and unclear", body: "Documents nobody opens, and Documents people ask about but do not understand." },
    { title: "Contradictions and overlaps", body: "From the Consistency check, so you can fix them in one place." },
    { title: "Reviews due", body: "Periodic reviews due in the next 30 days or overdue." },
    { title: "Proposed revisions", body: "Drafts the AI prepared from these signals, waiting for normal review." },
  ],
  audience: ["engineer", "admin"],
  minutes: 3,
  steps: [
    {
      id: "tab",
      title: "Knowledge health",
      body: "It sits under Documents, next to Findings.",
      route: "/library",
      target: "documents-tab-health",
      placement: "bottom",
    },
    {
      id: "summary",
      title: "The short answer",
      body: "How many Published Documents need a decision, and how much they were used in the last 90 days.",
      route: "/library/health",
      target: "documents-health-summary",
      placement: "bottom",
    },
    {
      id: "tiles",
      title: "Jump to a list",
      body: "Each tile is a list below. Click one to go straight to it.",
      target: "documents-health-tiles",
      placement: "bottom",
    },
    {
      id: "never-used",
      title: "Never used",
      body: "Nobody opened these or asked about them. Withdraw them, or merge them into a Document people do read.",
      target: "documents-health-never-used",
      placement: "top",
    },
    {
      id: "unclear",
      title: "Asked but unclear",
      body: "People ask about these and often do not find the answer. A good place to prepare a revision.",
      target: "documents-health-unclear",
      placement: "top",
    },
    {
      id: "reviews",
      title: "Reviews due",
      body: "Periodic reviews due soon or overdue. Open the Document to confirm it or start a revision.",
      target: "documents-health-reviews",
      placement: "top",
    },
    {
      id: "proposals",
      title: "Proposed revisions",
      body: "Drafts the AI prepared from these signals. They go through normal review. The AI never publishes.",
      target: "documents-health-proposals",
      placement: "top",
    },
    {
      id: "next",
      title: "What to do next",
      body: "Look here once a week. Pick one Document from each list and decide: keep, fix, merge or withdraw.",
    },
  ],
}

const CAPTURES: Tour = {
  id: "documents-captures",
  area: "documents",
  title: "Captures from the floor",
  icon: "Aperture",
  summary: "Turn how Operators really do the work into a Draft.",
  what:
    "A Capture is an Operator recording a job on the phone while doing it: notes, voice notes, photos, video and Scans of Assets. After hand-in, the AI sorts it into Moments such as steps, safety points and tips. You turn one Capture, or a Capture set, into a Draft.",
  why:
    "The people who know the job best rarely write SOPs, and nobody writes well on a phone with gloves on. Recording is easy. The writing then starts from what really happens on the floor, not from memory at a desk.",
  helps: [
    "Operators share their know-how without writing a word.",
    "You start a Draft from real evidence: photos, voice notes and Scans.",
    "Comparing Captures of the same job shows where people work differently.",
    "Nothing in a Capture is Published: it always goes through review.",
  ],
  capabilities: [
    { title: "Record on the phone", body: "Notes, voice notes, photos, video and Scans of Assets, in one stretch." },
    { title: "Moments", body: "After hand-in the AI finds steps, safety points, quality checks, tips, problems and open questions, each linked to its evidence." },
    { title: "Capture sets", body: "Combine Captures of the same job into one step list and see the Variations between them." },
    { title: "Make a Draft", body: "Turn a Capture or a Capture set into a Draft SOP, work instruction or LMRA, or a proposal for a LOGS checklist. It then goes through normal review." },
    { title: "Privacy", body: "A Capture is visible only to its author until it is handed in. After that, Engineers can see it." },
  ],
  audience: ["engineer", "admin"],
  minutes: 3,
  steps: [
    {
      id: "phone",
      title: "Recorded on the phone",
      body: "Operators record a Capture in the phone app while they work. Open the phone here to try it.",
      route: "/library",
      target: "nav-phone",
      placement: "right",
    },
    {
      id: "tab",
      title: "Captures",
      body: "Handed-in Captures land under Documents, in Captures.",
      target: "documents-tab-captures",
      placement: "bottom",
    },
    {
      id: "list",
      title: "All Captures",
      body: "Search and filter by job or person. Open a Capture to see its Entries and the Moments the AI found. Select two or more of the same job to combine them.",
      route: "/library/captures",
      target: "documents-captures-list",
      placement: "top",
    },
    {
      id: "sets-link",
      title: "Capture sets",
      body: "Capture sets combine several Captures of the same job into one step list.",
      target: "documents-captures-sets-link",
      placement: "left",
    },
    {
      id: "sets",
      title: "Variations",
      body: "A Capture set shows which Captures support each step, and where people do a step differently. You decide which way becomes the standard.",
      route: "/library/captures?tab=sets",
      target: "documents-captures-sets",
      placement: "top",
    },
    {
      id: "next",
      title: "What to do next",
      body: "Open a handed-in Capture and choose Make a Draft. The Draft goes through review like any Document, and a Training can follow once it is Published.",
    },
  ],
}

const IMAGES: Tour = {
  id: "documents-image-library",
  area: "documents",
  title: "Image library",
  icon: "Image",
  summary: "Find and reuse the plant's pictures and diagrams in Documents and Trainings.",
  what:
    "The Image library holds every picture the plant can reuse in Documents and Trainings. You find pictures by words or by a photo, filter by kind, tag, collection, Area or Asset, and see where each one is used.",
  why:
    "The same photo of a die head gets taken ten times and stored in ten places. One library means people reuse the good picture, and you know which Documents change when a picture does.",
  helps: [
    "You find the right picture by describing it, or by showing a photo.",
    "New pictures get a description and tags from the AI, so nobody has to type them.",
    "You see where each picture is used before you change it.",
    "You can tidy up duplicates and unused pictures in bulk.",
  ],
  capabilities: [
    { title: "Search by words or photo", body: "Describe what you look for, or use a photo to find pictures that look like it." },
    { title: "Filters", body: "Favorites, recently used, not used in a Document and possible duplicates, plus kind, collection, Area, Asset and tag." },
    { title: "Add pictures", body: "Drop files anywhere on the page. Each gets an AI description and tags. Adding and editing need an Engineer." },
    { title: "Diagrams", body: "The diagrams in your Documents are listed in their own tab." },
  ],
  audience: ["engineer", "admin"],
  minutes: 2,
  steps: [
    {
      id: "tab",
      title: "Images",
      body: "The Image library sits under Documents.",
      route: "/library",
      target: "documents-tab-images",
      placement: "bottom",
    },
    {
      id: "search",
      title: "Search by words",
      body: "Describe what you need, for example a hot die head with a face shield. The best matches come first.",
      route: "/library/images",
      target: "documents-images-search",
      placement: "bottom",
    },
    {
      id: "photo",
      title: "Search by photo",
      body: "Have a photo from the floor? Use it to find pictures that look like it.",
      target: "documents-images-photo",
      placement: "bottom",
    },
    {
      id: "filters",
      title: "Filters",
      body: "Show favorites, recently used, unused or look-alike pictures, or filter by kind, collection, Area, Asset and tag.",
      target: "documents-images-filters",
      placement: "right",
    },
    {
      id: "grid",
      title: "The pictures",
      body: "Click a picture to see its description, tags and where it is used. Select several to tidy them up together.",
      target: "documents-images-grid",
      placement: "top",
    },
    {
      id: "add",
      title: "Add pictures",
      body: "Add pictures here or drop them anywhere on the page. The AI describes and tags each one.",
      target: "documents-images-add",
      placement: "bottom",
    },
    {
      id: "diagrams",
      title: "Diagrams",
      body: "The diagrams in your Documents are listed here.",
      target: "documents-images-diagrams",
      placement: "bottom",
    },
    {
      id: "next",
      title: "What to do next",
      body: "Next time you write a step, search here before you take a new photo.",
    },
  ],
}

const ISO_9001: Tour = {
  id: "documents-iso-9001",
  area: "documents",
  title: "ISO 9001 view",
  icon: "BadgeCheck",
  summary: "See what ISO 9001 asks for and what Oppr already does about it.",
  what:
    "The ISO 9001 page lists the ISO 9001:2015 requirements that Oppr Knowledge touches. For each it says in plain words what an auditor wants to see, how Oppr helps, and what is still your own process.",
  why:
    "Before an audit, people lose days collecting evidence from binders and inboxes. This page shows what is already in place, with live numbers, and a short list of what to clean up first.",
  helps: [
    "You see where you stand before the auditor does.",
    "Live numbers show what still needs attention.",
    "Each requirement is explained in plain language.",
    "You can print the page as your own checklist.",
  ],
  capabilities: [
    { title: "Built in, Supported, Your process", body: "Each requirement says whether Oppr enforces it, gives you the tools, or leaves it to your quality system." },
    { title: "Before your audit", body: "A checklist with live counts: overdue reviews, open sign-offs, open Findings, re-training and more." },
    { title: "Master list", body: "Download the master list of controlled Documents as a CSV from Documents." },
    { title: "Print", body: "Print the page or save it as a PDF for your audit file." },
  ],
  audience: ["engineer", "admin"],
  minutes: 3,
  steps: [
    {
      id: "intro",
      title: "What this page is",
      body: "For a quality or plant manager preparing for an audit. Oppr does not certify anything: it shows where it carries part of your quality system.",
      route: "/iso-9001",
      target: "documents-iso-intro",
      placement: "bottom",
    },
    {
      id: "summary",
      title: "Coverage per clause",
      body: "How many requirements are Built in, Supported or Your process, per clause.",
      target: "documents-iso-summary",
      placement: "top",
    },
    {
      id: "audit",
      title: "Before your audit",
      body: "A checklist with live numbers. Each line links to the place where you fix it.",
      target: "documents-iso-audit",
      placement: "top",
    },
    {
      id: "clauses",
      title: "Each requirement",
      body: "Jump to a clause. Each requirement says what an auditor wants to see, how Oppr helps, and what stays yours.",
      target: "documents-iso-clauses",
      placement: "bottom",
    },
    {
      id: "print",
      title: "Print or save",
      body: "Print the page, or save it as a PDF for your audit file.",
      target: "documents-iso-print",
      placement: "bottom",
    },
    {
      id: "master-list",
      title: "Master list",
      body: "ISO 9001 asks for a list of your controlled Documents. Download it here as a CSV, with status, version, owner and next review.",
      route: "/library",
      target: "documents-master-list",
      placement: "bottom",
    },
    {
      id: "next",
      title: "What to do next",
      body: "Work through Before your audit until every line is done. Knowledge health helps with the reviews and Findings.",
    },
  ],
}

export const DOCUMENTS_TOURS: Tour[] = [
  FIND_AND_READ,
  WRITE_NEW,
  IMPORT,
  REVIEW_PUBLISH,
  FINDINGS,
  HEALTH,
  CAPTURES,
  IMAGES,
  ISO_9001,
]
