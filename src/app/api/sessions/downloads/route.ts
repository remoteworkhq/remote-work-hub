import { NextResponse, type NextRequest } from "next/server";
import { AgentClient } from "@21st-sdk/node";
import { getActiveSession } from "@/lib/sessions";

export const maxDuration = 15;

function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const slug = body?.slug;
    if (typeof slug !== "string" || !slug) {
      return NextResponse.json({ error: "slug required" }, { status: 400 });
    }
    const session = await getActiveSession(slug);
    if (!session || session.status !== "ready") {
      return NextResponse.json({ files: [] });
    }

    const c = new AgentClient({ apiKey: need("API_KEY_21ST") });
    const r = await c.sandboxes.exec({
      sandboxId: session.sandboxId,
      command:
        `mkdir -p /home/user/downloads && ` +
        `find /home/user/downloads -maxdepth 1 -type f -printf '%f\\t%s\\t%T@\\n' | sort -k3 -n`,
      timeoutMs: 8_000,
    });
    if (r.exitCode !== 0) {
      return NextResponse.json({ files: [] });
    }
    const files = r.stdout
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((line) => {
        const [name, size, ts] = line.split("\t");
        return {
          name,
          size: parseInt(size, 10) || 0,
          mtime: ts ? Math.floor(parseFloat(ts) * 1000) : 0,
          path: `/home/user/downloads/${name}`,
        };
      });
    return NextResponse.json({ files });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "list failed" },
      { status: 500 },
    );
  }
}
