// CONTRACT (shared by the plant lane and the AI features).
// A short plain-text briefing about the plant (organization background,
// structure, processes, glossary) for AI prompts: Ask, Wikis and the guided
// writer. Keep it under ~4000 characters. The plant lane owns this file.
import { v } from "convex/values"
import { internalQuery } from "../_generated/server"

export const forAi = internalQuery({
  args: {
    /** Narrow to these area codes (namingLocations.code) when given. */
    areaCodes: v.optional(v.array(v.string())),
  },
  handler: async (): Promise<string> => {
    return ""
  },
})
