// Template bodies (TipTap JSON) for "New document" and Settings > Templates.
//
// BUILT_IN_TEMPLATES are the templates every plant starts with. They are
// written into the `templates` table by convex/seedTemplates.ts (which imports
// this file), so keep it free of app imports: plain data and helpers only.
// templateForType() gives the template editor a starting body per type.
//
// Only real editor nodes are used: heading, paragraph, bulletList, table,
// callout (kinds in CalloutBlock.tsx), ppe (slugs in convex/ppe.ts) and
// stepList/stepItem. Reference documents, Assets and images need ids, so the
// guidance text tells the author to insert them from the / menu instead.

/** A document type slug (namingTypes vocabulary). */
type DocumentType = string

interface JSONNode {
  type: string
  attrs?: Record<string, unknown>
  content?: JSONNode[]
  text?: string
  marks?: { type: string }[]
}

function text(s: string): JSONNode {
  return { type: "text", text: s }
}
function bold(s: string): JSONNode {
  return { type: "text", text: s, marks: [{ type: "bold" }] }
}
function p(s: string): JSONNode {
  return { type: "paragraph", content: s ? [text(s)] : [] }
}
/** Paragraph with a bold lead-in, such as "Key point: ...". */
function lp(label: string, s: string): JSONNode {
  return { type: "paragraph", content: s ? [bold(`${label} `), text(s)] : [bold(`${label} `)] }
}
function emptyP(): JSONNode {
  return { type: "paragraph" }
}
function h(level: number, s: string): JSONNode {
  return { type: "heading", attrs: { level }, content: [text(s)] }
}
function ppe(items: string[]): JSONNode {
  return { type: "ppe", attrs: { items: items.join(",") } }
}
function callout(kind: string, body: JSONNode[]): JSONNode {
  return { type: "callout", attrs: { kind }, content: body }
}
function bullets(items: string[]): JSONNode {
  return {
    type: "bulletList",
    content: items.map((it) => ({ type: "listItem", content: [p(it)] })),
  }
}
function steps(count: number): JSONNode {
  return {
    type: "stepList",
    content: Array.from({ length: count }, () => ({
      type: "stepItem",
      content: [{ type: "paragraph" }],
    })),
  }
}
/** A numbered step list whose items carry their own blocks. */
function stepList(items: JSONNode[][]): JSONNode {
  return {
    type: "stepList",
    content: items.map((content) => ({ type: "stepItem", content })),
  }
}
function table(rows: string[][], { headerRow = true } = {}): JSONNode {
  return {
    type: "table",
    content: rows.map((row, i) => ({
      type: "tableRow",
      content: row.map((cell) => ({
        type: i === 0 && headerRow ? "tableHeader" : "tableCell",
        attrs: { colspan: 1, rowspan: 1, colwidth: null },
        content: [p(cell)],
      })),
    })),
  }
}
function doc(content: JSONNode[]): JSONNode {
  return { type: "doc", content }
}

const REVISION_NOTE = [
  h(2, "Revision note"),
  p(
    "What changed in this version and why, in one or two sentences. The full revision history and the References table are added automatically when the document is published or exported.",
  ),
]

// ---------------------------------------------------------------------------
// SOP: plastics pipe extrusion, ISO 9001 (8.5.1) and ISO 45001 (8.1) aware.

