import { NextResponse, type NextRequest } from "next/server";
import { AgentClient } from "@21st-sdk/node";
import { getActiveSession } from "@/lib/sessions";

export const maxDuration = 15;

function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

export type Usage = {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  totalCostUsd: number | null;
  durationMs: number | null;
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const slug = body?.slug;
    if (typeof slug !== "string" || !slug) {
      return NextResponse.json({ error: "slug required" }, { status: 400 });
    }
    const session = await getActiveSession(slug);
    if (!session?.threadId) {
      return NextResponse.json({ usage: null });
    }
    const c = new AgentClient({ apiKey: need("API_KEY_21ST") });
    const thread = await c.threads.get({
      sandboxId: session.sandboxId,
      threadId: session.threadId,
    }).catch(() => null);
    return NextResponse.json({ usage: thread?.usage ?? null });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "usage fetch failed" },
      { status: 500 },
    );
  }
}
