// Tables owned by the people module. Spread into convex/schema.ts.
import { defineTable } from "convex/server"
import { v } from "convex/values"

export const peopleTables = {
  // The plant's shifts (Settings, People and roles). people.shift and
  // coverageQuestions.shift hold the `key`. Inactive shifts stay so that
  // people still on them keep a readable name.
  shifts: defineTable({
    key: v.string(),
    name: v.string(),
    // "06:00" and "14:00"; a night shift ends the next morning.
    start: v.string(),
    end: v.string(),
    active: v.boolean(),
    // Counts for shift cover (Home, Skill matrix). Office day shifts do not.
    cover: v.boolean(),
    sortOrder: v.number(),
  })
    .index("by_key", ["key"])
    .index("by_sortOrder", ["sortOrder"]),

  // The plant's own words for the four Skill levels (for example ILUO).
  // One row per level 0-3; a missing row falls back to the default name.
  skillLevelNames: defineTable({
    level: v.number(),
    name: v.string(),
    description: v.optional(v.string()),
  }).index("by_level", ["level"]),
}
