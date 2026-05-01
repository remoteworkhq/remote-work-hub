import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  projects: defineTable({
    slug: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    githubRepo: v.optional(v.string()),
    vercelProjectId: v.optional(v.string()),
    status: v.string(),
  }).index("by_slug", ["slug"]),

  sessions: defineTable({
    projectSlug: v.string(),
    sandboxId: v.string(),
    threadId: v.optional(v.union(v.string(), v.null())),
    repo: v.string(),
    status: v.union(
      v.literal("spawning"),
      v.literal("ready"),
      v.literal("dead"),
    ),
    transcript: v.optional(v.array(v.any())),
    startedAt: v.number(),
    lastActiveAt: v.number(),
    lastResponseAt: v.optional(v.union(v.number(), v.null())),
    endedAt: v.optional(v.union(v.number(), v.null())),
  })
    .index("by_slug_and_status", ["projectSlug", "status"])
    .index("by_slug", ["projectSlug"])
    .index("by_status", ["status"])
    .index("by_sandbox", ["sandboxId"]),

  projectLogs: defineTable({
    projectSlug: v.string(),
    summary: v.string(),
  }).index("by_slug", ["projectSlug"]),
});
