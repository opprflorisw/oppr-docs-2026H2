// ISO 9001:2015 requirements that Oppr Knowledge touches, paraphrased in our
// own words (the standard's text is copyrighted; cite clause numbers only).
// Status is deliberately conservative: "built" only where the control is
// enforced by the system itself, not where it merely can be done in it.

export type IsoStatus = "built" | "supported" | "process"

export type EvidenceKey =
  | "published"
  | "awaitingSignoff"
  | "withReviewDate"
  | "reviewsOverdue"
  | "withdrawn"
  | "wrappedPublished"
  | "trainingsPublished"
  | "trainingsNeedReview"
  | "trainingRecords"
  | "signedOff"
  | "retrainNeeded"
  | "expired"
  | "assignmentsOverdue"
  | "capturesProcessed"
  | "openFindings"
  | "resolvedFindings"

export interface IsoRequirement {
  id: string
  clause: string
  title: string
  /** What an auditor wants to see, in plain language. */
  auditor: string
  /** How Oppr helps: the concrete features. */
  oppr: string[]
  /** What stays with the customer, when anything does. */
  yours?: string
  status: IsoStatus
  link?: { href: string; label: string }
  evidence?: EvidenceKey[]
}

export interface IsoClause {
  number: string
  title: string
  requirements: IsoRequirement[]
}

export const STATUS_META: Record<IsoStatus, { label: string; explain: string }> = {
  built: {
    label: "Built in",
    explain: "The system enforces or records it. You show it to the auditor in Oppr.",
  },
  supported: {
    label: "Supported",
    explain: "Oppr gives you the tools and the evidence. You still run the process.",
  },
  process: {
    label: "Your process",
    explain: "Outside Oppr. Keep it in your quality system; Oppr can hold the controlled Document.",
  },
}

