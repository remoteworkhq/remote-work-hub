import { AgentClient } from "@21st-sdk/node";
import { NextResponse, type NextRequest } from "next/server";

const PROJECT_PATH = "/home/user/workspace/project";

export async function POST(request: NextRequest) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });

  const apiKey = process.env.API_KEY_21ST;
  if (!apiKey) return NextResponse.json({ error: "missing API_KEY_21ST" }, { status: 500 });

  const client = new AgentClient({ apiKey });
  const r = await client.sandboxes.exec({
    sandboxId: id,
    command:
      `git -c safe.directory='*' -C ${PROJECT_PATH} status --short && ` +
      `git -c safe.directory='*' -C ${PROJECT_PATH} log --oneline -5 && ` +
      `echo '---PUSH---' && ` +
      `git -c safe.directory='*' -C ${PROJECT_PATH} push 2>&1`,
    timeoutMs: 60_000,
  });

  return NextResponse.json({
    exitCode: r.exitCode,
    stdout: r.stdout,
    stderr: r.stderr,
  });
}
