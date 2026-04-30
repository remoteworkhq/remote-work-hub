import { NextResponse } from "next/server";
import { listActiveSessions } from "@/lib/sessions";

export async function GET() {
  try {
    const sessions = await listActiveSessions();
    return NextResponse.json({ sessions });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "list failed" },
      { status: 500 },
    );
  }
}
