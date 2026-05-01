import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { Doc } from "./_generated/dataModel";

const ACTIVE_STATUSES = ["ready", "spawning"] as const;

// ── Queries ────────────────────────────────────────────────────────────────

export const list = query({
  args: {},
  handler: async (ctx) => {
    const ready = await ctx.db
      .query("sessions")
      .withIndex("by_status", (q) => q.eq("status", "ready"))
      .order("desc")
      .collect();
    const spawning = await ctx.db
      .query("sessions")
      .withIndex("by_status", (q) => q.eq("status", "spawning"))
      .order("desc")
      .collect();
    return [...ready, ...spawning].sort(
      (a, b) => (b.lastActiveAt ?? 0) - (a.lastActiveAt ?? 0),
    );
  },
});

export const getActive = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    const ready = await ctx.db
      .query("sessions")
      .withIndex("by_slug_and_status", (q) =>
        q.eq("projectSlug", slug).eq("status", "ready"),
      )
      .order("desc")
      .first();
    if (ready) return ready;
    const spawning = await ctx.db
      .query("sessions")
      .withIndex("by_slug_and_status", (q) =>
        q.eq("projectSlug", slug).eq("status", "spawning"),
      )
      .order("desc")
      .first();
    return spawning ?? null;
  },
});

export const getCurrentTranscript = query({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, { sessionId }) => {
    const row = await ctx.db.get(sessionId);
    return (row?.transcript ?? []) as unknown[];
  },
});

export const getLatestTranscript = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    const all = await ctx.db
      .query("sessions")
      .withIndex("by_slug", (q) => q.eq("projectSlug", slug))
      .order("desc")
      .collect();
    for (const row of all) {
      if (row.transcript && row.transcript.length > 0) {
        return row.transcript as unknown[];
      }
    }
    return [];
  },
});

// ── Mutations ──────────────────────────────────────────────────────────────

export const startSpawn = mutation({
  args: {
    slug: v.string(),
    sandboxId: v.string(),
    threadId: v.optional(v.string()),
    repo: v.string(),
  },
  handler: async (ctx, { slug, sandboxId, threadId, repo }) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("sessions")
      .withIndex("by_slug_and_status", (q) =>
        q.eq("projectSlug", slug).eq("status", "ready"),
      )
      .first();
    if (existing && existing.repo === repo) return existing._id;

    const id = await ctx.db.insert("sessions", {
      projectSlug: slug,
      sandboxId,
      threadId: threadId ?? null,
      repo,
      status: "spawning",
      startedAt: now,
      lastActiveAt: now,
      lastResponseAt: null,
      endedAt: null,
    });
    return id;
  },
});

export const markReady = mutation({
  args: { sandboxId: v.string() },
  handler: async (ctx, { sandboxId }) => {
    const row = await ctx.db
      .query("sessions")
      .withIndex("by_sandbox", (q) => q.eq("sandboxId", sandboxId))
      .first();
    if (!row) return null;
    await ctx.db.patch(row._id, {
      status: "ready",
      lastActiveAt: Date.now(),
    });
    return row._id;
  },
});

export const recordThreadId = mutation({
  args: { slug: v.string(), threadId: v.string() },
  handler: async (ctx, { slug, threadId }) => {
    const row = await ctx.db
      .query("sessions")
      .withIndex("by_slug_and_status", (q) =>
        q.eq("projectSlug", slug).eq("status", "ready"),
      )
      .first();
    if (!row) return null;
    await ctx.db.patch(row._id, {
      threadId,
      lastActiveAt: Date.now(),
    });
    return row._id;
  },
});

export const persistTranscript = mutation({
  args: {
    slug: v.string(),
    messages: v.array(v.any()),
    markResponseComplete: v.optional(v.boolean()),
  },
  handler: async (ctx, { slug, messages, markResponseComplete }) => {
    // Save against the most recent session for this slug (active or dead).
    const row = await ctx.db
      .query("sessions")
      .withIndex("by_slug", (q) => q.eq("projectSlug", slug))
      .order("desc")
      .first();
    if (!row) return null;
    const now = Date.now();
    const patch: Partial<Doc<"sessions">> = {
      transcript: messages,
      lastActiveAt: now,
    };
    if (markResponseComplete) patch.lastResponseAt = now;
    await ctx.db.patch(row._id, patch);
    return row._id;
  },
});

export const endSession = mutation({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    const rows = await ctx.db
      .query("sessions")
      .withIndex("by_slug", (q) => q.eq("projectSlug", slug))
      .collect();
    const ended: string[] = [];
    const now = Date.now();
    for (const row of rows) {
      if (row.status === "ready" || row.status === "spawning") {
        await ctx.db.patch(row._id, {
          status: "dead",
          endedAt: now,
        });
        ended.push(row.sandboxId);
      }
    }
    return ended;
  },
});

export const markDeadBySandbox = mutation({
  args: { sandboxId: v.string() },
  handler: async (ctx, { sandboxId }) => {
    const row = await ctx.db
      .query("sessions")
      .withIndex("by_sandbox", (q) => q.eq("sandboxId", sandboxId))
      .first();
    if (!row) return null;
    if (row.status === "dead") return row._id;
    await ctx.db.patch(row._id, {
      status: "dead",
      endedAt: Date.now(),
    });
    return row._id;
  },
});

export const bumpLastActive = mutation({
  args: { sandboxId: v.string() },
  handler: async (ctx, { sandboxId }) => {
    const row = await ctx.db
      .query("sessions")
      .withIndex("by_sandbox", (q) => q.eq("sandboxId", sandboxId))
      .first();
    if (!row) return null;
    await ctx.db.patch(row._id, { lastActiveAt: Date.now() });
    return row._id;
  },
});
