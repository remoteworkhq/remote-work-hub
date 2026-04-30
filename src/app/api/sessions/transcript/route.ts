import { NextResponse, type NextRequest } from "next/server";
import { persistTranscript } from "@/lib/sessions";

export const maxDuration = 15;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const slug = body?.slug;
    const messages = body?.messages;
    if (typeof slug !== "string" || !slug) {
      return NextResponse.json({ error: "slug required" }, { status: 400 });
    }
    if (!Array.isArray(messages)) {
      return NextResponse.json({ error: "messages array required" }, { status: 400 });
    }
    await persistTranscript(slug, messages);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "transcript save failed" },
      { status: 500 },
    );
  }
}
