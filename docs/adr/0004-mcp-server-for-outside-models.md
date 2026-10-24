# MCP server: outside models do the messy work, Oppr keeps the truth

Oppr Knowledge exposes an MCP server (Streamable HTTP, `POST /mcp` on the Convex site URL). An assistant or system the customer already runs connects to it with an MCP key. This can be the customer's own cloud assistant (Claude, ChatGPT, Copilot) or a self-hosted model on site (for example Ollama behind Open WebUI or LibreChat). It can then read Published knowledge, and it can bring work into Oppr as drafts and signals.

We chose this so that the expensive, customer-specific pre-work happens in the customer's own model, with the customer's own budget and data rules, instead of in features we would have to build:
- OCR and cleanup;
- classifying hundreds of legacy files;
- mapping them to our areas, disciplines and types;
- splitting and translating;
- finding duplicates.

Oppr's part stays small and strict: the structure to map onto, duplicate checks against Published knowledge, and a draft import. After that the normal review applies.

Access is scoped per key:
- `read:published`: search and read Published versions only.
- `read:people`: skill coverage and training records. This is personal data, so it is a separate scope.
- `write:drafts`: create drafts, marked as imported through MCP.
- `write:signals`: report unclear steps or incidents.

A key can be limited to areas. Only a hash of the key is stored. Every call is written to an audit log.

MCP can never publish, approve, sign off or delete. This follows ADR 0003: an imported draft is a proposal, and an Engineer takes it through review like any other draft. Drafts are never visible to MCP reads, the same rule as for Ask.

## Considered options

- **Build a bulk importer with our own AI in Oppr.** Rejected for the onboarding case. Every customer's mess is different, and we would pay for and own every edge case: scans, languages, odd templates. We keep Oppr's own AI for what needs our controls (Ask, Guided creation, the Consistency check).
- **A REST API only.** Rejected as the main door. MCP lets the customer's assistant discover the tools and use them in conversation, with no integration project. A plain HTTP endpoint still exists underneath for systems like an ERP or CMMS.
- **Write access that can publish.** Rejected: it would break "Published = truth, a person decides" (ADR 0003).

## Known limits of the showcase

- Any signed-in user can see the key list and the audit log, including the summaries of people-data calls. Making and revoking keys needs an Engineer check-in. Before production, the audit log should be limited to Engineers, and people-data summaries should be redacted.
- The endpoint is stateless JSON (no server-sent events). That is enough for tool calls, but it cannot push progress for long imports.
- Links in tool results use `APP_URL`, which has to be set on the deployment.
