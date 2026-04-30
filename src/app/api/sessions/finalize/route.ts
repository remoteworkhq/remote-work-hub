import { NextResponse, type NextRequest } from "next/server";
import { AgentClient } from "@21st-sdk/node";
import { getActiveSession, persistTranscript } from "@/lib/sessions";

export const maxDuration = 60;

function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

// Called when client unmounts mid-stream. Polls 21st until the thread reports
// `completed`, then captures messages (which are still in thread.get during
// the brief "completed" window before they go null on idle) and persists them
// to the session transcript so a returning user sees the full chat.
export async function POST(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const slug = url.searchParams.get("slug");
    if (!slug) {
      return NextResponse.json({ error: "slug required" }, { status: 400 });
    }
    const session = await getActiveSession(slug);
    if (!session?.threadId) {
      return NextResponse.json({ ok: true, reason: "no active session" });
    }

    const c = new AgentClient({ apiKey: need("API_KEY_21ST") });

    // Poll up to ~50s for the thread to reach a terminal state
    const TERMINAL = new Set(["completed", "error", "cancelled", "failed"]);
    const STILL_RUNNING = new Set(["streaming", "running", "queued", "pending"]);
    const deadline = Date.now() + 50_000;
    let finalThread: Awaited<ReturnType<typeof c.threads.get>> | null = null;
    while (Date.now() < deadline) {
      const t = await c.threads.get({
        sandboxId: session.sandboxId,
        threadId: session.threadId,
      }).catch(() => null);
      if (!t) break;
      if (TERMINAL.has(t.status)) {
        finalThread = t;
        break;
      }
      if (!STILL_RUNNING.has(t.status)) {
        // idle / unknown — agent likely already finished and 21st evicted state.
        // Capture whatever messages are present and bail.
        finalThread = t;
        break;
      }
      await new Promise((r) => setTimeout(r, 1_500));
    }

    if (!finalThread) {
      return NextResponse.json({ ok: false, reason: "timeout" });
    }
    const raw = finalThread.messages;
    if (Array.isArray(raw) && raw.length > 0) {
      await persistTranscript(slug, raw as Parameters<typeof persistTranscript>[1]);
      return NextResponse.json({
        ok: true,
        persisted: raw.length,
        status: finalThread.status,
      });
    }
    return NextResponse.json({
      ok: false,
      reason: "no messages in finalized thread",
      status: finalThread.status,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "finalize failed" },
      { status: 500 },
    );
  }
}
