import { NextResponse, type NextRequest } from "next/server";
import { recordThreadId } from "@/lib/sessions";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const slug = body?.slug;
    const threadId = body?.threadId;
    if (typeof slug !== "string" || !slug) {
      return NextResponse.json({ error: "slug required" }, { status: 400 });
    }
    if (typeof threadId !== "string" || !threadId) {
      return NextResponse.json({ error: "threadId required" }, { status: 400 });
    }
    await recordThreadId(slug, threadId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "thread record failed" },
      { status: 500 },
    );
  }
}
