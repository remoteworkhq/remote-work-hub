import { NextResponse, type NextRequest } from "next/server";
import { AgentClient } from "@21st-sdk/node";
import { getActiveSession } from "@/lib/sessions";

export const maxDuration = 30;

function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

const ALLOWED_PREFIXES = [
  "/home/user/downloads/",
  "/home/user/uploads/",
  "/home/user/workspace/project/",
];

function isPathAllowed(p: string): boolean {
  if (p.includes("..")) return false;
  return ALLOWED_PREFIXES.some((pre) => p.startsWith(pre));
}

function guessContentType(name: string): string {
  const ext = name.toLowerCase().split(".").pop();
  switch (ext) {
    case "png": return "image/png";
    case "jpg":
    case "jpeg": return "image/jpeg";
    case "webp": return "image/webp";
    case "gif": return "image/gif";
    case "svg": return "image/svg+xml";
    case "pdf": return "application/pdf";
    case "txt":
    case "md":
    case "log": return "text/plain; charset=utf-8";
    case "json": return "application/json";
    case "csv": return "text/csv";
    case "html": return "text/html; charset=utf-8";
    case "zip": return "application/zip";
    default: return "application/octet-stream";
  }
}

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const slug = url.searchParams.get("slug");
    const path = url.searchParams.get("path");
    if (!slug || !path) {
      return NextResponse.json({ error: "slug and path required" }, { status: 400 });
    }
    if (!isPathAllowed(path)) {
      return NextResponse.json({ error: "path not allowed" }, { status: 403 });
    }
    const session = await getActiveSession(slug);
    if (!session || session.status !== "ready") {
      return NextResponse.json({ error: "no ready session" }, { status: 409 });
    }

    const c = new AgentClient({ apiKey: need("API_KEY_21ST") });
    const r = await c.sandboxes.exec({
      sandboxId: session.sandboxId,
      command: `[ -f '${path}' ] && base64 -w0 '${path}'`,
      timeoutMs: 25_000,
    });
    if (r.exitCode !== 0) {
      return NextResponse.json(
        { error: "file not found or unreadable" },
        { status: 404 },
      );
    }
    const buf = Buffer.from((r.stdout || "").trim(), "base64");
    const filename = path.split("/").pop() || "file";
    const inline = url.searchParams.get("inline") === "1";
    return new NextResponse(buf as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": guessContentType(filename),
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${filename}"`,
        "Content-Length": String(buf.byteLength),
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "fetch failed" },
      { status: 500 },
    );
  }
}
