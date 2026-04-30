import { AgentClient } from "@21st-sdk/node";
import { NextResponse, type NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "missing id" }, { status: 400 });
  }
  const apiKey = process.env.API_KEY_21ST;
  if (!apiKey) {
    return NextResponse.json({ error: "missing API_KEY_21ST" }, { status: 500 });
  }
  try {
    const client = new AgentClient({ apiKey });
    await client.sandboxes.delete(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "unknown" },
      { status: 500 },
    );
  }
}
