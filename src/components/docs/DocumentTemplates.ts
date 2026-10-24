// Skeleton bodies for "New document" — picked by document type so the
// engineer doesn't start every SOP/Manual/WI/LMRA from a blank page.
//
// Each template includes a hero PPE row, a starter callout, the right
// heading skeleton, and a numbered step block where appropriate.

import type { DocumentType } from "@/types"

interface JSONNode {
  type: string
  attrs?: Record<string, unknown>
  content?: JSONNode[]
  text?: string
}

function p(text: string): JSONNode {
  return { type: "paragraph", content: text ? [{ type: "text", text }] : [] }
}
function emptyP(): JSONNode {
  return { type: "paragraph" }
}
function h(level: number, text: string): JSONNode {
  return {
    type: "heading",
    attrs: { level },
    content: [{ type: "text", text }],
  }
}
function ppe(items: string[]): JSONNode {
  return { type: "ppe", attrs: { items: items.join(",") } }
}
function callout(kind: string, body: JSONNode[]): JSONNode {
  return { type: "callout", attrs: { kind }, content: body }
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
function table(rows: string[][], { headerRow = true } = {}): JSONNode {
  return {
    type: "table",
    content: rows.map((row, i) => ({
      type: "tableRow",
      content: row.map((cell) => ({
        type: i === 0 && headerRow ? "tableHeader" : "tableCell",
        attrs: { colspan: 1, rowspan: 1, colwidth: null },
        content: [{ type: "paragraph", content: [{ type: "text", text: cell }] }],
      })),
    })),
  }
}

const SOP: JSONNode = {
  type: "doc",
  content: [
    h(1, "Untitled SOP"),
    p(
      "Brief one-paragraph scope: what this SOP covers, where it applies, who runs it.",
    ),
    ppe(["hardhat", "glasses", "boots"]),
    callout("warning", [
      p("Critical safety condition that must be confirmed before starting."),
    ]),
    h(2, "Procedure"),
    steps(4),
    h(2, "Troubleshooting"),
    table(
      [
        ["Symptom", "Likely cause", "Action"],
        ["", "", ""],
        ["", "", ""],
      ],
    ),
    h(2, "Sign-off"),
    p("Operator signs off in the relevant log when the procedure completes."),
  ],
}

const MANUAL: JSONNode = {
  type: "doc",
  content: [
    h(1, "Untitled manual"),
    p(
      "Asset description and scope of this manual. It covers normal operation, faults, and maintenance.",
    ),
    ppe(["hardhat", "glasses", "gloves", "boots", "ear-pro"]),
    h(2, "Operating envelope"),
    table(
      [
        ["Parameter", "Min", "Nominal", "Max"],
        ["", "", "", ""],
      ],
    ),
    h(2, "Theory of operation"),
    emptyP(),
    h(2, "Normal operation"),
    steps(5),
    h(2, "Maintenance schedule"),
    table(
      [
        ["Task", "Frequency", "Responsible"],
        ["", "", ""],
      ],
    ),
    h(2, "Spare parts"),
    table(
      [
        ["Part", "Spec", "Stock target", "Vendor SKU"],
        ["", "", "", ""],
      ],
    ),
    h(2, "Revision history"),
    table(
      [
        ["Version", "Date", "Author", "Changes"],
        ["v1.0", "", "", "Initial release"],
      ],
    ),
  ],
}

const WORK_INSTRUCTION: JSONNode = {
  type: "doc",
  content: [
    h(1, "Untitled work instruction"),
    p(
      "When this WI applies, who runs it, what the success criterion is. One paragraph.",
    ),
    ppe(["hardhat", "glasses", "gloves"]),
    h(2, "Steps"),
    steps(4),
    callout("tip", [
      p("Tip the operator can use to do this faster or avoid a common mistake."),
    ]),
    h(2, "Escalation"),
    p("If the steps don't resolve the situation, escalate per the matrix below."),
    table(
      [
        ["Condition", "Action", "Notify"],
        ["", "", ""],
      ],
    ),
  ],
}

const LMRA: JSONNode = {
  type: "doc",
  content: [
    h(1, "Untitled LMRA"),
    p(
      "Last Minute Risk Analysis: confirm every item with a colleague present before starting.",
    ),
    ppe(["hardhat", "glasses", "gloves", "boots", "hi-vis"]),
    callout("danger", [
      p("Single highest-risk hazard for this task. Stop work if not mitigated."),
    ]),
    h(2, "Hazards to confirm"),
    table(
      [
        ["Hazard", "Confirm", "If not"],
        ["", "", ""],
        ["", "", ""],
      ],
    ),
    h(2, "Sign-off"),
    p(
      "If any item cannot be confirmed, stop work and notify the supervisor.",
    ),
  ],
}

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
    // Custom types (and any slug without a bespoke skeleton) start from the SOP
    // structure — the most general of the four.
    default:
      return SOP
  }
}
