import { NextResponse, type NextRequest } from "next/server";
import { getThreadMessages } from "@/lib/sessions";

export const maxDuration = 30;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const slug = body?.slug;
    if (typeof slug !== "string" || !slug) {
      return NextResponse.json({ error: "slug required" }, { status: 400 });
    }
    const messages = await getThreadMessages(slug);
    return NextResponse.json({ messages });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "messages fetch failed" },
      { status: 500 },
    );
  }
}
