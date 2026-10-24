// What the MCP page shows about the endpoint: its URL and the tool catalogue
// (convex/mcp/tools.ts, the one list the endpoint serves too).
import { query } from "../_generated/server"
import { requireUser } from "../lib/auth"
import { TOOLS } from "./tools"

export const endpointInfo = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx)
    const site = (process.env.CONVEX_SITE_URL ?? "").replace(/\/+$/, "")
    return {
      url: `${site}/mcp`,
      tools: TOOLS.map((t) => ({
        name: t.name,
        title: t.title,
        scope: t.scope,
        description: t.description,
        readOnly: t.readOnly,
      })),
    }
  },
})