const SOP: JSONNode = doc([
  h(1, "Standard Operating Procedure"),

  h(2, "1. Purpose"),
  p(
    "What this procedure achieves and why it exists: the result it guarantees (for example a pipe within specification) and the risk it controls. One short paragraph.",
  ),

  h(2, "2. Scope"),
  p(
    "Where it applies: the line and machines, the products (material, diameter and SDR range) and the situations it covers. Name what is out of scope and which document covers that instead.",
  ),

  h(2, "3. Roles and responsibilities"),
  table([
    ["Role", "Responsibility"],
    ["Operator", "Carries out the steps and records the checks."],
    ["Team leader", "Confirms the start condition, decides on escalations, releases product."],
    ["Process engineer", "Owns this SOP, keeps settings and limits current, reviews it."],
    ["Quality", "Sets the acceptance criteria and decides on non-conforming product."],
  ]),

  h(2, "4. References"),
  p(
    "Type / and pick Reference document to cite each related document, and Assets to link the machines this SOP covers. Cited documents are listed in the References table on publish.",
  ),
  bullets([
    "Supplier manual of each machine (the Wrapped manual), with the pages that apply",
    "Related work instructions, LMRA and safety procedures",
    "Product specification and the product standard, for example EN 12201 for PE water pipe",
  ]),

  h(2, "5. Definitions"),
  p("Only terms an operator could misread. Leave out what everyone on the line knows."),
  table([
    ["Term", "Definition"],
    ["", ""],
    ["", ""],
  ]),

  h(2, "6. Safety"),
  p("Required PPE for this task. Adjust the set with the PPE block menu."),
  ppe(["glasses", "gloves", "boots", "ear-pro"]),
  callout("danger", [
    p(
      "The most serious hazard of this task and how it is controlled, for example hot melt and die surfaces above 200 °C. Stop work if the control is not in place.",
    ),
  ]),
  table([
    ["Hazard", "Control"],
    ["Hot surfaces and melt", ""],
    ["Moving parts (haul-off, saw)", ""],
    ["Noise", ""],
  ]),

  h(2, "7. Prerequisites and start condition"),
  bullets([
    "Tools, gauges and materials needed, with their location",
    "Permits or sign-offs needed before starting",
    "Machine state before starting, for example barrel zones at set temperature and soaked, vacuum tank filled, cooling water on",
    "Raw material: grade and batch checked against the production order, dryer ready if needed",
  ]),
  callout("warning", [
    p("The condition that must be true before step 1. If it is not, do not start and call the team leader."),
  ]),

  h(2, "8. Procedure"),
  p(
    "One action per step, in the order it is done. Add a key point (what makes the step safe, right or easier) and the reason. Add a photo with the image button where words are not enough.",
  ),
  stepList([
    [
      lp("Action:", "What the operator does, starting with a verb."),
      lp("Key point:", "What to watch for, a setting with its limit, or the safe way to do it."),
      lp("Reason:", "Why it matters: what goes wrong if the key point is missed."),
    ],
    [
      lp("Action:", ""),
      lp("Key point:", ""),
      lp("Reason:", ""),
    ],
    [
      lp("Action:", ""),
      lp("Key point:", ""),
      lp("Reason:", ""),
      callout("caution", [p("Put a warning inside the step where the risk occurs, not only at the top.")]),
    ],
    [
      lp("Action:", ""),
      lp("Key point:", ""),
      lp("Reason:", ""),
    ],
  ]),

  h(2, "9. Quality checks and acceptance criteria"),
  table([
    ["Characteristic", "Method", "Frequency", "Acceptance criterion"],
    ["Outside diameter", "Pi tape", "Start-up, then every 2 h", "Within product specification"],
    ["Wall thickness", "Ultrasonic gauge, 4 points", "Start-up, then every 2 h", "Within product specification"],
    ["Ovality", "Caliper, min and max", "Start-up, then every 2 h", ""],
    ["Surface and print", "Visual", "Every length", "No scratches, voids or missing print"],
  ]),
  p("Out of specification: label the product as on hold and tell the team leader. Do not release it."),

  h(2, "10. When it goes wrong"),
  table([
    ["Situation", "Immediate action", "Escalate to"],
    ["Melt pressure above alarm limit", "", ""],
    ["Pipe out of tolerance", "", ""],
    ["Vacuum loss or pipe collapse in the tank", "", ""],
    ["Injury or near miss", "Make the area safe, give first aid, report it", "Team leader and safety officer"],
  ]),
  callout("warning", [
    p("When to stop the line and not try a fix yourself. Never reach into the haul-off, saw or die area while the line runs."),
  ]),

  h(2, "11. Records"),
  table([
    ["Record", "Where it is kept", "Retention"],
    ["Start-up and quality checks", "", ""],
    ["Non-conforming product", "", ""],
  ]),

  ...REVISION_NOTE,
])

// ---------------------------------------------------------------------------
// Factory manual: how to bring a supplier manual in as a Wrapped manual, plus
// the local summary that sits next to it (the PDF itself is never edited).