export const CLAUSES: IsoClause[] = [
  {
    number: "4",
    title: "Context of the organization",
    requirements: [
      {
        id: "4.1",
        clause: "4.1, 4.2",
        title: "Context and interested parties",
        auditor:
          "You know which internal and external issues matter for your quality, who your interested parties are and what they need from you, and you look at this again from time to time.",
        oppr: ["The outcome can be a Published Document with an owner and a Periodic review date, like any other."],
        yours: "The analysis itself, usually done by management.",
        status: "process",
      },
      {
        id: "4.4",
        clause: "4.3, 4.4",
        title: "Scope and processes of the quality system",
        auditor:
          "A clear scope, the processes you need with their owners, inputs and outputs, and the documents that keep those processes running as planned.",
        oppr: [
          "Every Document is filed by area, discipline and type in its naming code, so the library follows your process map.",
          "Each Document names an owner, a reviewer and an approver.",
          "Wikis give each audience an overview of the Published Knowledge in its Scope.",
        ],
        yours: "Defining the scope and the process map.",
        status: "supported",
        link: { href: "/library", label: "Open Documents" },
      },
    ],
  },
  {
    number: "5",
    title: "Leadership",
    requirements: [
      {
        id: "5.1",
        clause: "5.1",
        title: "Leadership and commitment",
        auditor: "Top management takes visible ownership of the quality system and its results.",
        oppr: ["Management can use this page and Knowledge health as a quick read on the state of controlled Knowledge."],
        yours: "Commitment, resources and accountability.",
        status: "process",
      },
      {
        id: "5.2",
        clause: "5.2",
        title: "Quality policy",
        auditor: "A quality policy exists, it is kept as documented information, and people know it and can find it.",
        oppr: [
          "Publish the policy as a controlled Document: versioned, approved, with a Periodic review.",
          "Ask answers questions about it with the policy as the source.",
          "A Training can check that people understand it.",
        ],
        yours: "Writing the policy and making it part of daily work.",
        status: "supported",
        link: { href: "/library", label: "Open Documents" },
      },
      {
        id: "5.3",
        clause: "5.3",
        title: "Roles, responsibilities and authorities",
        auditor: "Responsibilities are assigned, communicated and understood.",
        oppr: [
          "Document owner, reviewer and approver are named people, and the approver can never be the reviewer.",
          "Skill profiles state what each role must be able to do, at which level.",
        ],
        yours: "Your organisation chart and job descriptions.",
        status: "supported",
        link: { href: "/learn/skills/profiles", label: "Open Skill profiles" },
      },
    ],
  },
  {
    number: "6",
    title: "Planning",
    requirements: [
      {
        id: "6.1",
        clause: "6.1",
        title: "Risks and opportunities",
        auditor: "You have identified risks and opportunities, planned actions for them, and you check that the actions work.",
        oppr: [
          "LMRA is a Document type, and work instructions carry safety icons and warning callouts in the steps.",
          "The Skill matrix shows where only one person can do a job, per shift, so a knowledge risk becomes visible.",
          "Knowledge health shows Documents that nobody uses or that people find unclear.",
        ],
        yours: "The risk register and the decisions on it.",
        status: "supported",
        link: { href: "/learn?tab=matrix", label: "Open Skill matrix" },
      },
      {
        id: "6.2",
        clause: "6.2",
        title: "Quality objectives",
        auditor: "Measurable quality objectives, with a plan, an owner and a deadline.",
        oppr: ["Not tracked in Oppr. Training and Knowledge health numbers can feed an objective about competence or documentation."],
        yours: "Setting and tracking the objectives.",
        status: "process",
      },
    ],
  },
  {
    number: "7",
    title: "Support",
    requirements: [
      {
        id: "7.1.5",
        clause: "7.1.5",
        title: "Monitoring and measuring resources",
        auditor: "Measuring equipment is fit for use, calibrated or verified, and you keep the proof.",
        oppr: ["The calibration procedure can be a Published Document linked to the Asset, so it is one Scan away."],
        yours: "Calibration records and schedules, usually in your maintenance system.",
        status: "process",
        link: { href: "/assets", label: "Open Assets" },
      },
      {
        id: "7.1.6",
        clause: "7.1.6",
        title: "Organizational knowledge",
        auditor:
          "You know which knowledge your processes need, it is kept up to date and available, and you have a way to capture new knowledge and to not lose it when people leave.",
        oppr: [
          "Published Documents are the single source: Ask, Wikis and Trainings use Published Knowledge only.",
          "Captures record how experienced people do the job on the floor; an Engineer turns them into a Draft.",
          "Ask answers in plain language and cites the Documents it used.",
          "Wikis summarize the Knowledge for one audience and regenerate when a source changes.",
          "The Skill matrix shows knowledge that sits with one person only.",
        ],
        status: "built",
        link: { href: "/library/captures", label: "Open Captures" },
        evidence: ["published", "capturesProcessed"],
      },
      {
        id: "7.2",
        clause: "7.2",
        title: "Competence",
        auditor:
          "For each role you know what competence is needed, people are competent through training or experience, gaps are closed and the result is checked, and you keep records as proof.",
        oppr: [
          "Skill profiles set target levels per role; the Skill matrix shows gaps, expiring Skills and re-training.",
          "Trainings have Learning objectives traced to Published Documents, and each Attempt is generated fresh, so people cannot share answers.",
          "A Training record keeps who passed, when, which questions they got and how they answered.",
          "Levels 2 and 3 need an Engineer sign-off with evidence of observed work. Skills can have a validity period.",
        ],
        status: "built",
        link: { href: "/learn?tab=matrix", label: "Open Skill matrix" },
        evidence: ["trainingRecords", "signedOff", "expired"],
      },
      {
        id: "7.3",
        clause: "7.3",
        title: "Awareness",
        auditor:
          "People know the quality policy, the objectives that concern them, how their work affects quality, and what happens when they do not follow the rules.",
        oppr: [
          "A Scan at an Asset shows the Published Documents for that machine.",
          "Ask answers questions on the floor, Anonymous by default.",
          "Publishing a Training assigns it to its audience with a due date.",
        ],
        yours: "Auditors often check awareness by talking to people on the floor.",
        status: "supported",
        link: { href: "/floor", label: "Open Floor simulator" },
      },
      {
        id: "7.5.2",
        clause: "7.5.1, 7.5.2",
        title: "Creating and updating documents",
        auditor:
          "Each document is identified (title, number, version, owner), uses a suitable format, and is reviewed and approved before release.",
        oppr: [
          "The naming code is allocated by the server and never changes.",
          "Templates per Document type keep the format consistent.",
          "Four-eyes is enforced on the server: an author cannot review their own version, and the reviewer cannot approve it.",
          "Every version stores its sign-offs, a change note and whether it is a Significant change.",
        ],
        status: "built",
        link: { href: "/library", label: "Open Documents" },
        evidence: ["published", "awaitingSignoff"],
      },
      {
        id: "7.5.3-available",
        clause: "7.5.3.1",
        title: "Available and protected",
        auditor:
          "The right version is available where and when it is needed, and it is protected against loss, misuse and changes nobody intended.",
        oppr: [
          "Published versions are read-only; editing starts a new version, and the Published one stays live until the next is approved.",
          "Readers, Scans, Ask, Wikis and Trainings only ever get the Published version.",
          "Signing in is required; people act through check-in, so sign-offs carry a name.",
        ],
        status: "built",
        link: { href: "/library", label: "Open Documents" },
      },
      {
        id: "7.5.3-distribution",
        clause: "7.5.3.2",
        title: "Distribution, access and retrieval",
        auditor: "You control who gets which document, who may change it, and people can find what they need quickly.",
        oppr: [
          "A QR code on each Asset leads to its Documents and Trainings.",
          "Search with Ctrl+K, and Ask across the library.",
          "Operators read; Engineers author, review and approve.",
          "Outside systems connect through MCP keys with limited access, and every call is logged.",
        ],
        status: "built",
        link: { href: "/assets", label: "Open Assets" },
      },
      {
        id: "7.5.3-changes",
        clause: "7.5.3.2",
        title: "Version control and Periodic review",
        auditor: "Changes are controlled and traceable, and documents are kept suitable over time.",
        oppr: [
          "Version history with who wrote, reviewed and approved each version, and a compare view.",
          "Publishing sets a Periodic review date (12 months by default). Confirming a review is signed and recorded on the version.",
          "Reviews due and overdue show on Home and in Knowledge health.",
        ],
        status: "built",
        link: { href: "/library/health#reviews", label: "Open Reviews due" },
        evidence: ["withReviewDate", "reviewsOverdue"],
      },
      {
        id: "7.5.3-obsolete",
        clause: "7.5.3.2",
        title: "Obsolete documents",
        auditor: "Nobody can use an outdated version by mistake, and old versions you keep are clearly marked.",
        oppr: [
          "A superseded version is no longer served anywhere.",
          "Printed and stamped copies say Controlled copy only for the Published version; others say Superseded or Draft, not for use.",
          "Withdrawing a Document records who, why, when and what replaces it. A Document that was Published cannot be deleted.",
        ],
        status: "built",
        link: { href: "/library", label: "Open Documents" },
        evidence: ["withdrawn"],
      },
      {
        id: "7.5.3-external",
        clause: "7.5.3.2",
        title: "Documents of external origin",
        auditor: "Outside documents you rely on, such as machine manuals, are identified and controlled.",
        oppr: [
          "A Wrapped manual keeps the supplier PDF unchanged and records the supplier, their document number and revision.",
          "Oppr adds a naming code, linked Assets, a Periodic review and a status.",
          "The Controlled copy carries a band on every page with code, version and status, outside the supplier's content.",
        ],
        status: "built",
        link: { href: "/docs/new", label: "Add a Wrapped manual" },
        evidence: ["wrappedPublished"],
      },
      {
        id: "7.5.3-records",
        clause: "7.5.3",
        title: "Records as evidence",
        auditor: "Records are kept, can be found, and cannot be changed after the fact.",
        oppr: [
          "Training records, Skill level changes (who signed off and on what evidence) and version sign-offs are append-only.",
          "Training records export to CSV for an audit sample.",
          "The MCP call log shows every request from an outside system.",
        ],
        status: "built",
        link: { href: "/learn?tab=records", label: "Open Training records" },
        evidence: ["trainingRecords"],
      },
      {
        id: "7.5.3-retention",
        clause: "7.5.3.2",
        title: "Retention and disposal",
        auditor: "You decide how long documents and records are kept, and you follow it.",
        oppr: ["Every Published version, sign-off and Training record is kept. Nothing that was Published can be deleted."],
        yours: "Retention periods and disposal. Oppr has no automatic retention schedule.",
        status: "supported",
      },
    ],
  },
  {
    number: "8",
    title: "Operation",
    requirements: [
      {
        id: "8.4",
        clause: "8.4",
        title: "External providers",
        auditor: "You control what suppliers provide, including the information they give you.",
        oppr: ["Supplier manuals become Wrapped manuals, linked to the Assets they belong to and reviewed on a schedule."],
        yours: "Supplier selection, evaluation and purchasing control.",
        status: "supported",
        link: { href: "/library", label: "Open Documents" },
        evidence: ["wrappedPublished"],
      },
      {
        id: "8.5.1",
        clause: "8.5.1",
        title: "Controlled conditions and work instructions",
        auditor:
          "Work is done under controlled conditions: up-to-date instructions at the point of use, competent people, and the right equipment.",
        oppr: [
          "SOPs and work instructions are linked to Assets and one Scan away at the machine.",
          "Steps carry safety icons, warnings and linked LOGS checklists.",
          "The Skill matrix shows who is qualified to run each line, per shift.",
          "Rounds test people at the Asset itself, not only at a desk.",
        ],
        status: "built",
        link: { href: "/floor", label: "Open Floor simulator" },
        evidence: ["published", "trainingsPublished"],
      },
      {
        id: "8.5.6",
        clause: "8.5.6",
        title: "Control of changes",
        auditor: "Changes to how work is done are reviewed and controlled, and you keep a record of them.",
        oppr: [
          "The author marks a new version as a Significant change.",
          "That sends linked Trainings back to review and flags every Skill holder as re-train needed, with a due date.",
          "Typo fixes do not trigger re-training.",
        ],
        status: "built",
        link: { href: "/learn?tab=matrix", label: "Open Skill matrix" },
        evidence: ["retrainNeeded", "trainingsNeedReview"],
      },
      {
        id: "8.7",
        clause: "8.7",
        title: "Nonconforming outputs",
        auditor: "Product that does not conform is identified and kept from unintended use, and you keep a record of what you did.",
        oppr: [
          "The handling instruction can be a Published work instruction at the line.",
          "A Capture can record a problem on the floor as evidence.",
        ],
        yours: "The nonconformity register and product decisions. Oppr does not track product nonconformities.",
        status: "process",
      },
    ],
  },
  {
    number: "9",
    title: "Performance evaluation",
    requirements: [
      {
        id: "9.1",
        clause: "9.1",
        title: "Monitoring, measurement and analysis",
        auditor: "You decide what to measure, measure it, and use the results.",
        oppr: [
          "Knowledge health: Documents never used, asked about but unclear, overlapping or due for review.",
          "Document insights from what people Ask, and Usage from views and Scans.",
          "Training results and Skill coverage per area and shift.",
        ],
        yours: "Product and process KPIs.",
        status: "supported",
        link: { href: "/library/health", label: "Open Knowledge health" },
      },
      {
        id: "9.2",
        clause: "9.2",
        title: "Internal audit",
        auditor: "A planned audit programme, audits carried out, results reported to management and followed up.",
        oppr: [
          "An internal auditor can check any Document's version history and sign-offs, Training records and Skill evidence in minutes.",
          "This page is a checklist for the documentation and competence part.",
        ],
        yours: "The audit programme, the audits and the reports.",
        status: "supported",
        link: { href: "/learn?tab=records", label: "Open Training records" },
      },
      {
        id: "9.3",
        clause: "9.3",
        title: "Management review",
        auditor: "Management reviews the quality system at planned intervals, using defined inputs, and records its decisions.",
        oppr: ["Inputs ready to use: open Findings, overdue reviews, Skill gaps, Training records and Knowledge health."],
        yours: "The review meeting, decisions and minutes.",
        status: "supported",
        link: { href: "/library/health", label: "Open Knowledge health" },
      },
    ],
  },
  {
    number: "10",
    title: "Improvement",
    requirements: [
      {
        id: "10.2",
        clause: "10.2",
        title: "Nonconformity and corrective action",
        auditor:
          "When something goes wrong you react, find the cause, act on it, check the action worked, and keep a record.",
        oppr: [
          "The Consistency check finds Published Documents that contradict or duplicate each other. Each Finding is closed by a new Published version or dismissed with a recorded reason.",
          "People can mark a passage unclear or wrong; the mark is kept with the Document.",
          "A Proposed revision shows every change with its before, after and the reason, and goes through normal review.",
        ],
        yours: "Corrective actions for product and process problems, and root cause analysis.",
        status: "supported",
        link: { href: "/library/findings", label: "Open Findings" },
        evidence: ["openFindings", "resolvedFindings"],
      },
      {
        id: "10.3",
        clause: "10.3",
        title: "Continual improvement",
        auditor: "You keep improving the quality system, based on results and evaluation.",
        oppr: [
          "Document insights and Captures feed the next revision.",
          "Knowledge health aims for a smaller, better library.",
          "The AI prepares Proposed revisions; a person always publishes.",
        ],
        status: "supported",
        link: { href: "/library/health", label: "Open Knowledge health" },
      },
    ],
  },
]
