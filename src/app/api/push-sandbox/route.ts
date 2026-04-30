import { AgentClient } from "@21st-sdk/node";
import { NextResponse, type NextRequest } from "next/server";

const PROJECT_PATH = "/home/user/workspace/project";

export async function POST(request: NextRequest) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });

  const apiKey = process.env.API_KEY_21ST;
  if (!apiKey) return NextResponse.json({ error: "missing API_KEY_21ST" }, { status: 500 });

  const client = new AgentClient({ apiKey });

  // Run at sandbox root level (no bwrap), real token in remote URL flows directly to github.com
  const r = await client.sandboxes.exec({
    sandboxId: id,
    command: `cd ${PROJECT_PATH} && git status --short && git log --oneline -5 && echo "---PUSH---" && git push 2>&1`,
    timeoutMs: 60_000,
  });

  return NextResponse.json({
    exitCode: r.exitCode,
    stdout: r.stdout,
    stderr: r.stderr,
  });
}