const FACTORY_MANUAL: JSONNode = doc([
  h(1, "Machine name: local summary of the supplier manual"),
  callout("notice", [
    p(
      "Part A explains how to add the supplier manual. Delete Part A before you submit this summary for review. Part B is what operators and technicians read.",
    ),
  ]),

  h(2, "Part A. Adding the supplier manual"),
  p(
    "A Wrapped manual is the supplier's PDF kept exactly as delivered. Oppr gives it a naming code, links it to Assets, stamps code, version and status on every page and controls it like any document. It is never edited, only replaced by a newer PDF. Local additions go in this summary instead.",
  ),
  stepList([
    [p("Get the right PDF: the latest supplier revision, in the language used on the floor, with no pages missing. Note the supplier document number and revision from the cover.")],
    [p("Open New document and choose Wrap a supplier manual (kept unchanged). Drop the PDF in.")],
    [p("Fill in the title, supplier, supplier document number and revision, area and discipline (usually maintenance). The naming code is allocated when you create it and never changes.")],
    [p("Link every Asset the manual covers, so scanning the machine shows the manual once it is Published.")],
    [p("Read through the stamped pages. Write down the pages that matter on this site: start-up, settings, alarms, maintenance and safety devices. They go in section 4 below.")],
    [p("Create this summary from the template, link it to the same Assets and cite the Wrapped manual with / Reference document.")],
    [p("Submit both for review. An Engineer approves and publishes them. Only the Published version is stamped Controlled copy.")],
    [p("When the supplier issues a new revision, use Replace PDF on the Wrapped manual. Do not add it as a new document. Then check this summary against the new pages.")],
  ]),
  callout("warning", [
    p(
      "A local rule that differs from the supplier manual needs a risk assessment and an Engineer's approval. Record it in section 5 and tell the supplier when their manual is wrong.",
    ),
  ]),

  h(2, "Part B. Local summary"),

  h(2, "1. Machine"),
  table(
    [
      ["Asset", "Insert with / Assets"],
      ["Manufacturer and model", ""],
      ["Serial number and year", ""],
      ["Supplier manual", "Naming code of the Wrapped manual, supplier revision"],
      ["Line and position", "For example line 2, between vacuum tank and haul-off"],
    ],
    { headerRow: false },
  ),

  h(2, "2. Key settings"),
  p("The settings people look up most, with our value next to the supplier's range."),
  table([
    ["Parameter", "Supplier range", "Our setting", "Manual page"],
    ["Barrel zone temperatures", "", "", ""],
    ["Screw speed", "", "", ""],
    ["Melt pressure alarm", "", "", ""],
    ["Vacuum tank pressure", "", "", ""],
  ]),

  h(2, "3. Local safety rules"),
  ppe(["glasses", "gloves", "boots", "ear-pro"]),
  callout("danger", [
    p("A local rule that adds to or overrides the manual: the rule, why we have it and who approved it."),
  ]),
  bullets([
    "Isolation points and the lockout procedure that applies",
    "Guards and safety devices that must be tested, and how often",
  ]),

  h(2, "4. Where to find it in the manual"),
  table([
    ["Topic", "Manual section", "Pages"],
    ["Start-up and shutdown", "", ""],
    ["Alarms and faults", "", ""],
    ["Lubrication and maintenance", "", ""],
    ["Safety devices", "", ""],
    ["Spare parts", "", ""],
  ]),

  h(2, "5. Differences from the manual"),
  table([
    ["The manual says", "We do", "Reason", "Approved by"],
    ["", "", "", ""],
  ]),

  ...REVISION_NOTE,
])

// ---------------------------------------------------------------------------
// Policy: ISO 9001 5.2 / ISO 45001 5.2 shape.

const POLICY: JSONNode = doc([
  h(1, "Untitled policy"),

  h(2, "1. Purpose"),
  p("Why this policy exists and what it sets out to achieve. Two or three sentences."),

  h(2, "2. Scope"),
  p("Who and what it applies to: sites, departments, employees, temporary staff, contractors and visitors."),

  h(2, "3. Policy statement"),
  p(
    "The position of management in plain words, signed off by the plant or general manager. Keep it short enough to hang on the wall.",
  ),

  h(2, "4. Commitments"),
  p("What we commit to. Make each one specific enough to check. Replace these examples:"),
  bullets([
    "Meet legal requirements and the requirements of our customers",
    "Eliminate hazards and reduce risks, and consult the people who do the work",
    "Set objectives, measure them and improve continually",
    "Give people the training and resources to work to this policy",
  ]),

  h(2, "5. Roles and responsibilities"),
  table([
    ["Role", "Responsibility"],
    ["Management", "Sets the policy, provides resources, reviews it."],
    ["Team leaders", "Make it work on the floor and raise issues."],
    ["Everyone", "Works to the policy and reports what does not work."],
  ]),

  h(2, "6. Related documents"),
  p("Cite the procedures that put this policy into practice with / Reference document."),

  h(2, "7. Review cycle"),
  p(
    "How often the policy is reviewed (at least yearly, for example in the management review) and what triggers an earlier review: a serious incident, a change in law or a major change in the business.",
  ),

  h(2, "8. Approval"),
  table([
    ["Role", "Name", "Date"],
    ["Plant manager", "", ""],
  ]),
  p("The approval in Oppr is recorded when the document is approved and published."),

  ...REVISION_NOTE,
])

