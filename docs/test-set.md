# Test set: Oppr Knowledge slices 0 and 1

A fixed regression set that every later slice reruns. It runs on the Convex
**dev** deployment against the fresh seed (`convex/seedKnowledge.ts`).

```
npx convex run seedKnowledge:run    # fresh seed
npx convex run devChecks:run        # automated checks 3-7 and G
npx convex run seedKnowledge:run    # restore: check 6 publishes a document
```

## Seed fixtures the checks rely on

| Fixture | Why |
|---|---|
| `EXT-OPS-SOP-0001` is Published v1 with a v2 draft. v2 switches purge compound `PX-4400` to `PX-9917`. | Draft text of a Published document must stay invisible. |
| `MIX-OPS-SOP-0001` is a never-published draft mentioning `MT-5521`. | A never-published document must be invisible. |
| `EXT-OPS-WI-0001` is in review and mentions `BL-7730`. | In-review text is not Knowledge; shows in the Home inbox. |
| Review dates: `EXT-HSE-SOP-0001` overdue by 10 days, `EXT-MNT-MAN-0001` due in 20 days, `MIX-OPS-WI-0001` due in 60 days. | Periodic review window is 30 days. |
| SOP says die bolts 40 Nm, manual says 45 Nm. | Deliberate contradiction for the Consistency check slice. |
| Wiki "Line 2 changeover essentials", Scope = machine EXL-201. | Regeneration check. |

## Automated checks (`devChecks:run`)

| # | Check | Expected result |
|---|---|---|
| 3 | Ask retrieval (`ai/ask:lookupAfterSearch`) and scope overview, for the library, every document and every asset, fed every chunk id. | Only chunks of live versions of non-archived documents are served. None of `PX-9917`, `MT-5521`, `BL-7730` appear. The library overview lists no unpublished document. |
| 4 | A probe Wiki whose Scope includes both sentinel documents. | Status `ready`. No sentinel text. "Built from" lists `EXT-OPS-SOP-0001` at its live version (v1), and does not list `MIX-OPS-SOP-0001`. |
| 5 | Every point of every Wiki: each citation's chunk exists, belongs to the cited document, is that document's live version and is inside the Wiki's Scope; the grounding check passes again on the stored text. | 100% of points traceable. Report the count. |
| G | Grounding check cases: supported number, wrong number, draft-only code, unknown source key, no source, two sources. | All six behave as expected. |
| 7 | A Wiki whose Scope only contains never-published documents. | Status `empty`, no content. |
| 6 | Publish the v2 draft of `EXT-OPS-SOP-0001` and time the seeded Wiki. | Rebuilt from v2 in under 60 s. The new text (`PX-9917`) now appears, because it is Published. |

## Manual checks in the browser

| # | Task | Expected result |
|---|---|---|
| 8 | Open Wiki, New Wiki. Describe a Wiki, then change a field yourself, then close the dialog without pressing Create. | The Draft changes only from the assistant's answer or your own edits. Nothing is created until Create is pressed. Closing creates nothing. |
| 9 | Walk every menu item. | Exactly six: Home, Documents, Learn, Wiki, Assets, Settings. No page deeper than list, then item; deeper things open as a panel or dialog. |
| 10a | Find what needs your review today. | Home inbox, one click. |
| 10b | See which documents have a periodic review due. | Home inbox (overdue and within 30 days), one click to the document's review card. |
| 10c | Check in as an Operator, then check out. | Top-bar chip, two clicks each way. |
| 10d | Create a Wiki "everything a new night-shift operator needs about changeovers" by describing it. | Draft fills in, Create builds the Wiki with sources. |
| 10e | Open a Wiki citation. | Lands on the source document with the passage highlighted. |
| 10f | Find the Floor simulator placeholder. | Assets page header, or the link on Learn. |
| 11 | Periodic review window. | `EXT-MNT-MAN-0001` (20 days) and `EXT-HSE-SOP-0001` (overdue) are in the inbox; `MIX-OPS-WI-0001` (60 days) is not. |

## Notes

- If no working Gemini key is available, `OPPR_AI_STUB=1` on dev switches Wiki generation and the Guided creation assistant to an offline stand-in that uses no AI and says so in the UI. All checks above still apply. Unset it once a valid key is set: `npx convex env remove OPPR_AI_STUB`.
