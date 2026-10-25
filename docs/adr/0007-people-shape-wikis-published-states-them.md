# ADR 0007 — People shape a Wiki; Published Knowledge states it

- Status: accepted
- Date: 2026-10-25
- Amends: ADR 0003 (the Wiki exception)

## Context

A Wiki used to be generated whole from its Scope, and nobody could change it
except by changing the Scope, which rebuilt everything. Engineers asked to
shape a Wiki: add, rename and order sections, add a block between two others,
have the AI write one block from chosen sources, and phrase a sentence
themselves. ADR 0003 exempted Wikis from approval because they were
"generated output derived only from content that is already Published".
Person-phrased text needs a rule of its own to stay inside that exemption.

## Decision

A Wiki has a durable Outline of sections and blocks that Engineers may add,
order, restyle, pin, hide and instruct, and that survives every rebuild. Text
in a Wiki is either generated from Published passages, or phrased by a
checked-in Engineer and verified against Published passages; in both cases
every claim cites a live Published passage.

1. **Code proves, or a second Engineer confirms.** Engineer-phrased text
   reaches readers on its own only when code (`checkPoint`) proves each claim
   against its passage. A claim that only the AI judge supports needs a second
   Engineer's confirm; the judge's verdict is evidence for that person, never
   the decision.
2. **Per-Wiki confirm.** A Wiki can require a second Engineer's confirm for
   all person-phrased text (`confirmByAnother`). It is on by default for Start
   here Wikis and off for the rest.
3. **Readers see the passage.** Readers can always see the verbatim passage
   behind a sentence, and every block shows its origin (generated, or written
   or edited by a named Engineer and verified).
4. **Unsupported text never reaches readers.** Text that a check finds
   unsupported or contradicting never reaches readers; it becomes a Proposed
   revision of the Document, which goes through normal review.
5. **A check never creates a Finding**, because a Finding is Published against
   Published. When a check retrieves two Published passages that disagree, it
   may start the real Consistency check on those two Documents.
6. **Automatic rebuilds after a publish are never held for approval.**
   Holding them would show stale truth. Written blocks are never regenerated;
   code re-verifies them at every compose and takes a block out of the Wiki
   when its passage no longer supports it.
7. **A Wiki is a snapshot, not a controlled document.** Screen and print say
   "Generated overview, not a controlled document". Builds and the Wiki's
   event log are kept 365 days, at least the last 10 builds, so any earlier
   build can be restored and every change shows who, when and why.
8. **Headings are structure, not claims.** A section heading names a topic and
   is not checked against Published. So a heading may not carry a fact: code
   refuses a heading an Engineer sets with a value and unit ("230 °C") or a
   Document code; such a fact belongs in a block, where it is checked.

## Consequences

- Person-phrased text exists in Wikis, so check 5 runs `checkPoint` on every
  point of every composed block, and a new check confirms every composed
  written block is either code-proven or confirmed by someone other than its
  author.
- Every Wiki mutation writes an append-only event; every build is stored
  whole.

## Alternatives considered

- **Free "Engineer notes"** in a Wiki. Rejected: a Wiki would become a second,
  uncontrolled SOP and break "Published = reviewed by a person".
- **Four-eyes approval of every Wiki edit.** Rejected: Wikis would become slow
  and stale. Four eyes stays available per Wiki through `confirmByAnother`.

This is hard to reverse because Wikis will hold person-phrased text and an
outline that people rely on.