// ---------------------------------------------------------------------------
// Toolbox talk: one topic, ten minutes, standing at the line.

const TOOLBOX: JSONNode = doc([
  h(1, "Toolbox talk: topic"),
  p("One topic, about ten minutes, on the floor. Keep it short and ask more than you tell."),
  table(
    [
      ["Topic", ""],
      ["Date and shift", ""],
      ["Area or line", ""],
      ["Presented by", ""],
    ],
    { headerRow: false },
  ),

  h(2, "Why now"),
  p(
    "The reason for this talk: a recent incident or near miss, the season (heat, ice in the yard), a new machine or material, or an audit finding. One or two sentences.",
  ),

  h(2, "Key messages"),
  p("Three messages at most, each one sentence the team can repeat."),
  bullets(["", "", ""]),

  h(2, "Hazards and controls"),
  table([
    ["Hazard", "Control", "Who checks"],
    ["", "", ""],
    ["", "", ""],
  ]),
  ppe(["glasses", "gloves", "boots", "ear-pro"]),

  h(2, "Questions to ask the team"),
  bullets([
    "Where have you seen this happen on our lines?",
    "What makes it hard to do it the safe way?",
    "What would you change?",
  ]),

  h(2, "Attendance and sign-off"),
  table([
    ["Name", "Role", "Signature"],
    ["", "", ""],
    ["", "", ""],
    ["", "", ""],
  ]),

  h(2, "Follow-up actions"),
  table([
    ["Action", "Owner", "Due", "Done"],
    ["", "", "", ""],
  ]),
])

// ---------------------------------------------------------------------------
// Safety procedure: hazard-led, with isolation (LOTO) and emergency response.

const SAFETY_PROCEDURE: JSONNode = doc([
  h(1, "Untitled safety procedure"),

  h(2, "1. Purpose and scope"),
  p("The task or situation this procedure makes safe, where it applies and who may carry it out."),

  h(2, "2. Hazards and risk"),
  table([
    ["Hazard", "Possible harm", "Risk before controls", "Controls", "Remaining risk"],
    ["", "", "", "", ""],
    ["", "", "", "", ""],
  ]),
  callout("danger", [p("The hazard that can kill or seriously injure, and the control that must never be skipped.")]),

  h(2, "3. Legal and standard references"),
  p("The law and standards this procedure meets. Replace these examples with what applies on your site."),
  bullets([
    "National health and safety law and the risk assessment it requires",
    "ISO 45001, clause 8.1 (operational planning and control)",
    "EN ISO 14118 (prevention of unexpected start-up) for isolation",
  ]),

  h(2, "4. Required PPE"),
  ppe(["glasses", "face-shield", "gloves", "boots", "ear-pro"]),

  h(2, "5. Permits and authorisation"),
  callout("permit", [p("The permit needed (work, hot work, confined space), who issues it and who closes it.")]),
  callout("authorised", [p("Who is authorised to do this work, and the Skill or Training that shows it.")]),

  h(2, "6. Isolation and lockout"),
  callout("loto", [
    p("Every energy source is isolated, locked and tagged by each person working, and zero energy is verified before work starts."),
  ]),
  table([
    ["Energy source", "Isolation point", "How to isolate", "How to verify"],
    ["Electrical (drives, heater bands)", "", "", ""],
    ["Thermal (hot melt, barrel, die)", "", "", ""],
    ["Pneumatic or hydraulic", "", "", ""],
    ["Stored mechanical (haul-off, saw)", "", "", ""],
  ]),
  p("Delete the rows that do not apply. Write not applicable here if the task needs no isolation."),

  h(2, "7. Safe work steps"),
  p("One action per step. State the key point and when to stop."),
  steps(5),

  h(2, "8. Emergency response"),
  table([
    ["Situation", "Immediate action", "Call"],
    ["Burn from hot melt or surfaces", "", ""],
    ["Fire", "", ""],
    ["Person trapped or injured", "", ""],
  ]),
  p("Emergency number, first aiders, nearest first aid kit, eye wash and assembly point."),

  h(2, "9. Training required"),
  bullets(["Training or Skill required before doing this alone", "Refresher interval"]),

  h(2, "10. Records"),
  table([
    ["Record", "Where it is kept", "Retention"],
    ["Permit", "", ""],
    ["Lockout register", "", ""],
  ]),

  ...REVISION_NOTE,
])

