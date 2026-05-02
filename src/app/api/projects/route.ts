import { NextResponse } from "next/server";
import { PROJECTS } from "@/lib/projects";

// Public-safe project list. Used by the project-hub dashboard widget
// (and any future external embeds) so registrations auto-propagate.
export async function GET() {
  return NextResponse.json(
    { projects: PROJECTS.map((p) => ({ slug: p.slug, name: p.name, description: p.description, repo: p.repo })) },
    { headers: { "cache-control": "public, max-age=60, s-maxage=60", "access-control-allow-origin": "*" } },
  );
}
