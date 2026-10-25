// Settings, AI and connections: what runs, read-only. Model names come from
// the constants the AI code uses; the schedules from settings/schedules.ts
// (the list convex/crons.ts schedules). Keys are never returned, only whether
// one is set.
import { query } from "../_generated/server"
import { requireUser } from "../lib/auth"
import { CHAT_MODEL, EMBEDDING_DIM, EMBEDDING_MODEL, IMAGE_EMBEDDING_MODEL, IMAGE_MODEL } from "../ai/constants"
import { CLAUDE_MODEL } from "../ai/llm"
import { SCHEDULES, scheduleText } from "./schedules"

export const overview = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx)
    const gemini = Boolean(process.env.GEMINI_API_KEY)
    const claude = Boolean(process.env.ANTHROPIC_API_KEY)
    const models = [
      {
        use: "Writing and organizing",
        what: "Wikis, Guided creation, Captures, Findings and Proposed revisions.",
        model: claude ? CLAUDE_MODEL : CHAT_MODEL,
        note: claude ? null : `Claude is not set up on this deployment, so ${CHAT_MODEL} is used.`,
        ready: claude || gemini,
      },
      {
        use: "Answers and quick work",
        what: "Ask, transcribing voice notes, describing photos and image tags.",
        model: CHAT_MODEL,
        note: null,
        ready: gemini,
      },
      {
        use: "Search",
        what: "Passages of Published documents for Ask and search.",
        model: `${EMBEDDING_MODEL}, ${EMBEDDING_DIM} dimensions`,
        note: null,
        ready: gemini,
      },
      {
        use: "Image search",
        what: "Photos and passages in one space: type words or drop a photo.",
        model: `${IMAGE_EMBEDDING_MODEL}, ${EMBEDDING_DIM} dimensions`,
        note: null,
        ready: gemini,
      },
      {
        use: "Making images",
        what: "Generated illustrations for documents and the seed.",
        model: IMAGE_MODEL,
        note: null,
        ready: gemini,
      },
    ]
    const schedules = Object.values(SCHEDULES).map((s) => ({
      name: s.name,
      label: s.label,
      what: s.what,
      when: scheduleText(s.at),
    }))
    return { models, schedules }
  },
})