// ---------------------------------------------------------------------------
// Bodies used by the template editor's "start from type".

const MANUAL: JSONNode = doc([
  h(1, "Untitled manual"),
  p(
    "Asset description and scope of this manual. It covers normal operation, faults, and maintenance.",
  ),
  ppe(["hardhat", "glasses", "gloves", "boots", "ear-pro"]),
  h(2, "Operating envelope"),
  table([
    ["Parameter", "Min", "Nominal", "Max"],
    ["", "", "", ""],
  ]),
  h(2, "Theory of operation"),
  emptyP(),
  h(2, "Normal operation"),
  steps(5),
  h(2, "Maintenance schedule"),
  table([
    ["Task", "Frequency", "Responsible"],
    ["", "", ""],
  ]),
  h(2, "Spare parts"),
  table([
    ["Part", "Spec", "Stock target", "Vendor SKU"],
    ["", "", "", ""],
  ]),
  h(2, "Revision history"),
  table([
    ["Version", "Date", "Author", "Changes"],
    ["v1.0", "", "", "Initial release"],
  ]),
])

const WORK_INSTRUCTION: JSONNode = doc([
  h(1, "Untitled work instruction"),
  p("When this WI applies, who runs it, what the success criterion is. One paragraph."),
  ppe(["hardhat", "glasses", "gloves"]),
  h(2, "Steps"),
  steps(4),
  callout("tip", [p("Tip the operator can use to do this faster or avoid a common mistake.")]),
  h(2, "Escalation"),
  p("If the steps don't resolve the situation, escalate per the matrix below."),
  table([
    ["Condition", "Action", "Notify"],
    ["", "", ""],
  ]),
])

const LMRA: JSONNode = doc([
  h(1, "Untitled LMRA"),
  p("Last Minute Risk Analysis: confirm every item with a colleague present before starting."),
  ppe(["hardhat", "glasses", "gloves", "boots", "hi-vis"]),
  callout("danger", [p("Single highest-risk hazard for this task. Stop work if not mitigated.")]),
  h(2, "Hazards to confirm"),
  table([
    ["Hazard", "Confirm", "If not"],
    ["", "", ""],
    ["", "", ""],
  ]),
  h(2, "Sign-off"),
  p("If any item cannot be confirmed, stop work and notify the supervisor."),
])

export interface BuiltInTemplate {
  name: string
  type: DocumentType
  description: string
  bodyJson: unknown
}

/**
 * The templates every plant starts with, upserted by name by
 * seedTemplates.ensure. The SOP keeps its original name so the existing row
 * is updated rather than duplicated. There is no "safety procedure" type in
 * the vocabulary, so that template files as an SOP.
 */
export const BUILT_IN_TEMPLATES: BuiltInTemplate[] = [
  {
    name: "SOP: Best practice (chapters)",
    type: "sop",
    description:
      "Full SOP for a production line: purpose, scope, roles, references, PPE and hazards, start condition, steps with key points and reasons, quality checks, what to do when it goes wrong, records.",
    bodyJson: SOP,
  },
  {
    name: "Factory manual (Wrapped)",
    type: "manual",
    description:
      "How to add a supplier or factory manual as a Wrapped manual, plus a local summary: machine, key settings, local safety rules and where to look in the manual.",
    bodyJson: FACTORY_MANUAL,
  },
  {
    name: "Policy",
    type: "policy",
    description:
      "Purpose, scope, policy statement, commitments, roles, related documents, review cycle and approval.",
    bodyJson: POLICY,
  },
  {
    name: "Toolbox talk",
    type: "toolbox",
    description:
      "Ten minutes on the floor: why now, key messages, hazards and controls, questions for the team, attendance and follow-up.",
    bodyJson: TOOLBOX,
  },
  {
    name: "Safety procedure",
    type: "sop",
    description:
      "Hazards and risk, legal references, PPE, permits, isolation and lockout, safe work steps, emergency response, training and records.",
    bodyJson: SAFETY_PROCEDURE,
  },
]

export function templateForType(type: DocumentType): unknown {
  switch (type) {
    case "sop":
      return SOP
    case "manual":
      return MANUAL
    case "work_instruction":
      return WORK_INSTRUCTION
    case "lmra":
      return LMRA
    case "policy":
      return POLICY
    case "toolbox":
      return TOOLBOX
    // Custom types (and any slug without a bespoke skeleton) start from the SOP
    // structure, the most general one.
    default:
      return SOP
  }
}
