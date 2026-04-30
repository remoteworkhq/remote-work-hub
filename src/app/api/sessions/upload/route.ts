import { NextResponse, type NextRequest } from "next/server";
import { AgentClient } from "@21st-sdk/node";
import { getActiveSession } from "@/lib/sessions";

export const maxDuration = 30;
export const runtime = "nodejs";

function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function safeName(name: string): string {
  return name.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 200) || "file";
}

export async function POST(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const slug = url.searchParams.get("slug");
    if (!slug) {
      return NextResponse.json({ error: "slug required" }, { status: 400 });
    }
    const session = await getActiveSession(slug);
    if (!session || session.status !== "ready") {
      return NextResponse.json(
        { error: "no ready session for slug" },
        { status: 409 },
      );
    }

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "form field 'file' required" },
        { status: 400 },
      );
    }
    if (file.size > 25 * 1024 * 1024) {
      return NextResponse.json(
        { error: "max upload 25 MB" },
        { status: 413 },
      );
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const b64 = buf.toString("base64");
    const filename = safeName(file.name);
    const dest = `/home/user/uploads/${filename}`;

    const c = new AgentClient({ apiKey: need("API_KEY_21ST") });
    // Stream the file content via base64 onto the sandbox; mkdir + decode.
    // Splitting into chunks if huge; b64 string is ~33% bigger than the binary,
    // we already capped at 25MB so this is safe inside a single command.
    const r = await c.sandboxes.exec({
      sandboxId: session.sandboxId,
      command:
        `mkdir -p /home/user/uploads && ` +
        `printf %s '${b64}' | base64 -d > '${dest}' && ` +
        `chmod 644 '${dest}' && ` +
        `wc -c '${dest}'`,
      timeoutMs: 25_000,
    });
    if (r.exitCode !== 0) {
      return NextResponse.json(
        { error: "sandbox write failed", detail: r.stderr || r.stdout },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      path: dest,
      filename,
      size: file.size,
      type: file.type || "application/octet-stream",
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "upload failed" },
      { status: 500 },
    );
  }
}
