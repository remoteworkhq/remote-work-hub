import { NextResponse, type NextRequest } from "next/server";
import { pushSession } from "@/lib/sessions";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const slug = body?.slug;
    if (typeof slug !== "string" || !slug) {
      return NextResponse.json({ error: "slug required" }, { status: 400 });
    }
    const result = await pushSession(slug);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "push failed" },
      { status: 500 },
    );
  }
}
