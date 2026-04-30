import { NextResponse, type NextRequest } from "next/server";
import { endSession } from "@/lib/sessions";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const slug = body?.slug;
    if (typeof slug !== "string" || !slug) {
      return NextResponse.json({ error: "slug required" }, { status: 400 });
    }
    await endSession(slug);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "end failed" },
      { status: 500 },
    );
  }
}
