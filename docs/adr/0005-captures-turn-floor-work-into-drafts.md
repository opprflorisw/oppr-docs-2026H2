# Captures: operators record their work, the AI organizes it, an Engineer turns it into a Draft

Operators know how the job is really done, but they do not write SOPs. A Capture lets them record their work on the phone while they do it: typed notes, voice notes, photos, video and Scans of Assets, in one continuous stretch. When they hand it in, the AI transcribes the voice notes, describes the photos and video, and organizes everything into Moments (steps, safety points, quality checks, tips, problems, open questions), each linked to its evidence and to the Asset where it was recorded.

Several Captures of the same job form a Capture set. Combining them gives one step list, shows which Captures support each step, and marks Variations: steps done differently, skipped, or in conflict with Published Knowledge. From a Capture or a Capture set an Engineer makes a Draft (SOP, work instruction, LMRA, or a proposal for a new LOGS checklist). That Draft goes through normal review.

We call it a Capture, not a Log, because "Log" already means a checklist from the Oppr LOGS module (ADR 0001). A proposal for a new Log is one of the possible outputs.

## Rules

- **Never Knowledge by itself.** A Capture is raw input. Ask, Wiki and MCP reads never use it. Only a Published document made from it counts (ADR 0003).
- **Trainings still come from Published documents.** "Make a Training" from a Capture creates the Draft first. The Training is offered once that Draft is Published. We kept this rule so that every Training record points at a Published version.
- **Privacy.** Voice, photos and video can show people. A Capture is visible only to its author until it is handed in, then to checked-in Engineers. The author or an Engineer can delete an Entry's media. The first Capture shows a short notice about what is recorded and who sees it.
- **Cheap models for the raw work.** Gemini Flash-Lite transcribes and describes media. Claude organizes the Moments and combines Capture sets, the same split as the rest of Oppr.

## Considered options

- **Let operators write the SOP on the phone.** Rejected: nobody writes good prose on a phone with gloves on. Recording is easy; writing is the Engineer's job, with the AI doing the first draft.
- **Make one Capture straight into a Training.** Rejected for now: it would create Training records that point at unreviewed text.
- **Merge Variations automatically.** Rejected: which way is the standard is a decision for a person. The AI only shows the differences and suggests one.

## Known limits of the showcase

- Media are uploaded when they are recorded. There is no offline queue yet.
- Long videos are summarized from a limited size. Larger files are kept but marked "not analyzed".
