import { NextResponse, type NextRequest } from "next/server";
import { spawnOrGetSession } from "@/lib/sessions";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const slug = body?.slug;
    if (typeof slug !== "string" || !slug) {
      return NextResponse.json({ error: "slug required" }, { status: 400 });
    }
    const session = await spawnOrGetSession(slug);
    return NextResponse.json({ session });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "spawn failed" },
      { status: 500 },
    );
  }
}
