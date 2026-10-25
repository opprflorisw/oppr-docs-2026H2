# ADR 0006 — Plant: a plant ontology for Knowledge only

- Status: accepted
- Date: 2026-10-25

## Context

Ask, Wikis and the guided writer answer better when they know the plant:
who the organization is, its areas and lines, what it makes, its materials
and hazards, its roles, and the words people use on the floor (often Dutch,
often abbreviations). New starters need the same thing. Other Oppr tools
keep something similar, and the wider platform will one day hold one plant
ontology for every module, like the shared Asset registry (ADR 0001).

Until then Knowledge needs its own, small and editable, without pretending
to be that platform ontology.

## Decision

1. **A left-nav item "Plant" replaces "Assets".** The nav stays at exactly
   six places: Home, Documents, Learn, Wiki, Plant, Settings. Assets becomes
   a tab inside Plant and reuses the Assets list (no copy). `/assets`
   redirects to `/plant/assets`; `/assets/:id` still opens an Asset and
   highlights Plant.
2. **Tabs:** Overview (organization background), Structure (site > area >
   line > Asset), Processes and products, Materials and hazards, Roles and
   teams, Glossary, Assets. The tab is in the path (`/plant/glossary`).
3. **Data, owned by `convex/plant/`:** `plantProfile` (one row of background;
   the company name and logo stay in `coverSettings`, one source),
   `plantItems` (one table for every kind: site, line, process, product,
   material, hazard, role, team, term; each with a description, synonyms,
   an optional area and links to Documents, Assets, Trainings and Skills),
   `plantRelations` (typed: part of, produces, uses, runs on, hazards, done
   by, feeds into, related to) and `plantProposals`.
4. **Areas are the naming locations.** `namingLocations` stays the one list
   of areas. `plantAreas` only adds a description and a site per area code;
   it never renames or adds an area.
5. **AI proposes, an Engineer accepts** (ADR 0003). "Propose from
   documents" (`convex/ai/plantPropose.ts`, Claude) reads Published
   documents only and stores proposals as pending. Each one traces to at
   least one Published document. Accepting creates the item (or adds words
   and sources to an existing one); rejecting keeps it from being proposed
   again. Editing the Plant needs a checked-in Engineer or Admin.
6. **One briefing for the AI.** `convex/plant/context.ts` `forAi` returns a
   plain-text briefing under 4000 characters (optionally narrowed to area
   codes). Ask, Wikis and the guided writer add it as background. It is never
   a source: answers and Wiki points still cite Published passages only.

## Consequences

- Knowledge gets a plant vocabulary now, and the glossary is searchable from
  Ctrl+K and the phone.
- The Plant is not Knowledge itself: it is not versioned or Published, and
  nothing in it is shown as an instruction. Steps, settings and limits only
  ever come from Published documents.
- Merging into the platform ontology later is confined to `convex/plant/`:
  items can gain `source`/`externalId` provenance like Assets did, and the
  UI and `forAi` contract stay the same.

## If you're about to change this

- Don't add a seventh nav place; put new things inside one of the six.
- Don't store areas in `plantItems`; add fields to `plantAreas` instead.
- Don't let the AI write `plantItems` directly; it writes `plantProposals`.
- Don't make Ask or a Wiki cite the briefing.
