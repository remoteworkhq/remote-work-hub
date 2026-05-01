import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const getLatest = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    return await ctx.db
      .query("projectLogs")
      .withIndex("by_slug", (q) => q.eq("projectSlug", slug))
      .order("desc")
      .first();
  },
});

export const create = mutation({
  args: { slug: v.string(), summary: v.string() },
  handler: async (ctx, { slug, summary }) => {
    return await ctx.db.insert("projectLogs", { projectSlug: slug, summary });
  },
});
