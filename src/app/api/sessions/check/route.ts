import { NextResponse, type NextRequest } from "next/server";
import { finalizeSpawn } from "@/lib/sessions";

export const maxDuration = 30;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const slug = body?.slug;
    if (typeof slug !== "string" || !slug) {
      return NextResponse.json({ error: "slug required" }, { status: 400 });
    }
    const result = await finalizeSpawn(slug);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "check failed" },
      { status: 500 },
    );
  }
}
